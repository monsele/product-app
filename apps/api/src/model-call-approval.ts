import { type Identifier } from "@avlp/config";
import {
  modelCallProviderApprovalSchema,
  type ModelCallProviderApproval,
} from "@avlp/schemas";

const maximumCostEstimateUsdByModel: Readonly<Record<string, number>> = {
  // Together Kimi K3: 200k input tokens × $3.00/M + 32k output × $15.00/M.
  "moonshotai/Kimi-K3": 1.08,
};

/** The bounded upper-bound cost of one model call, or undefined when no
 * estimate is configured for the model. */
export function maximumModelCallCostUsd(model: string): number | undefined {
  return maximumCostEstimateUsdByModel[model];
}

/**
 * The model-call request is the durable, immutable approval record.  The
 * estimate is deliberately conservative: a bounded prompt plus one maximum
 * structured response.  Actual metering remains provider-response based.
 *
 * ST-105: a job queued by a prompt-to-video run carries `one_shot_run` and the
 * run's id, so the paid call traces back to the run's single authorisation
 * instead of a per-job click.
 */
export function createModelCallProviderApproval(input: {
  jobId: Identifier;
  model: string;
  oneShotRunId?: Identifier | undefined;
}): ModelCallProviderApproval {
  const estimatedCostUsd = maximumCostEstimateUsdByModel[input.model];
  if (estimatedCostUsd === undefined)
    throw new RangeError(
      `No bounded provider-cost estimate is configured for ${input.model}.`,
    );
  return modelCallProviderApprovalSchema.parse({
    approvalReference: input.jobId,
    providerId: "together",
    model: input.model,
    estimatedCostUsd,
    ...(input.oneShotRunId === undefined
      ? { selectionReason: "explicit_job_request" }
      : { selectionReason: "one_shot_run", oneShotRunId: input.oneShotRunId }),
  });
}
