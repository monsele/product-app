import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  contentBlockCorrections,
  contentBlocks,
  extractedFigures,
  figureInclusionOverlays,
  migrateDatabase,
  parsedDocuments,
  parsedSections,
  sourceDocuments,
  sourceDocumentIngestionArtifacts,
  sourceSectionOverlays,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { and, eq } from "drizzle-orm";
import { buildSourcePackage } from "@avlp/schemas";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";

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
const blockOneId: Identifier = "019ffbf1-3333-7000-8000-000000000001";
const blockTwoId: Identifier = "019ffbf1-4444-7000-8000-000000000001";
const figureOneId: Identifier = "019ffbf1-5555-7000-8000-000000000001";
const correlationId: Identifier = "019ffbf1-6666-7000-8000-000000000001";

describeWithPostgres("PostgresSourceSnapshotService", () => {
  let database: TestDatabase | undefined;
  let service: PostgresSourceSnapshotService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(sourceSnapshots);
    await database!.client.delete(figureInclusionOverlays);
    await database!.client.delete(contentBlockCorrections);
    await database!.client.delete(sourceSectionOverlays);
    await database!.client.delete(contentBlocks);
    await database!.client.delete(extractedFigures);
    await database!.client.delete(parsedSections);
    await database!.client.delete(parsedDocuments);
    await database!.client.delete(sourceDocumentIngestionArtifacts);
    await database!.client.delete(sourceDocuments);
    await database!.client.delete(users);
    await seedDocument(database!.client);
    service = new PostgresSourceSnapshotService(
      database!.client,
      () => new Date("2026-08-16T10:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("approves and captures the effective reviewed source", async () => {
    const response = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    expect(response.snapshot.snapshotVersion).toBe(1);
    expect(response.snapshot.parsedDocumentVersion).toBe(1);
    expect(response.snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(response.snapshot.sectionCount).toBe(2);
    expect(response.snapshot.blockCount).toBe(2);

    const [row] = await database!.client
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      );
    expect(row).toBeDefined();
    expect(row!.contentHash).toBe(response.snapshot.contentHash);
    expect(row!.parsedDocumentVersion).toBe(1);
  });

  it("re-approving unchanged content returns the same snapshot idempotently", async () => {
    const first = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    const second = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    expect(second.snapshot.id).toBe(first.snapshot.id);
    expect(second.snapshot.snapshotVersion).toBe(1);
    const rows = await database!.client
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it("creates a new snapshot version when a correction is made after approval", async () => {
    const first = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    const snapshot = await parseStored(
      database!.client,
      ownerUserId,
      projectId,
      first.snapshot.id,
    );
    const storedBefore = snapshot;

    await database!.client.insert(contentBlockCorrections).values({
      id: "019ffbf1-7777-7000-8000-000000000001",
      projectId,
      ownerUserId,
      parsedDocumentId,
      sectionId: sectionOneId,
      blockId: blockOneId,
      kind: "paragraph",
      correctedText: "Corrected after approval.",
      revision: 1,
      createdAt: new Date("2026-08-16T10:05:00.000Z"),
      updatedAt: new Date("2026-08-16T10:05:00.000Z"),
    });

    const second = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    expect(second.snapshot.snapshotVersion).toBe(2);
    expect(second.snapshot.id).not.toBe(first.snapshot.id);

    const storedAfter = await parseStored(
      database!.client,
      ownerUserId,
      projectId,
      first.snapshot.id,
    );
    expect(JSON.stringify(storedAfter)).toBe(JSON.stringify(storedBefore));
  });

  it("keeps the approved snapshot immutable when overlays change afterwards", async () => {
    const approved = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    const storedBefore = await parseStored(
      database!.client,
      ownerUserId,
      projectId,
      approved.snapshot.id,
    );

    await database!.client.insert(sourceSectionOverlays).values({
      id: "019ffbf1-8888-7000-8000-000000000001",
      projectId,
      ownerUserId,
      parsedDocumentId,
      sectionId: sectionTwoId,
      included: false,
      revision: 1,
      createdAt: new Date("2026-08-16T10:05:00.000Z"),
      updatedAt: new Date("2026-08-16T10:05:00.000Z"),
    });

    const storedAfter = await parseStored(
      database!.client,
      ownerUserId,
      projectId,
      approved.snapshot.id,
    );
    expect(JSON.stringify(storedAfter)).toBe(JSON.stringify(storedBefore));
    expect(approved.snapshot.sectionCount).toBe(2);
  });

  it("reports stale status after overlay changes and fresh status otherwise", async () => {
    const fresh = await service.status({ ownerUserId, projectId });
    expect(fresh.approved).toBe(false);

    await service.approve({ ownerUserId, projectId, correlationId });
    const approved = await service.status({ ownerUserId, projectId });
    expect(approved.approved).toBe(true);
    expect(approved.stale).toBe(false);

    await database!.client.insert(figureInclusionOverlays).values({
      id: "019ffbf1-9999-7000-8000-000000000001",
      projectId,
      ownerUserId,
      parsedDocumentId,
      figureId: figureOneId,
      included: false,
      revision: 1,
      createdAt: new Date("2026-08-16T10:05:00.000Z"),
      updatedAt: new Date("2026-08-16T10:05:00.000Z"),
    });
    const stale = await service.status({ ownerUserId, projectId });
    expect(stale.approved).toBe(true);
    expect(stale.stale).toBe(true);
  });

  it("resolves source blocks for citation lookup", async () => {
    const approved = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    const entries = await service.lookupBlocks({
      ownerUserId,
      projectId,
      snapshotId: approved.snapshot.id,
      blockIds: [blockOneId, blockTwoId],
    });
    expect(entries.map((entry) => entry.blockId).sort()).toEqual(
      [blockOneId, blockTwoId].sort(),
    );
    const paragraph = entries.find((entry) => entry.blockId === blockOneId);
    expect(paragraph).toMatchObject({
      page: 1,
      kind: "paragraph",
      text: "Water evaporates when heated.",
    });
  });

  it("builds a deterministic source package from the approved snapshot", async () => {
    const approved = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    const metadata = await service.metadata({
      ownerUserId,
      projectId,
      snapshotId: approved.snapshot.id,
    });
    expect(metadata.snapshotVersion).toBe(1);

    const rows = await database!.client
      .select({ payload: sourceSnapshots.payload })
      .from(sourceSnapshots)
      .where(eq(sourceSnapshots.id, approved.snapshot.id));
    const snapshot = rows[0]!.payload as Parameters<
      typeof buildSourcePackage
    >[0];
    const first = buildSourcePackage(snapshot);
    const second = buildSourcePackage(snapshot);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.sourceSnapshotId).toBe(approved.snapshot.id);
  });

  it("does not expose another tenant's snapshots", async () => {
    const approved = await service.approve({
      ownerUserId,
      projectId,
      correlationId,
    });
    await expect(
      service.metadata({
        ownerUserId: otherOwnerUserId,
        projectId,
        snapshotId: approved.snapshot.id,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.lookupBlocks({
        ownerUserId: otherOwnerUserId,
        projectId,
        snapshotId: approved.snapshot.id,
        blockIds: [blockOneId],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("requires at least one included section", async () => {
    await database!.client.insert(sourceSectionOverlays).values({
      id: "019ffbf1-1212-7000-8000-000000000001",
      projectId,
      ownerUserId,
      parsedDocumentId,
      sectionId: sectionOneId,
      included: false,
      revision: 1,
      createdAt: new Date("2026-08-16T10:05:00.000Z"),
      updatedAt: new Date("2026-08-16T10:05:00.000Z"),
    });
    await database!.client.insert(sourceSectionOverlays).values({
      id: "019ffbf1-1313-7000-8000-000000000001",
      projectId,
      ownerUserId,
      parsedDocumentId,
      sectionId: sectionTwoId,
      included: false,
      revision: 1,
      createdAt: new Date("2026-08-16T10:05:00.000Z"),
      updatedAt: new Date("2026-08-16T10:05:00.000Z"),
    });
    await expect(
      service.approve({ ownerUserId, projectId, correlationId }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

async function seedDocument(database: DatabaseClient): Promise<void> {
  const timestamp = new Date("2026-08-16T09:00:00.000Z");
  await database.insert(users).values({
    id: ownerUserId,
    emailNormalized: "owner@example.test",
    displayName: "Owner",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(users).values({
    id: otherOwnerUserId,
    emailNormalized: "other@example.test",
    displayName: "Other",
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
    sha256: "a".repeat(64),
    storageKey: "users/tenant/water-cycle.pdf",
    pageCount: 2,
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
    pageCount: 2,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(parsedSections).values([
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
      pageStart: 1,
      pageEnd: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(contentBlocks).values([
    {
      id: blockOneId,
      parsedDocumentId,
      sectionId: sectionOneId,
      kind: "paragraph",
      order: 1,
      pageStart: 1,
      pageEnd: 1,
      content: { text: "Water evaporates when heated." },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: blockTwoId,
      parsedDocumentId,
      sectionId: sectionTwoId,
      kind: "list",
      order: 1,
      pageStart: 1,
      pageEnd: 2,
      content: { items: ["Condensation", "Precipitation"] },
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]);
  await database.insert(extractedFigures).values({
    id: figureOneId,
    parsedDocumentId,
    sectionId: sectionOneId,
    order: 1,
    pageStart: 1,
    pageEnd: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

async function parseStored(
  database: DatabaseClient,
  ownerUserId: Identifier,
  projectId: Identifier,
  snapshotId: Identifier,
) {
  const [row] = await database
    .select({ payload: sourceSnapshots.payload })
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.id, snapshotId),
        eq(sourceSnapshots.ownerUserId, ownerUserId),
        eq(sourceSnapshots.projectId, projectId),
      ),
    );
  if (row === undefined) throw new Error("Snapshot not found.");
  return row.payload;
}
