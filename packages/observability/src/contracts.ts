import {
  auditActorTypeValues,
  auditEventTypeValues,
  usageOperationTypeValues,
  usageStatusValues,
} from "@avlp/database";
import { identifierSchema } from "@avlp/config";
import { z, type ZodType } from "zod";

export type SafeMetadataValue =
  | string
  | number
  | boolean
  | null
  | SafeMetadataValue[]
  | { [key: string]: SafeMetadataValue };

export const safeMetadataValueSchema: ZodType<SafeMetadataValue> = z.lazy(() =>
  z.union([
    z.string().max(2_000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(safeMetadataValueSchema).max(100),
    z.record(z.string().min(1).max(100), safeMetadataValueSchema),
  ]),
);

export const safeMetadataSchema = z.record(
  z.string().min(1).max(100),
  safeMetadataValueSchema,
);
export type SafeMetadata = z.infer<typeof safeMetadataSchema>;

export const auditEventTypeSchema = z.enum(auditEventTypeValues);
export type AuditEventType = z.infer<typeof auditEventTypeSchema>;
export const auditActorTypeSchema = z.enum(auditActorTypeValues);

export const auditActorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: identifierSchema }),
  z.object({ type: z.literal("system") }),
]);
export type AuditActor = z.infer<typeof auditActorSchema>;

export const writeAuditEventSchema = z.object({
  id: identifierSchema.optional(),
  ownerUserId: identifierSchema,
  projectId: identifierSchema.nullable().optional(),
  actor: auditActorSchema,
  eventType: auditEventTypeSchema,
  target: z.object({
    type: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_.-]*$/),
    id: z.string().min(1).max(200),
  }),
  correlationId: identifierSchema,
  metadata: z.unknown().optional(),
  occurredAt: z.date().optional(),
});
export type WriteAuditEvent = z.input<typeof writeAuditEventSchema>;

export const usageOperationTypeSchema = z.enum(usageOperationTypeValues);
export type UsageOperationType = z.infer<typeof usageOperationTypeSchema>;
export const usageStatusSchema = z.enum(usageStatusValues);
export type UsageStatus = z.infer<typeof usageStatusSchema>;

const postgresNonNegativeInteger = z
  .number()
  .int()
  .nonnegative()
  .max(2_147_483_647);
export const usageMeasurementSchema = z.object({
  id: identifierSchema.optional(),
  ownerUserId: identifierSchema,
  projectId: identifierSchema,
  operationType: usageOperationTypeSchema,
  idempotencyKey: z.string().min(1).max(300),
  provider: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(200).optional(),
  unit: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_.-]*$/),
  quantity: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
  inputUnits: postgresNonNegativeInteger.optional(),
  outputUnits: postgresNonNegativeInteger.optional(),
  estimatedCostUsd: z.number().finite().nonnegative().max(99_999_999.999_999),
  latencyMs: postgresNonNegativeInteger.optional(),
  retryCount: z.number().int().min(0).max(20).default(0),
  status: usageStatusSchema,
  correlationId: identifierSchema,
  metadata: z.unknown().optional(),
  occurredAt: z.date().optional(),
});
export type UsageMeasurement = z.input<typeof usageMeasurementSchema>;

export interface UsageMeter {
  record(measurement: UsageMeasurement): Promise<{ id: string }>;
}
