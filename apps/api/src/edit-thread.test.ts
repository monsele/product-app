import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { createId } from "@avlp/config";
import type { EditThreadResponse } from "@avlp/schemas";
import { createApp, sessionCookieName } from "./app.js";
import {
  editOperationTarget,
  editPlanFailureMessage,
  type EditThreadService,
} from "./edit-thread.js";

const emptyThread: EditThreadResponse = {
  threadId: null,
  storyboardRevision: 0,
  turnLimit: { limit: 20, used: 0, remaining: 20 },
  messages: [],
  earlierCursor: null,
};

describe("ST-115 edit-thread routes", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());

  async function api() {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      ["owner", { id: fixture.ownerUserId, email: "owner@example.test", displayName: "Owner" }],
      ["other", { id: fixture.otherUserId, email: "other@example.test", displayName: "Other" }],
    ]);
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("unused");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const service: EditThreadService = {
      list: vi.fn(async () => emptyThread),
      postMessage: vi.fn(async () => emptyThread),
      applyPlan: vi.fn(async () => emptyThread),
      dismissPlan: vi.fn(async () => emptyThread),
      undoPlan: vi.fn(async () => emptyThread),
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      editThreadService: service,
      trustedOrigin: "https://teacher.example.test",
    });
    return { fixture, service, server: app.getHttpAdapter().getInstance() };
  }

  it("answers 404 on every thread endpoint for a user without access (AC9)", async () => {
    const { fixture, service, server } = await api();
    const planId = createId();
    const base = `/projects/${fixture.projectId}/edit-thread`;
    for (const [method, url] of [
      ["GET", `${base}/messages`],
      ["POST", `${base}/messages`],
      ["POST", `${base}/plans/${planId}/apply`],
      ["POST", `${base}/plans/${planId}/dismiss`],
      ["POST", `${base}/plans/${planId}/undo`],
    ] as const) {
      const response = await server.inject({
        method,
        url,
        cookies: { [sessionCookieName]: "other" },
        headers: { origin: "https://teacher.example.test", "idempotency-key": "k" },
        ...(method === "POST" ? { payload: {} } : {}),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(404);
    }
    for (const method of Object.values(service)) expect(method).not.toHaveBeenCalled();
    // The first app start in a worker is slow; the routes themselves are not.
  }, 30_000);

  it("passes the authorized scope, body and idempotency key to the service", async () => {
    const { fixture, service, server } = await api();
    const body = {
      text: "Make scene 3 simpler",
      scope: { kind: "lesson", sceneIds: [] },
      expectedRevision: 2,
    };
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/edit-thread/messages`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test", "idempotency-key": "request-1" },
      payload: body,
    });
    expect(response.statusCode).toBe(202);
    expect(service.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        body,
        idempotencyKey: "request-1",
      }),
    );
  });

  it("passes the earlier-page cursor to the service", async () => {
    const { fixture, service, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/edit-thread/messages?before=101`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: fixture.projectId, before: "101" }),
    );
  });

  it("requires a trusted origin to change anything and refuses a malformed plan id", async () => {
    const { fixture, service, server } = await api();
    const untrusted = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/edit-thread/plans/${createId()}/apply`,
      cookies: { [sessionCookieName]: "owner" },
      payload: { expectedRevision: 0 },
    });
    expect(untrusted.statusCode).toBe(403);
    const malformed = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/edit-thread/plans/not-a-plan/undo`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { expectedRevision: 0 },
    });
    expect(malformed.statusCode).toBe(404);
    expect(service.applyPlan).not.toHaveBeenCalled();
    expect(service.undoPlan).not.toHaveBeenCalled();
  });
});

describe("ST-115 operation-to-service mapping", () => {
  it("dispatches every operation to an existing service and answers to none", () => {
    const sceneId = createId();
    expect(
      editOperationTarget({ type: "edit-scene-field", sceneId, path: "title", value: "A", rationale: "r" }),
    ).toBe("storyboard.updateScene");
    expect(editOperationTarget({ type: "reorder-scenes", sceneIds: [sceneId, createId()], rationale: "r" })).toBe(
      "storyboard.reorderScenes",
    );
    expect(editOperationTarget({ type: "regenerate-scene", sceneId, mode: "simplify", rationale: "r" })).toBe(
      "storyboard.regenerateScene",
    );
    expect(
      editOperationTarget({ type: "regenerate-narration-block", blockId: sceneId, mode: "shorten", rationale: "r" }),
    ).toBe("narration.regenerateBlock");
    expect(editOperationTarget({ type: "answer-only", answer: "Which scene?" })).toBeNull();
  });

  it("explains a failed plan without exposing provider details", () => {
    expect(editPlanFailureMessage("MODEL_OUTPUT_DETERMINISTIC_FAILURE")).toMatch(/couldn't plan that change/u);
    expect(editPlanFailureMessage("EDIT_PLAN_STALE")).toMatch(/storyboard changed/u);
    expect(editPlanFailureMessage("AI_QUOTA_EXCEEDED")).toMatch(/limit/u);
    expect(editPlanFailureMessage(null)).toMatch(/couldn't plan that change right now/u);
  });
});
