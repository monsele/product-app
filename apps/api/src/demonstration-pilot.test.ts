/**
 * ST-096 — the pilot's API behaviour.
 *
 * These cover the decisions that are cheap to get wrong and expensive to
 * notice: who may reach the routes, whether a paused pilot still blocks new
 * work, whether the two halves of a pair can collide on a render identity, and
 * whether a demonstration-configured lesson can slip through the ordinary
 * render endpoint and quietly produce standard visuals.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { DatabaseClient } from "@avlp/database";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import {
  createEnvironmentPilotCohort,
  PostgresDemonstrationPilotService,
} from "./demonstration-pilot.js";
import { PostgresRenderService, renderIdempotencyKey } from "./renders.js";

function gateway(fixture: ReturnType<typeof createCrossUserProjectFixture>) {
  const auth: AuthGateway = {
    register: async () => {
      throw new Error("not used");
    },
    signIn: async () => null,
    currentSession: async (token) =>
      token === "owner"
        ? {
            id: fixture.ownerUserId,
            email: "owner@example.test",
            displayName: "Owner",
          }
        : token === "other"
          ? {
              id: fixture.otherUserId,
              email: "other@example.test",
              displayName: "Other",
            }
          : null,
    signOut: async () => {},
    requestPasswordReset: async () => {},
    confirmPasswordReset: async () => {},
  };
  return auth;
}

function pilotStub() {
  return {
    eligibility: vi.fn().mockResolvedValue({
      experimentVersion: "st-096-pilot-1",
      reasons: [],
      recipes: [],
      selectable: true,
      supportedTestLesson: null,
      visible: true,
    }),
    list: vi.fn().mockResolvedValue({ comparisons: [], eligibility: {} }),
    create: vi.fn().mockResolvedValue({ id: "created" }),
    detail: vi.fn().mockResolvedValue({ id: "detail" }),
    requestVariant: vi.fn().mockResolvedValue({ id: "variant" }),
    retryVariant: vi.fn().mockResolvedValue({ id: "retried" }),
    feedback: vi.fn().mockResolvedValue({ revision: 0 }),
    saveFeedback: vi.fn().mockResolvedValue({ revision: 1 }),
  };
}

describe("demonstration pilot route authorization", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("hides a project's comparisons from another tenant", async () => {
    const fixture = createCrossUserProjectFixture();
    const pilot = pilotStub();
    app = await createApp({
      authGateway: gateway(fixture),
      demonstrationPilotService: pilot,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: "https://app.example.test",
    });
    const server = app.getHttpAdapter().getInstance();

    const foreign = await server.inject({
      cookies: { [sessionCookieName]: "other" },
      method: "GET",
      url: `/projects/${fixture.projectId}/demonstration-comparisons`,
    });
    expect(foreign.statusCode).toBe(404);
    expect(pilot.list).not.toHaveBeenCalled();

    const owner = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      method: "GET",
      url: `/projects/${fixture.projectId}/demonstration-comparisons`,
    });
    expect(owner.statusCode).toBe(200);
    expect(pilot.list).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      }),
    );
  });

  it("refuses a cross-tenant comparison creation and a foreign feedback write", async () => {
    const fixture = createCrossUserProjectFixture();
    const pilot = pilotStub();
    app = await createApp({
      authGateway: gateway(fixture),
      demonstrationPilotService: pilot,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: "https://app.example.test",
    });
    const server = app.getHttpAdapter().getInstance();

    const created = await server.inject({
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://app.example.test" },
      method: "POST",
      payload: {
        approach: "demonstration",
        lessonVersionId: fixture.projectId,
      },
      url: `/projects/${fixture.projectId}/demonstration-comparisons`,
    });
    expect(created.statusCode).toBe(404);
    expect(pilot.create).not.toHaveBeenCalled();

    const feedback = await server.inject({
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://app.example.test" },
      method: "PUT",
      payload: {
        comment: null,
        expectedRevision: 0,
        preference: null,
        ratings: [],
      },
      url: `/projects/${fixture.projectId}/demonstration-comparisons/${fixture.projectId}/feedback`,
    });
    expect(feedback.statusCode).toBe(404);
    expect(pilot.saveFeedback).not.toHaveBeenCalled();
  });

  it("rejects a write from an untrusted origin", async () => {
    const fixture = createCrossUserProjectFixture();
    const pilot = pilotStub();
    app = await createApp({
      authGateway: gateway(fixture),
      demonstrationPilotService: pilot,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: "https://app.example.test",
    });
    const server = app.getHttpAdapter().getInstance();
    const response = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://evil.example.test" },
      method: "POST",
      payload: {
        approach: "demonstration",
        lessonVersionId: fixture.projectId,
      },
      url: `/projects/${fixture.projectId}/demonstration-comparisons`,
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(pilot.create).not.toHaveBeenCalled();
  });

  it("reports the experiment as invisible when no pilot is configured", async () => {
    // The default service, not a stub: an API started without the pilot must
    // show no experimental control rather than one that fails when used.
    const fixture = createCrossUserProjectFixture();
    app = await createApp({
      authGateway: gateway(fixture),
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      trustedOrigin: "https://app.example.test",
    });
    const server = app.getHttpAdapter().getInstance();
    const response = await server.inject({
      cookies: { [sessionCookieName]: "owner" },
      method: "GET",
      url: `/projects/${fixture.projectId}/demonstration-eligibility`,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      visible: boolean;
      selectable: boolean;
      reasons: { code: string }[];
    };
    expect(body.visible).toBe(false);
    expect(body.selectable).toBe(false);
    expect(body.reasons[0]?.code).toBe("pilot_disabled");
  });
});

describe("the pilot cohort", () => {
  const fixture = createCrossUserProjectFixture();

  it("is closed when the environment says nothing", () => {
    const cohort = createEnvironmentPilotCohort({});
    expect(cohort.enabled()).toBe(false);
    expect(cohort.includes(fixture.ownerUserId)).toBe(false);
  });

  it("admits only the listed accounts, case-insensitively", () => {
    const cohort = createEnvironmentPilotCohort({
      DEMONSTRATION_PILOT_ENABLED: true,
      DEMONSTRATION_PILOT_USER_IDS: ` ${fixture.ownerUserId.toUpperCase()} , `,
    });
    expect(cohort.enabled()).toBe(true);
    expect(cohort.includes(fixture.ownerUserId)).toBe(true);
    expect(cohort.includes(fixture.otherUserId)).toBe(false);
  });

  it("tells a non-member why, and offers a supported test lesson to a member", async () => {
    const database = { transaction: vi.fn() } as unknown as DatabaseClient;
    const renders = { retry: vi.fn(), start: vi.fn() };
    const storage = { getMetadata: vi.fn() };

    const outsider = new PostgresDemonstrationPilotService(
      database,
      createEnvironmentPilotCohort({ DEMONSTRATION_PILOT_ENABLED: true }),
      renders,
      storage,
    );
    const answer = await outsider.eligibility({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    expect(answer.visible).toBe(false);
    expect(answer.selectable).toBe(false);
    expect(answer.reasons[0]?.code).toBe("not_in_cohort");
    // A cohort refusal must not tell the teacher to change their lesson.
    expect(answer.supportedTestLesson).toBeNull();
    expect(renders.start).not.toHaveBeenCalled();
  });

  it("blocks new experimental work while the flag is off, without hiding the control", async () => {
    const database = { transaction: vi.fn() } as unknown as DatabaseClient;
    const renders = { retry: vi.fn(), start: vi.fn() };
    const storage = { getMetadata: vi.fn() };
    const service = new PostgresDemonstrationPilotService(
      database,
      createEnvironmentPilotCohort({
        DEMONSTRATION_PILOT_ENABLED: false,
        DEMONSTRATION_PILOT_USER_IDS: fixture.ownerUserId,
      }),
      renders,
      storage,
    );
    const answer = await service.eligibility({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    expect(answer.visible).toBe(true);
    expect(answer.selectable).toBe(false);
    expect(answer.reasons[0]?.code).toBe("pilot_disabled");
    expect(answer.reasons[0]?.suggestedCorrection).toMatch(/remain available/i);

    await expect(
      service.create({
        body: { approach: "demonstration", lessonVersionId: fixture.projectId },
        correlationId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(renders.start).not.toHaveBeenCalled();
  });

  it("rejects a direct variant request from an account removed from the cohort", async () => {
    const database = { transaction: vi.fn() } as unknown as DatabaseClient;
    const renders = { retry: vi.fn(), start: vi.fn() };
    const service = new PostgresDemonstrationPilotService(
      database,
      createEnvironmentPilotCohort({ DEMONSTRATION_PILOT_ENABLED: true }),
      renders,
      { getMetadata: vi.fn() },
    );

    await expect(
      service.requestVariant({
        body: { approach: "demonstration" },
        comparisonId: fixture.projectId,
        correlationId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(renders.start).not.toHaveBeenCalled();
  });
});

describe("render identity across the two approaches", () => {
  const fixture = createCrossUserProjectFixture();
  const contentHash = "a".repeat(64);

  it("keeps the pre-pilot key byte-identical when no variant is involved", () => {
    const before = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
    });
    const again = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
    });
    expect(again).toBe(before);
  });

  it("gives the two halves of one pair different keys", () => {
    const comparisonId = fixture.projectId;
    const standard = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
      variant: { approach: "standard", comparisonId, planSha256: null },
    });
    const demonstration = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
      variant: {
        approach: "demonstration",
        comparisonId,
        planSha256: "b".repeat(64),
      },
    });
    expect(demonstration).not.toBe(standard);
    // And neither may collide with an ordinary project render of the same
    // lesson version, or a comparison would adopt work it did not commission.
    const plain = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
    });
    expect(standard).not.toBe(plain);
    expect(demonstration).not.toBe(plain);
  });

  it("changes the demonstration key when its resolved plan changes", () => {
    const comparisonId = fixture.projectId;
    const first = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
      variant: {
        approach: "demonstration",
        comparisonId,
        planSha256: "b".repeat(64),
      },
    });
    const second = renderIdempotencyKey({
      lessonVersionContentHash: contentHash,
      projectId: fixture.projectId,
      variant: {
        approach: "demonstration",
        comparisonId,
        planSha256: "c".repeat(64),
      },
    });
    expect(second).not.toBe(first);
  });
});

describe("the ordinary render endpoint and a demonstration lesson", () => {
  it("refuses rather than producing standard visuals under a demonstration label", async () => {
    const fixture = createCrossUserProjectFixture();
    const version = {
      configurationVersion: 1,
      contentHash: "a".repeat(64),
      id: fixture.projectId,
      lessonSpecId: fixture.projectId,
      lessonSpecRevision: 0,
      sceneLibraryVersion: "mvp-v1",
      snapshot: {
        configuration: { videoApproach: "demonstration" },
        lessonSpec: { scenes: [] },
      },
      sourceSnapshotId: fixture.projectId,
    };
    const validation = {
      id: fixture.projectId,
      inputHash: "b".repeat(64),
    };
    const rows: unknown[][] = [[version], [validation], []];
    const select = () => {
      const result = rows.shift() ?? [];
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        orderBy: () => query,
        limit: () => query,
        for: () => query,
        then: <T1 = unknown, T2 = never>(
          onfulfilled?: ((value: unknown[]) => T1 | PromiseLike<T1>) | null,
          onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
        ) => Promise.resolve(result).then(onfulfilled, onrejected),
      };
      return query;
    };
    const database = {
      execute: async () => undefined,
      select,
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(database),
    } as unknown as DatabaseClient;

    const service = new PostgresRenderService(database, {
      latest: async () => ({
        id: fixture.projectId,
        stale: false,
        status: "passed",
      }),
    } as never);

    await expect(
      service.start({
        body: { lessonVersionId: fixture.projectId },
        correlationId: fixture.ownerUserId,
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
  });
});
