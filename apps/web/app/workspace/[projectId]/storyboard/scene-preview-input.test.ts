import { describe, expect, it } from "vitest";
import type {
  PreviewManifest,
  StoryboardSceneDetailResponse,
} from "@avlp/schemas";
import { parseScenePreviewInput } from "@avlp/scene-library";
import { buildScenePreviewInput, canPreviewScene } from "./scene-preview-input";

const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";
const assetId = "019ffbf1-eeee-7000-8000-000000000099";

const resolvedManifest: PreviewManifest = {
  assets: {
    [assetId]: {
      assetId,
      altText: "Evaporation illustration",
      provenance: "ai_generated",
      source: "source",
      src: "https://storage.example.test/evaporation.png",
    },
  },
  canvas: { fps: 30, height: 1080, width: 1920 },
  generatedAt: "2026-09-07T10:00:00.000Z",
  scenes: [
    {
      sceneId,
      audio: {
        status: "failed",
        url: null,
        expiresAt: null,
      },
      captions: [],
      missingAssetIds: [],
      stale: true,
    },
  ],
  storyboard: {} as PreviewManifest["storyboard"],
};

const sourceTableManifest: PreviewManifest = {
  ...resolvedManifest,
  assets: {
    [assetId]: {
      assetId,
      altText: "Table: Pillar, Action",
      provenance: "source_table",
      source: "source_table",
      table: {
        tableId: assetId,
        columns: ["Pillar", "Action"],
        rows: [["Budgeting", "Track spending"]],
        rowCount: 1,
        truncated: false,
      },
    },
  },
};

function detailWithBindings(
  assetBindings: StoryboardSceneDetailResponse["scene"]["scene"]["assetBindings"],
  assetRequirements: StoryboardSceneDetailResponse["scene"]["assetRequirements"] = [],
): StoryboardSceneDetailResponse {
  return {
    sceneRevision: 0,
    scene: {
      id: sceneId,
      stableSceneId: sceneId,
      order: 1,
      template: "definition",
      durationSeconds: 30,
      narrationBlockIds: ["019ffbf1-6131-738a-b087-6775ff97568c"],
      assetRequirements,
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
      assets:
        assetBindings.length > 0
          ? "resolved"
          : assetRequirements.length > 0
            ? "planned"
            : "none",
      audio: "not_generated",
      captions: "not_generated",
      validation: "ok",
      stale: false,
    },
  };
}

describe("canPreviewScene", () => {
  it("allows a scene without asset bindings", () => {
    expect(canPreviewScene(detailWithBindings([]), undefined)).toBe(true);
  });

  it("blocks a scene with asset bindings until media is resolved", () => {
    const binding = {
      assetId,
      role: "illustration" as const,
      slot: "visual-example",
    };
    expect(canPreviewScene(detailWithBindings([binding]), undefined)).toBe(
      false,
    );
    expect(
      canPreviewScene(detailWithBindings([binding]), resolvedManifest),
    ).toBe(true);
  });

  it("blocks a scene with planned assets before a binding exists", () => {
    expect(
      canPreviewScene(
        detailWithBindings(
          [],
          [{ slot: "visual-example", purpose: "A supporting illustration." }],
        ),
        undefined,
      ),
    ).toBe(false);
  });
});

describe("buildScenePreviewInput", () => {
  it("uses the authoritative scene spec with an empty manifest", () => {
    const input = buildScenePreviewInput(detailWithBindings([]), undefined);
    expect(input.scene.narration).toBe("Water evaporates when heated.");
    expect(input.manifest.assets).toEqual({});
    expect(input.manifest.audio).toBeUndefined();
    expect(input.captions).toEqual([]);
    expect(input.transitionContext).toBeUndefined();
  });

  it("uses authorized resolved media while allowing an audio retry", () => {
    const binding = {
      assetId,
      role: "illustration" as const,
      slot: "visual-example",
    };
    const input = buildScenePreviewInput(
      detailWithBindings([binding]),
      resolvedManifest,
    );

    expect(input.manifest.assets).toEqual({
      [assetId]: {
        assetId,
        altText: "Evaporation illustration",
        source: "source",
        src: "https://storage.example.test/evaporation.png",
      },
    });
    expect(input.manifest.audio).toBeUndefined();
    expect(input.captions).toEqual([]);
    expect(parseScenePreviewInput(input).ok).toBe(true);
  });

  it("preserves structured source-table assets for the scene player", () => {
    const input = buildScenePreviewInput(
      detailWithBindings([
        {
          assetId,
          role: "diagram",
          slot: "diagram",
        },
      ]),
      sourceTableManifest,
    );

    expect(input.manifest.assets[assetId]).toEqual({
      assetId,
      altText: "Table: Pillar, Action",
      source: "source_table",
      src: undefined,
      table: {
        tableId: assetId,
        columns: ["Pillar", "Action"],
        rows: [["Budgeting", "Track spending"]],
        rowCount: 1,
        truncated: false,
      },
    });
    expect(parseScenePreviewInput(input).ok).toBe(true);
  });
});
