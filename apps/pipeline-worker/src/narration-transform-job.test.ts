import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlockCandidates,
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
  narrationBlockTransformOutputSchema,
  narrationTransformParamsSchema,
  narrationWordCountRange,
  sourceSnapshotSchema,
  type NarrationBlockTransformOutput,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import { computeOutlineSetContentHash } from "./narration-job.js";
import {
  assertNarrationBlockTransformChecks,
  createNarrationBlockTransformJobHandler,
  loadNarrationTransformContext,
  NarrationTransformDeterministicCheckError,
  persistNarrationBlockCandidate,
  type NarrationTransformOperationContext,
} from "./narration-transform-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const narrationSetId = "019ffbf1-eeee-7000-8000-000000000003";
const itemA = "019ffbf1-1111-7000-8000-000000000001";
const itemB = "019ffbf1-1111-7000-8000-000000000002";
const sectionId = "019ffbf1-2222-7000-8000-000000000001";
const blockA = "019ffbf1-3333-7000-8000-000000000001";
const blockB = "019ffbf1-3333-7000-8000-000000000002";
const targetBlockId = "019ffbf1-4444-7000-8000-000000000001";
const siblingBlockId = "019ffbf1-4444-7000-8000-000000000002";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000001";

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
}

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: snapshotId,
    projectId,
    sourceDocumentId: "019ffbf1-5555-7000-8000-000000000001",
    parsedDocumentId: "019ffbf1-6666-7000-8000-000000000001",
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

function outlineItemRows() {
  return [
    {
      id: itemA,
      order: 1,
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 30,
    },
    {
      id: itemB,
      order: 2,
      kind: "concept",
      title: "Condensation",
      description: "Explain condensation.",
      estimatedSeconds: 40,
    },
  ];
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

function narrationSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: narrationSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "a".repeat(64),
    outlineSetId,
    outlineSetContentHash: computeOutlineSetContentHash(outlineItemRows()),
    configurationVersion: 3,
    status: "draft",
    revision: 0,
    ...overrides,
  };
}

function targetBlockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: targetBlockId,
    projectId,
    ownerUserId,
    setId: narrationSetId,
    outlineItemId: itemA,
    order: 1,
    text: words(80),
    estimatedWords: 80,
    targetSeconds: 30,
    generated: true,
    revision: 0,
    ...overrides,
  };
}

function siblingBlockRows() {
  return [
    {
      id: siblingBlockId,
      order: 2,
      text: words(40),
    },
  ];
}

function transformParams(overrides: Record<string, unknown> = {}) {
  return narrationTransformParamsSchema.parse({
    narrationSetId,
    narrationSetRevision: 0,
    blockId: targetBlockId,
    outlineItemId: itemA,
    mode: "shorten",
    instruction: null,
    configurationVersion: 3,
    lessonTitle: "The water cycle",
    subject: "Science",
    ageBand: "11-13",
    difficulty: "introductory",
    tone: "friendly",
    targetDurationSeconds: 180,
    includeRecallQuestions: true,
    ...overrides,
  });
}

function validOutput(
  mode: "shorten" | "simplify" | "expand" | "regenerate" = "shorten",
): NarrationBlockTransformOutput {
  return narrationBlockTransformOutputSchema.parse({
    schemaVersion: "narration-block-v1",
    mode,
    block: {
      outlineItemId: itemA,
      sentences: [
        { text: words(28), sourceBlockIds: [blockA] },
        { text: words(28), sourceBlockIds: [blockA] },
      ],
    },
  });
}

function operationContext(
  overrides: Record<string, unknown> = {},
): NarrationTransformOperationContext {
  return {
    params: transformParams(),
    set: { id: narrationSetId, revision: 0 },
    block: {
      id: targetBlockId,
      outlineItemId: itemA,
      order: 1,
      text: words(80),
      estimatedWords: 80,
      revision: 0,
      generated: true,
    },
    currentWords: 80,
    neighbors: [{ order: 2, text: words(40) }],
    outlineItem: outlineItemRows()[0]!,
    wordBudget: narrationWordCountRange(30),
    ...overrides,
  };
}

describe("assertNarrationBlockTransformChecks", () => {
  const pkg = buildSourcePackage(sampleSnapshot());
  const context = operationContext();

  it("accepts a valid grounded rewritten block", () => {
    expect(() =>
      assertNarrationBlockTransformChecks(validOutput("shorten"), pkg, context),
    ).not.toThrow();
  });

  it("rejects a missing operation context", () => {
    expect(() =>
      assertNarrationBlockTransformChecks(validOutput(), pkg, undefined),
    ).toThrow(/operation context is missing/);
  });

  it("rejects a mode different from the request", () => {
    const output = validOutput("regenerate");
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(NarrationTransformDeterministicCheckError);
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(/returned mode regenerate/);
  });

  it("rejects a block for another outline item", () => {
    const output = validOutput();
    output.block.outlineItemId = itemB;
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(/instead of/);
  });

  it("rejects a word count outside the outline item budget", () => {
    const output = validOutput();
    output.block.sentences = [{ text: words(10), sourceBlockIds: [blockA] }];
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(/requires/);
  });

  it("rejects a shorten block that is not shorter", () => {
    const output = validOutput("shorten");
    output.block.sentences = [
      { text: words(30), sourceBlockIds: [blockA] },
      { text: words(30), sourceBlockIds: [blockA] },
    ];
    const shorterContext = operationContext({ currentWords: 55 });
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, shorterContext),
    ).toThrow(NarrationTransformDeterministicCheckError);
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, shorterContext),
    ).toThrow(/not fewer than the current 55/);
  });

  it("rejects an expand block that is not longer", () => {
    const output = validOutput("expand");
    output.block.sentences = [
      { text: words(28), sourceBlockIds: [blockA] },
      { text: words(28), sourceBlockIds: [blockA] },
    ];
    const expandContext = operationContext({
      params: transformParams({ mode: "expand" }),
    });
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, expandContext),
    ).toThrow(/not more than the current 80/);
  });

  it("accepts an expand block that is longer and within budget", () => {
    const longer = validOutput("expand");
    longer.block.sentences = [
      { text: words(30), sourceBlockIds: [blockA] },
      { text: words(30), sourceBlockIds: [blockA] },
    ];
    expect(() =>
      assertNarrationBlockTransformChecks(
        longer,
        pkg,
        operationContext({
          currentWords: 40,
          params: transformParams({ mode: "expand" }),
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a sentence citing an unsupported source block", () => {
    const output = validOutput();
    output.block.sentences[0]!.sourceBlockIds = [unknownBlock];
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(/unsupported source block/);
  });

  it("rejects an over-long sentence", () => {
    const output = validOutput();
    output.block.sentences = [{ text: words(60), sourceBlockIds: [blockA] }];
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(/maximum is 40/);
  });

  it("rejects a long copied passage from the bounded package", () => {
    const output = validOutput();
    const sourceText = pkg.sections[0]!.blocks[0]!.text;
    output.block.sentences = [
      {
        text: `${sourceText} and ${sourceText}`,
        sourceBlockIds: [blockA],
      },
    ];
    expect(() =>
      assertNarrationBlockTransformChecks(output, pkg, context),
    ).toThrow(NarrationTransformDeterministicCheckError);
  });
});

describe("loadNarrationTransformContext", () => {
  function executor(input: {
    setRows?: unknown[];
    targetBlockRows?: unknown[];
    siblingBlockRows?: unknown[];
    outlineSetRows?: unknown[];
    outlineItemRows?: unknown[];
  }) {
    let blockSelects = 0;
    const rowsFor = (table: unknown): unknown[] => {
      if (table === narrationSets) return input.setRows ?? [narrationSetRow()];
      if (table === narrationBlocks) {
        blockSelects += 1;
        if (blockSelects === 1)
          return input.targetBlockRows ?? [targetBlockRow()];
        return input.siblingBlockRows ?? siblingBlockRows();
      }
      if (table === lessonOutlineSets)
        return input.outlineSetRows ?? [approvedOutlineSetRow()];
      if (table === lessonOutlineItems)
        return input.outlineItemRows ?? outlineItemRows();
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

  it("loads the block, neighbors, and approved outline", async () => {
    const result = await loadNarrationTransformContext({
      executor: executor({}),
      ownerUserId,
      projectId,
      params: transformParams(),
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.context.block.id).toBe(targetBlockId);
    expect(result.context.currentWords).toBe(80);
    expect(result.context.neighbors).toHaveLength(1);
    expect(result.context.outlineItem.id).toBe(itemA);
  });

  it("reports a missing narration set", async () => {
    const result = await loadNarrationTransformContext({
      executor: executor({ setRows: [] }),
      ownerUserId,
      projectId,
      params: transformParams(),
    });
    expect(result.status).toBe("set_missing");
  });

  it("rejects a non-draft narration set", async () => {
    const result = await loadNarrationTransformContext({
      executor: executor({
        setRows: [narrationSetRow({ status: "approved" })],
      }),
      ownerUserId,
      projectId,
      params: transformParams(),
    });
    expect(result.status).toBe("set_not_draft");
  });

  it("rejects a stale narration-set revision", async () => {
    const result = await loadNarrationTransformContext({
      executor: executor({ setRows: [narrationSetRow({ revision: 2 })] }),
      ownerUserId,
      projectId,
      params: transformParams(),
    });
    expect(result.status).toBe("set_revision_mismatch");
  });

  it("reports a missing block", async () => {
    const result = await loadNarrationTransformContext({
      executor: executor({ targetBlockRows: [] }),
      ownerUserId,
      projectId,
      params: transformParams(),
    });
    expect(result.status).toBe("block_missing");
  });

  it("rejects an outline that no longer matches the narration", async () => {
    const result = await loadNarrationTransformContext({
      executor: executor({ outlineSetRows: [] }),
      ownerUserId,
      projectId,
      params: transformParams(),
    });
    expect(result.status).toBe("outline_mismatch");
  });
});

describe("persistNarrationBlockCandidate", () => {
  function storeCapture() {
    const inserted: unknown[] = [];
    const idsByKey = new Map<string, string>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === narrationBlockCandidates) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (idsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              idsByKey.set(key, id);
              inserted.push(value);
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
      insert,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const key = [...idsByKey.keys()].at(-1);
              if (key === undefined) return [];
              const id = idsByKey.get(key)!;
              return [{ id }];
            },
          }),
        }),
      }),
    } as unknown as DatabaseExecutor;
    return { executor, inserted, idsByKey };
  }

  function callPersist(input: {
    executor: DatabaseExecutor;
    idempotencyKey: string;
  }) {
    return persistNarrationBlockCandidate({
      executor: input.executor,
      value: validOutput("shorten"),
      sourcePackage: buildSourcePackage(sampleSnapshot()),
      params: transformParams(),
      modelCall: {
        id: "019ffbf1-eeee-7000-8000-000000000003",
        promptId: "narration-block",
        promptVersion: "v1",
        model: "mock-model-1",
      } as never,
      operationContext: operationContext(),
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now: new Date("2026-08-17T10:00:00.000Z"),
    });
  }

  it("persists a pending candidate with resolved references", async () => {
    const { executor, inserted } = storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(inserted).toHaveLength(1);
    const row = inserted[0] as {
      mode: string;
      status: string;
      sourceRefs: unknown[];
      blockRevision: number;
    };
    expect(row.mode).toBe("shorten");
    expect(row.status).toBe("pending");
    expect(row.blockRevision).toBe(0);
    expect(row.sourceRefs.length).toBeGreaterThan(0);
  });

  it("is idempotent for the same job idempotency key", async () => {
    const { executor, inserted } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-dup" });
    const second = await callPersist({ executor, idempotencyKey: "key-dup" });
    expect(second.id).toBe(first.id);
    expect(inserted).toHaveLength(1);
  });
});

describe("narration block transform job", () => {
  function fakeDatabase(options: {
    snapshot: SourceSnapshot;
    setRow?: Record<string, unknown>;
    targetBlockRow?: Record<string, unknown>;
    siblingBlockRows?: unknown[];
    outlineSetRow?: Record<string, unknown>;
    outlineItemRows?: unknown[];
  }) {
    const candidateIdsByKey = new Map<string, string>();
    let blockSelects = 0;
    const rowsFor = (table: unknown): unknown[] => {
      if (table === sourceSnapshots)
        return [{ payload: options.snapshot, snapshotVersion: 1 }];
      if (table === narrationSets)
        return options.setRow === undefined ? [] : [options.setRow];
      if (table === narrationBlocks) {
        blockSelects += 1;
        if (blockSelects === 1)
          return options.targetBlockRow === undefined
            ? []
            : [options.targetBlockRow];
        return options.siblingBlockRows ?? [];
      }
      if (table === lessonOutlineSets)
        return options.outlineSetRow === undefined
          ? []
          : [options.outlineSetRow];
      if (table === lessonOutlineItems) return options.outlineItemRows ?? [];
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
            if (table === narrationBlockCandidates) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (candidateIdsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              candidateIdsByKey.set(key, id);
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
    return { client: {}, insert, select } as never;
  }

  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 2,
      operationType: "ai.narration",
      sourceSnapshotId: snapshotId,
      promptId: "narration-block",
      promptVersion: "v1",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: createId(),
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      narrowing: { blockIds: [blockA, blockB] },
      params: transformParams(),
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createNarrationBlockTransformJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(2) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "narration-block:v1",
        idempotencyKey: `narration-transform:${createId()}`,
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

  it("runs the lifecycle and produces a pending block candidate", async () => {
    const snapshot = sampleSnapshot();
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput("shorten")),
    });
    const database = fakeDatabase({
      snapshot,
      setRow: narrationSetRow(),
      targetBlockRow: targetBlockRow(),
      siblingBlockRows: siblingBlockRows(),
      outlineSetRow: approvedOutlineSetRow(),
      outlineItemRows: outlineItemRows(),
    });
    const handler = createNarrationBlockTransformJobHandler({
      database,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    expect(handler.jobType).toBe("narration.transform");
    expect(handler.payloadVersion).toBe(2);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.narration",
      promptVersion: "v1",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects deterministic failures without producing a candidate", async () => {
    const snapshot = sampleSnapshot();
    const output = validOutput("shorten");
    output.block.sentences = [
      { text: words(50), sourceBlockIds: [blockA] },
      { text: words(50), sourceBlockIds: [blockA] },
    ];
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const database = fakeDatabase({
      snapshot,
      setRow: narrationSetRow(),
      targetBlockRow: targetBlockRow(),
      siblingBlockRows: siblingBlockRows(),
      outlineSetRow: approvedOutlineSetRow(),
      outlineItemRows: outlineItemRows(),
    });
    const handler = createNarrationBlockTransformJobHandler({
      database,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("failed");
    const error = result.error as Error & { code?: string };
    expect(error).toMatchObject({ code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE" });
  });

  it("fails without a provider call when the narration set is stale", async () => {
    const snapshot = sampleSnapshot();
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput("shorten")),
    });
    const database = fakeDatabase({
      snapshot,
      setRow: narrationSetRow({ revision: 3 }),
      targetBlockRow: targetBlockRow(),
      siblingBlockRows: siblingBlockRows(),
      outlineSetRow: approvedOutlineSetRow(),
      outlineItemRows: outlineItemRows(),
    });
    const handler = createNarrationBlockTransformJobHandler({
      database,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("failed");
    const error = result.error as Error & { code?: string };
    expect(error).toMatchObject({ code: "NARRATION_SET_REVISION_MISMATCH" });
  });
});
