import {
  databaseEnvironmentSchema,
  parseWorkerEnvironment,
  redisEnvironmentSchema,
  storageEnvironmentSchema,
} from "@avlp/config";
import { createDatabaseConnection } from "@avlp/database";
import {
  PostgresJobRepository,
  redisConnectionFromUrl,
  registerJobConsumer,
} from "@avlp/jobs";
import {
  createStructuredLogger,
  OpenTelemetryJobTelemetry,
  PostgresUsageMeter,
  type StructuredLogger,
} from "@avlp/observability";
import {
  createS3CompatibleObjectStorage,
  type ObjectStorage,
} from "@avlp/storage";
import { z } from "zod";
import { createRenderJobHandler } from "./render-worker.js";
import { PostgresRenderLifecycle } from "./render-lifecycle.js";

const renderWorkerEnvironmentSchema = z
  .object({
    RENDER_BROWSER_EXECUTABLE: z.string().min(1).optional(),
    RENDER_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3_600)
      .default(300),
  })
  .passthrough();

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

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

export async function shutdownRenderWorkerResources(input: {
  consumer: { close: () => Promise<void> } | undefined;
  database: { close: () => Promise<void> };
  logger: Pick<StructuredLogger, "error">;
}): Promise<void> {
  let failed = false;
  try {
    await input.consumer?.close();
  } catch {
    failed = true;
  }
  try {
    await input.database.close();
  } catch {
    failed = true;
  }
  if (failed)
    input.logger.error("worker.shutdown_failed", { service: "renderer" });
}

async function createStorage(
  environmentInput: Record<string, string | undefined>,
): Promise<ObjectStorage> {
  const environment = storageEnvironmentSchema
    .and(z.object({ OBJECT_STORAGE_BUCKET: z.string().min(1) }))
    .parse(environmentInput);
  return createS3CompatibleObjectStorage({
    allowedPrefix: "users",
    allowedUploadContentTypes: ["video/mp4", "image/png"],
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

export async function runRenderWorker(
  environmentInput: Record<string, string | undefined>,
  options: {
    consumerFactory?: (input: Parameters<typeof registerJobConsumer>[0]) => {
      close: () => Promise<void>;
      on: (event: "error", listener: () => void) => unknown;
    };
    logger?: StructuredLogger;
    signal?: AbortSignal;
    storageFactory?: () => Promise<ObjectStorage>;
  } = {},
): Promise<void> {
  parseWorkerEnvironment(environmentInput);
  const databaseEnvironment = databaseEnvironmentSchema.parse(environmentInput);
  const redisEnvironment = redisEnvironmentSchema.parse(environmentInput);
  const renderEnvironment =
    renderWorkerEnvironmentSchema.parse(environmentInput);
  const logger =
    options.logger ?? createStructuredLogger({ service: "renderer" });
  const processSignal =
    options.signal === undefined ? processAbortSignal() : undefined;
  const signal = options.signal ?? processSignal!.signal;
  const database = createDatabaseConnection(databaseEnvironment.DATABASE_URL);
  const repository = new PostgresJobRepository(database.client);
  const connection = redisConnectionFromUrl(redisEnvironment.REDIS_URL);
  let consumer:
    | {
        close: () => Promise<void>;
        on: (event: "error", listener: () => void) => unknown;
      }
    | undefined;
  try {
    await database.healthCheck();
    const storage = await (options.storageFactory?.() ??
      createStorage(environmentInput));
    const handler = createRenderJobHandler({
      ...(renderEnvironment.RENDER_BROWSER_EXECUTABLE === undefined
        ? {}
        : { browserExecutable: renderEnvironment.RENDER_BROWSER_EXECUTABLE }),
      timeoutMs: renderEnvironment.RENDER_TIMEOUT_SECONDS * 1_000,
      logger,
      storage,
      usageMeter: new PostgresUsageMeter(database.client),
      lifecycle: new PostgresRenderLifecycle(database.client),
    });
    consumer =
      options.consumerFactory?.({
        connection,
        handlers: [handler],
        queueName: "render",
        repository,
        telemetry: new OpenTelemetryJobTelemetry(logger, undefined, [
          handler.jobType,
        ]),
      }) ??
      registerJobConsumer({
        connection,
        handlers: [handler],
        queueName: "render",
        repository,
        telemetry: new OpenTelemetryJobTelemetry(logger, undefined, [
          handler.jobType,
        ]),
      });
    consumer.on("error", () =>
      logger.error("worker.consumer_failed", { queueName: "render" }),
    );
    logger.info("worker.started", { service: "renderer" });
    await waitForAbort(signal);
  } finally {
    processSignal?.dispose();
    await shutdownRenderWorkerResources({ consumer, database, logger });
  }
}
