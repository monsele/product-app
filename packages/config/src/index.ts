import { createHash, randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import { identifierSchema, type Identifier } from "./identifiers.js";

const utcTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export { identifierSchema, type Identifier } from "./identifiers.js";

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

function sortCanonicalShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonicalShape);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonicalShape(nested)]),
    );
  }
  return value;
}

/**
 * Deterministic SHA-256 of one narration block's content. Derived artifacts
 * (audio, captions, preview cache, validation, renders) store the narration
 * content hashes they were built from; when a block changes its hash changes
 * and only the affected derived artifacts are stale. Server-only: the web app
 * never computes hashes and must not bundle this function.
 */
export function computeNarrationBlockContentHash(input: {
  text: string;
  sourceRefs: readonly unknown[];
  generatedAdditions: readonly unknown[];
  generated: boolean;
}): string {
  const canonical = JSON.stringify(
    sortCanonicalShape({
      text: input.text,
      sourceRefs: input.sourceRefs,
      generatedAdditions: input.generatedAdditions,
      generated: input.generated,
    }),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Deterministic SHA-256 of an ordered narration set: the ordered block content
 * hashes plus the total estimated seconds. Two sets with the same hash narrate
 * identical content.
 */
export function computeNarrationSetContentHash(
  blocks: readonly { contentHash: string }[],
  totalEstimatedSeconds: number,
): string {
  const canonical = JSON.stringify(
    sortCanonicalShape({
      totalEstimatedSeconds,
      blocks: blocks.map((block) => ({ contentHash: block.contentHash })),
    }),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Deterministic SHA-256 of one storyboard scene's content. The scene content
 * hash excludes the app-assigned identity (id/order) so identical semantic
 * content always hashes identically; derived artifacts (previews, renders,
 * asset bindings) can detect scene-level changes without a full diff.
 */
export function computeLessonStoryboardSceneContentHash(input: {
  template: string;
  title: string | undefined;
  narration: string;
  durationSeconds: number;
  onScreenText: readonly unknown[];
  transition: string;
  visual: unknown;
  sourceRefs: readonly unknown[];
  generatedAdditions: readonly unknown[];
  assetBindings: readonly unknown[];
}): string {
  const canonical = JSON.stringify(
    sortCanonicalShape({
      template: input.template,
      title: input.title,
      narration: input.narration,
      durationSeconds: input.durationSeconds,
      onScreenText: input.onScreenText,
      transition: input.transition,
      visual: input.visual,
      sourceRefs: input.sourceRefs,
      generatedAdditions: input.generatedAdditions,
      assetBindings: input.assetBindings,
    }),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Deterministic SHA-256 of an ordered storyboard: the ordered scene content
 * hashes, each scene's narration-block assignment and planned asset
 * requirements, the total allocated duration, and the covered objective IDs.
 * Two storyboards with the same hash are visually and structurally identical.
 */
export function computeLessonStoryboardContentHash(input: {
  totalDurationSeconds: number;
  objectiveIds: readonly unknown[];
  scenes: readonly {
    contentHash: string;
    narrationBlockIds: readonly unknown[];
    assetRequirements: readonly unknown[];
  }[];
}): string {
  const canonical = JSON.stringify(
    sortCanonicalShape({
      totalDurationSeconds: input.totalDurationSeconds,
      objectiveIds: input.objectiveIds,
      scenes: input.scenes.map((scene) => ({
        contentHash: scene.contentHash,
        narrationBlockIds: scene.narrationBlockIds,
        assetRequirements: scene.assetRequirements,
      })),
    }),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

export const paginationSchema = z.object({
  cursor: identifierSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorPagination = z.infer<typeof paginationSchema>;
export type CursorPage<T> = { items: T[]; nextCursor?: Identifier };

export const errorCodeSchema = z.enum([
  "bad_request",
  "configuration_invalid",
  "edit_conflict",
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
    latest: z.unknown().optional(),
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
  public readonly latest: unknown | undefined;

  public constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    retryable = false,
    fieldErrors?: FieldErrorMap,
    latest?: unknown,
  ) {
    super(message);
    this.name = "PublicError";
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.fieldErrors = fieldErrors;
    this.latest = latest;
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
        ...(error.latest === undefined ? {} : { latest: error.latest }),
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
export const storageEnvironmentObjectSchema = z.object({
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
export const malwareScannerEnvironmentSchema = z.object({
  MALWARE_SCANNER_URL: z
    .string()
    .url()
    .refine(
      (value) => new URL(value).protocol === "https:",
      "Malware scanner URLs must use HTTPS.",
    )
    .optional(),
  MALWARE_SCANNER_TOKEN: z.string().min(1).optional(),
});
export const ingestionServiceEnvironmentSchema = z.object({
  INGESTION_SERVICE_URL: z.string().url().optional(),
  INGESTION_SERVICE_TOKEN: z.string().min(32).optional(),
});
export const apiEnvironmentSchema = baseEnvironmentSchema
  .merge(databaseEnvironmentSchema)
  .merge(redisEnvironmentSchema)
  .merge(storageEnvironmentObjectSchema)
  .extend({
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    AUTH_SESSION_SECRET: z.string().min(32),
    WEB_ORIGIN: z.string().url().optional(),
    PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    PASSWORD_RESET_EMAIL_WEBHOOK_URL: z
      .string()
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Password-reset email webhook URLs must use HTTPS.",
      )
      .optional(),
    PASSWORD_RESET_EMAIL_WEBHOOK_TOKEN: z.string().min(1).optional(),
    MAX_REGENERATIONS_PER_HOUR: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(10),
    RENDER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(1),
    MAX_RENDERS_PER_HOUR: z.coerce.number().int().min(1).max(100).default(12),
  })
  .superRefine((value, context) => {
    validateStorageCredentialPair(value, context);
    if (value.NODE_ENV === "production" && value.WEB_ORIGIN === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEB_ORIGIN"],
        message:
          "WEB_ORIGIN is required in production for CORS and CSRF protection.",
      });
    if (
      value.NODE_ENV === "production" &&
      value.PASSWORD_RESET_EMAIL_WEBHOOK_URL === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["PASSWORD_RESET_EMAIL_WEBHOOK_URL"],
        message:
          "PASSWORD_RESET_EMAIL_WEBHOOK_URL is required in production for password-reset delivery.",
      });
  });
export const workerEnvironmentSchema = baseEnvironmentSchema
  .merge(databaseEnvironmentSchema.partial())
  .merge(redisEnvironmentSchema.partial())
  .merge(storageEnvironmentObjectSchema)
  .merge(malwareScannerEnvironmentSchema)
  .merge(ingestionServiceEnvironmentSchema)
  .superRefine((value, context) => {
    validateStorageCredentialPair(value, context);
    if (
      value.NODE_ENV === "production" &&
      value.MALWARE_SCANNER_URL === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MALWARE_SCANNER_URL"],
        message: "MALWARE_SCANNER_URL is required in production.",
      });
    if (
      value.NODE_ENV === "production" &&
      value.INGESTION_SERVICE_URL === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INGESTION_SERVICE_URL"],
        message: "INGESTION_SERVICE_URL is required in production.",
      });
    if (
      value.NODE_ENV === "production" &&
      value.INGESTION_SERVICE_TOKEN === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INGESTION_SERVICE_TOKEN"],
        message: "INGESTION_SERVICE_TOKEN is required in production.",
      });
  });
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
