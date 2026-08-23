import { createId } from "@avlp/config";
import {
  jobs,
  migrateDatabase,
  outboxEvents,
  projectAssets,
  projects,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  createIdempotencyKey,
  createJobEnvelope,
  executeJobDelivery,
  PostgresJobRepository,
} from "@avlp/jobs";
import { projectAssetCleanupJobPayloadSchema } from "@avlp/schemas";
import { storageKeys, type StorageKey } from "@avlp/storage";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createProjectAssetCleanupJobHandler } from "./project-asset-cleanup-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("project asset cleanup job", () => {
  let database: TestDatabase | undefined;
  const ownerUserId = createId(new Date("2026-08-14T10:00:00.000Z"));
  const projectId = createId(new Date("2026-08-14T10:00:01.000Z"));
  const assetId = createId(new Date("2026-08-14T10:00:02.000Z"));
  const correlationId = createId(new Date("2026-08-14T10:00:03.000Z"));
  const deletedAt = new Date("2026-07-01T10:00:00.000Z");
  const cleanupAfter = new Date("2026-07-31T10:00:00.000Z");
  const completedAt = new Date("2026-08-01T10:00:00.000Z");

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
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
      title: "Retained lesson",
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
      deletedAt,
      cleanupAfter,
    });
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("cleans the asset prefix once and retains an auditable tombstone", async () => {
    const jobId = createId(new Date("2026-08-01T09:00:00.000Z"));
    const payload = projectAssetCleanupJobPayloadSchema.parse({
      schemaVersion: 1,
      assetId,
      deletedAt: deletedAt.toISOString(),
      cleanupAfter: cleanupAfter.toISOString(),
    });
    const envelope = createJobEnvelope(projectAssetCleanupJobPayloadSchema, {
      jobId,
      jobType: "project-asset.cleanup",
      projectId,
      ownerUserId,
      inputVersion: `project-asset-deletion:${assetId}`,
      idempotencyKey: createIdempotencyKey({
        jobType: "project-asset.cleanup",
        projectId,
        inputVersion: `project-asset-deletion:${assetId}`,
        options: { cleanupAfter: payload.cleanupAfter },
      }),
      correlationId,
      payloadVersion: 1,
      payload,
    });
    const repository = new PostgresJobRepository(database!.client);
    await repository.createJob({ queueName: "pipeline", envelope });
    const handler = createProjectAssetCleanupJobHandler({
      database: database!.client,
      now: () => completedAt,
      storage: {
        deletePrefix: async (prefix: StorageKey) => {
          expect(prefix).toBe(
            storageKeys.assetPrefix({ assetId, projectId, userId: ownerUserId }),
          );
          return 2;
        },
      },
    });

    await expect(
      executeJobDelivery({
        rawEnvelope: envelope,
        queueName: "pipeline",
        payloadSchema: projectAssetCleanupJobPayloadSchema,
        repository,
        handler: handler.handler,
        ...(handler.retryPolicy === undefined
          ? {}
          : { retryPolicy: handler.retryPolicy }),
      }),
    ).resolves.toBe("succeeded");
    const [asset] = await database!.client
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.id, assetId));
    expect(asset?.cleanupCompletedAt).toEqual(completedAt);

    await expect(
      handler.handler(payload, {
        attempt: 2,
        correlationId,
        heartbeat: async () => undefined,
        idempotencyKey: envelope.idempotencyKey,
        jobId,
        ownerUserId,
        projectId,
        reportProgress: async () => undefined,
      }),
    ).resolves.toEqual({ cleanup: "already_completed", deletedObjectCount: 0 });
  });
});
