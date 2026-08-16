import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  ingestionQualityReports,
  lessonConfigurations,
  migrateDatabase,
  parsedDocuments,
  projects,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import { PostgresLessonConfigurationService } from "./lesson-configuration.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000003";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000003";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000003";
const otherProjectId: Identifier = "019ffbf1-cccc-7000-8000-000000000004";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000003";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000003";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000003";
const correlationId: Identifier = "019ffbf1-4444-7000-8000-000000000003";

const validBody = {
  expectedVersion: 0,
  ageBand: "11-13",
  difficulty: "introductory",
  subject: "Biology",
  lessonTitle: "The Water Cycle",
  targetDurationSeconds: 300,
  tone: "friendly",
  includeRecallQuestions: true,
};

describeWithPostgres("PostgresLessonConfigurationService", () => {
  let database: TestDatabase | undefined;
  let service: PostgresLessonConfigurationService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(lessonConfigurations);
    await database!.client.delete(ingestionQualityReports);
    await database!.client.delete(parsedDocuments);
    await database!.client.delete(sourceDocumentIngestionArtifacts);
    await database!.client.delete(sourceDocuments);
    await database!.client.delete(projects);

    const timestamp = new Date("2026-08-14T10:00:00.000Z");
    await database!.client.insert(projects).values({
      id: projectId,
      ownerUserId,
      title: "Water cycle lesson",
      stage: "ingestion_review",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(projects).values({
      id: otherProjectId,
      ownerUserId: otherOwnerUserId,
      title: "Other teacher project",
      stage: "ingestion_review",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ownerUserId,
      projectId,
      originalName: "water-cycle.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1_000,
      sha256: "c".repeat(64),
      storageKey: "users/tenant/water-cycle-4.pdf",
      pageCount: 2,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(sourceDocumentIngestionArtifacts).values({
      id: artifactId,
      ownerUserId,
      projectId,
      sourceDocumentId,
      parserVersion: "docling-v1",
      normalizedSchemaVersion: "1.0",
      canonicalStorageKey: "users/tenant/canonical-4.json",
      state: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(parsedDocuments).values({
      id: parsedDocumentId,
      ownerUserId,
      projectId,
      ingestionArtifactId: artifactId,
      sourceDocumentId,
      version: 1,
      schemaVersion: "1.0",
      parserVersion: "docling-v1",
      adapterVersion: "1.0",
      normalizedStorageKey: "users/tenant/normalized-4.json",
      title: "The Water Cycle",
      language: "en",
      pageCount: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    service = new PostgresLessonConfigurationService(
      database!.client,
      () => new Date("2026-08-14T11:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  async function markSourceReady(status = "ready") {
    const timestamp = new Date("2026-08-14T11:00:00.000Z");
    await database!.client.insert(ingestionQualityReports).values({
      id: "019ffbf1-9999-7000-8000-000000000003",
      parsedDocumentId,
      score: status === "ready" ? 90 : 40,
      status,
      findings: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  it("returns an empty draft with source context before any save", async () => {
    await markSourceReady();
    const response = await service.get(ownerUserId, projectId);
    expect(response.configuration).toBeNull();
    expect(response.source).toEqual({
      parsedDocumentVersion: 1,
      sourceReviewComplete: true,
    });
    expect(response.narrationTarget).toBeNull();
    expect(response.canProceed).toBe(false);
  });

  it("persists a valid configuration and exposes the narration target", async () => {
    await markSourceReady();
    const response = await service.save({
      ownerUserId,
      projectId,
      body: validBody,
      correlationId,
    });
    expect(response.configuration).toMatchObject({
      version: 1,
      ageBand: "11-13",
      targetDurationSeconds: 300,
      visualTheme: "mvp-default",
      sourceParsedDocumentVersion: 1,
    });
    expect(response.narrationTarget).toEqual({
      min: expect.any(Number),
      target: expect.any(Number),
      max: expect.any(Number),
    });
    expect(response.canProceed).toBe(true);
    const [stored] = await database!.client
      .select()
      .from(lessonConfigurations)
      .where(eq(lessonConfigurations.projectId, projectId));
    expect(stored?.version).toBe(1);
    expect(stored?.sourceParsedDocumentVersion).toBe(1);
  });

  it("bumps the version on every save and returns it after refresh", async () => {
    await markSourceReady();
    const first = await service.save({
      ownerUserId,
      projectId,
      body: validBody,
      correlationId,
    });
    const second = await service.save({
      ownerUserId,
      projectId,
      body: { ...validBody, expectedVersion: 1, subject: "Chemistry" },
      correlationId,
    });
    expect(first.configuration?.version).toBe(1);
    expect(second.configuration?.version).toBe(2);
    expect(second.configuration?.subject).toBe("Chemistry");
    const refreshed = await service.get(ownerUserId, projectId);
    expect(refreshed.configuration).toMatchObject({ version: 2 });
    expect(refreshed.canProceed).toBe(true);
  });

  it("rejects a stale expected version with a conflict", async () => {
    await markSourceReady();
    await service.save({
      ownerUserId,
      projectId,
      body: validBody,
      correlationId,
    });
    await expect(
      service.save({
        ownerUserId,
        projectId,
        body: { ...validBody, expectedVersion: 0 },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a save when the source content is not confirmed", async () => {
    await markSourceReady("review_required");
    await expect(
      service.save({
        ownerUserId,
        projectId,
        body: validBody,
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("advances the project stage from ingestion_review to lesson_configuration", async () => {
    await markSourceReady();
    await service.save({
      ownerUserId,
      projectId,
      body: validBody,
      correlationId,
    });
    const [project] = await database!.client
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(project?.stage).toBe("lesson_configuration");
  });

  it("does not expose or modify another owner's configuration", async () => {
    await markSourceReady();
    await expect(
      service.save({
        ownerUserId: otherOwnerUserId,
        projectId: otherProjectId,
        body: validBody,
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    const rows = await database!.client.select().from(lessonConfigurations);
    expect(rows).toHaveLength(0);
  });

  it("rejects a malformed body as a validation failure", async () => {
    await markSourceReady();
    await expect(
      service.save({
        ownerUserId,
        projectId,
        body: { ...validBody, targetDurationSeconds: 240 },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });
});
