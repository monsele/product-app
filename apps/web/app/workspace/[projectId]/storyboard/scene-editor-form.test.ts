import {
  createDefaultStoryboardSceneSpec,
  sceneSpecSchema,
  type SceneSpec,
} from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import {
  editorFieldsForScene,
  isGraphShapeScene,
  writeAssetSlot,
} from "./scene-editor-form";

const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";
const suggestedAssetId = "019ffbf1-a001-7000-8000-000000000001";
const teacherAssetId = "019ffbf1-a002-7000-8000-000000000001";

describe("writeAssetSlot", () => {
  it("restores the suggested binding after a teacher replacement", () => {
    const suggested = writeAssetSlot(
      createDefaultStoryboardSceneSpec("definition", {
        id: sceneId,
        order: 1,
        durationSeconds: 30,
      }),
      "diagram",
      suggestedAssetId,
    );
    const replacement = writeAssetSlot(suggested, "diagram", teacherAssetId);
    const restored = writeAssetSlot(replacement, "diagram", suggestedAssetId);

    expect(replacement.assetBindings).toEqual([
      expect.objectContaining({ assetId: teacherAssetId, slot: "diagram" }),
    ]);
    expect(restored.assetBindings).toEqual([
      expect.objectContaining({ assetId: suggestedAssetId, slot: "diagram" }),
    ]);
  });
});

describe("editorFieldsForScene (ST-087 graph shape)", () => {
  const graphProcess = sceneSpecSchema.parse({
    ...createDefaultStoryboardSceneSpec("process", {
      id: sceneId,
      order: 1,
      durationSeconds: 20,
    }),
    visual: {
      nodes: [
        { id: "a", label: "Start" },
        { id: "b", label: "End" },
      ],
      edges: [{ id: "e1", from: "a", to: "b" }],
    },
  }) as SceneSpec;

  it("recognises a graph-shape process scene", () => {
    expect(isGraphShapeScene(graphProcess)).toBe(true);
    expect(
      isGraphShapeScene(
        createDefaultStoryboardSceneSpec("process", {
          id: sceneId,
          order: 1,
          durationSeconds: 20,
        }),
      ),
    ).toBe(false);
  });

  it("hides the legacy `visual.steps` field for a graph-shape scene", () => {
    const legacy = createDefaultStoryboardSceneSpec("process", {
      id: sceneId,
      order: 1,
      durationSeconds: 20,
    });
    expect(
      editorFieldsForScene(legacy).map((field) => field.path),
    ).toContain("visual.steps");
    const graphPaths = editorFieldsForScene(graphProcess).map(
      (field) => field.path,
    );
    expect(graphPaths).not.toContain("visual.steps");
    // Narration / title stay editable.
    expect(graphPaths).toContain("narration");
  });
});
