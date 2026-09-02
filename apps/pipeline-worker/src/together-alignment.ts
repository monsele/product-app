import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { clearTimeout, setTimeout } from "node:timers";
import { togetherModelDefaults, ProviderCallError } from "@avlp/provider-adapters";
import type {
  SceneAudioAlignmentProvider,
  SceneAudioAlignmentResult,
  SceneAudioTiming,
} from "./scene-audio-job.js";

type FetchLike = typeof fetch;

export type TogetherWhisperAlignmentOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  fetcher?: FetchLike;
  requestTimeoutMs?: number;
  maxRetries?: number;
  costUsdPerAudioMinute?: number;
};

type TimedWord = Readonly<{ word: string; start: number; end: number }>;

const defaultBaseUrl = "https://api.together.ai/v1";
const defaultCostUsdPerAudioMinute = 0.0015;

function parseOptions(options: TogetherWhisperAlignmentOptions): {
  baseUrl: string;
  fetcher: FetchLike;
  timeoutMs: number;
  maxRetries: number;
  costUsdPerAudioMinute: number;
} {
  if (options.apiKey.trim().length === 0)
    throw new Error("Together API key is required for the production provider.");
  const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:")
    throw new Error("Together API base URL must use HTTPS.");
  const timeoutMs = options.requestTimeoutMs ?? 60_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000)
    throw new RangeError("Together request timeout must be 1-300 seconds.");
  const maxRetries = options.maxRetries ?? 2;
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5)
    throw new RangeError("Together retry limit must be between 0 and 5.");
  const costUsdPerAudioMinute = options.costUsdPerAudioMinute ?? defaultCostUsdPerAudioMinute;
  if (costUsdPerAudioMinute < 0)
    throw new RangeError("Together transcription cost cannot be negative.");
  return {
    baseUrl,
    fetcher: options.fetcher ?? fetch,
    timeoutMs,
    maxRetries,
    costUsdPerAudioMinute,
  };
}

function shouldRetry(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function providerError(status: number): ProviderCallError {
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
  if (status >= 500)
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

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizedWord(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function jsonObject(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ProviderCallError({ code: "PROVIDER_INVALID_RESPONSE", message });
  return value as Record<string, unknown>;
}

function parseTimedWords(value: unknown): TimedWord[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new ProviderCallError({
      code: "PROVIDER_ALIGNMENT_UNAVAILABLE",
      message: "Together returned no word timestamps for the generated audio.",
    });
  const words: TimedWord[] = [];
  for (const item of value) {
    const object = jsonObject(item, "Together returned an invalid word timestamp.");
    const word = object.word;
    const start = object.start;
    const end = object.end;
    if (
      typeof word !== "string" ||
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start
    )
      throw new ProviderCallError({
        code: "PROVIDER_INVALID_ALIGNMENT",
        message: "Together returned invalid word timing data.",
      });
    words.push({ word, start, end });
  }
  return words;
}

function narrationWordGroups(narration: string): Array<{ text: string; wordIndexes: number[] }> {
  const groups: Array<{ text: string; wordIndexes: number[] }> = [];
  let wordIndex = 0;
  for (const match of narration.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)) {
    const text = clean(match[0] ?? "");
    const count = [...text.matchAll(/\S+/g)].length;
    if (count > 0) {
      groups.push({
        text,
        wordIndexes: Array.from({ length: count }, (_, index) => wordIndex + index),
      });
      wordIndex += count;
    }
  }
  return groups;
}

function alignWords(narration: string, words: readonly TimedWord[]): SceneAudioTiming[] {
  const groups = narrationWordGroups(narration);
  const narrationWords = groups.flatMap((group) =>
    [...group.text.matchAll(/\S+/g)].map((match) => match[0] ?? ""),
  );
  if (narrationWords.length === 0 || words.length < narrationWords.length)
    throw new ProviderCallError({
      code: "PROVIDER_ALIGNMENT_MISMATCH",
      message: "Together transcription did not cover the approved narration.",
    });

  const matched: TimedWord[] = [];
  let cursor = 0;
  for (const narrationWord of narrationWords) {
    const target = normalizedWord(narrationWord);
    let found = -1;
    for (let index = cursor; index < words.length; index += 1) {
      if (normalizedWord(words[index]!.word) === target) {
        found = index;
        break;
      }
    }
    if (found < 0) {
      // Numeric forms and punctuation can be transcribed differently. A
      // same-length transcript is still safe to map in order; a different
      // length is rejected instead of producing misleading captions.
      if (words.length !== narrationWords.length)
        throw new ProviderCallError({
          code: "PROVIDER_ALIGNMENT_MISMATCH",
          message: "Together transcription did not match the approved narration.",
        });
      found = cursor;
    }
    matched.push(words[found]!);
    cursor = found + 1;
  }

  return groups.map((group) => {
    const first = matched[group.wordIndexes[0]!];
    const last = matched[group.wordIndexes[group.wordIndexes.length - 1]!];
    if (first === undefined || last === undefined)
      throw new ProviderCallError({
        code: "PROVIDER_INVALID_ALIGNMENT",
        message: "Together returned incomplete word timing data.",
      });
    return {
      startMs: Math.round(first.start * 1_000),
      endMs: Math.round(last.end * 1_000),
      text: group.text,
    };
  });
}

export class TogetherWhisperAlignmentProvider implements SceneAudioAlignmentProvider {
  public readonly providerId = "together";
  public readonly model: string;
  private readonly parsed: ReturnType<typeof parseOptions>;

  public constructor(private readonly options: TogetherWhisperAlignmentOptions) {
    this.parsed = parseOptions(options);
    this.model = options.model ?? togetherModelDefaults.alignment;
  }

  public async align(input: {
    audio: Uint8Array;
    narration: string;
    durationMs: number;
  }): Promise<SceneAudioAlignmentResult> {
    const startedAt = Date.now();
    for (let attempt = 0; attempt <= this.parsed.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.parsed.timeoutMs);
      try {
        const form = new FormData();
        form.append(
          "file",
          new Blob([Buffer.from(input.audio)], { type: "audio/wav" }),
          "scene-audio.wav",
        );
        form.append("model", this.model);
        form.append("language", "en");
        form.append("prompt", input.narration);
        form.append("response_format", "verbose_json");
        form.append("temperature", "0");
        form.append("timestamp_granularities[0]", "word");
        const response = await this.parsed.fetcher(`${this.parsed.baseUrl}/audio/transcriptions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.options.apiKey}` },
          body: form,
          signal: controller.signal,
        });
        if (!response.ok) {
          const error = providerError(response.status);
          if (!shouldRetry(response.status) || attempt >= this.parsed.maxRetries) throw error;
          await wait(Math.min(4_000, 250 * 2 ** attempt));
          continue;
        }
        const parsed = jsonObject(
          await response.json(),
          "Together returned an invalid transcription response.",
        );
        const timing = alignWords(input.narration, parseTimedWords(parsed.words));
        return {
          timing,
          providerCallId: `together-alignment-${createHash("sha256").update(input.audio).digest("hex").slice(0, 24)}`,
          costUsd: (input.durationMs / 60_000) * this.parsed.costUsdPerAudioMinute,
          latencyMs: Math.max(0, Date.now() - startedAt),
          retryCount: attempt,
        };
      } catch (error) {
        if (error instanceof ProviderCallError) throw error;
        if (attempt >= this.parsed.maxRetries)
          throw new ProviderCallError({
            code: "PROVIDER_TRANSPORT_FAILED",
            message: "The Together alignment request could not be completed.",
            retryable: true,
          });
        await wait(Math.min(4_000, 250 * 2 ** attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ProviderCallError({
      code: "PROVIDER_TRANSPORT_FAILED",
      message: "The Together alignment request could not be completed.",
      retryable: true,
    });
  }
}
