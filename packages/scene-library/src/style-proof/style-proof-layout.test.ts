/**
 * ST-094 — browser layout preflight.
 *
 * This is the layer the fast checks cannot replace. It renders every treatment
 * at the real 1920x1080 canvas in Chromium, waits for the pinned fonts, and
 * then measures what the browser actually laid out:
 *
 * - no `data-proof-fit` box scrolls (real wrapped text inside its container),
 * - no required readable content intersects the caption exclusion region,
 * - nothing required is laid out outside the canvas,
 * - every bound asset actually decoded and painted,
 *
 * at the entrance boundary, mid-explanation, the start of the hold and the last
 * frame before the exit — so a motion extreme cannot hide an overflow.
 */

import { chromium, type Browser, type Page } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { fileURLToPath } from "node:url";
import { startHarnessServer, type HarnessServer } from "./harness-server.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  conductionProofFixtures,
  denseComparisonBoundaryFixture,
  extendedSceneBoundaryFixture,
  getStyleProofIntervals,
  leafProofFixtures,
  longHeadingBoundaryFixture,
  portraitMediaBoundaryFixture,
  styleProofCaptionExclusion,
  styleProofContentAttribute,
  styleProofFitAttribute,
} from "./index.js";
import type { StyleProofCompositionProps } from "@avlp/schemas/style-proof";

type Finding = Readonly<{ detail: string; kind: string; path: string }>;

let browser: Browser;
let harness: HarnessServer;

beforeAll(async () => {
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
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await harness?.close();
});

async function inspect(
  page: Page,
  props: StyleProofCompositionProps,
  sceneId: string,
  frame: number,
): Promise<readonly Finding[]> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(harness.origin);
  await page.evaluate(
    ([payload, scene, at]) =>
      (
        window as unknown as {
          renderStyleProofScene: (
            props: unknown,
            sceneId: string,
            frame: number,
          ) => Promise<void>;
        }
      ).renderStyleProofScene(payload, scene as string, at as number),
    [props, sceneId, frame] as const,
  );
  await page.waitForSelector("[data-proof-ready='true']", { timeout: 30_000 });
  return page.evaluate(
    ([fitAttribute, contentAttribute, exclusion]) => {
      const findings: Finding[] = [];
      const push = (kind: string, path: string, detail: string): void => {
        findings.push({ detail, kind, path });
      };
      for (const element of document.querySelectorAll(`[${fitAttribute}]`)) {
        const path = element.getAttribute(fitAttribute) ?? "unknown";
        // Real wrapped height against the real box, with the pinned fonts.
        if (element.scrollHeight > element.clientHeight + 1)
          push(
            "text_overflow",
            path,
            `content ${element.scrollHeight}px in a ${element.clientHeight}px box`,
          );
        if (element.scrollWidth > element.clientWidth + 1)
          push(
            "text_overflow",
            path,
            `content ${element.scrollWidth}px wide in a ${element.clientWidth}px box`,
          );
      }
      for (const element of document.querySelectorAll(
        `[${contentAttribute}]`,
      )) {
        const path = element.getAttribute(contentAttribute) ?? "unknown";
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const region = exclusion as {
          bottom: number;
          left: number;
          right: number;
          top: number;
        };
        if (
          box.bottom > region.top &&
          box.top < region.bottom &&
          box.right > region.left &&
          box.left < region.right
        )
          push(
            "caption_collision",
            path,
            `box ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)} enters the caption region`,
          );
        if (
          box.left < -1 ||
          box.top < -1 ||
          box.right > 1921 ||
          box.bottom > 1081
        )
          push(
            "outside_canvas",
            path,
            `box ${Math.round(box.left)},${Math.round(box.top)} to ${Math.round(box.right)},${Math.round(box.bottom)}`,
          );
      }
      for (const image of document.querySelectorAll("img[data-proof-asset]")) {
        const media = image as HTMLImageElement;
        const assetId = media.getAttribute("data-proof-asset") ?? "unknown";
        if (!media.complete || media.naturalWidth === 0)
          push("asset_not_painted", assetId, "image did not decode");
      }
      return findings;
    },
    [
      styleProofFitAttribute,
      styleProofContentAttribute,
      styleProofCaptionExclusion,
    ] as const,
  );
}

function probeFrames(durationSeconds: number): readonly number[] {
  const intervals = getStyleProofIntervals(durationSeconds, {
    entranceFrames: 20,
    exitFrames: 12,
    minimumHoldFrames: 45,
  });
  return [
    0,
    intervals.entranceEndFrame,
    Math.floor((intervals.entranceEndFrame + intervals.holdStartFrame) / 2),
    intervals.holdStartFrame,
    Math.max(0, intervals.exitStartFrame - 1),
  ];
}

const packIds = ["essential", "editorial", "everyday"] as const;

describe("style proof browser layout preflight", () => {
  for (const packId of packIds)
    it(
      `lays out all three ${packId} scenes within their boxes and clear of captions`,
      async () => {
        const page = await browser.newPage();
        try {
          const props = conductionProofFixtures[packId];
          for (const scene of props.scenes)
            for (const frame of probeFrames(scene.durationSeconds)) {
              const findings = await inspect(page, props, scene.id, frame);
              expect(
                findings,
                `${packId} ${scene.template} at frame ${frame}`,
              ).toEqual([]);
            }
        } finally {
          await page.close();
        }
      },
      180_000,
    );

  it(
    "lays out the second subject through the same treatments",
    async () => {
      const page = await browser.newPage();
      try {
        for (const packId of packIds) {
          const props = leafProofFixtures[packId];
          for (const scene of props.scenes) {
            const findings = await inspect(
              page,
              props,
              scene.id,
              getStyleProofIntervals(scene.durationSeconds, props.motion)
                .holdStartFrame,
            );
            expect(findings, `${packId} ${scene.template}`).toEqual([]);
          }
        }
      } finally {
        await page.close();
      }
    },
    180_000,
  );

  it.each([
    ["a heading at the schema ceiling", longHeadingBoundaryFixture],
    ["the densest valid comparison", denseComparisonBoundaryFixture],
    ["portrait media in a cover-fit slot", portraitMediaBoundaryFixture],
    ["an extended scene duration", extendedSceneBoundaryFixture],
  ])(
    "lays out %s without overflow or caption collision",
    async (_label, props) => {
      const page = await browser.newPage();
      try {
        for (const scene of props.scenes)
          for (const frame of probeFrames(scene.durationSeconds)) {
            const findings = await inspect(page, props, scene.id, frame);
            expect(findings, `${scene.template} at frame ${frame}`).toEqual([]);
          }
      } finally {
        await page.close();
      }
    },
    180_000,
  );

  it(
    "paints every bound asset in every treatment",
    async () => {
      const page = await browser.newPage();
      try {
        for (const packId of packIds) {
          const props = conductionProofFixtures[packId];
          for (const scene of props.scenes) {
            await inspect(page, props, scene.id, 60);
            const painted = await page.evaluate(() =>
              [...document.querySelectorAll("img[data-proof-asset]")].map(
                (image) => ({
                  id: image.getAttribute("data-proof-asset"),
                  width: (image as HTMLImageElement).naturalWidth,
                }),
              ),
            );
            const expected = Object.keys(
              props.selection.sceneDesigns[scene.id]?.assetBySlot ?? {},
            ).length;
            expect(painted).toHaveLength(expected);
            for (const image of painted)
              expect(image.width, `${packId} ${image.id}`).toBeGreaterThan(0);
          }
        }
      } finally {
        await page.close();
      }
    },
    180_000,
  );

  it(
    "renders the caption plate inside its shared exclusion region in every pack",
    async () => {
      const page = await browser.newPage();
      try {
        const boxes: Record<string, DOMRect> = {};
        for (const packId of packIds) {
          const props = conductionProofFixtures[packId];
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.goto(harness.origin);
          await page.evaluate(
            ([payload]) =>
              (
                window as unknown as {
                  renderStyleProofClip: (props: unknown, frame: number) => Promise<void>;
                }
              ).renderStyleProofClip(payload, 60),
            [props] as const,
          );
          await page.waitForSelector("[data-proof-ready='true']", {
            timeout: 30_000,
          });
          const box = await page.evaluate(() => {
            const caption = document.querySelector(
              "[data-testid='style-proof-caption']",
            );
            return caption === null
              ? null
              : JSON.parse(JSON.stringify(caption.getBoundingClientRect()));
          });
          expect(box, `${packId} caption`).not.toBeNull();
          boxes[packId] = box as DOMRect;
          expect(box.top).toBeGreaterThanOrEqual(
            styleProofCaptionExclusion.top - 1,
          );
          expect(box.bottom).toBeLessThanOrEqual(1081);
        }
        // Caption geometry is shared, not style-variable.
        expect(boxes["editorial"]?.left).toBe(boxes["essential"]?.left);
        expect(boxes["everyday"]?.width).toBe(boxes["essential"]?.width);
      } finally {
        await page.close();
      }
    },
    180_000,
  );
});
