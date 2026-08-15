import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  migrateDatabase,
  parsedDocuments,
  parsedSections,
  sourceDocuments,
  sourceDocumentIngestionArtifacts,
  sourceSectionOverlays,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import { PostgresSourceSectionSelectionService } from "./source-section-selection.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000001";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000001";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000001";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000001";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000001";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000001";
const sectionOneId: Identifier = "019ffbf1-1111-7000-8000-000000000001";
const sectionTwoId: Identifier = "019ffbf1-2222-7000-8000-000000000001";
const correlationId: Identifier = "019ffbf1-3333-7000-8000-000000000001";

describeWithPostgres("PostgresSourceSectionSelectionService", () => {
  let database: TestDatabase | undefined;
  let service: PostgresSourceSectionSelectionService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(sourceSectionOverlays);
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
      sha256: "a".repeat(64),
      storageKey: "users/tenant/water-cycle.pdf",
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
      canonicalStorageKey: "users/tenant/canonical.json",
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
      normalizedStorageKey: "users/tenant/normalized.json",
      title: "The Water Cycle",
      language: "en",
      pageCount: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await database!.client.insert(parsedSections).values([
      {
        id: sectionOneId,
        parsedDocumentId,
        order: 1,
        level: 1,
        heading: "Introduction",
        pageStart: 1,
        pageEnd: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: sectionTwoId,
        parsedDocumentId,
        order: 2,
        level: 1,
        heading: "Evaporation",
        pageStart: 2,
        pageEnd: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    service = new PostgresSourceSectionSelectionService(
      database!.client,
      () => new Date("2026-08-14T11:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("lists sections as included with original headings before any overlay", async () => {
    const response = await service.list(ownerUserId, projectId);
    expect(response.documentId).toBe(parsedDocumentId);
    expect(response.sections).toHaveLength(2);
    expect(response.sections.map((section) => section.included)).toEqual([
      true,
      true,
    ]);
    expect(response.sections[0]).toMatchObject({
      heading: "Introduction",
      displayHeading: null,
      revision: 0,
    });
  });

  it("renames a section and projects the override without mutating the original", async () => {
    const updated = await service.update({
      ownerUserId,
      projectId,
      sectionId: sectionOneId,
      body: { revision: 0, displayHeading: "Opening" },
      correlationId,
    });
    expect(updated).toMatchObject({
      id: sectionOneId,
      heading: "Introduction",
      displayHeading: "Opening",
      included: true,
      revision: 1,
    });

    const listed = await service.list(ownerUserId, projectId);
    expect(listed.sections[0]).toMatchObject({
      heading: "Introduction",
      displayHeading: "Opening",
    });
    const [stored] = await database!.client
      .select({ heading: parsedSections.heading })
      .from(parsedSections)
      .where(eq(parsedSections.id, sectionOneId));
    expect(stored?.heading).toBe("Introduction");
  });

  it("rejects a state with zero included sections", async () => {
    await service.update({
      ownerUserId,
      projectId,
      sectionId: sectionOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    await expect(
      service.update({
        ownerUserId,
        projectId,
        sectionId: sectionTwoId,
        body: { revision: 0, included: false },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects a stale overlay revision with a conflict", async () => {
    await service.update({
      ownerUserId,
      projectId,
      sectionId: sectionOneId,
      body: { revision: 0, included: false },
      correlationId,
    });
    await expect(
      service.update({
        ownerUserId,
        projectId,
        sectionId: sectionOneId,
        body: { revision: 0, included: true },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("restores original heading and included status", async () => {
    await service.update({
      ownerUserId,
      projectId,
      sectionId: sectionOneId,
      body: { revision: 0, included: false, displayHeading: "Renamed" },
      correlationId,
    });
    const restored = await service.update({
      ownerUserId,
      projectId,
      sectionId: sectionOneId,
      body: { revision: 1, included: true, displayHeading: null, reviewOrder: null },
      correlationId,
    });
    expect(restored).toMatchObject({
      heading: "Introduction",
      displayHeading: null,
      included: true,
      revision: 2,
    });
  });

  it("does not expose or modify another owner's selection", async () => {
    await expect(
      service.list(otherOwnerUserId, projectId),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    await expect(
      service.update({
        ownerUserId: otherOwnerUserId,
        projectId,
        sectionId: sectionOneId,
        body: { revision: 0, included: false },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});
