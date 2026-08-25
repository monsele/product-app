import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  outboxEvents,
  projectAssets,
  projects,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { storageKeys } from "@avlp/storage";
import { eq } from "drizzle-orm";
import {
  ProjectAssetService,
  projectAssetDeletionRetentionMs,
} from "./project-assets.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("ProjectAssetService retained deletion", () => {
  let database: TestDatabase | undefined;
  const ownerUserId = createId(new Date("2026-08-15T10:00:00.000Z"));
  const projectId = createId(new Date("2026-08-15T10:00:01.000Z"));
  const assetId = createId(new Date("2026-08-15T10:00:02.000Z"));
  const correlationId = createId(new Date("2026-08-15T10:00:03.000Z"));
  const deletedAt = new Date("2026-08-15T12:00:00.000Z");

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
    await database!.client.delete(auditEvents);
    await database!.client.delete(projectAssets);
    await database!.client.delete(projects);
    await database!.client.delete(users);
    await database!.client.insert(users).values({
      id: ownerUserId,
      displayName: "Owner",
      emailNormalized: "owner@example.test",
    });
    await database!.client.insert(projects).values({
      id: projectId,
      ownerUserId,
      title: "Asset retention",
      stage: "draft",
    });
    await database!.client.insert(projectAssets).values({
      id: assetId,
      ownerUserId,
      projectId,
      mediaType: "image/png",
      originalName: "diagram.png",
      sizeBytes: 1,
      sha256: "a".repeat(64),
      storageKey: storageKeys.assetOriginal({
        assetId,
        projectId,
        userId: ownerUserId,
        extension: "png",
      }),
      status: "active",
    });
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("tombstones an unbound asset and transactionally schedules retained cleanup", async () => {
    const service = new ProjectAssetService(
      database!.client,
      {} as never,
      () => deletedAt,
    );

    await expect(
      service.remove(ownerUserId, projectId, assetId, correlationId),
    ).resolves.toBeUndefined();
    const [asset] = await database!.client
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.id, assetId));
    expect(asset).toMatchObject({
      deletedAt,
      cleanupAfter: new Date(
        deletedAt.getTime() + projectAssetDeletionRetentionMs,
      ),
      cleanupCompletedAt: null,
    });
    const [cleanupJob] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "project-asset.cleanup"));
    expect(cleanupJob).toMatchObject({
      projectId,
      ownerUserId,
      availableAt: asset?.cleanupAfter,
      state: "queued",
    });
    const [cleanupOutbox] = await database!.client
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.jobId, cleanupJob!.id));
    expect(cleanupOutbox).toMatchObject({
      eventType: "project_asset.cleanup.requested.v1",
      availableAt: asset?.cleanupAfter,
      dispatchedAt: null,
    });
  });
});
