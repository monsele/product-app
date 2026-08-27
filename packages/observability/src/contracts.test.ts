import { describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import { auditEventTypeSchema, usageMeasurementSchema } from "./contracts.js";

function measurement() {
  return {
    ownerUserId: createId(),
    projectId: createId(),
    operationType: "ai.narration" as const,
    idempotencyKey: "ai.narration:lesson-v1:scene-1",
    unit: "tokens",
    quantity: 1,
    inputUnits: 1,
    outputUnits: 1,
    estimatedCostUsd: 0.01,
    latencyMs: 1,
    status: "succeeded" as const,
    correlationId: createId(),
  };
}

describe("usage measurement boundaries", () => {
  it("rejects values that cannot fit the PostgreSQL contract", () => {
    expect(
      usageMeasurementSchema.safeParse({
        ...measurement(),
        inputUnits: 2_147_483_648,
      }).success,
    ).toBe(false);
    expect(
      usageMeasurementSchema.safeParse({
        ...measurement(),
        estimatedCostUsd: 100_000_000,
      }).success,
    ).toBe(false);
    expect(
      usageMeasurementSchema.safeParse({
        ...measurement(),
        quantity: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
  });
});

describe("audit event types", () => {
  it("includes voice.configuration_saved in allowed audit event types", () => {
    expect(
      auditEventTypeSchema.safeParse("voice.configuration_saved").success,
    ).toBe(true);
  });
});
