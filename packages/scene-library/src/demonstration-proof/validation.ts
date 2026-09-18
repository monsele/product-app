/**
 * ST-095 — semantic validation of a demonstration plan.
 *
 * The schema in `@avlp/schemas/demonstration-proof` rejects malformed input.
 * This module rejects *incoherent* input: a transfer out of a container that
 * no longer holds the tokens, two events grabbing the same object at once, a
 * dispersal that packs particles tighter, a declared final balance the
 * transfers do not actually produce, an event anchored to a beat that has
 * drifted from the audio it was measured against.
 *
 * All of it is a replay of the plan against the same runtime the renderer uses,
 * so a plan that validates here cannot animate something different. Nothing
 * here repairs a plan: an incoherent plan produces a structured issue naming
 * the field and a correction, and no frames at all.
 */

import type { z } from "zod";
import {
  demonstrationFps,
  type DemonstrationAsset,
  type DemonstrationCaptionCue,
  type DemonstrationEvent,
  type DemonstrationIssue,
  type DemonstrationIssueCode,
  type DemonstrationNarrationTrack,
  type DemonstrationPlan,
  type DemonstrationScene,
} from "@avlp/schemas/demonstration-proof";
import { videoTheme, VIDEO_HEIGHT, VIDEO_WIDTH } from "@avlp/design-system/video-theme";
import {
  demonstrationPlacementOverflows,
  findDemonstrationRecipe,
} from "./registry.js";
import {
  compileDemonstrationPlan,
  evaluateDemonstrationState,
} from "./state.js";

/**
 * Attribute contract between the recipes and the browser preflight.
 *
 * `data-demo-content` marks readable content that must stay clear of the
 * caption band; `data-demo-object` marks a moving explanatory object, which
 * must stay on canvas and out of the same band; `data-demo-region` marks the
 * frame an object sits inside — the trays, the liquid body, the vapour space.
 * The Playwright preflight reads all three, because actual wrapped-text
 * geometry can only be measured in a browser with the pinned font loaded — a
 * Node-side estimate would be a false assurance, not a shortcut.
 */
export const demonstrationContentAttribute = "data-demo-content" as const;
export const demonstrationObjectAttribute = "data-demo-object" as const;
export const demonstrationRegionAttribute = "data-demo-region" as const;

/**
 * The one selector every preflight measures.
 *
 * A single constant rather than a literal in each caller: the region attribute
 * was applied to every tray and never measured, because the test and the
 * evidence script each carried their own two-attribute selector and neither was
 * updated when the third attribute arrived. A region frame that crossed the
 * caption band would have gone unreported.
 */
export const demonstrationPreflightSelector =
  `[${demonstrationObjectAttribute}],[${demonstrationContentAttribute}],[${demonstrationRegionAttribute}]` as const;

/** The rectangle no readable content or explanatory object may intersect. */
export const demonstrationCaptionExclusion = Object.freeze({
  bottom: VIDEO_HEIGHT,
  left: videoTheme.safeAreas.caption.left,
  right: VIDEO_WIDTH - videoTheme.safeAreas.caption.right,
  top: VIDEO_HEIGHT - videoTheme.safeAreas.caption.bottom - 120,
});

const issue = (
  code: DemonstrationIssueCode,
  sceneId: string,
  fieldPath: string,
  message: string,
  suggestedCorrection: string,
): DemonstrationIssue =>
  Object.freeze({ code, fieldPath, message, sceneId, suggestedCorrection });

/** Object IDs an event acts on, used for the conflict check. */
function touchedObjectIds(event: DemonstrationEvent): readonly string[] {
  switch (event.action) {
    case "transfer":
    case "introduce":
      return event.tokenIds;
    case "detach":
    case "disperse":
      return event.particleIds;
    case "emphasise":
      return event.objectIds;
    case "advance-period":
      return [event.markerId];
    case "annotate":
      return [event.noteId];
    default:
      return [];
  }
}

/**
 * Maps a schema failure onto the stable failure categories.
 *
 * Collapsing every Zod issue into one code would make the categories
 * unactionable: a plan bound to the wrong recording and a malformed caption
 * are different problems with different recovery actions, and the code is what
 * a client branches on.
 *
 * The path patterns are anchored to a segment boundary rather than to a
 * leading dot, because the same failure arrives with two different prefixes:
 * `scenes.0.plan.events.2.startFrame` when a whole composition is parsed, and
 * `events.2.startFrame` when the plan builder parses one plan. They are the
 * same problem and must not get two different codes depending on which door
 * the caller came through.
 */
export function classifyDemonstrationSchemaIssue(
  problem: z.ZodIssue,
): DemonstrationIssueCode {
  if (problem.code === "unrecognized_keys")
    return "unsupported_animation_instruction";
  const path = problem.path.join(".");
  if (path.endsWith("recipe.id")) return "unknown_recipe";
  if (path.endsWith("recipe.version")) return "unsupported_recipe_version";
  if (path.endsWith("planVersion")) return "unsupported_plan_version";
  if (/(^|\.)events\.\d+\.startFrame$/.test(path)) return "event_out_of_bounds";
  if (/(^|\.)events\.\d+\.beatId$/.test(path)) return "unknown_narration_beat";
  if (path.includes("narrationBinding")) return "stale_narration_timing";
  if (path.includes("amountMinor")) return "invalid_quantity";
  if (/(^|\.)captions(\.|$)/.test(path)) return "invalid_caption_timing";
  if (/(^|\.)assets(\.|$)/.test(path)) return "missing_required_asset";
  return "invalid_composition_input";
}

/** The correction offered with each schema failure category. */
export function demonstrationCorrectionFor(
  code: DemonstrationIssueCode,
): string {
  switch (code) {
    case "unsupported_animation_instruction":
      return "Remove the unrecognised field. A recipe exposes a content contract, not its layout, easing or coordinates.";
    case "unknown_recipe":
      return "Select a registered recipe; the runtime never guesses a nearby one.";
    case "unsupported_recipe_version":
    case "unsupported_plan_version":
      return "Pin a version this implementation provides, or retain the bundle that published the requested one.";
    case "unknown_narration_beat":
      return "Anchor the event to a beat the measured narration actually contains.";
    case "stale_narration_timing":
      return "Rebuild the plan against the current recording rather than re-anchoring it silently.";
    case "invalid_quantity":
      return "Amounts are positive integer minor units, so a total can never drift by rounding.";
    case "invalid_caption_timing":
      return "Re-cut the cue inside its scene. Caption timing follows the measured narration and is identical for both approaches.";
    case "missing_required_asset":
      return "Bind an asset that exists in the bundled demonstration library.";
    default:
      return "Correct the composition input; the contract rejects anything the runtime cannot evaluate deterministically.";
  }
}

/**
 * Turns a Zod failure into the contract's structured issues.
 *
 * Shared by `prepareDemonstrationComposition` and `buildDemonstrationPlan` so
 * a caller that reaches the runtime through the plan builder gets the same
 * code for the same defect as one that hands a whole composition to the
 * preflight. They previously disagreed: the builder reported every schema
 * failure as `invalid_composition_input`.
 */
export function demonstrationSchemaIssues(
  problems: readonly z.ZodIssue[],
  sceneIdFor: (path: readonly (string | number)[]) => string,
): readonly DemonstrationIssue[] {
  return Object.freeze(
    problems.map((problem) => {
      const code = classifyDemonstrationSchemaIssue(problem);
      return issue(
        code,
        sceneIdFor(problem.path),
        problem.path.join("."),
        problem.message,
        demonstrationCorrectionFor(code),
      );
    }),
  );
}

/** Counts role-bearing objects by their role, for the placement check. */
function countByRole(
  objects: Iterable<Readonly<{ role: string }>>,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const object of objects)
    counts[object.role] = (counts[object.role] ?? 0) + 1;
  return counts;
}

/** Events that change state. `emphasise` and `annotate` do not, so they may
 * legitimately overlap a movement they are drawing attention to. */
function changesState(event: DemonstrationEvent): boolean {
  return (
    event.action === "transfer" ||
    event.action === "introduce" ||
    event.action === "detach" ||
    event.action === "disperse" ||
    event.action === "advance-period"
  );
}

/**
 * Replays the plan and reports every incoherence it finds.
 *
 * Returns all issues rather than the first, so an author fixing a fixture sees
 * the whole picture instead of peeling them off one at a time.
 */
export function validateDemonstrationPlan(
  plan: DemonstrationPlan,
  narration: DemonstrationNarrationTrack | undefined,
): readonly DemonstrationIssue[] {
  const issues: DemonstrationIssue[] = [];
  const sceneId = plan.sceneId;
  const recipe = findDemonstrationRecipe(plan.recipe.id);

  if (recipe === undefined) {
    issues.push(
      issue(
        "unknown_recipe",
        sceneId,
        "plan.recipe.id",
        `No registered recipe with ID ${plan.recipe.id}.`,
        "Select a recipe from the catalogue; the runtime never guesses a nearby recipe.",
      ),
    );
    return Object.freeze(issues);
  }
  if (recipe.version !== plan.recipe.version)
    issues.push(
      issue(
        "unsupported_recipe_version",
        sceneId,
        "plan.recipe.version",
        `This implementation provides ${recipe.id}@${recipe.version}, not @${plan.recipe.version}.`,
        "Pin a version this implementation provides, or retain the bundle that published the requested one. A newer recipe is never substituted.",
      ),
    );

  // --- Object inventory ---------------------------------------------------

  const containers = new Map(
    plan.initialState.objects
      .filter((object) => object.kind === "container")
      .map((object) => [object.id, object]),
  );
  const regions = new Map(
    plan.initialState.objects
      .filter((object) => object.kind === "region")
      .map((object) => [object.id, object]),
  );
  const tokens = new Map(
    plan.initialState.objects
      .filter((object) => object.kind === "token")
      .map((object) => [object.id, object]),
  );
  const particles = new Map(
    plan.initialState.objects
      .filter((object) => object.kind === "particle")
      .map((object) => [object.id, object]),
  );
  const markers = new Map(
    plan.initialState.objects
      .filter((object) => object.kind === "period-marker")
      .map((object) => [object.id, object]),
  );

  /**
   * Every declared ID and what kind of thing it names.
   *
   * Naming a real object of the wrong kind — a transfer listing a container in
   * its `tokenIds` — is a different mistake from naming something that does not
   * exist, and it has a different correction: one is a typo, the other is a
   * misunderstanding of the model. Reporting both as "unknown object" told the
   * author to declare something they had already declared.
   */
  const kindById = new Map<string, string>(
    plan.initialState.objects.map((object) => [object.id, object.kind]),
  );
  for (const readout of plan.initialState.readouts)
    kindById.set(readout.id, "readout");

  /**
   * Checks one reference, distinguishing "no such object" from "wrong kind".
   * Returns `undefined` when the reference is sound.
   */
  const referenceProblem = (
    fieldPath: string,
    objectId: string,
    expectedKind: string,
    unknownCorrection: string,
  ): DemonstrationIssue | undefined => {
    const actual = kindById.get(objectId);
    if (actual === undefined)
      return issue(
        "unknown_object_reference",
        sceneId,
        fieldPath,
        `No ${expectedKind} ${objectId} exists in the initial state.`,
        unknownCorrection,
      );
    if (actual !== expectedKind)
      return issue(
        "object_kind_mismatch",
        sceneId,
        fieldPath,
        `${objectId} is a ${actual}, but this field names a ${expectedKind}.`,
        `Reference a ${expectedKind} here. ${objectId} exists, so this is the wrong object rather than a missing one.`,
      );
    return undefined;
  };

  for (const object of [...plan.initialState.objects, ...plan.initialState.readouts])
    if (!recipe.supportedObjectKinds.includes(object.kind))
      issues.push(
        issue(
          "unsupported_content",
          sceneId,
          `plan.initialState.${object.id}`,
          `Recipe ${recipe.id} does not present ${object.kind} objects.`,
          `Use one of: ${recipe.supportedObjectKinds.join(", ")}, or select a recipe that presents this object kind.`,
        ),
      );

  // --- Simulated replay ---------------------------------------------------

  /** Where each token is at this point in the replay. */
  const tokenHolder = new Map(
    [...tokens.values()].map((token) => [token.id, token.containerId]),
  );
  const particleHolder = new Map(
    [...particles.values()].map((particle) => [particle.id, particle.regionId]),
  );
  const particleDispersion = new Map(
    [...particles.values()].map((particle) => [particle.id, particle.dispersion]),
  );

  /** `objectId` → the frame it becomes free again (event end + its hold). */
  const busyUntil = new Map<string, { frame: number; eventId: string }>();

  const ordered = [...plan.events].sort((left, right) =>
    left.startFrame === right.startFrame
      ? left.id.localeCompare(right.id)
      : left.startFrame - right.startFrame,
  );

  const beatsById = new Map(
    (narration?.beats ?? []).map((beat) => [beat.beatId, beat]),
  );

  if (narration !== undefined) {
    if (narration.checksumSha256 !== plan.narrationBinding.audioChecksumSha256)
      issues.push(
        issue(
          "stale_narration_timing",
          sceneId,
          "plan.narrationBinding.audioChecksumSha256",
          "This plan was built against a different narration recording than the one supplied.",
          "Rebuild the plan against the current recording so its event anchors come from audio that actually exists. Re-anchoring silently would put the motion out of step with the words.",
        ),
      );
    for (const beatId of plan.narrationBinding.beatIds)
      if (!beatsById.has(beatId))
        issues.push(
          issue(
            "unknown_narration_beat",
            sceneId,
            "plan.narrationBinding.beatIds",
            `The narration contains no beat ${beatId}.`,
            "Bind the plan to beats the measured narration actually contains.",
          ),
        );
  }

  for (const event of ordered) {
    const path = `plan.events.${event.id}`;

    if (!recipe.supportedActions.includes(event.action))
      issues.push(
        issue(
          "unsupported_content",
          sceneId,
          `${path}.action`,
          `Recipe ${recipe.id} does not implement the ${event.action} action.`,
          `Use one of: ${recipe.supportedActions.join(", ")}.`,
        ),
      );

    if (
      changesState(event) &&
      (event.durationFrames < recipe.timing.eventFrameBounds.minimum ||
        event.durationFrames > recipe.timing.eventFrameBounds.maximum)
    )
      issues.push(
        issue(
          "event_out_of_bounds",
          sceneId,
          `${path}.durationFrames`,
          `A ${event.durationFrames}-frame ${event.action} is outside ${recipe.id}'s ${recipe.timing.eventFrameBounds.minimum}–${recipe.timing.eventFrameBounds.maximum} frame bounds.`,
          "A movement below the lower bound is too fast to follow; above the upper bound it stops reading as a single change.",
        ),
      );

    if (changesState(event) && event.holdFrames < recipe.timing.minimumHoldFrames)
      issues.push(
        issue(
          "insufficient_hold",
          sceneId,
          `${path}.holdFrames`,
          `${event.action} ${event.id} holds for ${event.holdFrames} frames; ${recipe.id} requires ${recipe.timing.minimumHoldFrames} settled frames so the result can be read.`,
          `Raise holdFrames to at least ${recipe.timing.minimumHoldFrames}, or lengthen the scene. Narration is never accelerated to make room.`,
        ),
      );

    // --- Beat anchoring -------------------------------------------------
    const beat = beatsById.get(event.beatId);
    if (narration !== undefined && beat !== undefined) {
      const beatStart = Math.round((beat.startMs / 1_000) * demonstrationFps);
      const beatEnd = Math.round((beat.endMs / 1_000) * demonstrationFps);
      /**
       * The instructional requirement is that a movement begins while the
       * words describing it are being spoken — not that it begins on the exact
       * frame the phrase does. An author may legitimately delay an event a
       * little into its phrase so the viewer hears what is about to happen
       * first. Anything outside the phrase means the plan and the audio have
       * drifted apart, which is what re-cutting a recording does.
       *
       * One frame of leeway at the start absorbs millisecond-to-frame rounding.
       */
      if (event.startFrame < beatStart - 1 || event.startFrame > beatEnd)
        issues.push(
          issue(
            "timing_drift",
            sceneId,
            `${path}.startFrame`,
            `Event ${event.id} starts at frame ${event.startFrame}, outside beat ${event.beatId}, which the audio measures at frames ${beatStart}–${beatEnd}.`,
            "Rebuild the plan from the measured beat timings. A hand-edited start frame falls out of step with the narration as soon as the audio is re-cut, and the motion then explains the wrong sentence.",
          ),
        );
    }

    // --- Conflicts --------------------------------------------------------
    if (changesState(event))
      for (const objectId of touchedObjectIds(event)) {
        const busy = busyUntil.get(objectId);
        if (busy !== undefined && event.startFrame < busy.frame)
          issues.push(
            issue(
              "conflicting_events",
              sceneId,
              `${path}.startFrame`,
              `Event ${event.id} moves ${objectId} at frame ${event.startFrame}, while ${busy.eventId} still needs it until frame ${busy.frame} including its readable hold.`,
              "Move one event later. Overlapping changes to the same object show two things happening at once, which is what the focal rule exists to prevent.",
            ),
          );
      }

    // --- Per-action semantics --------------------------------------------
    switch (event.action) {
      case "transfer":
      case "introduce": {
        const fromId =
          event.action === "transfer" ? event.fromContainerId : event.fromOriginId;
        const fromField =
          event.action === "transfer" ? "fromContainerId" : "fromOriginId";
        const from = containers.get(fromId);
        const fromProblem = referenceProblem(
          `${path}.${fromField}`,
          fromId,
          "container",
          "Reference a container declared in the initial state.",
        );
        if (fromProblem !== undefined) issues.push(fromProblem);
        const toProblem = referenceProblem(
          `${path}.toContainerId`,
          event.toContainerId,
          "container",
          "Reference a container declared in the initial state.",
        );
        if (toProblem !== undefined) issues.push(toProblem);
        if (event.action === "introduce" && from !== undefined && from.role !== "origin")
          issues.push(
            issue(
              "impossible_transition",
              sceneId,
              `${path}.fromOriginId`,
              `Container ${fromId} has role "${from.role}"; an introduction must come out of an origin.`,
              'Give the source container role "origin" and name it for the learner, so the deposit visibly comes from somewhere rather than appearing.',
            ),
          );
        if (event.action === "transfer" && from !== undefined && from.role === "origin")
          issues.push(
            issue(
              "impossible_transition",
              sceneId,
              `${path}.fromContainerId`,
              `Container ${fromId} is an origin; money leaving it is an introduction, which must carry an origin label.`,
              "Use the introduce action so the deposit's source is stated on screen.",
            ),
          );
        for (const tokenId of event.tokenIds) {
          const problem = referenceProblem(
            `${path}.tokenIds`,
            tokenId,
            "token",
            "Every token that appears must be declared in the initial state, so nothing is created mid-clip.",
          );
          if (problem !== undefined) {
            issues.push(problem);
            continue;
          }
          if (tokenHolder.get(tokenId) !== fromId)
            issues.push(
              issue(
                "source_unavailable",
                sceneId,
                `${path}.tokenIds`,
                `Token ${tokenId} is in ${tokenHolder.get(tokenId) ?? "nowhere"} when ${event.id} tries to move it out of ${fromId}.`,
                "Move the token into the source container first, or transfer a token that is actually there. Money cannot leave a place it is not.",
              ),
            );
          tokenHolder.set(tokenId, event.toContainerId);
        }
        break;
      }
      case "detach": {
        for (const [field, regionId] of [
          ["fromRegionId", event.fromRegionId],
          ["toRegionId", event.toRegionId],
        ] as const) {
          const problem = referenceProblem(
            `${path}.${field}`,
            regionId,
            "region",
            "Reference a region declared in the initial state.",
          );
          if (problem !== undefined) issues.push(problem);
        }
        const from = regions.get(event.fromRegionId);
        const to = regions.get(event.toRegionId);
        if (
          from !== undefined &&
          to !== undefined &&
          !(from.role === "liquid-body" && to.role === "vapour-space")
        )
          issues.push(
            issue(
              "impossible_transition",
              sceneId,
              `${path}.toRegionId`,
              `A detach runs liquid-body → vapour-space; this one runs ${from.role} → ${to.role}.`,
              "This recipe models evaporation only. Condensation is a different explanation and would need its own authored recipe and accuracy review.",
            ),
          );
        for (const particleId of event.particleIds) {
          const problem = referenceProblem(
            `${path}.particleIds`,
            particleId,
            "particle",
            "Every particle must be declared in the initial state; evaporation moves water, it never creates it.",
          );
          if (problem !== undefined) {
            issues.push(problem);
            continue;
          }
          if (particleHolder.get(particleId) !== event.fromRegionId)
            issues.push(
              issue(
                "source_unavailable",
                sceneId,
                `${path}.particleIds`,
                `Particle ${particleId} is in ${particleHolder.get(particleId) ?? "nowhere"} when ${event.id} tries to detach it from ${event.fromRegionId}.`,
                "Detach a particle that is actually in the liquid at that moment.",
              ),
            );
          particleHolder.set(particleId, event.toRegionId);
        }
        break;
      }
      case "disperse": {
        for (const particleId of event.particleIds) {
          const problem = referenceProblem(
            `${path}.particleIds`,
            particleId,
            "particle",
            "Reference a particle declared in the initial state.",
          );
          if (problem !== undefined) {
            issues.push(problem);
            continue;
          }
          const currentDispersion = particleDispersion.get(particleId) ?? 0;
          if (event.toDispersion <= currentDispersion)
            issues.push(
              issue(
                "impossible_transition",
                sceneId,
                `${path}.toDispersion`,
                `Particle ${particleId} is already at dispersion ${currentDispersion}; a dispersal to ${event.toDispersion} would pack it tighter or do nothing.`,
                "Raise toDispersion above the particle's current level, or remove the event. Spreading apart is the whole content of this action.",
              ),
            );
          const region = regions.get(particleHolder.get(particleId) ?? "");
          if (region !== undefined && region.role === "liquid-body")
            issues.push(
              issue(
                "impossible_transition",
                sceneId,
                `${path}.particleIds`,
                `Particle ${particleId} is still in the liquid; dispersal describes what vapour does after it has left.`,
                "Detach the particle before dispersing it, so cause precedes consequence.",
              ),
            );
          particleDispersion.set(particleId, event.toDispersion);
        }
        break;
      }
      case "advance-period": {
        const problem = referenceProblem(
          `${path}.markerId`,
          event.markerId,
          "period-marker",
          "Declare the period marker in the initial state.",
        );
        if (problem !== undefined) issues.push(problem);
        break;
      }
      case "annotate": {
        const problem = referenceProblem(
          `${path}.noteId`,
          event.noteId,
          "note",
          "Declare the note in the initial state; a recipe never composes its own explanatory text.",
        );
        if (problem !== undefined) issues.push(problem);
        break;
      }
      case "emphasise": {
        const known = new Set([
          ...tokens.keys(),
          ...particles.keys(),
          ...containers.keys(),
          ...regions.keys(),
          ...markers.keys(),
        ]);
        for (const objectId of event.objectIds)
          if (!known.has(objectId))
            issues.push(
              issue(
                "unknown_object_reference",
                sceneId,
                `${path}.objectIds`,
                `No object ${objectId} exists in the initial state.`,
                "Reference an object declared in the initial state.",
              ),
            );
        break;
      }
      default:
        break;
    }

    if (changesState(event))
      for (const objectId of touchedObjectIds(event))
        busyUntil.set(objectId, {
          frame: event.startFrame + event.durationFrames + event.holdFrames,
          eventId: event.id,
        });
  }

  // --- Declared end state -------------------------------------------------

  const compiled = compileDemonstrationPlan(plan);
  const finalState = evaluateDemonstrationState(compiled, plan.durationInFrames - 1);

  for (const expected of plan.expectedFinalState.containerTotals) {
    const actual = finalState.ledger.settledByContainer[expected.containerId];
    if (actual === undefined)
      issues.push(
        issue(
          "unknown_object_reference",
          sceneId,
          `plan.expectedFinalState.${expected.containerId}`,
          `No container ${expected.containerId} exists in the initial state.`,
          "Declare the expected total against a container the plan actually has.",
        ),
      );
    else if (actual !== expected.totalMinor)
      issues.push(
        issue(
          "final_state_mismatch",
          sceneId,
          `plan.expectedFinalState.${expected.containerId}`,
          `Container ${expected.containerId} declares a final total of ${expected.totalMinor} but the plan's transfers produce ${actual}.`,
          "Correct either the transfers or the declared total. The runtime will not animate an arithmetic mistake, because the balance a learner reads is the one this check verifies.",
        ),
      );
  }

  const phaseCounts = new Map<string, number>();
  for (const particle of finalState.particles)
    phaseCounts.set(particle.phase, (phaseCounts.get(particle.phase) ?? 0) + 1);
  for (const expected of plan.expectedFinalState.particlePhases) {
    const actual = phaseCounts.get(expected.phase) ?? 0;
    if (actual !== expected.count)
      issues.push(
        issue(
          "final_state_mismatch",
          sceneId,
          `plan.expectedFinalState.particlePhases.${expected.phase}`,
          `The plan declares ${expected.count} ${expected.phase} particles at the end but produces ${actual}.`,
          "Correct either the detach events or the declared count; water is conserved, so the two phases must still add up to the particles you started with.",
        ),
      );
  }

  // Conservation: the ledger total is an invariant of the whole plan, checked
  // at every event boundary rather than only at the end, so money cannot be
  // created and destroyed again in the middle and pass a final-state check.
  const initialTotal = evaluateDemonstrationState(compiled, 0).ledger.totalMinor;
  const checkFrames = new Set<number>([0, plan.durationInFrames - 1]);
  for (const event of ordered) {
    checkFrames.add(event.startFrame);
    checkFrames.add(
      Math.min(plan.durationInFrames - 1, event.startFrame + Math.floor(event.durationFrames / 2)),
    );
    checkFrames.add(
      Math.min(plan.durationInFrames - 1, event.startFrame + event.durationFrames),
    );
  }
  for (const frame of [...checkFrames].sort((a, b) => a - b)) {
    const total = evaluateDemonstrationState(compiled, frame).ledger.totalMinor;
    if (total !== initialTotal) {
      issues.push(
        issue(
          "final_state_mismatch",
          sceneId,
          "plan.events",
          `At frame ${frame} the on-screen money totals ${total}, against ${initialTotal} at the start. Money is being created or lost mid-clip, including while in transit.`,
          "Every token must come out of a declared container and land in another. In-transit tokens are counted once, in neither container, so a transfer cannot make a total move.",
        ),
      );
      break;
    }
  }

  // --- Recipe preconditions ----------------------------------------------

  const counts: Record<string, number> = {};
  for (const object of plan.initialState.objects)
    counts[object.kind] = (counts[object.kind] ?? 0) + 1;
  counts.readout = plan.initialState.readouts.length;
  for (const [kind, minimum] of Object.entries(recipe.requires.minimumOf))
    if ((counts[kind] ?? 0) < minimum)
      issues.push(
        issue(
          "unsupported_content",
          sceneId,
          "plan.initialState.objects",
          `Recipe ${recipe.id} needs at least ${minimum} ${kind} object(s); this plan has ${counts[kind] ?? 0}.`,
          `Supply the objects the recipe animates. Support is decided from the content's structure, never from what the lesson is called.`,
        ),
      );
  for (const role of recipe.requires.containerRoles ?? [])
    if (![...containers.values()].some((container) => container.role === role))
      issues.push(
        issue(
          "unsupported_content",
          sceneId,
          "plan.initialState.objects",
          `Recipe ${recipe.id} needs a container with role "${role}".`,
          `Declare a ${role} container.`,
        ),
      );
  for (const role of recipe.requires.regionRoles ?? [])
    if (![...regions.values()].some((region) => region.role === role))
      issues.push(
        issue(
          "unsupported_content",
          sceneId,
          "plan.initialState.objects",
          `Recipe ${recipe.id} needs a region with role "${role}".`,
          `Declare a ${role} region.`,
        ),
      );

  /**
   * More objects of a role than the recipe has a place for.
   *
   * The same check the support query runs, repeated here because the two are
   * separate doors into the runtime: a caller may hand a plan straight to the
   * composition without ever asking about support, and a plan the stage cannot
   * lay out must not render either way. The recipes draw by role, so the
   * surplus would otherwise be stacked in one position and the clip would play
   * — showing tokens in the wrong container while the balances read correctly.
   */
  for (const overflow of demonstrationPlacementOverflows(recipe, {
    containerRoleCounts: countByRole(containers.values()),
    regionRoleCounts: countByRole(regions.values()),
  }))
    issues.push(
      issue(
        "unsupported_content",
        sceneId,
        "plan.initialState.objects",
        `Recipe ${recipe.id} has ${overflow.places} place(s) for a "${overflow.role}" ${overflow.kind}; this plan declares ${overflow.present}.`,
        overflow.places === 0
          ? `This recipe draws no "${overflow.role}" ${overflow.kind}. Remove it, or select a recipe that presents one.`
          : `Present at most ${overflow.places} "${overflow.role}" ${overflow.kind}(s), or split the explanation across scenes. The recipe places objects by role and will not improvise a position for the extras.`,
      ),
    );

  return Object.freeze(issues);
}

/** Scene-level checks that do not need the plan replay. */
export function validateDemonstrationScene(
  scene: DemonstrationScene,
  narration: DemonstrationNarrationTrack | undefined,
  /** The composition's asset library, keyed by asset ID. */
  assets: Readonly<Record<string, DemonstrationAsset>>,
): readonly DemonstrationIssue[] {
  const issues: DemonstrationIssue[] = [];
  const recipe = findDemonstrationRecipe(scene.plan.recipe.id);
  if (recipe === undefined) return Object.freeze(issues);

  if (scene.durationSeconds < recipe.timing.minimumSceneSeconds)
    issues.push(
      issue(
        "event_out_of_bounds",
        scene.id,
        "durationSeconds",
        `A ${scene.durationSeconds}s scene is below ${recipe.id}'s ${recipe.timing.minimumSceneSeconds}s minimum; the explanation cannot complete with readable holds.`,
        `Record narration of at least ${recipe.timing.minimumSceneSeconds}s for this scene, or select a recipe with a shorter explanation. The clip is never sped up to fit.`,
      ),
    );

  for (const slot of recipe.assetSlots) {
    const assetId = scene.assetBySlot[slot.slot];
    if (assetId === undefined) {
      if (slot.required)
        issues.push(
          issue(
            "missing_required_asset",
            scene.id,
            `assetBySlot.${slot.slot}`,
            `Recipe ${recipe.id} requires the "${slot.slot}" slot: ${slot.expects}`,
            "Bind an asset that exists in the bundled demonstration library. The recipe never substitutes a placeholder for a missing educational asset.",
          ),
        );
      continue;
    }
    const asset = assets[assetId];
    if (asset === undefined) {
      issues.push(
        issue(
          "missing_required_asset",
          scene.id,
          `assetBySlot.${slot.slot}`,
          `Slot "${slot.slot}" is bound to unknown asset ${assetId}.`,
          "Bind an asset ID present in the composition's asset library.",
        ),
      );
      continue;
    }
    /**
     * The slot's declared minimum, enforced rather than merely recorded.
     *
     * A present-but-unusable asset is the same failure as a missing one: a
     * 16x16 image bound to the vessel slot renders as an unreadable smear and
     * the clip still plays. The recipe refuses to substitute a placeholder for
     * a missing educational asset, and this is the other half of that promise.
     */
    if (asset.width < slot.minWidth || asset.height < slot.minHeight)
      issues.push(
        issue(
          "missing_required_asset",
          scene.id,
          `assetBySlot.${slot.slot}`,
          `Slot "${slot.slot}" needs at least ${slot.minWidth}x${slot.minHeight}; "${assetId}" is ${asset.width}x${asset.height}.`,
          `Bind artwork of at least ${slot.minWidth}x${slot.minHeight} that depicts: ${slot.expects}`,
        ),
      );
  }

  for (const slotName of Object.keys(scene.assetBySlot))
    if (!recipe.assetSlots.some((slot) => slot.slot === slotName))
      issues.push(
        issue(
          "unsupported_animation_instruction",
          scene.id,
          `assetBySlot.${slotName}`,
          `Recipe ${recipe.id} has no "${slotName}" slot.`,
          "Remove the binding. A recipe exposes named content slots, not its own layout.",
        ),
      );

  if (narration !== undefined) {
    const expectedFrames = Math.max(
      1,
      Math.round(scene.durationSeconds * demonstrationFps),
    );
    const audioFrames = Math.round((narration.durationMs / 1_000) * demonstrationFps);
    // ADR-004: measured audio is the authority. The scene may hold a little
    // longer than the speech, but it may never be shorter — that would clip it.
    if (audioFrames > expectedFrames)
      issues.push(
        issue(
          "event_out_of_bounds",
          scene.id,
          "durationSeconds",
          `The measured narration runs ${narration.durationMs}ms (${audioFrames} frames) but the scene is ${expectedFrames} frames, so speech would be cut off.`,
          "Lengthen the scene to at least the measured narration. Speech is never accelerated or clipped to fit a motion plan.",
        ),
      );
  }

  return Object.freeze(issues);
}

export function validateDemonstrationCaptions(
  captions: readonly DemonstrationCaptionCue[],
  timeline: readonly Readonly<{
    endFrameExclusive: number;
    sceneId: string;
    startFrame: number;
  }>[],
): readonly DemonstrationIssue[] {
  const bySceneId = new Map(timeline.map((segment) => [segment.sceneId, segment]));
  const issues: DemonstrationIssue[] = [];
  for (const cue of captions) {
    const segment = bySceneId.get(cue.sceneId);
    if (segment === undefined) continue;
    if (
      cue.startFrame < segment.startFrame ||
      cue.endFrame > segment.endFrameExclusive
    )
      issues.push(
        issue(
          "invalid_caption_timing",
          cue.sceneId,
          "captions",
          `A caption cue runs from frame ${cue.startFrame} to ${cue.endFrame}, outside its scene's ${segment.startFrame}-${segment.endFrameExclusive} range.`,
          "Re-cut the cue inside its scene. Caption timing follows the measured narration and is identical for both approaches.",
        ),
      );
  }

  /**
   * Two cues on screen at the same moment.
   *
   * The overlay draws the first cue whose window contains the frame, so an
   * overlap does not fail — it silently drops a line of narration from the
   * captions while the audio still speaks it. That is a caption the deaf
   * viewer never sees, so it is a rejection rather than a rendering detail.
   */
  const ordered = [...captions].sort((left, right) =>
    left.startFrame === right.startFrame
      ? left.endFrame - right.endFrame
      : left.startFrame - right.startFrame,
  );
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (current.startFrame < previous.endFrame)
      issues.push(
        issue(
          "caption_collision",
          current.sceneId,
          "captions",
          `Two caption cues are on screen together at frame ${current.startFrame}: one runs to ${previous.endFrame}, the next starts at ${current.startFrame}.`,
          "Cut the earlier cue to end before the next begins. The overlay shows one cue at a time, so an overlap hides a line the narration still speaks.",
        ),
      );
  }
  return Object.freeze(issues);
}
