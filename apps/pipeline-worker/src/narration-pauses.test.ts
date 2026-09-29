import { describe, expect, it } from "vitest";
import {
  detectNarrationPauses,
  narrationPauseNote,
} from "./narration-pauses.js";

function wav(
  samples: (frame: number, channel: number) => number,
  frames = 4000,
  channels = 1,
) {
  const bytes = new Uint8Array(44 + frames * channels * 2);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) =>
    [...value].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0)),
    );
  tag(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 1000, true);
  view.setUint32(28, 2000 * channels, true);
  view.setUint16(32, 2 * channels, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, frames * channels * 2, true);
  for (let frame = 0; frame < frames; frame++)
    for (let channel = 0; channel < channels; channel++)
      view.setInt16(
        44 + (frame * channels + channel) * 2,
        samples(frame, channel),
        true,
      );
  return bytes;
}

describe("early narration pause inspection", () => {
  it("finds leading, internal and trailing pauses without changing the audio", () => {
    const bytes = wav((frame) =>
      frame < 1000 || (frame >= 1500 && frame < 2500) || frame >= 3000
        ? 0
        : 5000,
    );
    const original = bytes.slice();
    expect(detectNarrationPauses(bytes)).toEqual([
      { startMs: 0, endMs: 1000 },
      { startMs: 1500, endMs: 2500 },
      { startMs: 3000, endMs: 4000 },
    ]);
    expect(narrationPauseNote(bytes)).toContain("1.50s–2.50s");
    expect(narrationPauseNote(bytes)).toContain("do not block rendering");
    expect(bytes).toEqual(original);
  });

  it("ignores subsecond pauses and requires every channel to be quiet", () => {
    expect(
      detectNarrationPauses(wav((frame) => (frame < 999 ? 0 : 5000))),
    ).toEqual([]);
    expect(
      detectNarrationPauses(
        wav((_, channel) => (channel === 0 ? 0 : -5000), 4000, 2),
      ),
    ).toEqual([]);
  });

  it("reads subarrays and non-audio chunks with odd-size padding", () => {
    const input = wav(() => 0);
    const bytes = new Uint8Array(input.length + 10);
    bytes.set(input.subarray(0, 36));
    bytes.set([74, 85, 78, 75, 1, 0, 0, 0, 0, 0], 36);
    bytes.set(input.subarray(36), 46);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    const wrapped = new Uint8Array(bytes.length + 5);
    wrapped.set(bytes, 5);
    expect(detectNarrationPauses(wrapped.subarray(5))).toEqual([
      { startMs: 0, endMs: 4000 },
    ]);
  });

  it("leaves unsupported or truncated media to existing validation", () => {
    const bytes = wav(() => 0);
    expect(detectNarrationPauses(bytes.subarray(0, 45))).toBeNull();
    new DataView(bytes.buffer).setUint16(20, 3, true);
    expect(detectNarrationPauses(bytes)).toBeNull();
    expect(narrationPauseNote(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
