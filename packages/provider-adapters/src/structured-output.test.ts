import { describe, expect, it } from "vitest";
import { z } from "zod";
import { providerCompletionRequestSchema } from "./contracts.js";
import {
  jsonCompletion,
  MockLanguageModelProvider,
  sequenceCompletion,
} from "./mock-provider.js";
import {
  extractJsonText,
  generateStructuredOutput,
  StructuredOutputError,
} from "./structured-output.js";

const request = () =>
  providerCompletionRequestSchema.parse({
    model: "mock-model-1",
    messages: [{ role: "user", content: "Generate." }],
  });

describe("structured output", () => {
  it("parses a fenced JSON block", () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('{"a":1}')).toBe('{"a":1}');
    expect(extractJsonText("plain text")).toBeUndefined();
    expect(extractJsonText("")).toBeUndefined();
  });

  it("repairs invalid output with the bounded policy and returns typed output", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: sequenceCompletion([
        JSON.stringify({ ok: "yes" }),
        JSON.stringify({ ok: true }),
      ]),
    });
    const schema = z.object({ ok: z.literal(true) }).strict();
    const result = await generateStructuredOutput({
      provider,
      request: request(),
      schema,
      maxRepairs: 2,
    });
    expect(result.value).toEqual({ ok: true });
    expect(result.repairAttempts).toBe(1);
    expect(result.responses).toHaveLength(2);
    expect(provider.requests).toHaveLength(2);
  });

  it("throws a classified failure after exhausting bounded repairs", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion({ ok: "no" }),
    });
    const schema = z.object({ ok: z.literal(true) }).strict();
    await expect(
      generateStructuredOutput({
        provider,
        request: request(),
        schema,
        maxRepairs: 1,
      }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
    expect(provider.requests).toHaveLength(2);
    await expect(
      generateStructuredOutput({
        provider,
        request: request(),
        schema,
        maxRepairs: 2,
      }),
    ).rejects.toMatchObject({ repairAttempts: 2 });
    expect(provider.requests).toHaveLength(5);
  });

  it("fails immediately when no JSON is returned", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: () => "not json at all",
    });
    await expect(
      generateStructuredOutput({
        provider,
        request: request(),
        schema: z.object({}).strict(),
      }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
  });

  it("rejects an unbounded repair configuration", async () => {
    const provider = new MockLanguageModelProvider({
      completion: jsonCompletion({ ok: true }),
    });
    await expect(
      generateStructuredOutput({
        provider,
        request: request(),
        schema: z.object({ ok: z.literal(true) }),
        maxRepairs: 11,
      }),
    ).rejects.toThrow(/maxRepairs/);
  });
});
