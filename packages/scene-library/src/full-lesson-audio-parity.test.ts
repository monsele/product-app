/**
 * ST-103 extends the ST-098 preview/render parity evidence to audio.
 *
 * Every case renders real audio through the Remotion bundle, for both the
 * preview and the render composition:
 *
 * 1. With no sound bed, the output is byte-identical to the baseline captured
 *    from this same fixture *before* ST-103 changed the composition.
 * 2. With a bed, preview and render produce byte-identical audio.
 * 3. The rendered bed's per-frame level follows `soundBedVolumeAtFrame`, so
 *    it is fully ducked on every narrated frame.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { photosynthesisThreeMinutePreview } from "./full-lesson.fixture.js";
import {
  fullLessonPreviewCompositionId,
  fullLessonRuntimeCompositionId,
} from "./scene-preview-composition.js";
import {
  narrationSegmentsFromCaptions,
  soundBedVolumeAtFrame,
} from "./sound-bed.js";

/** sha256 of the 180-frame WAV below, rendered from the pre-ST-103 bundle
 * (commit c889f32) for both compositions. */
const preSoundBedBaselineSha256 =
  "1240a0719124b1bc3e6f15fca2e4ec1c0350c2df6102994fe9b0cb64dd2be425";

const sampleRate = 48_000;

function wav(samples: Float64Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) =>
    data.writeInt16LE(Math.round(value * 32_767), index * 2),
  );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function tone(seconds: number, frequency: number, amplitude: number): Buffer {
  const samples = new Float64Array(sampleRate * seconds);
  for (let index = 0; index < samples.length; index += 1)
    samples[index] =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * amplitude;
  return wav(samples);
}

/** Per-frame RMS of the first channel of a 16-bit PCM WAV. */
function frameRms(bytes: Buffer, fps: number): number[] {
  const channels = bytes.readUInt16LE(22);
  const rate = bytes.readUInt32LE(24);
  let offset = 12;
  while (bytes.toString("ascii", offset, offset + 4) !== "data")
    offset += 8 + bytes.readUInt32LE(offset + 4);
  const start = offset + 8;
  const frames = bytes.readUInt32LE(offset + 4) / (2 * channels);
  const perFrame = rate / fps;
  const result: number[] = [];
  for (let frame = 0; frame * perFrame < frames; frame += 1) {
    let sum = 0;
    let count = 0;
    for (
      let sample = frame * perFrame;
      sample < Math.min(frames, (frame + 1) * perFrame);
      sample += 1
    ) {
      const value = bytes.readInt16LE(start + sample * 2 * channels) / 32_768;
      sum += value * value;
      count += 1;
    }
    result.push(Math.sqrt(sum / count));
  }
  return result;
}

describe("full lesson audio parity (ST-098 + ST-103)", () => {
  let server: Server;
  let origin: string;
  let serveUrl: string;
  let directory: string;
  const browserExecutable = chromium.executablePath();
  const scene = photosynthesisThreeMinutePreview.lesson.scenes[0]!;
  const lesson = {
    ...photosynthesisThreeMinutePreview.lesson,
    scenes: [scene],
  };

  beforeAll(async () => {
    const narration = tone(5, 440, 0.3);
    // A 2-second loop: 440 whole cycles of 220 Hz, so repeats are seamless.
    const bed = tone(2, 220, 0.5);
    server = createServer((request, response) => {
      const body = request.url === "/bed.wav" ? bed : narration;
      response.writeHead(200, {
        "access-control-allow-origin": "*",
        "content-type": "audio/wav",
      });
      response.end(body);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Expected a TCP test server.");
    origin = `http://127.0.0.1:${address.port}`;
    serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    directory = await mkdtemp(join(tmpdir(), "avlp-audio-parity-"));
  }, 240_000);

  afterAll(async () => {
    server?.close();
    if (directory !== undefined)
      await rm(directory, { force: true, recursive: true });
  });

  async function renderAudio(
    id: string,
    inputProps: Record<string, unknown>,
  ): Promise<Buffer> {
    const composition = await selectComposition({
      browserExecutable,
      id,
      inputProps,
      serveUrl,
    });
    const outputLocation = join(directory, `${id}-${Math.random()}.wav`);
    await renderMedia({
      browserExecutable,
      codec: "wav",
      composition,
      frameRange: [0, 179],
      inputProps,
      outputLocation,
      serveUrl,
    });
    return readFile(outputLocation);
  }

  const sha256 = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");

  it(
    "renders byte-identical audio to the pre-ST-103 baseline with no bed",
    async () => {
      const props = {
        assets: {},
        captions: [
          { sceneId: scene.id, startFrame: 0, endFrame: 150, text: "Hello" },
        ],
        lesson,
        narrationTracks: [
          {
            kind: "browser-audio",
            sceneId: scene.id,
            src: `${origin}/narration.wav`,
          },
        ],
      };
      for (const id of [
        fullLessonRuntimeCompositionId,
        fullLessonPreviewCompositionId,
      ])
        expect(sha256(await renderAudio(id, props))).toBe(
          preSoundBedBaselineSha256,
        );
    },
    240_000,
  );

  it(
    "renders identical audio in preview and render with a bed, ducked on every narrated frame",
    async () => {
      const captions = [
        { sceneId: scene.id, startFrame: 60, endFrame: 120, text: "Hello" },
      ];
      const props = {
        assets: {},
        captions,
        lesson,
        // Silence narration so the output is the bed alone and its level can
        // be measured frame by frame against the pure envelope.
        narrationTracks: [
          { kind: "deterministic-silence", sceneId: scene.id },
        ],
        soundBed: {
          durationInFrames: 60,
          loops: true,
          src: `${origin}/bed.wav`,
          trackId: "test-bed",
        },
      };
      const render = await renderAudio(fullLessonRuntimeCompositionId, props);
      const preview = await renderAudio(fullLessonPreviewCompositionId, props);
      expect(sha256(preview)).toBe(sha256(render));

      const rms = frameRms(render, 30);
      const segments = narrationSegmentsFromCaptions(captions, 30);
      const totalFrames = scene.durationSeconds * 30;
      const gain = (frame: number) =>
        soundBedVolumeAtFrame({ fps: 30, frame, segments, totalFrames });
      // Remotion up-mixes the mono bed to stereo, which scales every frame by
      // the same constant. Calibrate it on a steady full-level window, then
      // compare levels as ratios.
      const fullLevel =
        rms.slice(140, 176).reduce((sum, value) => sum + value, 0) / 36;
      const ratio = (frame: number) => rms[frame]! / fullLevel;
      const ducked = gain(60) / gain(140);
      // Every narrated frame is fully ducked, from the boundary frame itself.
      for (let frame = 60; frame < 120; frame += 1)
        expect(Math.abs(ratio(frame) - ducked)).toBeLessThan(ducked * 0.06);
      // Full level before the down-ramp starts and after the up-ramp ends.
      for (const frame of [46, 50, 52, 128, 135])
        expect(Math.abs(ratio(frame) - 1)).toBeLessThan(0.03);
      // The ramps are strictly between the two levels, in the right order.
      for (let frame = 53; frame < 60; frame += 1) {
        expect(ratio(frame)).toBeLessThan(1);
        expect(ratio(frame)).toBeGreaterThan(ducked * 0.94);
        expect(ratio(frame + 1)).toBeLessThanOrEqual(ratio(frame) + 0.01);
      }
      for (let frame = 121; frame < 128; frame += 1) {
        expect(ratio(frame)).toBeLessThan(1);
        expect(ratio(frame + 1)).toBeGreaterThanOrEqual(ratio(frame) - 0.01);
      }
      // The fade-in starts from silence.
      expect(rms[0]).toBe(0);
    },
    240_000,
  );
});
