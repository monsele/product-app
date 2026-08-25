import { createId } from "@avlp/config";
import { migrateDatabase } from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  createJobEnvelope,
  PostgresJobRepository,
  unknownPayloadSchema,
  type ClaimedOutboxEvent,
} from "@avlp/jobs";
import {
  createStructuredLogger,
  type StructuredLogRecord,
} from "@avlp/observability";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPipelineWorker } from "./runtime.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("pipeline worker runtime", () => {
  let database: TestDatabase | undefined;
  let databaseUrl: string;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
    const parsed = new URL(serverUrl!);
    parsed.pathname = `/${database.databaseName}`;
    databaseUrl = parsed.toString();
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("runs the outbox and consumer with correlation-aware telemetry", async () => {
    const repository = new PostgresJobRepository(database!.client);
    const correlationId = createId();
    await repository.createJob({
      queueName: "pipeline",
      envelope: createJobEnvelope(unknownPayloadSchema, {
        payloadVersion: 1,
        jobId: createId(),
        jobType: "lesson.generate",
        projectId: createId(),
        ownerUserId: createId(),
        inputVersion: "outline-v1",
        idempotencyKey: `lesson.generate:${correlationId}`,
        correlationId,
        payload: { revision: 1 },
      }),
    });
    const records: StructuredLogRecord[] = [];
    const logger = createStructuredLogger({
      service: "pipeline-worker-test",
      sink: (record) => records.push(record),
    });
    const controller = new AbortController();
    let published: ClaimedOutboxEvent | undefined;
    let telemetryConfigured = false;
    let consumerClosed = false;
    let publisherClosed = false;

    await runPipelineWorker(
      {
        NODE_ENV: "test",
        DATABASE_URL: databaseUrl,
        REDIS_URL: "redis://127.0.0.1:1",
      },
      {
        signal: controller.signal,
        logger,
        handlers: [],
        publisherFactory: () => ({
          publish: (event) => {
            published = event;
            controller.abort();
            return Promise.resolve();
          },
          close: () => {
            publisherClosed = true;
            return Promise.resolve();
          },
        }),
        consumerFactory: (input) => {
          telemetryConfigured = input.telemetry !== undefined;
          return {
            on: () => undefined,
            close: () => {
              consumerClosed = true;
              return Promise.resolve();
            },
          };
        },
      },
    );

    expect(published?.envelope.correlationId).toBe(correlationId);
    expect(telemetryConfigured).toBe(true);
    expect(consumerClosed).toBe(true);
    expect(publisherClosed).toBe(true);
    expect(records).toContainEqual(
      expect.objectContaining({
        event: "queue.job_dispatched",
        fields: expect.objectContaining({ correlationId }),
      }),
    );
  });
});
