/**
 * ST-107 — bounded self-repair and the brief-promise check for prompt-to-video
 * runs.
 *
 * Deterministic authority: validation findings and the checks here decide
 * what is wrong and whether a repair worked. The model only rewrites, through
 * the existing scene-regeneration job, with an instruction built from a
 * template here. Instructions never carry source text: they name a template,
 * a duration, an objective statement or a confirmed coverage point, all of
 * which the job already works from or the user already approved.
 *
 * Anything outside the repair map is never repaired. Grounding findings in
 * particular always go to the user.
 */

import type { OneShotBriefCoveragePoint } from "@avlp/schemas/one-shot";

/** The only validation codes a run may repair on its own. */
export const oneShotRepairableCodes = [
  "text_overflow",
  "scene_monotony",
  "scene_duration_out_of_range",
  "objective_uncovered",
] as const;
export type OneShotRepairableCode = (typeof oneShotRepairableCodes)[number];

export function isRepairableCode(code: string): code is OneShotRepairableCode {
  return (oneShotRepairableCodes as readonly string[]).includes(code);
}

/** Instructions are bounded like the jobs' own `instruction` field. */
export const repairInstructionMaxLength = 500;

export type RepairFinding = {
  code: string;
  severity: "error" | "warning" | "info";
  sceneId: string | null;
  scopeId: string | null;
  details: Record<string, unknown>;
};

export type RepairScene = {
  sceneId: string;
  order: number;
  template: string;
  /** Source block IDs the scene cites. */
  blockIds: readonly string[];
};

export type RepairObjective = {
  objectiveId: string;
  statement: string;
  blockIds: readonly string[];
};

/** What the existing scene-regeneration job supports. */
export type RepairMode = "shorten" | "regenerate";

export type PlannedRepair = {
  sceneId: string;
  /** The validation code, or `brief_coverage` for an unmet brief point. */
  code: OneShotRepairableCode | "brief_coverage";
  mode: RepairMode;
  instruction: string;
};

/** Findings that repair may act on, and the ones it must not. Informational
 * findings are neither. */
export function classifyFindings(findings: readonly RepairFinding[]): {
  repairable: RepairFinding[];
  blockingUnrepairable: RepairFinding[];
} {
  const repairable: RepairFinding[] = [];
  const blockingUnrepairable: RepairFinding[] = [];
  for (const finding of findings) {
    if (finding.severity === "info") continue;
    if (isRepairableCode(finding.code)) repairable.push(finding);
    else if (finding.severity === "error") blockingUnrepairable.push(finding);
  }
  return { repairable, blockingUnrepairable };
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trim()}…`;
}

function instruction(text: string): string {
  return clip(text, repairInstructionMaxLength);
}

function numberDetail(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The scene whose cited blocks overlap the given blocks most; ties go to the
 * earliest scene. `null` when no scene cites any of them. */
function closestScene(
  scenes: readonly RepairScene[],
  blockIds: readonly string[],
): RepairScene | null {
  const wanted = new Set(blockIds);
  let best: { scene: RepairScene; overlap: number } | null = null;
  for (const scene of [...scenes].sort((a, b) => a.order - b.order)) {
    const overlap = scene.blockIds.filter((id) => wanted.has(id)).length;
    if (overlap > 0 && (best === null || overlap > best.overlap))
      best = { scene, overlap };
  }
  return best?.scene ?? null;
}

/** One planned fix for one finding, or `null` when the finding names no
 * scene the run can regenerate. */
export function repairForFinding(
  finding: RepairFinding,
  context: { scenes: readonly RepairScene[]; objectives: readonly RepairObjective[] },
): PlannedRepair | null {
  const known = new Set(context.scenes.map((scene) => scene.sceneId));
  switch (finding.code) {
    case "text_overflow":
      if (finding.sceneId === null || !known.has(finding.sceneId)) return null;
      return {
        sceneId: finding.sceneId,
        code: "text_overflow",
        mode: "shorten",
        instruction: instruction(
          "Shorten the on-screen text so it fits its layout. Keep the same facts, the same template and every source reference.",
        ),
      };
    case "scene_monotony": {
      const ids = Array.isArray(finding.details.sceneIds)
        ? finding.details.sceneIds.filter(
            (id): id is string => typeof id === "string" && known.has(id),
          )
        : [];
      const middle = ids[Math.floor(ids.length / 2)];
      if (middle === undefined) return null;
      const template =
        typeof finding.details.template === "string"
          ? finding.details.template
          : "the same";
      return {
        sceneId: middle,
        code: "scene_monotony",
        mode: "regenerate",
        instruction: instruction(
          `Use a different scene template that fits this content; the neighbouring scenes all use the "${template}" template. Keep the narration's facts and every source reference.`,
        ),
      };
    }
    case "scene_duration_out_of_range": {
      if (finding.sceneId === null || !known.has(finding.sceneId)) return null;
      const allocated = numberDetail(finding.details, "storyboardDurationSeconds");
      const actual = numberDetail(finding.details, "sceneDurationSeconds");
      if (allocated === null) return null;
      const words = Math.max(10, Math.round(allocated * 2.3));
      return {
        sceneId: finding.sceneId,
        code: "scene_duration_out_of_range",
        mode: actual !== null && actual > allocated ? "shorten" : "regenerate",
        instruction: instruction(
          `Set this scene's duration to exactly ${allocated} seconds and fit the narration to that length (about ${words} words). Keep the same facts and every source reference.`,
        ),
      };
    }
    case "objective_uncovered": {
      const objective = context.objectives.find(
        (entry) => entry.objectiveId === finding.scopeId,
      );
      if (objective === undefined) return null;
      const scene = closestScene(context.scenes, objective.blockIds);
      if (scene === null) return null;
      return {
        sceneId: scene.sceneId,
        code: "objective_uncovered",
        mode: "regenerate",
        instruction: instruction(
          `Make the narration explicitly address this learning objective: "${clip(objective.statement, 300)}". Use only the scene's existing source references.`,
        ),
      };
    }
    default:
      return null;
  }
}

/**
 * The fixes for one round: errors first, then warnings, one fix per scene, at
 * most `maxScenes` scenes. A finding that maps to no scene is skipped here;
 * the caller escalates if it is an error that remains.
 */
export function planRepairRound(input: {
  findings: readonly RepairFinding[];
  scenes: readonly RepairScene[];
  objectives: readonly RepairObjective[];
  maxScenes: number;
}): PlannedRepair[] {
  const ordered = [...input.findings]
    .filter((finding) => isRepairableCode(finding.code))
    .sort(
      (left, right) =>
        (left.severity === "error" ? 0 : 1) - (right.severity === "error" ? 0 : 1),
    );
  const planned: PlannedRepair[] = [];
  const touched = new Set<string>();
  for (const finding of ordered) {
    if (planned.length >= input.maxScenes) break;
    const repair = repairForFinding(finding, input);
    if (repair === null || touched.has(repair.sceneId)) continue;
    touched.add(repair.sceneId);
    planned.push(repair);
  }
  return planned;
}

export type RepairRoundDecision =
  | { action: "start"; round: number }
  | { action: "stop"; reason: "exhausted" | "no_progress" | "nothing_to_repair" };

/**
 * Whether to start another repair round. At most `maxRounds` rounds; a round
 * that did not reduce the number of repairable findings ends repair, so the
 * loop is bounded however the model behaves.
 */
export function nextRepairRound(input: {
  roundsDone: number;
  maxRounds: number;
  /** Repairable findings before the last round; `null` before any round. */
  countBeforeLastRound: number | null;
  countNow: number;
}): RepairRoundDecision {
  if (input.countNow === 0) return { action: "stop", reason: "nothing_to_repair" };
  if (
    input.countBeforeLastRound !== null &&
    input.countNow >= input.countBeforeLastRound
  )
    return { action: "stop", reason: "no_progress" };
  if (input.roundsDone >= input.maxRounds)
    return { action: "stop", reason: "exhausted" };
  return { action: "start", round: input.roundsDone + 1 };
}

// ---------------------------------------------------------------------------
// Brief-promise check
// ---------------------------------------------------------------------------

export type BriefPromiseInput = {
  coverage: readonly OneShotBriefCoveragePoint[];
  /** Per scene: the source sections its cited blocks belong to. */
  sceneSections: readonly { sceneId: string; sectionIds: readonly string[] }[];
  measuredDurationSeconds: number;
  targetDurationSeconds: number;
  toleranceSeconds: number;
  confirmed: { stylePackId: string; soundBed: string };
  pinned: { stylePackId: string | null; soundBed: string | null };
};

export type BriefPromiseResult = {
  unmetCoverage: OneShotBriefCoveragePoint[];
  durationWithinBand: boolean;
  stylePackPinned: boolean;
  soundBedPinned: boolean;
};

/** Deterministic: coverage by citation, duration by band, choices by
 * identity. Nothing here asks a model. */
export function checkBriefPromises(input: BriefPromiseInput): BriefPromiseResult {
  const citedSections = new Set(
    input.sceneSections.flatMap((scene) => scene.sectionIds),
  );
  return {
    unmetCoverage: input.coverage.filter(
      (point) => !point.sectionIds.some((id) => citedSections.has(id)),
    ),
    durationWithinBand:
      Math.abs(input.measuredDurationSeconds - input.targetDurationSeconds) <=
      input.toleranceSeconds,
    stylePackPinned: input.pinned.stylePackId === input.confirmed.stylePackId,
    soundBedPinned: input.pinned.soundBed === input.confirmed.soundBed,
  };
}

/**
 * One fix per unmet coverage point, at most `maxScenes`: the scene citing the
 * section nearest (in document order) to the point's sections is asked to
 * cover the point. The regeneration only sees that scene's own sources, so
 * whether the point is now covered is decided again by citation afterwards.
 */
export function planCoverageRepair(input: {
  unmet: readonly OneShotBriefCoveragePoint[];
  sceneSections: readonly { sceneId: string; order: number; sectionIds: readonly string[] }[];
  sectionOrder: ReadonlyMap<string, number>;
  maxScenes: number;
}): PlannedRepair[] {
  const planned: PlannedRepair[] = [];
  const touched = new Set<string>();
  for (const point of input.unmet) {
    if (planned.length >= input.maxScenes) break;
    const targets = point.sectionIds
      .map((id) => input.sectionOrder.get(id))
      .filter((value): value is number => value !== undefined);
    let best: { sceneId: string; distance: number; order: number } | null = null;
    for (const scene of input.sceneSections) {
      if (touched.has(scene.sceneId)) continue;
      const orders = scene.sectionIds
        .map((id) => input.sectionOrder.get(id))
        .filter((value): value is number => value !== undefined);
      if (orders.length === 0 || targets.length === 0) continue;
      const distance = Math.min(
        ...orders.flatMap((own) => targets.map((target) => Math.abs(own - target))),
      );
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && scene.order < best.order)
      )
        best = { sceneId: scene.sceneId, distance, order: scene.order };
    }
    if (best === null) continue;
    touched.add(best.sceneId);
    planned.push({
      sceneId: best.sceneId,
      code: "brief_coverage",
      mode: "regenerate",
      instruction: instruction(
        `Make this scene also cover the confirmed brief point: "${clip(point.point, 300)}". Use only the scene's existing source references.`,
      ),
    });
  }
  return planned;
}
