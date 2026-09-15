import { type Identifier } from "@avlp/config";

const maximumCostEstimateUsdByModel: Readonly<Record<string, number>> = {
  // Together Kimi K3: 200k input tokens × $3.00/M + 32k output × $15.00/M.
  "moonshotai/Kimi-K3": 1.08,
};

/**
 * The model-call request is the durable, immutable approval record.  The
 * estimate is deliberately conservative: a bounded prompt plus one maximum
 * structured response.  Actual metering remains provider-response based.
 */
export function createModelCallProviderApproval(input: {
  jobId: Identifier;
  model: string;
}): {
  approvalReference: Identifier;
  providerId: "together";
  model: string;
  estimatedCostUsd: number;
  selectionReason: "explicit_job_request";
} {
  const estimatedCostUsd = maximumCostEstimateUsdByModel[input.model];
  if (estimatedCostUsd === undefined)
    throw new RangeError(
      `No bounded provider-cost estimate is configured for ${input.model}.`,
    );
  return {
    approvalReference: input.jobId,
    providerId: "together",
    model: input.model,
    estimatedCostUsd,
    selectionReason: "explicit_job_request",
  };
}
