import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  createModelCallProviderApproval,
  maximumModelCallCostUsd,
} from "./model-call-approval.js";

const jobId = "019ffc40-aaaa-7000-8000-000000000105" as Identifier;
const runId = "019ffc40-bbbb-7000-8000-000000000105" as Identifier;

describe("model-call provider approval", () => {
  it("is an explicit job request unless a prompt-to-video run authorised it", () => {
    expect(
      createModelCallProviderApproval({ jobId, model: "moonshotai/Kimi-K3" }),
    ).toEqual({
      approvalReference: jobId,
      providerId: "together",
      model: "moonshotai/Kimi-K3",
      estimatedCostUsd: 1.08,
      selectionReason: "explicit_job_request",
    });
    expect(
      createModelCallProviderApproval({
        jobId,
        model: "moonshotai/Kimi-K3",
        oneShotRunId: runId,
      }),
    ).toMatchObject({ selectionReason: "one_shot_run", oneShotRunId: runId });
  });

  it("refuses a model without a bounded estimate", () => {
    expect(maximumModelCallCostUsd("unknown/model")).toBeUndefined();
    expect(() =>
      createModelCallProviderApproval({ jobId, model: "unknown/model" }),
    ).toThrow(RangeError);
  });
});
