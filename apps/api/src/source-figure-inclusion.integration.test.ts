import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  extractedFigures,
  figureInclusionOverlays,
  migrateDatabase,
  parsedDocuments,
  parsedSections,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceFigureInvalidations,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import { PostgresFigureInclusionService } from "./source-figure-inclusion.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000002";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000002";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000002";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000002";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000002";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000002";
const sectionOneId: Identifier = "019ffbf1-1111-7000-8000-000000000002";
const figureOneId: Identifier = "019ffbf1-2222-7000-8000-000000000002";
const figureTwoId: Identifier = "019ffbf1-3333-7000-8000-000000000002";
const correlationId: Identifier = "019ffbf1-4444-7000-8000-000000000002";

describeWithPostgres("PostgresFigureInclusionService", () => {
  let database: TestDatabase | undefined;
  let service: PostgresFigureInclusionService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(sourceFigureInvalidations);
    await database!.client.delete(figureInclusionOverlays);
    await database!.client.delete(extractedFigures);
    await database!.client.delete(parsedSections);
    await database!.client.delete(parsedDocuments);
    await database!.client.delete(sourceDocumentIngestionArtifacts);
    await database!.client.delete(sourceDocuments);

    const timestamp = new Date("2026-08-14T10:00:00.000Z");
    await database!.client.insert(sourceDocuments).values({
      id: sourceDocumentId,
      ownerUserId,
      projectId,
      originalName: "water-cycle.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1_000,
      sha256: "b".repeat(64),
      storageKey: "users/tenant/water-cycle-3.pdf",
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
      canonicalStorageKey: "users/tenant/canonical-3.json",
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
      normalizedStorageKey: "users/tenant/normalized-3.json",
      title: "The Water Cycle",
      language: "en",
      pageCount: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(parsedSections).values({
      id: sectionOneId,
      parsedDocumentId,
      order: 1,
      level: 1,
      heading: "Introduction",
      pageStart: 1,
      pageEnd: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(extractedFigures).values([
      {
        id: figureOneId,
        parsedDocumentId,
        sectionId: sectionOneId,
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        contentType: "image/png",
        storageKey: "users/tenant/figure-1.png",
        thumbnailStorageKey: "users/tenant/figure-1-thumb.png",
        width: 800,
        height: 600,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: figureTwoId,
        parsedDocumentId,
        sectionId: sectionOneId,
        order: 2,
        pageStart: 1,
        pageEnd: 1,
        contentType: "image/jpeg",
        storageKey: "users/tenant/figure-2.jpg",
        width: 400,
        height: 300,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    service = new PostgresFigureInclusionService(
      database!.client,
      () => new Date("2026-08-14T11:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("persists an exclusion overlay without mutating the immutable figure", async () => {
    const updated = await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    expect(updated).toMatchObject({
      id: figureOneId,
      included: false,
      revision: 1,
      contentType: "image/png",
    });
    const [stored] = await database!.client
      .select()
      .from(extractedFigures)
      .where(eq(extractedFigures.id, figureOneId));
    expect(stored?.storageKey).toBe("users/tenant/figure-1.png");
    expect(stored?.width).toBe(800);
    const [overlay] = await database!.client
      .select()
      .from(figureInclusionOverlays)
      .where(eq(figureInclusionOverlays.figureId, figureOneId));
    expect(overlay?.included).toBe(false);
    expect(overlay?.revision).toBe(1);
  });

  it("does not expose private figure URLs through the inclusion response", async () => {
    const updated = await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    expect(updated).not.toHaveProperty("previewUrl");
    expect(updated).not.toHaveProperty("thumbnailUrl");
    expect(updated).not.toHaveProperty("storageKey");
  });

  it("re-includes a figure and bumps the overlay revision", async () => {
    await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    const restored = await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 1, included: true },
      correlationId,
    });
    expect(restored).toMatchObject({ included: true, revision: 2 });
  });

  it("rejects a stale revision with a conflict", async () => {
    await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    await expect(
      service.update({
        ownerUserId,
        projectId,
        figureId: figureOneId,
        body: { revision: 0, included: true },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("does not expose or modify another owner's figure", async () => {
    await expect(
      service.update({
        ownerUserId: otherOwnerUserId,
        projectId,
        figureId: figureOneId,
        body: { revision: 0, included: false },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    const overlays = await database!.client
      .select()
      .from(figureInclusionOverlays);
    expect(overlays).toHaveLength(0);
  });

  it("records an idempotent source-figure invalidation per revision", async () => {
    await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    const [invalidation] = await database!.client
      .select()
      .from(sourceFigureInvalidations)
      .where(eq(sourceFigureInvalidations.figureId, figureOneId));
    expect(invalidation?.figureRevision).toBe(1);
    expect(invalidation?.scope).toBe("unapproved_drafts");
    await service.update({
      ownerUserId,
      projectId,
      figureId: figureOneId,
      body: { revision: 1, included: false },
      correlationId,
    });
    const rows = await database!.client
      .select()
      .from(sourceFigureInvalidations)
      .where(eq(sourceFigureInvalidations.figureId, figureOneId));
    expect(rows).toHaveLength(2);
  });

  it("leaves another project's figure untouched by an update", async () => {
    await expect(
      service.update({
        ownerUserId,
        projectId: "019ffbf1-cccc-7000-8000-000000000003",
        figureId: figureOneId,
        body: { revision: 0, included: false },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});
