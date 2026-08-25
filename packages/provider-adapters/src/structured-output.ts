import { z, type ZodType } from "zod";
import type {
  LanguageModelProvider,
  ProviderCompletionRequest,
  ProviderCompletionResponse,
  ProviderMessage,
} from "./contracts.js";

/**
 * Classified failure raised when structured output remains invalid after the
 * bounded repair policy is exhausted. This is a terminal, classified result:
 * callers must not silently accept unvalidated model output or retry forever.
 * The provider responses are retained so callers can persist a failed
 * model-call record with usage/cost/latency metadata.
 */
export class StructuredOutputError extends Error {
  public readonly code = "STRUCTURED_OUTPUT_INVALID" as const;
  public readonly issues: readonly z.ZodIssue[];
  public readonly repairAttempts: number;
  public readonly responses: readonly ProviderCompletionResponse[];

  public constructor(input: {
    issues: readonly z.ZodIssue[];
    repairAttempts: number;
    responses: readonly ProviderCompletionResponse[];
  }) {
    super("The model output did not validate after the bounded repair policy.");
    this.name = "StructuredOutputError";
    this.issues = input.issues;
    this.repairAttempts = input.repairAttempts;
    this.responses = input.responses;
  }
}

export const structuredOutputDefaults = {
  maxRepairs: 2,
} as const;

export type StructuredOutputResult<T> = {
  value: T;
  rawText: string;
  repairAttempts: number;
  responses: readonly ProviderCompletionResponse[];
};

const jsonCodeFencePattern = /```(?:json)?\s*([\s\S]*?)\s*```/;
const jsonObjectPattern = /^\{[\s\S]*\}$|^\[[\s\S]*\]$/;

/**
 * Attempts to decode a JSON value from raw model text. Tolerates a JSON code
 * fence when the provider wraps the object, but refuses to guess when no JSON
 * is present. Returns `undefined` when no JSON can be recovered.
 */
export function extractJsonText(rawText: string): string | undefined {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return undefined;
  if (jsonObjectPattern.test(trimmed)) return trimmed;
  const fenced = jsonCodeFencePattern.exec(trimmed);
  if (fenced?.[1] !== undefined) return fenced[1].trim();
  return undefined;
}

function parseJson(rawText: string): unknown {
  const candidate = extractJsonText(rawText);
  if (candidate === undefined) return undefined;
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return undefined;
  }
}

function repairRequest(
  original: ProviderCompletionRequest,
  rawText: string,
  issues: readonly z.ZodIssue[],
): ProviderCompletionRequest {
  const repairMessage: ProviderMessage = {
    role: "user",
    content:
      "Your previous response was invalid structured output. " +
      "Return ONLY valid JSON that matches the requested schema.\n" +
      `Validation errors:\n${issues
        .map(
          (issue) => `- ${issue.path.join(".") || "(root)"}: ${issue.message}`,
        )
        .join("\n")}\n` +
      `Your previous response was:\n${rawText.slice(0, 20_000)}`,
  };
  return {
    ...original,
    messages: [...original.messages, repairMessage],
  };
}

/**
 * Runs one model call and parses/validates structured output with a bounded
 * repair policy. Each repair re-asks the provider with the validation errors;
 * after `maxRepairs` the call throws {@link StructuredOutputError}. The raw
 * text and every provider response are returned for metadata recording.
 */
export async function generateStructuredOutput<T>(input: {
  provider: LanguageModelProvider;
  request: ProviderCompletionRequest;
  schema: ZodType<T>;
  maxRepairs?: number;
}): Promise<StructuredOutputResult<T>> {
  const maxRepairs = input.maxRepairs ?? structuredOutputDefaults.maxRepairs;
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > 10)
    throw new RangeError("maxRepairs must be an integer between 0 and 10.");
  const responses: ProviderCompletionResponse[] = [];
  let request = input.request;
  for (let repairAttempt = 0; repairAttempt <= maxRepairs; repairAttempt += 1) {
    const response = await input.provider.complete(request);
    responses.push(response);
    const parsed = parseJson(response.text);
    const result =
      parsed === undefined
        ? { success: false as const, error: undefined }
        : input.schema.safeParse(parsed);
    if (result.success) {
      return {
        value: result.data,
        rawText: response.text,
        repairAttempts: repairAttempt,
        responses,
      };
    }
    const issues =
      result.error === undefined
        ? [
            {
              code: z.ZodIssueCode.custom,
              message: "No JSON object was found in the model response.",
              path: [],
            } satisfies z.ZodIssue,
          ]
        : result.error.issues;
    if (repairAttempt >= maxRepairs)
      throw new StructuredOutputError({
        issues,
        repairAttempts: repairAttempt,
        responses,
      });
    request = repairRequest(request, response.text, issues);
  }
  throw new StructuredOutputError({
    issues: [
      { code: z.ZodIssueCode.custom, message: "Unreachable.", path: [] },
    ],
    repairAttempts: maxRepairs,
    responses,
  });
}
