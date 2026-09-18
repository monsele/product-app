/**
 * ST-094 — real Remotion rendering, determinism and browser/server parity.
 *
 * Comparison criteria were fixed before any proof output was evaluated, and are
 * not relaxed afterwards (CR-08):
 *
 * - **Repeat determinism:** two server renders of the same frame from the same
 *   pinned inputs must be *byte-identical*. This is an exact assertion; the
 *   renderer, browser and encoder are the same process in the same environment,
 *   so there is nothing here to grant a tolerance to.
 * - **Browser/server parity:** the same frame captured in Chromium via the
 *   layout harness and rendered by `renderStill` must agree within
 *   `PARITY_MEAN_ABS_DIFF` mean absolute per-channel difference and
 *   `PARITY_OUTLIER_FRACTION` of pixels differing by more than
 *   `PARITY_OUTLIER_CHANNEL_DELTA`. A tolerance is required because the two
 *   paths use different compositors and rasterisation settings; static markup
 *   equality would not have tested this at all.
 */

import { chromium, type Browser } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startHarnessServer, type HarnessServer } from "./harness-server.js";
import {
  conductionProofFixtures,
  getStyleProofIntervals,
  styleProofCompositionIds,
  styleProofSceneIds,
  styleProofTimeline,
} from "./index.js";

/** Fixed before evaluating any proof output. */
const PARITY_MEAN_ABS_DIFF = 3.5;
const PARITY_OUTLIER_CHANNEL_DELTA = 24;
const PARITY_OUTLIER_FRACTION = 0.03;

const packIds = ["essential", "editorial", "everyday"] as const;

let serveUrl: string;
let browserExecutable: string;
let browser: Browser;
let harness: HarnessServer;

beforeAll(async () => {
  serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../../dist/style-proof/remotion-root.js", import.meta.url),
    ),
  });
  browserExecutable = chromium.executablePath();
  const harnessBundle = await bundle({
    ignoreRegisterRootWarning: true,
    entryPoint: fileURLToPath(
      new URL("../../dist/style-proof/layout-harness.js", import.meta.url),
    ),
    webpackOverride: (config) => ({
      ...config,
      output: { ...config.output, filename: "harness.js" },
    }),
  });
  harness = await startHarnessServer(harnessBundle);
  browser = await chromium.launch({ headless: true });
}, 600_000);

afterAll(async () => {
  await browser?.close();
  await harness?.close();
});

async function serverFrame(
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
  const result = await renderStill({
    browserExecutable,
    composition,
    frame,
    imageFormat: "png",
    inputProps: props,
    serveUrl,
  });
  if (result.buffer === null)
    throw new Error("renderStill returned no buffer.");
  return result.buffer;
}

function comparePngs(
  left: Buffer,
  right: Buffer,
): Readonly<{ meanAbsDiff: number; outlierFraction: number }> {
  const a = PNG.sync.read(left);
  const b = PNG.sync.read(right);
  expect(a.width).toBe(b.width);
  expect(a.height).toBe(b.height);
  let total = 0;
  let outliers = 0;
  let samples = 0;
  for (let i = 0; i < a.data.length; i += 4)
    for (let channel = 0; channel < 3; channel++) {
      const delta = Math.abs(a.data[i + channel]! - b.data[i + channel]!);
      total += delta;
      samples += 1;
      if (delta > PARITY_OUTLIER_CHANNEL_DELTA) outliers += 1;
    }
  return {
    meanAbsDiff: total / samples,
    outlierFraction: outliers / samples,
  };
}

describe("style proof Remotion rendering", () => {
  it(
    "registers all three primary compositions at the pinned 1080p/30 profile",
    async () => {
      for (const packId of packIds) {
        const composition = await selectComposition({
          browserExecutable,
          id: styleProofCompositionIds[packId],
          inputProps: conductionProofFixtures[packId],
          serveUrl,
        });
        expect(composition.width).toBe(1920);
        expect(composition.height).toBe(1080);
        expect(composition.fps).toBe(30);
        expect(composition.durationInFrames).toBe(840);
      }
    },
    600_000,
  );

  it.each(packIds)(
    "renders a real %s frame and repeats it byte-identically",
    async (packId) => {
      const first = await serverFrame(packId, 150);
      const repeated = await serverFrame(packId, 150);
      expect(first.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(createHash("sha256").update(repeated).digest("hex")).toBe(
        createHash("sha256").update(first).digest("hex"),
      );
    },
    600_000,
  );

  it(
    "produces different pixels for the same frame in each style",
    async () => {
      const hashes = await Promise.all(
        packIds.map(async (packId) =>
          createHash("sha256")
            .update(await serverFrame(packId, 150))
            .digest("hex"),
        ),
      );
      expect(new Set(hashes).size).toBe(3);
    },
    600_000,
  );

  it(
    "renders a frame reached by a backward seek identically to a direct render",
    async () => {
      // Remotion renders each still independently, so this asserts the
      // composition itself carries no frame-order-dependent state: rendering
      // 300 after 700 must match rendering 300 first.
      const later = await serverFrame("editorial", 700);
      const earlier = await serverFrame("editorial", 300);
      const earlierAgain = await serverFrame("editorial", 300);
      expect(earlierAgain.equals(earlier)).toBe(true);
      expect(later.equals(earlier)).toBe(false);
    },
    600_000,
  );

  // All nine treatments, not just the first scene of each pack: a parity
  // result for the hook says nothing about the annotation rules in a
  // definition or the panel geometry in a comparison.
  it.each(
    packIds.flatMap((packId) =>
      (["hook", "definition", "comparison"] as const).map(
        (template) => [packId, template] as const,
      ),
    ),
  )(
    "matches the browser preview for the %s %s treatment within the documented tolerance",
    async (packId, template) => {
      const props = conductionProofFixtures[packId];
      const scene = props.scenes.find((entry) => entry.template === template)!;
      const segment = styleProofTimeline(props.scenes).find(
        (entry) => entry.sceneId === scene.id,
      )!;
      const intervals = getStyleProofIntervals(
        scene.durationSeconds,
        props.motion,
      );
      // The hold frame: fully settled, so a parity failure is a rendering
      // difference rather than a one-frame animation phase difference.
      const clipFrame = segment.startFrame + intervals.holdStartFrame;
      const page = await browser.newPage();
      let previewPng: Buffer;
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(harness.origin);
        await page.evaluate(
          ([payload, at]) =>
            (
              window as unknown as {
                renderStyleProofClip: (
                  props: unknown,
                  frame: number,
                ) => Promise<void>;
              }
            ).renderStyleProofClip(payload, at as number),
          [props, clipFrame] as const,
        );
        await page.waitForSelector("[data-proof-ready='true']", {
          timeout: 60_000,
        });
        previewPng = await page.screenshot({ type: "png" });
      } finally {
        await page.close();
      }
      const composition = await selectComposition({
        browserExecutable,
        id: styleProofCompositionIds[packId],
        inputProps: props,
        serveUrl,
      });
      const rendered = await renderStill({
        browserExecutable,
        composition,
        frame: clipFrame,
        imageFormat: "png",
        inputProps: props,
        serveUrl,
      });
      const comparison = comparePngs(previewPng, rendered.buffer!);
      expect(
        comparison.meanAbsDiff,
        `${packId} ${template} mean abs diff`,
      ).toBeLessThanOrEqual(PARITY_MEAN_ABS_DIFF);
      expect(
        comparison.outlierFraction,
        `${packId} ${template} outlier fraction`,
      ).toBeLessThanOrEqual(PARITY_OUTLIER_FRACTION);
    },
    600_000,
  );

  it(
    "refuses to render a composition its preflight blocks",
    async () => {
      const props = conductionProofFixtures.editorial;
      const broken = {
        ...props,
        selection: {
          ...props.selection,
          sceneDesigns: {
            ...props.selection.sceneDesigns,
            [styleProofSceneIds.conductionHook]: {
              ...props.selection.sceneDesigns[
                styleProofSceneIds.conductionHook
              ]!,
              assetBySlot: {},
            },
          },
        },
      };
      // Remotion renders the props resolved at selection time, so the broken
      // inputs have to be selected as well as passed; handing them only to
      // `renderStill` would silently render the good composition instead.
      const composition = await selectComposition({
        browserExecutable,
        id: styleProofCompositionIds.editorial,
        inputProps: broken,
        serveUrl,
      });
      await expect(
        renderStill({
          browserExecutable,
          composition,
          frame: 30,
          imageFormat: "png",
          inputProps: broken,
          serveUrl,
        }),
      ).rejects.toThrow(/render blocked/i);
    },
    600_000,
  );
});
