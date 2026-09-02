import { waitForPoll } from "./poll.js";
import type { JobRow, StaleLeaseSweep } from "./repository.js";
import type { StructuredLogger } from "@avlp/observability";

export interface StaleJobRepository {
  requeueStaleJobs(limit: number, now?: Date): Promise<StaleLeaseSweep>;
}

export interface StaleJobTelemetry {
  requeued(job: JobRow): void;
  abandoned(job: JobRow): void;
}

export class StructuredStaleJobTelemetry implements StaleJobTelemetry {
  public constructor(private readonly logger: StructuredLogger) {}

  public requeued(job: JobRow): void {
    this.logger.warn("job.lease_expired_requeued", jobLogFields(job));
  }

  public abandoned(job: JobRow): void {
    this.logger.error("job.lease_expired_abandoned", jobLogFields(job));
  }
}

function jobLogFields(job: JobRow) {
  return {
    jobId: job.id,
    jobType: job.jobType,
    projectId: job.projectId,
    correlationId: job.correlationId,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
  };
}

/**
 * Recovers jobs whose worker died mid-flight. A crashed, restarted, or
 * redeployed worker leaves its claimed jobs in `running` with a lease nothing
 * renews; without this sweep those jobs are never picked up again and the
 * surfaces waiting on them wait forever.
 */
export class StaleJobReaper {
  public constructor(
    private readonly repository: StaleJobRepository,
    private readonly options: {
      batchSize?: number;
      telemetry?: StaleJobTelemetry;
    } = {},
  ) {}

  public async reapOnce(now = new Date()): Promise<StaleLeaseSweep> {
    const sweep = await this.repository.requeueStaleJobs(
      this.options.batchSize ?? 25,
      now,
    );
    for (const job of sweep.requeued)
      safelyNotify(() => this.options.telemetry?.requeued(job));
    for (const job of sweep.failed)
      safelyNotify(() => this.options.telemetry?.abandoned(job));
    return sweep;
  }
}

function safelyNotify(notification: () => void): void {
  try {
    notification();
  } catch {
    // Diagnostic telemetry must not alter lease recovery behavior.
  }
}

export async function runStaleJobReaper(
  reaper: StaleJobReaper,
  options: {
    signal: AbortSignal;
    pollIntervalMs?: number;
    onCycleError?: (error: unknown) => void;
  },
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 15_000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 1_000)
    throw new TypeError(
      "Stale job reaper interval must be at least 1000 milliseconds.",
    );
  while (!options.signal.aborted) {
    try {
      await reaper.reapOnce();
    } catch (error) {
      options.onCycleError?.(error);
    }
    await waitForPoll(pollIntervalMs, options.signal);
  }
}
