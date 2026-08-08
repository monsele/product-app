import {
  databaseEnvironmentSchema,
  parseWorkerEnvironment,
  redisEnvironmentSchema,
} from "@avlp/config";
import { createDatabaseConnection } from "@avlp/database";
import {
  BullMqJobPublisher,
  OutboxDispatcher,
  PostgresJobRepository,
  redisConnectionFromUrl,
  registerJobConsumer,
  runOutboxDispatcher,
  StructuredOutboxTelemetry,
  type RegisteredJobHandler,
  type JobPublisher,
} from "@avlp/jobs";
import {
  createStructuredLogger,
  OpenTelemetryJobTelemetry,
  type StructuredLogger,
} from "@avlp/observability";
import { health } from "./health.js";

function processAbortSignal(): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  return {
    signal: controller.signal,
    dispose: () => {
      process.removeListener("SIGINT", abort);
      process.removeListener("SIGTERM", abort);
    },
  };
}

export async function runPipelineWorker(
  environmentInput: Record<string, string | undefined>,
  options: {
    signal?: AbortSignal;
    logger?: StructuredLogger;
    handlers?: readonly RegisteredJobHandler[];
    publisherFactory?: (
      connection: ReturnType<typeof redisConnectionFromUrl>,
    ) => JobPublisher & { close: () => Promise<void> };
    consumerFactory?: (input: Parameters<typeof registerJobConsumer>[0]) => {
      on: (event: "error", listener: () => void) => unknown;
      close: () => Promise<void>;
    };
  } = {},
): Promise<void> {
  parseWorkerEnvironment(environmentInput);
  const databaseEnvironment = databaseEnvironmentSchema.parse(environmentInput);
  const redisEnvironment = redisEnvironmentSchema.parse(environmentInput);
  const logger =
    options.logger ?? createStructuredLogger({ service: "pipeline-worker" });
  const processSignal =
    options.signal === undefined ? processAbortSignal() : undefined;
  const signal = options.signal ?? processSignal!.signal;
  const handlers = options.handlers ?? [];
  const database = createDatabaseConnection(databaseEnvironment.DATABASE_URL);
  const repository = new PostgresJobRepository(database.client);
  const connection = redisConnectionFromUrl(redisEnvironment.REDIS_URL);
  let publisher: (JobPublisher & { close: () => Promise<void> }) | undefined;
  let consumer:
    | {
        on: (event: "error", listener: () => void) => unknown;
        close: () => Promise<void>;
      }
    | undefined;

  try {
    await database.healthCheck();
    publisher =
      options.publisherFactory?.(connection) ??
      new BullMqJobPublisher(connection);
    const jobTelemetry = new OpenTelemetryJobTelemetry(
      logger,
      undefined,
      handlers.map((handler) => handler.jobType),
    );
    const consumerInput: Parameters<typeof registerJobConsumer>[0] = {
      queueName: "pipeline",
      connection,
      repository,
      handlers,
      telemetry: jobTelemetry,
    };
    consumer =
      options.consumerFactory?.(consumerInput) ??
      registerJobConsumer(consumerInput);
    consumer.on("error", () => {
      logger.error("worker.consumer_failed", { queueName: "pipeline" });
    });
    const dispatcher = new OutboxDispatcher(repository, publisher, {
      telemetry: new StructuredOutboxTelemetry(logger),
    });
    logger.info("worker.started", health());
    await runOutboxDispatcher(dispatcher, {
      signal,
      onCycleError: () =>
        logger.error("queue.dispatch_cycle_failed", {
          queueName: "all",
        }),
    });
  } finally {
    processSignal?.dispose();
    const shutdown = await Promise.allSettled([
      consumer?.close() ?? Promise.resolve(),
      publisher?.close() ?? Promise.resolve(),
      database.close(),
    ]);
    if (shutdown.some((result) => result.status === "rejected"))
      logger.error("worker.shutdown_failed", { service: "pipeline-worker" });
  }
}
