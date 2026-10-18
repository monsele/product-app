import {
  createDefaultStoryboardSceneSpec,
  sceneSpecSchema,
  isCreativeDesignManifestV2,
  type PreviewManifest,
} from "@avlp/schemas";

/** Derived browser-only placeholders. Never persisted or used for rendering. */
export function partialPreviewManifest(manifest: PreviewManifest) {
  const unavailableScenes: Record<string, string> = {};
  let replacedInvalidScene = false;
  const scenes = manifest.storyboard.scenes.map((entry) => {
    const media = manifest.scenes.find(
      (item) => item.sceneId === entry.stableSceneId,
    );
    const missingSlot = entry.assetRequirements.some((requirement) => !entry.scene.assetBindings.some((binding) => binding.slot === requirement.slot));
    const hero = isCreativeDesignManifestV2(manifest.creativeDesign) ? manifest.creativeDesign.scenes[entry.scene.id]?.imagery.hero : null;
    if (media?.missingAssetIds.length || missingSlot || (hero && !manifest.assets[hero.assetId]))
      unavailableScenes[entry.scene.id] =
        "A required visual is unavailable. Review this scene’s Visual tab.";
    if (sceneSpecSchema.safeParse(entry.scene).success) return entry;
    replacedInvalidScene = true;
    unavailableScenes[entry.scene.id] =
      "This scene needs a content review. Other scenes remain available.";
    return {
      ...entry,
      scene: createDefaultStoryboardSceneSpec("hook", {
        id: entry.scene.id,
        order: entry.order,
        durationSeconds: entry.durationSeconds,
      }),
    };
  });
  const safe: PreviewManifest = {
    ...manifest,
    storyboard: { ...manifest.storyboard, scenes },
    scenes: manifest.scenes.map((entry) => {
      const scene = scenes.find(
        (candidate) => candidate.stableSceneId === entry.sceneId,
      );
      const unavailable = scene && unavailableScenes[scene.scene.id];
      const current = entry.audio.status === "ready" && !unavailable;
      return {
        ...entry,
        audio: { ...entry.audio, url: current ? entry.audio.url : null },
        captions: current
          ? entry.captions.filter(
              (cue) =>
                cue.startMs >= 0 &&
                cue.endMs > cue.startMs &&
                cue.endMs <= (scene?.durationSeconds ?? 0) * 1000,
            )
          : [],
      };
    }),
  };
  if (replacedInvalidScene) delete safe.creativeDesign;
  return { manifest: safe, unavailableScenes };
}
