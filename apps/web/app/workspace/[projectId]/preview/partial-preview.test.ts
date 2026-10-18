import { describe, expect, it } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  type PreviewManifest,
} from "@avlp/schemas";
import { fullLessonCompositionPropsSchema } from "@avlp/scene-library";
import { partialPreviewManifest } from "./partial-preview";
import { previewPlayerInput } from "./preview-player";

function fixture(): PreviewManifest {
  const scenes = [1, 2].map((order) => {
    const scene = createDefaultStoryboardSceneSpec("hook", {
      id: `01989a3d-8e00-7000-8000-${String(order).padStart(12, "0")}`,
      order,
      durationSeconds: 30,
    });
    return {
      id: scene.id,
      stableSceneId: scene.id,
      order,
      durationSeconds: 30,
      template: scene.template,
      narrationBlockIds: [],
      assetRequirements: [],
      scene,
    };
  });
  return {
    assets: {},
    canvas: { fps: 30, width: 1920, height: 1080 },
    generatedAt: new Date().toISOString(),
    storyboard: { scenes },
    scenes: scenes.map((scene) => ({
      sceneId: scene.id,
      audio: {
        status: "ready",
        url: "https://example.test/audio",
        expiresAt: null,
      },
      captions: [{ startMs: 0, endMs: 1000, text: "Caption" }],
      missingAssetIds: [],
      stale: false,
    })),
  } as unknown as PreviewManifest;
}
describe("partial preview projection", () => {
  it("isolates an invalid scene and preserves the other scene without changing stored input", () => {
    const manifest = fixture();
    manifest.storyboard.scenes[0]!.scene.narration = "";
    const result = partialPreviewManifest(manifest);
    expect(Object.keys(result.unavailableScenes)).toEqual([
      manifest.storyboard.scenes[0]!.scene.id,
    ]);
    expect(result.manifest.storyboard.scenes[1]).toEqual(
      manifest.storyboard.scenes[1],
    );
    expect(result.manifest.scenes[0]).toMatchObject({
      audio: { url: null },
      captions: [],
    });
    expect(manifest.storyboard.scenes[0]!.scene.narration).toBe("");
    expect(
      fullLessonCompositionPropsSchema.safeParse(
        previewPlayerInput(result.manifest),
      ).success,
    ).toBe(true);
  });
  it("labels missing evidence and never plays stale narration or captions", () => {
    const manifest = fixture();
    manifest.scenes[0]!.missingAssetIds = [manifest.scenes[0]!.sceneId];
    manifest.scenes[1]!.audio.status = "stale";
    const result = partialPreviewManifest(manifest);
    expect(result.unavailableScenes[manifest.scenes[0]!.sceneId]).toContain(
      "required visual",
    );
    expect(
      result.manifest.scenes.every(
        (scene) => scene.audio.url === null && scene.captions.length === 0,
      ),
    ).toBe(true);
  });
});
