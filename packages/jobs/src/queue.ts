import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import {
  deliveryOptionsSchema,
  jobEnvelopeSchema,
  queueNameSchema,
  type JobEnvelope,
  type QueueName,
} from "./contracts.js";
import type { JobPublisher } from "./dispatcher.js";
import type { ClaimedOutboxEvent } from "./repository.js";
import { z } from "zod";

export function redisConnectionFromUrl(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:")
    throw new TypeError("Queue connection URL must use Redis.");
  const databasePath = parsed.pathname.slice(1);
  const database = databasePath === "" ? 0 : Number(databasePath);
  if (!Number.isInteger(database) || database < 0)
    throw new TypeError("Redis database must be a non-negative integer.");
  const port = parsed.port === "" ? 6379 : Number(parsed.port);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new TypeError("Redis port must be between 1 and 65535.");
  return {
    host: parsed.hostname,
    port,
    db: database,
    maxRetriesPerRequest: null,
    ...(parsed.username === ""
      ? {}
      : { username: decodeURIComponent(parsed.username) }),
    ...(parsed.password === ""
      ? {}
      : { password: decodeURIComponent(parsed.password) }),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export class BullMqJobPublisher implements JobPublisher {
  private readonly queues = new Map<QueueName, Queue<JobEnvelope<unknown>>>();

  public constructor(private readonly connection: ConnectionOptions) {}

  private queue(queueName: QueueName): Queue<JobEnvelope<unknown>> {
    const existing = this.queues.get(queueName);
    if (existing !== undefined) return existing;
    const queue = new Queue<JobEnvelope<unknown>>(queueName, {
      connection: this.connection,
    });
    this.queues.set(queueName, queue);
    return queue;
  }

  public async publish(event: ClaimedOutboxEvent): Promise<void> {
    const queueName = queueNameSchema.parse(event.queueName);
    const envelope = jobEnvelopeSchema(z.unknown()).parse(
      event.envelope,
    ) as JobEnvelope<unknown>;
    const delivery = deliveryOptionsSchema.parse(event.deliveryOptions);
    const options: JobsOptions = {
      jobId: event.id,
      attempts: delivery.maxAttempts,
      backoff: { type: "fixed", delay: delivery.retryDelayMs },
      removeOnComplete: false,
      removeOnFail: false,
    };
    await this.queue(queueName).add(envelope.jobType, envelope, options);
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}
