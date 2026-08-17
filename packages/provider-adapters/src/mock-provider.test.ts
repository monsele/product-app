import { describe, expect, it } from "vitest";
import { providerCompletionRequestSchema } from "./contracts.js";
import { jsonCompletion, MockLanguageModelProvider } from "./mock-provider.js";

const request = () =>
  providerCompletionRequestSchema.parse({
    model: "mock-model-1",
    messages: [{ role: "user", content: "Generate." }],
  });

describe("mock language model provider", () => {
  it("records every request it receives", async () => {
    const provider = new MockLanguageModelProvider({
      completion: jsonCompletion({ ok: true }),
    });
    await provider.complete(request());
    await provider.complete(request());
    expect(provider.requests).toHaveLength(2);
    expect(provider.completions).toEqual([
      JSON.stringify({ ok: true }),
      JSON.stringify({ ok: true }),
    ]);
  });

  it("computes deterministic token usage from content length", async () => {
    const provider = new MockLanguageModelProvider({
      completion: () => "x".repeat(40),
      tokensPerCharacter: 4,
    });
    const response = await provider.complete(request());
    expect(response.usage.outputTokens).toBe(10);
    expect(response.usage.inputTokens).toBe(3);
  });

  it("uses the configured model and latency", async () => {
    const provider = new MockLanguageModelProvider({
      model: "custom-model",
      latencyMs: 25,
    });
    const response = await provider.complete(request());
    expect(response.model).toBe("custom-model");
    expect(response.latencyMs).toBe(25);
  });
});
