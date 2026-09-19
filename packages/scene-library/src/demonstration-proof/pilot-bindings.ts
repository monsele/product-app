/**
 * ST-096 — the registered pilot bindings.
 *
 * A binding is the answer to "can a recipe explain *this* lesson?", expressed
 * as registered data rather than as a guess. It names, for one curated
 * subject: which recipe explains each scene, the semantic model of that
 * scene's content, the authored events anchored to narration beats, and the
 * exact narration recording those beats were measured from.
 *
 * Three properties matter, and each is enforced rather than documented:
 *
 * 1. **Not a keyword match.** A binding is resolved by a lesson's *stable
 *    scene IDs* and its narration audio checksums, never by its title or
 *    subject text. A lesson called "Savings" that is not the curated savings
 *    lesson resolves to nothing, which is the correct answer.
 *
 * 2. **Not a copied plan.** The binding stores an event *draft* — beat
 *    anchors, durations and holds — and the plan is rebuilt by ST-095's
 *    `buildDemonstrationPlan` against whichever narration the caller supplies.
 *    If that narration is the registered recording, the rebuild reproduces the
 *    proven plan byte for byte, and `demonstration-pilot.test.ts` asserts it.
 *    If it is not, the build fails with ST-095's actionable issues instead of
 *    animating against audio it was never timed to (ADR-004).
 *
 * 3. **Not a second engine.** Everything here is data plus three calls into
 *    ST-095's public surface. There is no state evaluation, no validation rule
 *    and no geometry in this file, because ST-096's out-of-scope section says
 *    those belong to ST-095 and the only durable way to honour that is to give
 *    this module no way to express them.
 */

import { demonstrationFps } from "@avlp/schemas/demonstration-proof";
import type {
  DemonstrationEvent,
  DemonstrationExpectedFinalState,
  DemonstrationInitialState,
  DemonstrationNarrationTrack,
  DemonstrationPlan,
  DemonstrationRecipeId,
} from "@avlp/schemas/demonstration-proof";
import type { SceneSpec } from "@avlp/schemas";
import {
  buildDemonstrationPlan,
  profileInitialState,
  queryDemonstrationSupport,
  type DemonstrationEventDraft,
  type DemonstrationSupportReason,
} from "./plan-builder.js";
import {
  demonstrationSubjects,
  evaporationStandardScenes,
  evaporationTrackIds,
  savingsStandardScenes,
  savingsTrackIds,
} from "./fixtures.js";
import {
  demonstrationAssetBytes,
  demonstrationAssetLibrary,
} from "./assets.generated.js";
import { demonstrationNarrationRecord } from "./narration.js";

/** Bumped when a binding's authored content changes in a way that alters output. */
export const demonstrationBindingVersion = "st-096-binding-1" as const;

export type DemonstrationPilotSceneBinding = Readonly<{
  /**
   * The scene ID ST-095's recording was authored under.
   *
   * It is *not* the scene ID a seeded lesson will use: those are minted per
   * project, because `scenes.stable_scene_id` is globally unique. It is kept
   * because it identifies the authored scene within this registry, and because
   * the round-trip test compares rebuilt plans against ST-095's, which carry it.
   */
  sceneId: string;
  order: number;
  title: string;
  /** The full narration text, as the standard approach also states it. */
  narration: string;
  durationSeconds: number;
  recipeId: DemonstrationRecipeId;
  seed: number;
  /** The generated narration track this scene's beats were measured from. */
  narrationTrackId: string;
  narrationChecksumSha256: string;
  narrationDurationMs: number;
  initialState: DemonstrationInitialState;
  events: readonly DemonstrationEventDraft[];
  expectedFinalState: DemonstrationExpectedFinalState;
  assetBySlot: Readonly<Record<string, string>>;
}>;

export type DemonstrationPilotAsset = Readonly<{
  assetId: string;
  altText: string;
  provenance: string;
  checksumSha256: string;
  width: number;
  height: number;
  contentType: "image/png" | "image/svg+xml";
  /** Decoded bytes, for the seeding path and the usage record. */
  bytes: number;
  /** The bundled data URI the bytes are decoded from. */
  src: string;
}>;

export type DemonstrationPilotBinding = Readonly<{
  bindingId: string;
  bindingVersion: typeof demonstrationBindingVersion;
  /** A short stable key: `savings`, `evaporation`. */
  subject: string;
  label: string;
  /** The subject summary a seeded test lesson is configured with. */
  lessonTitle: string;
  scenes: readonly DemonstrationPilotSceneBinding[];
  assets: readonly DemonstrationPilotAsset[];
  /** The equivalent standard scenes, used to seed the controlled baseline. */
  standardScenes: readonly SceneSpec[];
  /** The fact inventory a reviewer checks both clips against. */
  facts: readonly string[];
}>;

/**
 * Recovers the authored draft from a plan ST-095 already validated.
 *
 * The builder derives exactly one field: `startFrame = round(beat.startMs x fps)
 * + offsetFrames`. So the authored draft is recovered by inverting that against
 * the *registered* recording the plan was built from — which is what
 * `beatStartFrames` supplies — and everything else is carried across untouched.
 *
 * Recovering the offset matters and is not bookkeeping. Several authored events
 * deliberately sit a fixed distance after their beat begins, so that a transfer
 * lands while the sentence describing it is still being spoken. Dropping the
 * offset would collapse those events onto their beat start, where they would
 * contend for the same tokens — which is precisely what ST-095's conflict and
 * source-availability rules refuse. The round trip is asserted exact in
 * `demonstration-pilot.test.ts`.
 */
function draftOf(
  event: DemonstrationEvent,
  beatStartFrames: ReadonlyMap<string, number>,
): DemonstrationEventDraft {
  const { startFrame, ...rest } = event;
  const beatStart = beatStartFrames.get(event.beatId);
  if (beatStart === undefined)
    throw new Error(
      `Event ${event.id} is anchored to beat ${event.beatId}, which the registered recording does not contain.`,
    );
  const offsetFrames = startFrame - beatStart;
  return (
    offsetFrames === 0 ? rest : { ...rest, offsetFrames }
  ) as DemonstrationEventDraft;
}

function sceneBindingsFrom(
  scenes: readonly Readonly<{
    id: string;
    order: number;
    title: string;
    narration: string;
    durationSeconds: number;
    plan: DemonstrationPlan;
    assetBySlot: Readonly<Record<string, string>>;
  }>[],
  trackIds: readonly string[],
): readonly DemonstrationPilotSceneBinding[] {
  return Object.freeze(
    scenes.map((scene, index) => {
      const trackId = trackIds[index];
      if (trackId === undefined)
        throw new Error(
          `Scene ${scene.id} has no registered narration track; the binding and the fixture disagree.`,
        );
      const record = demonstrationNarrationRecord(trackId);
      if (record.sceneId !== scene.id)
        throw new Error(
          `Narration track ${trackId} belongs to scene ${record.sceneId}, not ${scene.id}.`,
        );
      const beatStartFrames = new Map(
        record.beats.map((beat) => [
          beat.beatId,
          Math.round((beat.startMs / 1_000) * demonstrationFps),
        ]),
      );
      return Object.freeze({
        assetBySlot: Object.freeze({ ...scene.assetBySlot }),
        durationSeconds: scene.durationSeconds,
        events: Object.freeze(
          scene.plan.events.map((event) => draftOf(event, beatStartFrames)),
        ),
        expectedFinalState: scene.plan.expectedFinalState,
        initialState: scene.plan.initialState,
        narration: scene.narration,
        narrationChecksumSha256: record.checksumSha256,
        narrationDurationMs: record.durationMs,
        narrationTrackId: trackId,
        order: scene.order,
        recipeId: scene.plan.recipe.id,
        sceneId: scene.id,
        seed: scene.plan.seed,
        title: scene.title,
      });
    }),
  );
}

function contentTypeOf(src: string): "image/png" | "image/svg+xml" {
  if (src.startsWith("data:image/svg+xml;")) return "image/svg+xml";
  if (src.startsWith("data:image/png;")) return "image/png";
  throw new Error("A pilot asset must be a bundled PNG or SVG data URI.");
}

function assetsFor(
  scenes: readonly DemonstrationPilotSceneBinding[],
): readonly DemonstrationPilotAsset[] {
  const ids = new Set<string>();
  for (const scene of scenes)
    for (const assetId of Object.values(scene.assetBySlot)) ids.add(assetId);
  return Object.freeze(
    [...ids].sort().map((assetId) => {
      const asset = demonstrationAssetLibrary[assetId];
      const bytes = demonstrationAssetBytes[assetId];
      if (asset === undefined || bytes === undefined)
        throw new Error(`No generated demonstration asset "${assetId}".`);
      return Object.freeze({
        altText: asset.altText,
        assetId,
        bytes,
        checksumSha256: asset.checksumSha256,
        contentType: contentTypeOf(asset.src),
        height: asset.height,
        provenance: asset.provenance,
        src: asset.src,
        width: asset.width,
      });
    }),
  );
}

function bindingFor(
  subject: "savings" | "evaporation",
  lessonTitle: string,
  trackIds: readonly string[],
  standardScenes: readonly SceneSpec[],
): DemonstrationPilotBinding {
  const entry = demonstrationSubjects[subject];
  const scenes = sceneBindingsFrom(entry.demonstration.scenes, trackIds);
  return Object.freeze({
    assets: assetsFor(scenes),
    bindingId: `st-096-${subject}`,
    bindingVersion: demonstrationBindingVersion,
    facts: entry.facts,
    label: entry.label,
    lessonTitle,
    scenes,
    standardScenes: Object.freeze(standardScenes.map((scene) => ({ ...scene }))),
    subject,
  });
}

export const demonstrationPilotBindings: readonly DemonstrationPilotBinding[] =
  Object.freeze([
    bindingFor(
      "savings",
      "Saving a little, every week",
      savingsTrackIds,
      savingsStandardScenes,
    ),
    bindingFor(
      "evaporation",
      "Why a puddle disappears",
      evaporationTrackIds,
      evaporationStandardScenes,
    ),
  ]);

export function findDemonstrationPilotBinding(
  subject: string,
): DemonstrationPilotBinding | undefined {
  return demonstrationPilotBindings.find(
    (binding) => binding.subject === subject,
  );
}

/**
 * Resolves a lesson to a binding by its ordered narration recordings.
 *
 * The match is on **audio checksums**, not scene IDs. A scene ID identifies a
 * scene inside one lesson and is minted per project — `scenes.stable_scene_id`
 * is globally unique, so two projects of the same curated subject cannot share
 * one. What they do share, and what actually matters, is the recording: the
 * measured beats this animation was timed against are properties of those
 * exact bytes, so the checksum is the thing worth matching on.
 *
 * Exact set *and* order equality is required. A lesson that reorders, adds or
 * drops a scene is a different lesson, and the honest answer is that no
 * registered recipe explains it — not a partial animation over the scenes that
 * happen to match.
 */
export function resolveDemonstrationPilotBinding(
  narrationChecksums: readonly string[],
): DemonstrationPilotBinding | undefined {
  return demonstrationPilotBindings.find(
    (binding) =>
      binding.scenes.length === narrationChecksums.length &&
      binding.scenes.every(
        (scene, index) =>
          scene.narrationChecksumSha256 === narrationChecksums[index],
      ),
  );
}

export type DemonstrationPilotPlanIssue = Readonly<{
  code: string;
  message: string;
  suggestedCorrection: string;
  sceneId?: string;
}>;

export type DemonstrationPilotBuildResult = Readonly<{
  issues: readonly DemonstrationPilotPlanIssue[];
  plans?: readonly Readonly<{
    sceneId: string;
    recipeId: DemonstrationRecipeId;
    plan: DemonstrationPlan;
  }>[];
}>;

function reasonIssue(
  reason: DemonstrationSupportReason,
  sceneId: string,
): DemonstrationPilotPlanIssue {
  return Object.freeze({
    code: reason.code,
    message: reason.message,
    sceneId,
    suggestedCorrection: reason.suggestedCorrection,
  });
}

/**
 * Asks the recipe, then builds — in that order, for every scene.
 *
 * The support query runs first because it is the cheap structural check and
 * its refusals name the missing *structure*, which is more useful to a teacher
 * than a downstream validation failure about a specific event. Both refusals
 * are returned as issues; neither ever produces a partial plan, because half a
 * demonstration is not a demonstration.
 *
 * `narrationBySceneId` comes from the caller — in production, from the
 * lesson's own scene audio, after the caller has verified each recording's
 * checksum against the binding. This function does not reach for the bundled
 * recording itself, so it cannot accidentally plan against audio the lesson
 * does not actually have.
 */
export function buildDemonstrationPilotPlans(
  binding: DemonstrationPilotBinding,
  /** The lesson's own scene IDs, in the binding's scene order. */
  lessonSceneIds: readonly string[],
  narrationBySceneId: Readonly<Record<string, DemonstrationNarrationTrack>>,
): DemonstrationPilotBuildResult {
  const issues: DemonstrationPilotPlanIssue[] = [];
  const plans: Array<{
    sceneId: string;
    recipeId: DemonstrationRecipeId;
    plan: DemonstrationPlan;
  }> = [];

  if (lessonSceneIds.length !== binding.scenes.length)
    return Object.freeze({
      issues: Object.freeze([
        Object.freeze({
          code: "scene_count_mismatch",
          message: `This lesson has ${lessonSceneIds.length} scenes; the registered ${binding.label} demonstration covers ${binding.scenes.length}.`,
          suggestedCorrection:
            "Open a supported test lesson, or keep this lesson on the standard explanation.",
        }),
      ]),
    });

  for (const [index, scene] of binding.scenes.entries()) {
    const lessonSceneId = lessonSceneIds[index]!;
    const narration = narrationBySceneId[lessonSceneId];
    if (narration === undefined) {
      issues.push(
        Object.freeze({
          code: "missing_narration_track",
          message: `Scene "${scene.title}" has no prepared narration recording.`,
          sceneId: lessonSceneId,
          suggestedCorrection:
            "Generate this scene's narration audio and captions, then try again.",
        }),
      );
      continue;
    }

    const support = queryDemonstrationSupport(
      scene.recipeId,
      profileInitialState(scene.initialState, scene.durationSeconds),
    );
    if (!support.supported) {
      for (const reason of support.reasons)
        issues.push(reasonIssue(reason, lessonSceneId));
      continue;
    }

    const built = buildDemonstrationPlan(
      {
        durationSeconds: scene.durationSeconds,
        events: scene.events,
        expectedFinalState: scene.expectedFinalState,
        initialState: scene.initialState,
        recipeId: scene.recipeId,
        sceneId: lessonSceneId,
        seed: scene.seed,
      },
      narration,
    );
    if (built.plan === undefined) {
      for (const issue of built.issues)
        issues.push(
          Object.freeze({
            code: issue.code,
            message: issue.message,
            sceneId: lessonSceneId,
            suggestedCorrection: issue.suggestedCorrection,
          }),
        );
      continue;
    }
    plans.push({
      plan: built.plan,
      recipeId: scene.recipeId,
      sceneId: lessonSceneId,
    });
  }

  return issues.length > 0
    ? Object.freeze({ issues: Object.freeze(issues) })
    : Object.freeze({
        issues: Object.freeze([]),
        plans: Object.freeze(plans),
      });
}
