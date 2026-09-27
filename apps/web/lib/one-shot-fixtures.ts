/** ST-106 test fixtures for the prompt-to-video screens. Test-only. */
import type { OneShotEstimate, OneShotRunView } from "@avlp/schemas/one-shot";

export const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
export const at = "2026-09-27T08:00:00.000Z";

export function runView(
  overrides: Partial<OneShotRunView> = {},
): OneShotRunView {
  return {
    id: "019ffbf1-7000-7000-8000-000000000001",
    projectId,
    status: "running",
    currentStep: "outline",
    steps: [
      { step: "ingestion", state: "done", startedAt: at, finishedAt: at },
      { step: "source_snapshot", state: "done", startedAt: at, finishedAt: at },
      { step: "configuration", state: "done", startedAt: at, finishedAt: at },
      { step: "objectives", state: "done", startedAt: at, finishedAt: at },
      { step: "outline", state: "running", startedAt: at },
    ],
    focusPrompt: "Explain how the water cycle moves heat around the planet.",
    audience: {
      ageBand: "adult-intermediate",
      difficulty: "intermediate",
      tone: "friendly",
    },
    targetDurationSeconds: 300,
    acceptedEstimateUsd: 1.84,
    actualCostUsd: 0.42,
    focusCoverage: { status: "covered" },
    needsAttention: null,
    lessonVersionId: null,
    renderJobId: null,
    correlationId: "019ffbf1-7000-7000-8000-000000000002",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

export const estimate: OneShotEstimate = {
  pricingVersion: "2026-09",
  currency: "USD",
  targetDurationSeconds: 300,
  estimatedScenes: 10,
  items: [
    {
      key: "model.outline",
      label: "Outline",
      quantity: 1,
      unitCostUsd: 0.1,
      costUsd: 0.1,
    },
  ],
  totalUsd: 1.84,
};
