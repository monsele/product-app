import { describe, expect, it, vi } from "vitest";
import type { LanguageModelProvider } from "@avlp/provider-adapters";
import { recoveryLanguageModelProvider } from "./recovery-dispatch.js";

describe("paid recovery model dispatch", () => {
  function provider() {
    const complete = vi
      .fn<LanguageModelProvider["complete"]>()
      .mockResolvedValue({
        providerId: "mock",
        model: "mock-model-1",
        text: "{}",
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 2 },
        latencyMs: 1,
        retries: 0,
      });
    return { providerId: "mock", complete };
  }
  const request = {
    model: "mock-model-1",
    messages: [{ role: "user" as const, content: "Check this source claim." }],
  };
  it("reserves before transport, bounds output to allowance, and delegates retries to jobs", async () => {
    const transport = provider();
    const authorize = vi.fn(async () => {});
    const guarded = recoveryLanguageModelProvider(transport, {
      maximumCostUsd: 0.01,
      authorize,
    });
    await guarded.complete(request);
    expect(authorize).toHaveBeenCalledExactlyOnceWith("model");
    expect(transport.complete).toHaveBeenCalledOnce();
    const [sent, options] = transport.complete.mock.calls[0]!;
    expect(sent.maxOutputTokens).toBeGreaterThan(0);
    expect(sent.maxOutputTokens).toBeLessThan(8000);
    expect(options).toEqual({ disableRetries: true });
    expect(authorize.mock.invocationCallOrder[0]).toBeLessThan(
      transport.complete.mock.invocationCallOrder[0]!,
    );
  });
  it("does not call the provider when allowance or authorization is unavailable", async () => {
    const transport = provider();
    const authorize = vi.fn(async () => {
      throw new Error("cancelled");
    });
    await expect(
      recoveryLanguageModelProvider(transport, {
        maximumCostUsd: 0,
        authorize,
      }).complete(request),
    ).rejects.toMatchObject({ code: "RECOVERY_ALLOWANCE_EXHAUSTED" });
    expect(authorize).not.toHaveBeenCalled();
    await expect(
      recoveryLanguageModelProvider(transport, {
        maximumCostUsd: 1,
        authorize,
      }).complete(request),
    ).rejects.toThrow("cancelled");
    expect(transport.complete).not.toHaveBeenCalled();
  });
});
