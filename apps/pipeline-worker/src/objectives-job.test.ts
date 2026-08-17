import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  learningObjectiveSets,
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
  objectiveOutputV1Schema,
  sourceSnapshotSchema,
  type ObjectiveOutputV1,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import {
  assertObjectiveDeterministicChecks,
  createObjectivesGenerationJobHandler,
  ObjectiveDeterministicCheckError,
  persistObjectiveSet,
  resolveObjectiveSourceRefs,
} from "./objectives-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const sectionId = "019ffbf1-1111-7000-8000-000000000001";
const blockA = "019ffbf1-2222-7000-8000-000000000001";
const blockB = "019ffbf1-2223-7000-8000-000000000001";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000001";

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: snapshotId,
    projectId,
    sourceDocumentId: "019ffbf1-4444-7000-8000-000000000001",
    parsedDocumentId: "019ffbf1-3333-7000-8000-000000000001",
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

function resolvePackage() {
  return buildSourcePackage(sampleSnapshot());
}

function validOutput(): ObjectiveOutputV1 {
  return objectiveOutputV1Schema.parse({
    schemaVersion: "objectives-v1",
    objectives: [
      {
        statement: "Describe how evaporation forms water vapour.",
        verb: "describe",
        sourceBlockIds: [blockA],
        confidence: 0.95,
      },
      {
        statement: "Explain how condensation forms clouds.",
        verb: "explain",
        sourceBlockIds: [blockB],
        confidence: 0.9,
      },
      {
        statement: "Sequence the water cycle stages.",
        verb: "sequence",
        sourceBlockIds: [blockA, blockB],
        confidence: 0.85,
      },
    ],
    keyConcepts: [
      { text: "Evaporation", sourceBlockIds: [blockA] },
      { text: "Condensation", sourceBlockIds: [blockB] },
    ],
    prerequisiteKnowledge: [],
    vocabulary: [
      {
        term: "Evaporation",
        definition: "Liquid turning into vapour.",
        sourceBlockIds: [blockA],
      },
    ],
    misconceptions: [],
    assessmentQuestions: [],
  });
}

const jobParams = {
  configurationVersion: 3,
  lessonTitle: "The water cycle",
  subject: "Science",
  ageBand: "11-13",
  difficulty: "introductory",
  tone: "friendly",
  targetDurationSeconds: 300,
  includeRecallQuestions: true,
};

describe("resolveObjectiveSourceRefs", () => {
  const pkg = resolvePackage();

  it("derives document, page, and section provenance from block IDs", () => {
    const refs = resolveObjectiveSourceRefs(pkg, [blockA, blockB]);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      documentId: pkg.normalizedDocumentId,
      parsedDocumentVersion: pkg.parsedDocumentVersion,
      pageStart: 1,
      pageEnd: 2,
      sectionId,
    });
    expect(refs[0]!.blockIds.sort()).toEqual([blockA, blockB].sort());
  });

  it("sorts and de-duplicates block IDs within a ref", () => {
    const refs = resolveObjectiveSourceRefs(pkg, [blockB, blockB, blockA]);
    expect(refs[0]!.blockIds).toEqual([blockA, blockB]);
  });

  it("rejects an unsupported source block ID", () => {
    expect(() => resolveObjectiveSourceRefs(pkg, [unknownBlock])).toThrow(
      ObjectiveDeterministicCheckError,
    );
    expect(() => resolveObjectiveSourceRefs(pkg, [unknownBlock])).toThrow(
      /unsupported source block/,
    );
  });
});

describe("assertObjectiveDeterministicChecks", () => {
  const pkg = resolvePackage();

  it("accepts a valid grounded output", () => {
    expect(() =>
      assertObjectiveDeterministicChecks(validOutput(), pkg),
    ).not.toThrow();
  });

  it("rejects duplicate objective statements", () => {
    const output = validOutput();
    output.objectives[1] = { ...output.objectives[0]! };
    expect(() => assertObjectiveDeterministicChecks(output, pkg)).toThrow(
      ObjectiveDeterministicCheckError,
    );
    expect(() => assertObjectiveDeterministicChecks(output, pkg)).toThrow(
      /duplicates an existing objective statement/,
    );
  });

  it("rejects non-measurable verbs", () => {
    const output = validOutput();
    output.objectives[0]!.verb = "understand";
    expect(() => assertObjectiveDeterministicChecks(output, pkg)).toThrow(
      /non-measurable verb/,
    );
  });

  it("rejects citations of unsupported source blocks", () => {
    const output = validOutput();
    output.objectives[0]!.sourceBlockIds = [unknownBlock];
    expect(() => assertObjectiveDeterministicChecks(output, pkg)).toThrow(
      /unsupported source block/,
    );
  });

  it("rejects planning items without resolvable citations", () => {
    const output = validOutput();
    output.keyConcepts[0]!.sourceBlockIds = [unknownBlock];
    expect(() => assertObjectiveDeterministicChecks(output, pkg)).toThrow(
      /unsupported source block/,
    );
  });
});

describe("persistObjectiveSet", () => {
  function storeCapture() {
    const insertedSets: unknown[] = [];
    const insertedObjectives: unknown[] = [];
    const keys = new Set<string>();
    const updated: unknown[] = [];
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === learningObjectiveSets) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (keys.has(key)) return [];
              keys.add(key);
              insertedSets.push(value);
              return [{ id: (value as { id: string }).id }];
            }
            return [{ id: createId() }];
          },
          then: (resolve: (rows: never[]) => void) =>
            Promise.resolve([]).then(resolve),
        };
        return chain;
      },
    });
    const update = (table: unknown) => ({
      set: (value: unknown) => ({
        where: async () => {
          updated.push({ table, value });
          return [];
        },
      }),
    });
    const executor = {
      transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
        cb({
          insert,
          update,
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => {
                  const value = insertedSets.at(-1) as
                    | { id: string }
                    | undefined;
                  return value === undefined ? [] : [{ id: value.id }];
                },
              }),
            }),
          }),
        }),
    } as unknown as DatabaseExecutor;
    return { executor, insertedSets, insertedObjectives, updated };
  }

  function callPersist(input: {
    executor: DatabaseExecutor;
    idempotencyKey: string;
  }) {
    return persistObjectiveSet({
      executor: input.executor,
      output: validOutput(),
      sourcePackage: resolvePackage(),
      snapshot: sampleSnapshot(),
      params: jobParams,
      modelCall: {
        id: "019ffbf1-eeee-7000-8000-000000000002",
        promptId: "objectives",
        promptVersion: "v2",
        model: "mock-model-1",
      } as never,
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now: new Date("2026-08-17T10:00:00.000Z"),
    });
  }

  it("persists a draft set and its objectives", async () => {
    const { executor, insertedSets } = storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(insertedSets).toHaveLength(1);
    const set = insertedSets[0] as {
      status: string;
      configurationVersion: number;
      promptVersion: string;
      sourceSnapshotId: string;
    };
    expect(set.status).toBe("draft");
    expect(set.configurationVersion).toBe(3);
    expect(set.promptVersion).toBe("v2");
    expect(set.sourceSnapshotId).toBe(snapshotId);
  });

  it("is idempotent for the same job idempotency key", async () => {
    const { executor, insertedSets } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-dup" });
    const second = await callPersist({ executor, idempotencyKey: "key-dup" });
    expect(second.id).toBe(first.id);
    expect(insertedSets).toHaveLength(1);
  });

  it("does not supersede prior sets when a new candidate is persisted", async () => {
    const { executor, updated } = storeCapture();
    await callPersist({ executor, idempotencyKey: "key-candidate" });
    expect(updated).toHaveLength(0);
  });
});

describe("objectives generation job", () => {
  function fakeDatabase(snapshot: SourceSnapshot) {
    const setRows = new Map<string, { id: string }>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === learningObjectiveSets) {
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
    const update = () => ({
      set: () => ({
        where: async () => [],
      }),
    });
    const select = () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ payload: snapshot, snapshotVersion: 1 }],
          orderBy: () => ({ limit: async () => [{ snapshotVersion: 1 }] }),
        }),
      }),
    });
    return {
      client: {},
      insert,
      update,
      select,
      transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
        cb({
          insert,
          update,
          select: () => ({
            from: () => ({
              where: () => ({
                limit: async () => {
                  const value = [...setRows.values()].at(-1);
                  return value === undefined ? [] : [value];
                },
              }),
            }),
          }),
        }),
    } as never;
  }

  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      operationType: "ai.objectives",
      sourceSnapshotId: snapshotId,
      promptId: "objectives",
      promptVersion: "v2",
      model: "mock-model-1",
      params: jobParams,
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createObjectivesGenerationJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(1) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "objectives:v2",
        idempotencyKey: `objectives:${createId()}`,
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

  it("runs the lifecycle and produces a draft set with candidateId metadata", async () => {
    const snapshot = sampleSnapshot();
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput()),
    });
    const handler = createObjectivesGenerationJobHandler({
      database: fakeDatabase(snapshot),
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    expect(handler.jobType).toBe("objectives.generate");
    expect(handler.payloadVersion).toBe(1);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.objectives",
      promptVersion: "v2",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects deterministic failures without producing a candidate", async () => {
    const snapshot = sampleSnapshot();
    const output = validOutput();
    output.objectives[0]!.verb = "understand";
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const handler = createObjectivesGenerationJobHandler({
      database: fakeDatabase(snapshot),
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-17T10:00:00.000Z"),
    });
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("failed");
    const error = result.error as Error & { code?: string };
    expect(error.message).toContain("The model output failed deterministic checks");
    expect(error).toMatchObject({ code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE" });
  });
});
