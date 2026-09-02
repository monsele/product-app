import { createHash } from "node:crypto";
import { clearTimeout, setTimeout } from "node:timers";
import {
  ProviderCallError,
  togetherModelDefaults,
} from "@avlp/provider-adapters";
import type {
  SceneAudioSynthesis,
  SceneAudioTtsProvider,
} from "./scene-audio-job.js";

type FetchLike = typeof fetch;

export type TogetherKokoroTtsOptions = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  defaultVoice?: string;
  fetcher?: FetchLike;
  requestTimeoutMs?: number;
  maxRetries?: number;
  costUsdPerMillionCharacters?: number;
};

const defaultBaseUrl = "https://api.together.ai/v1";
const publicVoiceMap: Readonly<Record<string, string>> = {
  "english-aria": "af_bella",
  "english-james": "am_michael",
  "english-luna": "af_sky",
};

function parseOptions(options: TogetherKokoroTtsOptions): {
  baseUrl: string;
  fetcher: FetchLike;
  timeoutMs: number;
  maxRetries: number;
  costUsdPerMillionCharacters: number;
} {
  if (options.apiKey.trim().length === 0)
    throw new Error(
      "Together API key is required for the production provider.",
    );
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
  const costUsdPerMillionCharacters = options.costUsdPerMillionCharacters ?? 4;
  if (costUsdPerMillionCharacters < 0)
    throw new RangeError("Together TTS cost cannot be negative.");
  return {
    baseUrl,
    fetcher: options.fetcher ?? fetch,
    timeoutMs,
    maxRetries,
    costUsdPerMillionCharacters,
  };
}

function shouldRetry(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
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

function voiceFor(value: string | undefined, fallback: string): string {
  const mapped = value === undefined ? undefined : publicVoiceMap[value];
  if (mapped !== undefined) return mapped;
  if (value !== undefined && /^[a-z]{2}_[a-z]+$/.test(value)) return value;
  return fallback;
}

function pronunciationDictionary(
  overrides: readonly { phrase: string; replacement: string }[] | undefined,
): string[] {
  return (overrides ?? []).map(
    (override) => `${override.phrase}/${override.replacement}`,
  );
}

function ascii(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, index) =>
    String.fromCharCode(view.getUint8(offset + index)),
  ).join("");
}

function wavDurationMs(bytes: Uint8Array): number {
  if (bytes.length < 44)
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_AUDIO",
      message: "Together returned an invalid WAV audio file.",
    });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(view, 0, 4) !== "RIFF" || ascii(view, 8, 4) !== "WAVE")
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_AUDIO",
      message: "Together returned an invalid WAV audio file.",
    });
  let byteRate = 0;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const contentOffset = offset + 8;
    if (chunk === "fmt " && size >= 12 && contentOffset + 12 <= bytes.length)
      byteRate = view.getUint32(contentOffset + 8, true);
    if (chunk === "data") dataBytes = size;
    offset = contentOffset + size + (size % 2);
  }
  if (byteRate <= 0 || dataBytes <= 0)
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_AUDIO",
      message: "Together returned a WAV file with no usable duration.",
    });
  return Math.max(1, Math.round((dataBytes / byteRate) * 1_000));
}

/** Together's REST endpoint does not expose playback speed. Apply the saved
 * teacher rate deterministically to PCM16 WAV output without another provider
 * call, while keeping a conventional sample rate for browser/render support. */
export function retimePcm16Wav(
  bytes: Uint8Array,
  speakingRate: number,
): Uint8Array {
  if (speakingRate === 1) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 44 ||
    ascii(view, 0, 4) !== "RIFF" ||
    ascii(view, 8, 4) !== "WAVE"
  )
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_AUDIO",
      message: "Together returned an invalid WAV audio file.",
    });
  let channels = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataOffset = 0;
  let dataBytes = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunk = ascii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const contentOffset = offset + 8;
    if (chunk === "fmt " && size >= 16 && contentOffset + 16 <= bytes.length) {
      audioFormat = view.getUint16(contentOffset, true);
      channels = view.getUint16(contentOffset + 2, true);
      sampleRate = view.getUint32(contentOffset + 4, true);
      blockAlign = view.getUint16(contentOffset + 12, true);
      bitsPerSample = view.getUint16(contentOffset + 14, true);
    }
    if (chunk === "data" && contentOffset + size <= bytes.length) {
      dataOffset = contentOffset;
      dataBytes = size;
    }
    offset = contentOffset + size + (size % 2);
  }
  if (
    audioFormat !== 1 ||
    channels < 1 ||
    sampleRate < 1 ||
    bitsPerSample !== 16 ||
    blockAlign !== channels * 2 ||
    dataOffset === 0 ||
    dataBytes < blockAlign
  )
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_AUDIO",
      message: "Together returned an unsupported WAV encoding.",
    });
  const inputFrames = Math.floor(dataBytes / blockAlign);
  const outputFrames = Math.max(1, Math.round(inputFrames / speakingRate));
  const output = new Uint8Array(44 + outputFrames * blockAlign);
  const outputView = new DataView(output.buffer);
  const writeAscii = (at: number, text: string) =>
    [...text].forEach((character, index) =>
      outputView.setUint8(at + index, character.charCodeAt(0)),
    );
  writeAscii(0, "RIFF");
  outputView.setUint32(4, 36 + outputFrames * blockAlign, true);
  writeAscii(8, "WAVEfmt ");
  outputView.setUint32(16, 16, true);
  outputView.setUint16(20, 1, true);
  outputView.setUint16(22, channels, true);
  outputView.setUint32(24, sampleRate, true);
  outputView.setUint32(28, sampleRate * blockAlign, true);
  outputView.setUint16(32, blockAlign, true);
  outputView.setUint16(34, 16, true);
  writeAscii(36, "data");
  outputView.setUint32(40, outputFrames * blockAlign, true);
  for (let frame = 0; frame < outputFrames; frame += 1) {
    const sourcePosition = Math.min(inputFrames - 1, frame * speakingRate);
    const lower = Math.floor(sourcePosition);
    const upper = Math.min(inputFrames - 1, lower + 1);
    const fraction = sourcePosition - lower;
    for (let channel = 0; channel < channels; channel += 1) {
      const lowerSample = view.getInt16(
        dataOffset + lower * blockAlign + channel * 2,
        true,
      );
      const upperSample = view.getInt16(
        dataOffset + upper * blockAlign + channel * 2,
        true,
      );
      outputView.setInt16(
        44 + frame * blockAlign + channel * 2,
        Math.round(lowerSample + (upperSample - lowerSample) * fraction),
        true,
      );
    }
  }
  return output;
}

export class TogetherKokoroTtsProvider implements SceneAudioTtsProvider {
  public readonly providerId = "together";
  public readonly outputFormat = "wav" as const;
  public readonly contentType = "audio/wav" as const;
  public readonly model: string;
  private readonly parsed: ReturnType<typeof parseOptions>;

  public constructor(private readonly options: TogetherKokoroTtsOptions) {
    this.parsed = parseOptions(options);
    this.model = options.model ?? togetherModelDefaults.tts;
  }

  public async synthesize(input: {
    narration: string;
    speakingRate: number;
    voiceId?: string;
    pronunciationOverrides?: readonly { phrase: string; replacement: string }[];
  }): Promise<SceneAudioSynthesis> {
    const startedAt = Date.now();
    const pronunciationDict = pronunciationDictionary(
      input.pronunciationOverrides,
    );
    for (let attempt = 0; attempt <= this.parsed.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.parsed.timeoutMs,
      );
      try {
        const response = await this.parsed.fetcher(
          `${this.parsed.baseUrl}/audio/speech`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.options.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              input: input.narration,
              voice: voiceFor(
                input.voiceId,
                this.options.defaultVoice ?? "af_bella",
              ),
              response_format: "wav",
              language: "en",
              stream: false,
              ...(pronunciationDict.length === 0
                ? {}
                : { extra_params: { pronunciation_dict: pronunciationDict } }),
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const error = providerError(response.status);
          if (
            !shouldRetry(response.status) ||
            attempt >= this.parsed.maxRetries
          )
            throw error;
          await wait(Math.min(4_000, 250 * 2 ** attempt));
          continue;
        }
        const bytes = retimePcm16Wav(
          new Uint8Array(await response.arrayBuffer()),
          input.speakingRate,
        );
        const durationMs = wavDurationMs(bytes);
        return {
          bytes,
          durationMs,
          // Kokoro's non-streaming response contains audio only. The worker
          // runs the configured forced-alignment adapter before completing the
          // scene, so no proportional estimate can be mistaken for provider
          // timing.
          timing: [],
          providerCallId: `together-tts-${createHash("sha256").update(bytes).digest("hex").slice(0, 24)}`,
          costUsd:
            (input.narration.length / 1_000_000) *
            this.parsed.costUsdPerMillionCharacters,
        };
      } catch (error) {
        if (error instanceof ProviderCallError) throw error;
        if (attempt >= this.parsed.maxRetries)
          throw new ProviderCallError({
            code: "PROVIDER_TRANSPORT_FAILED",
            message: "The Together provider request could not be completed.",
            retryable: true,
          });
        await wait(Math.min(4_000, 250 * 2 ** attempt));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new ProviderCallError({
      code: "PROVIDER_TRANSPORT_FAILED",
      message: `Together TTS failed after ${Date.now() - startedAt}ms.`,
      retryable: true,
    });
  }
}
