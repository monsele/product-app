import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  maximumWorkedExampleFixture,
  nonNumericalWorkedExampleFixture,
  numericalWorkedExampleFixture,
} from "./worked-example-scene.fixtures.js";
import {
  getWorkedExampleSceneFrameState,
  WorkedExampleSceneFrame,
} from "./worked-example-scene.js";
import { sceneRegistry, validateScene } from "./scene-registry.js";

describe("WorkedExampleScene", () => {
  it("reveals supplied steps in order and reveals the result only after them", () => {
    expect(validateScene(numericalWorkedExampleFixture)).toEqual([]);
    const initial = getWorkedExampleSceneFrameState(0, 10, 3);
    const first = getWorkedExampleSceneFrameState(20, 10, 3);
    const finalStep = getWorkedExampleSceneFrameState(180, 10, 3);
    const final = getWorkedExampleSceneFrameState(240, 10, 3);

    expect(initial.activeStep).toBe(-1);
    expect(initial.resultOpacity).toBe(0);
    expect(first.activeStep).toBe(0);
    expect(first.resultOpacity).toBe(0);
    expect(finalStep.activeStep).toBe(2);
    expect(finalStep.resultOpacity).toBe(0);
    expect(final.activeStep).toBe(2);
    expect(final.resultOpacity).toBe(1);

    const markup = renderToStaticMarkup(
      createElement(WorkedExampleSceneFrame, {
        frame: 240,
        scene: numericalWorkedExampleFixture,
      }),
    );
    expect(markup.indexOf("Use density")).toBeLessThan(
      markup.indexOf("Substitute the known values"),
    );
    expect(markup.indexOf("Substitute the known values")).toBeLessThan(
      markup.indexOf("Calculate 24"),
    );
    expect(markup.indexOf("Calculate 24")).toBeLessThan(
      markup.indexOf("Density = 3 g/cm"),
    );
  });

  it("uses monospace styling only for numerical or equation-like content", () => {
    const numerical = renderToStaticMarkup(
      createElement(WorkedExampleSceneFrame, {
        frame: 90,
        scene: numericalWorkedExampleFixture,
      }),
    );
    const nonNumerical = renderToStaticMarkup(
      createElement(WorkedExampleSceneFrame, {
        frame: 90,
        scene: nonNumericalWorkedExampleFixture,
      }),
    );
    expect(numerical).toContain("Atkinson Hyperlegible Mono");
    expect(nonNumerical).not.toContain("Atkinson Hyperlegible Mono");
  });

  it("rejects excessive steps and expression lengths", () => {
    expect(
      sceneRegistry["worked-example"].visualSchema.safeParse({
        problem: "Problem",
        steps: Array.from({ length: 13 }, () => "Step"),
        answer: "Answer",
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry["worked-example"].visualSchema.safeParse({
        problem: "Problem",
        steps: ["x".repeat(301)],
        answer: "Answer",
      }).success,
    ).toBe(false);
  });

  it("keeps maximum bounded content in the action-safe canvas", async () => {
    expect(validateScene(maximumWorkedExampleFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(createElement(WorkedExampleSceneFrame, { frame: 150, scene: maximumWorkedExampleFixture }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll(
            "[data-worked-example-problem], [data-worked-example-step], [data-worked-example-result]",
          ),
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
});
