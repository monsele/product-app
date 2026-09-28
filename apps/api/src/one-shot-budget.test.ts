/**
 * ST-107 — the run budget arithmetic: the deterministic estimate, ledger
 * mapping, cap boundaries and the budget proposal.
 */

import { describe, expect, it } from "vitest";
import {
  budgetCapUsd,
  estimateOneShotBrief,
  ledgerEstimates,
  ledgerStepForOperation,
  paidActionEstimateUsd,
  proposedBudgetUsd,
  roundUsd,
  wouldExceedCap,
  type OneShotPricing,
} from "./one-shot-budget.js";

const pricing: OneShotPricing = {
  modelCallCostUsd: 1.08,
  imageCostUsd: 0.00225,
  ttsCostUsdPerMillionCharacters: 15,
  alignmentCostUsdPerAudioMinute: 0.0015,
};
const estimate = estimateOneShotBrief({
  targetDurationSeconds: 180,
  plannedSceneCount: 6,
  pricing,
});

describe("ST-107 budget: the brief estimate", () => {
  it("never asks a model: every item is price × quantity from the plan", () => {
    for (const item of estimate.items)
      expect(item.costUsd).toBeCloseTo(item.unitCostUsd * item.quantity, 5);
    expect(estimate.totalUsd).toBe(
      roundUsd(estimate.items.reduce((sum, item) => sum + item.costUsd, 0)),
    );
  });

  it("splits into ledger lines that add back up to the total", () => {
    const lines = ledgerEstimates(estimate);
    expect(Object.keys(lines).sort()).toEqual(
      ["audio", "brief", "grounding", "illustrations", "narration", "objectives", "outline", "repair", "storyboard"].sort(),
    );
    const sum = Object.values(lines).reduce((total, value) => total + (value ?? 0), 0);
    expect(roundUsd(sum)).toBeCloseTo(estimate.totalUsd, 5);
  });
});

describe("ST-107 budget: cap arithmetic", () => {
  it("sets the cap at reserved × tolerance, at six decimals", () => {
    expect(budgetCapUsd(10, 1.25)).toBe(12.5);
    expect(budgetCapUsd(0.1234567, 1.25)).toBe(0.154321);
  });

  it("allows a call that lands exactly on the cap and stops one a micro-dollar over", () => {
    expect(wouldExceedCap({ actualUsd: 10, nextCallEstimateUsd: 2.5, capUsd: 12.5 })).toBe(false);
    expect(wouldExceedCap({ actualUsd: 10.000001, nextCallEstimateUsd: 2.5, capUsd: 12.5 })).toBe(true);
    expect(wouldExceedCap({ actualUsd: 0, nextCallEstimateUsd: 0, capUsd: 0 })).toBe(false);
  });

  it("is not fooled by floating-point noise at the boundary", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point.
    expect(wouldExceedCap({ actualUsd: 0.1, nextCallEstimateUsd: 0.2, capUsd: 0.3 })).toBe(false);
  });

  it("estimates each paid action from the accepted estimate's own prices", () => {
    expect(paidActionEstimateUsd(estimate, "model_call")).toBe(1.08);
    expect(paidActionEstimateUsd(estimate, "illustrations")).toBe(roundUsd(6 * 0.00225));
    expect(paidActionEstimateUsd(estimate, "audio")).toBeGreaterThan(0);
    expect(paidActionEstimateUsd(estimate, "repair_scene")).toBeGreaterThan(1.08);
  });

  it("proposes a new estimate that always lets the blocked call proceed", () => {
    const blocked = paidActionEstimateUsd(estimate, "model_call");
    const proposal = proposedBudgetUsd({
      actualUsd: 20,
      estimate,
      remainingSteps: ["storyboard", "illustrations", "grounding", "audio", "repair"],
      blockedCallEstimateUsd: blocked,
    });
    const cap = budgetCapUsd(proposal, 1.25);
    expect(wouldExceedCap({ actualUsd: 20, nextCallEstimateUsd: blocked, capUsd: cap })).toBe(false);
    // It covers every remaining line, not just the blocked call.
    const lines = ledgerEstimates(estimate);
    expect(proposal).toBeCloseTo(
      20 + (lines.storyboard ?? 0) + (lines.illustrations ?? 0) + (lines.grounding ?? 0) + (lines.audio ?? 0) + (lines.repair ?? 0),
      5,
    );
    // With nothing left it still covers the blocked call.
    expect(
      proposedBudgetUsd({ actualUsd: 20, estimate, remainingSteps: [], blockedCallEstimateUsd: blocked }),
    ).toBe(roundUsd(20 + blocked));
  });
});

describe("ST-107 budget: ledger mapping", () => {
  it("maps every usage operation to one ledger line, with a catch-all", () => {
    expect(ledgerStepForOperation("ai.one-shot-brief")).toBe("brief");
    expect(ledgerStepForOperation("ai.lesson-intent")).toBe("brief");
    expect(ledgerStepForOperation("ai.scene_regeneration")).toBe("repair");
    expect(ledgerStepForOperation("image.generation")).toBe("illustrations");
    expect(ledgerStepForOperation("tts.generation")).toBe("audio");
    expect(ledgerStepForOperation("video.render")).toBe("render");
    expect(ledgerStepForOperation("ai.creative_design")).toBe("other");
  });
});
