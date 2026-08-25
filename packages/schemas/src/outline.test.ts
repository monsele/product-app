import { describe, expect, it } from "vitest";
import {
  lessonOutlineSetSchema,
  outlineApproveInputSchema,
  outlineDurationToleranceRatio,
  outlineGenerationParamsSchema,
  outlineItemCreateInputSchema,
  outlineItemRemoveInputSchema,
  outlineItemUpdateInputSchema,
  outlineOutputItemSchema,
  outlineOutputV1Schema,
  outlineReorderInputSchema,
  outlineResponseSchema,
  outlineValidationSchema,
  type LessonOutlineSet,
  type OutlineOutputV1,
} from "./index.js";

const blockId = "019ffbf1-2222-7000-8000-000000000001";
const blockIdB = "019ffbf1-2223-7000-8000-000000000001";
const objectiveIdA = "019ffbf1-1111-7000-8000-000000000001";
const objectiveIdB = "019ffbf1-1111-7000-8000-000000000002";
const sectionId = "019ffbf1-3333-7000-8000-000000000001";

function sampleOutput(): OutlineOutputV1 {
  return outlineOutputV1Schema.parse({
    schemaVersion: "outline-v1",
    targetDurationSeconds: 300,
    items: [
      {
        kind: "hook",
        title: "What turns liquid into vapour?",
        description: "Open with a question about water disappearing.",
        objectiveIds: [objectiveIdA],
        sourceBlockIds: [blockId],
        estimatedSeconds: 20,
      },
      {
        kind: "concept",
        title: "Evaporation",
        description: "Explain how heating turns water into water vapour.",
        objectiveIds: [objectiveIdA],
        sourceBlockIds: [blockId],
        estimatedSeconds: 60,
      },
      {
        kind: "concept",
        title: "Condensation",
        description: "Explain how cooling turns vapour into clouds.",
        objectiveIds: [objectiveIdB],
        sourceBlockIds: [blockIdB],
        estimatedSeconds: 60,
      },
      {
        kind: "example",
        title: "A puddle drying up",
        description: "Work through a familiar evaporation example.",
        objectiveIds: [objectiveIdA, objectiveIdB],
        sourceBlockIds: [blockId],
        estimatedSeconds: 45,
      },
      {
        kind: "summary",
        title: "The water cycle at a glance",
        description: "Recap evaporation and condensation.",
        objectiveIds: [objectiveIdA, objectiveIdB],
        sourceBlockIds: [blockId, blockIdB],
        estimatedSeconds: 30,
      },
      {
        kind: "recall_question",
        title: "Quick check",
        description: "Ask what happens to water when it is heated.",
        objectiveIds: [objectiveIdA],
        sourceBlockIds: [blockId],
        estimatedSeconds: 15,
      },
    ],
  });
}

function sourceRef() {
  return {
    documentId: "019ffbf1-4444-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    pageStart: 1,
    pageEnd: 1,
    sectionId,
    blockIds: [blockId],
  };
}

describe("outline structured output schema", () => {
  it("accepts a bounded grounded output", () => {
    expect(() => sampleOutput()).not.toThrow();
  });

  it("rejects fewer than the minimum item count", () => {
    const output = sampleOutput();
    output.items = output.items.slice(0, 2);
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects more than the bounded item count", () => {
    const output = sampleOutput();
    const extra = Array.from({ length: 15 }, (_, index) => ({
      ...output.items[0]!,
      title: `Extra item ${index}`,
    }));
    output.items = [...output.items, ...extra];
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects an unknown schema version", () => {
    expect(() =>
      outlineOutputV1Schema.parse({ ...sampleOutput(), schemaVersion: "v9" }),
    ).toThrow();
  });

  it("rejects an item whose kind is unknown", () => {
    const output = sampleOutput();
    output.items[0] = { ...output.items[0]!, kind: "quiz" as never };
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects an item without an objective link", () => {
    const output = sampleOutput();
    output.items[1] = { ...output.items[1]!, objectiveIds: [] };
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects a non-hook item without a source block", () => {
    const output = sampleOutput();
    output.items[1] = { ...output.items[1]!, sourceBlockIds: [] };
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects an uncited hook that is not labelled as framing", () => {
    const output = sampleOutput();
    output.items[0] = { ...output.items[0]!, sourceBlockIds: [] };
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("accepts an uncited hook labelled as generated framing", () => {
    const output = sampleOutput();
    output.items[0] = {
      ...output.items[0]!,
      sourceBlockIds: [],
      framingNote: "Generated framing question; not a sourced claim.",
    };
    expect(() => outlineOutputV1Schema.parse(output)).not.toThrow();
  });

  it("rejects an estimated duration outside the per-item bounds", () => {
    const output = sampleOutput();
    output.items[0] = { ...output.items[0]!, estimatedSeconds: 5 };
    expect(() => outlineOutputV1Schema.parse(output)).toThrow();
  });

  it("accepts every configured target duration", () => {
    for (const duration of [180, 300, 420] as const) {
      const output = sampleOutput();
      output.targetDurationSeconds = duration;
      expect(() => outlineOutputV1Schema.parse(output)).not.toThrow();
    }
  });

  it("exposes a documented duration tolerance ratio", () => {
    expect(outlineDurationToleranceRatio).toBe(0.1);
  });
});

describe("outline generation params", () => {
  it("accepts bounded configuration-derived params", () => {
    expect(() =>
      outlineGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
        objectiveSetId: "019ffbf1-eeee-7000-8000-000000000001",
        objectiveSetRevision: 2,
      }),
    ).not.toThrow();
  });

  it("rejects unknown parameters", () => {
    expect(() =>
      outlineGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
        objectiveSetId: "019ffbf1-eeee-7000-8000-000000000001",
        objectiveSetRevision: 2,
        surprise: true,
      }),
    ).toThrow();
  });

  it("rejects a missing objective set identity", () => {
    expect(() =>
      outlineGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
        objectiveSetRevision: 2,
      }),
    ).toThrow();
  });
});

describe("lesson outline set", () => {
  function sampleSet(): LessonOutlineSet {
    const output = sampleOutput();
    return lessonOutlineSetSchema.parse({
      schemaVersion: 1,
      id: "019ffbf1-eeee-7000-8000-000000000001",
      projectId: "019ffbf1-ffff-7000-8000-000000000001",
      sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
      sourceSnapshotContentHash: "a".repeat(64),
      objectiveSetId: "019ffbf1-eeee-7000-8000-000000000002",
      objectiveSetContentHash: "b".repeat(64),
      configurationVersion: 3,
      promptId: "outline",
      promptVersion: "v2",
      model: "mock-model-1",
      modelCallId: "019ffbf1-eeee-7000-8000-000000000003",
      status: "draft",
      revision: 0,
      items: output.items.map((item, index) => ({
        id: `019ffbf1-eeee-7000-8000-00000000001${index + 1}`,
        order: index + 1,
        kind: item.kind,
        title: item.title,
        description: item.description,
        estimatedSeconds: item.estimatedSeconds,
        sourceRefs: [sourceRef()],
        objectiveIds: item.objectiveIds,
        framingNote: item.framingNote ?? null,
        generated: true,
        revision: 0,
      })),
      totalEstimatedSeconds: output.items.reduce(
        (total, item) => total + item.estimatedSeconds,
        0,
      ),
      generatedAt: "2026-08-17T10:00:00.000Z",
      createdAt: "2026-08-17T10:00:00.000Z",
    });
  }

  it("accepts a persisted draft set", () => {
    expect(() => sampleSet()).not.toThrow();
  });

  it("accepts an uncited generated hook item with a framing note", () => {
    const set = sampleSet();
    set.items[0] = {
      ...set.items[0]!,
      sourceRefs: [],
      framingNote: "Generated framing question.",
    };
    expect(() => lessonOutlineSetSchema.parse(set)).not.toThrow();
  });

  it("rejects an unknown set status", () => {
    const set = sampleSet();
    set.status = "published" as never;
    expect(() => lessonOutlineSetSchema.parse(set)).toThrow();
  });
});

describe("outline response", () => {
  function validation() {
    return outlineValidationSchema.parse({
      structurallyValid: true,
      durationStatus: "within",
      durationWarning: null,
      uncoveredObjectiveIds: [],
      structureWarning: null,
    });
  }

  it("accepts an idle response", () => {
    expect(() =>
      outlineResponseSchema.parse({
        state: "idle",
        set: null,
        approved: null,
        latestJob: null,
        canGenerate: true,
        canApprove: false,
        validation: validation(),
      }),
    ).not.toThrow();
  });

  it("accepts a draft response with a set", () => {
    const set = lessonOutlineSetSchema.parse({
      schemaVersion: 1,
      id: "019ffbf1-eeee-7000-8000-000000000001",
      projectId: "019ffbf1-ffff-7000-8000-000000000001",
      sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
      sourceSnapshotContentHash: "a".repeat(64),
      objectiveSetId: "019ffbf1-eeee-7000-8000-000000000002",
      objectiveSetContentHash: "b".repeat(64),
      configurationVersion: 3,
      promptId: "outline",
      promptVersion: "v2",
      model: "mock-model-1",
      modelCallId: "019ffbf1-eeee-7000-8000-000000000003",
      status: "draft",
      revision: 0,
      items: [],
      totalEstimatedSeconds: 180,
      generatedAt: "2026-08-17T10:00:00.000Z",
      createdAt: "2026-08-17T10:00:00.000Z",
    });
    expect(() =>
      outlineResponseSchema.parse({
        state: "draft",
        set,
        approved: null,
        latestJob: {
          id: "019ffbf1-eeee-7000-8000-000000000004",
          state: "succeeded",
          errorCode: null,
          updatedAt: "2026-08-17T10:00:00.000Z",
        },
        canGenerate: true,
        canApprove: true,
        validation: validation(),
      }),
    ).not.toThrow();
  });

  it("rejects an unknown outline state", () => {
    expect(() =>
      outlineResponseSchema.parse({
        state: "approving",
        set: null,
        approved: null,
        latestJob: null,
        canGenerate: true,
        canApprove: false,
        validation: validation(),
      }),
    ).toThrow();
  });
});

describe("outline output item edge cases", () => {
  it("keeps the generated framing label contract explicit", () => {
    const item = {
      kind: "hook",
      title: "A question",
      description: "Framing question.",
      objectiveIds: [objectiveIdA],
      sourceBlockIds: [],
      estimatedSeconds: 20,
    };
    const result = outlineOutputItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });
});

describe("outline editor input schemas", () => {
  function createInput(overrides: Record<string, unknown> = {}) {
    return {
      kind: "concept",
      title: "Evaporation",
      description: "Explain how heating turns water into vapour.",
      estimatedSeconds: 60,
      objectiveIds: [objectiveIdA],
      expectedRevision: 0,
      ...overrides,
    };
  }

  it("accepts a teacher-authored item create input", () => {
    expect(() => outlineItemCreateInputSchema.parse(createInput())).not.toThrow();
  });

  it("accepts a create input with source block ids and framing note", () => {
    expect(() =>
      outlineItemCreateInputSchema.parse(
        createInput({
          sourceBlockIds: [blockId],
          framingNote: "Generated framing question.",
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a create input without objective links", () => {
    expect(() =>
      outlineItemCreateInputSchema.parse(createInput({ objectiveIds: [] })),
    ).toThrow();
  });

  it("rejects a create input with an estimated duration outside bounds", () => {
    expect(() =>
      outlineItemCreateInputSchema.parse(createInput({ estimatedSeconds: 5 })),
    ).toThrow();
  });

  it("rejects a create input without an expected revision", () => {
    const withoutRevision = Object.fromEntries(
      Object.entries(createInput()).filter(([key]) => key !== "expectedRevision"),
    );
    expect(() =>
      outlineItemCreateInputSchema.parse(withoutRevision),
    ).toThrow();
  });

  it("accepts a partial update input", () => {
    expect(() =>
      outlineItemUpdateInputSchema.parse({
        title: "Evaporation and condensation",
        expectedRevision: 1,
      }),
    ).not.toThrow();
  });

  it("accepts changing the item kind on update", () => {
    expect(() =>
      outlineItemUpdateInputSchema.parse({
        kind: "summary",
        expectedRevision: 1,
      }),
    ).not.toThrow();
  });

  it("accepts clearing the framing note on update", () => {
    expect(() =>
      outlineItemUpdateInputSchema.parse({
        framingNote: null,
        expectedRevision: 1,
      }),
    ).not.toThrow();
  });

  it("rejects an update input with no fields to change", () => {
    expect(() =>
      outlineItemUpdateInputSchema.parse({ expectedRevision: 1 }),
    ).toThrow();
  });

  it("accepts remove, reorder, and approve inputs", () => {
    expect(() =>
      outlineItemRemoveInputSchema.parse({ expectedRevision: 1 }),
    ).not.toThrow();
    expect(() =>
      outlineReorderInputSchema.parse({
        itemIds: [blockId, blockIdB],
        expectedRevision: 1,
      }),
    ).not.toThrow();
    expect(() => outlineApproveInputSchema.parse({ expectedRevision: 1 })).not.toThrow();
  });

  it("rejects a reorder input that repeats ids", () => {
    expect(() =>
      outlineReorderInputSchema.parse({
        itemIds: [blockId, blockId],
        expectedRevision: 1,
      }),
    ).toThrow();
  });

  it("rejects an approval input without an expected revision", () => {
    expect(() => outlineApproveInputSchema.parse({})).toThrow();
  });
});
