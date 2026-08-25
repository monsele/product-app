import { createId } from "@avlp/config";
import {
  correlationIdFromHeader,
  currentCorrelationId,
  type JobMetricContext,
  type JobTelemetry,
} from "@avlp/observability";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createJobEnvelope,
  executeJobDelivery,
  JobExecutionError,
  type JobErrorMetadata,
} from "./index.js";
import type {
  JobExecutionRepository,
  JobLease,
  JobRow,
  ProjectJobIdentity,
} from "./repository.js";

function queuedJob(): JobRow {
  const now = new Date("2026-08-08T12:00:00.000Z");
  return {
    id: createId(now),
    jobType: "lesson.generate",
    queueName: "pipeline",
    projectId: createId(now),
    ownerUserId: createId(now),
    inputVersion: "outline-v1",
    idempotencyKey: "lesson.generate:test",
    correlationId: createId(now),
    payloadVersion: 1,
    payload: { outlineVersion: "outline-v1" },
    state: "queued",
    progress: 0,
    attempts: 0,
    maxAttempts: 3,
    retryDelayMs: 10,
    availableAt: now,
    startedAt: null,
    completedAt: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    resultMetadata: null,
    errorClassification: null,
    errorMetadata: null,
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryJobRepository implements JobExecutionRepository {
  public job = queuedJob();
  public readonly progressReports: number[] = [];

  public async claimJob(
    identity: ProjectJobIdentity,
  ): Promise<JobRow | undefined> {
    if (
      identity.jobId !== this.job.id ||
      identity.ownerUserId !== this.job.ownerUserId ||
      identity.projectId !== this.job.projectId
    )
      return undefined;
    if (this.job.state !== "queued" && this.job.state !== "retry_wait")
      return undefined;
    this.job = {
      ...this.job,
      state: "running",
      attempts: this.job.attempts + 1,
    };
    return this.job;
  }

  public async heartbeat(lease: JobLease): Promise<boolean> {
    return this.job.state === "running" && this.job.attempts === lease.attempt;
  }

  public async reportProgress(
    lease: JobLease,
    progress: number,
  ): Promise<boolean> {
    if (this.job.state !== "running" || this.job.attempts !== lease.attempt)
      return false;
    this.job = { ...this.job, progress };
    this.progressReports.push(progress);
    return true;
  }

  public async completeJob(
    lease: JobLease,
    result: Record<string, string>,
  ): Promise<boolean> {
    if (this.job.state !== "running" || this.job.attempts !== lease.attempt)
      return false;
    this.job = {
      ...this.job,
      state: "succeeded",
      progress: 1,
      resultMetadata: result,
    };
    return true;
  }

  public async recordFailure(
    lease: JobLease,
    error: JobErrorMetadata,
  ): Promise<JobRow | undefined> {
    if (this.job.state !== "running" || this.job.attempts !== lease.attempt)
      return undefined;
    const willRetry =
      error.classification === "retryable" &&
      this.job.attempts < this.job.maxAttempts;
    this.job = {
      ...this.job,
      state: willRetry ? "retry_wait" : "failed",
      errorClassification: error.classification,
      errorMetadata: error,
    };
    return this.job;
  }

  public async findJob(): Promise<JobRow> {
    return this.job;
  }
}

function envelopeFor(job: JobRow) {
  return createJobEnvelope(z.object({ outlineVersion: z.string() }), {
    payloadVersion: 1,
    jobId: job.id,
    jobType: job.jobType,
    projectId: job.projectId,
    ownerUserId: job.ownerUserId,
    inputVersion: job.inputVersion,
    idempotencyKey: job.idempotencyKey,
    correlationId: job.correlationId,
    payload: { outlineVersion: "outline-v1" },
  });
}

describe("worker delivery contract", () => {
  it("propagates one request correlation ID through the envelope and worker telemetry", async () => {
    const repository = new MemoryJobRepository();
    const requestCorrelationId = correlationIdFromHeader(createId());
    repository.job = { ...repository.job, correlationId: requestCorrelationId };
    const observed: JobMetricContext[] = [];
    const telemetry: JobTelemetry = {
      started: (context) => observed.push(context),
      completed: (context) => observed.push(context),
    };
    let handlerCorrelationId: string | undefined;
    let ambientCorrelationId: string | undefined;

    await expect(
      executeJobDelivery({
        rawEnvelope: envelopeFor(repository.job),
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository,
        telemetry,
        handler: async (_payload, context) => {
          handlerCorrelationId = context.correlationId;
          ambientCorrelationId = currentCorrelationId();
          await context.reportProgress(0.5);
          return { artifactVersion: "lesson-v1" };
        },
      }),
    ).resolves.toBe("succeeded");

    expect(handlerCorrelationId).toBe(requestCorrelationId);
    expect(ambientCorrelationId).toBe(requestCorrelationId);
    expect(observed).toHaveLength(2);
    expect(
      observed.every((item) => item.correlationId === requestCorrelationId),
    ).toBe(true);
    expect(
      observed.every((item) => item.projectId === repository.job.projectId),
    ).toBe(true);
    expect(repository.progressReports).toEqual([0.5]);
    expect(repository.job.progress).toBe(1);
  });

  it("executes side effects once when the same delivery is duplicated", async () => {
    const repository = new MemoryJobRepository();
    const envelope = envelopeFor(repository.job);
    let sideEffects = 0;
    const deliver = () =>
      executeJobDelivery({
        rawEnvelope: envelope,
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository,
        handler: async () => {
          sideEffects += 1;
          return { artifactVersion: "lesson-v1" };
        },
      });

    expect(await deliver()).toBe("succeeded");
    expect(await deliver()).toBe("duplicate");
    expect(sideEffects).toBe(1);
  });

  it("retries retryable failures but terminates declared terminal failures", async () => {
    const retryRepository = new MemoryJobRepository();
    await expect(
      executeJobDelivery({
        rawEnvelope: envelopeFor(retryRepository.job),
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository: retryRepository,
        handler: async () => {
          throw new Error("temporary provider failure");
        },
      }),
    ).rejects.toThrow("will be retried");
    expect(retryRepository.job.state).toBe("retry_wait");

    const terminalRepository = new MemoryJobRepository();
    await expect(
      executeJobDelivery({
        rawEnvelope: envelopeFor(terminalRepository.job),
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository: terminalRepository,
        handler: async () => {
          throw new JobExecutionError(
            "terminal",
            "UNSUPPORTED_INPUT",
            "Input is unsupported.",
          );
        },
      }),
    ).resolves.toBe("failed");
    expect(terminalRepository.job.state).toBe("failed");
  });

  it("records a malformed versioned payload as a terminal job failure", async () => {
    const repository = new MemoryJobRepository();
    repository.job = {
      ...repository.job,
      payload: { outlineVersion: 42 },
    };
    const envelope = envelopeFor(repository.job);
    await expect(
      executeJobDelivery({
        rawEnvelope: envelope,
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository,
        handler: async () => ({ artifactVersion: "unreachable" }),
      }),
    ).resolves.toBe("failed");
    expect(repository.job).toMatchObject({
      state: "failed",
      errorClassification: "terminal",
    });
  });

  it("uses the authoritative database payload instead of queue payload data", async () => {
    const repository = new MemoryJobRepository();
    const envelope = envelopeFor(repository.job);
    let receivedPayload: { outlineVersion: string } | undefined;

    await expect(
      executeJobDelivery({
        rawEnvelope: {
          ...envelope,
          payload: { outlineVersion: "tampered-queue-value" },
        },
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository,
        handler: async (payload) => {
          receivedPayload = payload;
          return { artifactVersion: "lesson-v1" };
        },
      }),
    ).resolves.toBe("succeeded");
    expect(receivedPayload).toEqual({ outlineVersion: "outline-v1" });
  });

  it("ignores a queue envelope with mismatched tenant identity", async () => {
    const repository = new MemoryJobRepository();
    const envelope = envelopeFor(repository.job);
    let invoked = false;

    await expect(
      executeJobDelivery({
        rawEnvelope: { ...envelope, ownerUserId: createId() },
        queueName: "pipeline",
        payloadSchema: z.object({ outlineVersion: z.string() }),
        repository,
        handler: async () => {
          invoked = true;
          return {};
        },
      }),
    ).resolves.toBe("duplicate");
    expect(invoked).toBe(false);
    expect(repository.job).toMatchObject({ state: "queued", attempts: 0 });
  });
});
