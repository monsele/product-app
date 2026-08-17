import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  migrateDatabase,
  modelCalls,
  outboxEvents,
  outlineObjectiveLinks,
  parsedDocuments,
  projects,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { and, eq } from "drizzle-orm";
import type { SourceApprovalStatus } from "@avlp/schemas";
import { PostgresOutlineService } from "./outline.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000006";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000006";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000006";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000006";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000006";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000006";
const snapshotId: Identifier = "019ffbf1-1111-7000-8000-000000000006";
const objectiveSetId: Identifier = "019ffbf1-2222-7000-8000-000000000006";
const objectiveId: Identifier = "019ffbf1-3333-7000-8000-000000000006";
const modelCallId: Identifier = "019ffbf1-4444-7000-8000-000000000006";
const contentHash = "c".repeat(64);

const approvalStatus: SourceApprovalStatus = {
  approved: true,
  parsedDocumentVersion: 1,
  snapshotId,
  snapshotVersion: 1,
  contentHash,
  approvedAt: "2026-08-17T10:00:00.000Z",
  stale: false,
};

const snapshotPayload = {
  schemaVersion: "1.0",
  id: snapshotId,
  projectId,
  sourceDocumentId,
  parsedDocumentId,
  parsedDocumentVersion: 1,
  contentHash,
  approvedBy: ownerUserId,
  approvedAt: "2026-08-17T10:00:00.000Z",
  sections: [],
  blocks: [],
  figures: [],
  tables: [],
};

describeWithPostgres("PostgresOutlineService (Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresOutlineService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(outlineObjectiveLinks);
    await database!.client.delete(lessonOutlineItems);
    await database!.client.delete(lessonOutlineSets);
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
    await database!.client.delete(lessonConfigurations);
    await database!.client.delete(learningObjectives);
    await database!.client.delete(learningObjectiveSets);
    await database!.client.delete(modelCalls);
    await database!.client.delete(sourceSnapshots);
    await database!.client.delete(parsedDocuments);
    await database!.client.delete(sourceDocumentIngestionArtifacts);
    await database!.client.delete(sourceDocuments);
    await database!.client.delete(projects);
    await database!.client.delete(users);
    await seed(database!.client);
    service = new PostgresOutlineService(
      database!.client,
      async () => approvalStatus,
      () => new Date("2026-08-17T10:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("queues an outline generation job with an outbox event and is idempotent", async () => {
    const first = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "outline-generate-1",
      correlationId: "019ffbf1-5555-7000-8000-000000000006",
    });
    expect(first.status).toBe("queued");
    const second = await service.generate({
      ownerUserId,
      projectId,
      idempotencyKey: "outline-generate-1",
      correlationId: "019ffbf1-5555-7000-8000-000000000006",
    });
    expect(second.jobId).toBe(first.jobId);
    const jobRows = await database!.client
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerUserId, ownerUserId),
          eq(jobs.projectId, projectId),
          eq(jobs.jobType, "outline.generate"),
        ),
      );
    expect(jobRows).toHaveLength(1);
    expect(jobRows[0]).toMatchObject({
      jobType: "outline.generate",
      queueName: "pipeline",
    });
    const outboxRows = await database!.client
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.jobId, first.jobId));
    expect(outboxRows).toHaveLength(1);
  });

  it("rejects generation for another tenant", async () => {
    await expect(
      service.generate({
        ownerUserId: otherOwnerUserId,
        projectId,
        idempotencyKey: "outline-generate-other",
        correlationId: "019ffbf1-5555-7000-8000-000000000006",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("assembles a draft outline set with items and objective links", async () => {
    const outlineSetId: Identifier = "019ffbf1-6666-7000-8000-000000000006";
    const itemId: Identifier = "019ffbf1-7777-7000-8000-000000000006";
    await seedDraftOutline(database!.client, outlineSetId, itemId);
    const result = await service.current({ ownerUserId, projectId });
    expect(result.state).toBe("draft");
    expect(result.set?.id).toBe(outlineSetId);
    expect(result.set?.items).toHaveLength(2);
    expect(result.set?.items[0]).toMatchObject({
      kind: "hook",
      objectiveIds: [objectiveId],
      framingNote: "Generated framing question.",
    });
    expect(result.set?.items[1]).toMatchObject({
      kind: "concept",
      objectiveIds: [objectiveId],
    });
    expect(result.set?.totalEstimatedSeconds).toBe(180);
    expect(result.canApprove).toBe(true);
  });

  it("does not leak another tenant's outline state", async () => {
    const outlineSetId: Identifier = "019ffbf1-6666-7000-8000-000000000006";
    const itemId: Identifier = "019ffbf1-7777-7000-8000-000000000006";
    await seedDraftOutline(database!.client, outlineSetId, itemId);
    const result = await service.current({
      ownerUserId: otherOwnerUserId,
      projectId,
    });
    expect(result.state).toBe("idle");
    expect(result.set).toBeNull();
    expect(result.canGenerate).toBe(false);
  });
});

async function seed(database: DatabaseClient): Promise<void> {
  const timestamp = new Date("2026-08-17T09:00:00.000Z");
  await database.insert(users).values([
    {
      id: ownerUserId,
      emailNormalized: "owner@example.test",
      displayName: "Owner",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: otherOwnerUserId,
      emailNormalized: "other@example.test",
      displayName: "Other",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(projects).values({
    id: projectId,
    ownerUserId,
    title: "Water cycle lesson",
    stage: "outline_review",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(sourceDocuments).values({
    id: sourceDocumentId,
    ownerUserId,
    projectId,
    originalName: "water-cycle.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "c".repeat(64),
    storageKey: "users/tenant/water-cycle.pdf",
    pageCount: 1,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(sourceDocumentIngestionArtifacts).values({
    id: artifactId,
    ownerUserId,
    projectId,
    sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: "users/tenant/canonical.json",
    state: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(parsedDocuments).values({
    id: parsedDocumentId,
    ownerUserId,
    projectId,
    ingestionArtifactId: artifactId,
    sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    adapterVersion: "1.0",
    normalizedStorageKey: "users/tenant/normalized.json",
    title: "The Water Cycle",
    language: "en",
    pageCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(sourceSnapshots).values({
    id: snapshotId,
    ownerUserId,
    projectId,
    parsedDocumentId,
    parsedDocumentVersion: 1,
    snapshotVersion: 1,
    schemaVersion: "1.0",
    contentHash,
    approvedBy: ownerUserId,
    approvedAt: new Date("2026-08-17T10:00:00.000Z"),
    payload: snapshotPayload,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(modelCalls).values({
    id: modelCallId,
    ownerUserId,
    projectId,
    operationType: "ai.objectives",
    idempotencyKey: "modelcall:objectives:key-1",
    promptId: "objectives",
    promptVersion: "v2",
    provider: "mock",
    model: "mock-model-1",
    inputVersion: "objectives:input-1",
    inputHash: "d".repeat(64),
    inputUnits: 100,
    outputUnits: 100,
    estimatedCostUsd: "0.001",
    latencyMs: 100,
    validationStatus: "valid",
    status: "succeeded",
    correlationId: "019ffbf1-5555-7000-8000-000000000006",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(learningObjectiveSets).values({
    id: objectiveSetId,
    ownerUserId,
    projectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    configurationVersion: 1,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "approved",
    revision: 0,
    idempotencyKey: "objectives:seed:1",
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(learningObjectives).values({
    id: objectiveId,
    ownerUserId,
    projectId,
    setId: objectiveSetId,
    order: 1,
    statement: "Describe how evaporation forms water vapour.",
    verb: "describe",
    confidence: 0.95,
    sourceRefs: [],
    generated: true,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(lessonConfigurations).values({
    id: "019ffbf1-8888-7000-8000-000000000006",
    ownerUserId,
    projectId,
    version: 1,
    ageBand: "11-13",
    difficulty: "introductory",
    subject: "Science",
    lessonTitle: "The water cycle",
    targetDurationSeconds: 180,
    tone: "friendly",
    visualTheme: "mvp-default",
    includeRecallQuestions: true,
    sourceParsedDocumentVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function seedDraftOutline(
  database: DatabaseClient,
  outlineSetId: Identifier,
  itemId: Identifier,
): Promise<void> {
  const timestamp = new Date("2026-08-17T10:00:00.000Z");
  const itemB: Identifier = "019ffbf1-9999-7000-8000-000000000006";
  await database.insert(lessonOutlineSets).values({
    id: outlineSetId,
    ownerUserId,
    projectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    objectiveSetId,
    objectiveSetContentHash: "e".repeat(64),
    configurationVersion: 1,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "draft",
    revision: 0,
    idempotencyKey: "outline:seed:1",
    totalEstimatedSeconds: 180,
    generatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(lessonOutlineItems).values([
    {
      id: itemId,
      ownerUserId,
      projectId,
      setId: outlineSetId,
      order: 1,
      kind: "hook",
      title: "Where does the water go?",
      description: "Open with a question.",
      estimatedSeconds: 20,
      sourceRefs: [],
      framingNote: "Generated framing question.",
      generated: true,
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: itemB,
      ownerUserId,
      projectId,
      setId: outlineSetId,
      order: 2,
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 40,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(outlineObjectiveLinks).values([
    {
      id: "019ffbf1-aaaa-7000-8000-000000000006",
      ownerUserId,
      projectId,
      outlineItemId: itemId,
      objectiveId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "019ffbf1-bbbb-7000-8000-000000000006",
      ownerUserId,
      projectId,
      outlineItemId: itemB,
      objectiveId,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
}
