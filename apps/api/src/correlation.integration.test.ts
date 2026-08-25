import { createId } from "@avlp/config";
import { jobs, migrateDatabase, outboxEvents } from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  createJobEnvelope,
  executeJobDelivery,
  OutboxDispatcher,
  PostgresJobRepository,
  StructuredOutboxTelemetry,
  type ClaimedOutboxEvent,
} from "@avlp/jobs";
import {
  createStructuredLogger,
  currentCorrelationId,
  OpenTelemetryJobTelemetry,
  type StructuredLogRecord,
} from "@avlp/observability";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "./app.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("API to worker correlation", () => {
  let database: TestDatabase | undefined;
  let repository: PostgresJobRepository;
  let app: NestFastifyApplication | undefined;
  const records: StructuredLogRecord[] = [];
  const projectId = createId();
  const ownerUserId = createId();
  const payloadSchema = z.object({ revision: z.number().int().positive() });

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
    repository = new PostgresJobRepository(database.client);
    const logger = createStructuredLogger({
      service: "correlation-test",
      sink: (record) => records.push(record),
    });
    app = await createApp({
      database: {
        healthCheck: () => database!.healthCheck(),
        close: () => Promise.resolve(),
      },
      logger,
      configure: (configuredApp) => {
        configuredApp
          .getHttpAdapter()
          .getInstance()
          .post("/test/jobs", async (_request, reply) => {
            const correlationId = currentCorrelationId();
            if (correlationId === undefined)
              throw new Error("Request correlation context is missing.");
            const envelope = createJobEnvelope(payloadSchema, {
              payloadVersion: 1,
              jobId: createId(),
              jobType: "lesson.generate",
              projectId,
              ownerUserId,
              inputVersion: "outline-v1",
              idempotencyKey: `lesson.generate:${correlationId}`,
              correlationId,
              payload: { revision: 1 },
            });
            const result = await repository.createJob({
              envelope,
              queueName: "pipeline",
            });
            return reply.status(202).send({
              jobId: result.job.id,
              correlationId,
            });
          });
      },
    });
  });

  beforeEach(async () => {
    records.length = 0;
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
  });

  afterAll(async () => {
    await app?.close();
    await database?.destroy();
  });

  it("preserves one correlation ID across API, outbox, queue, and worker logs", async () => {
    const correlationId = createId();
    const response = await app!
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "POST",
        url: "/test/jobs",
        headers: { "x-correlation-id": correlationId },
      });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ correlationId });

    let queuedEvent: ClaimedOutboxEvent | undefined;
    const logger = createStructuredLogger({
      service: "correlation-test",
      sink: (record) => records.push(record),
    });
    const dispatcher = new OutboxDispatcher(
      repository,
      {
        publish: (event) => {
          queuedEvent = event;
          return Promise.resolve();
        },
      },
      { telemetry: new StructuredOutboxTelemetry(logger) },
    );
    await expect(dispatcher.dispatchOnce()).resolves.toMatchObject({
      dispatched: 1,
      failed: 0,
    });
    expect(queuedEvent?.envelope.correlationId).toBe(correlationId);

    const telemetry = new OpenTelemetryJobTelemetry(logger, undefined, [
      "lesson.generate",
    ]);
    await expect(
      executeJobDelivery({
        rawEnvelope: queuedEvent!.envelope,
        queueName: "pipeline",
        payloadSchema,
        repository,
        telemetry,
        handler: async (_payload, context) => {
          expect(context.correlationId).toBe(correlationId);
          return { artifactVersion: "lesson-v1" };
        },
      }),
    ).resolves.toBe("succeeded");

    expect(
      await repository.findJob({
        jobId: queuedEvent!.envelope.jobId,
        ownerUserId: queuedEvent!.envelope.ownerUserId,
        projectId: queuedEvent!.envelope.projectId,
      }),
    ).toMatchObject({
      state: "succeeded",
      correlationId,
    });
    expect(
      records
        .filter((record) =>
          [
            "api.request_received",
            "queue.job_dispatched",
            "job.started",
            "job.completed",
          ].includes(record.event),
        )
        .map((record) => record.fields.correlationId),
    ).toEqual([correlationId, correlationId, correlationId, correlationId]);
  });
});
