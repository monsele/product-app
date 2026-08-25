import {
  metrics,
  type Counter,
  type Histogram,
  type Meter,
} from "@opentelemetry/api";
import type { Identifier } from "@avlp/config";
import { z } from "zod";
import type { StructuredLogger } from "./logging.js";

const jobStateLabelSchema = z.enum([
  "succeeded",
  "failed",
  "cancelled",
  "duplicate",
  "retry_wait",
]);
const jobErrorLabelSchema = z.enum([
  "none",
  "retryable",
  "terminal",
  "cancelled",
]);

export type JobMetricContext = {
  jobId: Identifier;
  jobType: string;
  projectId: Identifier;
  correlationId: Identifier;
  attempt: number;
  startedAt: number;
};

export interface JobTelemetry {
  started(context: JobMetricContext): void;
  completed(
    context: JobMetricContext,
    result: {
      state: "succeeded" | "failed" | "cancelled" | "duplicate" | "retry_wait";
      errorClassification?: "retryable" | "terminal" | "cancelled";
    },
  ): void;
}

const boundedJobTypeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);

export function boundedJobTypeLabel(
  jobType: string,
  allowedJobTypes: ReadonlySet<string>,
): string {
  return boundedJobTypeSchema.safeParse(jobType).success &&
    allowedJobTypes.has(jobType)
    ? jobType
    : "unknown";
}

export class OpenTelemetryJobTelemetry implements JobTelemetry {
  private readonly startedCounter: Counter;
  private readonly completedCounter: Counter;
  private readonly retryCounter: Counter;
  private readonly duration: Histogram;
  private readonly allowedJobTypes: ReadonlySet<string>;

  public constructor(
    private readonly logger: StructuredLogger,
    meter: Meter = metrics.getMeter("@avlp/jobs"),
    allowedJobTypes: readonly string[] = [],
  ) {
    this.allowedJobTypes = new Set(
      allowedJobTypes.map((jobType) => boundedJobTypeSchema.parse(jobType)),
    );
    this.startedCounter = meter.createCounter("avlp.job.started");
    this.completedCounter = meter.createCounter("avlp.job.completed");
    this.retryCounter = meter.createCounter("avlp.job.retry");
    this.duration = meter.createHistogram("avlp.job.duration", { unit: "ms" });
  }

  public started(context: JobMetricContext): void {
    const labels = {
      job_type: boundedJobTypeLabel(context.jobType, this.allowedJobTypes),
    };
    this.startedCounter.add(1, labels);
    if (context.attempt > 1) this.retryCounter.add(1, labels);
    this.logger.info("job.started", {
      jobId: context.jobId,
      jobType: context.jobType,
      projectId: context.projectId,
      correlationId: context.correlationId,
      attempt: context.attempt,
    });
  }

  public completed(
    context: JobMetricContext,
    result: {
      state: "succeeded" | "failed" | "cancelled" | "duplicate" | "retry_wait";
      errorClassification?: "retryable" | "terminal" | "cancelled";
    },
  ): void {
    const state = jobStateLabelSchema.parse(result.state);
    const errorClassification = jobErrorLabelSchema.parse(
      result.errorClassification ?? "none",
    );
    const labels = {
      job_type: boundedJobTypeLabel(context.jobType, this.allowedJobTypes),
      state,
      error_classification: errorClassification,
    };
    const durationMs = Math.max(0, Date.now() - context.startedAt);
    this.completedCounter.add(1, labels);
    this.duration.record(durationMs, labels);
    this.logger.info("job.completed", {
      jobId: context.jobId,
      jobType: context.jobType,
      projectId: context.projectId,
      correlationId: context.correlationId,
      attempt: context.attempt,
      status: state,
      errorClassification,
      durationMs,
    });
  }
}
