import { createId } from "@avlp/config";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  outboxEvents,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createJobEnvelope } from "./contracts.js";
import { PostgresJobRepository } from "./repository.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("PostgreSQL job repository", () => {
  let database: TestDatabase | undefined;
  let repository: PostgresJobRepository;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
    repository = new PostgresJobRepository(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(auditEvents);
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  function command(idempotencyKey: string) {
    const projectId = createId();
    const ownerUserId = createId();
    const correlationId = createId();
    return (jobId: ReturnType<typeof createId>) => ({
      queueName: "pipeline" as const,
      envelope: createJobEnvelope(z.object({ revision: z.number() }), {
        payloadVersion: 1,
        jobId,
        jobType: "lesson.generate",
        projectId,
        ownerUserId,
        inputVersion: "outline-v1",
        idempotencyKey,
        correlationId,
        payload: { revision: 1 },
      }),
    });
  }

  function identity(job: {
    id: ReturnType<typeof createId>;
    ownerUserId: ReturnType<typeof createId>;
    projectId: ReturnType<typeof createId>;
  }) {
    return {
      jobId: job.id,
      ownerUserId: job.ownerUserId,
      projectId: job.projectId,
    };
  }

  it("creates one logical job and one outbox event under an idempotency race", async () => {
    const makeCommand = command("lesson.generate:race-test");
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        repository.createJob(makeCommand(createId())),
      ),
    );

    expect(new Set(results.map((result) => result.job.id)).size).toBe(1);
    expect(results.filter((result) => result.created)).toHaveLength(1);
    expect(await database!.client.select().from(jobs)).toHaveLength(1);
    expect(await database!.client.select().from(outboxEvents)).toHaveLength(1);
  });

  it("scopes idempotency by tenant and rejects divergent same-tenant inputs", async () => {
    const firstCommand = command("lesson.generate:tenant-scope");
    const secondTenantCommand = command("lesson.generate:tenant-scope");
    const first = await repository.createJob(firstCommand(createId()));
    const secondTenant = await repository.createJob(
      secondTenantCommand(createId()),
    );
    expect(first.created).toBe(true);
    expect(secondTenant.created).toBe(true);
    expect(secondTenant.job.id).not.toBe(first.job.id);

    await expect(
      repository.createJob({
        ...firstCommand(createId()),
        envelope: {
          ...firstCommand(createId()).envelope,
          payload: { revision: 2 },
        },
      }),
    ).rejects.toThrow("different job inputs");
  });

  it("renews heartbeats and safely requeues an expired running lease", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const created = await repository.createJob(
      command("lesson.generate:lease-test")(createId(now)),
    );
    await expect(
      repository.claimJob(
        { ...identity(created.job), ownerUserId: createId() },
        1_000,
        now,
      ),
    ).resolves.toBeUndefined();
    const claimed = await repository.claimJob(
      identity(created.job),
      1_000,
      now,
    );
    expect(claimed).toMatchObject({ state: "running", attempts: 1 });
    const lease = { jobId: created.job.id, attempt: claimed!.attempts };
    expect(
      await repository.heartbeat(lease, 1_000, new Date(now.getTime() + 500)),
    ).toBe(true);
    expect(
      await repository.requeueStaleJobs(10, new Date(now.getTime() + 1_000)),
    ).toHaveLength(0);
    expect(
      await repository.requeueStaleJobs(10, new Date(now.getTime() + 1_501)),
    ).toHaveLength(1);

    const [stored] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, created.job.id));
    expect(stored?.state).toBe("queued");
    expect(await database!.client.select().from(outboxEvents)).toHaveLength(2);
  });

  it("records bounded progress only for the current fenced lease", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const created = await repository.createJob(
      command("lesson.generate:progress-test")(createId(now)),
    );
    const claimed = await repository.claimJob(
      identity(created.job),
      1_000,
      now,
    );
    const lease = { jobId: created.job.id, attempt: claimed!.attempts };

    await expect(repository.reportProgress(lease, 0.5, now)).resolves.toBe(
      true,
    );
    await expect(
      repository.reportProgress(
        { ...lease, attempt: lease.attempt + 1 },
        0.7,
        now,
      ),
    ).resolves.toBe(false);
    await expect(repository.reportProgress(lease, 1.1, now)).rejects.toThrow(
      "between 0 and 1",
    );
    await expect(
      repository.findJob(identity(created.job)),
    ).resolves.toMatchObject({
      progress: 0.5,
    });
  });

  it("fences a stale worker after a newer attempt claims the requeued job", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const created = await repository.createJob(
      command("lesson.generate:fencing-test")(createId(now)),
    );
    const first = await repository.claimJob(identity(created.job), 1_000, now);
    const firstLease = { jobId: created.job.id, attempt: first!.attempts };
    await repository.requeueStaleJobs(10, new Date(now.getTime() + 1_001));
    const second = await repository.claimJob(
      identity(created.job),
      1_000,
      new Date(now.getTime() + 1_002),
    );
    const secondLease = { jobId: created.job.id, attempt: second!.attempts };

    expect(
      await repository.heartbeat(
        firstLease,
        1_000,
        new Date(now.getTime() + 1_003),
      ),
    ).toBe(false);
    expect(
      await repository.completeJob(
        firstLease,
        { artifactVersion: "stale-result" },
        new Date(now.getTime() + 1_004),
      ),
    ).toBe(false);
    expect(
      await repository.completeJob(
        secondLease,
        { artifactVersion: "current-result" },
        new Date(now.getTime() + 1_005),
      ),
    ).toBe(true);
    const stored = await repository.findJob(identity(created.job));
    expect(stored).toMatchObject({
      state: "succeeded",
      attempts: 2,
      resultMetadata: { artifactVersion: "current-result" },
    });
  });

  it("does not claim a retry-wait job before its availability time", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const created = await repository.createJob(
      command("lesson.generate:retry-delay-test")(createId(now)),
    );
    const first = await repository.claimJob(identity(created.job), 1_000, now);
    const lease = { jobId: created.job.id, attempt: first!.attempts };
    await repository.reportProgress(lease, 0.6, now);
    await repository.recordFailure(
      lease,
      {
        classification: "retryable",
        code: "TEMPORARY_FAILURE",
        message: "The operation can be retried.",
      },
      1_000,
      now,
    );

    expect(
      await repository.claimJob(
        identity(created.job),
        1_000,
        new Date(now.getTime() + 999),
      ),
    ).toBeUndefined();
    expect(
      await repository.claimJob(
        identity(created.job),
        1_000,
        new Date(now.getTime() + 1_000),
      ),
    ).toMatchObject({ state: "running", attempts: 2, progress: 0 });
  });

  it("audits an administrative retry with actor and correlation context", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const created = await repository.createJob(
      command("lesson.generate:admin-retry-test")(createId(now)),
    );
    const claimed = await repository.claimJob(
      identity(created.job),
      1_000,
      now,
    );
    await repository.recordFailure(
      { jobId: created.job.id, attempt: claimed!.attempts },
      {
        classification: "retryable",
        code: "TEMPORARY_FAILURE",
        message: "The operation can be retried.",
      },
      0,
      now,
    );
    await database!.client
      .update(jobs)
      .set({ state: "failed", completedAt: now })
      .where(eq(jobs.id, created.job.id));
    const actorUserId = createId();
    const correlationId = createId();

    await expect(
      repository.retryFailedJob(
        {
          jobId: created.job.id,
          ownerUserId: created.job.ownerUserId,
          projectId: createId(),
          actorUserId,
          correlationId,
        },
        now,
      ),
    ).resolves.toBeUndefined();
    expect(await database!.client.select().from(auditEvents)).toEqual([]);

    await expect(
      repository.retryFailedJob(
        {
          jobId: created.job.id,
          ownerUserId: created.job.ownerUserId,
          projectId: created.job.projectId,
          actorUserId,
          correlationId,
        },
        now,
      ),
    ).resolves.toMatchObject({ state: "queued" });
    expect(await database!.client.select().from(auditEvents)).toEqual([
      expect.objectContaining({
        ownerUserId: created.job.ownerUserId,
        projectId: created.job.projectId,
        actorUserId,
        eventType: "job.admin_retried",
        targetId: created.job.id,
        correlationId,
      }),
    ]);
  });

  it("audits administrative cancellation in the job-state transaction", async () => {
    const now = new Date("2026-08-08T12:00:00.000Z");
    const created = await repository.createJob(
      command("lesson.generate:admin-cancel-test")(createId(now)),
    );
    const actorUserId = createId();
    const correlationId = createId();

    await expect(
      repository.cancelJob(
        {
          jobId: created.job.id,
          ownerUserId: createId(),
          projectId: created.job.projectId,
          actorUserId,
          correlationId,
        },
        now,
      ),
    ).resolves.toBe(false);
    expect(await database!.client.select().from(auditEvents)).toEqual([]);

    await expect(
      repository.cancelJob(
        {
          jobId: created.job.id,
          ownerUserId: created.job.ownerUserId,
          projectId: created.job.projectId,
          actorUserId,
          correlationId,
        },
        now,
      ),
    ).resolves.toBe(true);
    expect(await repository.findJob(identity(created.job))).toMatchObject({
      state: "cancelled",
      errorClassification: "cancelled",
    });
    expect(await database!.client.select().from(auditEvents)).toEqual([
      expect.objectContaining({
        ownerUserId: created.job.ownerUserId,
        projectId: created.job.projectId,
        actorUserId,
        eventType: "job.admin_cancelled",
        targetId: created.job.id,
        correlationId,
      }),
    ]);
  });
});
