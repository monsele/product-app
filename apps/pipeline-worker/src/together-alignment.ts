import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { clearTimeout, setTimeout } from "node:timers";
import {
  togetherModelDefaults,
  ProviderCallError,
} from "@avlp/provider-adapters";
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
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 8)
    throw new RangeError("Together retry limit must be between 0 and 8.");
  const costUsdPerAudioMinute =
    options.costUsdPerAudioMinute ?? defaultCostUsdPerAudioMinute;
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
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function providerError(response: Response): Promise<ProviderCallError> {
  const status = response.status;
  // Only fixed diagnostic terms may leave this boundary. Provider messages can
  // echo the narration or credentials, so never retain their free-form text.
  let providerReason: string | undefined;
  try {
    const body = (await response.text()).toLowerCase();
    const terms = [
      "model",
      "unsupported",
      "not supported",
      "invalid",
      "file",
      "required",
      "timestamp",
      "granularities",
      "whisper",
      "parakeet",
      "audio",
      "missing",
      "not found",
      "unavailable",
      "sample rate",
      "format",
      "prompt",
      "language",
    ];
    providerReason =
      terms.filter((term) => body.includes(term)).join(", ") || undefined;
  } catch {
    /* Diagnostics must not replace the HTTP failure. */
  }
  const details = {
    providerStatus: status,
    ...(providerReason ? { providerReason } : {}),
  };
  if (status === 401 || status === 403)
    return new ProviderCallError({
      code: "PROVIDER_AUTHENTICATION_FAILED",
      message: "Together rejected the provider credentials.",
      ...details,
    });
  if (status === 429)
    return new ProviderCallError({
      code: "PROVIDER_RATE_LIMITED",
      message: "Together rate-limited the provider request.",
      ...details,
      retryable: true,
    });
  if (status >= 500)
    return new ProviderCallError({
      code: "PROVIDER_UNAVAILABLE",
      message: "Together is temporarily unavailable.",
      ...details,
      retryable: true,
    });
  return new ProviderCallError({
    code: "PROVIDER_REQUEST_REJECTED",
    message: "Together rejected the provider request.",
    ...details,
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
    const object = jsonObject(
      item,
      "Together returned an invalid word timestamp.",
    );
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
      end < start
    )
      throw new ProviderCallError({
        code: "PROVIDER_INVALID_ALIGNMENT",
        message: "Together returned invalid word timing data.",
        providerReason:
          typeof start === "number" && start === end
            ? "zero_duration_word"
            : "invalid_word_timestamp",
      });
    words.push({ word, start, end });
  }
  return words;
}

function narrationWordGroups(
  narration: string,
): Array<{ text: string; wordIndexes: number[] }> {
  const groups: Array<{ text: string; wordIndexes: number[] }> = [];
  let wordIndex = 0;
  for (const match of narration.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)) {
    const text = clean(match[0] ?? "");
    const count = [...text.matchAll(/\S+/g)].length;
    if (count > 0) {
      groups.push({
        text,
        wordIndexes: Array.from(
          { length: count },
          (_, index) => wordIndex + index,
        ),
      });
      wordIndex += count;
    }
  }
  return groups;
}

function alignWords(
  narration: string,
  words: readonly TimedWord[],
): SceneAudioTiming[] {
  const groups = narrationWordGroups(narration);
  // Match exact text independently of ASR word splitting (hyphens,
  // contractions and standalone punctuation). Keep provider timing anchors.
  const transcript = words.map((word) => normalizedWord(word.word)).join("");
  const normalizedNarration = groups
    .map((group) => normalizedWord(group.text))
    .join("");
  const offset =
    normalizedNarration.length > 0
      ? transcript.indexOf(normalizedNarration)
      : -1;
  if (offset >= 0) {
    const anchors: TimedWord[] = words.flatMap((word) =>
      normalizedWord(word.word)
        .split("")
        .map(() => word),
    );
    let cursor = offset;
    return groups.map((group) => {
      const count = normalizedWord(group.text).length;
      const first = anchors[cursor];
      const last = anchors[cursor + count - 1];
      cursor += count;
      if (
        !first ||
        !last ||
        Math.round(last.end * 1000) <= Math.round(first.start * 1000)
      )
        throw new ProviderCallError({
          code: "PROVIDER_INVALID_ALIGNMENT",
          message: "Together returned a sentence without a positive duration.",
        });
      return {
        startMs: Math.round(first.start * 1000),
        endMs: Math.round(last.end * 1000),
        text: group.text,
      };
    });
  }
  return alignWordsInOrder(groups, words);
}

/**
 * Share of narration words the transcript must reproduce exactly. ASR misses
 * numbers, symbols, acronyms and names in otherwise correct speech, and those
 * words still carry usable timing once aligned in order; a transcript below
 * this share is treated as different speech rather than a mishearing.
 */
const minimumExactWordShare = 0.7;

type WordSpan = { first: number; last: number };

/**
 * Edit-distance alignment of narration words onto transcript words, in order.
 * Substituted words keep the transcript's timing, words split or joined
 * differently ("water-cycle" / "water cycle") match exactly, and transcript
 * words with no narration counterpart extend the narration word before them.
 * Sentences whose words were all dropped are interpolated between their
 * neighbours by word count.
 */
function alignWordsInOrder(
  groups: ReadonlyArray<{ text: string; wordIndexes: number[] }>,
  words: readonly TimedWord[],
): SceneAudioTiming[] {
  const narration = groups.flatMap((group, groupIndex) =>
    [...group.text.matchAll(/\S+/g)]
      .map((match) => ({ token: normalizedWord(match[0] ?? ""), groupIndex }))
      .filter((entry) => entry.token.length > 0),
  );
  const transcript = words
    .map((word, index) => ({ token: normalizedWord(word.word), index }))
    .filter((entry) => entry.token.length > 0);
  const n = narration.length;
  const m = transcript.length;
  if (n === 0 || m === 0)
    throw new ProviderCallError({
      code: "PROVIDER_ALIGNMENT_MISMATCH",
      message: "Together transcription did not cover the approved narration.",
      providerReason: `word_counts:${n}:${m}`,
    });

  type Move = "match" | "delete" | "insert" | "split" | "join";
  const width = m + 1;
  const cost = new Float64Array((n + 1) * width).fill(Infinity);
  const moves: Move[] = new Array((n + 1) * width);
  cost[0] = 0;
  for (let i = 0; i <= n; i += 1)
    for (let j = 0; j <= m; j += 1) {
      if (i === 0 && j === 0) continue;
      let best = Infinity;
      let move: Move = "match";
      const consider = (candidate: number, candidateMove: Move) => {
        if (candidate < best) {
          best = candidate;
          move = candidateMove;
        }
      };
      if (i > 0 && j > 0)
        consider(
          cost[(i - 1) * width + j - 1]! +
            (narration[i - 1]!.token === transcript[j - 1]!.token ? 0 : 1),
          "match",
        );
      if (
        i > 0 &&
        j > 1 &&
        narration[i - 1]!.token ===
          transcript[j - 2]!.token + transcript[j - 1]!.token
      )
        consider(cost[(i - 1) * width + j - 2]!, "split");
      if (
        i > 1 &&
        j > 0 &&
        narration[i - 2]!.token + narration[i - 1]!.token ===
          transcript[j - 1]!.token
      )
        consider(cost[(i - 2) * width + j - 1]!, "join");
      if (i > 0) consider(cost[(i - 1) * width + j]! + 1, "delete");
      if (j > 0) consider(cost[i * width + j - 1]! + 1, "insert");
      cost[i * width + j] = best;
      moves[i * width + j] = move;
    }

  const path: { move: Move; i: number; j: number }[] = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const move = moves[i * width + j]!;
    path.push({ move, i, j });
    if (move === "match") (i -= 1), (j -= 1);
    else if (move === "split") (i -= 1), (j -= 2);
    else if (move === "join") (i -= 2), (j -= 1);
    else if (move === "delete") i -= 1;
    else j -= 1;
  }
  path.reverse();

  // Record which transcript words each narration word owns. A transcript word
  // with no narration counterpart belongs to the narration word before it
  // (usually the misheard word it continues), so a sentence ends where its
  // speech ends; before any narration word, it belongs to the first one.
  const spans: (WordSpan | undefined)[] = new Array(n).fill(undefined);
  const exact: boolean[] = new Array(n).fill(false);
  const own = (narrationIndex: number, first: number, last: number) => {
    const span = spans[narrationIndex];
    spans[narrationIndex] =
      span === undefined
        ? { first, last }
        : { first: Math.min(span.first, first), last: Math.max(span.last, last) };
  };
  let previousNarration = 0;
  for (const { move, i, j } of path) {
    if (move === "match") {
      own(i - 1, transcript[j - 1]!.index, transcript[j - 1]!.index);
      exact[i - 1] = narration[i - 1]!.token === transcript[j - 1]!.token;
      previousNarration = i - 1;
    } else if (move === "split") {
      own(i - 1, transcript[j - 2]!.index, transcript[j - 1]!.index);
      exact[i - 1] = true;
      previousNarration = i - 1;
    } else if (move === "join") {
      own(i - 2, transcript[j - 1]!.index, transcript[j - 1]!.index);
      own(i - 1, transcript[j - 1]!.index, transcript[j - 1]!.index);
      exact[i - 2] = true;
      exact[i - 1] = true;
      previousNarration = i - 1;
    } else if (move === "delete") {
      previousNarration = i - 1;
    } else {
      own(previousNarration, transcript[j - 1]!.index, transcript[j - 1]!.index);
    }
  }

  const exactCount = exact.filter(Boolean).length;
  if (exactCount / n < minimumExactWordShare)
    throw new ProviderCallError({
      code: "PROVIDER_ALIGNMENT_MISMATCH",
      message: "Together transcription did not match the approved narration.",
      providerReason: `word_counts:${n}:${m};matched:${exactCount}`,
    });

  const sentenceSpans = groups.map((_, groupIndex) => {
    let first = Infinity;
    let last = -Infinity;
    narration.forEach((entry, index) => {
      const span = spans[index];
      if (entry.groupIndex !== groupIndex || span === undefined) return;
      first = Math.min(first, span.first);
      last = Math.max(last, span.last);
    });
    return Number.isFinite(first)
      ? {
          startMs: Math.round(words[first]!.start * 1_000),
          endMs: Math.round(words[last]!.end * 1_000),
        }
      : undefined;
  });
  return groups.map((group, groupIndex) => {
    let timing = sentenceSpans[groupIndex];
    if (timing === undefined) timing = interpolateSentence(groups, sentenceSpans, groupIndex);
    const previous = groupIndex > 0 ? sentenceSpans[groupIndex - 1] : undefined;
    const startMs = Math.max(timing.startMs, previous?.endMs ?? 0);
    // Some ASR models quantize individual words to a single instant. Those
    // anchors are usable inside a sentence, but the resulting caption still
    // needs a positive duration at millisecond precision.
    if (timing.endMs <= startMs)
      throw new ProviderCallError({
        code: "PROVIDER_INVALID_ALIGNMENT",
        message: "Together returned a sentence without a positive duration.",
      });
    sentenceSpans[groupIndex] = { startMs, endMs: timing.endMs };
    return { startMs, endMs: timing.endMs, text: group.text };
  });
}

/** Places a sentence the transcript dropped between its timed neighbours. */
function interpolateSentence(
  groups: ReadonlyArray<{ wordIndexes: number[] }>,
  spans: ReadonlyArray<{ startMs: number; endMs: number } | undefined>,
  groupIndex: number,
): { startMs: number; endMs: number } {
  let before = groupIndex - 1;
  while (before >= 0 && spans[before] === undefined) before -= 1;
  let after = groupIndex + 1;
  while (after < spans.length && spans[after] === undefined) after += 1;
  const from = before >= 0 ? spans[before]!.endMs : 0;
  const to = after < spans.length ? spans[after]!.startMs : undefined;
  if (to === undefined || to <= from)
    throw new ProviderCallError({
      code: "PROVIDER_INVALID_ALIGNMENT",
      message: "Together returned incomplete word timing data.",
    });
  const weight = (index: number) => Math.max(1, groups[index]!.wordIndexes.length);
  let total = 0;
  let offset = 0;
  for (let index = before + 1; index < after; index += 1) {
    if (index < groupIndex) offset += weight(index);
    total += weight(index);
  }
  return {
    startMs: Math.round(from + ((to - from) * offset) / total),
    endMs: Math.round(from + ((to - from) * (offset + weight(groupIndex))) / total),
  };
}

export class TogetherWhisperAlignmentProvider implements SceneAudioAlignmentProvider {
  public readonly providerId = "together";
  public readonly model: string;
  private readonly parsed: ReturnType<typeof parseOptions>;

  public constructor(
    private readonly options: TogetherWhisperAlignmentOptions,
  ) {
    this.parsed = parseOptions(options);
    this.model = options.model ?? togetherModelDefaults.alignment;
  }

  public async align(input: {
    beforeDispatch?: (costUsd: number) => Promise<void>;
    audio: Uint8Array;
    narration: string;
    durationMs: number;
  }): Promise<SceneAudioAlignmentResult> {
    const startedAt = Date.now();
    const maxRetries = input.beforeDispatch ? 0 : this.parsed.maxRetries;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await input.beforeDispatch?.((input.durationMs / 60_000) * this.parsed.costUsdPerAudioMinute);
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.parsed.timeoutMs,
      );
      try {
        const form = new FormData();
        form.append(
          "file",
          new Blob([Buffer.from(input.audio)], { type: "audio/wav" }),
          "scene-audio.wav",
        );
        form.append("model", this.model);
        form.append("language", "en");
        if (this.model.startsWith("openai/whisper"))
          form.append("prompt", input.narration);
        form.append("response_format", "verbose_json");
        form.append("timestamp_granularities", "word");
        const response = await this.parsed.fetcher(
          `${this.parsed.baseUrl}/audio/transcriptions`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${this.options.apiKey}` },
            body: form,
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const error = await providerError(response);
          if (
            !shouldRetry(response.status) ||
            attempt >= maxRetries
          )
            throw error;
          await wait(Math.min(4_000, 250 * 2 ** attempt));
          continue;
        }
        const parsed = jsonObject(
          await response.json(),
          "Together returned an invalid transcription response.",
        );
        const timing = alignWords(
          input.narration,
          parseTimedWords(parsed.words),
        );
        return {
          timing,
          providerCallId: `together-alignment-${createHash("sha256").update(input.audio).digest("hex").slice(0, 24)}`,
          costUsd:
            (input.durationMs / 60_000) * this.parsed.costUsdPerAudioMinute,
          latencyMs: Math.max(0, Date.now() - startedAt),
          retryCount: attempt,
        };
      } catch (error) {
        if (error instanceof ProviderCallError) throw error;
        if (attempt >= maxRetries)
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
