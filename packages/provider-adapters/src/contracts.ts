import { z } from "zod";

/**
 * Provider-neutral completion contracts. Provider response formats never leak
 * into domain schemas; adapters map their native responses onto these types.
 */
export const providerMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
]);
export type ProviderMessageRole = z.infer<typeof providerMessageRoleSchema>;

export const providerMessageSchema = z.object({
  role: providerMessageRoleSchema,
  content: z.string().trim().min(1).max(200_000),
});
export type ProviderMessage = z.infer<typeof providerMessageSchema>;

export const providerCompletionRequestSchema = z.object({
  model: z.string().trim().min(1).max(200),
  messages: z.array(providerMessageSchema).min(1).max(100),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().positive().max(32_000).optional(),
  responseFormat: z.enum(["text", "json_object", "json_schema"]).optional(),
  jsonSchema: z.unknown().optional(),
});
export type ProviderCompletionRequest = z.infer<
  typeof providerCompletionRequestSchema
>;

export const providerUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
export type ProviderUsage = z.infer<typeof providerUsageSchema>;

export const providerCompletionResponseSchema = z.object({
  providerId: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(200_000),
  finishReason: z.enum(["stop", "length", "content_filter", "error"]),
  usage: providerUsageSchema,
  latencyMs: z.number().int().nonnegative(),
  retries: z.number().int().min(0).max(20),
});
export type ProviderCompletionResponse = z.infer<
  typeof providerCompletionResponseSchema
>;

/**
 * Replaceable language-model integration. Implementations own provider
 * credentials, retry/backoff for transient transport failures, and mapping of
 * native responses onto {@link ProviderCompletionResponse}. They never decide
 * product behavior or persist anything themselves.
 */
export interface LanguageModelProvider {
  readonly providerId: string;
  complete(
    request: ProviderCompletionRequest,
  ): Promise<ProviderCompletionResponse>;
}

/** Provider-neutral, deliberately narrow raster illustration contract (ST-059). */
export const illustrationRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(2_000),
  size: z.enum(["1024x1024", "1536x1024"]),
  style: z.literal("flat-educational-vector"),
});
export type IllustrationRequest = z.infer<typeof illustrationRequestSchema>;
export const illustrationResponseSchema = z.object({
  providerId: z.string().trim().min(1).max(100),
  providerCallId: z.string().trim().min(1).max(200),
  mediaType: z.literal("image/png"),
  bytes: z.instanceof(Uint8Array),
  width: z.number().int().positive().max(8_000),
  height: z.number().int().positive().max(8_000),
  units: z.number().positive(),
  costUsd: z.number().nonnegative(),
  moderation: z.object({
    status: z.enum(["approved", "rejected"]),
    code: z.string().trim().min(1).max(100),
  }).strict(),
});
export type IllustrationResponse = z.infer<typeof illustrationResponseSchema>;
export interface IllustrationProvider {
  readonly providerId: string;
  generate(request: IllustrationRequest): Promise<IllustrationResponse>;
}

/**
 * Classified provider failure thrown by adapters for transport-level errors.
 * `retryable` distinguishes temporary infrastructure/rate-limit failures from
 * terminal rejections (bad model, content filter, unsupported request).
 */
export class ProviderCallError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(input: {
    code: string;
    message: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "ProviderCallError";
    this.code = input.code;
    this.retryable = input.retryable ?? false;
  }
}
