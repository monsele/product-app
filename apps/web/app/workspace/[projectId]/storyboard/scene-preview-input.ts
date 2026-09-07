import type {
  PreviewManifest,
  StoryboardSceneDetailResponse,
} from "@avlp/schemas";
import type { ScenePreviewInput } from "@avlp/scene-library";
import { videoTheme } from "@avlp/design-system/video-theme";

/**
 * The storyboard detail response does not carry signed media URLs. Asset-backed
 * scenes need the tenant-scoped preview manifest before mounting the player;
 * scenes without assets can still preview immediately.
 */
export function canPreviewScene(
  detail: StoryboardSceneDetailResponse,
  manifest: PreviewManifest | undefined,
): boolean {
  if (detail.status.assets === "none") return true;
  const scene = manifest?.scenes.find(
    (entry) => entry.sceneId === detail.scene.stableSceneId,
  );
  return scene !== undefined && scene.missingAssetIds.length === 0;
}

/**
 * Builds the selected-scene preview input from authoritative storyboard data
 * and a short-lived, authorized preview manifest. Audio is optional for the
 * player, allowing visual review to continue when an independently retryable
 * audio job has failed.
 */
export function buildScenePreviewInput(
  detail: StoryboardSceneDetailResponse,
  manifest: PreviewManifest | undefined,
): ScenePreviewInput {
  const media = manifest?.scenes.find(
    (entry) => entry.sceneId === detail.scene.stableSceneId,
  );
  const assetIds = new Set(
    detail.scene.scene.assetBindings.map((binding) => binding.assetId),
  );
  // PreviewManifest carries provenance for inspector UI. The Remotion input is
  // deliberately narrower and strict, so project only the fields it accepts.
  const assets = Object.fromEntries(
    Object.entries(manifest?.assets ?? {})
      .filter(([assetId]) => assetIds.has(assetId))
      .map(([assetId, asset]) => [
        assetId,
        {
          altText: asset.altText,
          assetId: asset.assetId,
          source: asset.source,
          src: asset.src,
        },
      ]),
  );
  return {
    scene: detail.scene.scene,
    manifest: {
      assets,
      ...(media?.audio.url === null || media?.audio.url === undefined
        ? {}
        : {
            audio: {
              assetId: detail.scene.stableSceneId,
              src: media.audio.url,
            },
          }),
    },
    captions: (media?.captions ?? []).map((cue) => ({
      startFrame: Math.round((cue.startMs / 1_000) * videoTheme.canvas.fps),
      endFrame: Math.round((cue.endMs / 1_000) * videoTheme.canvas.fps),
      text: cue.text,
    })),
  };
}
