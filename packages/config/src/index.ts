import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";

const uuidV7Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const utcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const identifierSchema = z
  .string()
  .regex(uuidV7Pattern, "Expected a UUIDv7.");
export type Identifier = z.infer<typeof identifierSchema>;

export function createId(now = new Date()): Identifier {
  const milliseconds = BigInt(now.getTime());
  if (milliseconds < 0n || milliseconds > 0xffffffffffffn) {
    throw new RangeError("UUIDv7 timestamps must fit in 48 bits.");
  }
  const bytes = randomBytes(16);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((milliseconds >> BigInt((5 - index) * 8)) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const utcTimestampSchema = z
  .string()
  .regex(utcTimestampPattern, "Expected a UTC ISO-8601 timestamp.");
export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;
export const serializeUtcTimestamp = (date: Date): UtcTimestamp =>
  date.toISOString();

export const paginationSchema = z.object({
  cursor: identifierSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorPagination = z.infer<typeof paginationSchema>;
export type CursorPage<T> = { items: T[]; nextCursor?: Identifier };

export const errorCodeSchema = z.enum([
  "bad_request",
  "configuration_invalid",
  "forbidden",
  "internal_error",
  "not_found",
  "rate_limited",
  "unauthorized",
  "validation_failed",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type FieldErrorMap = Record<string, string>;
export const apiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    fieldErrors: z.record(z.string()).optional(),
    retryable: z.boolean(),
    correlationId: identifierSchema,
  }),
});
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export class PublicError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly retryable: boolean;
  public readonly fieldErrors: FieldErrorMap | undefined;

  public constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    retryable = false,
    fieldErrors?: FieldErrorMap,
  ) {
    super(message);
    this.name = "PublicError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.fieldErrors = fieldErrors;
  }
}

export function toApiErrorEnvelope(
  error: unknown,
  correlationId: Identifier,
): ApiErrorEnvelope {
  if (error instanceof PublicError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.fieldErrors === undefined
          ? {}
          : { fieldErrors: error.fieldErrors }),
        retryable: error.retryable,
        correlationId,
      },
    };
  }
  if (error instanceof ZodError) {
    const fieldErrors: FieldErrorMap = {};
    for (const issue of error.issues)
      fieldErrors[issue.path.join(".") || "root"] = issue.message;
    return {
      error: {
        code: "validation_failed",
        message: "Request validation failed.",
        fieldErrors,
        retryable: false,
        correlationId,
      },
    };
  }
  return {
    error: {
      code: "internal_error",
      message: "An unexpected error occurred.",
      retryable: true,
      correlationId,
    },
  };
}

export type CorrelationContext = { correlationId: Identifier };
export function getCorrelationId(value: string | undefined): Identifier {
  return value !== undefined && identifierSchema.safeParse(value).success
    ? value
    : createId();
}

export const postgresUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  }, "Expected a PostgreSQL connection URL.");
export const databaseEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
});
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export const redisEnvironmentSchema = z.object({
  REDIS_URL: z.string().url(),
});
export type RedisEnvironment = z.infer<typeof redisEnvironmentSchema>;
const environmentBooleanSchema = z.preprocess((value) => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}, z.boolean());
const baseEnvironmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});
const storageEnvironmentObjectSchema = z.object({
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_BUCKET: z.string().min(1).optional(),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_REGION: z.string().min(1).default("us-east-1"),
  OBJECT_STORAGE_FORCE_PATH_STYLE: environmentBooleanSchema.default(false),
  OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT:
    environmentBooleanSchema.default(false),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(1).max(3600).default(300),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
});
function isLocalStorageEndpoint(endpoint: URL): boolean {
  return (
    endpoint.hostname === "localhost" ||
    endpoint.hostname === "127.0.0.1" ||
    endpoint.hostname === "[::1]"
  );
}
function validateStorageCredentialPair(
  value: {
    OBJECT_STORAGE_ACCESS_KEY?: string | undefined;
    OBJECT_STORAGE_SECRET_KEY?: string | undefined;
    OBJECT_STORAGE_ENDPOINT?: string | undefined;
    OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT?: boolean | undefined;
    NODE_ENV?: "development" | "test" | "production" | undefined;
  },
  context: z.RefinementCtx,
): void {
  const hasAccessKey = value.OBJECT_STORAGE_ACCESS_KEY !== undefined;
  const hasSecretKey = value.OBJECT_STORAGE_SECRET_KEY !== undefined;
  if (hasAccessKey !== hasSecretKey)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [
        hasAccessKey
          ? "OBJECT_STORAGE_SECRET_KEY"
          : "OBJECT_STORAGE_ACCESS_KEY",
      ],
      message:
        "Object-storage access and secret keys must be supplied together.",
    });
  if (value.OBJECT_STORAGE_ENDPOINT !== undefined) {
    const endpoint = new URL(value.OBJECT_STORAGE_ENDPOINT);
    if (
      endpoint.protocol !== "https:" &&
      value.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT !== true
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OBJECT_STORAGE_ENDPOINT"],
        message:
          "Object-storage endpoints must use HTTPS unless insecure local access is explicitly enabled.",
      });
    if (
      endpoint.protocol !== "https:" &&
      value.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT === true &&
      !isLocalStorageEndpoint(endpoint)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OBJECT_STORAGE_ENDPOINT"],
        message:
          "Insecure object-storage endpoints must use a local loopback host.",
      });
  }
  if (
    value.NODE_ENV === "production" &&
    value.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT === true
  )
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT"],
      message: "Insecure object-storage endpoints are forbidden in production.",
    });
}
export const storageEnvironmentSchema = baseEnvironmentSchema
  .merge(storageEnvironmentObjectSchema)
  .superRefine(validateStorageCredentialPair);
export type StorageEnvironment = z.infer<typeof storageEnvironmentSchema>;
export const apiEnvironmentSchema = baseEnvironmentSchema
  .merge(databaseEnvironmentSchema)
  .merge(redisEnvironmentSchema)
  .extend({
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
  });
export const workerEnvironmentSchema = baseEnvironmentSchema
  .merge(databaseEnvironmentSchema.partial())
  .merge(redisEnvironmentSchema.partial())
  .merge(storageEnvironmentObjectSchema)
  .superRefine(validateStorageCredentialPair);
export const webEnvironmentSchema = baseEnvironmentSchema.extend({
  NEXT_PUBLIC_API_URL: z.string().url().optional(),
});
export const environmentSchema = apiEnvironmentSchema;
export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  input: Record<string, string | undefined>,
): Environment {
  return environmentSchema.parse(input);
}

export function parseWorkerEnvironment(
  input: Record<string, string | undefined>,
): z.infer<typeof workerEnvironmentSchema> {
  return workerEnvironmentSchema.parse(input);
}

export function parseWebEnvironment(
  input: Record<string, string | undefined>,
): z.infer<typeof webEnvironmentSchema> {
  return webEnvironmentSchema.parse(input);
}
