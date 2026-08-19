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
import { HttpMalwareScanner } from "./document-validation.js";
import { createDocumentValidationCleanupJobHandler } from "./document-validation-cleanup-job.js";
import { createDocumentValidationJobHandler } from "./document-validation-job.js";
import { HttpDoclingIngestionClient } from "./docling-ingestion-client.js";
import { createDocumentIngestionJobHandler } from "./document-ingestion-job.js";
import {
  mockPricing,
  MockLanguageModelProvider,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import {
  PostgresGenerationQuotaGuard,
} from "./model-call.js";
import { createObjectivesGenerationJobHandler } from "./objectives-job.js";
import { createOutlineGenerationJobHandler } from "./outline-job.js";
import { createNarrationGenerationJobHandler } from "./narration-job.js";

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
  const workerEnvironment = parseWorkerEnvironment(environmentInput);
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
    let handlers = options.handlers;
    if (handlers === undefined) {
      const storage = await (options.storageFactory?.() ??
        createStorage(environmentInput));
      handlers = [
        createDocumentValidationJobHandler({
          database: database.client,
          storage,
          scanner: new HttpMalwareScanner(
            workerEnvironment.MALWARE_SCANNER_URL,
            workerEnvironment.MALWARE_SCANNER_TOKEN,
          ),
          maxUploadBytes:
            storageEnvironmentSchema.parse(environmentInput).MAX_UPLOAD_BYTES,
        }),
        createDocumentIngestionJobHandler({
          database: database.client,
          storage,
          client: new HttpDoclingIngestionClient(
            workerEnvironment.INGESTION_SERVICE_URL ?? "http://127.0.0.1:8000",
            workerEnvironment.INGESTION_SERVICE_TOKEN,
          ),
        }),
        createDocumentValidationCleanupJobHandler({
          database: database.client,
          storage,
        }),
        createProjectCleanupJobHandler({ database: database.client, storage }),
        createObjectivesGenerationJobHandler({
          database: database.client,
          provider: new MockLanguageModelProvider(),
          promptRegistry: new StaticPromptRegistry(repositoryPrompts),
          quotaGuard: new PostgresGenerationQuotaGuard(database.client, {
            "ai.objectives": { maxCallsPerHour: 20 },
          }),
          pricing: mockPricing,
        }),
        createOutlineGenerationJobHandler({
          database: database.client,
          provider: new MockLanguageModelProvider(),
          promptRegistry: new StaticPromptRegistry(repositoryPrompts),
          quotaGuard: new PostgresGenerationQuotaGuard(database.client, {
            "ai.outline": { maxCallsPerHour: 20 },
          }),
          pricing: mockPricing,
        }),
        createNarrationGenerationJobHandler({
          database: database.client,
          provider: new MockLanguageModelProvider(),
          promptRegistry: new StaticPromptRegistry(repositoryPrompts),
          quotaGuard: new PostgresGenerationQuotaGuard(database.client, {
            "ai.narration": { maxCallsPerHour: 20 },
          }),
          pricing: mockPricing,
        }),
      ];
    }
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
