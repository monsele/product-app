/**
 * ST-095 — the support query and the plan builder.
 *
 * These two functions are the surface ST-096 consumes. Between them they
 * answer "can this recipe explain this content?" and "produce the immutable
 * plan that says exactly how", and nothing else in this package needs to be
 * imported to adapt a tenant-owned record.
 *
 * The support query is a **pure capability check**. It looks at the structure
 * of the content — which objects exist, in which roles, how many — and never at
 * what the lesson is called. Deciding support from a keyword in a title is the
 * failure mode the story calls out by name, and it is also the one that would
 * silently produce a confident, wrong animation for an unrelated subject.
 *
 * Authorisation, tenancy and persistence are deliberately absent. Whether a
 * given teacher may run this recipe is ST-096's question; whether the recipe
 * *can* run is this one.
 */

import {
  demonstrationFps,
  demonstrationPlanSchema,
  demonstrationPlanVersion,
  demonstrationRecipeVersion,
  type DemonstrationEvent,
  type DemonstrationExpectedFinalState,
  type DemonstrationInitialState,
  type DemonstrationIssue,
  type DemonstrationNarrationTrack,
  type DemonstrationPlan,
  type DemonstrationRecipeId,
} from "@avlp/schemas/demonstration-proof";
import {
  demonstrationPlacementOverflows,
  demonstrationRecipes,
  findDemonstrationRecipe,
  type DemonstrationRecipeMetadata,
} from "./registry.js";
import {
  demonstrationSchemaIssues,
  validateDemonstrationPlan,
} from "./validation.js";

// ---------------------------------------------------------------------------
// Support query
// ---------------------------------------------------------------------------

export type DemonstrationSupportReason = Readonly<{
  code:
    | "unknown_recipe"
    | "unsupported_recipe_version"
    | "missing_object_kind"
    | "missing_container_role"
    | "missing_region_role"
    | "too_many_for_recipe"
    | "scene_too_short";
  message: string;
  /** What the caller would have to change for support to become true. */
  suggestedCorrection: string;
}>;

export type DemonstrationSupportResult = Readonly<{
  supported: boolean;
  recipeId: string;
  reasons: readonly DemonstrationSupportReason[];
}>;

/**
 * The structural shape a caller offers up for a support check.
 *
 * Note what it does not contain: no title, no narration text, no topic label.
 * There is nothing here a keyword match could latch onto, which is the point.
 */
export type DemonstrationContentProfile = Readonly<{
  durationSeconds: number;
  objectKindCounts: Readonly<Record<string, number>>;
  /**
   * Counts per role rather than a set of roles.
   *
   * The recipes lay out by role, so "has a source" and "has three sources" are
   * different questions and only the second one catches content the stage has
   * no room for. A set could answer the first and silently passed the second.
   */
  containerRoleCounts: Readonly<Record<string, number>>;
  regionRoleCounts: Readonly<Record<string, number>>;
}>;

export function queryDemonstrationSupport(
  recipeId: string,
  content: DemonstrationContentProfile,
  recipeVersion: string = demonstrationRecipeVersion,
): DemonstrationSupportResult {
  const recipe = findDemonstrationRecipe(recipeId);
  if (recipe === undefined)
    return Object.freeze({
      supported: false,
      recipeId,
      reasons: Object.freeze([
        Object.freeze({
          code: "unknown_recipe" as const,
          message: `No registered recipe with ID ${recipeId}.`,
          suggestedCorrection: `Choose one of: ${demonstrationRecipes
            .map((entry) => entry.id)
            .join(", ")}.`,
        }),
      ]),
    });

  const reasons: DemonstrationSupportReason[] = [];

  if (recipe.version !== recipeVersion)
    reasons.push(
      Object.freeze({
        code: "unsupported_recipe_version" as const,
        message: `This implementation provides ${recipe.id}@${recipe.version}, not @${recipeVersion}.`,
        suggestedCorrection:
          "Pin a version this implementation provides, or retain the bundle that published the requested one. A newer recipe is never substituted for an older one.",
      }),
    );

  for (const [kind, minimum] of Object.entries(recipe.requires.minimumOf)) {
    const actual = content.objectKindCounts[kind] ?? 0;
    if (actual < minimum)
      reasons.push(
        Object.freeze({
          code: "missing_object_kind" as const,
          message: `${recipe.id} needs at least ${minimum} ${kind} object(s); the content has ${actual}.`,
          suggestedCorrection: `Model the content with at least ${minimum} ${kind} object(s), or choose a recipe that explains this structure.`,
        }),
      );
  }

  for (const role of recipe.requires.containerRoles ?? [])
    if ((content.containerRoleCounts[role] ?? 0) === 0)
      reasons.push(
        Object.freeze({
          code: "missing_container_role" as const,
          message: `${recipe.id} needs a container with role "${role}".`,
          suggestedCorrection: `Declare a ${role} container, so the movement has a real origin and destination.`,
        }),
      );

  for (const role of recipe.requires.regionRoles ?? [])
    if ((content.regionRoleCounts[role] ?? 0) === 0)
      reasons.push(
        Object.freeze({
          code: "missing_region_role" as const,
          message: `${recipe.id} needs a region with role "${role}".`,
          suggestedCorrection: `Declare a ${role} region.`,
        }),
      );

  /**
   * More objects than the stage has places for.
   *
   * Without this the surplus objects would be drawn on top of each other and
   * the clip would still play — money sitting in the wrong tray while the
   * balances read correctly, which is worse than no clip. The recipe lays out
   * by role, so the number of each role is what decides whether it can.
   */
  for (const overflow of demonstrationPlacementOverflows(recipe, content))
    reasons.push(
      Object.freeze({
        code: "too_many_for_recipe" as const,
        message: `${recipe.id} has ${overflow.places} place(s) for a "${overflow.role}" ${overflow.kind}; the content declares ${overflow.present}.`,
        suggestedCorrection:
          overflow.places === 0
            ? `This recipe draws no "${overflow.role}" ${overflow.kind}. Remove it, or choose a recipe that presents one.`
            : `Present at most ${overflow.places} "${overflow.role}" ${overflow.kind}(s), or split the explanation across scenes. The recipe will not improvise a position for the extras.`,
      }),
    );

  if (content.durationSeconds < recipe.timing.minimumSceneSeconds)
    reasons.push(
      Object.freeze({
        code: "scene_too_short" as const,
        message: `${recipe.id} needs at least ${recipe.timing.minimumSceneSeconds}s to complete its explanation with readable holds; this scene is ${content.durationSeconds}s.`,
        suggestedCorrection: `Record at least ${recipe.timing.minimumSceneSeconds}s of narration for this scene. The explanation is never compressed to fit a shorter clip.`,
      }),
    );

  return Object.freeze({
    supported: reasons.length === 0,
    recipeId: recipe.id,
    reasons: Object.freeze(reasons),
  });
}

/** Builds the profile a support query needs from an already-modelled state. */
export function profileInitialState(
  initialState: DemonstrationInitialState,
  durationSeconds: number,
): DemonstrationContentProfile {
  const objectKindCounts: Record<string, number> = {};
  for (const object of initialState.objects)
    objectKindCounts[object.kind] = (objectKindCounts[object.kind] ?? 0) + 1;
  objectKindCounts.readout = initialState.readouts.length;
  const containerRoleCounts: Record<string, number> = {};
  const regionRoleCounts: Record<string, number> = {};
  for (const object of initialState.objects) {
    if (object.kind === "container")
      containerRoleCounts[object.role] =
        (containerRoleCounts[object.role] ?? 0) + 1;
    if (object.kind === "region")
      regionRoleCounts[object.role] = (regionRoleCounts[object.role] ?? 0) + 1;
  }
  return Object.freeze({
    durationSeconds,
    objectKindCounts: Object.freeze(objectKindCounts),
    containerRoleCounts: Object.freeze(containerRoleCounts),
    regionRoleCounts: Object.freeze(regionRoleCounts),
  });
}

// ---------------------------------------------------------------------------
// Plan builder
// ---------------------------------------------------------------------------

/**
 * An event as an author writes it: anchored to a narration beat, with no frame
 * numbers. The builder resolves the frames from the measured audio, which is
 * the only way a plan's timing can be trusted to match what is actually said.
 */
type EventDraftOf<T> = T extends unknown
  ? Readonly<
      Omit<T, "startFrame"> & {
        /** Frames after the beat begins, for an event that should land
         * mid-phrase — useful when the viewer should hear what is about to
         * happen before it does. Defaults to 0: the event starts on the beat. */
        offsetFrames?: number | undefined;
      }
    >
  : never;

/**
 * Distributed over the event union deliberately. A plain
 * `Omit<DemonstrationEvent, "startFrame">` collapses the discriminated union
 * into its common keys, which would let an author put `tokenIds` on a detach
 * and only find out at runtime.
 */
export type DemonstrationEventDraft = EventDraftOf<DemonstrationEvent>;

export type DemonstrationPlanDraft = Readonly<{
  recipeId: DemonstrationRecipeId;
  sceneId: string;
  durationSeconds: number;
  seed: number;
  initialState: DemonstrationInitialState;
  events: readonly DemonstrationEventDraft[];
  expectedFinalState: DemonstrationExpectedFinalState;
}>;

export type DemonstrationPlanBuildResult = Readonly<{
  issues: readonly DemonstrationIssue[];
  plan?: DemonstrationPlan;
}>;

/**
 * Produces an immutable, validated plan, or the reasons it cannot.
 *
 * Frames are derived here, once, from the measured beat timings and written
 * into the plan — so rendering consumes resolved values and never re-derives
 * anything from the audio (CR-01). The plan is then validated by the same
 * function the composition uses, so a plan that this returns is renderable.
 */
export function buildDemonstrationPlan(
  draft: DemonstrationPlanDraft,
  narration: DemonstrationNarrationTrack,
): DemonstrationPlanBuildResult {
  const beats = new Map(narration.beats.map((beat) => [beat.beatId, beat]));
  const issues: DemonstrationIssue[] = [];
  const durationInFrames = Math.max(
    1,
    Math.round(draft.durationSeconds * demonstrationFps),
  );

  const events: DemonstrationEvent[] = [];
  for (const { offsetFrames = 0, ...event } of draft.events) {
    const beat = beats.get(event.beatId);
    if (beat === undefined) {
      issues.push(
        Object.freeze({
          code: "unknown_narration_beat" as const,
          fieldPath: `events.${event.id}.beatId`,
          message: `The narration for this scene contains no beat ${event.beatId}.`,
          sceneId: draft.sceneId,
          suggestedCorrection:
            "Anchor the event to a beat the measured narration actually contains.",
        }),
      );
      continue;
    }
    events.push({
      ...event,
      startFrame:
        Math.round((beat.startMs / 1_000) * demonstrationFps) + offsetFrames,
    } as DemonstrationEvent);
  }
  if (issues.length > 0) return Object.freeze({ issues: Object.freeze(issues) });

  const candidate = {
    planVersion: demonstrationPlanVersion,
    recipe: { id: draft.recipeId, version: demonstrationRecipeVersion },
    sceneId: draft.sceneId,
    durationInFrames,
    seed: draft.seed,
    initialState: draft.initialState,
    events,
    expectedFinalState: draft.expectedFinalState,
    narrationBinding: {
      audioChecksumSha256: narration.checksumSha256,
      beatIds: narration.beats.map((beat) => beat.beatId),
    },
  };

  const parsed = demonstrationPlanSchema.safeParse(candidate);
  if (!parsed.success)
    // Classified through the same function the composition preflight uses, so
    // an event that runs past the end of its scene is `event_out_of_bounds`
    // whichever door the caller came through. This used to report every schema
    // failure here as `invalid_composition_input`.
    return Object.freeze({
      issues: demonstrationSchemaIssues(
        parsed.error.issues,
        () => draft.sceneId,
      ),
    });

  const semantic = validateDemonstrationPlan(parsed.data, narration);
  return semantic.length > 0
    ? Object.freeze({ issues: semantic })
    : Object.freeze({ issues: Object.freeze([]), plan: parsed.data });
}

export function listDemonstrationRecipes(): readonly DemonstrationRecipeMetadata[] {
  return demonstrationRecipes;
}
