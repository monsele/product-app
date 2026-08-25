export type CaptionExportFormat = "srt" | "vtt";
export type CaptionExportCue = Readonly<{
  startMs: number;
  endMs: number;
  text: string;
}>;

/** Serializes the immutable, render-manifest cues supplied by the caller. */
export function serializeCaptionExport(
  format: CaptionExportFormat,
  cues: readonly CaptionExportCue[],
): string {
  return format === "srt" ? srt(cues) : vtt(cues);
}
const time = (ms: number, decimal: "," | ".") =>
  `${String(Math.floor(ms / 3_600_000)).padStart(2, "0")}:${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1_000) % 60).padStart(2, "0")}${decimal}${String(ms % 1_000).padStart(3, "0")}`;
const srt = (
  cues: readonly { startMs: number; endMs: number; text: string }[],
) =>
  `${cues.map((cue, index) => `${index + 1}\n${time(cue.startMs, ",")} --> ${time(cue.endMs, ",")}\n${cue.text}`).join("\n\n")}\n`;
const vtt = (
  cues: readonly { startMs: number; endMs: number; text: string }[],
) =>
  `WEBVTT\n\n${cues.map((cue) => `${time(cue.startMs, ".")} --> ${time(cue.endMs, ".")}\n${cue.text}`).join("\n\n")}\n`;
