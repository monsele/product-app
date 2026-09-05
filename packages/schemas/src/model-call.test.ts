import { describe, expect, it } from "vitest";
import {
  modelCallJobPayloadSchema,
  modelCallParamsSchema,
  modelCallRecordSchema,
  modelCallValidationStatusSchema,
  structuredGenerationErrorSchema,
  structuredGenerationResultSchema,
  type ModelCallRecord,
} from "./index.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const modelCallId = "019ffbf1-2222-7000-8000-000000000001";
const correlationId = "019ffbf1-3333-7000-8000-000000000001";

function sampleModelCallRecord(): ModelCallRecord {
  return modelCallRecordSchema.parse({
    id: modelCallId,
    projectId,
    ownerUserId,
    operationType: "ai.objectives",
    idempotencyKey: "model-call:abc123:ai.objectives",
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

describe("model-call contracts", () => {
  it("accepts a complete model-call record", () => {
    expect(sampleModelCallRecord()).toMatchObject({
      operationType: "ai.objectives",
    });
  });

  it("rejects unknown operation types", () => {
    expect(
      modelCallRecordSchema.safeParse({
        ...sampleModelCallRecord(),
        operationType: "ai.generated",
      }).success,
    ).toBe(false);
  });

  it("accepts every model-call operation value", () => {
    for (const operationType of [
      "ai.objectives",
      "ai.outline",
      "ai.narration",
      "ai.storyboard",
      "ai.scene_regeneration",
      "ai.grounding",
    ] as const) {
      expect(
        modelCallRecordSchema.safeParse({
          ...sampleModelCallRecord(),
          operationType,
        }).success,
      ).toBe(true);
    }
  });

  it("requires a sha256 input hash", () => {
    expect(
      modelCallRecordSchema.safeParse({
        ...sampleModelCallRecord(),
        inputHash: "not-a-hash",
      }).success,
    ).toBe(false);
  });

  it("validates the model-call job payload", () => {
    const payload = modelCallJobPayloadSchema.parse({
      schemaVersion: 2,
      operationType: "ai.objectives",
      sourceSnapshotId: snapshotId,
      promptId: "objectives",
      promptVersion: "v1",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: correlationId,
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      params: { ageBand: "11-13" },
    });
    expect(payload.params).toEqual({ ageBand: "11-13" });
    expect(payload.narrowing).toBeUndefined();
  });

  it("accepts a job payload with narrowing", () => {
    const payload = modelCallJobPayloadSchema.parse({
      schemaVersion: 2,
      operationType: "ai.objectives",
      sourceSnapshotId: snapshotId,
      promptId: "objectives",
      promptVersion: "v1",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: correlationId,
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      narrowing: { sectionIds: [snapshotId] },
    });
    expect(payload.narrowing?.sectionIds).toEqual([snapshotId]);
  });

  it("bounds model-call parameters", () => {
    expect(
      modelCallParamsSchema.safeParse(
        Object.fromEntries(
          Array.from({ length: 101 }, (_, index) => [`key-${index}`, index]),
        ),
      ).success,
    ).toBe(false);
    expect(modelCallParamsSchema.safeParse({ ageBand: "11-13" }).success).toBe(
      true,
    );
  });

  it("validates the structured generation result", () => {
    const result = structuredGenerationResultSchema.parse({
      schemaVersion: 1,
      value: { objectives: [] },
      validationStatus: "validated",
      repairAttempts: 0,
      inputUnits: 100,
      outputUnits: 50,
      estimatedCostUsd: 0.0002,
      latencyMs: 12,
    });
    expect(result.validationStatus).toBe("validated");
  });

  it("validates the structured generation error", () => {
    const error = structuredGenerationErrorSchema.parse({
      schemaVersion: 1,
      code: "STRUCTURED_OUTPUT_INVALID",
      retryable: false,
      message: "Invalid output.",
      repairAttempts: 2,
    });
    expect(error.retryable).toBe(false);
  });

  it("validates the validation-status enum", () => {
    expect(modelCallValidationStatusSchema.safeParse("validated").success).toBe(
      true,
    );
    expect(modelCallValidationStatusSchema.safeParse("repaired").success).toBe(
      true,
    );
    expect(modelCallValidationStatusSchema.safeParse("invalid").success).toBe(
      true,
    );
    expect(modelCallValidationStatusSchema.safeParse("unknown").success).toBe(
      false,
    );
  });
});
