/**
 * ST-094 — motion-signature distinguishability (AC11 supporting evidence).
 *
 * AC11's attribution judgement is a human one and is recorded as pending in
 * `docs/creative-styles-proof-evaluation.md`. This test asserts the mechanical
 * precondition for it: that the three packs' movement differs in ways a single
 * frame could not reveal.
 *
 * Every measurement here runs on the absolute difference between consecutive
 * rendered frames. Palette, typography and imagery are identical between the
 * two frames of a pair, so they cancel to zero and only movement survives — a
 * style cannot pass this by being a different colour.
 */

import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import type { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  conductionProofFixtures,
  getStyleProofIntervals,
  styleProofCompositionIds,
} from "./index.js";

const packIds = ["essential", "editorial", "everyday"] as const;

let serveUrl: string;
let browserExecutable: string;

beforeAll(async () => {
  serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../../dist/style-proof/remotion-root.js", import.meta.url),
    ),
  });
  browserExecutable = chromium.executablePath();
}, 600_000);

async function frameAt(
  packId: (typeof packIds)[number],
  frame: number,
): Promise<Buffer> {
  const props = conductionProofFixtures[packId];
  const composition = await selectComposition({
    browserExecutable,
    id: styleProofCompositionIds[packId],
    inputProps: props,
    serveUrl,
  });
  const still = await renderStill({
    browserExecutable,
    composition,
    frame,
    imageFormat: "png",
    inputProps: props,
    serveUrl,
  });
  if (still.buffer === null) throw new Error("renderStill returned no buffer.");
  return still.buffer;
}

/** Share of the canvas that changed between two frames, and how spread it is. */
function motionBetween(
  previous: Buffer,
  next: Buffer,
): Readonly<{
  columnConcentration: number;
  movingFraction: number;
}> {
  const a = PNG.sync.read(previous);
  const b = PNG.sync.read(next);
  const columns = new Float64Array(a.width);
  let moving = 0;
  for (let i = 0, p = 0; i < a.data.length; i += 4, p++) {
    const delta =
      (Math.abs(a.data[i]! - b.data[i]!) +
        Math.abs(a.data[i + 1]! - b.data[i + 1]!) +
        Math.abs(a.data[i + 2]! - b.data[i + 2]!)) /
      3;
    if (delta <= 12) continue;
    moving += 1;
    columns[p % a.width]! += delta;
  }
  const sorted = [...columns].sort((left, right) => right - left);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const top = Math.max(1, Math.round(sorted.length * 0.05));
  return {
    columnConcentration:
      total === 0
        ? 0
        : sorted.slice(0, top).reduce((sum, value) => sum + value, 0) / total,
    movingFraction: moving / (a.width * a.height),
  };
}

describe("style proof motion signatures", () => {
  /**
   * Measured on this implementation over a one-second entrance window
   * (frames 6-16 of the hook scene). The ordering, not the exact value, is the
   * claim: a masked edge sweep changes the least canvas and is the most
   * column-concentrated; whole objects travelling change the most canvas and
   * are the least concentrated; a scaling image sits between them.
   *
   *   pack        movingFraction   columnConcentration
   *   essential   0.005            0.43
   *   editorial   0.021            0.23
   *   everyday    0.087            0.13
   */
  it.each([
    ["essential", true] as const,
    ["everyday", true] as const,
    ["editorial", false] as const,
  ])(
    "%s hold is static: %s",
    async (packId, expectedStatic) => {
      const props = conductionProofFixtures[packId];
      const scene = props.scenes.find((entry) => entry.template === "hook")!;
      const intervals = getStyleProofIntervals(
        scene.durationSeconds,
        props.motion,
      );
      const first = await frameAt(packId, intervals.holdStartFrame);
      const later = await frameAt(packId, intervals.holdStartFrame + 30);
      // Essential and Everyday both declare that everything has arrived and
      // stopped; Editorial declares a continuous image push. Byte equality is
      // the exact form of "nothing moved".
      expect(later.equals(first)).toBe(expectedStatic);
      if (!expectedStatic) {
        const motion = motionBetween(first, later);
        // Perceptible, not sub-pixel: an image push a reviewer cannot see
        // would not be a motion signature at all.
        expect(motion.movingFraction).toBeGreaterThan(0.01);
      }
    },
    600_000,
  );

  it(
    "separates the three entrance profiles by movement alone",
    async () => {
      const profiles: Record<string, ReturnType<typeof motionBetween>> = {};
      for (const packId of packIds) {
        const before = await frameAt(packId, 6);
        const after = await frameAt(packId, 16);
        profiles[packId] = motionBetween(before, after);
      }
      const essential = profiles["essential"]!;
      const editorial = profiles["editorial"]!;
      const everyday = profiles["everyday"]!;

      // All three move during their entrance.
      for (const packId of packIds)
        expect(profiles[packId]!.movingFraction, packId).toBeGreaterThan(0.001);

      // How much of the canvas moves separates them, with real headroom.
      expect(editorial.movingFraction).toBeGreaterThan(
        essential.movingFraction * 2,
      );
      expect(everyday.movingFraction).toBeGreaterThan(
        editorial.movingFraction * 2,
      );

      // How the movement is distributed separates them independently: a
      // travelling clip edge concentrates in a narrow column band, a scaling
      // image less so, whole objects settling least of all.
      expect(essential.columnConcentration).toBeGreaterThan(
        editorial.columnConcentration,
      );
      expect(editorial.columnConcentration).toBeGreaterThan(
        everyday.columnConcentration,
      );
    },
    600_000,
  );
});
