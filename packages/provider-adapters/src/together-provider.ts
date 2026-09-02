import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { clearTimeout, setTimeout } from "node:timers";
import { togetherModelDefaults } from "@avlp/config";
import {
  illustrationRequestSchema,
  illustrationResponseSchema,
  ProviderCallError,
  providerCompletionResponseSchema,
  type IllustrationProvider,
  type IllustrationRequest,
  type IllustrationResponse,
  type LanguageModelProvider,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
} from "./contracts.js";

export { togetherModelDefaults } from "@avlp/config";

export const togetherPricing = {
  [togetherModelDefaults.llm]: {
    inputUsdPerMillionTokens: 0.15,
    outputUsdPerMillionTokens: 0.47,
  },
} as const;

type FetchLike = typeof fetch;

type TogetherProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetcher?: FetchLike;
  requestTimeoutMs?: number;
  maxRetries?: number;
};

type TogetherJson = Record<string, unknown>;

const defaultBaseUrl = "https://api.together.ai/v1";
const transientStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function normalizeBaseUrl(value: string | undefined): string {
  const baseUrl = (value ?? defaultBaseUrl).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:")
    throw new Error("Together API base URL must use HTTPS.");
  return baseUrl;
}

function requestTimeout(value: number | undefined): number {
  if (value === undefined) return 60_000;
  if (!Number.isInteger(value) || value < 1_000 || value > 300_000)
    throw new RangeError("Together request timeout must be 1-300 seconds.");
  return value;
}

function retryLimit(value: number | undefined): number {
  if (value === undefined) return 2;
  if (!Number.isInteger(value) || value < 0 || value > 5)
    throw new RangeError("Together retry limit must be between 0 and 5.");
  return value;
}

function delayMs(attempt: number): number {
  return Math.min(4_000, 250 * 2 ** attempt);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function classifyHttpFailure(status: number): ProviderCallError {
  if (status === 401 || status === 403)
    return new ProviderCallError({
      code: "PROVIDER_AUTHENTICATION_FAILED",
      message: "Together rejected the provider credentials.",
    });
  if (status === 429)
    return new ProviderCallError({
      code: "PROVIDER_RATE_LIMITED",
      message: "Together rate-limited the provider request.",
      retryable: true,
    });
  if (status === 408 || status === 409 || status === 425 || status >= 500)
    return new ProviderCallError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Together is temporarily unavailable.",
      retryable: true,
    });
  return new ProviderCallError({
    code: "PROVIDER_REQUEST_REJECTED",
    message: "Together rejected the provider request.",
  });
}

async function requestWithRetry<T>(input: {
  url: string;
  apiKey: string;
  body: TogetherJson;
  fetcher: FetchLike;
  timeoutMs: number;
  maxRetries: number;
  consume: (response: Response, keepAlive: () => void) => Promise<T>;
}): Promise<{ value: T; retries: number }> {
  for (let attempt = 0; attempt <= input.maxRetries; attempt += 1) {
    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    // The timeout is a stall guard, not a cap on total generation time: a
    // streamed reasoning model can legitimately take minutes to finish, so
    // every chunk that arrives restarts the clock and only silence aborts.
    const keepAlive = (): void => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    };
    try {
      const response = await input.fetcher(input.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
        signal: controller.signal,
      });
      // The body is read inside the attempt so the stall guard also covers
      // streamed responses, and a truncated stream is retried like a transport
      // failure rather than surfacing as an invalid response.
      if (response.ok)
        return { value: await input.consume(response, keepAlive), retries: attempt };
      const failure = classifyHttpFailure(response.status);
      if (!failure.retryable || !transientStatuses.has(response.status) || attempt >= input.maxRetries)
        throw failure;
      await sleep(delayMs(attempt));
    } catch (error) {
      if (error instanceof ProviderCallError) throw error;
      if (attempt >= input.maxRetries)
        throw new ProviderCallError({
          code: "PROVIDER_TRANSPORT_FAILED",
          message: "The Together provider request could not be completed.",
          retryable: true,
        });
      await sleep(delayMs(attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ProviderCallError({
    code: "PROVIDER_TRANSPORT_FAILED",
    message: "The Together provider request could not be completed.",
    retryable: true,
  });
}

function jsonObject(value: unknown, message: string): TogetherJson {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ProviderCallError({ code: "PROVIDER_INVALID_RESPONSE", message });
  return value as TogetherJson;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapFinishReason(value: unknown): ProviderCompletionResponse["finishReason"] {
  if (value === "length") return "length";
  if (value === "content_filter") return "content_filter";
  if (value === "stop" || value === "eos" || value === "end") return "stop";
  return "error";
}

function responseFormat(request: ProviderCompletionRequest): unknown {
  // Qwen3.8 Flash is currently catalogued as chat/vision without JSON Mode.
  // Its prompts already require JSON, and the shared structured-output
  // lifecycle validates and repairs the response when needed.
  if (request.model === togetherModelDefaults.llm) return undefined;
  if (request.responseFormat === "json_schema")
    return {
      type: "json_schema",
      json_schema: { name: "avlp_output", schema: request.jsonSchema ?? {} },
    };
  if (request.responseFormat === "json_object") return { type: "json_object" };
  return undefined;
}

type ChatPayload = {
  model?: string;
  text: string;
  finishReason: unknown;
  inputTokens?: number;
  outputTokens?: number;
};

function readUsage(value: unknown): Pick<ChatPayload, "inputTokens" | "outputTokens"> {
  if (typeof value !== "object" || value === null) return {};
  const usage = value as TogetherJson;
  const inputTokens = numberValue(usage.prompt_tokens);
  const outputTokens = numberValue(usage.completion_tokens);
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
}

/**
 * Folds one server-sent chat chunk into the accumulated payload. Reasoning
 * deltas are dropped on purpose: thinking models emit them alongside the
 * answer, and only `content` belongs in the structured output.
 */
function applyChunk(payload: ChatPayload, chunk: TogetherJson): void {
  const model = stringValue(chunk.model);
  if (model !== undefined) payload.model = model;
  Object.assign(payload, readUsage(chunk.usage));
  const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
  const first = choices[0];
  if (typeof first !== "object" || first === null) return;
  const choice = first as TogetherJson;
  const delta =
    typeof choice.delta === "object" && choice.delta !== null
      ? (choice.delta as TogetherJson)
      : undefined;
  payload.text += stringValue(delta?.content) ?? stringValue(choice.text) ?? "";
  if (choice.finish_reason !== null && choice.finish_reason !== undefined)
    payload.finishReason = choice.finish_reason;
}

/**
 * Reads a `text/event-stream` chat completion. Several Together models
 * (including the default LLM) reject non-streaming chat requests, so the
 * adapter always streams and reassembles the full message here.
 */
async function readChatStream(
  response: Response,
  keepAlive: () => void,
): Promise<ChatPayload> {
  const body = response.body;
  if (body === null)
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_RESPONSE",
      message: "Together returned an empty chat stream.",
    });
  const payload: ChatPayload = { text: "", finishReason: undefined };
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;
  const consumeEvents = (flush: boolean): void => {
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (!handleEvent(event, payload)) {
        done = true;
        return;
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (flush && buffer.trim().length > 0) handleEvent(buffer, payload);
  };
  while (!done) {
    const chunk = await reader.read();
    keepAlive();
    if (chunk.done) {
      buffer += decoder.decode();
      consumeEvents(true);
      break;
    }
    buffer += decoder.decode(chunk.value, { stream: true });
    consumeEvents(false);
  }
  if (done) await reader.cancel().catch(() => undefined);
  return payload;
}

/** Returns false once the stream terminator is seen. */
function handleEvent(event: string, payload: ChatPayload): boolean {
  for (const line of event.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice("data:".length).trim();
    if (data.length === 0) continue;
    if (data === "[DONE]") return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      throw new ProviderCallError({
        code: "PROVIDER_INVALID_RESPONSE",
        message: "Together returned an unreadable chat stream chunk.",
      });
    }
    applyChunk(payload, jsonObject(parsed, "Together returned an invalid chat chunk."));
  }
  return true;
}

function readChatJson(value: unknown): ChatPayload {
  const parsed = jsonObject(value, "Together returned an invalid chat response.");
  const choices = Array.isArray(parsed.choices) ? parsed.choices : [];
  const choice = jsonObject(choices[0], "Together returned no chat choice.");
  const message = jsonObject(choice.message, "Together returned no assistant message.");
  const model = stringValue(parsed.model);
  return {
    ...(model === undefined ? {} : { model }),
    text: stringValue(message.content) ?? stringValue(choice.text) ?? "",
    finishReason: choice.finish_reason,
    ...readUsage(parsed.usage),
  };
}

async function readChatResponse(
  response: Response,
  keepAlive: () => void,
): Promise<ChatPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream"))
    return readChatStream(response, keepAlive);
  return readChatJson(await response.json());
}

export class TogetherLanguageModelProvider implements LanguageModelProvider {
  public readonly providerId = "together";
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  public constructor(private readonly options: TogetherProviderOptions) {
    if (options.apiKey.trim().length === 0)
      throw new Error("Together API key is required for the production provider.");
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = requestTimeout(options.requestTimeoutMs);
    this.maxRetries = retryLimit(options.maxRetries);
  }

  public async complete(
    request: ProviderCompletionRequest,
  ): Promise<ProviderCompletionResponse> {
    const startedAt = Date.now();
    const body: TogetherJson = {
      model: request.model,
      messages: request.messages,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
      ...(responseFormat(request) === undefined ? {} : { response_format: responseFormat(request) }),
      // Several Together chat models (the default LLM among them) reject
      // non-streaming requests with `streaming_required`, so always stream.
      stream: true,
      stream_options: { include_usage: true },
    };
    const { value: payload, retries } = await requestWithRetry({
      url: `${this.baseUrl}/chat/completions`,
      apiKey: this.options.apiKey,
      body,
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      consume: readChatResponse,
    });
    const text = payload.text;
    if (text.length === 0)
      throw new ProviderCallError({
        code: "PROVIDER_EMPTY_RESPONSE",
        message: "Together returned an empty model response.",
      });
    const { inputTokens, outputTokens } = payload;
    if (inputTokens === undefined || outputTokens === undefined)
      throw new ProviderCallError({
        code: "PROVIDER_USAGE_UNAVAILABLE",
        message: "Together returned no usable usage metadata.",
      });
    return providerCompletionResponseSchema.parse({
      providerId: this.providerId,
      model: payload.model ?? request.model,
      text,
      finishReason: mapFinishReason(payload.finishReason),
      usage: {
        inputTokens: Math.max(0, Math.round(inputTokens)),
        outputTokens: Math.max(0, Math.round(outputTokens)),
      },
      latencyMs: Math.max(0, Date.now() - startedAt),
      retries,
    });
  }
}

function requestedDimensions(size: IllustrationRequest["size"]): { width: number; height: number } {
  return size === "1536x1024"
    ? { width: 1536, height: 1024 }
    : { width: 1024, height: 1024 };
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 24) return undefined;
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export class TogetherIllustrationProvider implements IllustrationProvider {
  public readonly providerId = "together";
  public readonly model: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  public constructor(
    private readonly options: TogetherProviderOptions & { costUsdPerImage?: number },
  ) {
    if (options.apiKey.trim().length === 0)
      throw new Error("Together API key is required for the production provider.");
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = requestTimeout(options.requestTimeoutMs);
    this.maxRetries = retryLimit(options.maxRetries);
    this.model = options.model ?? togetherModelDefaults.image;
    if (options.costUsdPerImage !== undefined && options.costUsdPerImage < 0)
      throw new RangeError("Together image cost cannot be negative.");
  }

  public async generate(request: IllustrationRequest): Promise<IllustrationResponse> {
    const startedAt = Date.now();
    const parsedRequest = illustrationRequestSchema.parse(request);
    const dimensions = requestedDimensions(parsedRequest.size);
    const { value: parsed, retries } = await requestWithRetry({
      url: `${this.baseUrl}/images/generations`,
      apiKey: this.options.apiKey,
      body: {
        model: this.model,
        prompt: parsedRequest.prompt,
        width: dimensions.width,
        height: dimensions.height,
        response_format: "base64",
        output_format: "png",
        disable_safety_checker: false,
      },
      fetcher: this.fetcher,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      consume: async (response) =>
        jsonObject(
          await response.json(),
          "Together returned an invalid image response.",
        ),
    });
    const data = Array.isArray(parsed.data) ? parsed.data : [];
    const item = jsonObject(data[0], "Together returned no generated image.");
    const encoded = stringValue(item.b64_json);
    if (encoded === undefined)
      throw new ProviderCallError({
        code: "PROVIDER_IMAGE_BYTES_UNAVAILABLE",
        message: "Together did not return image bytes.",
      });
    const bytes = new Uint8Array(Buffer.from(encoded, "base64"));
    const actualDimensions = pngDimensions(bytes);
    if (actualDimensions === undefined)
      throw new ProviderCallError({
        code: "PROVIDER_INVALID_IMAGE",
        message: "Together returned an invalid PNG image.",
      });
    const providerCallId = stringValue(parsed.id) ??
      `together-image-${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`;
    return illustrationResponseSchema.parse({
      providerId: this.providerId,
      model: this.model,
      providerCallId,
      mediaType: "image/png",
      bytes,
      width: actualDimensions.width,
      height: actualDimensions.height,
      units: 1,
      costUsd: this.options.costUsdPerImage ?? 0.00225,
      latencyMs: Math.max(0, Date.now() - startedAt),
      retryCount: retries,
      // The request keeps Together's safety checker enabled. A successful
      // image response is therefore the provider's approved result; the app
      // still keeps it pending teacher review before activation.
      moderation: { status: "approved", code: "together_safety_checker" },
    });
  }
}
