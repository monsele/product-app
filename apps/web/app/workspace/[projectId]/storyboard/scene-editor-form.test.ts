import { createDefaultStoryboardSceneSpec } from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import { writeAssetSlot } from "./scene-editor-form";

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
