import { clearInterval, setInterval } from "node:timers";
import { identifierSchema } from "@avlp/config";
import {
  withCorrelationContext,
  type JobMetricContext,
  type JobTelemetry,
} from "@avlp/observability";
import { Worker, type ConnectionOptions } from "bullmq";
import { z, type ZodType } from "zod";
import {
  jobEnvelopeSchema,
  jobMetadataSchema,
  jobTypeSchema,
  payloadVersionSchema,
  queueNameSchema,
  retryPolicySchema,
  type JobEnvelope,
  type JobMetadata,
  type QueueName,
  type RetryPolicy,
} from "./contracts.js";
import { classifyJobError, JobExecutionError } from "./errors.js";
import type { JobExecutionRepository, JobLease, JobRow } from "./repository.js";

export type JobHandlerContext = {
  jobId: JobEnvelope<unknown>["jobId"];
  projectId: JobEnvelope<unknown>["projectId"];
  ownerUserId: JobEnvelope<unknown>["ownerUserId"];
  correlationId: JobEnvelope<unknown>["correlationId"];
  idempotencyKey: string;
  attempt: number;
  heartbeat: () => Promise<void>;
};

export type JobHandler<T> = (
  payload: T,
  context: JobHandlerContext,
) => Promise<JobMetadata>;

export type DeliveryOutcome =
  "succeeded" | "failed" | "cancelled" | "duplicate";

class RetryDeliveryError extends Error {
  public constructor() {
    super("Job delivery will be retried.");
    this.name = "RetryDeliveryError";
  }
}

function assertEnvelopeMatchesClaimedJob(
  envelope: JobEnvelope<unknown>,
  claimed: JobRow,
  queueName: QueueName,
): void {
  if (
    queueName !== claimed.queueName ||
    envelope.jobType !== claimed.jobType ||
    envelope.projectId !== claimed.projectId ||
    envelope.ownerUserId !== claimed.ownerUserId ||
    envelope.inputVersion !== claimed.inputVersion ||
    envelope.idempotencyKey !== claimed.idempotencyKey ||
    envelope.correlationId !== claimed.correlationId ||
    envelope.payloadVersion !== claimed.payloadVersion
  )
    throw new JobExecutionError(
      "terminal",
      "JOB_ENVELOPE_MISMATCH",
      "The queue envelope does not match the authoritative job record.",
    );
}

export async function executeJobDelivery<T>(input: {
  rawEnvelope: unknown;
  queueName: QueueName;
  payloadSchema: ZodType<T>;
  repository: JobExecutionRepository;
  handler: JobHandler<T>;
  retryPolicy?: Partial<RetryPolicy>;
  telemetry?: JobTelemetry;
}): Promise<DeliveryOutcome> {
  const baseEnvelope = jobEnvelopeSchema(z.unknown()).parse(
    input.rawEnvelope,
  ) as JobEnvelope<unknown>;
  const policy = retryPolicySchema.parse(input.retryPolicy ?? {});
  const claimed = await input.repository.claimJob(
    {
      jobId: baseEnvelope.jobId,
      ownerUserId: baseEnvelope.ownerUserId,
      projectId: baseEnvelope.projectId,
    },
    policy.leaseDurationMs,
  );
  if (claimed === undefined) return "duplicate";
  const lease: JobLease = {
    jobId: identifierSchema.parse(claimed.id),
    attempt: claimed.attempts,
  };
  const metricContext: JobMetricContext = {
    jobId: lease.jobId,
    jobType: claimed.jobType,
    projectId: identifierSchema.parse(claimed.projectId),
    correlationId: identifierSchema.parse(claimed.correlationId),
    attempt: claimed.attempts,
    startedAt: Date.now(),
  };
  safelyNotifyTelemetry(() => input.telemetry?.started(metricContext));

  let leaseIssue: "lost" | "update_failed" | undefined;
  let heartbeatInFlight = Promise.resolve();
  const renewLease = () => {
    heartbeatInFlight = heartbeatInFlight
      .then(async () => {
        if (leaseIssue !== undefined) return;
        const renewed = await input.repository.heartbeat(
          lease,
          policy.leaseDurationMs,
        );
        if (!renewed) leaseIssue = "lost";
      })
      .catch(() => {
        leaseIssue = "update_failed";
      });
  };
  const heartbeatTimer = setInterval(
    renewLease,
    Math.max(250, Math.floor(policy.leaseDurationMs / 3)),
  );
  heartbeatTimer.unref();

  try {
    assertEnvelopeMatchesClaimedJob(baseEnvelope, claimed, input.queueName);
    const payload = input.payloadSchema.parse(claimed.payload);
    const projectId = identifierSchema.parse(claimed.projectId);
    const ownerUserId = identifierSchema.parse(claimed.ownerUserId);
    const correlationId = identifierSchema.parse(claimed.correlationId);
    const result = jobMetadataSchema.parse(
      await withCorrelationContext({ correlationId }, () =>
        input.handler(payload, {
          jobId: lease.jobId,
          projectId,
          ownerUserId,
          correlationId,
          idempotencyKey: claimed.idempotencyKey,
          attempt: claimed.attempts,
          heartbeat: async () => {
            const renewed = await input.repository.heartbeat(
              lease,
              policy.leaseDurationMs,
            );
            if (!renewed)
              throw new JobExecutionError(
                "cancelled",
                "JOB_LEASE_LOST",
                "The job lease is no longer active.",
              );
          },
        }),
      ),
    );
    clearInterval(heartbeatTimer);
    await heartbeatInFlight;
    if (leaseIssue === "update_failed")
      throw new JobExecutionError(
        "retryable",
        "HEARTBEAT_UPDATE_FAILED",
        "The worker could not renew the job lease.",
      );
    if (leaseIssue === "lost")
      throw new JobExecutionError(
        "cancelled",
        "JOB_LEASE_LOST",
        "The job lease is no longer active.",
      );
    const outcome = (await input.repository.completeJob(lease, result))
      ? "succeeded"
      : "duplicate";
    safelyNotifyTelemetry(() =>
      input.telemetry?.completed(metricContext, { state: outcome }),
    );
    return outcome;
  } catch (error) {
    const classified = classifyJobError(error);
    const updated = await input.repository.recordFailure(
      lease,
      classified,
      policy.retryDelayMs,
    );
    if (updated?.state === "retry_wait") {
      safelyNotifyTelemetry(() =>
        input.telemetry?.completed(metricContext, {
          state: "retry_wait",
          errorClassification: classified.classification,
        }),
      );
      throw new RetryDeliveryError();
    }
    const outcome =
      updated?.state === "cancelled"
        ? "cancelled"
        : updated === undefined
          ? "duplicate"
          : "failed";
    safelyNotifyTelemetry(() =>
      input.telemetry?.completed(metricContext, {
        state: outcome,
        errorClassification: classified.classification,
      }),
    );
    return outcome;
  } finally {
    clearInterval(heartbeatTimer);
  }
}

function safelyNotifyTelemetry(notification: () => void): void {
  try {
    notification();
  } catch {
    // Diagnostic telemetry must not alter authoritative job processing.
  }
}

export type RegisteredJobHandler = {
  jobType: string;
  payloadVersion: number;
  payloadSchema: ZodType<unknown>;
  handler: JobHandler<unknown>;
  retryPolicy?: Partial<RetryPolicy>;
};

export function defineJobHandler<T>(
  jobType: string,
  payloadVersion: number,
  payloadSchema: ZodType<T>,
  handler: JobHandler<T>,
  retryPolicy?: Partial<RetryPolicy>,
): RegisteredJobHandler {
  return {
    jobType: jobTypeSchema.parse(jobType),
    payloadVersion: payloadVersionSchema.parse(payloadVersion),
    payloadSchema: z.unknown(),
    handler: async (payload, context) =>
      handler(payloadSchema.parse(payload), context),
    ...(retryPolicy === undefined ? {} : { retryPolicy }),
  };
}

export function registerJobConsumer(input: {
  queueName: QueueName;
  connection: ConnectionOptions;
  repository: JobExecutionRepository;
  handlers: readonly RegisteredJobHandler[];
  concurrency?: number;
  telemetry?: JobTelemetry;
}): Worker<JobEnvelope<unknown>, DeliveryOutcome> {
  const queueName = queueNameSchema.parse(input.queueName);
  const registrations = new Map<string, RegisteredJobHandler>();
  for (const registration of input.handlers) {
    const key = `${registration.jobType}:v${registration.payloadVersion}`;
    if (registrations.has(key))
      throw new TypeError(`Duplicate worker registration for ${key}.`);
    registrations.set(key, registration);
  }
  return new Worker<JobEnvelope<unknown>, DeliveryOutcome>(
    queueName,
    async (delivery) => {
      const envelope = jobEnvelopeSchema(z.unknown()).parse(
        delivery.data,
      ) as JobEnvelope<unknown>;
      const registration = registrations.get(
        `${envelope.jobType}:v${envelope.payloadVersion}`,
      );
      const unregistered: RegisteredJobHandler = {
        jobType: envelope.jobType,
        payloadVersion: envelope.payloadVersion,
        payloadSchema: z.unknown(),
        handler: async () => {
          throw new JobExecutionError(
            "terminal",
            "JOB_TYPE_UNREGISTERED",
            "No worker handler is registered for this job type.",
          );
        },
      };
      const selected = registration ?? unregistered;
      return executeJobDelivery({
        rawEnvelope: delivery.data,
        queueName,
        payloadSchema: selected.payloadSchema,
        repository: input.repository,
        handler: selected.handler,
        ...(input.telemetry === undefined
          ? {}
          : { telemetry: input.telemetry }),
        ...(selected.retryPolicy === undefined
          ? {}
          : { retryPolicy: selected.retryPolicy }),
      });
    },
    {
      connection: input.connection,
      concurrency: input.concurrency ?? 1,
    },
  );
}

export const unknownPayloadSchema = z.unknown();
