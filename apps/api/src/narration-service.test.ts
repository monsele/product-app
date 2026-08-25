import { describe, expect, it, vi } from "vitest";
import { createId, PublicError } from "@avlp/config";
import {
  auditEvents,
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  type DatabaseClient,
} from "@avlp/database";
import type { SourceApprovalStatus } from "@avlp/schemas";
import { PostgresNarrationService } from "./narration.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const outlineItemA = "019ffbf1-eeee-7000-8000-000000000003";
const contentHash = "a".repeat(64);

const approvedStatus: SourceApprovalStatus = {
  approved: true,
  parsedDocumentVersion: 1,
  snapshotId,
  snapshotVersion: 1,
  contentHash,
  approvedAt: "2026-08-16T10:00:00.000Z",
  stale: false,
};

function configRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000010",
    projectId,
    ownerUserId,
    version: 3,
    ageBand: "11-13",
    difficulty: "introductory",
    subject: "Science",
    lessonTitle: "The water cycle",
    targetDurationSeconds: 180,
    tone: "friendly",
    visualTheme: "mvp-default",
    includeRecallQuestions: true,
    sourceParsedDocumentVersion: 1,
    createdAt: new Date("2026-08-16T10:00:00.000Z"),
    updatedAt: new Date("2026-08-16T10:00:00.000Z"),
    ...overrides,
  };
}

function approvedOutlineSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: outlineSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    objectiveSetId: "019ffbf1-eeee-7000-8000-000000000004",
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "approved",
    revision: 0,
    idempotencyKey: "outline:key-1",
    totalEstimatedSeconds: 180,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function outlineItemRows() {
  return [
    {
      id: outlineItemA,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 1,
      kind: "hook",
      title: "Where does the water go?",
      description: "Open with a question.",
      estimatedSeconds: 20,
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId: "019ffbf1-2222-7000-8000-000000000001",
          blockIds: ["019ffbf1-3333-7000-8000-000000000001"],
        },
      ],
      framingNote: "Generated framing question.",
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
}

function narrationSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000020",
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    idempotencyKey: "narration:key-1",
    totalEstimatedSeconds: 180,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function narrationBlockRows() {
  return [
    {
      id: "019ffbf1-eeee-7000-8000-000000000021",
      projectId,
      ownerUserId,
      setId: "019ffbf1-eeee-7000-8000-000000000020",
      outlineItemId: outlineItemA,
      order: 1,
      text: "Where does the water go when a puddle dries?",
      estimatedWords: 38,
      targetSeconds: 20,
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId: "019ffbf1-2222-7000-8000-000000000001",
          blockIds: ["019ffbf1-3333-7000-8000-000000000001"],
        },
      ],
      generatedAdditions: [],
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
}

function jobRow() {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000030",
    state: "succeeded",
    errorMetadata: null,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
  };
}

type FakeDbOptions = {
  configRows?: unknown[];
  outlineSetRows?: unknown[];
  outlineItemRows?: unknown[];
  narrationSetRows?: unknown[];
  narrationBlockRows?: unknown[];
  jobRows?: unknown[];
};

function fakeDatabase(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const jobIdsByKey = new Map<string, string>();
  const rowsFor = (table: unknown): unknown[] => {
    if (table === lessonConfigurations) return options.configRows ?? [];
    if (table === lessonOutlineSets) return options.outlineSetRows ?? [];
    if (table === lessonOutlineItems) return options.outlineItemRows ?? [];
    if (table === narrationSets) return options.narrationSetRows ?? [];
    if (table === narrationBlocks) return options.narrationBlockRows ?? [];
    if (table === jobs) {
      const rows = options.jobRows ?? [];
      if (rows.length > 0) return rows;
      return [...jobIdsByKey.values()].map((id) => ({ id }));
    }
    return [];
  };
  const query = (rows: unknown[]) => {
    const result = {
      limit: async () => rows,
      orderBy: () => result,
      then: (resolve: (value: unknown[]) => void) =>
        Promise.resolve(rows).then(resolve),
    };
    return result;
  };
  const insert = (table: unknown) => ({
    values: (value: unknown) => {
      inserts.push({ table, value });
      const chain = {
        onConflictDoNothing: () => chain,
        returning: async () => {
          if (table === jobs) {
            const key = (value as { idempotencyKey: string }).idempotencyKey;
            if (jobIdsByKey.has(key)) return [];
            jobIdsByKey.set(key, (value as { id: string }).id);
            return [{ id: (value as { id: string }).id }];
          }
          return [{ id: createId() }];
        },
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve([]).then(resolve),
      };
      return chain;
    },
  });
  const select = () => ({
    from: (table: unknown) => ({
      where: () => query(rowsFor(table)),
    }),
  });
  const database = {
    client: {},
    insert,
    select,
    transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
      cb({ insert, select }),
  } as unknown as DatabaseClient;
  return { database, inserts, jobIdsByKey };
}

function createService(
  database: DatabaseClient,
  approval: SourceApprovalStatus,
) {
  const sourceApprovalStatus = vi.fn(async () => approval);
  const service = new PostgresNarrationService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-17T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

describe("PostgresNarrationService.generate", () => {
  it("rejects a missing idempotency key", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.generate({
        ownerUserId,
        projectId,
        idempotencyKey: undefined,
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects generation when the source is not approved", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, {
      ...approvedStatus,
      approved: false,
    });
    await expect(
      service.generate({
        ownerUserId,
        projectId,
        idempotencyKey: "generate-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects generation when the approved source is stale", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, {
      ...approvedStatus,
      stale: true,
    });
    await expect(
      service.generate({
        ownerUserId,
        projectId,
        idempotencyKey: "generate-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects generation before the lesson configuration is saved", async () => {
    const { database } = fakeDatabase({
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.generate({
        ownerUserId,
        projectId,
        idempotencyKey: "generate-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects generation before the outline is approved", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
    });
    const { service } = createService(database, approvedStatus);
    const error = await service
      .generate({
        ownerUserId,
        projectId,
        idempotencyKey: "generate-1",
        correlationId: createId(),
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PublicError);
    expect((error as PublicError).message).toContain(
      "Approve the lesson outline",
    );
  });

  it("queues a narration job with a grounded payload and audit trail", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "generate-1",
      correlationId: "019ffbf1-eeee-7000-8000-000000000099",
    });
    expect(result.status).toBe("queued");
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    const jobInsert = inserts.find((entry) => entry.table === jobs);
    expect(jobInsert).toBeDefined();
    const jobValue = jobInsert!.value as {
      jobType: string;
      queueName: string;
      payload: {
        operationType: string;
        narrowing?: { blockIds: string[] };
        params: { configurationVersion: number; outlineSetId: string };
      };
    };
    expect(jobValue.jobType).toBe("narration.generate");
    expect(jobValue.queueName).toBe("pipeline");
    expect(jobValue.payload.operationType).toBe("ai.narration");
    expect(jobValue.payload.params.configurationVersion).toBe(3);
    expect(jobValue.payload.params.outlineSetId).toBe(outlineSetId);
    expect(jobValue.payload.narrowing?.blockIds).toEqual([
      "019ffbf1-3333-7000-8000-000000000001",
    ]);
    const outboxInsert = inserts.find((entry) => entry.table === outboxEvents);
    expect(outboxInsert).toBeDefined();
    const auditInsert = inserts.find((entry) => entry.table === auditEvents);
    expect(auditInsert).toBeDefined();
    expect(jobIdsByKey.size).toBe(1);
  });

  it("is idempotent for the same idempotency key", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
    });
    const { service } = createService(database, approvedStatus);
    const first = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "generate-dup",
      correlationId: createId(),
    });
    const second = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "generate-dup",
      correlationId: createId(),
    });
    expect(second.jobId).toBe(first.jobId);
    expect(jobIdsByKey.size).toBe(1);
    const outboxInserts = inserts.filter(
      (entry) => entry.table === outboxEvents,
    );
    expect(outboxInserts).toHaveLength(1);
  });
});

describe("PostgresNarrationService.current", () => {
  it("returns an idle response when nothing exists yet", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result).toMatchObject({
      state: "idle",
      set: null,
      latestJob: null,
      canGenerate: false,
      canApprove: false,
    });
  });

  it("returns a failed response after a failed generation", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      jobRows: [
        {
          ...jobRow(),
          state: "failed",
          errorMetadata: {
            classification: "terminal",
            code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE",
          },
        },
      ],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("failed");
    expect(result.latestJob).toMatchObject({
      state: "failed",
      errorCode: "MODEL_OUTPUT_DETERMINISTIC_FAILURE",
    });
    expect(result.canGenerate).toBe(true);
  });

  it("assembles a draft set with its blocks", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      jobRows: [jobRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("draft");
    expect(result.set?.id).toBe("019ffbf1-eeee-7000-8000-000000000020");
    expect(result.set?.blocks).toHaveLength(1);
    expect(result.set?.blocks[0]).toMatchObject({
      outlineItemId: outlineItemA,
      estimatedWords: 38,
      targetSeconds: 20,
    });
    expect(result.set?.totalEstimatedSeconds).toBe(180);
    expect(result.set?.outlineSetId).toBe(outlineSetId);
    expect(result.canGenerate).toBe(true);
    expect(result.validation).toMatchObject({
      structurallyValid: true,
      uncoveredOutlineItemIds: [],
    });
  });

  it("blocks generation while a job is running", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      jobRows: [{ ...jobRow(), state: "running" }],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("generating");
    expect(result.canGenerate).toBe(false);
  });

  it("requires an approved outline before generation", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.canGenerate).toBe(false);
    expect(result.validation.uncoveredOutlineItemIds).toEqual([]);
  });
});
