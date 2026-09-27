/**
 * ST-103 — the post-render review against real media.
 *
 * - A real Remotion render of a short lesson with a catalog sound bed under
 *   narration passes the review, with a four-frame contact sheet.
 * - Synthetic MP4 fixtures, encoded with the renderer's own pinned ffmpeg,
 *   carry a black gap and a silent narration span. The review fails them
 *   with the right codes at the right timestamps.
 * - With a bed playing where narration went missing, the bed-aware silence
 *   floor still catches it; the plain -50 dB floor would not (ADR-012).
 */
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderInternals } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hdRenderProfile } from "./contracts.js";
import { RemotionRenderEngine } from "./media.js";
import {
  classifyRenderReview,
  FfmpegRenderInspector,
  narrationSpansFromCaptions,
  silenceFloorDb,
  type RenderReviewExpectations,
} from "./render-review.js";

const ffmpeg = RenderInternals.getExecutablePath({
  binariesDirectory: null,
  indent: false,
  logLevel: "error",
  type: "ffmpeg",
});
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

/** A 24-bit uncompressed BMP of one flat colour. */
function bmp(width: number, height: number, rgb: [number, number, number]): Buffer {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const offset = y * rowBytes + x * 3;
      pixels[offset] = rgb[2];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[0];
    }
  const header = Buffer.alloc(54);
  header.write("BM", 0);
  header.writeUInt32LE(54 + pixels.length, 2);
  header.writeUInt32LE(54, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(width, 18);
  header.writeInt32LE(height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  return Buffer.concat([header, pixels]);
}

type Segment = { seconds: number; black: boolean };

/**
 * Encodes a 1080p/30 H.264 + AAC fixture. `audio(t)` gives the sample at
 * time t seconds.
 */
async function encodeFixture(input: {
  directory: string;
  name: string;
  segments: Segment[];
  audio: (seconds: number) => number;
}): Promise<{ path: string; durationMs: number }> {
  const gray = join(input.directory, "gray.bmp");
  const black = join(input.directory, "black.bmp");
  await writeFile(gray, bmp(64, 36, [128, 128, 128]));
  await writeFile(black, bmp(64, 36, [0, 0, 0]));
  const totalSeconds = input.segments.reduce((sum, item) => sum + item.seconds, 0);
  const list = [
    ...input.segments.flatMap((segment) => [
      `file '${(segment.black ? black : gray).replaceAll("\\", "/")}'`,
      `duration ${segment.seconds}`,
    ]),
    `file '${gray.replaceAll("\\", "/")}'`,
  ].join("\n");
  const listPath = join(input.directory, `${input.name}.txt`);
  await writeFile(listPath, list);
  const samples = new Float64Array(Math.round(totalSeconds * sampleRate));
  for (let index = 0; index < samples.length; index += 1)
    samples[index] = input.audio(index / sampleRate);
  const audioPath = join(input.directory, `${input.name}.wav`);
  await writeFile(audioPath, wav(samples));
  const output = join(input.directory, `${input.name}.mp4`);
  const run = spawnSync(
    ffmpeg,
    [
      "-nostdin",
      "-hide_banner",
      "-v",
      "error",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-i",
      audioPath,
      "-vf",
      "scale=1920:1080,format=yuv420p",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-c:a",
      "aac",
      "-t",
      String(totalSeconds),
      output,
    ],
    { cwd: dirname(ffmpeg), encoding: "utf8" },
  );
  if (run.status !== 0) throw new Error(`Fixture encode failed: ${run.stderr}`);
  return { durationMs: totalSeconds * 1_000, path: output };
}

const tone = (amplitude: number, frequency = 440) => (t: number) =>
  Math.sin(2 * Math.PI * frequency * t) * amplitude;

function expectationsFor(
  durationMs: number,
  narrationSpans: RenderReviewExpectations["narrationSpans"],
): RenderReviewExpectations {
  return {
    captions: {
      expectedCueCount: 1,
      narratedScenesWithoutCaptions: 0,
      renderedCueCount: 1,
    },
    expectedDurationMs: durationMs,
    narrationSpans,
    profile: hdRenderProfile,
  };
}

describe("post-render review on real media", () => {
  let directory: string;
  const inspector = new FfmpegRenderInspector();

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "avlp-review-"));
  });
  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it(
    "fails a black gap of 1 s or more with its timestamp",
    async () => {
      const fixture = await encodeFixture({
        audio: tone(0.25),
        directory,
        name: "black-gap",
        segments: [
          { black: false, seconds: 2 },
          { black: true, seconds: 1.5 },
          { black: false, seconds: 2.5 },
        ],
      });
      const inspection = await inspector.inspect({
        silenceFloorDb: silenceFloorDb(null),
        videoPath: fixture.path,
        workingDirectory: directory,
      });
      const findings = classifyRenderReview(
        inspection.measurements,
        expectationsFor(fixture.durationMs, [{ startMs: 0, endMs: 6_000 }]),
      );
      const errors = findings.filter((item) => item.severity === "error");
      expect(errors.map((item) => item.code)).toEqual(["BLACK_SEGMENT"]);
      expect(errors[0]!.atMs).toBeGreaterThanOrEqual(1_966);
      expect(errors[0]!.atMs).toBeLessThanOrEqual(2_034);
      // A shorter gap is tolerated.
      const short = await encodeFixture({
        audio: tone(0.25),
        directory,
        name: "black-blink",
        segments: [
          { black: false, seconds: 2 },
          { black: true, seconds: 0.5 },
          { black: false, seconds: 2 },
        ],
      });
      const shortInspection = await inspector.inspect({
        silenceFloorDb: -50,
        videoPath: short.path,
        workingDirectory: directory,
      });
      expect(
        classifyRenderReview(
          shortInspection.measurements,
          expectationsFor(short.durationMs, []),
        ).filter((item) => item.severity === "error"),
      ).toEqual([]);
    },
    120_000,
  );

  it(
    "fails silent narration inside a narration span with its timestamp",
    async () => {
      const fixture = await encodeFixture({
        audio: (t) => (t >= 2 && t < 4 ? 0 : tone(0.25)(t)),
        directory,
        name: "silent-narration",
        segments: [{ black: false, seconds: 6 }],
      });
      const inspection = await inspector.inspect({
        silenceFloorDb: silenceFloorDb(null),
        videoPath: fixture.path,
        workingDirectory: directory,
      });
      const findings = classifyRenderReview(
        inspection.measurements,
        expectationsFor(fixture.durationMs, [{ startMs: 500, endMs: 5_500 }]),
      );
      const errors = findings.filter((item) => item.severity === "error");
      expect(errors.map((item) => item.code)).toEqual(["NARRATION_SILENT"]);
      expect(errors[0]!.atMs).toBeGreaterThanOrEqual(1_900);
      expect(errors[0]!.atMs).toBeLessThanOrEqual(2_100);
      // The same silence outside every narration span is not an error.
      expect(
        classifyRenderReview(
          inspection.measurements,
          expectationsFor(fixture.durationMs, [{ startMs: 4_500, endMs: 5_500 }]),
        ).filter((item) => item.severity === "error"),
      ).toEqual([]);
    },
    120_000,
  );

  it(
    "still sees missing narration when a ducked bed fills the silence",
    async () => {
      // The bed's registered peak, at the ducked gain: about -36.4 dBFS.
      const bedPeakDbfs = -8.4;
      const duckedBed = tone(10 ** ((bedPeakDbfs - 27.96) / 20), 220);
      const fixture = await encodeFixture({
        audio: (t) =>
          t >= 2 && t < 4 ? duckedBed(t) : tone(0.25)(t) + duckedBed(t),
        directory,
        name: "bed-over-missing-narration",
        segments: [{ black: false, seconds: 6 }],
      });
      const spans = [{ startMs: 500, endMs: 5_500 }];
      const withFloor = await inspector.inspect({
        silenceFloorDb: silenceFloorDb({ peakDbfs: bedPeakDbfs }),
        videoPath: fixture.path,
        workingDirectory: directory,
      });
      expect(
        classifyRenderReview(
          withFloor.measurements,
          expectationsFor(fixture.durationMs, spans),
        )
          .filter((item) => item.severity === "error")
          .map((item) => item.code),
      ).toEqual(["NARRATION_SILENT"]);
      const plainFloor = await inspector.inspect({
        silenceFloorDb: -50,
        videoPath: fixture.path,
        workingDirectory: directory,
      });
      expect(plainFloor.measurements.silenceSpans).toEqual([]);
    },
    120_000,
  );

  describe("a real render with a catalog sound bed", () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
      const bed = await readFile(
        fileURLToPath(
          new URL(
            "../../api/sound-beds/tracks/morning-pad.wav",
            import.meta.url,
          ),
        ),
      );
      const narration = wav(
        Float64Array.from({ length: sampleRate * 6 }, (_, index) =>
          index / sampleRate >= 0.5 && index / sampleRate < 5.5
            ? tone(0.25)(index / sampleRate)
            : 0,
        ),
      );
      server = createServer((request, response) => {
        response.writeHead(200, {
          "access-control-allow-origin": "*",
          "content-type": "audio/wav",
        });
        response.end(request.url === "/bed.wav" ? bed : narration);
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      if (address === null || typeof address === "string")
        throw new Error("Expected a TCP server.");
      origin = `http://127.0.0.1:${address.port}`;
    });
    afterAll(() => {
      server?.close();
    });

    it(
      "passes the review and produces a four-frame contact sheet",
      async () => {
        const scene = photosynthesisThreeMinutePreview.lesson.scenes[0]!;
        const captions = [
          { endFrame: 165, sceneId: scene.id, startFrame: 15, text: "Plants" },
        ];
        const composition = {
          assets: {},
          captions,
          lesson: {
            ...photosynthesisThreeMinutePreview.lesson,
            scenes: [scene],
          },
          narrationTracks: [
            {
              kind: "browser-audio" as const,
              sceneId: scene.id,
              src: `${origin}/narration.wav`,
            },
          ],
          soundBed: {
            durationInFrames: 480,
            loops: true,
            src: `${origin}/bed.wav`,
            trackId: "morning-pad",
          },
        };
        const outputPath = join(directory, "with-bed.mp4");
        await new RemotionRenderEngine().renderVideo({
          browserExecutable: chromium.executablePath(),
          composition,
          frameRange: [0, 179],
          onProgress: async () => undefined,
          outputPath,
          profile: hdRenderProfile,
        });
        const inspection = await inspector.inspect({
          silenceFloorDb: silenceFloorDb({ peakDbfs: -8.4 }),
          videoPath: outputPath,
          workingDirectory: directory,
        });
        const findings = classifyRenderReview(inspection.measurements, {
          captions: {
            expectedCueCount: 1,
            narratedScenesWithoutCaptions: 0,
            renderedCueCount: 1,
          },
          expectedDurationMs: 6_000,
          narrationSpans: narrationSpansFromCaptions(
            captions,
            new Set([scene.id]),
            30,
          ),
          profile: hdRenderProfile,
        });
        expect(findings.filter((item) => item.severity === "error")).toEqual(
          [],
        );
        expect(inspection.measurements.integratedLufs).not.toBeNull();
        expect(inspection.contactSheet.map((frame) => frame.position)).toEqual(
          [0.05, 0.35, 0.65, 0.95],
        );
        for (const frame of inspection.contactSheet)
          expect(
            Math.abs(
              frame.atMs -
                inspection.measurements.durationMs * frame.position,
            ),
          ).toBeLessThanOrEqual(1);
        for (const frame of inspection.contactSheet) {
          expect(frame.width).toBe(480);
          expect(frame.height).toBe(270);
          expect((await stat(frame.path)).size).toBeGreaterThan(0);
        }
      },
      240_000,
    );
  });
});
