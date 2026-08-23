import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  providerCompletionRequestSchema,
  providerCompletionResponseSchema,
  illustrationResponseSchema,
  ProviderCallError,
  type LanguageModelProvider,
} from "./contracts.js";
import { jsonCompletion, MockLanguageModelProvider } from "./mock-provider.js";
import { generateStructuredOutput } from "./structured-output.js";

const sampleSchema = z.object({ ok: z.literal(true) }).strict();

describe("provider contract", () => {
  it("validates a completion request boundary", () => {
    const request = providerCompletionRequestSchema.parse({
      model: "mock-model-1",
      messages: [
        { role: "system", content: "Be precise." },
        { role: "user", content: "Return JSON." },
      ],
      responseFormat: "json_object",
    });
    expect(request.model).toBe("mock-model-1");
    expect(request.messages).toHaveLength(2);
  });

  it("rejects an empty message list", () => {
    expect(
      providerCompletionRequestSchema.safeParse({
        model: "mock-model-1",
        messages: [],
      }).success,
    ).toBe(false);
  });

  it("produces a conforming response from the mock provider", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion({ ok: true }),
    });
    const response = await provider.complete(
      providerCompletionRequestSchema.parse({
        model: "mock-model-1",
        messages: [{ role: "user", content: "Generate." }],
      }),
    );
    const parsed = providerCompletionResponseSchema.parse(response);
    expect(parsed.providerId).toBe("mock");
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.usage.inputTokens).toBeGreaterThan(0);
    expect(parsed.usage.outputTokens).toBeGreaterThan(0);
  });

  it("surfaces a classified provider failure", async () => {
    const provider = new MockLanguageModelProvider({
      fail: { code: "PROVIDER_RATE_LIMITED", retryable: true },
    });
    await expect(
      provider.complete(
        providerCompletionRequestSchema.parse({
          model: "mock-model-1",
          messages: [{ role: "user", content: "Generate." }],
        }),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED", retryable: true });
  });

  it("keeps provider response types out of domain code (mock is the adapter)", () => {
    const provider: LanguageModelProvider = new MockLanguageModelProvider();
    expect(provider.providerId).toBe("mock");
  });

  it("runs structured output end to end through the mock provider", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion({ ok: true }),
    });
    const result = await generateStructuredOutput({
      provider,
      request: providerCompletionRequestSchema.parse({
        model: "mock-model-1",
        messages: [{ role: "user", content: "Generate." }],
      }),
      schema: sampleSchema,
    });
    expect(result.value).toEqual({ ok: true });
    expect(result.repairAttempts).toBe(0);
    expect(result.responses).toHaveLength(1);
  });

  it("constructs ProviderCallError with classification", () => {
    const error = new ProviderCallError({
      code: "TEMPORARY_INFRASTRUCTURE",
      message: "Upstream unavailable.",
      retryable: true,
    });
    expect(error.code).toBe("TEMPORARY_INFRASTRUCTURE");
    expect(error.retryable).toBe(true);
  });

  it("requires bounded PNG illustration output with metered provider fields", () => {
    expect(
      illustrationResponseSchema.safeParse({
        providerId: "image-provider",
        providerCallId: "call-1",
        mediaType: "image/png",
        bytes: new Uint8Array([1]),
        width: 1024,
        height: 1024,
        units: 1,
        costUsd: 0.02,
        moderation: { status: "approved", code: "provider_safe" },
      }).success,
    ).toBe(true);
    expect(
      illustrationResponseSchema.safeParse({ providerId: "x" }).success,
    ).toBe(false);
  });
});
