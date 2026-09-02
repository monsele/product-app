import { waitForPoll } from "./poll.js";
import type { ClaimedOutboxEvent } from "./repository.js";
import type { StructuredLogger } from "@avlp/observability";

export interface OutboxRepository {
  claimOutboxEvents(
    limit: number,
    leaseDurationMs: number,
    now?: Date,
  ): Promise<ClaimedOutboxEvent[]>;
  markOutboxDispatched(eventId: string, now?: Date): Promise<boolean>;
  releaseOutboxEvent(
    eventId: string,
    errorCode: string,
    retryAt: Date,
    now?: Date,
  ): Promise<void>;
}

export interface JobPublisher {
  publish(event: ClaimedOutboxEvent): Promise<void>;
}

export interface OutboxTelemetry {
  dispatched(event: ClaimedOutboxEvent): void;
  failed(event: ClaimedOutboxEvent): void;
}

export class StructuredOutboxTelemetry implements OutboxTelemetry {
  public constructor(private readonly logger: StructuredLogger) {}

  public dispatched(event: ClaimedOutboxEvent): void {
    this.logger.info("queue.job_dispatched", eventLogFields(event));
  }

  public failed(event: ClaimedOutboxEvent): void {
    this.logger.warn("queue.dispatch_failed", eventLogFields(event));
  }
}

function eventLogFields(event: ClaimedOutboxEvent) {
  return {
    outboxEventId: event.id,
    jobId: event.envelope.jobId,
    projectId: event.envelope.projectId,
    correlationId: event.envelope.correlationId,
    queueName: event.queueName,
  };
}

export type DispatchResult = {
  claimed: number;
  dispatched: number;
  failed: number;
};

export class OutboxDispatcher {
  public constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: JobPublisher,
    private readonly options: {
      batchSize?: number;
      claimLeaseMs?: number;
      failureDelayMs?: number;
      telemetry?: OutboxTelemetry;
    } = {},
  ) {}

  public async dispatchOnce(now = new Date()): Promise<DispatchResult> {
    const events = await this.repository.claimOutboxEvents(
      this.options.batchSize ?? 25,
      this.options.claimLeaseMs ?? 30_000,
      now,
    );
    let dispatched = 0;
    let failed = 0;
    for (const event of events) {
      try {
        await this.publisher.publish(event);
        if (await this.repository.markOutboxDispatched(event.id, now)) {
          dispatched += 1;
          safelyNotify(() => this.options.telemetry?.dispatched(event));
        }
      } catch {
        failed += 1;
        safelyNotify(() => this.options.telemetry?.failed(event));
        await this.repository.releaseOutboxEvent(
          event.id,
          "QUEUE_PUBLISH_FAILED",
          new Date(now.getTime() + (this.options.failureDelayMs ?? 5_000)),
          now,
        );
      }
    }
    return { claimed: events.length, dispatched, failed };
  }
}

function safelyNotify(notification: () => void): void {
  try {
    notification();
  } catch {
    // Diagnostic telemetry must not alter outbox delivery behavior.
  }
}

export async function runOutboxDispatcher(
  dispatcher: OutboxDispatcher,
  options: {
    signal: AbortSignal;
    pollIntervalMs?: number;
    onCycleError?: (error: unknown) => void;
  },
): Promise<void> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 10)
    throw new TypeError(
      "Outbox poll interval must be at least 10 milliseconds.",
    );
  while (!options.signal.aborted) {
    try {
      await dispatcher.dispatchOnce();
    } catch (error) {
      options.onCycleError?.(error);
    }
    await waitForPoll(pollIntervalMs, options.signal);
  }
}
