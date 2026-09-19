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
import {
  demonstrationCompositionPropsSchema,
  type DemonstrationCompositionProps,
} from "@avlp/schemas/demonstration-proof";
import {
  demonstrationVariantPlanSchema,
  type DemonstrationVariantPlan,
} from "@avlp/schemas/demonstration-pilot";
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
      { lessonSpec?: unknown; creativeDesign?: unknown } | undefined;
    const lesson = lessonSpecSchema.parse(snapshot?.lessonSpec);
    return deepFreeze(
      fullLessonCompositionPropsSchema.parse({
        assets: {},
        captions: [],
        ...(snapshot?.creativeDesign &&
        typeof snapshot.creativeDesign === "object" &&
        snapshot.creativeDesign !== null &&
        "manifest" in snapshot.creativeDesign
          ? { creativeDesign: snapshot.creativeDesign.manifest }
          : {}),
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

/** A demonstration plan owns the exact caption stream it was validated with. */
export function hasMatchingDemonstrationCaptions(
  plan: Pick<DemonstrationVariantPlan, "captions">,
  captions: unknown,
): boolean {
  return JSON.stringify(plan.captions) === JSON.stringify(captions);
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
  // A selected logo is a first-class resolved asset even though it is not a
  // scene binding. Its signed URL is created here, at render time, alongside
  // every other tenant-owned image.
  if (composition.creativeDesign?.settings.logoAssetId !== null &&
      composition.creativeDesign?.settings.logoAssetId !== undefined)
    expectedAssetIds.add(composition.creativeDesign.settings.logoAssetId);
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
      if (asset.source === "source_table")
        return [
          asset.assetId,
          {
            assetId: asset.assetId,
            altText: asset.altText,
            source: "source_table" as const,
            table: asset.table,
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

/**
 * ST-096 — resolves a demonstration variant's composition props.
 *
 * The shape of the work is deliberately identical to
 * `hydrateProductionComposition`: take the immutable manifest, sign each piece
 * of tenant-owned media at the last possible moment, and parse the result
 * through the runtime's own contract before anything is drawn. Nothing about
 * the plan is recomputed here — the events, their frames and the declared end
 * state all come from the variant record the API resolved and persisted, which
 * is what CR-01 means by "rendering consumes validated, resolved choices".
 *
 * The narration and caption identities come from the *same* manifest fields the
 * standard approach uses, not from a second copy, so a pair cannot drift into
 * disagreeing about what was said or when.
 */
export async function hydrateDemonstrationComposition(
  payload: RenderJobPayload,
  storage: ObjectStorage,
): Promise<Readonly<DemonstrationCompositionProps>> {
  const manifest = payload.manifest;
  if (manifest === undefined)
    throw new Error("A demonstration render requires a production manifest.");
  const plan = demonstrationVariantPlanSchema.parse(manifest.demonstration);

  // The plan is the immutable caption input the demonstration composition
  // displays. A manifest rebuilt from newer caption rows would otherwise let a
  // worker render two clips with different words/timing and only discover the
  // mismatch after spending the render. Reject before signing or rendering.
  if (!hasMatchingDemonstrationCaptions(plan, manifest.captions))
    throw new Error(
      "The demonstration plan was built against different captions.",
    );

  const audioBySceneId = new Map(
    manifest.audio.map((entry) => [entry.sceneId, entry]),
  );
  const narrationTracks = await Promise.all(
    plan.scenes.map(async (scene) => {
      const audio = audioBySceneId.get(scene.sceneId);
      if (audio === undefined)
        throw new Error(
          "The demonstration plan names a scene the manifest has no narration for.",
        );
      // The plan's own recorded checksum must be the manifest's, or the
      // animation was timed against different audio than the one about to be
      // played over it (ADR-004).
      if (audio.checksumSha256 !== scene.audio.checksumSha256)
        throw new Error(
          "The demonstration plan was timed against different narration audio.",
        );
      const signed = await storage.createSignedDownload({
        key: audio.storageKey,
        expiresInSeconds: 3_600,
      });
      return {
        beats: scene.audio.beats.map((beat) => ({ ...beat })),
        checksumSha256: audio.checksumSha256,
        durationMs: scene.audio.durationMs,
        sceneId: scene.sceneId,
        src: signed.url,
        timingProvenance: scene.audio.timingProvenance,
      };
    }),
  );

  const assets = Object.fromEntries(
    await Promise.all(
      plan.assets.map(async (asset) => {
        const signed = await storage.createSignedDownload({
          key: asset.storageKey,
          expiresInSeconds: 3_600,
        });
        return [
          asset.assetId,
          {
            altText: asset.altText,
            assetId: asset.assetId,
            checksumSha256: asset.checksumSha256,
            height: asset.height,
            provenance: asset.provenance,
            src: signed.url,
            width: asset.width,
          },
        ] as const;
      }),
    ),
  );

  return deepFreeze(
    demonstrationCompositionPropsSchema.parse({
      approach: "demonstration",
      assets,
      captions: plan.captions.map((cue) => ({ ...cue })),
      fixtureId: plan.bindingId,
      narrationTracks,
      scenes: plan.scenes.map((scene) => ({
        assetBySlot: { ...scene.assetBySlot },
        durationSeconds: scene.durationSeconds,
        id: scene.sceneId,
        narration: scene.narration,
        order: scene.order,
        plan: scene.plan,
        title: scene.title,
      })),
    }),
  );
}
