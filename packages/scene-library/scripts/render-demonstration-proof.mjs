/**
 * ST-095 — renders the demonstration proof evidence and measures it.
 *
 * Produces, into `artifacts/st-095/` at the repository root:
 *
 * - four complete H.264/AAC MP4s: demonstration and standard, for savings and
 *   for evaporation, with matched narration, captions and scene boundaries,
 * - one immutable manifest JSON per demonstration clip,
 * - hold-frame PNGs from every demonstration scene,
 * - `measurements.json`: duration, wall-clock render time, peak renderer RSS,
 *   asset and audio bytes, and the browser layout-preflight time, reported for
 *   both approaches so the comparison is like-for-like,
 * - `ffprobe.json`: the postflight probe of every MP4.
 *
 * Nothing here is committed by default; `artifacts/` is git-ignored.
 *
 * Usage:
 *   pnpm --filter @avlp/scene-library run render:demonstration-proof
 *   pnpm --filter @avlp/scene-library run render:demonstration-proof -- --subject savings
 */

import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffprobeStatic from "ffprobe-static";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const subjectArgument = process.argv.indexOf("--subject");
const onlySubject =
  subjectArgument === -1 ? undefined : process.argv[subjectArgument + 1];

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputDir = join(repoRoot, "artifacts", "st-095");
await mkdir(outputDir, { recursive: true });

const proof = await import("../dist/demonstration-proof/index.js");
const { startHarnessServer } = await import(
  "../dist/demonstration-proof/harness-server.js"
);
// Node-only: imports `node:crypto`, so it is not on the browser-safe surface
// the development gallery consumes.
const { buildDemonstrationManifest } = await import(
  "../dist/demonstration-proof/manifest.js"
);

const remotionVersion = require("remotion/package.json").version;
const browserExecutable = chromium.executablePath();
const log = (message) => process.stdout.write(`${message}\n`);

/** Checksums of the exact font files the bundle serves, for the manifest. */
async function fontChecksums() {
  const files = [
    "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2",
    "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2",
  ];
  const entries = await Promise.all(
    files.map(async (file) => {
      const bytes = await readFile(require.resolve(file));
      return [file, createHash("sha256").update(bytes).digest("hex")];
    }),
  );
  return Object.fromEntries(entries);
}

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
  const video = parsed.streams.find((entry) => entry.codec_type === "video");
  const audio = parsed.streams.find((entry) => entry.codec_type === "audio");
  const [num, den = "1"] = (video?.avg_frame_rate ?? "0/1").split("/");
  return {
    audioCodec: audio?.codec_name ?? null,
    audioDurationSeconds:
      audio?.duration === undefined ? null : Number(audio.duration),
    durationSeconds: Number(parsed.format.duration),
    fps: Number(num) / Number(den),
    height: video?.height ?? null,
    pixelFormat: video?.pix_fmt ?? null,
    sizeBytes: Number(parsed.format.size),
    videoCodec: video?.codec_name ?? null,
    width: video?.width ?? null,
  };
}

/**
 * Postflight (CR-07). A successful encoder exit is not proof of correct
 * content, so every clip is probed and checked against the profile it claims.
 */
function assertProfile(label, probed, expectedSeconds) {
  const problems = [];
  if (probed.videoCodec !== "h264") problems.push(`video codec ${probed.videoCodec}`);
  if (probed.audioCodec !== "aac") problems.push(`audio codec ${probed.audioCodec}`);
  if (probed.width !== 1920 || probed.height !== 1080)
    problems.push(`${probed.width}x${probed.height}`);
  if (Math.abs(probed.fps - 30) > 0.05) problems.push(`${probed.fps} fps`);
  if (Math.abs(probed.durationSeconds - expectedSeconds) > 0.25)
    problems.push(
      `duration ${probed.durationSeconds.toFixed(2)}s vs expected ${expectedSeconds.toFixed(2)}s`,
    );
  if (probed.audioDurationSeconds === null)
    problems.push("no audio stream duration");
  if (problems.length > 0)
    throw new Error(`${label} failed its postflight: ${problems.join("; ")}`);
}

log("Bundling the demonstration composition…");
const serveUrl = await bundle({
  entryPoint: fileURLToPath(
    new URL("../dist/demonstration-proof/remotion-root.js", import.meta.url),
  ),
});

log("Bundling the layout harness…");
const harnessBundle = await bundle({
  ignoreRegisterRootWarning: true,
  entryPoint: fileURLToPath(
    new URL("../dist/demonstration-proof/layout-harness.js", import.meta.url),
  ),
  webpackOverride: (config) => ({
    ...config,
    output: { ...config.output, filename: "harness.js" },
  }),
});
const harness = await startHarnessServer(harnessBundle);
const previewBrowser = await chromium.launch({ headless: true });

/**
 * The browser layout preflight, timed.
 *
 * It samples each scene's last settled frame — the moment everything has
 * arrived and must be readable — and checks that no explanatory object or
 * required text has drifted off canvas or under the caption band.
 */
async function preflight(props) {
  const page = await previewBrowser.newPage();
  const started = performance.now();
  const failures = [];
  try {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(harness.origin);
    const timeline = proof.demonstrationTimeline(props.scenes);
    for (const segment of timeline) {
      const sampleFrame = segment.endFrameExclusive - 20;
      await page.evaluate(
        ([payload, frame]) => window.renderDemonstrationClip(payload, frame),
        [props, sampleFrame],
      );
      await page.waitForSelector("[data-demo-ready='true']", { timeout: 60_000 });
      const problems = await page.evaluate(
        ([exclusion, selector]) => {
          const found = [];
          const nodes = document.querySelectorAll(selector);
          for (const node of nodes) {
            const box = node.getBoundingClientRect();
            const id =
              node.getAttribute("data-demo-object") ??
              node.getAttribute("data-demo-content") ??
              node.getAttribute("data-demo-region") ??
              "unknown";
            if (box.width === 0 || box.height === 0) continue;
            if (box.left < 0 || box.top < 0 || box.right > 1920 || box.bottom > 1080)
              found.push(`${id} leaves the canvas`);
            if (
              box.bottom > exclusion.top &&
              box.right > exclusion.left &&
              box.left < exclusion.right
            )
              found.push(`${id} overlaps the caption band`);
            // Both axes, matching the vitest preflight: a line of text that
            // overflows sideways is as unreadable as one that overflows down.
            if (
              node.scrollHeight > node.clientHeight + 1 ||
              node.scrollWidth > node.clientWidth + 1
            )
              found.push(`${id} overflows its own box`);
          }
          return found;
        },
        [proof.demonstrationCaptionExclusion, proof.demonstrationPreflightSelector],
      );
      for (const problem of problems)
        failures.push(`scene ${segment.sceneId} @${sampleFrame}: ${problem}`);
    }
    return { failures, milliseconds: Math.round(performance.now() - started) };
  } finally {
    await page.close();
  }
}

const subjects = Object.entries(proof.demonstrationSubjects).filter(
  ([name]) => onlySubject === undefined || name === onlySubject,
);

const measurements = { clips: [] };
const probes = {};
const checksums = await fontChecksums();

for (const [subjectName, subject] of subjects) {
  for (const approach of ["demonstration", "standard"]) {
    const isDemonstration = approach === "demonstration";
    const props = isDemonstration
      ? subject.demonstration
      : subject.standard.props;
    const compositionId = isDemonstration
      ? proof.demonstrationCompositionIds[
          subjectName === "savings"
            ? "savingsDemonstration"
            : "evaporationDemonstration"
        ]
      : proof.demonstrationCompositionIds[
          subjectName === "savings" ? "savingsStandard" : "evaporationStandard"
        ];

    let preflightMs = null;
    if (isDemonstration) {
      const prepared = proof.prepareDemonstrationComposition(props);
      if (prepared.props === undefined)
        throw new Error(
          `${subjectName} demonstration failed preflight: ${prepared.issues
            .map((issue) => `${issue.code} at ${issue.fieldPath}`)
            .join(", ")}`,
        );
      const layout = await preflight(props);
      if (layout.failures.length > 0)
        throw new Error(
          `${subjectName} demonstration failed its browser layout preflight:\n  ${layout.failures.join("\n  ")}`,
        );
      preflightMs = layout.milliseconds;
    }

    const outputPath = join(outputDir, `${subjectName}-${approach}.mp4`);
    const composition = await selectComposition({
      browserExecutable,
      id: compositionId,
      inputProps: props,
      serveUrl,
    });
    log(
      `Rendering ${subjectName} ${approach} (${composition.durationInFrames} frames)…`,
    );
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
      `${subjectName}-${approach}.mp4`,
      probed,
      composition.durationInFrames / composition.fps,
    );
    probes[`${subjectName}-${approach}.mp4`] = probed;

    if (isDemonstration) {
      const manifest = buildDemonstrationManifest(props, {
        approach: "demonstration",
        fontChecksums: checksums,
        remotionVersion,
      });
      await writeFile(
        join(outputDir, `${subjectName}-demonstration.manifest.json`),
        `${JSON.stringify(manifest, null, 2)}\n`,
        "utf8",
      );

      // A hold frame from every scene: the moment the movement has finished
      // and the resulting state is what the learner is looking at.
      for (const segment of proof.demonstrationTimeline(props.scenes)) {
        const frame = segment.endFrameExclusive - 20;
        await renderStill({
          browserExecutable,
          composition,
          frame,
          imageFormat: "png",
          inputProps: props,
          output: join(
            outputDir,
            `frame-${subjectName}-scene${props.scenes.findIndex((scene) => scene.id === segment.sceneId) + 1}.png`,
          ),
          serveUrl,
        });
      }
    }

    const fileStat = await stat(outputPath);
    measurements.clips.push({
      approach,
      durationSeconds: composition.durationInFrames / composition.fps,
      frames: composition.durationInFrames,
      millisecondsPerFrame: Number(
        (wallClockMs / composition.durationInFrames).toFixed(2),
      ),
      outputBytes: fileStat.size,
      peakRssBytes,
      preflightMs,
      subject: subjectName,
      wallClockMs,
    });
    log(
      `  ${outputPath} — ${(fileStat.size / 1_048_576).toFixed(2)} MiB, ${(wallClockMs / composition.durationInFrames).toFixed(1)} ms/frame`,
    );
  }
}

await previewBrowser.close();
await harness.close();

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
log(`\nWrote evidence to ${outputDir}`);
