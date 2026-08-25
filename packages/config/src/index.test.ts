import { describe, expect, it } from "vitest";
import {
  computeLessonStoryboardContentHash,
  computeLessonStoryboardSceneContentHash,
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
        AUTH_RATE_LIMIT_MODE: "shared-edge",
      }).PASSWORD_RESET_TTL_SECONDS,
    ).toBe(900);
  });

  it("requires secure production origins and shared authentication limits", () => {
    const production = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://localhost/app",
      REDIS_URL: "redis://localhost:6379",
      AUTH_SESSION_SECRET: "a".repeat(32),
      PASSWORD_RESET_EMAIL_WEBHOOK_URL:
        "https://mail.example.test/password-reset",
    } as const;

    expect(() =>
      parseEnvironment({
        ...production,
        WEB_ORIGIN: "http://app.example.test",
        AUTH_RATE_LIMIT_MODE: "shared-edge",
      }),
    ).toThrow("must use HTTPS");
    expect(() =>
      parseEnvironment({
        ...production,
        WEB_ORIGIN: "https://app.example.test",
      }),
    ).toThrow("shared-edge");
    expect(
      parseEnvironment({
        ...production,
        WEB_ORIGIN: "https://app.example.test",
        AUTH_RATE_LIMIT_MODE: "shared-edge",
      }),
    ).toMatchObject({
      AUTH_RATE_LIMIT_MODE: "shared-edge",
      MAX_PROVIDER_CALLS_PER_HOUR: 60,
      PASSWORD_RESET_RESPONSE_FLOOR_MS: 250,
    });
    expect(
      parseEnvironment({
        DATABASE_URL: "postgresql://localhost/app",
        REDIS_URL: "redis://localhost:6379",
        AUTH_SESSION_SECRET: "a".repeat(32),
        WEB_ORIGIN: "http://127.0.0.1:3000",
      }).WEB_ORIGIN,
    ).toBe("http://127.0.0.1:3000");
  });

  it("validates optional worker values when they are supplied", () => {
    expect(() => parseWorkerEnvironment({ REDIS_URL: "not-a-url" })).toThrow();
    expect(() => parseWorkerEnvironment({ NODE_ENV: "production" })).toThrow(
      "MALWARE_SCANNER_URL",
    );
    expect(() =>
      parseWorkerEnvironment({ MALWARE_SCANNER_URL: "http://scanner.test" }),
    ).toThrow("must use HTTPS");
    expect(parseWorkerEnvironment({})).toMatchObject({
      MAX_PROVIDER_CALLS_PER_HOUR: 60,
      MAX_REGENERATIONS_PER_HOUR: 10,
    });
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

describe("storyboard content hashes", () => {
  const scene = {
    template: "definition",
    title: "Evaporation",
    narration: "Heating water turns it into vapour.",
    durationSeconds: 30,
    onScreenText: ["Key term"],
    transition: "cut",
    visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    sourceRefs: [
      {
        documentId: "019ffbf1-4444-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 1,
        blockIds: ["019ffbf1-2222-7000-8000-000000000001"],
      },
    ],
    generatedAdditions: [],
    assetBindings: [],
  };

  it("is deterministic for identical scene content", () => {
    const first = computeLessonStoryboardSceneContentHash(scene);
    const second = computeLessonStoryboardSceneContentHash(scene);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when scene content changes", () => {
    const base = computeLessonStoryboardSceneContentHash(scene);
    const changed = computeLessonStoryboardSceneContentHash({
      ...scene,
      narration: "Water vapour rises when water is heated.",
    });
    expect(changed).not.toBe(base);
  });

  it("is deterministic for an identical storyboard", () => {
    const scenes = [
      {
        contentHash: computeLessonStoryboardSceneContentHash(scene),
        narrationBlockIds: ["019ffbf1-2222-7000-8000-000000000001"],
        assetRequirements: [{ slot: "subject", purpose: "A subject image." }],
      },
    ];
    const first = computeLessonStoryboardContentHash({
      totalDurationSeconds: 30,
      objectiveIds: ["019ffbf1-9999-7000-8000-000000000001"],
      scenes,
    });
    const second = computeLessonStoryboardContentHash({
      totalDurationSeconds: 30,
      objectiveIds: ["019ffbf1-9999-7000-8000-000000000001"],
      scenes,
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when scene order or assignment changes", () => {
    const sceneHash = computeLessonStoryboardSceneContentHash(scene);
    const base = computeLessonStoryboardContentHash({
      totalDurationSeconds: 60,
      objectiveIds: ["019ffbf1-9999-7000-8000-000000000001"],
      scenes: [
        {
          contentHash: sceneHash,
          narrationBlockIds: ["019ffbf1-2222-7000-8000-000000000001"],
          assetRequirements: [],
        },
        {
          contentHash: sceneHash,
          narrationBlockIds: ["019ffbf1-2223-7000-8000-000000000001"],
          assetRequirements: [],
        },
      ],
    });
    const swapped = computeLessonStoryboardContentHash({
      totalDurationSeconds: 60,
      objectiveIds: ["019ffbf1-9999-7000-8000-000000000001"],
      scenes: [
        {
          contentHash: sceneHash,
          narrationBlockIds: ["019ffbf1-2223-7000-8000-000000000001"],
          assetRequirements: [],
        },
        {
          contentHash: sceneHash,
          narrationBlockIds: ["019ffbf1-2222-7000-8000-000000000001"],
          assetRequirements: [],
        },
      ],
    });
    expect(swapped).not.toBe(base);
  });
});
