import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  contentBlockCorrections,
  contentBlocks,
  migrateDatabase,
  parsedDocuments,
  parsedSections,
  sourceContentInvalidations,
  sourceDocuments,
  sourceDocumentIngestionArtifacts,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import { PostgresContentBlockCorrectionService } from "./content-block-corrections.js";
import type { ReviewContentBlock } from "@avlp/schemas";

function expectParagraph(
  block: ReviewContentBlock,
): ReviewContentBlock & { kind: "paragraph" } {
  expect(block.kind).toBe("paragraph");
  return block as ReviewContentBlock & { kind: "paragraph" };
}

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000002";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000002";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000002";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000002";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000002";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000002";
const sectionOneId: Identifier = "019ffbf1-1111-7000-8000-000000000002";
const blockOneId: Identifier = "019ffbf1-2222-7000-8000-000000000002";
const blockTwoId: Identifier = "019ffbf1-3333-7000-8000-000000000002";
const correlationId: Identifier = "019ffbf1-4444-7000-8000-000000000002";

describeWithPostgres("PostgresContentBlockCorrectionService", () => {
  let database: TestDatabase | undefined;
  let service: PostgresContentBlockCorrectionService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(contentBlockCorrections);
    await database!.client.delete(sourceContentInvalidations);
    await database!.client.delete(contentBlocks);
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
      storageKey: "users/tenant/water-cycle-2.pdf",
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
      canonicalStorageKey: "users/tenant/canonical-2.json",
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
      normalizedStorageKey: "users/tenant/normalized-2.json",
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
    await database!.client.insert(contentBlocks).values([
      {
        id: blockOneId,
        parsedDocumentId,
        sectionId: sectionOneId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        content: { text: "Water moves through the environment in a cycle." },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: blockTwoId,
        parsedDocumentId,
        sectionId: sectionOneId,
        kind: "list",
        order: 2,
        pageStart: 1,
        pageEnd: 1,
        content: { items: ["evaporation", "condensation"] },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    service = new PostgresContentBlockCorrectionService(
      database!.client,
      () => new Date("2026-08-14T11:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("persists a correction overlay without mutating the immutable block", async () => {
    const updated = await service.update({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: {
        kind: "paragraph",
        revision: 0,
        correctedText: "Corrected text.",
      },
      correlationId,
    });
    const paragraph = expectParagraph(updated);
    expect(paragraph.correction).toMatchObject({
      revision: 1,
      correctedText: "Corrected text.",
    });
    const [stored] = await database!.client
      .select({ text: contentBlocks.content })
      .from(contentBlocks)
      .where(eq(contentBlocks.id, blockOneId));
    expect(stored?.text).toMatchObject({
      text: "Water moves through the environment in a cycle.",
    });
    const [overlay] = await database!.client
      .select()
      .from(contentBlockCorrections)
      .where(eq(contentBlockCorrections.blockId, blockOneId));
    expect(overlay?.revision).toBe(1);
    expect(overlay?.correctedText).toBe("Corrected text.");
  });

  it("updates an existing correction with optimistic concurrency", async () => {
    await service.update({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: { kind: "paragraph", revision: 0, correctedText: "First." },
      correlationId,
    });
    const updated = await service.update({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: { kind: "paragraph", revision: 1, correctedText: "Second." },
      correlationId,
    });
    const paragraph = expectParagraph(updated);
    expect(paragraph.correction).toMatchObject({
      revision: 2,
      correctedText: "Second.",
    });
  });

  it("restores the original content and removes the overlay", async () => {
    await service.update({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: { kind: "paragraph", revision: 0, correctedText: "Corrected." },
      correlationId,
    });
    const restored = await service.restore({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: { revision: 1 },
      correlationId,
    });
    expect(restored).toMatchObject({
      text: "Water moves through the environment in a cycle.",
    });
    expect(restored).not.toHaveProperty("correction");
    const [overlay] = await database!.client
      .select()
      .from(contentBlockCorrections)
      .where(eq(contentBlockCorrections.blockId, blockOneId));
    expect(overlay).toBeUndefined();
  });

  it("rejects a stale revision with a conflict", async () => {
    await service.update({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: { kind: "paragraph", revision: 0, correctedText: "First." },
      correlationId,
    });
    await expect(
      service.update({
        ownerUserId,
        projectId,
        blockId: blockOneId,
        body: { kind: "paragraph", revision: 0, correctedText: "Second." },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });

  it("rejects corrected content that does not match the block kind", async () => {
    await expect(
      service.update({
        ownerUserId,
        projectId,
        blockId: blockTwoId,
        body: { kind: "paragraph", revision: 0, correctedText: "Wrong kind." },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("records an idempotent dependency invalidation per block revision", async () => {
    await service.update({
      ownerUserId,
      projectId,
      blockId: blockOneId,
      body: { kind: "paragraph", revision: 0, correctedText: "Corrected." },
      correlationId,
    });
    const [invalidation] = await database!.client
      .select()
      .from(sourceContentInvalidations)
      .where(eq(sourceContentInvalidations.blockId, blockOneId));
    expect(invalidation?.blockRevision).toBe(1);
    expect(invalidation?.scope).toBe("unapproved_drafts");
  });

  it("does not expose or modify another owner's correction", async () => {
    await expect(
      service.update({
        ownerUserId: otherOwnerUserId,
        projectId,
        blockId: blockOneId,
        body: { kind: "paragraph", revision: 0, correctedText: "X" },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    await expect(
      service.restore({
        ownerUserId: otherOwnerUserId,
        projectId,
        blockId: blockOneId,
        body: { revision: 0 },
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});
