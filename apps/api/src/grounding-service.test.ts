import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  auditEvents,
  groundingChecks,
  jobs,
  lessonSpecs,
  outboxEvents,
  type DatabaseClient,
} from "@avlp/database";
import {
  lessonStoryboardSchema,
  type SourceApprovalStatus,
} from "@avlp/schemas";
import { PostgresGroundingService } from "./grounding.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000040";
const sceneId = "019ffbf1-eeee-7000-8000-000000000050";
const blockA = "019ffbf1-eeee-7000-8000-000000000021";
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

function lessonSpecPayload() {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000020",
    narrationSetContentHash: "c".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: ["019ffbf1-eeee-7000-8000-000000000009"],
    contentHash: "d".repeat(64),
    scenes: [
      {
        id: sceneId,
        stableSceneId: sceneId,
        order: 1,
        template: "definition",
        durationSeconds: 30,
        narrationBlockIds: [blockA],
        assetRequirements: [],
        scene: {
          id: sceneId,
          order: 1,
          narration:
            "Water evaporates when heated and rises as water vapour into the sky.",
          durationSeconds: 30,
          onScreenText: ["Key term"],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [
            {
              documentId: "019ffbf1-3333-7000-8000-000000000001",
              parsedDocumentVersion: 1,
              pageStart: 1,
              pageEnd: 1,
              sectionId: "019ffbf1-2222-7000-8000-000000000001",
              blockIds: [blockA],
            },
          ],
          generatedAdditions: [],
          template: "definition",
          visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
        },
      },
    ],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
  });
}

function lessonSpecRow(overrides: Record<string, unknown> = {}) {
  return {
    id: lessonSpecId,
    projectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000020",
    narrationSetContentHash: "c".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    idempotencyKey: "storyboard:key-1",
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: ["019ffbf1-eeee-7000-8000-000000000009"],
    contentHash: "d".repeat(64),
    payload: lessonSpecPayload(),
    generatedAt: new Date("2026-08-18T10:00:00.000Z"),
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

function groundingCheckRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000070",
    projectId,
    ownerUserId,
    lessonSpecId,
    lessonSpecRevision: 0,
    lessonSpecContentHash: "d".repeat(64),
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    scope: "lesson",
    sceneId: null,
    claims: [],
    results: [],
    summary: { total: 0, supported: 0, unsupported: 0, generatedAddition: 0, needsReview: 0 },
    modelCallIds: [],
    idempotencyKey: "grounding:key-1",
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000080",
    projectId,
    ownerUserId,
    jobType: "grounding.check",
    state: "succeeded",
    errorMetadata: null,
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

type FakeDbOptions = {
  lessonSpecRows?: unknown[];
  jobRows?: unknown[];
  checkRows?: unknown[];
  checkFilter?: (row: Record<string, unknown>) => boolean;
};

function fakeDatabase(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const jobIdsByKey = new Map<string, Record<string, unknown>>();
  const rowsFor = (table: unknown): unknown[] => {
    if (table === lessonSpecs) return options.lessonSpecRows ?? [];
    if (table === jobs) {
      const rows = options.jobRows ?? [];
      if (rows.length > 0) return rows;
      return [...jobIdsByKey.values()];
    }
    if (table === groundingChecks) {
      const rows = options.checkRows ?? [];
      if (options.checkFilter === undefined) return rows;
      return rows.filter((row) =>
        options.checkFilter!(row as Record<string, unknown>),
      );
    }
    return [];
  };
  const query = (rows: unknown[]) => {
    const result = {
      limit: () => result,
      orderBy: () => result,
      for: () => result,
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
            jobIdsByKey.set(key, value as Record<string, unknown>);
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

function createService(database: DatabaseClient, approval: SourceApprovalStatus) {
  const sourceApprovalStatus = vi.fn(async () => approval);
  const service = new PostgresGroundingService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-18T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

describe("PostgresGroundingService.check", () => {
  const body = {
    scope: "lesson" as const,
    lessonSpecId,
    lessonSpecRevision: 0,
  };

  it("rejects a missing idempotency key", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.check({
        ownerUserId,
        projectId,
        body,
        idempotencyKey: undefined,
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects a malformed body", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.check({
        ownerUserId,
        projectId,
        body: { scope: "unknown", lessonSpecId },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects a check when the source is not confirmed", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, {
      ...approvedStatus,
      approved: false,
      snapshotId: null,
    });
    await expect(
      service.check({
        ownerUserId,
        projectId,
        body,
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a missing lesson spec", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.check({
        ownerUserId,
        projectId,
        body,
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("rejects a stale lesson spec revision", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow({ revision: 2 })],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.check({
        ownerUserId,
        projectId,
        body,
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a missing scene for scene scope", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.check({
        ownerUserId,
        projectId,
        body: {
          scope: "scene",
          sceneId: "019ffbf1-eeee-7000-8000-000000000099",
          lessonSpecId,
          lessonSpecRevision: 0,
        },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("queues an idempotent grounding job with outbox and audit", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.check({
      ownerUserId,
      projectId,
      body,
      idempotencyKey: "grounding-1",
      correlationId: createId(),
    });
    expect(result.status).toBe("queued");
    expect(result.cached).toBe(false);
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    const insertedJob = inserts.find((item) => item.table === jobs);
    expect(insertedJob).toBeDefined();
    const payload = (
      insertedJob!.value as {
        payload: { operationType: string; params: { scope: string } };
      }
    ).payload;
    expect(payload.operationType).toBe("ai.grounding");
    expect(payload.params.scope).toBe("lesson");
    expect(inserts.some((item) => item.table === outboxEvents)).toBe(true);
    expect(inserts.some((item) => item.table === auditEvents)).toBe(true);

    const second = await service.check({
      ownerUserId,
      projectId,
      body,
      idempotencyKey: "grounding-1",
      correlationId: createId(),
    });
    expect(second.jobId).toBe(result.jobId);
    expect(jobIdsByKey.size).toBe(1);
    expect(inserts.filter((item) => item.table === outboxEvents)).toHaveLength(1);
    expect(inserts.filter((item) => item.table === auditEvents)).toHaveLength(1);
  });

  it("reuses an existing completed check for identical content", async () => {
    const existing = groundingCheckRow();
    const { database, inserts } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      checkRows: [existing],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.check({
      ownerUserId,
      projectId,
      body,
      idempotencyKey: "grounding-cached",
      correlationId: createId(),
    });
    expect(result.cached).toBe(true);
    expect(result.jobId).toBe(existing.id);
    expect(inserts.filter((item) => item.table === jobs)).toHaveLength(0);
    expect(inserts.filter((item) => item.table === outboxEvents)).toHaveLength(0);
    expect(inserts.filter((item) => item.table === auditEvents)).toHaveLength(0);
  });

  it("does not reuse a check whose content hash differs", async () => {
    const { database, inserts } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      checkRows: [groundingCheckRow({ lessonSpecContentHash: "e".repeat(64) })],
      checkFilter: (row) => row.lessonSpecContentHash === "d".repeat(64),
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.check({
      ownerUserId,
      projectId,
      body,
      idempotencyKey: "grounding-cached-2",
      correlationId: createId(),
    });
    expect(result.cached).toBe(false);
    expect(inserts.filter((item) => item.table === jobs)).toHaveLength(1);
  });
});

describe("PostgresGroundingService.current", () => {
  it("returns the latest check and job", async () => {
    const { database } = fakeDatabase({
      checkRows: [groundingCheckRow()],
      jobRows: [jobRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.check).not.toBeNull();
    expect(result.check!.lessonSpecId).toBe(lessonSpecId);
    expect(result.check!.lessonSpecRevision).toBe(0);
    expect(result.latestJob).toEqual({
      id: "019ffbf1-eeee-7000-8000-000000000080",
      state: "succeeded",
      errorCode: null,
      updatedAt: "2026-08-18T10:00:00.000Z",
    });
  });

  it("returns nulls when nothing has run", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.check).toBeNull();
    expect(result.latestJob).toBeNull();
  });
});
