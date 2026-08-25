import {
  fullLessonCompositionPropsSchema,
  photosynthesisThreeMinutePreview,
  type FullLessonCompositionProps,
} from "@avlp/scene-library";
import {
  assertFixtureIntegrity,
  manualLessonFixtureId,
  type RenderJobPayload,
} from "./contracts.js";
import { lessonSpecSchema } from "@avlp/schemas";
import { type ObjectStorage } from "@avlp/storage";

function deepFreeze<T>(value: T): Readonly<T> {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export function loadImmutableFixture(
  payload: RenderJobPayload,
): Readonly<FullLessonCompositionProps> {
  if (payload.fixtureId === undefined) {
    const snapshot = payload.manifest?.snapshot as
      { lessonSpec?: unknown } | undefined;
    const lesson = lessonSpecSchema.parse(snapshot?.lessonSpec);
    return deepFreeze(
      fullLessonCompositionPropsSchema.parse({
        assets: {},
        captions: [],
        lesson,
        narrationTracks: lesson.scenes.map((scene) => ({
          kind: "deterministic-silence" as const,
          sceneId: scene.id,
        })),
      }),
    );
  }
  if (payload.fixtureId !== manualLessonFixtureId)
    throw new Error("The requested render fixture is not registered.");
  const composition = fullLessonCompositionPropsSchema.parse(
    globalThis.structuredClone(photosynthesisThreeMinutePreview),
  );
  assertFixtureIntegrity(payload, composition);
  return deepFreeze(composition);
}

/** Resolves private, checksum-verified narration only inside the renderer.
 * Signed URLs are intentionally never persisted in the job manifest or logs. */
export async function hydrateProductionComposition(
  payload: RenderJobPayload,
  composition: Readonly<FullLessonCompositionProps>,
  storage: ObjectStorage,
): Promise<Readonly<FullLessonCompositionProps>> {
  if (payload.manifest === undefined) return composition;
  const expectedSceneIds = new Set(
    composition.lesson.scenes.map((scene) => scene.id),
  );
  const audio = await Promise.all(
    payload.manifest.audio.map(async (entry) => ({
      sceneId: entry.sceneId,
      src: (
        await storage.createSignedDownload({
          key: entry.storageKey,
          expiresInSeconds: 3_600,
        })
      ).url,
    })),
  );
  if (
    audio.length !== expectedSceneIds.size ||
    audio.some(({ sceneId }) => !expectedSceneIds.delete(sceneId)) ||
    expectedSceneIds.size !== 0
  )
    throw new Error("The production manifest audio does not cover the lesson.");
  const expectedAssetIds = new Set(
    composition.lesson.scenes.flatMap((scene) =>
      scene.assetBindings.map((binding) => binding.assetId),
    ),
  );
  const visualAssets = await Promise.all(
    payload.manifest.visualAssets.map(async (asset) => {
      if (!expectedAssetIds.delete(asset.assetId))
        throw new Error(
          "The production manifest assets do not match the immutable lesson.",
        );
      if (asset.source === "library")
        return [
          asset.assetId,
          {
            assetId: asset.assetId,
            altText: asset.altText,
            source: "library" as const,
            src: asset.staticLocation,
          },
        ] as const;
      const signed = await storage.createSignedDownload({
        key: asset.storageKey,
        expiresInSeconds: 3_600,
      });
      return [
        asset.assetId,
        {
          assetId: asset.assetId,
          altText: asset.altText,
          source: "source" as const,
          src: signed.url,
        },
      ] as const;
    }),
  );
  if (expectedAssetIds.size !== 0)
    throw new Error(
      "The production manifest is missing a bound immutable lesson asset.",
    );
  return deepFreeze(
    fullLessonCompositionPropsSchema.parse({
      ...composition,
      assets: Object.fromEntries(visualAssets),
      captions: payload.manifest.captions,
      narrationTracks: audio.map((entry) => ({
        kind: "browser-audio" as const,
        sceneId: entry.sceneId,
        src: entry.src,
      })),
    }),
  );
}
