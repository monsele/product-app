import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  migrateDatabase,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  projects,
  scenes,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { PostgresStoryboardService } from "./storyboard.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000006";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000006";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000006";
const snapshotId: Identifier = "019ffbf1-dddd-7000-8000-000000000006";
const outlineSetId: Identifier = "019ffbf1-eeee-7000-8000-000000000006";
const narrationSetId: Identifier = "019ffbf1-ffff-7000-8000-000000000006";
const outlineItemA: Identifier = "019ffbf1-1111-7000-8000-000000000006";
const outlineItemB: Identifier = "019ffbf1-2222-7000-8000-000000000006";
const blockA: Identifier = "019ffbf1-3333-7000-8000-000000000006";
const blockB: Identifier = "019ffbf1-4444-7000-8000-000000000006";
const objectiveId: Identifier = "019ffbf1-5555-7000-8000-000000000006";
const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000006";
const sceneA: Identifier = "019ffbf1-7777-7000-8000-000000000006";
const sceneB: Identifier = "019ffbf1-8888-7000-8000-000000000006";
const now = new Date("2026-08-17T10:00:00.000Z");

function configRow() {
  return {
    id: "019ffbf1-9999-7000-8000-000000000006",
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
    createdAt: now,
    updatedAt: now,
  };
}

function outlineSetRow() {
  return {
    id: outlineSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    objectiveSetId: "019ffbf1-9999-7000-8000-000000000006",
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft" as const,
    revision: 0,
    idempotencyKey: "outline:key-1",
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function narrationSetRow() {
  return {
    id: narrationSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft" as const,
    revision: 0,
    idempotencyKey: "narration:key-1",
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
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
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function storyboardPayload() {
  return {
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
          visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
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
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
}

function lessonSpecRow() {
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
    status: "draft" as const,
    revision: 0,
    idempotencyKey: "storyboard:key-1",
    title: payload.title,
    subject: payload.subject,
    targetDurationSeconds: payload.targetDurationSeconds,
    totalDurationSeconds: payload.totalDurationSeconds,
    objectiveIds: payload.objectiveIds,
    contentHash: payload.contentHash,
    payload,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function seed(client: DatabaseClient) {
  await client.delete(outboxEvents);
  await client.delete(jobs);
  await client.delete(auditEvents);
  await client.delete(scenes);
  await client.delete(lessonSpecs);
  await client.delete(narrationBlocks);
  await client.delete(narrationSets);
  await client.delete(lessonOutlineItems);
  await client.delete(lessonOutlineSets);
  await client.delete(lessonConfigurations);
  await client.delete(sourceSnapshots);
  await client.delete(projects);
  await client.delete(users);

  await client.insert(users).values([
    { id: ownerUserId, emailNormalized: "owner@example.test", displayName: "Owner" },
    { id: otherOwnerUserId, emailNormalized: "other@example.test", displayName: "Other" },
  ]);
  await client.insert(projects).values({
    id: projectId,
    ownerUserId,
    title: "Water cycle",
    stage: "draft",
    latestFailedOperation: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  });
  await client.insert(lessonConfigurations).values(configRow());
  await client.insert(lessonOutlineSets).values(outlineSetRow());
  await client.insert(lessonOutlineItems).values(outlineItemRows());
  await client.insert(narrationSets).values(narrationSetRow());
  await client.insert(narrationBlocks).values(narrationBlockRows());
  await client.insert(lessonSpecs).values(lessonSpecRow());
}

describeWithPostgres("PostgresStoryboardService scene editor (Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresStoryboardService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seed(database!.client);
    service = new PostgresStoryboardService(
      database!.client,
      async () => ({
        approved: true,
        parsedDocumentVersion: 1,
        snapshotId,
        snapshotVersion: 1,
        contentHash: "c".repeat(64),
        approvedAt: "2026-08-17T10:00:00.000Z",
        stale: false,
      }),
      () => new Date("2026-08-17T10:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("adds a scene for the owner and rejects another tenant", async () => {
    const result = await service.addScene({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0, template: "hook" },
      correlationId: "019ffbf1-0000-7000-8000-000000000001",
    });
    expect(result.revision).toBe(1);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[2]!.template).toBe("hook");

    await expect(
      service.addScene({
        ownerUserId: otherOwnerUserId,
        projectId,
        body: { expectedRevision: 1, template: "hook" },
        correlationId: "019ffbf1-0000-7000-8000-000000000002",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("duplicates a scene for the owner and rejects another tenant", async () => {
    const result = await service.duplicateScene({
      ownerUserId,
      projectId,
      sceneId: sceneA,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-0000-7000-8000-000000000003",
    });
    expect(result.revision).toBe(1);
    expect(result.scenes).toHaveLength(3);
    expect(result.scenes[1]!.template).toBe("definition");
    expect(result.scenes[1]!.sceneId).not.toBe(sceneA);

    await expect(
      service.duplicateScene({
        ownerUserId: otherOwnerUserId,
        projectId,
        sceneId: sceneA,
        body: { expectedRevision: 1 },
        correlationId: "019ffbf1-0000-7000-8000-000000000004",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("deletes a scene for the owner and rejects another tenant", async () => {
    const result = await service.deleteScene({
      ownerUserId,
      projectId,
      sceneId: sceneB,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-0000-7000-8000-000000000005",
    });
    expect(result.revision).toBe(1);
    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0]!.sceneId).toBe(sceneA);

    await expect(
      service.deleteScene({
        ownerUserId: otherOwnerUserId,
        projectId,
        sceneId: sceneA,
        body: { expectedRevision: 1 },
        correlationId: "019ffbf1-0000-7000-8000-000000000006",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("reorders scenes for the owner and rejects another tenant", async () => {
    const result = await service.reorderScenes({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0, sceneIds: [sceneB, sceneA] },
      correlationId: "019ffbf1-0000-7000-8000-000000000007",
    });
    expect(result.revision).toBe(1);
    expect(result.scenes.map((s) => s.sceneId)).toEqual([sceneB, sceneA]);

    await expect(
      service.reorderScenes({
        ownerUserId: otherOwnerUserId,
        projectId,
        body: { expectedRevision: 1, sceneIds: [sceneA, sceneB] },
        correlationId: "019ffbf1-0000-7000-8000-000000000008",
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });

  it("records audit events with storyboard.edited type", async () => {
    await service.addScene({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0, template: "hook" },
      correlationId: "019ffbf1-0000-7000-8000-000000000009",
    });
    const audit = await database!.client.select().from(auditEvents);
    const sceneEdits = audit.filter((a) => a.eventType === "storyboard.edited");
    expect(sceneEdits).toHaveLength(1);
    const edit = sceneEdits[0]!;
    expect(edit).toMatchObject({
      ownerUserId,
      projectId,
      eventType: "storyboard.edited",
    });
    expect((edit.metadata as { operation: string }).operation).toBe("add");
  });

  it("blocks deleting the final scene", async () => {
    await service.deleteScene({
      ownerUserId,
      projectId,
      sceneId: sceneB,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-0000-7000-8000-000000000010",
    });
    await expect(
      service.deleteScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: { expectedRevision: 1 },
        correlationId: "019ffbf1-0000-7000-8000-000000000011",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a reorder that omits a scene", async () => {
    await expect(
      service.reorderScenes({
        ownerUserId,
        projectId,
        body: { expectedRevision: 0, sceneIds: [sceneA] },
        correlationId: "019ffbf1-0000-7000-8000-000000000012",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects duplicate on stale revision", async () => {
    await expect(
      service.duplicateScene({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: { expectedRevision: 99 },
        correlationId: "019ffbf1-0000-7000-8000-000000000013",
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});