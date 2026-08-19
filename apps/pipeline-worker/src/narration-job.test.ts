import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlocks,
  narrationSets,
  sourceSnapshots,
  type DatabaseExecutor,
} from "@avlp/database";
import { createJobEnvelope, type JobMetadata } from "@avlp/jobs";
import {
  InMemoryQuotaGuard,
  jsonCompletion,
  MockLanguageModelProvider,
  mockPricing,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import {
  buildSourcePackage,
  narrationGenerationParamsSchema,
  narrationOutputV1Schema,
  narrationSentenceMaximumWords,
  sourceSnapshotSchema,
  type NarrationOutputV1,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import {
  assertNarrationDeterministicChecks,
  computeOutlineSetContentHash,
  createNarrationGenerationJobHandler,
  loadApprovedOutlineSet,
  NarrationDeterministicCheckError,
  persistNarrationSet,
} from "./narration-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const itemA = "019ffbf1-1111-7000-8000-000000000001";
const itemB = "019ffbf1-1111-7000-8000-000000000002";
const sectionId = "019ffbf1-2222-7000-8000-000000000001";
const blockA = "019ffbf1-3333-7000-8000-000000000001";
const blockB = "019ffbf1-3333-7000-8000-000000000002";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000001";

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
}

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: snapshotId,
    projectId,
    sourceDocumentId: "019ffbf1-4444-7000-8000-000000000001",
    parsedDocumentId: "019ffbf1-5555-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy: ownerUserId,
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: [
      {
        sectionId,
        order: 1,
        level: 1,
        heading: "Water cycle",
        pageStart: 1,
        pageEnd: 2,
        reviewOrder: null,
        blockIds: [blockA, blockB],
        figureIds: [],
        tableIds: [],
      },
    ],
    blocks: [
      {
        blockId: blockA,
        sectionId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water evaporates when heated and rises as water vapour into the sky.",
        corrected: false,
        revision: 0,
      },
      {
        blockId: blockB,
        sectionId,
        kind: "paragraph",
        order: 2,
        pageStart: 2,
        pageEnd: 2,
        text: "Condensation forms clouds when water vapour cools and becomes liquid.",
        corrected: false,
        revision: 0,
      },
    ],
    figures: [],
    tables: [],
  });
}

function approvedOutlineSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: outlineSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    status: "approved",
    revision: 0,
    ...overrides,
  };
}

function outlineItemRows() {
  return [
    {
      id: itemA,
      order: 1,
      kind: "hook",
      title: "Where does the water go?",
      description: "Open with a question about a drying puddle.",
      estimatedSeconds: 20,
    },
    {
      id: itemB,
      order: 2,
      kind: "concept",
      title: "Evaporation",
      description: "Explain how heating turns water into vapour.",
      estimatedSeconds: 30,
    },
  ];
}

function validOutput(): NarrationOutputV1 {
  return narrationOutputV1Schema.parse({
    schemaVersion: "narration-v1",
    targetDurationSeconds: 180,
    blocks: [
      {
        outlineItemId: itemA,
        sentences: [
          {
            text: words(20),
            sourceBlockIds: [blockA],
          },
          {
            text: words(18),
            sourceBlockIds: [blockA],
          },
        ],
      },
      {
        outlineItemId: itemB,
        sentences: [
          {
            text: words(28),
            sourceBlockIds: [blockB],
          },
          {
            text: words(27),
            sourceBlockIds: [blockB],
          },
        ],
      },
    ],
  });
}

const jobParams = narrationGenerationParamsSchema.parse({
  configurationVersion: 3,
  lessonTitle: "The water cycle",
  subject: "Science",
  ageBand: "11-13",
  difficulty: "introductory",
  tone: "friendly",
  targetDurationSeconds: 180,
  includeRecallQuestions: true,
  outlineSetId,
  outlineSetRevision: 0,
});

function operationContext() {
  return {
    outlineSetContentHash: "b".repeat(64),
    items: outlineItemRows(),
    params: jobParams,
  };
}

describe("computeOutlineSetContentHash", () => {
  it("is deterministic and order-sensitive", () => {
    const items = outlineItemRows();
    const first = computeOutlineSetContentHash(items);
    const second = computeOutlineSetContentHash([...items].reverse());
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("loadApprovedOutlineSet", () => {
  function executor(input: { setRows?: unknown[]; itemRows?: unknown[] } = {}) {
    const rowsFor = (table: unknown): unknown[] => {
      if (table === lessonOutlineSets)
        return input.setRows ?? [approvedOutlineSetRow()];
      if (table === lessonOutlineItems) return input.itemRows ?? outlineItemRows();
      return [];
    };
    const query = (rows: unknown[]) => {
      const result = {
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve(rows).then(resolve),
        limit: async () => rows,
        orderBy: () => result,
      };
      return result;
    };
    return {
      select: () => ({
        from: (table: unknown) => ({ where: () => query(rowsFor(table)) }),
      }),
    } as unknown as DatabaseExecutor;
  }

  it("returns the approved outline items when everything matches", async () => {
    const result = await loadApprovedOutlineSet({
      executor: executor(),
      ownerUserId,
      projectId,
      outlineSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.set.items).toHaveLength(2);
    expect(result.set.items[0]).toMatchObject({ id: itemA });
  });

  it("reports a missing outline set", async () => {
    const result = await loadApprovedOutlineSet({
      executor: executor({ setRows: [] }),
      ownerUserId,
      projectId,
      outlineSetId: createId(),
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("missing");
  });

  it("rejects an unapproved outline set", async () => {
    const result = await loadApprovedOutlineSet({
      executor: executor({ setRows: [approvedOutlineSetRow({ status: "draft" })] }),
      ownerUserId,
      projectId,
      outlineSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("not_approved");
  });

  it("rejects a stale outline-set revision", async () => {
    const result = await loadApprovedOutlineSet({
      executor: executor({ setRows: [approvedOutlineSetRow({ revision: 2 })] }),
      ownerUserId,
      projectId,
      outlineSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("revision_mismatch");
  });

  it("rejects a source-snapshot mismatch", async () => {
    const result = await loadApprovedOutlineSet({
      executor: executor({
        setRows: [approvedOutlineSetRow({ sourceSnapshotId: createId() })],
      }),
      ownerUserId,
      projectId,
      outlineSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("snapshot_mismatch");
  });
});

describe("assertNarrationDeterministicChecks", () => {
  const pkg = buildSourcePackage(sampleSnapshot());
  const context = operationContext();

  it("accepts a valid grounded narration", () => {
    expect(() =>
      assertNarrationDeterministicChecks(validOutput(), pkg, context),
    ).not.toThrow();
  });

  it("rejects a missing operation context", () => {
    expect(() =>
      assertNarrationDeterministicChecks(validOutput(), pkg, undefined),
    ).toThrow(/approved outline items/);
  });

  it("rejects a block for an unknown outline item", () => {
    const output = validOutput();
    output.blocks[1]!.outlineItemId = createId();
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/not approved/);
  });

  it("rejects a duplicate block for one outline item", () => {
    const output = validOutput();
    output.blocks.push(output.blocks[0]!);
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/duplicates narration/);
  });

  it("rejects an uncovered approved outline item", () => {
    const output = validOutput();
    output.blocks = output.blocks.filter((block) => block.outlineItemId !== itemB);
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/has no narration block/);
  });

  it("rejects a sentence citing an unsupported source block", () => {
    const output = validOutput();
    output.blocks[0]!.sentences[0]!.sourceBlockIds = [unknownBlock];
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/unsupported source block/);
  });

  it("rejects an over-long sentence", () => {
    const output = validOutput();
    output.blocks[0]!.sentences = [
      { text: words(narrationSentenceMaximumWords + 1), sourceBlockIds: [blockA] },
    ];
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(NarrationDeterministicCheckError);
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/maximum is/);
  });

  it("rejects a word count outside the outline item's budget", () => {
    const output = validOutput();
    output.blocks[0]!.sentences = [{ text: words(300), sourceBlockIds: [blockA] }];
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(NarrationDeterministicCheckError);
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/requires/);
  });

  it("rejects a total word count outside the covered-outline budget", () => {
    const output = validOutput();
    output.blocks[0]!.sentences = [
      { text: words(33), sourceBlockIds: [blockA] },
    ];
    output.blocks[1]!.sentences = [
      { text: words(25), sourceBlockIds: [blockB] },
      { text: words(25), sourceBlockIds: [blockB] },
    ];
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(NarrationDeterministicCheckError);
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/totals/);
  });

  it("rejects a target duration that does not match the configuration", () => {
    const output = validOutput();
    output.targetDurationSeconds = 300;
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/must match/);
  });

  it("rejects a sentence that copies a long source passage", () => {
    const output = validOutput();
    output.blocks[0]!.sentences = [
      {
        text: "Water evaporates when heated and rises as water vapour " + words(27),
        sourceBlockIds: [blockA],
      },
    ];
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(NarrationDeterministicCheckError);
    expect(() =>
      assertNarrationDeterministicChecks(output, pkg, context),
    ).toThrow(/copies a/);
  });
});

describe("persistNarrationSet", () => {
  function storeCapture() {
    const insertedSets: unknown[] = [];
    const insertedBlocks: unknown[] = [];
    const setIdsByKey = new Map<string, string>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        if (table === narrationBlocks) insertedBlocks.push(value);
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === narrationSets) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (setIdsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              setIdsByKey.set(key, id);
              insertedSets.push(value);
              return [{ id }];
            }
            return [{ id: createId() }];
          },
          then: (resolve: (rows: never[]) => void) =>
            Promise.resolve([]).then(resolve),
        };
        return chain;
      },
    });
    const executor = {
      transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
        cb({
          insert,
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => {
                  const key = [...setIdsByKey.keys()].at(-1);
                  if (key === undefined) return [];
                  const id = setIdsByKey.get(key)!;
                  return [{ id }];
                },
              }),
            }),
          }),
        }),
    } as unknown as DatabaseExecutor;
    return {
      executor,
      insertedSets,
      insertedBlocks,
      setIdsByKey,
    };
  }

  function callPersist(input: {
    executor: DatabaseExecutor;
    idempotencyKey: string;
  }) {
    return persistNarrationSet({
      executor: input.executor,
      output: validOutput(),
      sourcePackage: buildSourcePackage(sampleSnapshot()),
      snapshot: sampleSnapshot(),
      params: jobParams,
      modelCall: {
        id: "019ffbf1-eeee-7000-8000-000000000003",
        promptId: "narration",
        promptVersion: "v2",
        model: "mock-model-1",
      } as never,
      operationContext: operationContext(),
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now: new Date("2026-08-17T10:00:00.000Z"),
    });
  }

  it("persists a draft set with blocks and source references", async () => {
    const { executor, insertedSets, insertedBlocks } = storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insertedSets).toHaveLength(1);
    const set = insertedSets[0] as {
      status: string;
      outlineSetId: string;
      totalEstimatedSeconds: number;
      idempotencyKey: string;
    };
    expect(set.status).toBe("draft");
    expect(set.outlineSetId).toBe(outlineSetId);
    expect(set.totalEstimatedSeconds).toBe(50);
    expect(insertedBlocks).toHaveLength(1);
    const blocks = insertedBlocks[0] as Array<{
      outlineItemId: string;
      sourceRefs: unknown[];
      generatedAdditions: unknown[];
    }>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.outlineItemId).toBe(itemA);
    expect(blocks[0]!.sourceRefs.length).toBeGreaterThan(0);
  });

  it("is idempotent for the same job idempotency key", async () => {
    const { executor, insertedSets } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-dup" });
    const second = await callPersist({ executor, idempotencyKey: "key-dup" });
    expect(second.id).toBe(first.id);
    expect(insertedSets).toHaveLength(1);
  });
});

describe("narration generation job", () => {
  function fakeDatabase(options: {
    snapshot: SourceSnapshot;
    outlineSetRow?: Record<string, unknown>;
    outlineItemRows?: unknown[];
  }) {
    const setRows = new Map<string, { id: string }>();
    const rowsFor = (table: unknown): unknown[] => {
      if (table === sourceSnapshots)
        return [{ payload: options.snapshot, snapshotVersion: 1 }];
      if (table === lessonOutlineSets)
        return options.outlineSetRow === undefined
          ? []
          : [options.outlineSetRow];
      if (table === lessonOutlineItems)
        return options.outlineItemRows ?? [];
      return [];
    };
    const query = (rows: unknown[]) => {
      const result = {
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve(rows).then(resolve),
        limit: async () => rows,
        orderBy: () => result,
      };
      return result;
    };
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === narrationSets) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (setRows.has(key)) return [];
              const id = (value as { id: string }).id;
              setRows.set(key, { id });
              return [{ id }];
            }
            return [{ id: createId() }];
          },
          then: (resolve: (rows: never[]) => void) =>
            Promise.resolve([]).then(resolve),
        };
        return chain;
      },
    });
    const select = () => ({
      from: (table: unknown) => ({ where: () => query(rowsFor(table)) }),
    });
    const transactionSelect = () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const value = [...setRows.values()].at(-1);
            return value === undefined ? [] : [value];
          },
        }),
      }),
    });
    return {
      client: {},
      insert,
      select,
      transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
        cb({ insert, select: transactionSelect }),
    };
  }

  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      operationType: "ai.narration",
      sourceSnapshotId: snapshotId,
      promptId: "narration",
      promptVersion: "v2",
      model: "mock-model-1",
      params: jobParams,
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createNarrationGenerationJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(1) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "narration:v2",
        idempotencyKey: `narration:${createId()}`,
        correlationId: createId(),
        payloadVersion: handler.payloadVersion,
        payload: jobPayloadValue,
      },
    );
    const inner = (
      handler as unknown as {
        handler: (payload: unknown, context: unknown) => Promise<JobMetadata>;
      }
    ).handler;
    try {
      const metadata = await inner(
        (envelope as unknown as { payload: unknown }).payload,
        {
          jobId: envelope.jobId,
          projectId,
          ownerUserId,
          correlationId: envelope.correlationId,
          idempotencyKey: envelope.idempotencyKey,
          attempt: 1,
          heartbeat: vi.fn(async () => true),
          reportProgress: vi.fn(async () => true),
        },
      );
      return { outcome: "succeeded" as const, metadata };
    } catch (error) {
      return { outcome: "failed" as const, error };
    }
  }

  it("runs the lifecycle and produces a draft narration set", async () => {
    const snapshot = sampleSnapshot();
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput()),
    });
    const database = fakeDatabase({
      snapshot,
      outlineSetRow: approvedOutlineSetRow(),
      outlineItemRows: outlineItemRows(),
    });
    const handler = createNarrationGenerationJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    expect(handler.jobType).toBe("narration.generate");
    expect(handler.payloadVersion).toBe(1);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.narration",
      promptVersion: "v2",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects deterministic failures without producing a candidate", async () => {
    const snapshot = sampleSnapshot();
    const output = validOutput();
    output.blocks = output.blocks.filter((block) => block.outlineItemId !== itemB);
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const database = fakeDatabase({
      snapshot,
      outlineSetRow: approvedOutlineSetRow(),
      outlineItemRows: outlineItemRows(),
    });
    const handler = createNarrationGenerationJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("failed");
    const error = result.error as Error & { code?: string };
    expect(error.message).toContain(
      "The model output failed deterministic checks",
    );
    expect(error).toMatchObject({ code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE" });
  });
});
