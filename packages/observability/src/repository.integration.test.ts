import { createId } from "@avlp/config";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  usageRecords,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  PostgresAuditWriter,
  PostgresUsageMeter,
  aggregateProjectUsage,
  aggregateUserUsage,
  investigateCorrelation,
  listProjectAuditEvents,
} from "./repository.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("observability persistence", () => {
  let database: TestDatabase | undefined;
  const ownerUserId = createId();
  const projectId = createId();
  const correlationId = createId();

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(usageRecords);
    await database!.client.delete(auditEvents);
    await database!.client.delete(jobs);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("persists actor, action, target, timestamp, correlation, and redacted metadata", async () => {
    const writer = new PostgresAuditWriter(database!.client);
    const occurredAt = new Date("2026-08-08T12:00:00.000Z");
    await writer.write({
      ownerUserId,
      projectId,
      actor: { type: "user", userId: ownerUserId },
      eventType: "lesson.approved",
      target: { type: "lesson", id: "lesson-v1" },
      correlationId,
      metadata: { sourceText: "private lesson", revision: 1 },
      occurredAt,
    });

    const records = await listProjectAuditEvents(database!.client, {
      ownerUserId,
      projectId,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      ownerUserId,
      projectId,
      actorType: "user",
      actorUserId: ownerUserId,
      eventType: "lesson.approved",
      targetType: "lesson",
      targetId: "lesson-v1",
      correlationId,
      metadata: { sourceText: "[REDACTED]", revision: 1 },
      occurredAt,
    });
    expect(
      await listProjectAuditEvents(database!.client, {
        ownerUserId: createId(),
        projectId,
      }),
    ).toEqual([]);
  });

  it("aggregates usage by tenant, project, and operation", async () => {
    const meter = new PostgresUsageMeter(database!.client);
    const base = {
      ownerUserId,
      projectId,
      operationType: "ai.narration" as const,
      idempotencyKey: "ai.narration:lesson-v1:scene-1",
      provider: "example-provider",
      model: "example-model",
      unit: "tokens",
      status: "succeeded" as const,
      correlationId,
    };
    const first = await meter.record({
      ...base,
      quantity: 1_000,
      inputUnits: 800,
      outputUnits: 200,
      estimatedCostUsd: 0.02,
      latencyMs: 500,
    });
    await meter.record({
      ...base,
      idempotencyKey: "ai.narration:lesson-v1:scene-2",
      quantity: 500,
      inputUnits: 400,
      outputUnits: 100,
      estimatedCostUsd: 0.01,
      latencyMs: 300,
    });
    const duplicate = await meter.record({
      ...base,
      quantity: 1_000,
      inputUnits: 800,
      outputUnits: 200,
      estimatedCostUsd: 0.02,
      latencyMs: 500,
    });
    const otherTenant = await meter.record({
      ...base,
      ownerUserId: createId(),
      projectId: createId(),
      quantity: 7,
      inputUnits: 5,
      outputUnits: 2,
      estimatedCostUsd: 0.001,
      latencyMs: 25,
    });

    expect(
      await aggregateProjectUsage(database!.client, {
        ownerUserId,
        projectId,
      }),
    ).toEqual([
      expect.objectContaining({
        ownerUserId,
        projectId,
        operationType: "ai.narration",
        quantity: "1500.0000",
        estimatedCostUsd: "0.030000",
        inputUnits: 1200,
        outputUnits: 300,
        records: 2,
      }),
    ]);
    expect(await aggregateUserUsage(database!.client, { ownerUserId })).toEqual(
      [
        expect.objectContaining({
          ownerUserId,
          operationType: "ai.narration",
          quantity: "1500.0000",
          estimatedCostUsd: "0.030000",
          records: 2,
        }),
      ],
    );
    const investigation = await investigateCorrelation(database!.client, {
      ownerUserId,
      projectId,
      correlationId,
    });
    expect(investigation.usageRecords).toHaveLength(2);
    expect(duplicate.id).toBe(first.id);
    expect(otherTenant.id).not.toBe(first.id);
    await expect(
      meter.record({
        ...base,
        quantity: 1_000,
        inputUnits: 800,
        outputUnits: 200,
        estimatedCostUsd: 99,
        latencyMs: 500,
      }),
    ).rejects.toThrow("different measurement");

    await database!.client.insert(jobs).values({
      id: createId(),
      jobType: "lesson.generate",
      queueName: "pipeline",
      projectId,
      ownerUserId,
      inputVersion: "private-source-version",
      idempotencyKey: "private-idempotency-key",
      correlationId,
      payloadVersion: 1,
      payload: { sourceText: "private chapter text" },
    });
    const safeInvestigation = await investigateCorrelation(database!.client, {
      ownerUserId,
      projectId,
      correlationId,
    });
    expect(safeInvestigation.jobs).toHaveLength(1);
    expect(safeInvestigation.jobs[0]).not.toHaveProperty("payload");
    expect(safeInvestigation.jobs[0]).not.toHaveProperty("inputVersion");
    expect(safeInvestigation.jobs[0]).not.toHaveProperty("idempotencyKey");
    expect(safeInvestigation.usageRecords[0]).not.toHaveProperty(
      "idempotencyKey",
    );
  });
});
