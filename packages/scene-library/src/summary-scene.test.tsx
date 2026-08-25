import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SummarySceneFrame,
  getSummarySceneFrameState,
} from "./summary-scene.js";
import {
  assetAssistedSummaryFixture,
  resolvedSummaryAssets,
  textOnlySummaryFixture,
  visualAssistedSummaryFixture,
} from "./summary-scene.fixtures.js";
import { sceneRegistry, validateScene } from "./scene-registry.js";

describe("SummaryScene", () => {
  it("renders text-only and model-assisted summaries without exposing objective IDs", () => {
    expect(validateScene(textOnlySummaryFixture)).toEqual([]);
    const markup = renderToStaticMarkup(
      createElement(SummarySceneFrame, {
        frame: 120,
        scene: visualAssistedSummaryFixture,
      }),
    );
    expect(markup).toContain("data-summary-central-model");
    expect(markup).toContain("data-summary-objective-badge");
    expect(markup).not.toContain("00000000-0000-7000-8000-000000000004");
    const assetMarkup = renderToStaticMarkup(
      createElement(SummarySceneFrame, {
        frame: 120,
        resolvedAssets: resolvedSummaryAssets,
        scene: assetAssistedSummaryFixture,
      }),
    );
    expect(assetMarkup).toContain("data-summary-central-asset");
    expect(
      validateScene(assetAssistedSummaryFixture, {
        requireResolvedAssets: true,
        resolvedAssets: resolvedSummaryAssets,
      }),
    ).toEqual([]);
    const missingAsset = validateScene(assetAssistedSummaryFixture, {
      requireResolvedAssets: true,
    });
    expect(missingAsset[0]).toMatchObject({
      fieldPath: "resolvedAssets.central-visual",
    });
    expect(getSummarySceneFrameState(0, 10, 2).takeawayOpacities).toEqual([
      0, 0,
    ]);
    expect(
      getSummarySceneFrameState(120, 10, 2).takeawayOpacities[0],
    ).toBeGreaterThan(0);
  });

  it("keeps maximum supported content above the caption safe area", async () => {
    const scene = {
      ...visualAssistedSummaryFixture,
      title: "T".repeat(160),
      visual: {
        ...visualAssistedSummaryFixture.visual,
        callToAction: undefined,
        centralModel: "M".repeat(140),
        takeaways: Array.from({ length: 4 }, () => ({ text: "T".repeat(140) })),
      },
    };
    expect(validateScene(scene)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html,body{height:100%;margin:0}</style>${renderToStaticMarkup(createElement(SummarySceneFrame, { frame: 210, scene }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll(
            "[data-summary-central-model], [data-summary-takeaway], [data-summary-call-to-action]",
          ),
        ).flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= canvas.left &&
            bounds.right <= canvas.right &&
            bounds.top >= canvas.top &&
            bounds.bottom <= 876
            ? []
            : [bounds.toJSON()];
        });
      });
      expect(outOfBounds).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  it("rejects excessive takeaways and field-specific long text", () => {
    expect(
      sceneRegistry.summary.visualSchema.safeParse({
        takeaways: Array.from({ length: 5 }, () => ({ text: "Key idea" })),
      }).success,
    ).toBe(false);
    const result = sceneRegistry.summary.visualSchema.safeParse({
      takeaways: [{ text: "T".repeat(141) }],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.path).toEqual(["takeaways", 0, "text"]);
  });
});
