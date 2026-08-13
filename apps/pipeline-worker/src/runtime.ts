import {
  databaseEnvironmentSchema,
  parseWorkerEnvironment,
  redisEnvironmentSchema,
  storageEnvironmentSchema,
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
import {
  createS3CompatibleObjectStorage,
  type ObjectStorage,
} from "@avlp/storage";
import { z } from "zod";
import { health } from "./health.js";
import { createProjectCleanupJobHandler } from "./project-cleanup.js";

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

async function createStorage(
  environmentInput: Record<string, string | undefined>,
): Promise<ObjectStorage> {
  const environment = storageEnvironmentSchema
    .and(z.object({ OBJECT_STORAGE_BUCKET: z.string().min(1) }))
    .parse(environmentInput);
  return createS3CompatibleObjectStorage({
    allowedPrefix: "users",
    allowedUploadContentTypes: ["application/octet-stream"],
    allowInsecureEndpoint: environment.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
    bucket: environment.OBJECT_STORAGE_BUCKET,
    ...(environment.OBJECT_STORAGE_ACCESS_KEY === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
            secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY!,
          },
        }),
    ...(environment.OBJECT_STORAGE_ENDPOINT === undefined
      ? {}
      : { endpoint: environment.OBJECT_STORAGE_ENDPOINT }),
    forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
    maxUploadBytes: environment.MAX_UPLOAD_BYTES,
    defaultSignedUrlTtlSeconds: environment.SIGNED_URL_TTL_SECONDS,
    region: environment.OBJECT_STORAGE_REGION,
    runtimeEnvironment: environment.NODE_ENV,
  });
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
    storageFactory?: () => Promise<ObjectStorage>;
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
    const handlers = options.handlers ?? [
      createProjectCleanupJobHandler({
        database: database.client,
        storage: await (options.storageFactory?.() ??
          createStorage(environmentInput)),
      }),
    ];
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
