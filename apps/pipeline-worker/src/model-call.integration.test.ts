import { createId } from "@avlp/config";
import { migrateDatabase } from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { modelCallRecordSchema, type ModelCallRecord } from "@avlp/schemas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresGenerationQuotaGuard,
  PostgresModelCallRepository,
} from "./model-call.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const correlationId = "019ffbf1-3333-7000-8000-000000000001";

function sampleRecord(): ModelCallRecord {
  return modelCallRecordSchema.parse({
    id: createId(),
    projectId,
    ownerUserId,
    operationType: "ai.objectives",
    idempotencyKey: "model-call:test:ai.objectives",
    promptId: "objectives",
    promptVersion: "v1",
    provider: "mock",
    model: "mock-model-1",
    inputVersion: "a".repeat(64),
    inputHash: "b".repeat(64),
    inputUnits: 100,
    outputUnits: 50,
    estimatedCostUsd: 0.0002,
    latencyMs: 12,
    retryCount: 0,
    validationStatus: "validated",
    status: "succeeded",
    errorCode: null,
    correlationId,
    createdAt: "2026-08-16T10:00:00.000Z",
  });
}

describeWithPostgres("model-call persistence", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("inserts a model-call record idempotently", async () => {
    const repository = new PostgresModelCallRepository(database!.client);
    const record = sampleRecord();
    const first = await repository.create({ record });
    const second = await repository.create({ record });
    expect(first.id).toBe(record.id);
    expect(second.id).toBe(record.id);
  });

  it("counts recent calls for the quota guard", async () => {
    const repository = new PostgresModelCallRepository(database!.client);
    await repository.create({ record: sampleRecord() });
    const guard = new PostgresGenerationQuotaGuard(
      database!.client,
      { "ai.objectives": { maxCallsPerHour: 1 } },
      () => new Date("2026-08-16T11:00:00.000Z"),
    );
    await expect(
      guard.assertCanGenerate({
        ownerUserId,
        projectId,
        operationType: "ai.objectives",
        now: new Date("2026-08-16T11:00:00.000Z"),
      }),
    ).rejects.toThrow(/quota/);
    await expect(
      guard.assertCanGenerate({
        ownerUserId,
        projectId,
        operationType: "ai.outline",
        now: new Date("2026-08-16T11:00:00.000Z"),
      }),
    ).resolves.toBeUndefined();
  });
});
