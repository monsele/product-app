/** Advisory inspection of the PCM16 WAV produced by our narration adapters.
 * Unsupported/malformed media is left to the media validation boundary. Never
 * reject audio or change its samples because of this pacing heuristic.
 */
export type NarrationPause = Readonly<{ startMs: number; endMs: number }>;

export function detectNarrationPauses(
  bytes: Uint8Array,
): NarrationPause[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  const end = view.getUint32(4, true) + 8;
  if (end > bytes.length || end < 44) return null;
  let channels = 0;
  let sampleRate = 0;
  let blockAlign = 0;
  let dataOffset = 0;
  let dataSize = 0;
  let hasFormat = false;
  for (let offset = 12; offset + 8 <= end;) {
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > end) return null;
    if (tag(offset) === "fmt ") {
      if (
        hasFormat ||
        size < 16 ||
        view.getUint16(start, true) !== 1 ||
        view.getUint16(start + 14, true) !== 16
      )
        return null;
      hasFormat = true;
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
      blockAlign = view.getUint16(start + 12, true);
    }
    if (tag(offset) === "data") {
      if (dataOffset !== 0) return null;
      dataOffset = start;
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }
  if (
    !hasFormat ||
    channels < 1 ||
    sampleRate < 1 ||
    blockAlign !== channels * 2 ||
    dataOffset === 0 ||
    dataSize === 0 ||
    dataSize % blockAlign !== 0
  )
    return null;

  const frames = dataSize / blockAlign;
  const floor = 32768 * 10 ** (-50 / 20);
  const pauses: NarrationPause[] = [];
  let quietStart: number | null = null;
  const close = (frame: number) => {
    // One second is a note, including leading/trailing pauses. Every channel
    // must be quiet; a silent channel in stereo speech is not a speech gap.
    if (quietStart !== null && frame - quietStart >= sampleRate)
      pauses.push({
        startMs: Math.round((quietStart * 1000) / sampleRate),
        endMs: Math.round((frame * 1000) / sampleRate),
      });
    quietStart = null;
  };
  for (let frame = 0; frame < frames; frame++) {
    let quiet = true;
    for (let channel = 0; channel < channels; channel++) {
      if (
        Math.abs(
          view.getInt16(dataOffset + frame * blockAlign + channel * 2, true),
        ) > floor
      ) {
        quiet = false;
        break;
      }
    }
    if (quiet) quietStart ??= frame;
    else close(frame);
  }
  close(frames);
  return pauses;
}

export function narrationPauseNote(bytes: Uint8Array): string | null {
  const pauses = detectNarrationPauses(bytes);
  if (!pauses?.length) return null;
  const examples = pauses
    .slice(0, 5)
    .map(
      (pause) =>
        `${(pause.startMs / 1000).toFixed(2)}s–${(pause.endMs / 1000).toFixed(2)}s`,
    )
    .join(", ");
  return `Narration pause${pauses.length === 1 ? "" : "s"} detected at ${examples}${pauses.length > 5 ? ` and ${pauses.length - 5} more` : ""} within this scene. Pauses can be intentional and do not block rendering. Listen to review; regenerate audio only if you want different pacing.`;
}
