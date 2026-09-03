import { describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  auditEvents,
  extractedFigures,
  figureInclusionOverlays,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  parsedDocuments,
  projectAssets,
  scenes,
  type DatabaseClient,
  type DatabaseExecutor,
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
const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000040";
const sceneA = "019ffbf1-eeee-7000-8000-000000000050";
const sceneB = "019ffbf1-eeee-7000-8000-000000000051";
const sourceFigureId = "019ffbf1-eeee-7000-8000-000000000052";
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

function configRow() {
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
  };
}

function outlineSetRow() {
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
    totalEstimatedSeconds: 60,
    generatedAt: new Date("2026-08-17T10:00:00.000Z"),
    createdAt: new Date("2026-08-17T10:00:00.000Z"),
    updatedAt: new Date("2026-08-17T10:00:00.000Z"),
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

function narrationSetRow() {
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

function storyboardPayload(): LessonStoryboard {
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
    scenes: [
      {
        id: sceneA,
        stableSceneId: sceneA,
        order: 1,
        template: "definition",
        durationSeconds: 30,
        narrationBlockIds: [blockA],
        assetRequirements: [],
        scene: {
          id: sceneA,
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
        id: sceneB,
        stableSceneId: sceneB,
        order: 2,
        template: "summary",
        durationSeconds: 30,
        narrationBlockIds: [blockB],
        assetRequirements: [],
        scene: {
          id: sceneB,
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
      },
    ],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
  });
}

function lessonSpecRow(payload = storyboardPayload()) {
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
  };
}

type FakeDbOptions = {
  excludedFigureIds?: readonly string[];
  revision?: number;
  scenesToTrim?: number;
  sourceFigureIds?: readonly string[];
  storyboard?: LessonStoryboard;
  teacherAssets?: readonly { id: string; provenance: string }[];
};

function fakeDatabase(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  const updates: Array<{ table: unknown; value: unknown }> = [];
  const operations: string[] = [];
  const lessonSpecRows = [lessonSpecRow(options.storyboard)];
  if (options.revision !== undefined)
    lessonSpecRows[0] = {
      ...lessonSpecRows[0]!,
      revision: options.revision,
      payload: { ...lessonSpecRows[0]!.payload, revision: options.revision },
    };
  if (options.scenesToTrim !== undefined) {
    const payload = lessonSpecRows[0]!.payload as LessonStoryboard;
    const trimmed = payload.scenes.slice(0, options.scenesToTrim);
    lessonSpecRows[0] = {
      ...lessonSpecRows[0]!,
      totalDurationSeconds: trimmed.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
      payload: lessonStoryboardSchema.parse({
        ...payload,
        totalDurationSeconds: trimmed.reduce(
          (sum, scene) => sum + scene.durationSeconds,
          0,
        ),
        scenes: trimmed,
      }),
    };
  }
  const sceneRows = lessonSpecRows[0]!.payload.scenes.map((scene) => ({
    id: scene.id,
    projectId,
    ownerUserId,
    lessonSpecId,
    stableSceneId: scene.stableSceneId,
    order: scene.order,
    template: scene.template,
    durationSeconds: scene.durationSeconds,
    narrationBlockIds: scene.narrationBlockIds,
    assetRequirements: scene.assetRequirements,
    sceneJson: scene.scene,
    revision: 0,
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
  }));
  const parsedDocumentRows = [{ id: snapshotId }];
  const extractedFigureRows = (options.sourceFigureIds ?? [sourceFigureId]).map(
    (id) => ({ id, parsedDocumentId: snapshotId }),
  );
  const excludedFigureRows = (options.excludedFigureIds ?? []).map(
    (figureId) => ({ figureId }),
  );

  const rowsFor = (table: unknown): unknown[] => {
    if (table === lessonConfigurations) return [configRow()];
    if (table === lessonOutlineSets) return [outlineSetRow()];
    if (table === lessonOutlineItems) return outlineItemRows();
    if (table === narrationSets) return [narrationSetRow()];
    if (table === narrationBlocks) return narrationBlockRows();
    if (table === parsedDocuments) return parsedDocumentRows;
    if (table === extractedFigures) return extractedFigureRows;
    if (table === figureInclusionOverlays) return excludedFigureRows;
    if (table === lessonSpecs) return lessonSpecRows;
    if (table === scenes) return sceneRows;
    if (table === projectAssets) return [...(options.teacherAssets ?? [])];
    return [];
  };
  const thenable = (value: unknown) => ({
    then: (resolve: (value: unknown) => void) =>
      Promise.resolve(value).then(resolve),
  });
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
        returning: async () => [{ id: createId() }],
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve([]).then(resolve),
      };
      return chain;
    },
  });
  const update = (table: unknown) => ({
    set: (value: unknown) => {
      updates.push({ table, value });
      if (table === scenes) operations.push("update:scenes");
      if (table === lessonSpecs) {
        const merged = {
          ...lessonSpecRows[0]!,
          ...(value as Record<string, unknown>),
        };
        lessonSpecRows[0] = merged as (typeof lessonSpecRows)[0];
      }
      const chain = {
        where: () => ({
          returning: async () => [{ id: createId() }],
          then: (resolve: (value: unknown[]) => void) =>
            Promise.resolve([{ id: createId() }]).then(resolve),
        }),
      };
      return chain;
    },
  });
  const delete_ = (table: unknown) => {
    void table;
    return {
      where: () => ({
        returning: async () => [{ id: createId() }],
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve([{ id: createId() }]).then(resolve),
      }),
    };
  };
  const select = () => ({
    from: (table: unknown) => {
      if (table === scenes) operations.push("select:scenes");
      return { where: () => query(rowsFor(table)) };
    },
  });
  const executor: DatabaseExecutor = {
    insert,
    update,
    delete: delete_,
    select,
  } as unknown as DatabaseExecutor;
  const database = {
    client: {},
    insert,
    update,
    delete: delete_,
    select,
    transaction: async (cb: (inner: DatabaseExecutor) => Promise<unknown>) =>
      cb(executor),
  } as unknown as DatabaseClient;
  return {
    database,
    inserts,
    operations,
    updates,
    lessonSpecRows,
    sceneRows,
    thenable,
  };
}

function createService(database: DatabaseClient) {
  const sourceApprovalStatus = vi.fn(async () => approvedStatus);
  const service = new PostgresStoryboardService(
    database,
    sourceApprovalStatus,
    () => new Date("2026-08-18T10:00:00.000Z"),
  );
  return { service, sourceApprovalStatus };
}

function auditOperation(inserts: Array<{ table: unknown; value: unknown }>) {
  return inserts
    .filter((item) => item.table === auditEvents)
    .map((item) => item.value as { eventType: string; metadata: unknown });
}

describe("PostgresStoryboardService scene editor", () => {
  it("adds a scene from a template default and renumbers the list", async () => {
    const { database, inserts } = fakeDatabase();
    const { service } = createService(database);
    const result = await service.addScene({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0, template: "hook" },
      correlationId: createId(),
    });
    expect(result.revision).toBe(1);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes.map((scene) => scene.order)).toEqual([1, 2, 3]);
    expect(result.scenes[2]!.template).toBe("hook");
    const events = auditOperation(inserts);
    expect(events).toHaveLength(1);
    expect(events[0]!.eventType).toBe("storyboard.edited");
    expect((events[0]!.metadata as { operation: string }).operation).toBe(
      "add",
    );
  });

  it("rejects adding a scene against a stale revision", async () => {
    const { database } = fakeDatabase({ revision: 2 });
    const { service } = createService(database);
    await expect(
      service.addScene({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0, template: "hook" },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({
      code: "edit_conflict",
      statusCode: 409,
      latest: { revision: 2 },
    });
  });

  it("duplicates a scene with a new id after the source scene", async () => {
    const { database, inserts } = fakeDatabase();
    const { service } = createService(database);
    const result = await service.duplicateScene({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: { expectedRevision: 0 },
      correlationId: createId(),
    });
    expect(result.revision).toBe(1);
    expect(result.scenes).toHaveLength(3);
    const duplicate = result.scenes[1]!;
    expect(duplicate.template).toBe("definition");
    expect(duplicate.sceneId).not.toBe(sceneA);
    expect(result.scenes[0]!.sceneId).toBe(sceneA);
    const events = auditOperation(inserts);
    expect((events[0]!.metadata as { operation: string }).operation).toBe(
      "duplicate",
    );
  });

  it("rejects duplicating an unknown scene", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    await expect(
      service.duplicateScene({
        ownerUserId,
        projectId,
        sceneId: "019ffbf1-eeee-7000-8000-000000000099",
        body: { expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("deletes a scene and preserves the remaining scene's citations", async () => {
    const { database, inserts } = fakeDatabase();
    const { service } = createService(database);
    const result = await service.deleteScene({
      ownerUserId,
      projectId,
      sceneId: sceneB,
      body: { expectedRevision: 0 },
      correlationId: createId(),
    });
    expect(result.revision).toBe(1);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]!.sceneId).toBe(sceneA);
    expect(result.scenes[0]!.narrationBlockCount).toBe(1);
    const events = auditOperation(inserts);
    expect((events[0]!.metadata as { operation: string }).operation).toBe(
      "delete",
    );
  });

  it("blocks deleting the final scene", async () => {
    const { database } = fakeDatabase({ scenesToTrim: 1 });
    const { service } = createService(database);
    await expect(
      service.deleteScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: { expectedRevision: 0 },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("reorders scenes by stable id and keeps citations attached", async () => {
    const { database, inserts } = fakeDatabase();
    const { service } = createService(database);
    const result = await service.reorderScenes({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0, sceneIds: [sceneB, sceneA] },
      correlationId: createId(),
    });
    expect(result.revision).toBe(1);
    expect(result.scenes.map((scene) => scene.sceneId)).toEqual([
      sceneB,
      sceneA,
    ]);
    expect(result.scenes.map((scene) => scene.order)).toEqual([1, 2]);
    expect(result.scenes[0]!.narrationBlockCount).toBe(1);
    const events = auditOperation(inserts);
    expect((events[0]!.metadata as { operation: string }).operation).toBe(
      "reorder",
    );
  });

  it("rejects a reorder that does not list every scene exactly once", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    await expect(
      service.reorderScenes({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0, sceneIds: [sceneA] },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a malformed scene command body", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    await expect(
      service.reorderScenes({
        ownerUserId,
        projectId,
        body: { sceneIds: [sceneA] },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("persists an edited scene to the normalized row with a new revision", async () => {
    const { database, inserts, operations, updates } = fakeDatabase();
    const { service } = createService(database);
    const current = storyboardPayload().scenes[0]!.scene;
    const result = await service.updateScene({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: {
        expectedRevision: 0,
        scene: {
          ...current,
          narration: "Water warms, evaporates, and rises into the air.",
        },
      },
      correlationId: createId(),
    });
    expect(result.revision).toBe(1);
    expect(result.scene.scene.narration).toContain("evaporates");
    expect(result.invalidated).toEqual(
      expect.arrayContaining(["audio", "captions", "preview", "render"]),
    );
    expect(
      (auditOperation(inserts)[0]!.metadata as { operation: string }).operation,
    ).toBe("update");
    expect(
      updates.find(
        (update) =>
          update.table === scenes &&
          (update.value as { sceneJson?: { narration?: string } }).sceneJson
            ?.narration === "Water warms, evaporates, and rises into the air.",
      )?.value,
    ).toMatchObject({
      template: "definition",
      durationSeconds: 30,
      narrationBlockIds: [blockA],
      assetRequirements: [],
      sceneJson: {
        narration: "Water warms, evaporates, and rises into the air.",
      },
      revision: expect.anything(),
    });
    expect(
      updates.find(
        (update) =>
          update.table === scenes &&
          (update.value as { sceneJson?: { id?: string } }).sceneJson?.id ===
            sceneB,
      )?.value,
    ).toBeUndefined();
    expect(operations.indexOf("select:scenes")).toBeLessThan(
      operations.indexOf("update:scenes"),
    );
  });

  it("rejects invalid scene edits with field-level validation", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    const current = storyboardPayload().scenes[0]!.scene;
    await expect(
      service.updateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: {
          expectedRevision: 0,
          scene: { ...current, durationSeconds: 0 },
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects a scene update from a stale concurrent revision", async () => {
    const { database } = fakeDatabase({ revision: 2 });
    const { service } = createService(database);
    await expect(
      service.updateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: {
          expectedRevision: 0,
          scene: storyboardPayload().scenes[0]!.scene,
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({
      code: "edit_conflict",
      statusCode: 409,
      latest: { revision: 2 },
    });
  });

  it("binds an included project source figure without invalidating audio", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    const current = storyboardPayload().scenes[0]!.scene;
    const result = await service.updateScene({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: {
        expectedRevision: 0,
        scene: {
          ...current,
          assetBindings: [
            {
              assetId: sourceFigureId,
              role: "illustration",
              slot: "visual-example",
            },
          ],
        },
      },
      correlationId: createId(),
    });
    expect(result.scene.scene.assetBindings).toHaveLength(1);
    expect(result.invalidated).toContain("preview");
    expect(result.invalidated).not.toContain("audio");
  });

  it("rejects an asset that is not an included source figure in the project", async () => {
    const { database } = fakeDatabase({ sourceFigureIds: [] });
    const { service } = createService(database);
    const current = storyboardPayload().scenes[0]!.scene;
    await expect(
      service.updateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: {
          expectedRevision: 0,
          scene: {
            ...current,
            assetBindings: [
              {
                assetId: "019ffbf1-eeee-7000-8000-000000000099",
                role: "illustration",
                slot: "visual-example",
              },
            ],
          },
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects a source figure excluded from this project", async () => {
    const { database } = fakeDatabase({
      excludedFigureIds: [sourceFigureId],
    });
    const { service } = createService(database);
    const current = storyboardPayload().scenes[0]!.scene;
    await expect(
      service.updateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: {
          expectedRevision: 0,
          scene: {
            ...current,
            assetBindings: [
              {
                assetId: sourceFigureId,
                role: "illustration",
                slot: "visual-example",
              },
            ],
          },
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("binds a compatible approved catalog asset without invalidating narration audio", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    const result = await service.bindCatalogAsset({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      slot: "visual-example",
      body: {
        assetId: "019ffbf1-a003-7000-8000-000000000003",
        expectedRevision: 0,
      },
      correlationId: createId(),
    });
    expect(result.scene.scene.assetBindings).toEqual([
      expect.objectContaining({
        assetId: "019ffbf1-a003-7000-8000-000000000003",
        role: "illustration",
        slot: "visual-example",
      }),
    ]);
    expect(result.invalidated).toEqual(
      expect.arrayContaining(["preview", "render", "validation"]),
    );
    expect(result.invalidated).not.toContain("audio");
  });

  it("rejects an approved asset that is incompatible with a scene slot", async () => {
    const { database } = fakeDatabase();
    const { service } = createService(database);
    await expect(
      service.bindCatalogAsset({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        slot: "visual-example",
        body: {
          assetId: "019ffbf1-a001-7000-8000-000000000001",
          expectedRevision: 0,
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("refuses to bind a catalog asset to a grounding-critical diagram slot", async () => {
    const payload = storyboardPayload();
    const current = payload.scenes[0]!;
    const storyboard = lessonStoryboardSchema.parse({
      ...payload,
      scenes: [
        {
          ...current,
          template: "labelled-diagram",
          assetRequirements: [],
          scene: {
            ...current.scene,
            template: "labelled-diagram",
            assetBindings: [],
            visual: {
              kind: "shapes",
              shape: "cycle",
              labels: [{ anchor: "top", id: "part", text: "Part" }],
            },
          },
        },
        ...payload.scenes.slice(1),
      ],
    });
    const { database } = fakeDatabase({ storyboard });
    const { service } = createService(database);

    await expect(
      service.bindCatalogAsset({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        slot: "diagram",
        body: {
          assetId: "019ffbf1-a005-7000-8000-000000000005",
          expectedRevision: 0,
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      statusCode: 400,
      message: expect.stringContaining("grounding_critical"),
    });
  });

  it("refuses to bind an asset generated before this story to a grounding-critical slot", async () => {
    const generatedAssetId = "019ffbf1-eeee-7000-8000-000000000077";
    const payload = storyboardPayload();
    const current = payload.scenes[0]!;
    const storyboard = lessonStoryboardSchema.parse({
      ...payload,
      scenes: [
        {
          ...current,
          template: "labelled-diagram",
          assetRequirements: [],
          scene: {
            ...current.scene,
            template: "labelled-diagram",
            assetBindings: [],
            visual: {
              kind: "shapes",
              shape: "cycle",
              labels: [{ anchor: "top", id: "part", text: "Part" }],
            },
          },
        },
        ...payload.scenes.slice(1),
      ],
    });
    const { database } = fakeDatabase({
      storyboard,
      teacherAssets: [{ id: generatedAssetId, provenance: "ai_generated" }],
    });
    const { service } = createService(database);
    const diagramScene = storyboard.scenes[0]!.scene;

    await expect(
      service.updateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: {
          expectedRevision: 0,
          scene: {
            ...diagramScene,
            assetBindings: [
              {
                assetId: generatedAssetId,
                role: "diagram",
                slot: "diagram",
                sourceRef: diagramScene.sourceRefs[0],
              },
            ],
          },
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      statusCode: 400,
      message: expect.stringContaining("AI-generated"),
    });
  });

  it("allows an included source figure in a grounding-critical diagram slot", async () => {
    const payload = storyboardPayload();
    const current = payload.scenes[0]!;
    const storyboard = lessonStoryboardSchema.parse({
      ...payload,
      scenes: [
        {
          ...current,
          template: "labelled-diagram",
          assetRequirements: [],
          scene: {
            ...current.scene,
            template: "labelled-diagram",
            assetBindings: [],
            visual: {
              kind: "shapes",
              shape: "cycle",
              labels: [{ anchor: "top", id: "part", text: "Part" }],
            },
          },
        },
        ...payload.scenes.slice(1),
      ],
    });
    const { database } = fakeDatabase({ storyboard });
    const { service } = createService(database);
    const diagramScene = storyboard.scenes[0]!.scene;

    const result = await service.updateScene({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: {
        expectedRevision: 0,
        scene: {
          ...diagramScene,
          assetBindings: [
            { assetId: sourceFigureId, role: "diagram", slot: "diagram" },
          ],
        },
      },
      correlationId: createId(),
    });
    expect(result.scene.scene.assetBindings).toHaveLength(1);
  });

  it("rejects a source figure whose binding role does not match the slot", async () => {
    const payload = storyboardPayload();
    const current = payload.scenes[0]!;
    const storyboard = lessonStoryboardSchema.parse({
      ...payload,
      scenes: [
        {
          ...current,
          template: "labelled-diagram",
          assetRequirements: [],
          scene: {
            ...current.scene,
            template: "labelled-diagram",
            assetBindings: [],
            visual: {
              kind: "shapes",
              shape: "cycle",
              labels: [{ anchor: "top", id: "part", text: "Part" }],
            },
          },
        },
        ...payload.scenes.slice(1),
      ],
    });
    const { database } = fakeDatabase({ storyboard });
    const { service } = createService(database);
    const diagramScene = storyboard.scenes[0]!.scene;

    await expect(
      service.updateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: {
          expectedRevision: 0,
          scene: {
            ...diagramScene,
            assetBindings: [
              { assetId: sourceFigureId, role: "illustration", slot: "diagram" },
            ],
          },
        },
        correlationId: createId(),
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("does not require an asset for a labelled diagram that uses shapes", async () => {
    const payload = storyboardPayload();
    const current = payload.scenes[0]!;
    const storyboard = lessonStoryboardSchema.parse({
      ...payload,
      scenes: [
        {
          ...current,
          template: "labelled-diagram",
          assetRequirements: [],
          scene: {
            ...current.scene,
            template: "labelled-diagram",
            assetBindings: [],
            visual: {
              kind: "shapes",
              shape: "cycle",
              labels: [
                { anchor: "top", id: "evaporation", text: "Evaporation" },
                {
                  anchor: "right",
                  id: "condensation",
                  text: "Condensation",
                },
              ],
            },
          },
        },
        ...payload.scenes.slice(1),
      ],
    });
    const { database } = fakeDatabase({ storyboard });
    const { service } = createService(database);

    const detail = await service.sceneDetail({
      ownerUserId,
      projectId,
      sceneId: sceneA,
    });

    expect(detail.status.assets).toBe("none");
    expect(detail.status.validation).not.toBe("error");
  });

  it("keeps planned requirements in a missing state until every slot is bound", async () => {
    const payload = storyboardPayload();
    const current = payload.scenes[0]!;
    const requirements = [
      { slot: "step-1-icon", purpose: "Show the first step." },
      { slot: "step-2-icon", purpose: "Show the second step." },
    ];
    const createStoryboard = (bindingCount: number) =>
      lessonStoryboardSchema.parse({
        ...payload,
        scenes: [
          {
            ...current,
            template: "process",
            assetRequirements: requirements,
            scene: {
              ...current.scene,
              template: "process",
              visual: { steps: ["Warm water", "Water evaporates"] },
              assetBindings: [
                {
                  assetId: "019ffbf1-a001-7000-8000-000000000001",
                  role: "icon",
                  slot: "step-1-icon",
                },
                ...(
                  bindingCount === 2
                    ? [
                        {
                          assetId: "019ffbf1-a002-7000-8000-000000000002",
                          role: "icon" as const,
                          slot: "step-2-icon",
                        },
                      ]
                    : []
                ),
              ],
            },
          },
          ...payload.scenes.slice(1),
        ],
      });
    const partiallyBound = fakeDatabase({ storyboard: createStoryboard(1) });
    const fullyBound = fakeDatabase({ storyboard: createStoryboard(2) });

    await expect(
      createService(partiallyBound.database).service.sceneDetail({
        ownerUserId,
        projectId,
        sceneId: sceneA,
      }),
    ).resolves.toMatchObject({ status: { assets: "missing_required" } });
    await expect(
      createService(fullyBound.database).service.sceneDetail({
        ownerUserId,
        projectId,
        sceneId: sceneA,
      }),
    ).resolves.toMatchObject({ status: { assets: "resolved" } });
  });

  it("requires confirmation before dropping incompatible template data", async () => {
    const { database, updates } = fakeDatabase();
    const { service } = createService(database);
    const preview = await service.switchSceneTemplate({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: { expectedRevision: 0, template: "summary" },
      correlationId: createId(),
    });
    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.resetFields).toEqual(
      expect.arrayContaining(["visual.term", "visual.definition"]),
    );
    const saved = await service.switchSceneTemplate({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: { expectedRevision: 0, template: "summary", confirmReset: true },
      correlationId: createId(),
    });
    expect(saved.requiresConfirmation).toBe(false);
    expect(saved.scene.template).toBe("summary");
    expect(
      updates.find(
        (update) =>
          update.table === scenes &&
          (update.value as { sceneJson?: { id?: string } }).sceneJson?.id ===
            sceneA &&
          (update.value as { template?: string }).template === "summary",
      )?.value,
    ).toMatchObject({
      template: "summary",
      sceneJson: { template: "summary" },
      revision: expect.anything(),
    });
  });
});
