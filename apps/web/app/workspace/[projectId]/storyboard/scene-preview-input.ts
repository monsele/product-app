import type { StoryboardSceneDetailResponse } from "@avlp/schemas";
import type { ScenePreviewInput } from "@avlp/scene-library";
import { videoTheme } from "@avlp/design-system/video-theme";

/**
 * A scene can only be truthfully previewed when every one of its asset
 * The storyboard detail response does not carry signed media URLs. A scene
 * with planned or bound assets must therefore show an explicit unavailable
 * state instead of passing an empty manifest to the preview validator. The
 * full Preview route owns signed-media loading through preview-manifest.
 */
export function canPreviewScene(
  detail: StoryboardSceneDetailResponse,
): boolean {
  return detail.status.assets === "none";
}

/**
 * Builds the selected-scene preview input from authoritative storyboard data
 * without fabricating captions or a transition label. Captions and transition
 * context are delivered by later stories (caption sync and the preview
 * manifest), so the preview intentionally renders neither for now.
 */
export function buildScenePreviewInput(
  detail: StoryboardSceneDetailResponse,
  captions: readonly { startMs: number; endMs: number; text: string }[] = [],
): ScenePreviewInput {
  return {
    scene: detail.scene.scene,
    manifest: { assets: {} },
    captions: captions.map((cue) => ({
      startFrame: Math.round((cue.startMs / 1_000) * videoTheme.canvas.fps),
      endFrame: Math.round((cue.endMs / 1_000) * videoTheme.canvas.fps),
      text: cue.text,
    })),
  };
}
