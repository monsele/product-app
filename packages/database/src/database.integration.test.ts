import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  inTransaction,
  migrateDatabase,
  nextRevision,
  requireOptimisticUpdate,
} from "./index.js";
import { databaseMetadata } from "./schema.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("PostgreSQL migration lifecycle", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("applies the journal exactly once", async () => {
    await migrateDatabase(database!.client);
    await migrateDatabase(database!.client);
    const applied = await database!.client.execute<{ exists: boolean }>(sql`
      select to_regclass('public.database_metadata') is not null as exists
    `);
    expect(applied[0]?.exists).toBe(true);

    const compatibilityNotes = await readFile(
      fileURLToPath(
        new URL(
          "../drizzle/0000_dark_phalanx.compatibility.md",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(compatibilityNotes).toContain("forward migration");
  });
});

describeWithPostgres("PostgreSQL transaction and concurrency behavior", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(databaseMetadata);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("rolls back every write when a transaction callback fails", async () => {
    await expect(
      inTransaction(database!.client, async (transaction) => {
        await transaction.insert(databaseMetadata).values({ key: "rollback" });
        throw new Error("force rollback");
      }),
    ).rejects.toThrow("force rollback");

    const rows = await database!.client
      .select()
      .from(databaseMetadata)
      .where(eq(databaseMetadata.key, "rollback"));
    expect(rows).toEqual([]);
  });

  it("detects a stale revision after one concurrent writer succeeds", async () => {
    await database!.client
      .insert(databaseMetadata)
      .values({ key: "concurrency" });

    const first = await database!.client
      .update(databaseMetadata)
      .set({ revision: nextRevision(1), updatedAt: new Date() })
      .where(
        and(
          eq(databaseMetadata.key, "concurrency"),
          eq(databaseMetadata.revision, 1),
        ),
      )
      .returning();
    expect(first).toHaveLength(1);

    const stale = await database!.client
      .update(databaseMetadata)
      .set({ revision: nextRevision(1), updatedAt: new Date() })
      .where(
        and(
          eq(databaseMetadata.key, "concurrency"),
          eq(databaseMetadata.revision, 1),
        ),
      )
      .returning();
    expect(() =>
      requireOptimisticUpdate(stale, {
        entity: "database metadata",
        entityId: "concurrency",
        expectedRevision: 1,
      }),
    ).toThrowError("revision changed");
  });
});
