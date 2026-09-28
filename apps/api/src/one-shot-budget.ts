/**
 * ST-107 — the prompt-to-video run budget: the deterministic brief estimate,
 * the ledger's step mapping, and the cap arithmetic.
 *
 * Everything here is pure, so the numbers the user accepts, the numbers the
 * runner checks before each paid step, and the numbers the ledger reports
 * are computed once and unit-tested at their boundaries. The model never
 * produces a cost: the estimate comes from the brief's `plannedSceneCount`
 * and the configured prices only.
 */

import { narrationWordCountRange } from "@avlp/schemas";
import {
  oneShotEstimateSchema,
  type OneShotEstimate,
  type OneShotLedgerStep,
} from "@avlp/schemas/one-shot";

export type OneShotPricing = {
  /** Upper-bound cost of one structured model call. */
  modelCallCostUsd: number;
  imageCostUsd: number;
  ttsCostUsdPerMillionCharacters: number;
  alignmentCostUsdPerAudioMinute: number;
};

/** v1 (ST-105) estimated from the duration alone; v2 from the brief. */
export const oneShotPricingVersion = "one-shot-estimate-v2";

/** Bounded self-repair: validation rounds, scenes per round, and the one
 * extra round an unmet brief coverage point may trigger. */
export const oneShotMaxRepairRounds = 2;
export const oneShotMaxRepairScenesPerRound = 4;
export const oneShotCoverageRepairRounds = 1;

/** Planning assumption: characters per narrated word, including spacing. */
const charactersPerWord = 6;

/** Money is compared and stored at six decimals (numeric(12, 6)). */
export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * The itemised upper bound a brief shows and the user accepts: the brief
 * call, the five generation calls and the grounding check, one illustration
 * and one narration clip per planned scene, caption alignment, and the full
 * self-repair allowance. The allowance is spent only when validation finds
 * something the repair map can fix.
 */
export function estimateOneShotBrief(input: {
  targetDurationSeconds: 180 | 300 | 420;
  plannedSceneCount: number;
  pricing: OneShotPricing;
}): OneShotEstimate {
  const { pricing } = input;
  const scenes = Math.max(1, Math.round(input.plannedSceneCount));
  const words = narrationWordCountRange(input.targetDurationSeconds).max;
  const characters = words * charactersPerWord;
  const ttsTotal =
    (characters / 1_000_000) * pricing.ttsCostUsdPerMillionCharacters;
  const ttsPerScene = ttsTotal / scenes;
  const repairRounds = oneShotMaxRepairRounds + oneShotCoverageRepairRounds;
  const repairScenes = repairRounds * oneShotMaxRepairScenesPerRound;
  const modelCalls: { key: string; label: string }[] = [
    { key: "ai.one-shot-brief", label: "Video brief" },
    { key: "ai.objectives", label: "Learning objectives" },
    { key: "ai.outline", label: "Lesson outline" },
    { key: "ai.narration", label: "Narration script" },
    { key: "ai.storyboard", label: "Storyboard" },
    { key: "ai.grounding", label: "Grounding check" },
  ];
  const item = (
    key: string,
    label: string,
    quantity: number,
    unitCostUsd: number,
  ) => ({
    key,
    label,
    quantity,
    unitCostUsd: roundUsd(unitCostUsd),
    costUsd: roundUsd(unitCostUsd * quantity),
  });
  const minutes = Math.ceil(input.targetDurationSeconds / 60);
  const items = [
    ...modelCalls.map((call) =>
      item(call.key, call.label, 1, pricing.modelCallCostUsd),
    ),
    item("image.generation", "Scene illustrations", scenes, pricing.imageCostUsd),
    item("tts.generation", "Narration audio", scenes, ttsPerScene),
    item(
      "tts.alignment",
      "Caption alignment",
      minutes,
      pricing.alignmentCostUsdPerAudioMinute,
    ),
    item(
      "repair.scene_regeneration",
      "Automatic fixes, only if needed",
      repairScenes,
      pricing.modelCallCostUsd,
    ),
    item(
      "repair.grounding",
      "Grounding re-checks after fixes",
      repairRounds,
      pricing.modelCallCostUsd,
    ),
    item("repair.audio", "Re-voiced scenes after fixes", repairScenes, ttsPerScene),
  ];
  return oneShotEstimateSchema.parse({
    pricingVersion: oneShotPricingVersion,
    currency: "USD",
    targetDurationSeconds: input.targetDurationSeconds,
    estimatedScenes: scenes,
    items,
    totalUsd: roundUsd(items.reduce((sum, entry) => sum + entry.costUsd, 0)),
  });
}

/** Which ledger line each estimate item belongs to. */
const ledgerStepByEstimateItem: Readonly<Record<string, OneShotLedgerStep>> = {
  "ai.one-shot-brief": "brief",
  "ai.lesson-intent": "brief",
  "ai.objectives": "objectives",
  "ai.outline": "outline",
  "ai.narration": "narration",
  "ai.storyboard": "storyboard",
  "ai.grounding": "grounding",
  "image.generation": "illustrations",
  "tts.generation": "audio",
  "tts.alignment": "audio",
  "repair.scene_regeneration": "repair",
  "repair.grounding": "repair",
  "repair.audio": "repair",
};

/**
 * Which ledger line a usage record belongs to, by its operation type. Repair
 * scene regenerations are `ai.scene_regeneration`; the grounding re-checks
 * and re-voiced audio they trigger land on `grounding` and `audio`, where
 * they are metered, so the per-line split is approximate but the ledger total
 * always equals the usage records.
 */
export function ledgerStepForOperation(operationType: string): OneShotLedgerStep {
  switch (operationType) {
    case "ai.one-shot-brief":
    case "ai.lesson-intent":
      return "brief";
    case "ai.objectives":
      return "objectives";
    case "ai.outline":
      return "outline";
    case "ai.narration":
      return "narration";
    case "ai.storyboard":
      return "storyboard";
    case "ai.grounding":
      return "grounding";
    case "ai.scene_regeneration":
      return "repair";
    case "image.generation":
      return "illustrations";
    case "tts.generation":
      return "audio";
    case "video.render":
      return "render";
    default:
      return "other";
  }
}

/** Per-ledger-line estimate from an accepted brief estimate. */
export function ledgerEstimates(
  estimate: OneShotEstimate,
): Partial<Record<OneShotLedgerStep, number>> {
  const totals: Partial<Record<OneShotLedgerStep, number>> = {};
  for (const entry of estimate.items) {
    const step = ledgerStepByEstimateItem[entry.key] ?? "other";
    totals[step] = roundUsd((totals[step] ?? 0) + entry.costUsd);
  }
  return totals;
}

/** The cap a reservation allows: reserved × tolerance. */
export function budgetCapUsd(reservedUsd: number, tolerance: number): number {
  return roundUsd(reservedUsd * tolerance);
}

/**
 * True when a paid call with this estimate would take actual spend past the
 * cap. Exactly reaching the cap is allowed; money is compared at six
 * decimals so rounding can never flip the answer.
 */
export function wouldExceedCap(input: {
  actualUsd: number;
  nextCallEstimateUsd: number;
  capUsd: number;
}): boolean {
  return (
    roundUsd(input.actualUsd + input.nextCallEstimateUsd) >
    roundUsd(input.capUsd)
  );
}

/** What one paid runner action is expected to cost, from the accepted
 * estimate's own unit prices. */
export type OneShotPaidAction =
  | "model_call"
  | "illustrations"
  | "audio"
  | "repair_scene";

export function paidActionEstimateUsd(
  estimate: OneShotEstimate,
  action: OneShotPaidAction,
): number {
  const cost = (key: string) =>
    estimate.items.find((entry) => entry.key === key)?.costUsd ?? 0;
  const unit = (key: string) =>
    estimate.items.find((entry) => entry.key === key)?.unitCostUsd ?? 0;
  switch (action) {
    case "model_call":
      return unit("ai.objectives");
    case "illustrations":
      return cost("image.generation");
    case "audio":
      return roundUsd(cost("tts.generation") + cost("tts.alignment"));
    case "repair_scene":
      return roundUsd(
        unit("repair.scene_regeneration") + unit("repair.audio"),
      );
  }
}

/**
 * The new estimate a user must accept after ONE_SHOT_BUDGET_CAP: what the run
 * has already spent, plus the accepted estimate for everything from the
 * blocked step onward. It is never below the blocked call's own estimate on
 * top of actual spend, so accepting it always lets that call proceed.
 */
export function proposedBudgetUsd(input: {
  actualUsd: number;
  estimate: OneShotEstimate;
  remainingSteps: readonly OneShotLedgerStep[];
  blockedCallEstimateUsd: number;
}): number {
  const estimates = ledgerEstimates(input.estimate);
  const remaining = [...new Set(input.remainingSteps)].reduce(
    (sum, step) => sum + (estimates[step] ?? 0),
    0,
  );
  return roundUsd(
    input.actualUsd + Math.max(remaining, input.blockedCallEstimateUsd),
  );
}
