/**
 * Per-model token pricing used to estimate a model call's cost from provider
 * usage. Prices are USD per million tokens. Pricing is an estimate recorded
 * for metering; the actual provider invoice is reconciled separately.
 */
export const modelPricingSchema = {
  inputUsdPerMillionTokens: 0,
  outputUsdPerMillionTokens: 0,
} as const;
export type ModelPricing = {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
};
export type ModelPricingTable = Readonly<Record<string, ModelPricing>>;

export const defaultModelPricing: ModelPricingTable = {
  "mock-model-1": {
    inputUsdPerMillionTokens: 0.5,
    outputUsdPerMillionTokens: 1.5,
  },
  "mock-model-2": {
    inputUsdPerMillionTokens: 1.0,
    outputUsdPerMillionTokens: 3.0,
  },
};

export function estimateCostUsd(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  pricing?: ModelPricingTable;
}): number {
  const pricing =
    input.pricing?.[input.model] ?? defaultModelPricing[input.model];
  if (pricing === undefined)
    throw new RangeError(`No pricing is configured for model ${input.model}.`);
  const inputCost =
    (input.inputTokens / 1_000_000) * pricing.inputUsdPerMillionTokens;
  const outputCost =
    (input.outputTokens / 1_000_000) * pricing.outputUsdPerMillionTokens;
  return roundToMicrodollars(inputCost + outputCost);
}

function roundToMicrodollars(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
