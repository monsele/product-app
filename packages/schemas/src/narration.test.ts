import { describe, expect, it } from "vitest";
import {
  currentNarrationGenerationCompatibility,
  lessonNarrationBlockSchema,
  lessonNarrationSetSchema,
  narrationBlockOutputSchema,
  narrationGenerationParamsSchema,
  narrationOutputV1Schema,
  narrationResponseSchema,
  narrationSentenceOutputSchema,
  narrationSetStatusSchema,
  narrationWordCountRange,
  type LessonNarrationSet,
  type NarrationOutputV1,
} from "./index.js";

const blockId = "019ffbf1-2222-7000-8000-000000000001";
const blockIdB = "019ffbf1-2223-7000-8000-000000000001";
const outlineItemA = "019ffbf1-1111-7000-8000-000000000001";
const outlineItemB = "019ffbf1-1111-7000-8000-000000000002";
const sectionId = "019ffbf1-3333-7000-8000-000000000001";

function blockRow(overrides: Record<string, unknown> = {}) {
  return lessonNarrationBlockSchema.parse({
    id: "019ffbf1-eeee-7000-8000-000000000001",
    outlineItemId: outlineItemA,
    order: 1,
    text: "Heating water turns it into vapour.",
    estimatedWords: 6,
    targetSeconds: 20,
    sourceRefs: [
      {
        documentId: "019ffbf1-4444-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 1,
        pageEnd: 1,
        sectionId,
        blockIds: [blockId],
      },
    ],
    generatedAdditions: [],
    generated: true,
    revision: 0,
    ...overrides,
  });
}

function setRow(overrides: Record<string, unknown> = {}): LessonNarrationSet {
  return lessonNarrationSetSchema.parse({
    schemaVersion: 1,
    id: "019ffbf1-eeee-7000-8000-000000000010",
    projectId: "019ffbf1-ffff-7000-8000-000000000001",
    sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000020",
    sourceSnapshotContentHash: "a".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000021",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000030",
    status: "draft",
    revision: 0,
    blocks: [blockRow()],
    totalEstimatedSeconds: 20,
    generatedAt: "2026-08-17T10:00:00.000Z",
    createdAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  });
}

function sentence(overrides: Record<string, unknown> = {}) {
  return narrationSentenceOutputSchema.parse({
    text: "Heating water turns it into vapour.",
    sourceBlockIds: [blockId],
    ...overrides,
  });
}

function block(overrides: Record<string, unknown> = {}) {
  return narrationBlockOutputSchema.parse({
    outlineItemId: outlineItemA,
    sentences: [sentence()],
    ...overrides,
  });
}

function sampleOutput(): NarrationOutputV1 {
  return narrationOutputV1Schema.parse({
    schemaVersion: "narration-v1",
    targetDurationSeconds: 300,
    blocks: [
      block(),
      block({
        outlineItemId: outlineItemB,
        sentences: [sentence({ sourceBlockIds: [blockIdB] })],
      }),
    ],
  });
}

describe("narration structured output schema", () => {
  it("accepts a bounded grounded output", () => {
    expect(() => sampleOutput()).not.toThrow();
  });

  it("rejects an unknown schema version", () => {
    expect(() =>
      narrationOutputV1Schema.parse({
        ...sampleOutput(),
        schemaVersion: "v9",
      }),
    ).toThrow();
  });

  it("rejects a sentence without source blocks or a generated addition", () => {
    expect(() => sentence({ sourceBlockIds: [] })).toThrow();
  });

  it("rejects a generated-addition sentence that also cites source blocks", () => {
    expect(() =>
      sentence({
        sourceBlockIds: [blockId],
        generatedAddition: {
          kind: "analogy",
          rationale: "A generated analogy.",
        },
      }),
    ).toThrow();
  });

  it("accepts a sentence labelled as a generated addition", () => {
    expect(() =>
      sentence({
        sourceBlockIds: [],
        generatedAddition: {
          kind: "analogy",
          rationale: "A generated analogy.",
        },
      }),
    ).not.toThrow();
  });

  it("rejects an empty block without sentences", () => {
    expect(() => block({ sentences: [] })).toThrow();
  });

  it("rejects a block referencing an outline item outside the bound", () => {
    expect(() =>
      narrationBlockOutputSchema.parse({
        outlineItemId: "not-a-uuid",
        sentences: [sentence()],
      }),
    ).toThrow();
  });

  it("rejects a set with no blocks", () => {
    expect(() =>
      narrationOutputV1Schema.parse({
        schemaVersion: "narration-v1",
        targetDurationSeconds: 300,
        blocks: [],
      }),
    ).toThrow();
  });

  it("rejects a target duration that is not a configured value", () => {
    expect(() =>
      narrationOutputV1Schema.parse({
        schemaVersion: "narration-v1",
        targetDurationSeconds: 200,
        blocks: sampleOutput().blocks,
      }),
    ).toThrow();
  });
});

describe("narration generation params", () => {
  it("accepts bounded configuration-derived params", () => {
    expect(() =>
      narrationGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
        outlineSetId: "019ffbf1-eeee-7000-8000-000000000001",
        outlineSetRevision: 2,
      }),
    ).not.toThrow();
  });

  it("rejects unknown parameters", () => {
    expect(() =>
      narrationGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
        outlineSetId: "019ffbf1-eeee-7000-8000-000000000001",
        outlineSetRevision: 2,
        surprise: true,
      }),
    ).toThrow();
  });
});

describe("narration word budget", () => {
  it("scales the target with the duration", () => {
    const short = narrationWordCountRange(20);
    const long = narrationWordCountRange(240);
    expect(short.target).toBeLessThan(long.target);
    expect(short.min).toBeLessThanOrEqual(short.target);
    expect(short.max).toBeGreaterThanOrEqual(short.target);
  });
});

describe("persisted narration schemas", () => {
  it("accepts a draft set with a grounded block", () => {
    expect(() => setRow()).not.toThrow();
  });

  it("accepts a generated-addition block", () => {
    const row = setRow({
      blocks: [
        blockRow({
          sourceRefs: [],
          generatedAdditions: [
            {
              kind: "analogy",
              content: "The puddle is like a disappearing puddle of paint.",
              rationale: "A generated analogy.",
            },
          ],
        }),
      ],
    });
    expect(row.blocks[0]!.sourceRefs).toHaveLength(0);
    expect(row.blocks[0]!.generatedAdditions).toHaveLength(1);
  });

  it("rejects an invalid narration set status", () => {
    expect(() =>
      narrationSetStatusSchema.parse("invalid"),
    ).toThrow();
  });

  it("rejects a non-SHA256 content hash", () => {
    expect(() => setRow({ sourceSnapshotContentHash: "hash" })).toThrow();
  });

  it("rejects a set with more than the bounded block count", () => {
    const blocks = Array.from({ length: 21 }, (_, index) =>
      blockRow({
        id: `019ffbf1-eeee-7000-8000-${String(index).padStart(12, "0")}`,
      }),
    );
    expect(() => setRow({ blocks })).toThrow();
  });
});

describe("narration response schema", () => {
  it("accepts an idle review state", () => {
    expect(() =>
      narrationResponseSchema.parse({
        state: "idle",
        set: null,
        approved: null,
        latestJob: null,
        canGenerate: true,
        canApprove: false,
        validation: {
          structurallyValid: false,
          durationStatus: "within",
          durationWarning: null,
          wordCountStatus: "within",
          wordCountWarning: null,
          uncoveredOutlineItemIds: [outlineItemA],
        },
      }),
    ).not.toThrow();
  });

  it("accepts a draft state with a set", () => {
    expect(() =>
      narrationResponseSchema.parse({
        state: "draft",
        set: setRow(),
        approved: null,
        latestJob: {
          id: "019ffbf1-eeee-7000-8000-000000000040",
          state: "succeeded",
          errorCode: null,
          updatedAt: "2026-08-17T10:00:00.000Z",
        },
        canGenerate: false,
        canApprove: false,
        validation: {
          structurallyValid: true,
          durationStatus: "within",
          durationWarning: null,
          wordCountStatus: "within",
          wordCountWarning: null,
          uncoveredOutlineItemIds: [],
        },
      }),
    ).not.toThrow();
  });
});

describe("narration generation compatibility", () => {
  it("targets the narration v2 prompt with the mock model", () => {
    expect(currentNarrationGenerationCompatibility).toMatchObject({
      promptId: "narration",
      promptVersion: "v2",
      model: "mock-model-1",
    });
  });
});
