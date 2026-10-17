import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./testing.js";
import { migrateDatabase } from "./migrations.js";
import { lessonRecoveryRuns, lessonRecoveryTasks } from "./schema.js";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
suite("recovery persistence", () => {
  let database: TestDatabase;
  beforeAll(async () => {
    database = await createTestDatabase(process.env.TEST_DATABASE_URL!);
    await migrateDatabase(database.client);
    await migrateDatabase(database.client);
  });
  afterAll(async () => {
    await database?.destroy();
  });
  it("persists authority and prevents concurrent allowances and repeated operation fingerprints", async () => {
    const id = "01989a3d-8e00-7000-8000-000000000001";
    const other = "01989a3d-8e00-7000-8000-000000000002";
    const db = database.client;
    const run = {
      id,
      ownerUserId: id,
      projectId: id,
      lessonSpecId: id,
      revision: 1,
      idempotencyKey: "a",
      allowanceUsd: "1",
      correlationId: id,
    };
    await db.insert(lessonRecoveryRuns).values(run);
    await expect(
      db
        .insert(lessonRecoveryRuns)
        .values({ ...run, id: other, idempotencyKey: "b" }),
    ).rejects.toThrow();
    await db
      .insert(lessonRecoveryRuns)
      .values({ ...run, id: other, ownerUserId: other });
    const task = {
      id,
      ownerUserId: id,
      projectId: id,
      runId: id,
      operation: "audio",
      fingerprint: "same",
    };
    await db.insert(lessonRecoveryTasks).values(task);
    await expect(
      db.insert(lessonRecoveryTasks).values({ ...task, id: other }),
    ).rejects.toThrow();
  });
});
