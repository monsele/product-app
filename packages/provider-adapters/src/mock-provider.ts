import { z } from "zod";
import {
  providerCompletionResponseSchema,
  ProviderCallError,
  type LanguageModelProvider,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  type ProviderMessage,
  illustrationRequestSchema,
  illustrationResponseSchema,
  type IllustrationProvider,
  type IllustrationRequest,
  type IllustrationResponse,
} from "./contracts.js";

/** Shared test/local model pricing used when no pricing map is supplied. */
export const mockPricing = {
  "mock-model-1": {
    inputUsdPerMillionTokens: 0.5,
    outputUsdPerMillionTokens: 1.5,
  },
  "mock-model-2": {
    inputUsdPerMillionTokens: 1.0,
    outputUsdPerMillionTokens: 3.0,
  },
} as const;

export type MockCompletion = (
  request: ProviderCompletionRequest,
) => string | Promise<string>;

/**
 * Deterministic in-process provider for tests and local development. Never
 * requires credentials. `completion` receives the request and returns the raw
 * text (JSON for structured calls). Throwing `ProviderCallError` simulates a
 * provider failure.
 */
export class MockLanguageModelProvider implements LanguageModelProvider {
  public readonly providerId = "mock";
  public readonly supportedModels: readonly string[];
  public readonly requests: ProviderCompletionRequest[] = [];
  public readonly completions: string[] = [];

  public constructor(
    private readonly options: {
      model?: string;
      completion?: MockCompletion;
      tokensPerCharacter?: number;
      latencyMs?: number;
      fail?: { code: string; retryable?: boolean; message?: string };
    } = {},
  ) {
    this.supportedModels = [options.model ?? "mock-model-1"];
  }

  public async complete(
    request: ProviderCompletionRequest,
  ): Promise<ProviderCompletionResponse> {
    this.requests.push(request);
    if (this.options.fail !== undefined)
      throw new ProviderCallError({
        code: this.options.fail.code,
        message: this.options.fail.message ?? "Mock provider failed.",
        retryable: this.options.fail.retryable ?? false,
      });
    const text = await this.options.completion?.(request);
    const resolved = text ?? "{}";
    this.completions.push(resolved);
    const characters = this.options.tokensPerCharacter ?? 4;
    const inputCharacters = request.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    const inputTokens = Math.max(1, Math.ceil(inputCharacters / characters));
    const outputTokens = Math.max(1, Math.ceil(resolved.length / characters));
    return providerCompletionResponseSchema.parse({
      providerId: this.providerId,
      model: this.options.model ?? request.model,
      text: resolved,
      finishReason: "stop",
      usage: { inputTokens, outputTokens },
      latencyMs: this.options.latencyMs ?? 10,
      retries: 0,
    });
  }
}

/** Deterministic fixture adapter for illustration-worker tests and local use. */
export class MockIllustrationProvider implements IllustrationProvider {
  public readonly providerId = "mock-illustration";
  public readonly requests: IllustrationRequest[] = [];

  public constructor(
    private readonly response: Omit<IllustrationResponse, "providerId">,
  ) {}

  public async generate(
    request: IllustrationRequest,
  ): Promise<IllustrationResponse> {
    this.requests.push(illustrationRequestSchema.parse(request));
    return illustrationResponseSchema.parse({
      providerId: this.providerId,
      ...this.response,
    });
  }
}

/** Builds a deterministic JSON completion from a literal value. */
export function jsonCompletion(value: unknown): MockCompletion {
  return () => JSON.stringify(value);
}

/** Builds a completion that returns a sequence of raw texts in order. */
export function sequenceCompletion(texts: readonly string[]): MockCompletion {
  let index = 0;
  return () => {
    const text = texts[Math.min(index, texts.length - 1)]!;
    index += 1;
    return text;
  };
}

export const mockMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});
export type MockMessage = z.infer<typeof mockMessageSchema>;
export type { ProviderMessage };
