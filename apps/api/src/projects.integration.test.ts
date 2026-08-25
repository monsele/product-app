import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import { ProjectAuthorizationService } from "@avlp/auth";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  outboxEvents,
  projectCloneRequests,
  projects,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  createJobEnvelope,
  createIdempotencyKey,
  PostgresJobRepository,
} from "@avlp/jobs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  PostgresProjectRepository,
  projectDeletionRetentionMs,
} from "./projects.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("PostgresProjectRepository", () => {
  let database: TestDatabase | undefined;
  let repository: PostgresProjectRepository;
  const ownerId = createId(new Date("2026-08-13T10:00:00.000Z"));
  const otherOwnerId = createId(new Date("2026-08-13T10:00:01.000Z"));
  const correlationId = createId(new Date("2026-08-13T10:00:02.000Z"));

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
    await database!.client.delete(auditEvents);
    await database!.client.delete(projects);
    await database!.client.delete(users);
    await database!.client.insert(users).values([
      {
        id: ownerId,
        emailNormalized: "owner@example.test",
        displayName: "Owner",
      },
      {
        id: otherOwnerId,
        emailNormalized: "other@example.test",
        displayName: "Other",
      },
    ]);
    let tick = new Date("2026-08-13T12:00:00.000Z").getTime();
    repository = new PostgresProjectRepository(
      database!.client,
      () => new Date((tick += 1_000)),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("creates an owner-scoped draft with a correlated audit record", async () => {
    const project = await repository.create({
      ownerUserId: ownerId,
      title: "Water cycle",
      correlationId,
    });

    expect(project).toMatchObject({
      title: "Water cycle",
      stage: "draft",
      latestFailedOperation: null,
      revision: 1,
    });
    const audit = await database!.client.select().from(auditEvents);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      ownerUserId: ownerId,
      projectId: project.id,
      eventType: "project.created",
      correlationId,
    });
  });

  it("paginates only active projects belonging to the selected owner", async () => {
    await repository.create({
      ownerUserId: ownerId,
      title: "One",
      correlationId,
    });
    await repository.create({
      ownerUserId: ownerId,
      title: "Two",
      correlationId,
    });
    await repository.create({
      ownerUserId: otherOwnerId,
      title: "Other",
      correlationId,
    });

    const firstPage = await repository.listOwnedProjects(ownerId, { limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.items[0]?.title).toBe("Two");
    expect(firstPage.nextCursor).toBeTypeOf("string");
    const cursor = firstPage.nextCursor;
    if (cursor === undefined) throw new Error("Expected a next-page cursor.");
    const secondPage = await repository.listOwnedProjects(ownerId, {
      limit: 1,
      cursor,
    });
    expect(secondPage.items.map((project) => project.title)).toEqual(["One"]);
    expect(secondPage.nextCursor).toBeUndefined();
  });

  it("rejects another owner at the database-query authorization boundary", async () => {
    const project = await repository.create({
      ownerUserId: ownerId,
      title: "Private project",
      correlationId,
    });
    const authorizer = new ProjectAuthorizationService(repository);

    await expect(
      authorizer.assertProjectAccess(otherOwnerId, project.id),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    await expect(
      repository.loadOwnedProjectDetail(otherOwnerId, project.id),
    ).resolves.toBeNull();
  });

  it("deep clones an active project into an independent draft", async () => {
    const source = await repository.create({
      ownerUserId: ownerId,
      title: "Water cycle",
      correlationId,
    });
    await database!.client
      .update(projects)
      .set({ stage: "completed" })
      .where(eq(projects.id, source.id));

    const [duplicate, retried] = await Promise.all([
      repository.duplicate({
        ownerUserId: ownerId,
        projectId: source.id,
        correlationId,
        idempotencyKey: "duplicate-water-cycle-once",
      }),
      repository.duplicate({
        ownerUserId: ownerId,
        projectId: source.id,
        correlationId,
        idempotencyKey: "duplicate-water-cycle-once",
      }),
    ]);
    expect(duplicate).toMatchObject({
      title: "Copy of Water cycle",
      stage: "draft",
      revision: 1,
    });
    expect(duplicate.id).not.toBe(source.id);

    await database!.client
      .update(projects)
      .set({ title: "Independent variation" })
      .where(eq(projects.id, duplicate.id));
    const original = await repository.loadOwnedProjectDetail(
      ownerId,
      source.id,
    );
    expect(original?.title).toBe("Water cycle");
    const audit = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.projectId, duplicate.id));
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "project.duplicated",
          metadata: expect.objectContaining({ sourceProjectId: source.id }),
        }),
      ]),
    );
    expect(retried.id).toBe(duplicate.id);
    expect(
      await database!.client.select().from(projectCloneRequests),
    ).toHaveLength(1);
  });

  it("tombstones a project, fences a running job, and schedules retained cleanup", async () => {
    const project = await repository.create({
      ownerUserId: ownerId,
      title: "Water cycle",
      correlationId,
    });
    const jobRepository = new PostgresJobRepository(database!.client);
    const jobId = createId(new Date("2026-08-13T13:00:00.000Z"));
    const envelope = createJobEnvelope(z.object({}).strict(), {
      jobId,
      jobType: "project.test",
      projectId: project.id,
      ownerUserId: ownerId,
      inputVersion: "v1",
      idempotencyKey: createIdempotencyKey({
        jobType: "project.test",
        projectId: project.id,
        inputVersion: "v1",
        options: {},
      }),
      correlationId,
      payloadVersion: 1,
      payload: {},
    });
    await jobRepository.createJob({ envelope, queueName: "pipeline" });
    const running = await jobRepository.claimJob(
      { jobId, ownerUserId: ownerId, projectId: project.id },
      60_000,
    );
    if (running === undefined) throw new Error("Expected a running job.");

    const deletedAt = new Date("2026-08-13T14:00:00.000Z");
    repository = new PostgresProjectRepository(
      database!.client,
      () => deletedAt,
    );
    await repository.delete({
      ownerUserId: ownerId,
      projectId: project.id,
      correlationId,
    });

    expect(
      await repository.loadOwnedProjectDetail(ownerId, project.id),
    ).toBeNull();
    expect(
      await jobRepository.completeJob(
        { jobId, attempt: running.attempts },
        { ignored: true },
      ),
    ).toBe(false);
    const [cancelled] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(cancelled).toMatchObject({
      state: "cancelled",
      errorClassification: "cancelled",
    });
    const [cleanupJob] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "project.cleanup"));
    expect(cleanupJob).toMatchObject({
      state: "queued",
      projectId: project.id,
      ownerUserId: ownerId,
      availableAt: new Date(deletedAt.getTime() + projectDeletionRetentionMs),
    });
    const [cleanupOutbox] = await database!.client
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.jobId, cleanupJob!.id));
    expect(cleanupOutbox).toMatchObject({
      queueName: "pipeline",
      availableAt: cleanupJob!.availableAt,
      dispatchedAt: null,
    });
  });

  it("does not let a different owner delete a project", async () => {
    const project = await repository.create({
      ownerUserId: ownerId,
      title: "Private project",
      correlationId,
    });
    await expect(
      repository.delete({
        ownerUserId: otherOwnerId,
        projectId: project.id,
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    expect(
      await repository.loadOwnedProjectDetail(ownerId, project.id),
    ).not.toBeNull();
  });
});
