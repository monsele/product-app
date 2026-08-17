import { describe, expect, it, vi } from "vitest";
import { createId, PublicError } from "@avlp/config";
import {
  auditEvents,
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  outboxEvents,
  outlineObjectiveLinks,
  projects,
  type DatabaseClient,
} from "@avlp/database";
import type { SourceApprovalStatus } from "@avlp/schemas";
import { PostgresOutlineService } from "./outline.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const objectiveSetId = "019ffbf1-eeee-7000-8000-000000000002";
const objectiveIdA = "019ffbf1-eeee-7000-8000-000000000003";
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

function approvedObjectiveSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: objectiveSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    configurationVersion: 3,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000004",
    status: "approved",
    revision: 0,
    idempotencyKey: "objectives:key-1",
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function objectiveRows() {
  return [
    {
      id: objectiveIdA,
      projectId,
      ownerUserId,
      setId: objectiveSetId,
      order: 1,
      statement: "Describe how evaporation forms water vapour.",
      verb: "describe",
      confidence: 0.95,
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
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
}

function outlineSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000020",
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    objectiveSetId,
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000004",
    status: "draft",
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
      id: "019ffbf1-eeee-7000-8000-000000000021",
      projectId,
      ownerUserId,
      setId: "019ffbf1-eeee-7000-8000-000000000020",
      order: 1,
      kind: "hook",
      title: "Where does the water go?",
      description: "Open with a question.",
      estimatedSeconds: 20,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
    {
      id: "019ffbf1-eeee-7000-8000-000000000022",
      projectId,
      ownerUserId,
      setId: "019ffbf1-eeee-7000-8000-000000000020",
      order: 2,
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 40,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
}

function outlineLinkRows() {
  return [
    {
      id: "019ffbf1-eeee-7000-8000-000000000031",
      projectId,
      ownerUserId,
      outlineItemId: "019ffbf1-eeee-7000-8000-000000000021",
      objectiveId: objectiveIdA,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
    {
      id: "019ffbf1-eeee-7000-8000-000000000032",
      projectId,
      ownerUserId,
      outlineItemId: "019ffbf1-eeee-7000-8000-000000000022",
      objectiveId: objectiveIdA,
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

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: projectId,
    ownerUserId,
    title: "Water cycle",
    stage: "outline_review",
    revision: 1,
    deletedAt: null,
    ...overrides,
  };
}

type FakeDbOptions = {
  configRows?: unknown[];
  approvedObjectiveSetRows?: unknown[];
  objectiveRows?: unknown[];
  outlineSetRows?: unknown[];
  outlineItemRows?: unknown[];
  outlineLinkRows?: unknown[];
  jobRows?: unknown[];
  projectRows?: unknown[];
};

function fakeDatabase(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const jobIdsByKey = new Map<string, string>();
  const rowsFor = (table: unknown): unknown[] => {
    if (table === lessonConfigurations) return options.configRows ?? [];
    if (table === learningObjectiveSets)
      return options.approvedObjectiveSetRows ?? [];
    if (table === learningObjectives) return options.objectiveRows ?? [];
    if (table === lessonOutlineSets) return options.outlineSetRows ?? [];
    if (table === lessonOutlineItems) return options.outlineItemRows ?? [];
    if (table === outlineObjectiveLinks) return options.outlineLinkRows ?? [];
    if (table === projects) return options.projectRows ?? [];
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
  const service = new PostgresOutlineService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-17T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

describe("PostgresOutlineService.generate", () => {
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
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
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

  it("rejects generation before objectives are approved", async () => {
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
      "Approve learning objectives",
    );
  });

  it("queues an outline job with a grounded payload and audit trail", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      configRows: [configRow()],
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
      objectiveRows: objectiveRows(),
      projectRows: [projectRow()],
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
        params: { configurationVersion: number; objectiveSetId: string };
      };
    };
    expect(jobValue.jobType).toBe("outline.generate");
    expect(jobValue.queueName).toBe("pipeline");
    expect(jobValue.payload.operationType).toBe("ai.outline");
    expect(jobValue.payload.params.configurationVersion).toBe(3);
    expect(jobValue.payload.params.objectiveSetId).toBe(objectiveSetId);
    expect(jobValue.payload.narrowing?.blockIds).toEqual([
      "019ffbf1-3333-7000-8000-000000000001",
    ]);
    const outboxInsert = inserts.find((entry) => entry.table === outboxEvents);
    expect(outboxInsert).toBeDefined();
    const auditInsert = inserts.find((entry) => entry.table === auditEvents);
    expect(auditInsert).toBeDefined();
    expect(jobIdsByKey.size).toBe(1);
  });

  it("queues without narrowing when approved objectives cite no blocks", async () => {
    const { database, inserts } = fakeDatabase({
      configRows: [configRow()],
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
      objectiveRows: objectiveRows().map((objective) => ({
        ...objective,
        sourceRefs: [],
      })),
    });
    const { service } = createService(database, approvedStatus);
    await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "generate-2",
      correlationId: createId(),
    });
    const jobInsert = inserts.find((entry) => entry.table === jobs);
    const jobValue = jobInsert!.value as { payload: { narrowing?: unknown } };
    expect(jobValue.payload.narrowing).toBeUndefined();
  });

  it("is idempotent for the same idempotency key", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      configRows: [configRow()],
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
      objectiveRows: objectiveRows(),
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

describe("PostgresOutlineService.current", () => {
  it("returns an idle response when nothing exists yet", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result).toMatchObject({
      state: "idle",
      set: null,
      latestJob: null,
      canGenerate: false,
    });
  });

  it("returns a failed response after a failed generation", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
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

  it("assembles a draft set with its items and objective links", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
      outlineSetRows: [outlineSetRow()],
      outlineItemRows: outlineItemRows(),
      outlineLinkRows: outlineLinkRows(),
      jobRows: [jobRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("draft");
    expect(result.set?.id).toBe("019ffbf1-eeee-7000-8000-000000000020");
    expect(result.set?.items).toHaveLength(2);
    expect(result.set?.items[0]).toMatchObject({
      kind: "hook",
      objectiveIds: [objectiveIdA],
    });
    expect(result.set?.items[1]).toMatchObject({
      kind: "concept",
      objectiveIds: [objectiveIdA],
    });
    expect(result.set?.totalEstimatedSeconds).toBe(180);
    expect(result.set?.objectiveSetId).toBe(objectiveSetId);
    expect(result.canGenerate).toBe(true);
  });

  it("blocks generation while a job is running", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      approvedObjectiveSetRows: [approvedObjectiveSetRow()],
      jobRows: [{ ...jobRow(), state: "running" }],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("generating");
    expect(result.canGenerate).toBe(false);
  });

  it("requires an approved objective set before generation", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.canGenerate).toBe(false);
  });
});
