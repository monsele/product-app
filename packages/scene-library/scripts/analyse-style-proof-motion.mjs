/**
 * ST-094 — motion-only excerpt evidence for AC11.
 *
 * AC11 asks whether a reviewer who has not seen the style boards can attribute
 * short muted mid-clip excerpts to the correct style *by movement alone*. That
 * is a human judgement, and this script does not make it. What it does:
 *
 * 1. Renders a muted 1.5-second MP4 per pack per interval (entrance,
 *    explanation, exit) into `artifacts/st-094/excerpts/`, and writes
 *    `excerpts.json` describing them **without naming the pack in the
 *    filename**, so the review can be run blind. The key that maps excerpt IDs
 *    back to packs is written separately to `excerpt-key.json`. The clips are
 *    muted at the encoder, so a reviewer cannot be cued by narration.
 *
 * 2. Computes a motion descriptor per excerpt from consecutive frames, after
 *    discarding everything a single frame could reveal: frames are converted to
 *    per-pixel absolute inter-frame difference, so palette, typography and
 *    imagery cancel out and only movement remains. The descriptor records how
 *    much of the canvas moves, where, and whether the moving region is a
 *    travelling edge (a mask wipe), a broad area (a drift) or a compact blob
 *    (an object settling).
 *
 * The descriptor is supporting evidence that the packs *are* distinguishable in
 * motion. It is not a claim that a human made the attribution.
 *
 * Usage: pnpm --filter @avlp/scene-library run analyse:style-proof-motion
 */

import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const packIds = ["essential", "editorial", "everyday"];
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outputDir = join(repoRoot, "artifacts", "st-094");
const excerptDir = join(outputDir, "excerpts");
await mkdir(excerptDir, { recursive: true });

const proof = await import("../dist/style-proof/index.js");
const browserExecutable = chromium.executablePath();
const log = (message) => process.stdout.write(`${message}\n`);

log("Bundling the proof composition…");
const serveUrl = await bundle({
  entryPoint: fileURLToPath(
    new URL("../dist/style-proof/remotion-root.js", import.meta.url),
  ),
});

/** Grayscale inter-frame difference: everything static cancels to zero. */
function motionField(previous, next) {
  const a = PNG.sync.read(previous);
  const b = PNG.sync.read(next);
  const field = new Uint8Array(a.width * a.height);
  for (let i = 0, p = 0; i < a.data.length; i += 4, p++) {
    const delta =
      (Math.abs(a.data[i] - b.data[i]) +
        Math.abs(a.data[i + 1] - b.data[i + 1]) +
        Math.abs(a.data[i + 2] - b.data[i + 2])) /
      3;
    field[p] = Math.min(255, Math.round(delta));
  }
  return { field, height: a.height, width: a.width };
}

/**
 * Describes *where* and *how* the canvas is moving.
 *
 * - `movingFraction`: share of pixels that changed at all.
 * - `columnConcentration` / `rowConcentration`: share of the total movement
 *   falling in the busiest 5% of columns / rows. A travelling clip edge is
 *   concentrated in a narrow column band; a whole-image drift is not.
 * - `clusterCount`: connected regions of movement, at a coarse 16px grid. An
 *   object settling produces a few compact clusters; a drift produces one very
 *   large one; a staged mask wipe produces several narrow ones.
 * - `meanMagnitude`: average change across moving pixels.
 */
function describeMotion({ field, height, width }) {
  const threshold = 12;
  const columns = new Float64Array(width);
  const rows = new Float64Array(height);
  let moving = 0;
  let total = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = field[y * width + x];
      if (value <= threshold) continue;
      moving += 1;
      total += value;
      columns[x] += value;
      rows[y] += value;
    }
  const concentration = (buckets) => {
    const sorted = [...buckets].sort((left, right) => right - left);
    const top = Math.max(1, Math.round(sorted.length * 0.05));
    const sum = sorted.reduce((accumulator, value) => accumulator + value, 0);
    if (sum === 0) return 0;
    return (
      sorted.slice(0, top).reduce((accumulator, value) => accumulator + value, 0) /
      sum
    );
  };
  // Coarse connected-component count on a 16px grid.
  const cellSize = 16;
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const occupied = new Uint8Array(gridWidth * gridHeight);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (field[y * width + x] > threshold)
        occupied[Math.floor(y / cellSize) * gridWidth + Math.floor(x / cellSize)] = 1;
  const seen = new Uint8Array(occupied.length);
  let clusterCount = 0;
  let largestCluster = 0;
  for (let index = 0; index < occupied.length; index++) {
    if (occupied[index] === 0 || seen[index] === 1) continue;
    clusterCount += 1;
    let size = 0;
    const stack = [index];
    seen[index] = 1;
    while (stack.length > 0) {
      const current = stack.pop();
      size += 1;
      const cx = current % gridWidth;
      const cy = Math.floor(current / gridWidth);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gridWidth || ny >= gridHeight) continue;
        const neighbour = ny * gridWidth + nx;
        if (occupied[neighbour] === 1 && seen[neighbour] === 0) {
          seen[neighbour] = 1;
          stack.push(neighbour);
        }
      }
    }
    largestCluster = Math.max(largestCluster, size);
  }
  const occupiedCells = occupied.reduce((sum, value) => sum + value, 0);
  return {
    clusterCount,
    columnConcentration: Number(concentration(columns).toFixed(4)),
    largestClusterShare:
      occupiedCells === 0
        ? 0
        : Number((largestCluster / occupiedCells).toFixed(4)),
    meanMagnitude: moving === 0 ? 0 : Number((total / moving).toFixed(2)),
    movingFraction: Number((moving / (width * height)).toFixed(5)),
    rowConcentration: Number(concentration(rows).toFixed(4)),
  };
}

const excerpts = [];
const key = [];
let excerptIndex = 0;

for (const packId of packIds) {
  const props = proof.conductionProofFixtures[packId];
  const composition = await selectComposition({
    browserExecutable,
    id: proof.styleProofCompositionIds[packId],
    inputProps: props,
    serveUrl,
  });
  const timeline = proof.styleProofTimeline(props.scenes);
  for (const scene of props.scenes) {
    const segment = timeline.find((entry) => entry.sceneId === scene.id);
    const intervals = proof.getStyleProofIntervals(
      scene.durationSeconds,
      props.motion,
    );
    const windows = [
      { name: "entrance", start: 2 },
      {
        name: "explanation",
        start: Math.floor(
          (intervals.entranceEndFrame + intervals.holdStartFrame) / 2,
        ),
      },
      { name: "exit", start: intervals.exitStartFrame + 2 },
    ];
    for (const window of windows) {
      excerptIndex += 1;
      const excerptId = `excerpt-${String(excerptIndex).padStart(2, "0")}`;
      // A 1.5-second window: what "a short excerpt" actually means to a
      // reviewer. Sampling adjacent frames instead would have measured
      // per-frame deltas, which under-read a slow continuous drift to near
      // zero even though it is plainly visible over a second.
      const windowFrames = 45;
      const windowStart = Math.min(
        segment.startFrame + window.start,
        segment.endFrameExclusive - windowFrames - 1,
      );
      await renderMedia({
        browserExecutable,
        codec: "h264",
        composition,
        frameRange: [windowStart, windowStart + windowFrames - 1],
        inputProps: props,
        muted: true,
        outputLocation: join(excerptDir, `${excerptId}.mp4`),
        pixelFormat: "yuv420p",
        serveUrl,
        x264Preset: "veryfast",
      });
      const frames = [0, 15, 30, 44].map((offset) => windowStart + offset);
      const buffers = [];
      for (const [position, frame] of frames.entries()) {
        const still = await renderStill({
          browserExecutable,
          composition,
          frame,
          imageFormat: "png",
          inputProps: props,
          serveUrl,
        });
        buffers.push(still.buffer);
        await writeFile(
          join(excerptDir, `${excerptId}-${position}.png`),
          still.buffer,
        );
      }
      const descriptors = [];
      for (let i = 1; i < buffers.length; i++)
        descriptors.push(describeMotion(motionField(buffers[i - 1], buffers[i])));
      const average = (pick) =>
        Number(
          (
            descriptors.reduce((sum, entry) => sum + pick(entry), 0) /
            descriptors.length
          ).toFixed(4),
        );
      excerpts.push({
        excerptId,
        frames,
        interval: window.name,
        motion: {
          clusterCount: average((entry) => entry.clusterCount),
          columnConcentration: average((entry) => entry.columnConcentration),
          largestClusterShare: average((entry) => entry.largestClusterShare),
          meanMagnitude: average((entry) => entry.meanMagnitude),
          movingFraction: average((entry) => entry.movingFraction),
          rowConcentration: average((entry) => entry.rowConcentration),
        },
        sceneType: scene.template,
      });
      key.push({ excerptId, interval: window.name, packId, sceneType: scene.template });
      log(`  ${excerptId} (${packId} ${scene.template} ${window.name}) done`);
    }
  }
}

await writeFile(
  join(outputDir, "excerpts.json"),
  `${JSON.stringify(
    {
      note: "Excerpt IDs do not name their pack. Review muted, using movement only, then check excerpt-key.json.",
      excerpts,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await writeFile(
  join(outputDir, "excerpt-key.json"),
  `${JSON.stringify({ key }, null, 2)}\n`,
  "utf8",
);
log(`\n${excerpts.length} excerpts written to ${excerptDir}`);
