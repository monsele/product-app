import type { Identifier, UtcTimestamp } from "@avlp/config";
import {
  identifierSchema,
  serializeUtcTimestamp,
  utcTimestampSchema,
} from "@avlp/config";
import { z, type ZodType } from "zod";

export const jobEnvelopeVersion = 1 as const;

export const queueNameSchema = z.enum([
  "ingestion",
  "pipeline",
  "media",
  "render",
]);
export type QueueName = z.infer<typeof queueNameSchema>;

export const jobTypeSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/);
export const payloadVersionSchema = z.number().int().positive();

export const jobStateSchema = z.enum([
  "queued",
  "running",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobState = z.infer<typeof jobStateSchema>;

export const jobErrorClassificationSchema = z.enum([
  "retryable",
  "terminal",
  "cancelled",
]);
export type JobErrorClassification = z.infer<
  typeof jobErrorClassificationSchema
>;

const metadataScalarSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export type JobMetadataValue =
  | z.infer<typeof metadataScalarSchema>
  | JobMetadataValue[]
  | { [key: string]: JobMetadataValue };
export const jobMetadataValueSchema: ZodType<JobMetadataValue> = z.lazy(() =>
  z.union([
    metadataScalarSchema,
    z.array(jobMetadataValueSchema).max(100),
    z.record(z.string().max(100), jobMetadataValueSchema),
  ]),
);
export const jobMetadataSchema = z.record(
  z.string().max(100),
  jobMetadataValueSchema,
);
export type JobMetadata = z.infer<typeof jobMetadataSchema>;

export const jobErrorMetadataSchema = z.object({
  classification: jobErrorClassificationSchema,
  code: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1).max(500),
  details: jobMetadataSchema.optional(),
});
export type JobErrorMetadata = z.infer<typeof jobErrorMetadataSchema>;

export type JobEnvelope<T> = {
  schemaVersion: typeof jobEnvelopeVersion;
  payloadVersion: number;
  jobId: Identifier;
  jobType: string;
  projectId: Identifier;
  ownerUserId: Identifier;
  inputVersion: string;
  idempotencyKey: string;
  correlationId: Identifier;
  payload: T;
  requestedAt: UtcTimestamp;
};

export function jobEnvelopeSchema<T>(payloadSchema: ZodType<T>) {
  return z.object({
    schemaVersion: z.literal(jobEnvelopeVersion),
    payloadVersion: payloadVersionSchema,
    jobId: identifierSchema,
    jobType: jobTypeSchema,
    projectId: identifierSchema,
    ownerUserId: identifierSchema,
    inputVersion: z.string().min(1).max(200),
    idempotencyKey: z.string().min(1).max(500),
    correlationId: identifierSchema,
    payload: payloadSchema,
    requestedAt: utcTimestampSchema,
  });
}

export type CreateJobEnvelopeInput<T> = Omit<
  JobEnvelope<T>,
  "schemaVersion" | "requestedAt"
> & { requestedAt?: Date };

export function createJobEnvelope<T>(
  payloadSchema: ZodType<T>,
  input: CreateJobEnvelopeInput<T>,
): JobEnvelope<T> {
  return jobEnvelopeSchema(payloadSchema).parse({
    ...input,
    schemaVersion: jobEnvelopeVersion,
    requestedAt: serializeUtcTimestamp(input.requestedAt ?? new Date()),
  }) as JobEnvelope<T>;
}

export const retryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(20).default(3),
  retryDelayMs: z.number().int().min(0).max(86_400_000).default(5_000),
  leaseDurationMs: z.number().int().min(1_000).max(3_600_000).default(60_000),
});
export type RetryPolicy = z.infer<typeof retryPolicySchema>;

export const deliveryOptionsSchema = z.object({
  maxAttempts: z.number().int().min(1).max(20),
  retryDelayMs: z.number().int().min(0).max(86_400_000),
});
export type DeliveryOptions = z.infer<typeof deliveryOptionsSchema>;
