import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  learningObjectiveSets,
  learningObjectives,
  lessonOutlineItems,
  lessonOutlineSets,
  outlineObjectiveLinks,
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
  outlineGenerationParamsSchema,
  outlineOutputV1Schema,
  sourceSnapshotSchema,
  type OutlineOutputV1,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import {
  assertOutlineDeterministicChecks,
  computeObjectiveSetContentHash,
  createOutlineGenerationJobHandler,
  loadApprovedObjectiveSet,
  OutlineDeterministicCheckError,
  persistOutlineSet,
} from "./outline-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const objectiveSetId = "019ffbf1-eeee-7000-8000-000000000002";
const objectiveIdA = "019ffbf1-1111-7000-8000-000000000001";
const objectiveIdB = "019ffbf1-1111-7000-8000-000000000002";
const sectionId = "019ffbf1-2222-7000-8000-000000000001";
const blockA = "019ffbf1-3333-7000-8000-000000000001";
const blockB = "019ffbf1-3333-7000-8000-000000000002";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000001";

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
        text: "Water evaporates when heated.",
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
        text: "Condensation forms clouds.",
        corrected: false,
        revision: 0,
      },
    ],
    figures: [],
    tables: [],
  });
}

function approvedObjectiveSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: objectiveSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    status: "approved",
    revision: 0,
    ...overrides,
  };
}

function objectiveRows() {
  return [
    {
      id: objectiveIdA,
      statement: "Describe how evaporation forms water vapour.",
    },
    {
      id: objectiveIdB,
      statement: "Explain how condensation forms clouds.",
    },
  ];
}

function validOutput(): OutlineOutputV1 {
  return outlineOutputV1Schema.parse({
    schemaVersion: "outline-v1",
    targetDurationSeconds: 180,
    items: [
      {
        kind: "hook",
        title: "Where does the water go?",
        description: "Open with a question about a drying puddle.",
        objectiveIds: [objectiveIdA],
        sourceBlockIds: [blockA],
        estimatedSeconds: 20,
      },
      {
        kind: "concept",
        title: "Evaporation",
        description: "Explain how heating turns water into vapour.",
        objectiveIds: [objectiveIdA],
        sourceBlockIds: [blockA],
        estimatedSeconds: 40,
      },
      {
        kind: "concept",
        title: "Condensation",
        description: "Explain how cooling turns vapour into clouds.",
        objectiveIds: [objectiveIdB],
        sourceBlockIds: [blockB],
        estimatedSeconds: 40,
      },
      {
        kind: "example",
        title: "A puddle drying up",
        description: "Work through a familiar evaporation example.",
        objectiveIds: [objectiveIdA, objectiveIdB],
        sourceBlockIds: [blockA, blockB],
        estimatedSeconds: 40,
      },
      {
        kind: "recall_question",
        title: "Quick check",
        description: "Ask what happens to water when it is heated.",
        objectiveIds: [objectiveIdA],
        sourceBlockIds: [blockA],
        estimatedSeconds: 10,
      },
      {
        kind: "summary",
        title: "The water cycle at a glance",
        description: "Recap evaporation and condensation.",
        objectiveIds: [objectiveIdA, objectiveIdB],
        sourceBlockIds: [blockA, blockB],
        estimatedSeconds: 30,
      },
    ],
  });
}

const jobParams = outlineGenerationParamsSchema.parse({
  configurationVersion: 3,
  lessonTitle: "The water cycle",
  subject: "Science",
  ageBand: "11-13",
  difficulty: "introductory",
  tone: "friendly",
  targetDurationSeconds: 180,
  includeRecallQuestions: true,
  objectiveSetId,
  objectiveSetRevision: 0,
});

function operationContext() {
  return {
    objectives: objectiveRows(),
    objectiveSetContentHash: "b".repeat(64),
    params: jobParams,
  };
}

describe("computeObjectiveSetContentHash", () => {
  it("is deterministic and order-independent", () => {
    const objectives = objectiveRows();
    const first = computeObjectiveSetContentHash(objectives);
    const second = computeObjectiveSetContentHash([...objectives].reverse());
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("loadApprovedObjectiveSet", () => {
  function executor(input: { setRows?: unknown[]; objectiveRows?: unknown[] } = {}) {
    const rowsFor = (table: unknown): unknown[] => {
      if (table === learningObjectiveSets)
        return input.setRows ?? [approvedObjectiveSetRow()];
      if (table === learningObjectives)
        return input.objectiveRows ?? objectiveRows();
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

  it("returns the approved objectives when everything matches", async () => {
    const result = await loadApprovedObjectiveSet({
      executor: executor(),
      ownerUserId,
      projectId,
      objectiveSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.set.objectives).toHaveLength(2);
    expect(result.set.objectives[0]).toMatchObject({ id: objectiveIdA });
  });

  it("reports a missing objective set", async () => {
    const result = await loadApprovedObjectiveSet({
      executor: executor({ setRows: [] }),
      ownerUserId,
      projectId,
      objectiveSetId: createId(),
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("missing");
  });

  it("rejects an unapproved objective set", async () => {
    const result = await loadApprovedObjectiveSet({
      executor: executor({ setRows: [approvedObjectiveSetRow({ status: "draft" })] }),
      ownerUserId,
      projectId,
      objectiveSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("not_approved");
  });

  it("rejects a stale objective-set revision", async () => {
    const result = await loadApprovedObjectiveSet({
      executor: executor({ setRows: [approvedObjectiveSetRow({ revision: 2 })] }),
      ownerUserId,
      projectId,
      objectiveSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("revision_mismatch");
  });

  it("rejects a source-snapshot mismatch", async () => {
    const result = await loadApprovedObjectiveSet({
      executor: executor({
        setRows: [approvedObjectiveSetRow({ sourceSnapshotId: createId() })],
      }),
      ownerUserId,
      projectId,
      objectiveSetId,
      expectedRevision: 0,
      sourceSnapshotId: snapshotId,
    });
    expect(result.status).toBe("snapshot_mismatch");
  });
});

describe("assertOutlineDeterministicChecks", () => {
  const pkg = buildSourcePackage(sampleSnapshot());
  const context = operationContext();

  it("accepts a valid grounded outline", () => {
    expect(() =>
      assertOutlineDeterministicChecks(validOutput(), pkg, context),
    ).not.toThrow();
  });

  it("rejects an uncovered approved objective", () => {
    const output = validOutput();
    output.items.forEach((item) => {
      item.objectiveIds = item.objectiveIds.map((id) =>
        id === objectiveIdB ? objectiveIdA : id,
      );
    });
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(OutlineDeterministicCheckError);
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/uncovered/);
  });

  it("rejects a link to an unknown objective", () => {
    const output = validOutput();
    output.items[1]!.objectiveIds = [unknownBlock];
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/unknown objective/);
  });

  it("rejects an item citing an unsupported source block", () => {
    const output = validOutput();
    output.items[1]!.sourceBlockIds = [unknownBlock];
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/unsupported source block/);
  });

  it("rejects a sequence that does not open with a hook", () => {
    const output = validOutput();
    output.items = output.items.slice(1).concat(output.items[0]!);
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/open with a hook/);
  });

  it("rejects a sequence without a closing summary", () => {
    const output = validOutput();
    output.items = output.items.filter((item) => item.kind !== "summary");
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/close with a summary/);
  });

  it("rejects a sequence without concept items", () => {
    const output = validOutput();
    output.items = output.items.filter((item) => item.kind !== "concept");
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/concept item/);
  });

  it("rejects a sequence without example items", () => {
    const output = validOutput();
    output.items = output.items.filter((item) => item.kind !== "example");
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/example item/);
  });

  it("rejects a missing recall question when the configuration requests one", () => {
    const output = validOutput();
    output.items = output.items.filter((item) => item.kind !== "recall_question");
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/recall question/);
  });

  it("accepts the missing recall question when not requested", () => {
    const output = validOutput();
    output.items = output.items.filter((item) => item.kind !== "recall_question");
    const withoutRecall = {
      ...context,
      params: { ...context.params, includeRecallQuestions: false },
    };
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, withoutRecall),
    ).not.toThrow();
  });

  it("rejects a target duration that does not match the configuration", () => {
    const output = validOutput();
    output.targetDurationSeconds = 300;
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/must match/);
  });

  it("rejects an out-of-tolerance total duration", () => {
    const output = validOutput();
    output.items[1] = {
      ...output.items[1]!,
      estimatedSeconds: 60,
    };
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(OutlineDeterministicCheckError);
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, context),
    ).toThrow(/tolerance/);
  });

  it("rejects an outline too short to be storyboarded", () => {
    // A 300s lesson needs at least five items: each item becomes one narration
    // block and each block lands in one scene of at most 60s.
    const output = validOutput();
    output.targetDurationSeconds = 300;
    output.items = [
      { ...output.items[0]!, estimatedSeconds: 60 },
      { ...output.items[1]!, estimatedSeconds: 120 },
      { ...output.items[3]!, estimatedSeconds: 60 },
      { ...output.items[5]!, estimatedSeconds: 60 },
    ];
    const longerLesson = {
      ...context,
      params: outlineGenerationParamsSchema.parse({
        ...jobParams,
        targetDurationSeconds: 300,
        includeRecallQuestions: false,
      }),
    };
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, longerLesson),
    ).toThrow(OutlineDeterministicCheckError);
    expect(() =>
      assertOutlineDeterministicChecks(output, pkg, longerLesson),
    ).toThrow(/needs at least 5/);
  });

  it("rejects a missing operation context", () => {
    expect(() =>
      assertOutlineDeterministicChecks(validOutput(), pkg, undefined),
    ).toThrow(/approved objectives/);
  });
});

describe("persistOutlineSet", () => {
  function storeCapture() {
    const insertedSets: unknown[] = [];
    const insertedItems: unknown[] = [];
    const insertedLinks: unknown[] = [];
    const setIdsByKey = new Map<string, string>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        if (table === lessonOutlineItems) insertedItems.push(value);
        if (table === outlineObjectiveLinks) insertedLinks.push(value);
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === lessonOutlineSets) {
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
      insertedItems,
      insertedLinks,
      setIdsByKey,
    };
  }

  function callPersist(input: {
    executor: DatabaseExecutor;
    idempotencyKey: string;
  }) {
    return persistOutlineSet({
      executor: input.executor,
      output: validOutput(),
      sourcePackage: buildSourcePackage(sampleSnapshot()),
      snapshot: sampleSnapshot(),
      params: jobParams,
      modelCall: {
        id: "019ffbf1-eeee-7000-8000-000000000003",
        promptId: "outline",
        promptVersion: "v2",
        model: "mock-model-1",
      } as never,
      operationContext: operationContext(),
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now: new Date("2026-08-17T10:00:00.000Z"),
    });
  }

  it("persists a draft set with items and objective links", async () => {
    const { executor, insertedSets, insertedItems, insertedLinks } =
      storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insertedSets).toHaveLength(1);
    const set = insertedSets[0] as {
      status: string;
      objectiveSetId: string;
      totalEstimatedSeconds: number;
      idempotencyKey: string;
    };
    expect(set.status).toBe("draft");
    expect(set.objectiveSetId).toBe(objectiveSetId);
    expect(set.totalEstimatedSeconds).toBe(180);
    expect(insertedItems).toHaveLength(1);
    expect(insertedLinks).toHaveLength(1);
  });

  it("is idempotent for the same job idempotency key", async () => {
    const { executor, insertedSets } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-dup" });
    const second = await callPersist({ executor, idempotencyKey: "key-dup" });
    expect(second.id).toBe(first.id);
    expect(insertedSets).toHaveLength(1);
  });
});

describe("outline generation job", () => {
  function fakeDatabase(options: {
    snapshot: SourceSnapshot;
    objectiveSetRow?: Record<string, unknown>;
    objectiveRows?: unknown[];
  }) {
    const setRows = new Map<string, { id: string }>();
    const rowsFor = (table: unknown): unknown[] => {
      if (table === sourceSnapshots)
        return [{ payload: options.snapshot, snapshotVersion: 1 }];
      if (table === learningObjectiveSets)
        return options.objectiveSetRow === undefined
          ? []
          : [options.objectiveSetRow];
      if (table === learningObjectives) return options.objectiveRows ?? [];
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
            if (table === lessonOutlineSets) {
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
      operationType: "ai.outline",
      sourceSnapshotId: snapshotId,
      promptId: "outline",
      promptVersion: "v2",
      model: "mock-model-1",
      params: jobParams,
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createOutlineGenerationJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(1) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "outline:v2",
        idempotencyKey: `outline:${createId()}`,
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

  it("runs the lifecycle and produces a draft outline set", async () => {
    const snapshot = sampleSnapshot();
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput()),
    });
    const database = fakeDatabase({
      snapshot,
      objectiveSetRow: approvedObjectiveSetRow(),
      objectiveRows: objectiveRows(),
    });
    const handler = createOutlineGenerationJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    expect(handler.jobType).toBe("outline.generate");
    expect(handler.payloadVersion).toBe(1);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.outline",
      promptVersion: "v2",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects deterministic failures without producing a candidate", async () => {
    const snapshot = sampleSnapshot();
    const output = validOutput();
    output.items = output.items.filter((item) => item.kind !== "concept");
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const database = fakeDatabase({
      snapshot,
      objectiveSetRow: approvedObjectiveSetRow(),
      objectiveRows: objectiveRows(),
    });
    const handler = createOutlineGenerationJobHandler({
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
