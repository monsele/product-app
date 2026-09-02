import { describe, expect, it } from "vitest";
import {
  defaultModelPricing,
  estimateCostUsd,
  type ModelPricingTable,
} from "./cost.js";

describe("cost estimation", () => {
  it("uses the default pricing table for known models", () => {
    const cost = estimateCostUsd({
      model: "mock-model-1",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    expect(cost).toBe(2); // 0.5 + 1.5
  });

  it("includes the selected Together LLM pricing", () => {
    expect(
      estimateCostUsd({
        model: "Qwen/Qwen3.8-Flash",
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(0.62);
  });

  it("accepts an explicit pricing table", () => {
    const pricing: ModelPricingTable = {
      custom: { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 4 },
    };
    expect(
      estimateCostUsd({
        model: "custom",
        inputTokens: 500_000,
        outputTokens: 250_000,
        pricing,
      }),
    ).toBe(2); // 1 + 1
  });

  it("rounds to microdollars", () => {
    const pricing: ModelPricingTable = {
      cheap: {
        inputUsdPerMillionTokens: 0.001,
        outputUsdPerMillionTokens: 0.001,
      },
    };
    const cost = estimateCostUsd({
      model: "cheap",
      inputTokens: 1_000,
      outputTokens: 1_000,
      pricing,
    });
    expect(cost).toBe(0.000002);
  });

  it("rejects unknown models without a pricing entry", () => {
    expect(() =>
      estimateCostUsd({
        model: "missing-model",
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toThrow(/pricing/);
  });

  it("exposes a default pricing table", () => {
    expect(defaultModelPricing["mock-model-1"]).toBeDefined();
    expect(defaultModelPricing["mock-model-2"]).toBeDefined();
  });
});
