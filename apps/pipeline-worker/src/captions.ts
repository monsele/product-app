import { createHash } from "node:crypto";

export type TimedText = Readonly<{ startMs: number; endMs: number; text: string }>;
export type CaptionCue = TimedText;

const maxCharacters = 84;
const maxDurationMs = 6_000;
const minimumDurationMs = 500;
const maxReadingWordsPerSecond = 4;
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean);
const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Uses provider sentence timings when available; proportional sentence timing is
 * the deterministic alignment fallback for providers without timestamps. */
export function alignSentences(input: { narration: string; durationMs: number; timing: readonly TimedText[] }): TimedText[] {
  const narration = clean(input.narration);
  const valid = input.timing.filter((item) => item.startMs >= 0 && item.endMs > item.startMs && clean(item.text).length > 0);
  const providerTimingIsUsable =
    valid.length === input.timing.length &&
    valid.every(
      (item, index) =>
        item.endMs <= input.durationMs &&
        (index === 0 || item.startMs >= valid[index - 1]!.endMs),
    );
  if (providerTimingIsUsable && valid.length > 0)
    return valid.map((item) => ({ ...item, text: clean(item.text) }));
  const sentences = narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(clean).filter(Boolean) ?? [narration];
  const total = sentences.reduce((sum, sentence) => sum + Math.max(1, words(sentence).length), 0);
  let startMs = 0;
  return sentences.map((text, index) => {
    const endMs = index === sentences.length - 1 ? input.durationMs : startMs + Math.round((input.durationMs * Math.max(1, words(text).length)) / total);
    const item = { startMs, endMs, text }; startMs = endMs; return item;
  });
}

export function segmentCaptions(timing: readonly TimedText[], durationMs: number): CaptionCue[] {
  const result: CaptionCue[] = [];
  for (const entry of timing) {
    const chunks = entry.text.match(/[^,;:]+[,;:]?|[^,;:]+$/g)?.map(clean).filter(Boolean) ?? [];
    const tokens = chunks.flatMap((chunk) => words(chunk));
    const groups: string[] = [];
    let current = "";
    for (const token of tokens) {
      const next = clean(`${current} ${token}`);
      if (current && next.length > maxCharacters) { groups.push(current); current = token; } else current = next;
    }
    if (current) groups.push(current);
    const count = Math.max(
      1,
      groups.length,
      Math.ceil((entry.endMs - entry.startMs) / maxDurationMs),
      Math.ceil(
        tokens.length /
          Math.max(
            1,
            ((entry.endMs - entry.startMs) / 1_000) * maxReadingWordsPerSecond,
          ),
      ),
    );
    const readableGroups =
      count === groups.length
        ? groups
        : Array.from({ length: count }, (_, index) =>
            tokens
              .slice(
                Math.floor((tokens.length * index) / count),
                Math.floor((tokens.length * (index + 1)) / count),
              )
              .join(" "),
          ).filter(Boolean);
    for (const [index, text] of readableGroups.entries()) {
      const startMs = entry.startMs + Math.round(((entry.endMs - entry.startMs) * index) / count);
      const endMs = entry.startMs + Math.round(((entry.endMs - entry.startMs) * (index + 1)) / count);
      result.push({ startMs, endMs, text });
    }
  }
  return normalizeCaptionTiming(result, durationMs);
}

export function normalizeCaptionTiming(cues: readonly CaptionCue[], durationMs: number): CaptionCue[] {
  let previous = 0;
  const normalized: CaptionCue[] = [];
  for (const cue of cues) {
    if (previous >= durationMs) break;
    const startMs = Math.min(durationMs - 1, Math.max(previous, cue.startMs));
    const endMs = Math.min(durationMs, Math.max(startMs + Math.min(minimumDurationMs, Math.max(1, durationMs - startMs)), Math.min(cue.endMs, startMs + maxDurationMs)));
    previous = endMs;
    const text = clean(cue.text);
    if (endMs > startMs && text.length > 0) normalized.push({ startMs, endMs, text });
  }
  return normalized;
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");
export function srtTimestamp(value: number): string { const ms = Math.max(0, Math.floor(value)); return `${pad(Math.floor(ms / 3_600_000), 2)}:${pad(Math.floor(ms / 60_000) % 60, 2)}:${pad(Math.floor(ms / 1_000) % 60, 2)},${pad(ms % 1_000, 3)}`; }
export function vttTimestamp(value: number): string { return srtTimestamp(value).replace(",", "."); }
export function serializeSrt(cues: readonly CaptionCue[]): string { return `${cues.map((cue, index) => `${index + 1}\n${srtTimestamp(cue.startMs)} --> ${srtTimestamp(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`; }
export function serializeVtt(cues: readonly CaptionCue[]): string { return `WEBVTT\n\n${cues.map((cue) => `${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}\n${cue.text}`).join("\n\n")}\n`; }
export function captionContentHash(input: { narrationHash: string; audioContentHash: string }): string { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
