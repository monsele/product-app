import { createId } from "@avlp/config";
import {
  jobs,
  migrateDatabase,
  outboxEvents,
  projects,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  createJobEnvelope,
  createIdempotencyKey,
  executeJobDelivery,
  PostgresJobRepository,
} from "@avlp/jobs";
import { projectCleanupJobPayloadSchema } from "@avlp/schemas";
import { storageKeys, type StorageKey } from "@avlp/storage";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createProjectCleanupJobHandler } from "./project-cleanup.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("project cleanup job", () => {
  let database: TestDatabase | undefined;
  const ownerUserId = createId(new Date("2026-08-13T10:00:00.000Z"));
  const projectId = createId(new Date("2026-08-13T10:00:01.000Z"));
  const correlationId = createId(new Date("2026-08-13T10:00:02.000Z"));
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
      title: "Deleted lesson",
      stage: "draft",
      deletedAt,
      cleanupAfter,
    });
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("executes retained cleanup once and safely reports a repeat", async () => {
    const repository = new PostgresJobRepository(database!.client);
    const cleanupJobId = createId(new Date("2026-08-01T09:00:00.000Z"));
    const payload = projectCleanupJobPayloadSchema.parse({
      schemaVersion: 1,
      projectId,
      ownerUserId,
      deletedAt: deletedAt.toISOString(),
      cleanupAfter: cleanupAfter.toISOString(),
    });
    const cleanupEnvelope = createJobEnvelope(projectCleanupJobPayloadSchema, {
      jobId: cleanupJobId,
      jobType: "project.cleanup",
      projectId,
      ownerUserId,
      inputVersion: "project-deletion-v1",
      idempotencyKey: createIdempotencyKey({
        jobType: "project.cleanup",
        projectId,
        inputVersion: "project-deletion-v1",
        options: { cleanupAfter: payload.cleanupAfter },
      }),
      correlationId,
      payloadVersion: 1,
      payload,
    });
    await repository.createJob({
      queueName: "pipeline",
      envelope: cleanupEnvelope,
    });
    const discardedJobId = createId(new Date("2026-08-01T09:00:01.000Z"));
    await repository.createJob({
      queueName: "pipeline",
      envelope: createJobEnvelope(projectCleanupJobPayloadSchema, {
        jobId: discardedJobId,
        jobType: "project.discarded-work",
        projectId,
        ownerUserId,
        inputVersion: "v1",
        idempotencyKey: "discarded-project-work",
        correlationId,
        payloadVersion: 1,
        payload,
      }),
    });
    const handler = createProjectCleanupJobHandler({
      database: database!.client,
      now: () => completedAt,
      storage: {
        deletePrefix: async (prefix: StorageKey) => {
          expect(prefix).toBe(
            storageKeys.projectPrefix({ projectId, userId: ownerUserId }),
          );
          return 2;
        },
      },
    });

    await expect(
      executeJobDelivery({
        rawEnvelope: cleanupEnvelope,
        queueName: "pipeline",
        payloadSchema: projectCleanupJobPayloadSchema,
        repository,
        handler: handler.handler,
        ...(handler.retryPolicy === undefined
          ? {}
          : { retryPolicy: handler.retryPolicy }),
      }),
    ).resolves.toBe("succeeded");
    expect(
      await database!.client
        .select()
        .from(jobs)
        .where(eq(jobs.id, discardedJobId)),
    ).toEqual([]);
    expect(
      await database!.client
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.jobId, discardedJobId)),
    ).toEqual([]);
    const [tombstone] = await database!.client
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(tombstone).toMatchObject({
      deletedAt,
      cleanupAfter,
      cleanupCompletedAt: completedAt,
    });
    const [cleanupJob] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, cleanupJobId));
    expect(cleanupJob?.resultMetadata).toMatchObject({
      cleanup: "completed",
      deletedObjectCount: 2,
    });

    await expect(
      handler.handler(payload, {
        attempt: 2,
        correlationId,
        heartbeat: async () => undefined,
        idempotencyKey: cleanupEnvelope.idempotencyKey,
        jobId: cleanupJobId,
        ownerUserId,
        projectId,
        reportProgress: async () => undefined,
      }),
    ).resolves.toEqual({
      cleanup: "already_completed",
      deletedJobCount: 0,
      deletedObjectCount: 0,
    });
  });

  it("keeps the tombstone pending when storage cleanup must retry", async () => {
    const repository = new PostgresJobRepository(database!.client);
    const jobId = createId(new Date("2026-08-01T09:00:02.000Z"));
    const payload = projectCleanupJobPayloadSchema.parse({
      schemaVersion: 1,
      projectId,
      ownerUserId,
      deletedAt: deletedAt.toISOString(),
      cleanupAfter: cleanupAfter.toISOString(),
    });
    const envelope = createJobEnvelope(projectCleanupJobPayloadSchema, {
      jobId,
      jobType: "project.cleanup",
      projectId,
      ownerUserId,
      inputVersion: "project-deletion-v1",
      idempotencyKey: "project-cleanup-storage-retry",
      correlationId,
      payloadVersion: 1,
      payload,
    });
    await repository.createJob({ queueName: "pipeline", envelope });
    const handler = createProjectCleanupJobHandler({
      database: database!.client,
      now: () => completedAt,
      storage: {
        deletePrefix: async () => {
          throw new Error("Storage is temporarily unavailable.");
        },
      },
    });

    await expect(
      executeJobDelivery({
        rawEnvelope: envelope,
        queueName: "pipeline",
        payloadSchema: projectCleanupJobPayloadSchema,
        repository,
        handler: handler.handler,
        ...(handler.retryPolicy === undefined
          ? {}
          : { retryPolicy: handler.retryPolicy }),
      }),
    ).rejects.toThrow("Job delivery will be retried");
    const [job] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(job).toMatchObject({
      state: "retry_wait",
      errorClassification: "retryable",
    });
    const [tombstone] = await database!.client
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(tombstone?.cleanupCompletedAt).toBeNull();
  });
});
