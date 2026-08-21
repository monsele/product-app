import { describe, expect, it } from "vitest";
import type { StoryboardSceneDetailResponse } from "@avlp/schemas";
import { buildScenePreviewInput, canPreviewScene } from "./scene-preview-input";

const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";

function detailWithBindings(
  assetBindings: StoryboardSceneDetailResponse["scene"]["scene"]["assetBindings"],
): StoryboardSceneDetailResponse {
  return {
    scene: {
      id: sceneId,
      stableSceneId: sceneId,
      order: 1,
      template: "definition",
      durationSeconds: 30,
      narrationBlockIds: ["019ffbf1-6131-738a-b087-6775ff97568c"],
      assetRequirements: [],
      scene: {
        id: sceneId,
        order: 1,
        narration: "Water evaporates when heated.",
        durationSeconds: 30,
        onScreenText: [],
        transition: "cut",
        assetBindings,
        sourceRefs: [],
        generatedAdditions: [],
        template: "definition",
        visual: { term: "Evaporation", definition: "Water becomes vapour." },
      },
    },
    status: {
      assets: assetBindings.length > 0 ? "resolved" : "none",
      audio: "not_generated",
      validation: "ok",
      stale: false,
    },
  };
}

describe("canPreviewScene", () => {
  it("allows a scene without asset bindings", () => {
    expect(canPreviewScene(detailWithBindings([]))).toBe(true);
  });

  it("blocks a scene with asset bindings until media is resolved", () => {
    const binding = {
      assetId: "019ffbf1-eeee-7000-8000-000000000099",
      role: "illustration" as const,
      slot: "visual-example",
    };
    expect(canPreviewScene(detailWithBindings([binding]))).toBe(false);
  });
});

describe("buildScenePreviewInput", () => {
  it("uses the authoritative scene spec with an empty manifest", () => {
    const input = buildScenePreviewInput(detailWithBindings([]));
    expect(input.scene.narration).toBe("Water evaporates when heated.");
    expect(input.manifest.assets).toEqual({});
    expect(input.manifest.audio).toBeUndefined();
    expect(input.captions).toEqual([]);
    expect(input.transitionContext).toBeUndefined();
  });
});
