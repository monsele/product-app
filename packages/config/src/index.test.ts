import { describe, expect, it } from "vitest";
import {
  createId,
  databaseEnvironmentSchema,
  getCorrelationId,
  identifierSchema,
  parseEnvironment,
  parseWorkerEnvironment,
  parseWebEnvironment,
  PublicError,
  postgresUrlSchema,
  redisEnvironmentSchema,
  serializeUtcTimestamp,
  storageEnvironmentSchema,
  toApiErrorEnvelope,
} from "./index.js";

describe("parseEnvironment", () => {
  it("accepts required service connection values", () => {
    expect(
      parseEnvironment({
        DATABASE_URL: "postgresql://localhost/app",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
      }).PORT,
    ).toBe(3001);
  });

  it("rejects invalid external configuration at the boundary", () => {
    expect(() =>
      parseEnvironment({
        DATABASE_URL: "not-a-url",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
      }),
    ).toThrow();
    expect(() =>
      parseEnvironment({
        DATABASE_URL: "https://database.example.test/app",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
      }),
    ).toThrow("PostgreSQL connection URL");
  });

  it("requires the browser origin for production cookie authentication", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/app",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
      }),
    ).toThrow("WEB_ORIGIN");
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/app",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
        WEB_ORIGIN: "https://app.example.test",
      }),
    ).toThrow("PASSWORD_RESET_EMAIL_WEBHOOK_URL");
    expect(
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://localhost/app",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
        WEB_ORIGIN: "https://app.example.test",
        PASSWORD_RESET_EMAIL_WEBHOOK_URL:
          "https://mail.example.test/password-reset",
      }).PASSWORD_RESET_TTL_SECONDS,
    ).toBe(900);
  });

  it("validates optional worker values when they are supplied", () => {
    expect(() => parseWorkerEnvironment({ REDIS_URL: "not-a-url" })).toThrow();
  });

  it("exports reusable database, Redis, and storage schemas", () => {
    expect(postgresUrlSchema.parse("postgres://localhost/app")).toBe(
      "postgres://localhost/app",
    );
    expect(
      databaseEnvironmentSchema.parse({
        DATABASE_URL: "postgresql://localhost/app",
      }),
    ).toEqual({ DATABASE_URL: "postgresql://localhost/app" });
    expect(
      redisEnvironmentSchema.parse({ REDIS_URL: "redis://localhost:6379" }),
    ).toEqual({ REDIS_URL: "redis://localhost:6379" });
    expect(
      storageEnvironmentSchema.parse({
        NODE_ENV: "development",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
        OBJECT_STORAGE_BUCKET: "uploads",
        OBJECT_STORAGE_FORCE_PATH_STYLE: "true",
      }),
    ).toMatchObject({
      OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
      OBJECT_STORAGE_BUCKET: "uploads",
      OBJECT_STORAGE_FORCE_PATH_STYLE: true,
      OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT: false,
      SIGNED_URL_TTL_SECONDS: 300,
    });
    expect(() =>
      storageEnvironmentSchema.parse({
        OBJECT_STORAGE_ACCESS_KEY: "local-key",
      }),
    ).toThrow("must be supplied together");
    expect(() =>
      storageEnvironmentSchema.parse({
        OBJECT_STORAGE_ENDPOINT: "http://storage.example.test",
      }),
    ).toThrow("must use HTTPS");
    expect(
      storageEnvironmentSchema.parse({
        NODE_ENV: "test",
        OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
        OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT: "true",
      }).OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
    ).toBe(true);
    expect(() =>
      storageEnvironmentSchema.parse({
        NODE_ENV: "development",
        OBJECT_STORAGE_ENDPOINT: "http://storage.example.test",
        OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT: "true",
      }),
    ).toThrow("local loopback host");
    expect(() =>
      storageEnvironmentSchema.parse({
        NODE_ENV: "production",
        OBJECT_STORAGE_ENDPOINT: "http://localhost:9000",
        OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT: "true",
      }),
    ).toThrow("forbidden in production");
    expect(() =>
      parseWorkerEnvironment({
        NODE_ENV: "production",
        OBJECT_STORAGE_ENDPOINT: "http://storage.internal",
        OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT: "true",
      }),
    ).toThrow("forbidden in production");
  });

  it("rejects invalid web configuration values", () => {
    expect(() =>
      parseWebEnvironment({ NEXT_PUBLIC_API_URL: "not-a-url" }),
    ).toThrow();
  });

  it("uses sortable UUIDv7 IDs and UTC timestamps", () => {
    const first = createId(new Date("2026-08-07T00:00:00.000Z"));
    const second = createId(new Date("2026-08-07T00:00:01.000Z"));
    expect(identifierSchema.parse(first)).toBe(first);
    expect(first < second).toBe(true);
    expect(serializeUtcTimestamp(new Date("2026-08-07T00:00:00.000Z"))).toBe(
      "2026-08-07T00:00:00.000Z",
    );
  });

  it("reuses valid correlation IDs and formats unknown errors safely", () => {
    const correlationId = createId();
    expect(getCorrelationId(correlationId)).toBe(correlationId);
    expect(
      toApiErrorEnvelope(new Error("secret provider payload"), correlationId),
    ).toEqual({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        retryable: true,
        correlationId,
      },
    });
  });

  it("preserves only documented public error details", () => {
    const correlationId = createId();
    expect(
      toApiErrorEnvelope(
        new PublicError("validation_failed", "Invalid input.", 400, false, {
          title: "Required.",
        }),
        correlationId,
      ),
    ).toEqual({
      error: {
        code: "validation_failed",
        message: "Invalid input.",
        fieldErrors: { title: "Required." },
        retryable: false,
        correlationId,
      },
    });
  });
});
