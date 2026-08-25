import { createId, identifierSchema, type Identifier } from "@avlp/config";
import {
  inTransaction,
  jobs,
  outboxEvents,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type {
  JobEnvelope,
  JobErrorMetadata,
  JobMetadata,
  QueueName,
  RetryPolicy,
} from "./contracts.js";
import {
  jobEnvelopeSchema,
  queueNameSchema,
  retryPolicySchema,
} from "./contracts.js";
import { z } from "zod";
import { PostgresAuditWriter } from "@avlp/observability";
import { hashJobOptions } from "./idempotency.js";

export type JobRow = typeof jobs.$inferSelect;
export type OutboxEventRow = typeof outboxEvents.$inferSelect;

export type ClaimedOutboxEvent = OutboxEventRow & {
  envelope: JobEnvelope<unknown>;
  deliveryOptions: { maxAttempts: number; retryDelayMs: number };
};

export type CreateJobCommand<T> = {
  envelope: JobEnvelope<T>;
  queueName: QueueName;
  retryPolicy?: Partial<RetryPolicy>;
};

export type CreateJobResult = { job: JobRow; created: boolean };
export type JobLease = { jobId: Identifier; attempt: number };
export type ProjectJobIdentity = {
  jobId: Identifier;
  ownerUserId: Identifier;
  projectId: Identifier;
};
export type AdministrativeJobCommand = {
  jobId: Identifier;
  ownerUserId: Identifier;
  projectId: Identifier;
  actorUserId: Identifier;
  correlationId: Identifier;
};

const administrativeJobCommandSchema = z.object({
  jobId: identifierSchema,
  ownerUserId: identifierSchema,
  projectId: identifierSchema,
  actorUserId: identifierSchema,
  correlationId: identifierSchema,
});

export function staleLeaseAction(
  job: Pick<JobRow, "state" | "leaseExpiresAt" | "attempts" | "maxAttempts">,
  now = new Date(),
): "not_stale" | "requeue" | "fail" {
  if (
    job.state !== "running" ||
    job.leaseExpiresAt === null ||
    job.leaseExpiresAt > now
  )
    return "not_stale";
  return job.attempts >= job.maxAttempts ? "fail" : "requeue";
}

export interface JobExecutionRepository {
  claimJob(
    identity: ProjectJobIdentity,
    leaseDurationMs: number,
    now?: Date,
  ): Promise<JobRow | undefined>;
  heartbeat(
    lease: JobLease,
    leaseDurationMs: number,
    now?: Date,
  ): Promise<boolean>;
  reportProgress(
    lease: JobLease,
    progress: number,
    now?: Date,
  ): Promise<boolean>;
  completeJob(
    lease: JobLease,
    result: JobMetadata,
    now?: Date,
  ): Promise<boolean>;
  recordFailure(
    lease: JobLease,
    error: JobErrorMetadata,
    retryDelayMs: number,
    now?: Date,
  ): Promise<JobRow | undefined>;
  findJob(identity: ProjectJobIdentity): Promise<JobRow | undefined>;
}

function envelopeFromJob(job: JobRow): JobEnvelope<unknown> {
  return {
    schemaVersion: 1,
    payloadVersion: job.payloadVersion,
    jobId: job.id as Identifier,
    jobType: job.jobType,
    projectId: job.projectId as Identifier,
    ownerUserId: job.ownerUserId as Identifier,
    inputVersion: job.inputVersion,
    idempotencyKey: job.idempotencyKey,
    correlationId: job.correlationId as Identifier,
    payload: job.payload,
    requestedAt: job.createdAt.toISOString(),
  };
}

function outboxValues(job: JobRow, eventType: string) {
  return {
    id: createId(),
    jobId: job.id,
    eventType,
    queueName: job.queueName,
    envelope: envelopeFromJob(job),
    deliveryOptions: {
      maxAttempts: job.maxAttempts,
      retryDelayMs: job.retryDelayMs,
    },
  };
}

export class PostgresJobRepository implements JobExecutionRepository {
  public constructor(private readonly client: DatabaseClient) {}

  public async createJob<T>(
    command: CreateJobCommand<T>,
  ): Promise<CreateJobResult> {
    const envelope = jobEnvelopeSchema(z.unknown()).parse(
      command.envelope,
    ) as JobEnvelope<unknown>;
    const queueName = queueNameSchema.parse(command.queueName);
    const retryPolicy = retryPolicySchema.parse(command.retryPolicy ?? {});
    return inTransaction(this.client, async (transaction) => {
      const [created] = await transaction
        .insert(jobs)
        .values({
          id: envelope.jobId,
          jobType: envelope.jobType,
          queueName,
          projectId: envelope.projectId,
          ownerUserId: envelope.ownerUserId,
          inputVersion: envelope.inputVersion,
          idempotencyKey: envelope.idempotencyKey,
          correlationId: envelope.correlationId,
          payloadVersion: envelope.payloadVersion,
          payload: envelope.payload,
          maxAttempts: retryPolicy.maxAttempts,
          retryDelayMs: retryPolicy.retryDelayMs,
        })
        .onConflictDoNothing({
          target: [jobs.ownerUserId, jobs.projectId, jobs.idempotencyKey],
        })
        .returning();

      if (created !== undefined) {
        await transaction
          .insert(outboxEvents)
          .values(
            outboxValues(created, `job.requested.v${envelope.schemaVersion}`),
          );
        return { job: created, created: true };
      }

      const [existing] = await transaction
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, envelope.ownerUserId),
            eq(jobs.projectId, envelope.projectId),
            eq(jobs.idempotencyKey, envelope.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error(
          "The idempotent job could not be read after its conflict.",
        );
      if (
        existing.jobType !== envelope.jobType ||
        existing.projectId !== envelope.projectId ||
        existing.ownerUserId !== envelope.ownerUserId ||
        existing.queueName !== queueName ||
        existing.inputVersion !== envelope.inputVersion ||
        existing.payloadVersion !== envelope.payloadVersion ||
        existing.maxAttempts !== retryPolicy.maxAttempts ||
        existing.retryDelayMs !== retryPolicy.retryDelayMs ||
        hashJobOptions(existing.payload) !== hashJobOptions(envelope.payload)
      )
        throw new Error(
          "An idempotency key was reused for different job inputs.",
        );
      return { job: existing, created: false };
    });
  }

  public async findJob(
    identity: ProjectJobIdentity,
  ): Promise<JobRow | undefined> {
    const [job] = await this.client
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, identity.jobId),
          eq(jobs.ownerUserId, identity.ownerUserId),
          eq(jobs.projectId, identity.projectId),
        ),
      )
      .limit(1);
    return job;
  }

  public async listProjectJobs(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    cursor?: Identifier;
    limit?: number;
  }): Promise<JobRow[]> {
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new TypeError("Job history limit must be between 1 and 100.");
    return this.client
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerUserId, input.ownerUserId),
          eq(jobs.projectId, input.projectId),
          ...(input.cursor === undefined ? [] : [lt(jobs.id, input.cursor)]),
        ),
      )
      .orderBy(desc(jobs.id))
      .limit(limit);
  }

  public async claimJob(
    identity: ProjectJobIdentity,
    leaseDurationMs: number,
    now = new Date(),
  ): Promise<JobRow | undefined> {
    const [job] = await this.client
      .update(jobs)
      .set({
        state: "running",
        progress: 0,
        attempts: sql`${jobs.attempts} + 1`,
        startedAt: now,
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        completedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, identity.jobId),
          eq(jobs.ownerUserId, identity.ownerUserId),
          eq(jobs.projectId, identity.projectId),
          or(
            eq(jobs.state, "queued"),
            and(eq(jobs.state, "retry_wait"), lte(jobs.availableAt, now)),
          ),
        ),
      )
      .returning();
    return job;
  }

  public async heartbeat(
    lease: JobLease,
    leaseDurationMs: number,
    now = new Date(),
  ): Promise<boolean> {
    const updated = await this.client
      .update(jobs)
      .set({
        heartbeatAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, lease.jobId),
          eq(jobs.state, "running"),
          eq(jobs.attempts, lease.attempt),
        ),
      )
      .returning({ id: jobs.id });
    return updated.length === 1;
  }

  public async reportProgress(
    lease: JobLease,
    progress: number,
    now = new Date(),
  ): Promise<boolean> {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1)
      throw new TypeError("Job progress must be between 0 and 1.");
    const updated = await this.client
      .update(jobs)
      .set({ progress, heartbeatAt: now, updatedAt: now })
      .where(
        and(
          eq(jobs.id, lease.jobId),
          eq(jobs.state, "running"),
          eq(jobs.attempts, lease.attempt),
        ),
      )
      .returning({ id: jobs.id });
    return updated.length === 1;
  }

  public async completeJob(
    lease: JobLease,
    result: JobMetadata,
    now = new Date(),
  ): Promise<boolean> {
    const updated = await this.client
      .update(jobs)
      .set({
        state: "succeeded",
        progress: 1,
        resultMetadata: result,
        errorClassification: null,
        errorMetadata: null,
        completedAt: now,
        heartbeatAt: now,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, lease.jobId),
          eq(jobs.state, "running"),
          eq(jobs.attempts, lease.attempt),
        ),
      )
      .returning({ id: jobs.id });
    return updated.length === 1;
  }

  public async recordFailure(
    lease: JobLease,
    error: JobErrorMetadata,
    retryDelayMs: number,
    now = new Date(),
  ): Promise<JobRow | undefined> {
    const [current] = await this.client
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, lease.jobId),
          eq(jobs.state, "running"),
          eq(jobs.attempts, lease.attempt),
        ),
      )
      .limit(1);
    if (current === undefined) return undefined;
    const willRetry =
      error.classification === "retryable" &&
      current.attempts < current.maxAttempts;
    const state =
      error.classification === "cancelled"
        ? "cancelled"
        : willRetry
          ? "retry_wait"
          : "failed";
    const [updated] = await this.client
      .update(jobs)
      .set({
        state,
        errorClassification: error.classification,
        errorMetadata: error,
        availableAt: willRetry
          ? new Date(now.getTime() + retryDelayMs)
          : current.availableAt,
        completedAt: willRetry ? null : now,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobs.id, lease.jobId),
          eq(jobs.state, "running"),
          eq(jobs.attempts, lease.attempt),
        ),
      )
      .returning();
    return updated;
  }

  public async claimOutboxEvents(
    limit: number,
    leaseDurationMs: number,
    now = new Date(),
  ): Promise<ClaimedOutboxEvent[]> {
    return inTransaction(this.client, async (transaction) => {
      const candidates = await transaction
        .select()
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.dispatchedAt),
            lte(outboxEvents.availableAt, now),
            or(
              isNull(outboxEvents.claimExpiresAt),
              lte(outboxEvents.claimExpiresAt, now),
            ),
          ),
        )
        .orderBy(asc(outboxEvents.createdAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (candidates.length === 0) return [];
      const ids = candidates.map((event) => event.id);
      const claimExpiresAt = new Date(now.getTime() + leaseDurationMs);
      const claimed = await transaction
        .update(outboxEvents)
        .set({ claimedAt: now, claimExpiresAt, updatedAt: now })
        .where(inArray(outboxEvents.id, ids))
        .returning();
      return claimed as ClaimedOutboxEvent[];
    });
  }

  public async markOutboxDispatched(
    eventId: string,
    now = new Date(),
  ): Promise<boolean> {
    const updated = await this.client
      .update(outboxEvents)
      .set({
        dispatchedAt: now,
        claimedAt: null,
        claimExpiresAt: null,
        dispatchAttempts: sql`${outboxEvents.dispatchAttempts} + 1`,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(eq(outboxEvents.id, eventId), isNull(outboxEvents.dispatchedAt)),
      )
      .returning({ id: outboxEvents.id });
    return updated.length === 1;
  }

  public async releaseOutboxEvent(
    eventId: string,
    errorCode: string,
    retryAt: Date,
    now = new Date(),
  ): Promise<void> {
    await this.client
      .update(outboxEvents)
      .set({
        claimedAt: null,
        claimExpiresAt: null,
        availableAt: retryAt,
        dispatchAttempts: sql`${outboxEvents.dispatchAttempts} + 1`,
        lastError: {
          code: errorCode.slice(0, 100),
          message: "Queue publication failed; the outbox event will retry.",
        },
        updatedAt: now,
      })
      .where(
        and(eq(outboxEvents.id, eventId), isNull(outboxEvents.dispatchedAt)),
      );
  }

  public async requeueStaleJobs(
    limit: number,
    now = new Date(),
  ): Promise<JobRow[]> {
    return inTransaction(this.client, async (transaction) => {
      const stale = await transaction
        .select()
        .from(jobs)
        .where(and(eq(jobs.state, "running"), lte(jobs.leaseExpiresAt, now)))
        .orderBy(asc(jobs.leaseExpiresAt))
        .limit(limit)
        .for("update", { skipLocked: true });
      const requeued: JobRow[] = [];
      for (const staleJob of stale) {
        if (staleLeaseAction(staleJob, now) === "fail") {
          await transaction
            .update(jobs)
            .set({
              state: "failed",
              errorClassification: "retryable",
              errorMetadata: {
                classification: "retryable",
                code: "JOB_LEASE_EXPIRED",
                message:
                  "The job lease expired and its retry limit was reached.",
              },
              completedAt: now,
              leaseExpiresAt: null,
              updatedAt: now,
            })
            .where(and(eq(jobs.id, staleJob.id), eq(jobs.state, "running")));
          continue;
        }
        const [updated] = await transaction
          .update(jobs)
          .set({
            state: "queued",
            heartbeatAt: null,
            leaseExpiresAt: null,
            availableAt: now,
            updatedAt: now,
          })
          .where(and(eq(jobs.id, staleJob.id), eq(jobs.state, "running")))
          .returning();
        if (updated === undefined) continue;
        await transaction
          .insert(outboxEvents)
          .values(
            outboxValues(updated, `job.requeued.attempt-${updated.attempts}`),
          );
        requeued.push(updated);
      }
      return requeued;
    });
  }

  public async retryFailedJob(
    input: AdministrativeJobCommand,
    now = new Date(),
  ): Promise<JobRow | undefined> {
    const command = administrativeJobCommandSchema.parse(input);
    return inTransaction(this.client, async (transaction) => {
      const [updated] = await transaction
        .update(jobs)
        .set({
          state: "queued",
          availableAt: now,
          completedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobs.id, command.jobId),
            eq(jobs.ownerUserId, command.ownerUserId),
            eq(jobs.projectId, command.projectId),
            eq(jobs.state, "failed"),
            eq(jobs.errorClassification, "retryable"),
          ),
        )
        .returning();
      if (updated === undefined) return undefined;
      await transaction
        .insert(outboxEvents)
        .values(
          outboxValues(
            updated,
            `job.admin-retry.attempt-${updated.attempts + 1}`,
          ),
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: updated.ownerUserId,
        projectId: updated.projectId,
        actor: { type: "user", userId: command.actorUserId },
        eventType: "job.admin_retried",
        target: { type: "job", id: updated.id },
        correlationId: command.correlationId,
        metadata: {
          jobType: updated.jobType,
          previousAttempts: updated.attempts,
        },
        occurredAt: now,
      });
      return updated;
    });
  }

  public async cancelJob(
    input: AdministrativeJobCommand,
    now = new Date(),
  ): Promise<boolean> {
    const command = administrativeJobCommandSchema.parse(input);
    return inTransaction(this.client, async (transaction) => {
      const [updated] = await transaction
        .update(jobs)
        .set({
          state: "cancelled",
          errorClassification: "cancelled",
          errorMetadata: {
            classification: "cancelled",
            code: "JOB_CANCELLED",
            message: "The job was cancelled by an administrative command.",
          },
          completedAt: now,
          leaseExpiresAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobs.id, command.jobId),
            eq(jobs.ownerUserId, command.ownerUserId),
            eq(jobs.projectId, command.projectId),
            inArray(jobs.state, ["queued", "retry_wait", "running"]),
          ),
        )
        .returning();
      if (updated === undefined) return false;
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: updated.ownerUserId,
        projectId: updated.projectId,
        actor: { type: "user", userId: command.actorUserId },
        eventType: "job.admin_cancelled",
        target: { type: "job", id: updated.id },
        correlationId: command.correlationId,
        metadata: {
          jobType: updated.jobType,
          attempt: updated.attempts,
        },
        occurredAt: now,
      });
      return true;
    });
  }
}

export async function findJobById(
  executor: DatabaseExecutor,
  identity: ProjectJobIdentity,
): Promise<JobRow | undefined> {
  const [job] = await executor
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, identity.jobId),
        eq(jobs.ownerUserId, identity.ownerUserId),
        eq(jobs.projectId, identity.projectId),
      ),
    )
    .limit(1);
  return job;
}
