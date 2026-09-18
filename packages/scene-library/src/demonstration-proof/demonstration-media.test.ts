/**
 * ST-095 — actual encoding, FFprobe postflight, and browser/server parity.
 *
 * These run real Remotion renders rather than asserting about the composition
 * tree. Short ranges keep the suite affordable in CI while still exercising the
 * whole path: bundle, font gate, recipe, sequence, audio, encoder. A dropped
 * audio track or a silently substituted font fails here, not only in the
 * evidence script that CI never runs.
 *
 * The parity comparison and its tolerance are registered before any result is
 * looked at, per CR-08, and are not loosened afterwards.
 */

import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffprobeStatic from "ffprobe-static";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarnessServer, type HarnessServer } from "./harness-server.js";
import {
  demonstrationCompositionIds,
  demonstrationTimeline,
  prepareDemonstrationComposition,
} from "./composition.js";
import {
  evaporationDemonstrationFixture,
  savingsDemonstrationFixture,
} from "./fixtures.js";

const execFileAsync = promisify(execFile);
const browserExecutable = chromium.executablePath();

/**
 * Registered before evaluation (CR-08).
 *
 * The browser harness and the Remotion server render use the same components
 * and the same font gate, so the only expected difference is sub-pixel
 * rasterisation. A mean absolute channel difference above this would mean the
 * two paths are genuinely drawing different things.
 */
const PARITY_TOLERANCE_MEAN_ABS_DIFF = 3.5;

let serveUrl: string;
let harnessUrl: string;
let harness: HarnessServer;
let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "st-095-media-"));
  serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../../dist/demonstration-proof/remotion-root.js", import.meta.url),
    ),
  });
  const harnessBundle = await bundle({
    entryPoint: fileURLToPath(
      new URL("../../dist/demonstration-proof/layout-harness.js", import.meta.url),
    ),
    ignoreRegisterRootWarning: true,
    webpackOverride: (config) => ({
      ...config,
      output: { ...config.output, filename: "harness.js" },
    }),
  });
  harness = await startHarnessServer(harnessBundle);
  harnessUrl = harness.origin;
}, 600_000);

afterAll(async () => {
  await harness?.close();
  await rm(workDir, { force: true, recursive: true });
});

async function probe(path: string) {
  if (ffprobeStatic.path === null) throw new Error("FFprobe is unavailable.");
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
    streams: readonly Record<string, unknown>[];
  };
  const video = parsed.streams.find((entry) => entry.codec_type === "video");
  const audio = parsed.streams.find((entry) => entry.codec_type === "audio");
  const [num, den = "1"] = String(video?.avg_frame_rate ?? "0/1").split("/");
  return {
    audioCodec: audio?.codec_name ?? null,
    durationSeconds: Number(parsed.format.duration),
    fps: Number(num) / Number(den),
    height: video?.height ?? null,
    videoCodec: video?.codec_name ?? null,
    width: video?.width ?? null,
  };
}

const cases = [
  {
    compositionId: demonstrationCompositionIds.savingsDemonstration,
    name: "savings demonstration",
    props: savingsDemonstrationFixture,
  },
  {
    compositionId: demonstrationCompositionIds.evaporationDemonstration,
    name: "evaporation demonstration",
    props: evaporationDemonstrationFixture,
  },
] as const;

describe("encoded output", () => {
  it.each(cases)(
    "$name encodes h264/aac at 1920x1080@30 with a real audio track",
    async ({ compositionId, props }) => {
      const output = join(workDir, `${compositionId}.mp4`);
      const composition = await selectComposition({
        browserExecutable,
        id: compositionId,
        inputProps: props,
        serveUrl,
      });
      await renderMedia({
        audioCodec: "aac",
        browserExecutable,
        codec: "h264",
        composition,
        enforceAudioTrack: true,
        // Two seconds is enough to prove the whole encoding path; the full
        // clips are produced by the evidence script.
        frameRange: [0, 59],
        inputProps: props,
        outputLocation: output,
        pixelFormat: "yuv420p",
        serveUrl,
        x264Preset: "veryfast",
      });
      const probed = await probe(output);
      expect(probed.videoCodec).toBe("h264");
      expect(probed.audioCodec).toBe("aac");
      expect(probed.width).toBe(1920);
      expect(probed.height).toBe(1080);
      expect(probed.fps).toBeCloseTo(30, 1);
      expect(probed.durationSeconds).toBeGreaterThan(1.9);
    },
    600_000,
  );

  it("refuses to encode a composition that fails preflight", async () => {
    const broken = {
      ...savingsDemonstrationFixture,
      captions: [
        {
          ...savingsDemonstrationFixture.captions[0]!,
          endFrame: 99_999,
          startFrame: 99_000,
        },
      ],
    };
    expect(prepareDemonstrationComposition(broken).props).toBeUndefined();
    await expect(
      selectComposition({
        browserExecutable,
        id: demonstrationCompositionIds.savingsDemonstration,
        inputProps: broken,
        serveUrl,
      }).then((composition) =>
        renderMedia({
          audioCodec: "aac",
          browserExecutable,
          codec: "h264",
          composition,
          frameRange: [0, 5],
          inputProps: broken,
          outputLocation: join(workDir, "blocked.mp4"),
          pixelFormat: "yuv420p",
          serveUrl,
        }),
      ),
    ).rejects.toThrow(/Demonstration render blocked/);
  }, 600_000);
});

describe("browser and server agree", () => {
  it.each(cases)(
    "$name draws the same hold frame in both paths",
    async ({ compositionId, props }) => {
      const segment = demonstrationTimeline(props.scenes)[1]!;
      const frame = segment.endFrameExclusive - 20;

      const composition = await selectComposition({
        browserExecutable,
        id: compositionId,
        inputProps: props,
        serveUrl,
      });
      const serverPath = join(workDir, `${compositionId}-server.png`);
      await renderStill({
        browserExecutable,
        composition,
        frame,
        imageFormat: "png",
        inputProps: props,
        output: serverPath,
        serveUrl,
      });

      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setViewportSize({ height: 1080, width: 1920 });
        await page.goto(harnessUrl);
        await page.evaluate(
          ([payload, at]) =>
            window.renderDemonstrationClip(payload, at as number),
          [props, frame] as [unknown, number],
        );
        await page.waitForSelector("[data-demo-ready='true']", {
          timeout: 60_000,
        });
        const shot = await page.screenshot({ type: "png" });

        const left = PNG.sync.read(await readFile(serverPath));
        const right = PNG.sync.read(shot);
        expect(right.width).toBe(left.width);
        expect(right.height).toBe(left.height);
        let total = 0;
        for (let index = 0; index < left.data.length; index += 4)
          for (let channel = 0; channel < 3; channel++)
            total += Math.abs(
              left.data[index + channel]! - right.data[index + channel]!,
            );
        const meanAbsoluteDifference =
          total / ((left.data.length / 4) * 3);
        expect(meanAbsoluteDifference).toBeLessThan(
          PARITY_TOLERANCE_MEAN_ABS_DIFF,
        );
      } finally {
        await browser.close();
      }
    },
    600_000,
  );

  it.each(cases)(
    "$name renders a frame identically when asked twice, out of order",
    async ({ compositionId, props }) => {
      const composition = await selectComposition({
        browserExecutable,
        id: compositionId,
        inputProps: props,
        serveUrl,
      });
      const segment = demonstrationTimeline(props.scenes)[0]!;
      const target = segment.endFrameExclusive - 30;
      const later = segment.endFrameExclusive - 10;

      const first = join(workDir, `${compositionId}-a.png`);
      const second = join(workDir, `${compositionId}-b.png`);
      const decoy = join(workDir, `${compositionId}-decoy.png`);
      const still = (frame: number, output: string) =>
        renderStill({
          browserExecutable,
          composition,
          frame,
          imageFormat: "png",
          inputProps: props,
          output,
          serveUrl,
        });

      await still(target, first);
      // Render a later frame in between, then come back: a runtime that had
      // become history-dependent would not reproduce the earlier frame.
      await still(later, decoy);
      await still(target, second);

      expect(await readFile(second)).toEqual(await readFile(first));
    },
    600_000,
  );
});
