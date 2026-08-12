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
  getHookSceneFrameState,
  HookSceneFrame,
  DefinitionSceneFrame,
  assetAssistedDefinitionFixture,
  resolvedDefinitionAssets,
  getDefinitionSceneFrameState,
  invalidHookFixture,
  maximumDensityHookFixture,
  maximumProcessFixture,
  iconAssistedProcessFixture,
  minimumProcessFixture,
  longLabelProcessFixture,
  getProcessSceneFrameState,
  ProcessSceneFrame,
  selectProcessLayout,
  asymmetricIpoFixture,
  genericIpoFixture,
  getIpoSceneFrameState,
  IpoSceneFrame,
  maximumDensityIpoFixture,
  photosynthesisIpoFixture,
  selectIpoLayout,
  ComparisonSceneFrame,
  getComparisonSceneFrameState,
  imageAssistedComparisonFixture,
  maximumDensityComparisonFixture,
  maximumDensityCauseEffectFixture,
  textOnlyComparisonFixture,
  CauseEffectSceneFrame,
  branchingCauseEffectFixture,
  getCauseEffectSceneFrameState,
  selectCauseEffectLayout,
  assetDiagramFixture,
  sourceDiagramFixture,
  resolvedDiagramAssets,
  maximumLabelDiagramFixture,
  shapesDiagramFixture,
  getLabelledDiagramFrameState,
  LabelledDiagramSceneFrame,
  resolveSafeDiagramAsset,
  planDiagramCallouts,
  simpleCauseEffectFixture,
  maximumDensityDefinitionFixture,
  textOnlyDefinitionFixture,
  validHookFixture,
  validateScene,
  sceneLibraryMotionPresets,
  sceneLibrarySafeAreas,
  sceneLibraryTransitionPresets,
  sceneLibraryVideoTheme,
} from "./index.js";
import { sceneTemplateValues } from "@avlp/schemas";
import { chromium } from "@playwright/test";
import { createElement } from "react";
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
  it("selects bounded chain and branching causal layouts with deterministic connection emphasis", () => {
    expect(
      selectCauseEffectLayout(
        simpleCauseEffectFixture.visual.causes,
        simpleCauseEffectFixture.visual.effects,
      ),
    ).toBe("chain");
    expect(
      selectCauseEffectLayout(
        branchingCauseEffectFixture.visual.causes,
        branchingCauseEffectFixture.visual.effects,
      ),
    ).toBe("branching");
    expect(validateScene(simpleCauseEffectFixture)).toEqual([]);
    expect(validateScene(branchingCauseEffectFixture)).toEqual([]);
    expect(getCauseEffectSceneFrameState(0, 10)).toMatchObject({
      causesOpacity: 0,
      mechanismOpacity: 0,
      effectsOpacity: 0,
      connectionOpacity: 0,
    });
    expect(getCauseEffectSceneFrameState(48, 10)).toMatchObject({
      causesOpacity: 1,
      mechanismOpacity: 1,
      effectsOpacity: 0,
    });
    const markup = renderToStaticMarkup(
      createElement(CauseEffectSceneFrame, {
        frame: 90,
        scene: branchingCauseEffectFixture,
      }),
    );
    expect(markup).toContain('data-cause-effect-layout="branching"');
    expect(markup).toContain("CAUSE");
    expect(markup).toContain("EFFECT");
    expect(markup).toContain("→");
  });

  it("keeps maximum-density causal content above the caption safe area", async () => {
    expect(validateScene(maximumDensityCauseEffectFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(createElement(CauseEffectSceneFrame, { frame: 90, scene: maximumDensityCauseEffectFixture }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll("[data-cause-effect-node]"),
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

  it("selects a semantic process layout for count and label density", () => {
    expect(selectProcessLayout(minimumProcessFixture.visual.steps)).toBe(
      "horizontal",
    );
    expect(selectProcessLayout(maximumProcessFixture.visual.steps)).toBe(
      "vertical",
    );
    expect(selectProcessLayout(longLabelProcessFixture.visual.steps)).toBe(
      "vertical",
    );
  });

  it("renders bounded IPO models with unambiguous staged flow", () => {
    expect(
      selectIpoLayout(
        genericIpoFixture.visual.inputs,
        genericIpoFixture.visual.outputs,
      ),
    ).toBe("horizontal");
    expect(
      selectIpoLayout(
        maximumDensityIpoFixture.visual.inputs,
        maximumDensityIpoFixture.visual.outputs,
      ),
    ).toBe("horizontal");
    expect(
      selectIpoLayout(
        asymmetricIpoFixture.visual.inputs,
        asymmetricIpoFixture.visual.outputs,
      ),
    ).toBe("horizontal");
    const markup = renderToStaticMarkup(
      createElement(IpoSceneFrame, {
        frame: 48,
        scene: photosynthesisIpoFixture,
      }),
    );
    expect(markup).toContain('data-ipo-layout="horizontal"');
    expect(markup).toContain("data-ipo-arrow");
    expect(markup).toContain("data-ipo-process");
    expect(markup.indexOf("Sunlight")).toBeLessThan(
      markup.indexOf("Plant makes food"),
    );
    expect(markup.indexOf("Plant makes food")).toBeLessThan(
      markup.indexOf("Oxygen"),
    );
    expect(getIpoSceneFrameState(0, 10)).toEqual({
      inputsOpacity: 0,
      processOpacity: 0,
      outputsOpacity: 0,
    });
    expect(getIpoSceneFrameState(48, 10)).toMatchObject({
      inputsOpacity: 1,
      processOpacity: 1,
      outputsOpacity: 0,
    });
  });

  it("keeps the maximum-density IPO model inside the caption-safe canvas", async () => {
    expect(validateScene(maximumDensityIpoFixture)).toEqual([]);
    expect(validateScene(asymmetricIpoFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(createElement(IpoSceneFrame, { frame: 90, scene: asymmetricIpoFixture }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll(
            "[data-ipo-items], [data-ipo-process], [data-ipo-arrow]",
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

  it("preserves LessonSpec step order and reveals one active step at a time", () => {
    const markup = renderToStaticMarkup(
      createElement(ProcessSceneFrame, {
        frame: 36,
        scene: minimumProcessFixture,
      }),
    );
    expect(markup.indexOf("Water warms")).toBeLessThan(
      markup.indexOf("Water evaporates"),
    );
    expect(getProcessSceneFrameState(0, 10, 2)).toEqual({
      activeStep: 0,
      stepOpacity: 0,
    });
    expect(getProcessSceneFrameState(36, 10, 2)).toMatchObject({
      activeStep: 1,
      stepOpacity: 0.5,
    });
    const iconMarkup = renderToStaticMarkup(
      createElement(ProcessSceneFrame, {
        frame: 36,
        scene: iconAssistedProcessFixture,
      }),
    );
    expect(iconMarkup).toContain('data-process-step-icon="2"');
    expect(iconMarkup).not.toContain('data-process-step-icon="1"');
  });

  it("keeps maximum process content inside the 1080p canvas", async () => {
    expect(validateScene(minimumProcessFixture)).toEqual([]);
    expect(validateScene(maximumProcessFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(`
        <style>html, body { height: 100%; margin: 0; }</style>
        ${renderToStaticMarkup(
          createElement(ProcessSceneFrame, {
            frame: 120,
            scene: maximumProcessFixture,
          }),
        )}
      `);
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(main.querySelectorAll("li")).flatMap((element) => {
          const bounds = element.getBoundingClientRect();
          return bounds.left >= canvas.left &&
            bounds.top >= canvas.top &&
            bounds.right <= canvas.right &&
            bounds.bottom <= 876
            ? []
            : [{ top: bounds.top, bottom: bounds.bottom }];
        });
      });
      expect(outOfBounds).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  it("renders text-only and asset-assisted definition layouts safely", () => {
    const textOnly = renderToStaticMarkup(
      createElement(DefinitionSceneFrame, {
        frame: 48,
        scene: textOnlyDefinitionFixture,
      }),
    );
    const withAsset = renderToStaticMarkup(
      createElement(DefinitionSceneFrame, {
        frame: 48,
        resolvedAssets: resolvedDefinitionAssets,
        scene: assetAssistedDefinitionFixture,
      }),
    );

    expect(textOnly).not.toContain("data-definition-visual-asset");
    expect(withAsset).toContain("data-definition-visual-asset");
    expect(withAsset).toContain("Water vapour rising from a puddle");
  });

  it("allows a definition asset placeholder only in preview and blocks final rendering without safe media", () => {
    expect(
      validateScene(assetAssistedDefinitionFixture, {
        requireResolvedAssets: true,
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: "missing_asset",
        fieldPath: "resolvedAssets.visual-example",
      }),
    );
    expect(
      renderToStaticMarkup(
        createElement(DefinitionSceneFrame, {
          frame: 48,
          runtimeMode: "preview",
          scene: assetAssistedDefinitionFixture,
        }),
      ),
    ).toContain('data-definition-visual-asset-placeholder="visual-example"');
    expect(() =>
      renderToStaticMarkup(
        createElement(DefinitionSceneFrame, {
          frame: 48,
          runtimeMode: "render",
          scene: assetAssistedDefinitionFixture,
        }),
      ),
    ).toThrow("Definition render requires a resolved visual asset.");
    expect(() =>
      SceneRenderRuntime({ scene: assetAssistedDefinitionFixture }),
    ).toThrow("Scene render blocked for resolvedAssets.visual-example");
    expect(
      validateScene(assetAssistedDefinitionFixture, {
        requireResolvedAssets: true,
        resolvedAssets: resolvedDefinitionAssets,
      }),
    ).toEqual([]);
  });

  it("renders comparison subjects before shared traits and differences", () => {
    expect(validateScene(textOnlyComparisonFixture)).toEqual([]);
    expect(validateScene(imageAssistedComparisonFixture)).toEqual([]);
    expect(getComparisonSceneFrameState(0, 10)).toEqual({
      subjectsOpacity: 0,
      similaritiesOpacity: 0,
      differencesOpacity: 0,
    });
    const subjects = getComparisonSceneFrameState(36, 10);
    expect(subjects.subjectsOpacity).toBe(1);
    expect(subjects.similaritiesOpacity).toBeLessThan(subjects.subjectsOpacity);
    const markup = renderToStaticMarkup(
      createElement(ComparisonSceneFrame, {
        frame: 48,
        scene: imageAssistedComparisonFixture,
      }),
    );
    expect(markup).toContain('data-comparison-subject="left"');
    expect(markup).toContain('data-comparison-asset-slot="left-subject-image"');
    expect(markup.indexOf("SHARED TRAITS")).toBeLessThan(
      markup.indexOf("KEY DIFFERENCES"),
    );
    const missingAssetMarkup = renderToStaticMarkup(
      createElement(ComparisonSceneFrame, {
        frame: 48,
        scene: { ...imageAssistedComparisonFixture, assetBindings: [] },
      }),
    );
    expect(missingAssetMarkup).not.toContain("data-comparison-asset-slot");
  });

  it("keeps maximum-density comparison content above the caption safe area", async () => {
    expect(validateScene(maximumDensityComparisonFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(createElement(ComparisonSceneFrame, { frame: 90, scene: maximumDensityComparisonFixture }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll(
            "[data-comparison-subject], [data-comparison-traits]",
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

  it("reports a field-specific error when comparison differences exceed the limit", () => {
    const scene = {
      ...textOnlyComparisonFixture,
      visual: {
        ...textOnlyComparisonFixture.visual,
        differences: ["One", "Two", "Three", "Four", "Five"],
      },
    };
    expect(validateScene(scene)).toContainEqual(
      expect.objectContaining({
        code: "invalid_scene",
        fieldPath: "visual.differences",
      }),
    );
  });

  it("reveals term, definition, and example deterministically in sequence", () => {
    expect(getDefinitionSceneFrameState(0, 10)).toEqual({
      definitionOpacity: 0,
      exampleOpacity: 0,
      termOpacity: 0,
      termTranslateY: 28,
    });
    const definitionEntered = getDefinitionSceneFrameState(33, 10);
    expect(definitionEntered.termOpacity).toBe(1);
    expect(definitionEntered.definitionOpacity).toBe(1);
    expect(definitionEntered.exampleOpacity).toBe(0);
    expect(getDefinitionSceneFrameState(48, 10).exampleOpacity).toBe(1);
  });

  it("keeps maximum-density definition content above the caption safe area", async () => {
    expect(validateScene(maximumDensityDefinitionFixture)).toEqual([]);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(`
        <style>html, body { height: 100%; margin: 0; }</style>
        ${renderToStaticMarkup(
          createElement(DefinitionSceneFrame, {
            frame: 48,
            scene: maximumDensityDefinitionFixture,
          }),
        )}
      `);
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(main.querySelectorAll("section *")).flatMap(
          (element) => {
            const bounds = element.getBoundingClientRect();
            const fits =
              bounds.left >= canvas.left &&
              bounds.top >= canvas.top &&
              bounds.right <= canvas.right &&
              bounds.bottom <= 876;
            return fits
              ? []
              : [
                  {
                    name: element.tagName,
                    left: bounds.left,
                    top: bounds.top,
                    right: bounds.right,
                    bottom: bounds.bottom,
                  },
                ];
          },
        );
      });
      expect(outOfBounds).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  it("renders a hook with or without its optional subject asset", () => {
    const withoutAsset = renderToStaticMarkup(
      createElement(HookSceneFrame, { frame: 0, scene: validHookFixture }),
    );
    const withAsset = renderToStaticMarkup(
      createElement(HookSceneFrame, {
        frame: 0,
        scene: {
          ...validHookFixture,
          assetBindings: [
            {
              assetId: "00000000-0000-7000-8000-000000000004",
              role: "illustration",
              altText: "A healthy green plant",
            },
          ],
        },
      }),
    );

    expect(withoutAsset).not.toContain("data-hook-subject-asset");
    expect(withAsset).toContain("data-hook-subject-asset");
    expect(withAsset).toContain("A healthy green plant");
  });

  it("keeps hook fixtures bounded and deterministic at key animation frames", () => {
    expect(validateScene(validHookFixture)).toEqual([]);
    expect(validateScene(maximumDensityHookFixture)).toEqual([]);
    expect(validateScene(invalidHookFixture)).toContainEqual(
      expect.objectContaining({
        code: "invalid_scene",
        fieldPath: "visual.question",
      }),
    );
    expect(getHookSceneFrameState(0, 10)).toMatchInlineSnapshot(`
      {
        "contentOpacity": 0,
        "contentTranslateY": 36,
        "emphasisScale": 1,
      }
    `);
    expect(getHookSceneFrameState(18, 10)).toMatchInlineSnapshot(`
      {
        "contentOpacity": 1,
        "contentTranslateY": 0,
        "emphasisScale": 1,
      }
    `);
    expect(getHookSceneFrameState(288, 10).contentOpacity).toBe(1);
    expect(getHookSceneFrameState(300, 10).contentOpacity).toBe(0);
  });

  it("keeps the maximum-density hook inside the 1080p canvas", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(`
        <style>html, body { height: 100%; margin: 0; }</style>
        ${renderToStaticMarkup(
          createElement(HookSceneFrame, {
            frame: 28,
            scene: maximumDensityHookFixture,
          }),
        )}
      `);
      expect(
        await page.locator("main").evaluate((main) => {
          const canvas = main.getBoundingClientRect();
          return Array.from(main.querySelectorAll("*")).every((element) => {
            const bounds = element.getBoundingClientRect();
            return (
              bounds.left >= canvas.left &&
              bounds.top >= canvas.top &&
              bounds.right <= canvas.right &&
              bounds.bottom <= canvas.bottom
            );
          });
        }),
      ).toBe(true);
    } finally {
      await browser.close();
    }
  });

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

  it("reports a field-specific schema error instead of shrinking text below readability limits", () => {
    const scene = createDefaultScene("definition");
    if (scene.template !== "definition")
      throw new Error("Expected definition fixture.");
    scene.visual.definition = "readable ".repeat(110);
    const issues = validateScene(scene);

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "invalid_scene",
        fieldPath: "visual.definition",
        sceneId: scene.id,
        severity: "error",
      }),
    );
    expect(measureSceneLayout("readable ".repeat(110)).fits).toBe(false);
  });

  it("reports a field-specific validation error for excessive process text", () => {
    const scene = createDefaultScene("process");
    if (scene.template !== "process")
      throw new Error("Expected process fixture.");
    scene.visual.steps = ["X".repeat(81), "Second"];

    expect(validateScene(scene)).toContainEqual(
      expect.objectContaining({
        code: "invalid_scene",
        fieldPath: "visual.steps.0",
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
      sceneRegistry.hook.visualSchema.safeParse({
        question: "What makes plants grow?",
        supportingElements: ["Sunlight", "Water", "Air", "Soil"],
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry.definition.visualSchema.safeParse({
        term: "x".repeat(81),
        definition: "Valid definition.",
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry.process.visualSchema.safeParse({
        steps: Array.from({ length: 7 }, () => "Step"),
      }).success,
    ).toBe(false);
    expect(
      sceneRegistry["input-process-output"].visualSchema.safeParse({
        inputs: [],
        process: { label: "Process" },
        outputs: [{ label: "Output" }],
      }).success,
    ).toBe(false);
    expect(sceneRegistry.definition.metadata.textLimits["visual.term"]).toBe(
      80,
    );
    expect(sceneRegistry.process.metadata.itemLimits["visual.steps"]).toBe(6);
    expect(sceneRegistry.process.metadata.assetSlots).toContain("step-6-icon");
    expect(
      sceneRegistry["input-process-output"].metadata.itemLimits,
    ).toMatchObject({
      "visual.inputs": 4,
      "visual.outputs": 4,
    });
    expect(sceneRegistry.definition.metadata.fields).toContainEqual(
      expect.objectContaining({ path: "visual.definition", control: "text" }),
    );
    expect(sceneRegistry.definition.metadata.fields).toContainEqual(
      expect.objectContaining({
        path: "visual.exampleText",
        required: false,
      }),
    );
    expect(sceneRegistry.definition.durationGuidance).toEqual({
      minimumSeconds: 3,
      maximumSeconds: 60,
    });
    expect(sceneRegistry.hook.metadata.assetSlots).toEqual(["subject"]);
    expect(
      sceneRegistry.hook.metadata.itemLimits["visual.supportingElements"],
    ).toBe(3);
  });

  it("uses deterministic frame timing derived from the shared 30fps theme", () => {
    expect(getSceneFrameTiming(10)).toEqual({
      durationInFrames: 300,
      enterEndFrame: videoTheme.motion.enter.durationInFrames,
      exitStartFrame: 300 - videoTheme.motion.exit.durationInFrames,
    });
  });

  it("places labelled-diagram callouts from semantic anchors and reports collisions", () => {
    expect(
      planDiagramCallouts(assetDiagramFixture.visual.labels).collisionLabelIds,
    ).toEqual([]);
    expect(validateScene(assetDiagramFixture)).toEqual([]);
    expect(validateScene(shapesDiagramFixture)).toEqual([]);
    expect(validateScene(maximumLabelDiagramFixture)).toEqual([]);
    expect(
      validateScene({
        ...assetDiagramFixture,
        visual: {
          ...assetDiagramFixture.visual,
          labels: [
            { anchor: "left", id: "one", text: "One" },
            { anchor: "left", id: "two", text: "Two" },
          ],
        },
      }),
    ).toContainEqual(
      expect.objectContaining({
        code: "diagram_collision",
        fieldPath: "visual.labels",
      }),
    );
    expect(
      validateScene({ ...assetDiagramFixture, assetBindings: [] }),
    ).toContainEqual(
      expect.objectContaining({
        code: "missing_asset",
        fieldPath: "assetBindings.diagram",
      }),
    );
  });

  it("renders contained source/library assets and progressively reveals diagram labels", () => {
    const libraryMarkup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets: resolvedDiagramAssets,
        scene: assetDiagramFixture,
      }),
    );
    const sourceMarkup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets: resolvedDiagramAssets,
        scene: sourceDiagramFixture,
      }),
    );
    expect(libraryMarkup).toContain('data-diagram-asset-slot="diagram"');
    expect(libraryMarkup).toContain('data-diagram-asset-source="library"');
    expect(sourceMarkup).toContain('data-diagram-asset-source="source"');
    expect(libraryMarkup).toContain("object-fit:contain");
    expect(getLabelledDiagramFrameState(0, 10, 0).opacity).toBe(0);
    expect(getLabelledDiagramFrameState(33, 10, 0).opacity).toBe(1);
    expect(getLabelledDiagramFrameState(33, 10, 2).opacity).toBe(0);
    const libraryAssetId = "00000000-0000-7000-8000-000000000008";
    expect(
      resolveSafeDiagramAsset(libraryAssetId, {
        ...resolvedDiagramAssets,
        [libraryAssetId]: {
          ...resolvedDiagramAssets[libraryAssetId]!,
          src: "javascript:alert(1)",
        },
      }),
    ).toBeUndefined();
  });

  it("allows a diagram placeholder only in preview and blocks final rendering without safe media", () => {
    expect(
      validateScene(assetDiagramFixture, { requireResolvedAssets: true }),
    ).toContainEqual(
      expect.objectContaining({
        code: "missing_asset",
        fieldPath: "resolvedAssets.diagram",
      }),
    );
    expect(
      renderToStaticMarkup(
        createElement(LabelledDiagramSceneFrame, {
          frame: 0,
          runtimeMode: "preview",
          scene: assetDiagramFixture,
        }),
      ),
    ).toContain('data-diagram-asset-placeholder="diagram"');
    expect(() =>
      renderToStaticMarkup(
        createElement(LabelledDiagramSceneFrame, {
          frame: 0,
          runtimeMode: "render",
          scene: assetDiagramFixture,
        }),
      ),
    ).toThrow("Labelled diagram render requires a resolved diagram asset.");
    expect(() => SceneRenderRuntime({ scene: assetDiagramFixture })).toThrow(
      "Scene render blocked for resolvedAssets.diagram",
    );
    expect(
      renderToStaticMarkup(
        createElement(LabelledDiagramSceneFrame, {
          frame: 0,
          resolvedAssets: resolvedDiagramAssets,
          scene: assetDiagramFixture,
        }),
      ),
    ).toContain('data-diagram-asset-slot="diagram"');
  });

  it("keeps diagram callouts inside the frame and above the caption safe area", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      await page.setContent(
        `<style>html, body { height: 100%; margin: 0; }</style>${renderToStaticMarkup(createElement(LabelledDiagramSceneFrame, { frame: 90, scene: shapesDiagramFixture }))}`,
      );
      const outOfBounds = await page.locator("main").evaluate((main) => {
        const canvas = main.getBoundingClientRect();
        return Array.from(
          main.querySelectorAll("[data-diagram-callout]"),
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
