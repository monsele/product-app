/**
 * ST-117 (Postgres): table-cell correction overlays.
 *
 * A teacher corrects one cell of an immutable parsed table. The overlay keeps
 * the parser's text, the next approved snapshot carries the corrected cell,
 * and a restore brings the original back. Stale editors get a conflict, the
 * parser rows are never written, and another tenant can neither read nor
 * correct the table.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  auditEvents,
  migrateDatabase,
  parsedDocuments,
  parsedSections,
  parsedTableCells,
  parsedTables,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  sourceTableInvalidations,
  tableCellCorrections,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { and, eq } from "drizzle-orm";
import { ParsedDocumentRepository } from "./parsed-document-repository.js";
import { PostgresParsedDocumentReviewService } from "./parsed-document-review.js";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";
import { PostgresTableCellCorrectionService } from "./table-cell-corrections.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000217";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000217";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000217";
const otherProjectId: Identifier = "019ffbf1-cccd-7000-8000-000000000217";
const tableId: Identifier = "019ffbf1-4444-7000-8000-000000000217";
const mergedTableId: Identifier = "019ffbf1-4446-7000-8000-000000000217";
const foreignTableId: Identifier = "019ffbf1-4445-7000-8000-000000000217";
const correlationId: Identifier = "019ffbf1-5555-7000-8000-000000000217";
const now = new Date("2026-10-15T10:00:00.000Z");

const columns = ["Metal", "Density (g/cm³)"];
const rows = [
  ["Lithium", "0.53"],
  ["Sodium", "0.97"],
];

const keys = (suffix: string) => ({
  sourceDocumentId: `019ffbf1-dd${suffix}-7000-8000-000000000217`,
  artifactId: `019ffbf1-ee${suffix}-7000-8000-000000000217`,
  parsedDocumentId: `019ffbf1-ff${suffix}-7000-8000-000000000217`,
  sectionId: `019ffbf1-11${suffix}-7000-8000-000000000217`,
});
const own = keys("a1");

async function seedSource(
  client: DatabaseClient,
  input: { owner: Identifier; project: Identifier; suffix: string; tables: Identifier[] },
): Promise<void> {
  const ids = keys(input.suffix);
  await client.insert(sourceDocuments).values({
    id: ids.sourceDocumentId,
    ownerUserId: input.owner,
    projectId: input.project,
    originalName: "alkali-metals.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "e".repeat(64),
    storageKey: `users/${input.owner}/alkali.pdf`,
    pageCount: 2,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(sourceDocumentIngestionArtifacts).values({
    id: ids.artifactId,
    ownerUserId: input.owner,
    projectId: input.project,
    sourceDocumentId: ids.sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: `users/${input.owner}/canonical.json`,
    state: "ready",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedDocuments).values({
    id: ids.parsedDocumentId,
    ownerUserId: input.owner,
    projectId: input.project,
    ingestionArtifactId: ids.artifactId,
    sourceDocumentId: ids.sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    adapterVersion: "1.0",
    normalizedStorageKey: `users/${input.owner}/normalized.json`,
    title: "Alkali metals",
    language: "en",
    pageCount: 2,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedSections).values({
    id: ids.sectionId,
    parsedDocumentId: ids.parsedDocumentId,
    order: 1,
    level: 1,
    heading: "Group 1 metals",
    pageStart: 1,
    pageEnd: 2,
    createdAt: now,
    updatedAt: now,
  });
  for (const [index, id] of input.tables.entries()) {
    await client.insert(parsedTables).values({
      id,
      parsedDocumentId: ids.parsedDocumentId,
      sectionId: ids.sectionId,
      order: index + 1,
      pageStart: 2,
      pageEnd: 2,
      columns,
      rows,
      createdAt: now,
      updatedAt: now,
    });
    // The second table merges "Lithium" across both columns of row 0.
    const merged = id === mergedTableId;
    await client.insert(parsedTableCells).values(
      rows.flatMap((row, rowIndex) =>
        row.flatMap((text, columnIndex) =>
          merged && rowIndex === 0 && columnIndex === 1
            ? []
            : [
                {
                  id: `019ffbf1-${index}${rowIndex}${columnIndex}0-7000-8000-${input.suffix}0000000217`,
                  parsedTableId: id,
                  rowIndex,
                  columnIndex,
                  text,
                  rowSpan: 1,
                  columnSpan: merged && rowIndex === 0 ? 2 : 1,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
        ),
      ),
    );
  }
}

describeWithPostgres("PostgresTableCellCorrectionService (Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresTableCellCorrectionService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  }, 120_000);

  beforeEach(async () => {
    const client = database!.client;
    for (const table of [
      auditEvents,
      sourceTableInvalidations,
      tableCellCorrections,
      sourceSnapshots,
      parsedTableCells,
      parsedTables,
      parsedSections,
      parsedDocuments,
      sourceDocumentIngestionArtifacts,
      sourceDocuments,
      users,
    ])
      await client.delete(table);
    await client.insert(users).values([
      { id: ownerUserId, emailNormalized: "cells-owner@example.test", displayName: "Owner", createdAt: now, updatedAt: now },
      { id: otherOwnerUserId, emailNormalized: "cells-other@example.test", displayName: "Other", createdAt: now, updatedAt: now },
    ]);
    await seedSource(client, {
      owner: ownerUserId,
      project: projectId,
      suffix: "a1",
      tables: [tableId, mergedTableId],
    });
    await seedSource(client, {
      owner: otherOwnerUserId,
      project: otherProjectId,
      suffix: "b2",
      tables: [foreignTableId],
    });
    service = new PostgresTableCellCorrectionService(client, () => now);
  }, 60_000);

  afterAll(async () => {
    await database?.destroy();
  });

  const correct = (
    body: Record<string, unknown>,
    scope: { owner?: Identifier; project?: Identifier; table?: Identifier } = {},
  ) =>
    service.update({
      ownerUserId: scope.owner ?? ownerUserId,
      projectId: scope.project ?? projectId,
      tableId: scope.table ?? tableId,
      body,
      correlationId,
    });
  const restore = (body: Record<string, unknown>) =>
    service.restore({ ownerUserId, projectId, tableId, body, correlationId });
  const overlays = () =>
    database!.client
      .select()
      .from(tableCellCorrections)
      .where(eq(tableCellCorrections.tableId, tableId));

  it("stores a correction as an overlay with the original text, editor and revision", async () => {
    const table = await correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.534" });
    expect(table.rows).toEqual(rows);
    expect(table.cellCorrections).toEqual([
      { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
    ]);
    const [overlay] = await overlays();
    expect(overlay).toMatchObject({
      ownerUserId,
      projectId,
      parsedDocumentId: own.parsedDocumentId,
      sectionId: own.sectionId,
      rowIndex: 0,
      columnIndex: 1,
      originalText: "0.53",
      correctedText: "0.534",
      editedBy: ownerUserId,
      revision: 1,
      createdAt: now,
    });
    // The parser's table is never written.
    const [parsed] = await database!.client.select().from(parsedTables).where(eq(parsedTables.id, tableId));
    expect(parsed!.rows).toEqual(rows);

    const updated = await correct({ rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.535" });
    expect(updated.cellCorrections).toEqual([
      { rowIndex: 0, columnIndex: 1, revision: 2, correctedText: "0.535" },
    ]);
    expect((await overlays())[0]!.originalText).toBe("0.53");
  });

  it("records an invalidation per revision and audits without the cell text", async () => {
    await correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.534" });
    await restore({ rowIndex: 0, columnIndex: 1, revision: 1 });
    const invalidations = await database!.client
      .select()
      .from(sourceTableInvalidations)
      .where(eq(sourceTableInvalidations.projectId, projectId));
    expect(
      invalidations.map((row) => [row.tableId, row.rowIndex, row.columnIndex, row.cellRevision, row.scope]),
    ).toEqual(
      expect.arrayContaining([
        [tableId, 0, 1, 1, "unapproved_drafts"],
        [tableId, 0, 1, 2, "unapproved_drafts"],
      ]),
    );
    const events = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.projectId, projectId));
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "source.table_cell_corrected",
      "source.table_cell_restored",
    ]);
    for (const event of events) {
      expect(event.targetType).toBe("source_table");
      expect(event.targetId).toBe(tableId);
      const serialized = JSON.stringify(event.metadata);
      expect(serialized).not.toContain("0.534");
      expect(serialized).not.toContain("0.53\"");
    }
  });

  it("restores the original, keeps the overlay and keeps counting revisions (AC1)", async () => {
    await correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.534" });
    const restored = await restore({ rowIndex: 0, columnIndex: 1, revision: 1 });
    expect(restored.rows).toEqual(rows);
    expect(restored.cellCorrections).toEqual([
      { rowIndex: 0, columnIndex: 1, revision: 2, correctedText: null },
    ]);
    expect(await overlays()).toHaveLength(1);

    // Restoring again is a no-op at the current revision.
    const again = await restore({ rowIndex: 0, columnIndex: 1, revision: 2 });
    expect(again.cellCorrections![0]!.revision).toBe(2);

    // A new correction after a restore continues from the restored revision.
    const corrected = await correct({ rowIndex: 0, columnIndex: 1, revision: 2, correctedText: "0.534" });
    expect(corrected.cellCorrections![0]).toMatchObject({ revision: 3, correctedText: "0.534" });
  });

  it("treats restoring a never-corrected cell at revision 0 as a no-op", async () => {
    const table = await restore({ rowIndex: 1, columnIndex: 1, revision: 0 });
    expect(table.cellCorrections).toBeUndefined();
    expect(await overlays()).toHaveLength(0);
  });

  it("returns a conflict for a stale or unexpected revision (AC3)", async () => {
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "x" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.534" });
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "x" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(restore({ rowIndex: 0, columnIndex: 1, revision: 0 })).rejects.toMatchObject({
      statusCode: 409,
    });

    // A stale editor from before a restore cannot overwrite the new state.
    await restore({ rowIndex: 0, columnIndex: 1, revision: 1 });
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "stale" }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect((await overlays())[0]).toMatchObject({ revision: 2, correctedText: null });
  });

  it("lets only one of two concurrent first edits win (AC3)", async () => {
    const results = await Promise.allSettled([
      correct({ rowIndex: 1, columnIndex: 1, revision: 0, correctedText: "0.968" }),
      correct({ rowIndex: 1, columnIndex: 1, revision: 0, correctedText: "0.969" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { statusCode: 409 } });
    expect(await overlays()).toHaveLength(1);
  });

  it("lets only one of two concurrent edits at the same revision win (AC3)", async () => {
    await correct({ rowIndex: 1, columnIndex: 1, revision: 0, correctedText: "0.968" });
    const results = await Promise.allSettled([
      correct({ rowIndex: 1, columnIndex: 1, revision: 1, correctedText: "0.969" }),
      correct({ rowIndex: 1, columnIndex: 1, revision: 1, correctedText: "0.970" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await overlays())[0]!.revision).toBe(2);
  });

  it("refuses a position outside the table or inside a merged cell", async () => {
    for (const position of [
      { rowIndex: 2, columnIndex: 0 },
      { rowIndex: 0, columnIndex: 2 },
    ])
      await expect(
        correct({ ...position, revision: 0, correctedText: "x" }),
      ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "x" }, { table: mergedTableId }),
    ).rejects.toMatchObject({ statusCode: 400 });
    // The merged cell itself is correctable where it starts.
    const merged = await correct(
      { rowIndex: 0, columnIndex: 0, revision: 0, correctedText: "Lithium (Li)" },
      { table: mergedTableId },
    );
    expect(merged.cellCorrections).toHaveLength(1);
  });

  it("rejects invalid text at the boundary", async () => {
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "x".repeat(161) }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.5\n34" }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(await overlays()).toHaveLength(0);
  });

  it("does not let another tenant correct, restore or see the table (AC4)", async () => {
    // Another teacher addressing my table through their own project.
    await expect(
      correct(
        { rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "9" },
        { owner: otherOwnerUserId, project: otherProjectId, table: tableId },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    // Another teacher addressing my project directly.
    await expect(
      correct(
        { rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "9" },
        { owner: otherOwnerUserId, project: projectId, table: tableId },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
    // My project addressing their table.
    await expect(
      correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "9" }, { table: foreignTableId }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      service.restore({
        ownerUserId: otherOwnerUserId,
        projectId: otherProjectId,
        tableId,
        body: { rowIndex: 0, columnIndex: 1, revision: 0 },
        correlationId,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(await database!.client.select().from(tableCellCorrections)).toHaveLength(0);

    // My correction stays out of the other tenant's review and snapshot.
    await correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.534" });
    const review = new PostgresParsedDocumentReviewService(
      new ParsedDocumentRepository(database!.client),
      undefined,
    );
    const theirs = await review.section(otherOwnerUserId, otherProjectId, keys("b2").sectionId as Identifier);
    expect(theirs.section.tables[0]).not.toHaveProperty("cellCorrections");
    await expect(review.section(otherOwnerUserId, otherProjectId, own.sectionId as Identifier)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("shows original and corrected text in review and puts the correction in the next snapshot (AC1)", async () => {
    const snapshots = new PostgresSourceSnapshotService(database!.client, () => now);
    const first = await snapshots.approve({ ownerUserId, projectId, correlationId });
    await correct({ rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "0.534" });

    const review = new PostgresParsedDocumentReviewService(
      new ParsedDocumentRepository(database!.client),
      undefined,
    );
    const section = await review.section(ownerUserId, projectId, own.sectionId as Identifier);
    const reviewed = section.section.tables.find((table) => table.id === tableId)!;
    expect(reviewed.rows[0]).toEqual(["Lithium", "0.53"]);
    expect(reviewed.cellCorrections).toEqual([
      { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
    ]);

    expect((await snapshots.status({ ownerUserId, projectId })).stale).toBe(true);
    const second = await snapshots.approve({ ownerUserId, projectId, correlationId });
    expect(second.snapshot.snapshotVersion).toBe(first.snapshot.snapshotVersion + 1);
    const visuals = await snapshots.latestApprovedVisuals({ ownerUserId, projectId });
    const snapshotTable = visuals!.tables.find((table) => table.tableId === tableId)!;
    expect(snapshotTable).toMatchObject({
      sectionId: own.sectionId,
      pageStart: 2,
      rows: [
        ["Lithium", "0.534"],
        ["Sodium", "0.97"],
      ],
      correctedCells: [{ rowIndex: 0, columnIndex: 1, revision: 1 }],
    });
    // The other table, never corrected, keeps its pre-ST-117 shape.
    expect(visuals!.tables.find((table) => table.tableId === mergedTableId)).not.toHaveProperty(
      "correctedCells",
    );

    // Restoring brings back the first snapshot's content hash.
    await restore({ rowIndex: 0, columnIndex: 1, revision: 1 });
    const third = await snapshots.approve({ ownerUserId, projectId, correlationId });
    expect(third.snapshot.contentHash).toBe(first.snapshot.contentHash);
    const [persisted] = await database!.client
      .select()
      .from(sourceSnapshots)
      .where(and(eq(sourceSnapshots.projectId, projectId), eq(sourceSnapshots.id, second.snapshot.id)));
    // An approved snapshot is immutable: the restore did not touch it.
    expect(JSON.stringify(persisted!.payload)).toContain("0.534");
  });
});
