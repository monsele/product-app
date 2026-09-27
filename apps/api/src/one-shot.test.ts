/**
 * ST-105 — prompt-to-video routes: tenant isolation, cohort gating, flag
 * drain semantics, the estimate, and the closed default of an unwired server.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Identifier } from "@avlp/config";
import type { DatabaseClient } from "@avlp/database";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import {
  createEnvironmentOneShotCohort,
  estimateOneShotRun,
  PostgresOneShotService,
  type OneShotPricing,
  type OneShotService,
} from "./one-shot.js";

const origin = "https://app.example.test";
const pricing: OneShotPricing = {
  modelCallCostUsd: 1.08,
  imageCostUsd: 0.00225,
  ttsCostUsdPerMillionCharacters: 15,
  alignmentCostUsdPerAudioMinute: 0.0015,
};

function gateway(fixture: ReturnType<typeof createCrossUserProjectFixture>) {
  const auth: AuthGateway = {
    register: async () => {
      throw new Error("not used");
    },
    signIn: async () => null,
    currentSession: async (token) =>
      token === "owner"
        ? { id: fixture.ownerUserId, email: "owner@example.test", displayName: "Owner" }
        : token === "other"
          ? { id: fixture.otherUserId, email: "other@example.test", displayName: "Other" }
          : null,
    signOut: async () => {},
    requestPasswordReset: async () => {},
    confirmPasswordReset: async () => {},
  };
  return auth;
}

function serviceStub() {
  const response = {
    eligibility: { visible: true, canStart: true, reasons: [] },
    run: null,
  };
  return {
    eligibility: vi.fn().mockResolvedValue(response.eligibility),
    estimate: vi.fn().mockResolvedValue({ totalUsd: 1 }),
    create: vi.fn().mockResolvedValue(response),
    current: vi.fn().mockResolvedValue(response),
    render: vi.fn().mockResolvedValue(response),
    resume: vi.fn().mockResolvedValue(response),
    cancel: vi.fn().mockResolvedValue(response),
  } satisfies Record<keyof OneShotService, unknown>;
}

const routes = (projectId: string) =>
  [
    { method: "GET", url: `/projects/${projectId}/one-shot/eligibility`, call: "eligibility" },
    { method: "POST", url: `/projects/${projectId}/one-shot/estimate`, call: "estimate" },
    { method: "POST", url: `/projects/${projectId}/one-shot`, call: "create" },
    { method: "GET", url: `/projects/${projectId}/one-shot`, call: "current" },
    { method: "POST", url: `/projects/${projectId}/one-shot/render`, call: "render" },
    { method: "POST", url: `/projects/${projectId}/one-shot/resume`, call: "resume" },
    { method: "POST", url: `/projects/${projectId}/one-shot/cancel`, call: "cancel" },
  ] as const;

/** A database that fails the test if the cohort gate lets a call through. */
const unreachableDatabase = new Proxy(
  {},
  {
    get: () => {
      throw new Error("The cohort gate must refuse before touching the database.");
    },
  },
) as DatabaseClient;

function realService(cohort: { enabled: boolean; members: string }) {
  return new PostgresOneShotService(
    unreachableDatabase,
    createEnvironmentOneShotCohort({
      ONE_SHOT_PILOT_ENABLED: cohort.enabled,
      ONE_SHOT_PILOT_USER_IDS: cohort.members,
    }),
    { schedule: vi.fn() },
    { saveLessonVersion: vi.fn(), startRender: vi.fn() },
    { pricing, maxRunsPerHour: 3 },
  );
}

describe("ST-105 prompt-to-video routes", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function start(
    serviceFor?: (
      fixture: ReturnType<typeof createCrossUserProjectFixture>,
    ) => OneShotService,
  ) {
    const fixture = createCrossUserProjectFixture();
    const oneShotService = serviceFor?.(fixture);
    app = await createApp({
      authGateway: gateway(fixture),
      ...(oneShotService === undefined ? {} : { oneShotService }),
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: origin,
    });
    return { fixture, server: app.getHttpAdapter().getInstance() };
  }

  it("rejects a cross-tenant project id on every endpoint before the service runs", async () => {
    const stub = serviceStub();
    const { fixture, server } = await start(() => stub);
    for (const route of routes(fixture.projectId)) {
      const response = await server.inject({
        cookies: { [sessionCookieName]: "other" },
        headers: { origin, "idempotency-key": "k-1" },
        method: route.method,
        url: route.url,
        ...(route.method === "POST" ? { payload: {} } : {}),
      });
      expect(response.statusCode, route.url).toBe(404);
    }
    for (const method of Object.values(stub)) expect(method).not.toHaveBeenCalled();
  }, 30_000);

  it("passes the owner's scope, correlation id and idempotency key through", async () => {
    const stub = serviceStub();
    const { fixture, server } = await start(() => stub);
    for (const route of routes(fixture.projectId)) {
      const response = await server.inject({
        cookies: { [sessionCookieName]: "owner" },
        headers: { origin, "idempotency-key": "k-1" },
        method: route.method,
        url: route.url,
        ...(route.method === "POST" ? { payload: { targetDurationSeconds: 180 } } : {}),
      });
      expect(response.statusCode, route.url).toBeLessThan(300);
      expect(stub[route.call]).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: fixture.ownerUserId,
          projectId: fixture.projectId,
        }),
      );
    }
    expect(stub.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "k-1", correlationId: expect.any(String) }),
    );
  }, 30_000);

  it("refuses writes from an untrusted origin", async () => {
    const stub = serviceStub();
    const { fixture, server } = await start(() => stub);
    const response = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://evil.example.test", "idempotency-key": "k-1" },
      method: "POST",
      url: `/projects/${fixture.projectId}/one-shot`,
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(stub.create).not.toHaveBeenCalled();
  });

  it("hides the feature from users outside the cohort and refuses every write with 409", async () => {
    const { fixture, server } = await start(() =>
      realService({ enabled: true, members: "" }),
    );

    const current = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      method: "GET",
      url: `/projects/${fixture.projectId}/one-shot`,
    });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toEqual({
      eligibility: {
        visible: false,
        canStart: false,
        reasons: [expect.objectContaining({ code: "not_in_cohort" })],
      },
      run: null,
    });
    for (const route of routes(fixture.projectId).filter((entry) => entry.method === "POST")) {
      const response = await server.inject({
        cookies: { [sessionCookieName]: "owner" },
        headers: { origin, "idempotency-key": "k-1" },
        method: "POST",
        url: route.url,
        payload: {},
      });
      expect(response.statusCode, route.url).toBe(409);
    }
  }, 30_000);

  it("with the flag off, rejects new runs but still lets cohort members reach existing ones", async () => {
    let service: PostgresOneShotService | undefined;
    const { fixture, server } = await start((created) => {
      service = realService({ enabled: false, members: created.ownerUserId });
      return service;
    });
    await expect(
      service!.eligibility({
        ownerUserId: fixture.ownerUserId as Identifier,
        projectId: fixture.projectId as Identifier,
      }),
    ).resolves.toEqual({
      visible: true,
      canStart: false,
      reasons: [expect.objectContaining({ code: "pilot_disabled" })],
    });
    for (const url of [`/projects/${fixture.projectId}/one-shot`, `/projects/${fixture.projectId}/one-shot/estimate`]) {
      const response = await server.inject({
        cookies: { [sessionCookieName]: "owner" },
        headers: { origin, "idempotency-key": "k-1" },
        method: "POST",
        url,
        payload: { targetDurationSeconds: 180 },
      });
      expect(response.statusCode, url).toBe(409);
    }
  });

  it("answers invisible and 409 when the server has no runner wired", async () => {
    const { fixture, server } = await start();
    const current = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      method: "GET",
      url: `/projects/${fixture.projectId}/one-shot`,
    });
    expect(current.json()).toMatchObject({ eligibility: { visible: false }, run: null });
    const created = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin, "idempotency-key": "k-1" },
      method: "POST",
      url: `/projects/${fixture.projectId}/one-shot`,
      payload: {},
    });
    expect(created.statusCode).toBe(409);
  });
});

describe("ST-105 prompt-to-video estimate", () => {
  it("itemises the whole chain and scales with the lesson length", () => {
    const short = estimateOneShotRun({ targetDurationSeconds: 180, pricing });
    const long = estimateOneShotRun({ targetDurationSeconds: 420, pricing });
    expect(short.items.map((item) => item.key)).toEqual([
      "ai.lesson-intent",
      "ai.objectives",
      "ai.outline",
      "ai.narration",
      "ai.storyboard",
      "ai.grounding",
      "image.generation",
      "tts.generation",
      "tts.alignment",
    ]);
    expect(short.estimatedScenes).toBe(6);
    expect(short.totalUsd).toBeCloseTo(
      short.items.reduce((sum, item) => sum + item.costUsd, 0),
      6,
    );
    expect(long.totalUsd).toBeGreaterThan(short.totalUsd);
    // Six bounded model calls dominate the estimate.
    expect(short.totalUsd).toBeGreaterThanOrEqual(6 * 1.08);
  });
});
