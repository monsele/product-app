import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  createCrossUserProjectFixture,
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  type AuthGateway,
} from "@avlp/auth";
import {
  approvedVoiceCatalog,
  approvedVoicePreview,
  voiceConfigurationChanged,
  type VoiceConfigurationService,
} from "./voice-configuration.js";
import { createApp, sessionCookieName } from "./app.js";
import type { SceneAudioService } from "./scene-audio.js";

describe("voice catalog", () => {
  it("only maps approved English voices without provider identifiers", () => {
    const voices = approvedVoiceCatalog("https://teacher.example.test");
    expect(voices).toHaveLength(3);
    expect(
      voices.every(
        (voice) =>
          voice.language === "en-US" &&
          !JSON.stringify(voice).toLowerCase().includes("provider"),
      ),
    ).toBe(true);
    expect(approvedVoicePreview("unsupported")).toBeUndefined();
    expect(approvedVoicePreview("english-aria")).toMatchObject({
      contentType: "audio/wav",
    });
    expect(
      approvedVoicePreview("english-aria")?.bytes.byteLength,
    ).toBeGreaterThan(8_000);
  });
});

describe("voice configuration invalidation", () => {
  const base = {
    voiceId: "english-aria" as const,
    speakingRate: 1,
    pronunciationOverrides: [{ phrase: "Docling", replacement: "dock-ling" }],
  };
  it("invalidates the global audio/caption dependency for voice, rate, and pronunciation changes", () => {
    expect(
      voiceConfigurationChanged(base, { ...base, voiceId: "english-luna" }),
    ).toBe(true);
    expect(
      voiceConfigurationChanged(base, { ...base, speakingRate: 1.1 }),
    ).toBe(true);
    expect(
      voiceConfigurationChanged(base, {
        ...base,
        pronunciationOverrides: [
          { phrase: "Docling", replacement: "dock ling" },
        ],
      }),
    ).toBe(true);
    expect(
      voiceConfigurationChanged(base, {
        ...base,
        pronunciationOverrides: [...base.pronunciationOverrides],
      }),
    ).toBe(false);
  });
});

describe("voice configuration API", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());
  it("authorizes previews, uses private cache headers, and accepts an owner save", async () => {
    const fixture = createCrossUserProjectFixture();
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("unused");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "owner"
          ? {
              id: fixture.ownerUserId,
              email: "owner@example.test",
              displayName: "Owner",
            }
          : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const service: VoiceConfigurationService = {
      get: async () => ({ configuration: null }),
      save: async () => ({
        configuration: {
          version: 1,
          voiceId: "english-aria",
          speakingRate: 1,
          pronunciationOverrides: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    };
    const audio: Pick<SceneAudioService, "generate" | "status"> = {
      generate: async (input) => ({
        sceneId: input.sceneId,
        status: "queued",
        jobId: fixture.projectId,
        durationMs: null,
        fitWarning: null,
        failureCode: null,
        captions: [],
        retryable: false,
      }),
      status: async (input) => ({
        sceneId: input.sceneId,
        status: "failed",
        jobId: null,
        durationMs: null,
        fitWarning: null,
        failureCode: "TTS_GENERATION_FAILED",
        captions: [],
        retryable: true,
      }),
    };
    const audioWithBatch = {
      ...audio,
      generateAll: async () => ({
        totalScenes: 1,
        readyScenes: 0,
        pendingScenes: 1,
        failedScenes: 0,
        scenes: [
          {
            sceneId: fixture.projectId,
            status: "queued" as const,
            jobId: fixture.projectId,
            durationMs: null,
            fitWarning: null,
            failureCode: null,
            captions: [],
            retryable: false,
          },
        ],
      }),
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      voiceConfigurationService: service,
      sceneAudioService: audioWithBatch,
      trustedOrigin: "https://teacher.example.test",
    });
    const server = app.getHttpAdapter().getInstance();
    expect(
      (await server.inject({ method: "GET", url: "/voices" })).statusCode,
    ).toBe(401);
    const preview = await server.inject({
      method: "GET",
      url: "/voices/english-aria/preview",
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["cache-control"]).toContain("private");
    expect(preview.headers["content-type"]).toContain("audio/wav");
    const saved = await server.inject({
      method: "PUT",
      url: `/projects/${fixture.projectId}/voice-configuration`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: {
        expectedVersion: 0,
        voiceId: "english-aria",
        speakingRate: 1,
        pronunciationOverrides: [],
      },
    });
    expect(saved.statusCode).toBe(200);
    const queued = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/scenes/${fixture.projectId}/audio/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: { idempotencyKey: "audio-request-1" },
    });
    expect(queued.statusCode).toBe(202);
    const batch = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/audio/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: { idempotencyKey: "lesson-audio-request-1" },
    });
    expect(batch.statusCode).toBe(202);
    expect(batch.json()).toMatchObject({ totalScenes: 1, pendingScenes: 1 });
    const untrustedBatch = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/audio/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://attacker.example.test",
        "content-type": "application/json",
      },
      payload: { idempotencyKey: "lesson-audio-request-2" },
    });
    expect(untrustedBatch.statusCode).toBe(403);
  });
});
