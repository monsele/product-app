import { describe, expect, it } from "vitest";
import {
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
} from "@avlp/config";
import {
  currentNarrationGenerationCompatibility,
  currentNarrationTransformCompatibility,
  lessonNarrationBlockSchema,
  lessonNarrationSetSchema,
  narrationBlockCandidateSchema,
  narrationBlockOutputSchema,
  narrationBlockRestoreInputSchema,
  narrationBlockRevisionSchema,
  narrationBlockTransformInputSchema,
  narrationBlockTransformOutputSchema,
  narrationBlockUpdateInputSchema,
  narrationCandidateDecisionInputSchema,
  narrationGenerationParamsSchema,
  narrationOutputV1Schema,
  narrationResponseSchema,
  narrationSentenceOutputSchema,
  narrationSetStatusSchema,
  narrationTransformParamsSchema,
  narrationTransformResponseSchema,
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
  const base = {
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
  };
  const merged = { ...base, ...overrides };
  return lessonNarrationBlockSchema.parse({
    ...merged,
    contentHash:
      "contentHash" in merged
        ? merged.contentHash
        : computeNarrationBlockContentHash({
            text: merged.text as string,
            sourceRefs: merged.sourceRefs as LessonNarrationSet["blocks"][number]["sourceRefs"],
            generatedAdditions: merged.generatedAdditions as LessonNarrationSet["blocks"][number]["generatedAdditions"],
            generated: merged.generated as boolean,
          }),
  });
}

function setRow(overrides: Record<string, unknown> = {}): LessonNarrationSet {
  const row = {
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
  };
  const blocks = (overrides.blocks ?? row.blocks) as typeof row.blocks;
  return lessonNarrationSetSchema.parse({
    ...row,
    contentHash: computeNarrationSetContentHash(blocks, row.totalEstimatedSeconds),
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
        latestTransformJob: null,
        canGenerate: true,
        canApprove: false,
        canEdit: false,
        stale: false,
        staleReason: null,
        candidates: [],
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
        latestTransformJob: null,
        canGenerate: false,
        canApprove: false,
        canEdit: true,
        stale: false,
        staleReason: null,
        candidates: [],
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
  it("targets the narration v2 prompt with the Together model", () => {
    expect(currentNarrationGenerationCompatibility).toMatchObject({
      promptId: "narration",
      promptVersion: "v2",
      model: "Qwen/Qwen3.8-Flash",
    });
  });
});

describe("narration content hashes", () => {
  it("derives a deterministic block content hash", () => {
    const input = {
      text: "Heating water turns it into vapour.",
      sourceRefs: blockRow().sourceRefs,
      generatedAdditions: [],
      generated: true,
    };
    expect(computeNarrationBlockContentHash(input)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeNarrationBlockContentHash(input)).toBe(
      computeNarrationBlockContentHash({ ...input, sourceRefs: [...input.sourceRefs] }),
    );
    expect(computeNarrationBlockContentHash({ ...input, text: "Changed." })).not.toBe(
      computeNarrationBlockContentHash(input),
    );
  });

  it("derives a set content hash that changes when a block changes", () => {
    const blocks = [blockRow(), blockRow({ id: blockIdB })];
    const first = computeNarrationSetContentHash(blocks, 40);
    const changed = computeNarrationSetContentHash(
      [blockRow(), blockRow({ id: blockIdB, text: "Changed block text." })],
      40,
    );
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(changed).not.toBe(first);
  });

  it("rejects a block or set with an invalid content hash", () => {
    expect(() => lessonNarrationBlockSchema.parse({ ...blockRow(), contentHash: "x" })).toThrow();
    expect(() => setRow({ contentHash: "x" })).toThrow();
  });
});

describe("narration block update input", () => {
  it("accepts a teacher edit that retains citations when source blocks are omitted", () => {
    expect(() =>
      narrationBlockUpdateInputSchema.parse({
        text: "Heating water turns it into vapour.",
        expectedRevision: 0,
      }),
    ).not.toThrow();
  });

  it("accepts a teacher edit that replaces citations explicitly", () => {
    expect(() =>
      narrationBlockUpdateInputSchema.parse({
        text: "Heating water turns it into vapour.",
        sourceBlockIds: [blockId],
        expectedRevision: 0,
      }),
    ).not.toThrow();
  });

  it("rejects unknown fields and a missing expected revision", () => {
    expect(() => narrationBlockUpdateInputSchema.parse({ text: "x" })).toThrow();
    expect(() =>
      narrationBlockUpdateInputSchema.parse({ text: "x", expectedRevision: 0, surprise: true }),
    ).toThrow();
  });
});

describe("narration block transform input", () => {
  it("accepts every mode", () => {
    for (const mode of ["shorten", "simplify", "expand", "regenerate"])
      expect(() =>
        narrationBlockTransformInputSchema.parse({ mode, expectedRevision: 0 }),
      ).not.toThrow();
  });

  it("rejects an unknown mode", () => {
    expect(() =>
      narrationBlockTransformInputSchema.parse({ mode: "rewrite", expectedRevision: 0 }),
    ).toThrow();
  });
});

describe("narration transform contracts", () => {
  it("accepts a bounded transform response", () => {
    expect(() =>
      narrationTransformResponseSchema.parse({
        jobId: "019ffbf1-eeee-7000-8000-000000000050",
        status: "queued",
      }),
    ).not.toThrow();
  });

  it("accepts bounded transform params", () => {
    expect(() =>
      narrationTransformParamsSchema.parse({
        narrationSetId: "019ffbf1-eeee-7000-8000-000000000010",
        narrationSetRevision: 0,
        blockId: "019ffbf1-eeee-7000-8000-000000000001",
        outlineItemId: outlineItemA,
        mode: "shorten",
        instruction: null,
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
      }),
    ).not.toThrow();
  });

  it("accepts a single-block transform output", () => {
    expect(() =>
      narrationBlockTransformOutputSchema.parse({
        schemaVersion: "narration-block-v1",
        mode: "shorten",
        block: {
          outlineItemId: outlineItemA,
          sentences: [
            { text: "Water turns into vapour when heated.", sourceBlockIds: [blockId] },
          ],
        },
      }),
    ).not.toThrow();
  });

  it("rejects a transform output for the wrong schema version", () => {
    expect(() =>
      narrationBlockTransformOutputSchema.parse({
        schemaVersion: "narration-v1",
        mode: "shorten",
        block: {
          outlineItemId: outlineItemA,
          sentences: [
            { text: "Water turns into vapour when heated.", sourceBlockIds: [blockId] },
          ],
        },
      }),
    ).toThrow();
  });

  it("targets the narration-block v1 prompt with the Together model", () => {
    expect(currentNarrationTransformCompatibility).toMatchObject({
      promptId: "narration-block",
      promptVersion: "v1",
      model: "Qwen/Qwen3.8-Flash",
    });
  });
});

describe("narration candidates and revisions", () => {
  it("accepts a pending candidate", () => {
    expect(() =>
      narrationBlockCandidateSchema.parse({
        id: "019ffbf1-eeee-7000-8000-000000000060",
        blockId: "019ffbf1-eeee-7000-8000-000000000001",
        mode: "shorten",
        text: "Water turns into vapour when heated.",
        estimatedWords: 7,
        sourceRefs: blockRow().sourceRefs,
        generatedAdditions: [],
        status: "pending",
        blockRevision: 0,
        modelCallId: "019ffbf1-eeee-7000-8000-000000000030",
        createdAt: "2026-08-17T11:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("accepts an archived block revision", () => {
    expect(() =>
      narrationBlockRevisionSchema.parse({
        id: "019ffbf1-eeee-7000-8000-000000000070",
        blockId: "019ffbf1-eeee-7000-8000-000000000001",
        revision: 0,
        text: "Heating water turns it into vapour.",
        estimatedWords: 6,
        sourceRefs: blockRow().sourceRefs,
        generatedAdditions: [],
        origin: "generated",
        modelCallId: null,
        createdAt: "2026-08-17T11:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("accepts candidate decision and restore inputs", () => {
    expect(() =>
      narrationCandidateDecisionInputSchema.parse({ expectedRevision: 0 }),
    ).not.toThrow();
    expect(() =>
      narrationBlockRestoreInputSchema.parse({ revision: 1, expectedRevision: 0 }),
    ).not.toThrow();
  });
});
