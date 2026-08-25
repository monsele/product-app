import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AnalogySceneFrame,
  getAnalogySceneFrameState,
} from "./analogy-scene.js";
import {
  generatedAnalogyFixture,
  maximumDensityAnalogyFixture,
  sourcedAnalogyFixture,
} from "./analogy-scene.fixtures.js";
import { sceneRegistry, validateScene } from "./scene-registry.js";

describe("AnalogyScene", () => {
  it("uses distinct labelled sides, correspondence cues, and an explicit generated label", () => {
    expect(validateScene(sourcedAnalogyFixture)).toEqual([]);
    const sourced = renderToStaticMarkup(
      createElement(AnalogySceneFrame, {
        frame: 48,
        scene: sourcedAnalogyFixture,
      }),
    );
    const generated = renderToStaticMarkup(
      createElement(AnalogySceneFrame, {
        frame: 48,
        scene: generatedAnalogyFixture,
      }),
    );
    expect(sourced).toContain('data-analogy-panel="concept"');
    expect(sourced).toContain('data-analogy-panel="familiar"');
    expect(sourced).toContain("↔");
    expect(sourced).not.toContain("data-analogy-generated-addition");
    expect(generated).toContain("data-analogy-generated-addition");
    expect(generated).toContain("not a source fact");
    expect(getAnalogySceneFrameState(0, 10)).toEqual({
      mappingOpacity: 0,
      panelsOpacity: 0,
    });
    expect(getAnalogySceneFrameState(48, 10).mappingOpacity).toBe(1);
  });

  it("keeps maximum-density mappings in the caption-safe canvas", async () => {
    expect(validateScene(maximumDensityAnalogyFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(createElement(AnalogySceneFrame, { frame: 90, scene: maximumDensityAnalogyFixture }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll("[data-analogy-panel], [data-analogy-mapping]"),
        ).flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= canvas.left &&
            bounds.top >= canvas.top &&
            bounds.right <= canvas.right &&
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

  it("rejects empty, excessive, and ambiguous mappings", () => {
    expect(
      sceneRegistry.analogy.visualSchema.safeParse({
        sourceConcept: "Current",
        familiarSystem: "Pipes",
        mappings: [],
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry.analogy.visualSchema.safeParse({
        sourceConcept: "Current",
        familiarSystem: "Pipes",
        mappings: Array.from({ length: 5 }, () => ({
          concept: "Concept",
          analogy: "Part",
        })),
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry.analogy.visualSchema.safeParse({
        sourceConcept: "Current",
        familiarSystem: "Pipes",
        mappings: [
          { concept: "Flow", analogy: "Water" },
          { concept: "Flow", analogy: "Pressure" },
        ],
      }).success,
    ).toBe(false);
  });
});
