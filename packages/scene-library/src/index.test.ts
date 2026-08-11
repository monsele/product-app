import { describe, expect, it } from "vitest";
import {
  transitionPresets,
  videoTheme,
  type MotionPreset,
  type SafeArea,
  type VideoTheme,
} from "@avlp/design-system";
import {
  createDefaultScene,
  getSceneFrameTiming,
  measureSceneContent,
  measureSceneLayout,
  resolveSceneDefinition,
  sceneRegistry,
  ScenePreviewRuntime,
  SceneRenderRuntime,
  SceneRuntime,
  validateScene,
  sceneLibraryMotionPresets,
  sceneLibrarySafeAreas,
  sceneLibraryTransitionPresets,
  sceneLibraryVideoTheme,
} from "./index.js";
import { sceneTemplateValues } from "@avlp/schemas";
import { chromium } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";

describe("scene-library video design-system imports", () => {
  it("consumes the public shared theme, safe-area, motion, and transition contracts", () => {
    const theme: VideoTheme = sceneLibraryVideoTheme;
    const titleSafeArea: SafeArea = sceneLibrarySafeAreas.title;
    const enterMotion: MotionPreset = sceneLibraryMotionPresets.enter;

    expect(theme).toBe(videoTheme);
    expect(titleSafeArea).toBe(videoTheme.safeAreas.title);
    expect(enterMotion).toBe(videoTheme.motion.enter);
    expect(sceneLibraryTransitionPresets).toBe(transitionPresets);
  });
});

describe("scene registry runtime", () => {
  it("registers every LessonSpec template with a default factory", () => {
    expect(Object.keys(sceneRegistry).sort()).toEqual(
      [...sceneTemplateValues].sort(),
    );
    for (const template of sceneTemplateValues)
      expect(createDefaultScene(template).template).toBe(template);
  });

  it("rejects unsupported templates before a component can be resolved", () => {
    expect(() =>
      resolveSceneDefinition({ template: "unbounded-layout" }),
    ).toThrow("Unsupported scene template");
  });

  it("reports a field-specific overflow instead of shrinking text below readability limits", () => {
    const scene = createDefaultScene("definition");
    if (scene.template !== "definition")
      throw new Error("Expected definition fixture.");
    scene.visual.definition = "readable ".repeat(110);
    const issues = validateScene(scene);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "text_overflow",
        fieldPath: "visual.definition",
        sceneId: scene.id,
        severity: "error",
      }),
    );
    expect(measureSceneLayout("readable ".repeat(110)).fits).toBe(false);
  });

  it("reports aggregate overflow for a valid multi-item template", () => {
    const scene = createDefaultScene("process");
    if (scene.template !== "process")
      throw new Error("Expected process fixture.");
    scene.visual.steps = Array.from({ length: 12 }, () =>
      "readable ".repeat(30),
    );

    expect(validateScene(scene)).toContainEqual(
      expect.objectContaining({
        code: "text_overflow",
        fieldPath: "visual.steps.11",
      }),
    );
    expect(
      measureSceneContent([
        { path: "visual.steps.0", value: "readable ".repeat(30) },
        { path: "visual.steps.1", value: "readable ".repeat(30) },
      ]).estimatedHeight,
    ).toBeGreaterThan(0);
  });

  it("uses one component implementation for browser preview and server rendering", async () => {
    const scene = createDefaultScene("summary");
    const resolved = resolveSceneDefinition(scene);
    const previewMarkup = renderToStaticMarkup(ScenePreviewRuntime({ scene }));
    const renderMarkup = renderToStaticMarkup(SceneRenderRuntime({ scene }));

    expect(SceneRuntime({ scene }).type).toBe(resolved.component);
    expect(sceneRegistry.summary.component).toBe(resolved.component);
    expect(previewMarkup).toBe(renderMarkup);

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(previewMarkup);
      expect(await page.locator("main").textContent()).toContain("summary");
    } finally {
      await browser.close();
    }
  });

  it("returns a stable issue for an unsupported template", () => {
    const issues = validateScene({
      id: "scene-x",
      template: "unbounded-layout",
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: "unsupported_template",
        fieldPath: "template",
        sceneId: "scene-x",
      }),
    ]);
  });

  it("enforces template-owned visual limits and exposes matching editor metadata", () => {
    expect(
      sceneRegistry.definition.visualSchema.safeParse({
        term: "x".repeat(201),
        definition: "Valid definition.",
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry.process.visualSchema.safeParse({
        steps: Array.from({ length: 13 }, () => "Step"),
      }).success,
    ).toBe(false);
    expect(sceneRegistry.definition.metadata.textLimits["visual.term"]).toBe(
      200,
    );
    expect(sceneRegistry.process.metadata.itemLimits["visual.steps"]).toBe(12);
    expect(sceneRegistry.definition.metadata.fields).toContainEqual(
      expect.objectContaining({ path: "visual.definition", control: "text" }),
    );
    expect(sceneRegistry.definition.durationGuidance).toEqual({
      minimumSeconds: 3,
      maximumSeconds: 60,
    });
  });

  it("uses deterministic frame timing derived from the shared 30fps theme", () => {
    expect(getSceneFrameTiming(10)).toEqual({
      durationInFrames: 300,
      enterEndFrame: videoTheme.motion.enter.durationInFrames,
      exitStartFrame: 300 - videoTheme.motion.exit.durationInFrames,
    });
  });
});
