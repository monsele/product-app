import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  learningObjectives,
  learningObjectiveSets,
  migrateDatabase,
  modelCalls,
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
import { PostgresObjectivesService } from "./objectives.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000005";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000005";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000005";
const otherProjectId: Identifier = "019ffbf1-cccc-7000-8000-000000000006";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000005";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000005";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000005";
const snapshotId: Identifier = "019ffbf1-1111-7000-8000-000000000005";
const modelCallId: Identifier = "019ffbf1-2222-7000-8000-000000000005";
const contentHash = "b".repeat(64);

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

describeWithPostgres("PostgresObjectivesService editor (Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresObjectivesService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
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
    service = new PostgresObjectivesService(
      database!.client,
      async () => approvalStatus,
      () => new Date("2026-08-17T10:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("reorders objectives without violating the (set_id, order) unique index", async () => {
    const objectiveA: Identifier = "019ffbf1-3333-7000-8000-000000000005";
    const objectiveB: Identifier = "019ffbf1-4444-7000-8000-000000000005";
    await seedDraft(
      database!.client,
      ownerUserId,
      projectId,
      [objectiveA, objectiveB],
    );
    const result = await service.reorder({
      ownerUserId,
      projectId,
      body: {
        objectiveIds: [objectiveB, objectiveA],
        expectedRevision: 0,
      },
      correlationId: "019ffbf1-5555-7000-8000-000000000005",
    });
    expect(result.set?.objectives.map((o) => o.id)).toEqual([
      objectiveB,
      objectiveA,
    ]);
    const rows = await database!.client
      .select({ id: learningObjectives.id, order: learningObjectives.order })
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.ownerUserId, ownerUserId),
          eq(learningObjectives.projectId, projectId),
        ),
      )
      .orderBy(learningObjectives.order);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: objectiveB, order: 1 });
    expect(rows[1]).toMatchObject({ id: objectiveA, order: 2 });
  });

  it("approves the draft and supersedes other sets", async () => {
    const objectiveA: Identifier = "019ffbf1-3333-7000-8000-000000000005";
    await seedDraft(database!.client, ownerUserId, projectId, [objectiveA]);
    const result = await service.approve({
      ownerUserId,
      projectId,
      body: { expectedRevision: 0 },
      correlationId: "019ffbf1-5555-7000-8000-000000000005",
    });
    expect(result.state).toBe("approved");
    const [setRow] = await database!.client
      .select({ status: learningObjectiveSets.status })
      .from(learningObjectiveSets)
      .where(
        and(
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
          eq(learningObjectiveSets.id, "019ffbf1-6666-7000-8000-000000000005"),
        ),
      );
    expect(setRow?.status).toBe("approved");
  });

  it("rejects editing another tenant's objectives", async () => {
    const objectiveA: Identifier = "019ffbf1-3333-7000-8000-000000000005";
    await seedDraft(database!.client, ownerUserId, projectId, [objectiveA]);
    await expect(
      service.reorder({
        ownerUserId: otherOwnerUserId,
        projectId,
        body: {
          objectiveIds: [objectiveA],
          expectedRevision: 0,
        },
        correlationId: "019ffbf1-5555-7000-8000-000000000005",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
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
  await database.insert(projects).values([
    {
      id: projectId,
      ownerUserId,
      title: "Water cycle lesson",
      stage: "objectives_review",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: otherProjectId,
      ownerUserId: otherOwnerUserId,
      title: "Other teacher project",
      stage: "objectives_review",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(sourceDocuments).values({
    id: sourceDocumentId,
    ownerUserId,
    projectId,
    originalName: "water-cycle.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "b".repeat(64),
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
    correlationId: "019ffbf1-5555-7000-8000-000000000005",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function seedDraft(
  database: DatabaseClient,
  ownerUserId: Identifier,
  projectId: Identifier,
  objectiveIds: Identifier[],
): Promise<void> {
  const timestamp = new Date("2026-08-17T10:00:00.000Z");
  const setId: Identifier = "019ffbf1-6666-7000-8000-000000000005";
  await database.insert(learningObjectiveSets).values({
    id: setId,
    ownerUserId,
    projectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: contentHash,
    configurationVersion: 1,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "draft",
    revision: 0,
    idempotencyKey: `objectives:seed:${projectId}:1`,
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(learningObjectives).values(
    objectiveIds.map((id, index) => ({
      id,
      ownerUserId,
      projectId,
      setId,
      order: index + 1,
      statement: `Objective ${index + 1}.`,
      verb: "describe",
      confidence: 0.95,
      sourceRefs: [],
      generated: true,
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
}
