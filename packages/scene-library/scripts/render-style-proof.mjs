/**
 * ST-094 — renders the proof evidence and measures it.
 *
 * Produces, into `artifacts/st-094/` at the repository root:
 *
 * - three complete H.264/AAC MP4s of the primary lesson, one per style,
 * - a 3x3 contact sheet PNG (rows = scene, columns = style),
 * - a short second-subject MP4 for the reuse evidence,
 * - one immutable manifest JSON per clip,
 * - `measurements.json`: duration, wall-clock render time, peak renderer RSS,
 *   asset bytes and layout-preflight time, alongside the same measurements for
 *   an equal-length range of the existing `mvp-default` composition,
 * - `ffprobe.json`: the postflight probe of every MP4.
 *
 * Nothing here is committed by default; `artifacts/` is git-ignored.
 *
 * Usage:
 *   pnpm --filter @avlp/scene-library run render:style-proof
 *   pnpm --filter @avlp/scene-library run render:style-proof -- --skip-baseline
 */

import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffprobeStatic from "ffprobe-static";
import { PNG } from "pngjs";

const execFileAsync = promisify(execFile);
const packIds = ["essential", "editorial", "everyday"];
const skipBaseline = process.argv.includes("--skip-baseline");

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputDir = join(repoRoot, "artifacts", "st-094");
await mkdir(outputDir, { recursive: true });

const proof = await import("../dist/style-proof/index.js");
const { startHarnessServer } = await import(
  "../dist/style-proof/harness-server.js"
);
// Node-only: imports `node:crypto`, so it is not part of the browser-safe
// `style-proof` surface the development gallery consumes.
const { buildStyleProofManifest } = await import(
  "../dist/style-proof/manifest.js"
);

const browserExecutable = chromium.executablePath();
const log = (message) => process.stdout.write(`${message}\n`);

/** Peak resident set size of the renderer's child processes, sampled while a
 * render runs. Reported as evidence, not enforced as a budget. */
function trackPeakMemory() {
  let peak = process.memoryUsage().rss;
  const timer = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 250);
  return {
    stop: () => {
      clearInterval(timer);
      return peak;
    },
  };
}

async function probe(path) {
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
  const parsed = JSON.parse(stdout);
  const video = parsed.streams.find((s) => s.codec_type === "video");
  const audio = parsed.streams.find((s) => s.codec_type === "audio");
  const [num, den = "1"] = (video?.avg_frame_rate ?? "0/1").split("/");
  return {
    audioCodec: audio?.codec_name ?? null,
    audioDurationSeconds:
      audio?.duration === undefined ? null : Number(audio.duration),
    durationSeconds: Number(parsed.format.duration),
    fps: Number(num) / Number(den),
    height: video?.height ?? null,
    sizeBytes: Number(parsed.format.size),
    videoCodec: video?.codec_name ?? null,
    width: video?.width ?? null,
  };
}

function assertProfile(label, probed, expectedSeconds) {
  const problems = [];
  if (probed.videoCodec !== "h264") problems.push(`video codec ${probed.videoCodec}`);
  if (probed.audioCodec !== "aac") problems.push(`audio codec ${probed.audioCodec}`);
  if (probed.width !== 1920 || probed.height !== 1080)
    problems.push(`${probed.width}x${probed.height}`);
  if (Math.abs(probed.fps - 30) > 0.01) problems.push(`fps ${probed.fps}`);
  if (Math.abs(probed.durationSeconds - expectedSeconds) > 0.2)
    problems.push(
      `duration ${probed.durationSeconds}s, expected ${expectedSeconds}s`,
    );
  if (probed.audioDurationSeconds === null)
    problems.push("no audio stream duration");
  if (problems.length > 0)
    throw new Error(`${label} failed its postflight: ${problems.join("; ")}`);
}

log("Bundling the proof composition…");
const serveUrl = await bundle({
  entryPoint: fileURLToPath(
    new URL("../dist/style-proof/remotion-root.js", import.meta.url),
  ),
});

const measurements = { baseline: null, clips: [], contactSheet: null };
const probes = {};

// ---------------------------------------------------------------------------
// Layout preflight timing (AC9) — the browser measurement pass, timed.
// ---------------------------------------------------------------------------

log("Bundling the layout harness…");
const harnessBundle = await bundle({
  ignoreRegisterRootWarning: true,
  entryPoint: fileURLToPath(
    new URL("../dist/style-proof/layout-harness.js", import.meta.url),
  ),
  webpackOverride: (config) => ({
    ...config,
    output: { ...config.output, filename: "harness.js" },
  }),
});
const harness = await startHarnessServer(harnessBundle);
const previewBrowser = await chromium.launch({ headless: true });

async function preflight(props) {
  const page = await previewBrowser.newPage();
  const started = performance.now();
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(harness.origin);
    for (const scene of props.scenes) {
      const intervals = proof.getStyleProofIntervals(
        scene.durationSeconds,
        props.motion,
      );
      await page.evaluate(
        ([payload, sceneId, frame]) =>
          window.renderStyleProofScene(payload, sceneId, frame),
        [props, scene.id, intervals.holdStartFrame],
      );
      await page.waitForSelector("[data-proof-ready='true']", {
        timeout: 60_000,
      });
    }
    return Math.round(performance.now() - started);
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// The three primary clips
// ---------------------------------------------------------------------------

for (const packId of packIds) {
  const props = proof.conductionProofFixtures[packId];
  const prepared = proof.prepareStyleProofComposition(props);
  if (prepared.props === undefined)
    throw new Error(
      `${packId} failed preflight: ${prepared.issues
        .map((issue) => `${issue.code} at ${issue.fieldPath}`)
        .join(", ")}`,
    );

  const preflightMs = await preflight(props);
  const outputPath = join(outputDir, `conduction-${packId}.mp4`);
  const composition = await selectComposition({
    browserExecutable,
    id: proof.styleProofCompositionIds[packId],
    inputProps: props,
    serveUrl,
  });
  log(`Rendering ${packId} (${composition.durationInFrames} frames)…`);
  const memory = trackPeakMemory();
  const started = performance.now();
  await renderMedia({
    audioCodec: "aac",
    browserExecutable,
    codec: "h264",
    composition,
    enforceAudioTrack: true,
    inputProps: props,
    outputLocation: outputPath,
    pixelFormat: "yuv420p",
    serveUrl,
    x264Preset: "veryfast",
  });
  const wallClockMs = Math.round(performance.now() - started);
  const peakRssBytes = memory.stop();

  const probed = await probe(outputPath);
  assertProfile(
    `conduction-${packId}.mp4`,
    probed,
    composition.durationInFrames / composition.fps,
  );
  probes[`conduction-${packId}.mp4`] = probed;

  const manifest = buildStyleProofManifest(props);
  await writeFile(
    join(outputDir, `conduction-${packId}.manifest.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  const assetBytes = Object.keys(props.assets).reduce(
    (total, assetId) => total + (proof.styleProofAssetBytes[assetId] ?? 0),
    0,
  );
  measurements.clips.push({
    assetBytes,
    durationSeconds: composition.durationInFrames / composition.fps,
    fixtureId: props.fixtureId,
    frames: composition.durationInFrames,
    layoutPreflightMs: preflightMs,
    msPerFrame: Number((wallClockMs / composition.durationInFrames).toFixed(1)),
    outputBytes: probed.sizeBytes,
    outputSha256: createHash("sha256")
      .update(await readFile(outputPath))
      .digest("hex"),
    packId,
    peakRssBytes,
    resolvedInputSha256: manifest.resolvedInputSha256,
    wallClockMs,
  });
  log(
    `  ${packId}: ${wallClockMs}ms, ${(probed.sizeBytes / 1024 / 1024).toFixed(2)} MiB, preflight ${preflightMs}ms`,
  );
}

// ---------------------------------------------------------------------------
// Second-subject reuse evidence
// ---------------------------------------------------------------------------

{
  const packId = "everyday";
  const props = proof.leafProofFixtures[packId];
  const outputPath = join(outputDir, `leaf-${packId}.mp4`);
  const composition = await selectComposition({
    browserExecutable,
    id: `StyleProofLeaf${packId[0].toUpperCase()}${packId.slice(1)}`,
    inputProps: props,
    serveUrl,
  });
  log(`Rendering second subject (${packId})…`);
  const started = performance.now();
  await renderMedia({
    audioCodec: "aac",
    browserExecutable,
    codec: "h264",
    composition,
    enforceAudioTrack: true,
    inputProps: props,
    outputLocation: outputPath,
    pixelFormat: "yuv420p",
    serveUrl,
    x264Preset: "veryfast",
  });
  const probed = await probe(outputPath);
  assertProfile(
    `leaf-${packId}.mp4`,
    probed,
    composition.durationInFrames / composition.fps,
  );
  probes[`leaf-${packId}.mp4`] = probed;
  measurements.clips.push({
    durationSeconds: composition.durationInFrames / composition.fps,
    fixtureId: props.fixtureId,
    frames: composition.durationInFrames,
    outputBytes: probed.sizeBytes,
    packId,
    wallClockMs: Math.round(performance.now() - started),
  });
}

// ---------------------------------------------------------------------------
// 3x3 contact sheet — rows are scenes, columns are styles
// ---------------------------------------------------------------------------

log("Rendering the 3x3 contact sheet…");
const cellWidth = 640;
const cellHeight = 360;
const sheet = new PNG({ width: cellWidth * 3, height: cellHeight * 3 });
const contactSheetStarted = performance.now();
const sceneOrder = proof.conductionScenes.map((scene) => scene.id);

for (const [column, packId] of packIds.entries()) {
  const props = proof.conductionProofFixtures[packId];
  const composition = await selectComposition({
    browserExecutable,
    id: proof.styleProofCompositionIds[packId],
    inputProps: props,
    serveUrl,
  });
  const timeline = proof.styleProofTimeline(props.scenes);
  for (const [row, sceneId] of sceneOrder.entries()) {
    const segment = timeline.find((entry) => entry.sceneId === sceneId);
    const scene = props.scenes.find((entry) => entry.id === sceneId);
    const intervals = proof.getStyleProofIntervals(
      scene.durationSeconds,
      props.motion,
    );
    // The hold frame: fully settled, every required element readable. This is
    // the frame a paused reviewer is asked to judge.
    const frame = segment.startFrame + intervals.holdStartFrame;
    const still = await renderStill({
      browserExecutable,
      composition,
      frame,
      imageFormat: "png",
      inputProps: props,
      serveUrl,
    });
    await writeFile(
      join(outputDir, `frame-${packId}-${scene.template}.png`),
      still.buffer,
    );
    const source = PNG.sync.read(still.buffer);
    // Nearest-neighbour box downscale; deterministic and dependency-free.
    for (let y = 0; y < cellHeight; y++)
      for (let x = 0; x < cellWidth; x++) {
        const sourceIndex =
          (Math.floor((y * source.height) / cellHeight) * source.width +
            Math.floor((x * source.width) / cellWidth)) *
          4;
        const targetIndex =
          ((row * cellHeight + y) * sheet.width + column * cellWidth + x) * 4;
        for (let channel = 0; channel < 4; channel++)
          sheet.data[targetIndex + channel] = source.data[sourceIndex + channel];
      }
  }
}

const contactSheetPath = join(outputDir, "contact-sheet.png");
await writeFile(contactSheetPath, PNG.sync.write(sheet));
measurements.contactSheet = {
  bytes: (await stat(contactSheetPath)).size,
  columns: packIds,
  rows: proof.conductionScenes.map((scene) => scene.template),
  wallClockMs: Math.round(performance.now() - contactSheetStarted),
};

await previewBrowser.close();
await harness.close();

// ---------------------------------------------------------------------------
// mvp-default baseline, over an equal-length frame range (AC9)
// ---------------------------------------------------------------------------

if (!skipBaseline) {
  log("Rendering the mvp-default baseline range…");
  const productionServeUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../dist/remotion-root.js", import.meta.url),
    ),
  });
  const production = await import("../dist/index.js");
  const { fullLessonRuntimeCompositionId, photosynthesisThreeMinutePreview } =
    production;
  const composition = await selectComposition({
    browserExecutable,
    id: fullLessonRuntimeCompositionId,
    inputProps: photosynthesisThreeMinutePreview,
    serveUrl: productionServeUrl,
  });
  const outputPath = join(outputDir, "baseline-mvp-default.mp4");
  const memory = trackPeakMemory();
  const started = performance.now();
  await renderMedia({
    audioCodec: "aac",
    browserExecutable,
    codec: "h264",
    composition,
    enforceAudioTrack: true,
    // The same 840 frames as a proof clip, so ms/frame is comparable.
    frameRange: [0, 839],
    inputProps: photosynthesisThreeMinutePreview,
    outputLocation: outputPath,
    pixelFormat: "yuv420p",
    serveUrl: productionServeUrl,
    x264Preset: "veryfast",
  });
  const wallClockMs = Math.round(performance.now() - started);
  const peakRssBytes = memory.stop();
  const probed = await probe(outputPath);
  probes["baseline-mvp-default.mp4"] = probed;
  measurements.baseline = {
    compositionId: fullLessonRuntimeCompositionId,
    frames: 840,
    msPerFrame: Number((wallClockMs / 840).toFixed(1)),
    outputBytes: probed.sizeBytes,
    peakRssBytes,
    wallClockMs,
  };
  log(`  baseline: ${wallClockMs}ms`);
}

await writeFile(
  join(outputDir, "measurements.json"),
  `${JSON.stringify(measurements, null, 2)}\n`,
  "utf8",
);
await writeFile(
  join(outputDir, "ffprobe.json"),
  `${JSON.stringify(probes, null, 2)}\n`,
  "utf8",
);
log(`\nEvidence written to ${outputDir}`);
