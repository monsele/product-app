/**
 * ST-094 — automated MP4 encoding checks.
 *
 * The full-length clips are produced by `scripts/render-style-proof.mjs`, which
 * nothing in CI runs. This suite is the automated half of the story's required
 * "real Remotion MP4 tests with FFprobe checks": it encodes a short range of
 * each style through the same `renderMedia` path and profile the script uses,
 * then probes the result.
 *
 * A short frame range keeps it affordable while still exercising what a still
 * render cannot: the H.264 encoder, the AAC audio track, the container's
 * reported duration and frame rate, and `enforceAudioTrack`. A regression that
 * silently dropped narration would fail here rather than in a manual run.
 */

import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffprobeStatic from "ffprobe-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  conductionProofFixtures,
  styleProofCompositionIds,
} from "./index.js";

const execFileAsync = promisify(execFile);
const packIds = ["essential", "editorial", "everyday"] as const;

/** 2 seconds: inside the first scene, so narration audio is present. */
const FRAME_RANGE: [number, number] = [0, 59];
const EXPECTED_DURATION_SECONDS = 2;

let serveUrl: string;
let browserExecutable: string;
let workingDirectory: string;

beforeAll(async () => {
  serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../../dist/style-proof/remotion-root.js", import.meta.url),
    ),
  });
  browserExecutable = chromium.executablePath();
  workingDirectory = await mkdtemp(join(tmpdir(), "st094-media-"));
}, 600_000);

afterAll(async () => {
  if (workingDirectory !== undefined)
    await rm(workingDirectory, { force: true, recursive: true });
});

type Probe = Readonly<{
  audioCodec: string | undefined;
  audioDurationSeconds: number | undefined;
  durationSeconds: number;
  fps: number;
  height: number | undefined;
  pixelFormat: string | undefined;
  videoCodec: string | undefined;
  width: number | undefined;
}>;

async function probe(path: string): Promise<Probe> {
  if (ffprobeStatic.path === null)
    throw new Error("FFprobe is unavailable on this machine.");
  const { stdout } = await execFileAsync(ffprobeStatic.path, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ]);
  const parsed = JSON.parse(stdout) as {
    format: { duration: string };
    streams: readonly {
      avg_frame_rate?: string;
      codec_name: string;
      codec_type: string;
      duration?: string;
      height?: number;
      pix_fmt?: string;
      width?: number;
    }[];
  };
  const video = parsed.streams.find((s) => s.codec_type === "video");
  const audio = parsed.streams.find((s) => s.codec_type === "audio");
  const [numerator, denominator = "1"] = (video?.avg_frame_rate ?? "0/1").split(
    "/",
  );
  return {
    audioCodec: audio?.codec_name,
    audioDurationSeconds:
      audio?.duration === undefined ? undefined : Number(audio.duration),
    durationSeconds: Number(parsed.format.duration),
    fps: Number(numerator) / Number(denominator),
    height: video?.height,
    pixelFormat: video?.pix_fmt,
    videoCodec: video?.codec_name,
    width: video?.width,
  };
}

async function encode(
  packId: (typeof packIds)[number],
  outputName: string,
): Promise<string> {
  const props = conductionProofFixtures[packId];
  const composition = await selectComposition({
    browserExecutable,
    id: styleProofCompositionIds[packId],
    inputProps: props,
    serveUrl,
  });
  const outputPath = join(workingDirectory, outputName);
  await renderMedia({
    audioCodec: "aac",
    browserExecutable,
    codec: "h264",
    composition,
    enforceAudioTrack: true,
    frameRange: FRAME_RANGE,
    inputProps: props,
    outputLocation: outputPath,
    pixelFormat: "yuv420p",
    serveUrl,
    x264Preset: "veryfast",
  });
  return outputPath;
}

describe("style proof MP4 encoding", () => {
  it.each(packIds)(
    "encodes %s at the pinned profile with an audio track",
    async (packId) => {
      const outputPath = await encode(packId, `${packId}.mp4`);
      const probed = await probe(outputPath);

      expect(probed.videoCodec).toBe("h264");
      expect(probed.width).toBe(1920);
      expect(probed.height).toBe(1080);
      // The encoder is asked for `yuv420p` and emits full-range 4:2:0, which
      // FFmpeg tags `yuvj420p` (`color_range: pc`). The existing `mvp-default`
      // baseline render probes identically, so this is the repository's normal
      // output rather than something the proof introduced. Asserting the
      // family keeps the check meaningful without encoding a false expectation.
      expect(["yuv420p", "yuvj420p"]).toContain(probed.pixelFormat);
      expect(probed.fps).toBeCloseTo(30, 2);

      // Audio presence is the check a still render can never make, and the one
      // most likely to regress silently.
      expect(probed.audioCodec).toBe("aac");
      expect(probed.audioDurationSeconds).toBeGreaterThan(
        EXPECTED_DURATION_SECONDS - 0.2,
      );

      expect(probed.durationSeconds).toBeGreaterThan(
        EXPECTED_DURATION_SECONDS - 0.2,
      );
      expect(probed.durationSeconds).toBeLessThan(
        EXPECTED_DURATION_SECONDS + 0.2,
      );
      expect((await stat(outputPath)).size).toBeGreaterThan(1_000);
    },
    600_000,
  );

  it(
    "refuses to encode a composition its preflight blocks",
    async () => {
      const props = conductionProofFixtures.editorial;
      const sceneId = props.scenes[0]!.id;
      const broken = {
        ...props,
        selection: {
          ...props.selection,
          sceneDesigns: {
            ...props.selection.sceneDesigns,
            [sceneId]: {
              ...props.selection.sceneDesigns[sceneId]!,
              assetBySlot: {},
            },
          },
        },
      };
      const composition = await selectComposition({
        browserExecutable,
        id: styleProofCompositionIds.editorial,
        inputProps: broken,
        serveUrl,
      });
      await expect(
        renderMedia({
          audioCodec: "aac",
          browserExecutable,
          codec: "h264",
          composition,
          enforceAudioTrack: true,
          frameRange: FRAME_RANGE,
          inputProps: broken,
          outputLocation: join(workingDirectory, "blocked.mp4"),
          pixelFormat: "yuv420p",
          serveUrl,
        }),
      ).rejects.toThrow(/render blocked/i);
    },
    600_000,
  );
});
