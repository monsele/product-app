/** ST-106/107 test fixtures for the prompt-to-video screens. Test-only. */
import type {
  OneShotBrief,
  OneShotBriefResponse,
  OneShotDecisionsResponse,
  OneShotEstimate,
  OneShotRunView,
} from "@avlp/schemas/one-shot";

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
    briefRevision: 1,
    budget: {
      reservedUsd: 1.84,
      capUsd: 2.3,
      actualUsd: 0.42,
      reservationRevision: 1,
      proposedEstimateUsd: null,
    },
    coverageGaps: [],
    stylePackId: "systems",
    soundBed: "none",
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

export const sectionIds = [
  "019ffbf1-5ec1-7000-8000-000000000001",
  "019ffbf1-5ec1-7000-8000-000000000002",
] as const;

export function briefView(overrides: Partial<OneShotBrief> = {}): OneShotBrief {
  return {
    runId: "019ffbf1-7000-7000-8000-000000000001",
    revision: 1,
    focusPrompt: "Explain how the water cycle moves heat around the planet.",
    audience: { ageBand: "adult-intermediate", difficulty: "intermediate", tone: "friendly" },
    targetDurationSeconds: 300,
    subject: "Earth science",
    lessonTitle: "How the water cycle moves heat",
    coverage: [
      { point: "How evaporation absorbs heat", sectionIds: [sectionIds[0]] },
      { point: "How condensation releases it", sectionIds: [sectionIds[1]] },
    ],
    notCovered: ["Ocean currents"],
    sections: [
      { sectionId: sectionIds[0], heading: "Evaporation" },
      { sectionId: sectionIds[1], heading: "Condensation" },
    ],
    plannedSceneCount: 8,
    stylePackId: "field-notes",
    stylePackReason: "Documentary tones suit an earth-science explanation.",
    soundBed: "morning-pad",
    soundBedReason: "A calm bed that sits under the narration.",
    estimate,
    model: "mock-model-1",
    promptVersion: "one-shot-brief/v1",
    modelCallId: "019ffbf1-7000-7000-8000-00000000000a",
    createdAt: at,
    ...overrides,
  };
}

export function briefResponse(
  overrides: Partial<OneShotBriefResponse> = {},
): OneShotBriefResponse {
  return {
    brief: briefView(),
    revisionsUsed: 1,
    maxRevisions: 3,
    stylePackIds: ["essential", "editorial", "everyday", "systems", "field-notes", "prism"],
    ...overrides,
  };
}

export const decisionLog: OneShotDecisionsResponse = {
  runId: "019ffbf1-7000-7000-8000-000000000001",
  decisions: [
    {
      runId: "019ffbf1-7000-7000-8000-000000000001",
      seq: 1,
      kind: "brief",
      summary: "Prepared brief revision 1: 2 coverage points, 8 scenes planned, estimate $1.84.",
      reason: null,
      model: "mock-model-1",
      promptVersion: "one-shot-brief/v1",
      costUsd: 0.02,
      relatedIds: [],
      createdAt: at,
    },
    {
      runId: "019ffbf1-7000-7000-8000-000000000001",
      seq: 2,
      kind: "repair",
      summary: "Round 1: applied the regenerated scene 3.",
      reason: "on-screen text overflowed its layout",
      model: "mock-model-1",
      promptVersion: "scene-regeneration/v2",
      costUsd: 0.01,
      relatedIds: [],
      createdAt: at,
    },
  ],
  ledger: [
    { step: "brief", estimateUsd: 0.1, actualUsd: 0.02, usageRecordIds: ["019ffbf1-7000-7000-8000-00000000000b"] },
    { step: "repair", estimateUsd: 0.5, actualUsd: 0.01, usageRecordIds: [] },
  ],
  budget: {
    reservedUsd: 1.84,
    capUsd: 2.3,
    actualUsd: 0.03,
    reservationRevision: 1,
    proposedEstimateUsd: null,
  },
};
