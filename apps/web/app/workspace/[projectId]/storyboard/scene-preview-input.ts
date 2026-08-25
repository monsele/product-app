import type { StoryboardSceneDetailResponse } from "@avlp/schemas";
import type { ScenePreviewInput } from "@avlp/scene-library";
import { videoTheme } from "@avlp/design-system/video-theme";

/**
 * A scene can only be truthfully previewed when every one of its asset
 * bindings has a resolved manifest entry. Until the preview-manifest endpoint
 * lands (ST-065), storyboard scenes never carry resolved media, so any scene
 * with asset bindings must show an explicit "unavailable" state instead of a
 * broken preview player.
 */
export function canPreviewScene(
  detail: StoryboardSceneDetailResponse,
): boolean {
  return detail.scene.scene.assetBindings.length === 0;
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
