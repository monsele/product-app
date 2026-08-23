import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createId } from "@avlp/config";
import {
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
} from "@avlp/config";
import {
  auditEvents,
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  type DatabaseClient,
} from "@avlp/database";
import {
  lessonStoryboardSchema,
  type LessonStoryboard,
  type SourceApprovalStatus,
} from "@avlp/schemas";
import { PostgresStoryboardService } from "./storyboard.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const narrationSetId = "019ffbf1-eeee-7000-8000-000000000020";
const outlineItemA = "019ffbf1-eeee-7000-8000-000000000003";
const outlineItemB = "019ffbf1-eeee-7000-8000-000000000004";
const blockA = "019ffbf1-eeee-7000-8000-000000000021";
const blockB = "019ffbf1-eeee-7000-8000-000000000022";
const objectiveId = "019ffbf1-eeee-7000-8000-000000000009";
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
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 30,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
    {
      id: outlineItemB,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 2,
      kind: "concept",
      title: "Condensation",
      description: "Explain condensation.",
      estimatedSeconds: 30,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
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

function narrationBlockRows() {
  return [
    {
      id: blockA,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: outlineItemA,
      order: 1,
      text: "Water evaporates when heated and rises as water vapour into the sky.",
      estimatedWords: 12,
      targetSeconds: 30,
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
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
    {
      id: blockB,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: outlineItemB,
      order: 2,
      text: "Condensation forms clouds when water vapour cools and becomes liquid.",
      estimatedWords: 12,
      targetSeconds: 30,
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
      generated: true,
      revision: 0,
      createdAt: new Date("2026-08-17T10:00:00.000Z"),
      updatedAt: new Date("2026-08-17T10:00:00.000Z"),
    },
  ];
}

function jobRow(state = "succeeded") {
  return {
    id: "019ffbf1-eeee-7000-8000-000000000030",
    state,
    errorMetadata: null,
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
  };
}

function storyboardPayload(
  overrides: Record<string, unknown> = {},
): LessonStoryboard {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: "019ffbf1-eeee-7000-8000-000000000040",
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
    scenes: [
      {
        id: "019ffbf1-eeee-7000-8000-000000000050",
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000050",
        order: 1,
        template: "definition",
        durationSeconds: 30,
        narrationBlockIds: [blockA],
        assetRequirements: [],
        scene: {
          id: "019ffbf1-eeee-7000-8000-000000000050",
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
          visual: {
            term: "Evaporation",
            definition: "A liquid becoming a gas.",
          },
        },
      },
      {
        id: "019ffbf1-eeee-7000-8000-000000000051",
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000051",
        order: 2,
        template: "summary",
        durationSeconds: 30,
        narrationBlockIds: [blockB],
        assetRequirements: [],
        scene: {
          id: "019ffbf1-eeee-7000-8000-000000000051",
          order: 2,
          narration:
            "Condensation forms clouds when water vapour cools and becomes liquid.",
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
      },
    ],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  });
}

function lessonSpecRow(overrides: Record<string, unknown> = {}) {
  const payload = storyboardPayload();
  return {
    id: payload.id,
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

type FakeDbOptions = {
  configRows?: unknown[];
  outlineSetRows?: unknown[];
  outlineItemRows?: unknown[];
  narrationSetRows?: unknown[];
  narrationBlockRows?: unknown[];
  lessonSpecRows?: unknown[];
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
    if (table === lessonSpecs) return options.lessonSpecRows ?? [];
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
  const service = new PostgresStoryboardService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-18T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

describe("PostgresStoryboardService.generate", () => {
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

  it("rejects generation without a saved lesson configuration", async () => {
    const { database } = fakeDatabase();
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

  it("rejects generation without a narration set", async () => {
    const { database } = fakeDatabase({ configRows: [configRow()] });
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

  it("rejects generation when the source was re-approved after narration", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      narrationSetRows: [
        narrationSetRow({
          sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000099",
        }),
      ],
      narrationBlockRows: narrationBlockRows(),
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

  it("queues an idempotent storyboard job with outbox and audit records", async () => {
    const { database, inserts, jobIdsByKey } = fakeDatabase({
      configRows: [configRow()],
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
    });
    const { service } = createService(database, approvedStatus);
    const result = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "generate-1",
      correlationId: createId(),
    });
    expect(result.status).toBe("queued");
    expect(result.jobId).toMatch(/^[0-9a-f-]{36}$/);
    const insertedJob = inserts.find((item) => item.table === jobs);
    expect(insertedJob).toBeDefined();
    const payload = (
      insertedJob!.value as { payload: { operationType: string } }
    ).payload;
    expect(payload.operationType).toBe("ai.storyboard");
    expect(inserts.some((item) => item.table === outboxEvents)).toBe(true);
    expect(inserts.some((item) => item.table === auditEvents)).toBe(true);

    const second = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "generate-1",
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

describe("PostgresStoryboardService.current", () => {
  it("returns the idle state when nothing has been generated", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.state).toBe("idle");
    expect(response.storyboard).toBeNull();
    expect(response.canGenerate).toBe(true);
  });

  it("returns the draft with assembled storyboard scenes", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [lessonSpecRow()],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.state).toBe("draft");
    expect(response.storyboard).not.toBeNull();
    expect(response.storyboard?.scenes).toHaveLength(2);
    expect(response.validation.structurallyValid).toBe(true);
    expect(response.validation.unassignedBlockIds).toEqual([]);
    expect(response.canGenerate).toBe(true);
  });

  it("returns the generating state while a job is in flight", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [lessonSpecRow()],
      jobRows: [jobRow("running")],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.state).toBe("generating");
    expect(response.canGenerate).toBe(false);
  });

  it("marks the draft stale when the narration content changed", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [lessonSpecRow()],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.stale).toBe(true);
    expect(response.staleReason).toContain("narration");
  });

  it("surfaces the failed state for a failed generation job", async () => {
    const { database } = fakeDatabase({
      jobRows: [jobRow("failed")],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.state).toBe("failed");
    expect(response.latestJob?.state).toBe("failed");
  });

  it("returns the approved state when the working storyboard is approved", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [
        lessonSpecRow({
          status: "approved",
          payload: storyboardPayload({ status: "approved" }),
        }),
      ],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.state).toBe("approved");
    expect(response.approved?.id).toBe(response.storyboard?.id);
  });
});

describe("PostgresStoryboardService current validation", () => {
  it("reports uncovered outline items when a narration block is unassigned", async () => {
    const partialPayload = storyboardPayload({
      scenes: [storyboardPayload().scenes[0]!],
      totalDurationSeconds: 30,
      contentHash: "e".repeat(64),
    });
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [lessonSpecRow({ payload: partialPayload })],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.current({ ownerUserId, projectId });
    expect(response.validation.structurallyValid).toBe(false);
    expect(response.validation.unassignedBlockIds).toEqual([blockB]);
    expect(response.validation.uncoveredOutlineItemIds).toContain(outlineItemB);
  });
});

describe("PostgresStoryboardService.scenes", () => {
  const fixtureOptions = {
    configRows: [configRow()],
    outlineSetRows: [approvedOutlineSetRow()],
    outlineItemRows: outlineItemRows(),
    narrationSetRows: [narrationSetRow()],
    narrationBlockRows: narrationBlockRows(),
    lessonSpecRows: [lessonSpecRow()],
  };

  it("rejects the scene list when no storyboard draft exists", async () => {
    const { database } = fakeDatabase({ configRows: [configRow()] });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.scenes({ ownerUserId, projectId }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("returns ordered scene entries with projected statuses", async () => {
    const { database } = fakeDatabase(fixtureOptions);
    const { service } = createService(database, approvedStatus);
    const response = await service.scenes({ ownerUserId, projectId });
    expect(response.revision).toBe(0);
    expect(response.scenes).toHaveLength(2);
    expect(response.scenes.map((scene) => scene.order)).toEqual([1, 2]);
    expect(response.scenes[0]!.template).toBe("definition");
    expect(response.scenes[0]!.durationSeconds).toBe(30);
    expect(response.scenes[0]!.title).toBeNull();
    expect(response.scenes[0]!.narrationSummary).toBe(
      "Water evaporates when heated and rises as water vapour into the sky.",
    );
    expect(response.scenes[0]!.status).toEqual({
      assets: "none",
      audio: "not_generated",
      validation: "warning",
      stale: true,
    });
  });

  it("projects missing and resolved asset statuses from scene bindings", async () => {
    const payload = storyboardPayload({
      scenes: [
        {
          ...storyboardPayload().scenes[0]!,
          assetRequirements: [
            { slot: "visual-example", purpose: "Show evaporation." },
          ],
        },
        {
          ...storyboardPayload().scenes[1]!,
          scene: {
            ...storyboardPayload().scenes[1]!.scene,
            assetBindings: [
              {
                assetId: "019ffbf1-eeee-7000-8000-000000000099",
                role: "illustration" as const,
                slot: "visual-example",
              },
            ],
          },
        },
      ],
      contentHash: "f".repeat(64),
    });
    const { database } = fakeDatabase({
      ...fixtureOptions,
      lessonSpecRows: [lessonSpecRow({ payload })],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.scenes({ ownerUserId, projectId });
    expect(response.scenes[0]!.status.assets).toBe("missing_required");
    expect(response.scenes[1]!.status.assets).toBe("resolved");
  });

  it("projects an error validation status when the draft is structurally invalid", async () => {
    const partialPayload = storyboardPayload({
      scenes: [storyboardPayload().scenes[0]!],
      totalDurationSeconds: 30,
      contentHash: "e".repeat(64),
    });
    const { database } = fakeDatabase({
      ...fixtureOptions,
      lessonSpecRows: [lessonSpecRow({ payload: partialPayload })],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.scenes({ ownerUserId, projectId });
    expect(response.scenes[0]!.status.validation).toBe("error");
  });

  it("reports a consistent draft as fresh with an ok validation status", async () => {
    const narrationHash = computeNarrationSetContentHash(
      narrationBlockRows().map((block) => ({
        contentHash: computeNarrationBlockContentHash({
          text: block.text,
          sourceRefs: block.sourceRefs,
          generatedAdditions: block.generatedAdditions,
          generated: block.generated,
        }),
      })),
      narrationSetRow().totalEstimatedSeconds,
    );
    const outlineHash = createHash("sha256")
      .update(
        JSON.stringify(
          outlineItemRows().map((item) => ({
            id: item.id,
            order: item.order,
            kind: item.kind,
            title: item.title,
            description: item.description,
            estimatedSeconds: item.estimatedSeconds,
          })),
        ),
      )
      .digest("hex");
    const payload = storyboardPayload({
      narrationSetContentHash: narrationHash,
      outlineSetContentHash: outlineHash,
      targetDurationSeconds: 180,
      totalDurationSeconds: 180,
      contentHash: "f".repeat(64),
      scenes: [
        {
          ...storyboardPayload().scenes[0]!,
          durationSeconds: 60,
          scene: {
            ...storyboardPayload().scenes[0]!.scene,
            durationSeconds: 60,
          },
        },
        {
          ...storyboardPayload().scenes[1]!,
          durationSeconds: 60,
          scene: {
            ...storyboardPayload().scenes[1]!.scene,
            durationSeconds: 60,
          },
        },
        {
          ...storyboardPayload().scenes[0]!,
          id: "019ffbf1-eeee-7000-8000-000000000052",
          stableSceneId: "019ffbf1-eeee-7000-8000-000000000052",
          order: 3,
          durationSeconds: 60,
          scene: {
            ...storyboardPayload().scenes[0]!.scene,
            id: "019ffbf1-eeee-7000-8000-000000000052",
            order: 3,
            durationSeconds: 60,
          },
        },
      ],
    });
    const { database } = fakeDatabase({
      ...fixtureOptions,
      lessonSpecRows: [lessonSpecRow({ payload })],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.scenes({ ownerUserId, projectId });
    expect(response.scenes).toHaveLength(3);
    for (const scene of response.scenes)
      expect(scene.status).toMatchObject({
        validation: "ok",
        stale: false,
      });
  });
});

describe("PostgresStoryboardService.sceneDetail", () => {
  it("returns the selected scene with its status projection", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [lessonSpecRow()],
    });
    const { service } = createService(database, approvedStatus);
    const response = await service.sceneDetail({
      ownerUserId,
      projectId,
      sceneId: "019ffbf1-eeee-7000-8000-000000000050",
    });
    expect(response.scene.stableSceneId).toBe(
      "019ffbf1-eeee-7000-8000-000000000050",
    );
    expect(response.scene.scene.narration).toContain("evaporates");
    expect(response.status.audio).toBe("not_generated");
  });

  it("rejects an unknown scene id", async () => {
    const { database } = fakeDatabase({
      configRows: [configRow()],
      outlineSetRows: [approvedOutlineSetRow()],
      outlineItemRows: outlineItemRows(),
      narrationSetRows: [narrationSetRow()],
      narrationBlockRows: narrationBlockRows(),
      lessonSpecRows: [lessonSpecRow()],
    });
    const { service } = createService(database, approvedStatus);
    await expect(
      service.sceneDetail({
        ownerUserId,
        projectId,
        sceneId: "019ffbf1-eeee-7000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("rejects a scene detail when no storyboard draft exists", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database, approvedStatus);
    await expect(
      service.sceneDetail({
        ownerUserId,
        projectId,
        sceneId: "019ffbf1-eeee-7000-8000-000000000050",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});
