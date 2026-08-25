import { createId } from "@avlp/config";
import { describe, expect, it } from "vitest";
import type { ClaimedOutboxEvent } from "./repository.js";
import { OutboxDispatcher, type OutboxRepository } from "./dispatcher.js";

function event(): ClaimedOutboxEvent {
  const now = new Date("2026-08-08T12:00:00.000Z");
  const jobId = createId(now);
  return {
    id: createId(now),
    jobId,
    eventType: "job.requested.v1",
    queueName: "pipeline",
    envelope: {
      schemaVersion: 1,
      payloadVersion: 1,
      jobId,
      jobType: "lesson.generate",
      projectId: createId(now),
      ownerUserId: createId(now),
      inputVersion: "outline-v1",
      idempotencyKey: "lesson.generate:test",
      correlationId: createId(now),
      payload: {},
      requestedAt: now.toISOString(),
    },
    deliveryOptions: { maxAttempts: 3, retryDelayMs: 100 },
    availableAt: now,
    claimedAt: null,
    claimExpiresAt: null,
    dispatchedAt: null,
    dispatchAttempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryOutbox implements OutboxRepository {
  public pending = event();
  public released = 0;

  public async claimOutboxEvents(): Promise<ClaimedOutboxEvent[]> {
    return this.pending.dispatchedAt === null ? [this.pending] : [];
  }

  public async markOutboxDispatched(): Promise<boolean> {
    this.pending = { ...this.pending, dispatchedAt: new Date() };
    return true;
  }

  public async releaseOutboxEvent(): Promise<void> {
    this.released += 1;
  }
}

describe("outbox dispatch and recovery", () => {
  it("keeps a failed publication pending and dispatches it on recovery", async () => {
    const repository = new MemoryOutbox();
    let attempts = 0;
    const observed: string[] = [];
    const dispatcher = new OutboxDispatcher(
      repository,
      {
        publish: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("Redis unavailable");
        },
      },
      {
        telemetry: {
          dispatched: (item) =>
            observed.push(`sent:${item.envelope.correlationId}`),
          failed: (item) =>
            observed.push(`failed:${item.envelope.correlationId}`),
        },
      },
    );

    expect(await dispatcher.dispatchOnce()).toMatchObject({ failed: 1 });
    expect(repository.released).toBe(1);
    expect(repository.pending.dispatchedAt).toBeNull();
    expect(await dispatcher.dispatchOnce()).toMatchObject({ dispatched: 1 });
    expect(attempts).toBe(2);
    expect(observed).toEqual([
      `failed:${repository.pending.envelope.correlationId}`,
      `sent:${repository.pending.envelope.correlationId}`,
    ]);
  });

  it("isolates telemetry failures from successful dispatch", async () => {
    const repository = new MemoryOutbox();
    const dispatcher = new OutboxDispatcher(
      repository,
      { publish: () => Promise.resolve() },
      {
        telemetry: {
          dispatched: () => {
            throw new Error("collector unavailable");
          },
          failed: () => undefined,
        },
      },
    );

    await expect(dispatcher.dispatchOnce()).resolves.toMatchObject({
      dispatched: 1,
      failed: 0,
    });
  });
});
