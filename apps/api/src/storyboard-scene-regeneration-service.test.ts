import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  auditEvents,
  jobs,
  lessonConfigurations,
  lessonSpecs,
  narrationSets,
  outboxEvents,
  sceneCandidates,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import {
  lessonStoryboardSceneSchema,
  lessonStoryboardSchema,
  type LessonStoryboardScene,
  type SourceApprovalStatus,
} from "@avlp/schemas";
import { PostgresStoryboardService } from "./storyboard.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const narrationSetId = "019ffbf1-eeee-7000-8000-000000000020";
const objectiveId = "019ffbf1-eeee-7000-8000-000000000009";
const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000040";
const sceneId = "019ffbf1-eeee-7000-8000-000000000050";
const neighborSceneId = "019ffbf1-eeee-7000-8000-000000000051";
const blockA = "019ffbf1-eeee-7000-8000-000000000021";
const blockB = "019ffbf1-eeee-7000-8000-000000000022";
const contentHash = "a".repeat(64);
const candidateId = "019ffbf1-eeee-7000-8000-000000000060";

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

function narrationSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: narrationSetId,
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
    totalEstimatedSeconds: 60,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    ...overrides,
  };
}

function scene(overrides: Record<string, unknown> = {}): LessonStoryboardScene {
  return lessonStoryboardSceneSchema.parse({
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
    ...overrides,
  });
}

function neighborScene(): LessonStoryboardScene {
  return lessonStoryboardSceneSchema.parse({
    id: neighborSceneId,
    stableSceneId: neighborSceneId,
    order: 2,
    template: "summary",
    durationSeconds: 30,
    narrationBlockIds: [blockB],
    assetRequirements: [],
    scene: {
      id: neighborSceneId,
      order: 2,
      narration: "Condensation forms clouds when water vapour cools.",
      durationSeconds: 30,
      onScreenText: [],
      transition: "cut",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 2,
          pageEnd: 2,
          sectionId: "019ffbf1-2222-7000-8000-000000000001",
          blockIds: [blockB],
        },
      ],
      generatedAdditions: [],
      template: "summary",
      visual: { takeaways: [{ text: "The cycle repeats." }] },
    },
  });
}

function storyboardPayload(overrides: Record<string, unknown> = {}) {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: "c".repeat(64),
    outlineSetId,
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
    totalDurationSeconds: 60,
    objectiveIds: [objectiveId],
    contentHash: "d".repeat(64),
    scenes: [scene(), neighborScene()],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  });
}

function lessonSpecRow(overrides: Record<string, unknown> = {}) {
  const payload = storyboardPayload();
  return {
    id: lessonSpecId,
    projectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: payload.basedOnNarrationSetId,
    narrationSetContentHash: payload.narrationSetContentHash,
    outlineSetId: payload.outlineSetId,
    outlineSetContentHash: payload.outlineSetContentHash,
    configurationVersion: payload.configurationVersion,
    promptId: payload.promptId,
    promptVersion: payload.promptVersion,
    model: payload.model,
    modelCallId: payload.modelCallId,
    status: payload.status,
    revision: 0,
    idempotencyKey: "storyboard:key-1",
    title: payload.title,
    subject: payload.subject,
    targetDurationSeconds: payload.targetDurationSeconds,
    totalDurationSeconds: payload.totalDurationSeconds,
    objectiveIds: payload.objectiveIds,
    contentHash: payload.contentHash,
    payload,
    generatedAt: new Date("2026-08-18T10:00:00.000Z"),
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

function sceneRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sceneId,
    projectId,
    ownerUserId,
    lessonSpecId,
    stableSceneId: sceneId,
    order: 1,
    template: "definition",
    durationSeconds: 30,
    narrationBlockIds: [blockA],
    assetRequirements: [],
    sceneJson: scene().scene,
    revision: 0,
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

function candidateRow(overrides: Record<string, unknown> = {}) {
  const after = scene({
    scene: {
      ...scene().scene,
      visual: { term: "Evaporation", definition: "Water becoming gas." },
    },
  });
  return {
    id: candidateId,
    projectId,
    ownerUserId,
    lessonSpecId,
    sceneId,
    mode: "improve-visual",
    beforeScene: scene(),
    afterScene: after,
    status: "pending",
    sceneRevision: 0,
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    idempotencyKey: "scene-regenerate:key-1",
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

type FakeDbOptions = {
  configRows?: unknown[];
  narrationSetRows?: unknown[];
  lessonSpecRows?: unknown[];
  sceneRows?: unknown[];
  candidateRows?: unknown[];
  jobRows?: unknown[];
};

function fakeDatabase(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const jobIdsByKey = new Map<string, string>();
  const candidateIdsByKey = new Map<string, string>();
  let lessonSpecUpdate: unknown | undefined;
  let sceneUpdate: unknown | undefined;
  let candidateUpdate: unknown | undefined;

  const rowsFor = (table: unknown): unknown[] => {
    if (table === lessonConfigurations) return options.configRows ?? [];
    if (table === narrationSets) return options.narrationSetRows ?? [];
    if (table === lessonSpecs) return options.lessonSpecRows ?? [];
    if (table === scenes) return options.sceneRows ?? [];
    if (table === sceneCandidates) return options.candidateRows ?? [];
    if (table === jobs) {
      const rows = options.jobRows ?? [];
      if (rows.length > 0) return rows;
      return [...jobIdsByKey.values()].map((id) => ({ id }));
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
            jobIdsByKey.set(key, (value as { id: string }).id);
            return [{ id: (value as { id: string }).id }];
          }
          if (table === sceneCandidates) {
            const key = (value as { idempotencyKey: string }).idempotencyKey;
            if (candidateIdsByKey.has(key)) return [];
            candidateIdsByKey.set(key, (value as { id: string }).id);
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
  const update = (table: unknown) => ({
    set: (value: unknown) => {
      const chain = {
        where: () => {
          if (table === lessonSpecs) lessonSpecUpdate = value;
          if (table === scenes) sceneUpdate = value;
          if (table === sceneCandidates) candidateUpdate = value;
          const query = {
            returning: async () => [{ id: createId() }],
            then: (resolve: (value: unknown[]) => void) =>
              Promise.resolve([{ id: createId() }]).then(resolve),
          };
          return query;
        },
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
    update,
    select,
    transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
      cb({ insert, update, select }),
  } as unknown as DatabaseClient;
  return {
    database,
    inserts,
    jobIdsByKey,
    lessonSpecUpdate: () => lessonSpecUpdate,
    sceneUpdate: () => sceneUpdate,
    candidateUpdate: () => candidateUpdate,
  };
}

function createService(
  database: DatabaseClient,
  approval: SourceApprovalStatus,
) {
  const sourceApprovalStatus = vi.fn(async () => approval);
  const service = new PostgresStoryboardService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-18T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

describe("PostgresStoryboardService.regenerateScene", () => {
  it("rejects a missing idempotency key", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.regenerateScene({
        ownerUserId,
        projectId,
        sceneId,
        body: { mode: "improve-visual", expectedRevision: 0 },
        idempotencyKey: undefined,
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects a malformed body", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.regenerateScene({
        ownerUserId,
        projectId,
        sceneId,
        body: { mode: "expand-all", expectedRevision: 0 },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects regeneration without a draft storyboard", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.regenerateScene({
        ownerUserId,
        projectId,
        sceneId,
        body: { mode: "regenerate", expectedRevision: 0 },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects regeneration when the storyboard revision is stale", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow({ revision: 2 })],
      sceneRows: [sceneRow()],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.regenerateScene({
        ownerUserId,
        projectId,
        sceneId,
        body: { mode: "regenerate", expectedRevision: 0 },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "edit_conflict", statusCode: 409 });
  });

  it("rejects regeneration for a missing scene", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.regenerateScene({
        ownerUserId,
        projectId,
        sceneId,
        body: { mode: "regenerate", expectedRevision: 0 },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("rejects regeneration when the pending candidate cap is reached", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow()],
      narrationSetRows: [narrationSetRow()],
      candidateRows: [{ count: 5 }],
      configRows: [configRow()],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.regenerateScene({
        ownerUserId,
        projectId,
        sceneId,
        body: { mode: "simplify", expectedRevision: 0 },
        idempotencyKey: "key-1",
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("queues an idempotent scene regeneration job with outbox and audit", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow()],
      narrationSetRows: [narrationSetRow()],
      configRows: [configRow()],
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.regenerateScene({
      ownerUserId,
      projectId,
      sceneId,
      body: { mode: "improve-visual", expectedRevision: 0 },
      idempotencyKey: "scene-1",
      correlationId: createId(),
    });
    expect(result.status).toBe("queued");
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    const insertedJob = inserts.find((item) => item.table === jobs);
    expect(insertedJob).toBeDefined();
    const payload = (
      insertedJob!.value as { payload: { operationType: string } }
    ).payload;
    expect(payload.operationType).toBe("ai.scene_regeneration");
    expect(inserts.some((item) => item.table === outboxEvents)).toBe(true);
    expect(inserts.some((item) => item.table === auditEvents)).toBe(true);

    const second = await service.regenerateScene({
      ownerUserId,
      projectId,
      sceneId,
      body: { mode: "improve-visual", expectedRevision: 0 },
      idempotencyKey: "scene-1",
      correlationId: createId(),
    });
    expect(second.jobId).toBe(result.jobId);
    expect(jobIdsByKey.size).toBe(1);
    expect(inserts.filter((item) => item.table === outboxEvents)).toHaveLength(
      1,
    );
    expect(inserts.filter((item) => item.table === auditEvents)).toHaveLength(
      1,
    );
  });
});

describe("PostgresStoryboardService.applySceneCandidate", () => {
  it("applies only the selected scene and bumps revisions", async () => {
    const { database, lessonSpecUpdate, sceneUpdate, candidateUpdate } =
      fakeDatabase({
        lessonSpecRows: [lessonSpecRow()],
        sceneRows: [sceneRow()],
        candidateRows: [candidateRow()],
        narrationSetRows: [narrationSetRow()],
      });
    const { service } = createService(database, approvedStatus);
    await service.applySceneCandidate({
      ownerUserId,
      projectId,
      sceneId,
      candidateId,
      body: { expectedRevision: 0, expectedSceneRevision: 0 },
      correlationId: createId(),
    });
    const specUpdate = lessonSpecUpdate() as {
      revision: number;
      payload: unknown;
    };
    expect(specUpdate.revision).toBe(1);
    const payload = lessonStoryboardSchema.parse(specUpdate.payload);
    expect(payload.scenes).toHaveLength(2);
    const replaced = payload.scenes.find(
      (item) => item.stableSceneId === sceneId,
    )!;
    expect(replaced.scene.visual).toEqual({
      term: "Evaporation",
      definition: "Water becoming gas.",
    });
    expect(replaced.id).toBe(sceneId);
    const neighbor = payload.scenes.find(
      (item) => item.stableSceneId === neighborSceneId,
    )!;
    expect(neighbor.scene.visual).toEqual({
      takeaways: [{ text: "The cycle repeats." }],
    });
    expect((sceneUpdate() as { revision: number }).revision).toBe(1);
    expect((candidateUpdate() as { status: string }).status).toBe("accepted");
  });

  it("rejects a stale storyboard revision", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow({ revision: 3 })],
      sceneRows: [sceneRow()],
      candidateRows: [candidateRow()],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.applySceneCandidate({
        ownerUserId,
        projectId,
        sceneId,
        candidateId,
        body: { expectedRevision: 0, expectedSceneRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "edit_conflict", statusCode: 409 });
  });

  it("rejects a stale scene revision", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow({ revision: 2 })],
      candidateRows: [candidateRow()],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.applySceneCandidate({
        ownerUserId,
        projectId,
        sceneId,
        candidateId,
        body: { expectedRevision: 0, expectedSceneRevision: 2 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "edit_conflict", statusCode: 409 });
  });

  it("rejects a missing or non-pending candidate", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow()],
      candidateRows: [candidateRow({ status: "accepted" })],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.applySceneCandidate({
        ownerUserId,
        projectId,
        sceneId,
        candidateId,
        body: { expectedRevision: 0, expectedSceneRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects applying a candidate generated against a stale scene revision", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow()],
      candidateRows: [candidateRow({ sceneRevision: 1 })],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.applySceneCandidate({
        ownerUserId,
        projectId,
        sceneId,
        candidateId,
        body: { expectedRevision: 0, expectedSceneRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "edit_conflict", statusCode: 409 });
  });
});

describe("PostgresStoryboardService.rejectSceneCandidate", () => {
  it("marks a pending candidate rejected", async () => {
    const { database, candidateUpdate } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow()],
      candidateRows: [candidateRow()],
    });
    const { service } = createService(database, approvedStatus);
    await service.rejectSceneCandidate({
      ownerUserId,
      projectId,
      sceneId,
      candidateId,
      body: { expectedRevision: 0, expectedSceneRevision: 0 },
      correlationId: createId(),
    });
    expect((candidateUpdate() as { status: string }).status).toBe("rejected");
  });

  it("rejects a non-pending candidate", async () => {
    const { database } = fakeDatabase({
      lessonSpecRows: [lessonSpecRow()],
      sceneRows: [sceneRow()],
      candidateRows: [candidateRow({ status: "rejected" })],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.rejectSceneCandidate({
        ownerUserId,
        projectId,
        sceneId,
        candidateId,
        body: { expectedRevision: 0, expectedSceneRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});
