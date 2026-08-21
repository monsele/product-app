import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import {
  groundingCheckResponseSchema,
  groundingCheckResultResponseSchema,
  type GroundingCheckResponse,
  type GroundingCheckResultResponse,
} from "@avlp/schemas";
import type { GroundingService } from "./grounding.js";
import { createApp, sessionCookieName } from "./app.js";

const lessonSpecId = "019ffbf1-6151-738a-b087-6775ff97568c";

const queuedResponse: GroundingCheckResponse = groundingCheckResponseSchema.parse(
  {
    jobId: "019ffbf1-6151-738a-b087-6775ff97568e",
    status: "queued",
    cached: false,
  },
);

const emptyResult: GroundingCheckResultResponse =
  groundingCheckResultResponseSchema.parse({ check: null, latestJob: null });

describe("grounding check API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<GroundingService>) {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner",
        {
          id: fixture.ownerUserId,
          email: "owner@example.test",
          displayName: "Owner",
        },
      ],
      [
        "other",
        {
          id: fixture.otherUserId,
          email: "other@example.test",
          displayName: "Other",
        },
      ],
    ]);
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("Not used");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const groundingService: GroundingService = {
      check: vi.fn(async () => queuedResponse),
      current: vi.fn(async () => emptyResult),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      groundingService,
      trustedOrigin: "https://teacher.example.test",
    });
    return { fixture, server: app.getHttpAdapter().getInstance(), groundingService };
  }

  describe("POST /projects/:projectId/grounding-checks", () => {
    const body = {
      scope: "lesson",
      lessonSpecId,
      lessonSpecRevision: 0,
    };

    it("queues a grounding check for the project owner", async () => {
      const { fixture, server, groundingService } = await api();
      const response = await server.inject({
        method: "POST",
        url: `/projects/${fixture.projectId}/grounding-checks`,
        headers: {
          origin: "https://teacher.example.test",
          "idempotency-key": "grounding-key-1",
        },
        payload: body,
        cookies: { [sessionCookieName]: "owner" },
      });
      expect(response.statusCode).toBe(202);
      expect(groundingService.check).toHaveBeenCalledWith({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        body,
        idempotencyKey: "grounding-key-1",
        correlationId: expect.any(String),
      });
      expect(JSON.parse(response.body)).toEqual(queuedResponse);
    });

    it("hides the action from another teacher", async () => {
      const { fixture, server, groundingService } = await api();
      const response = await server.inject({
        method: "POST",
        url: `/projects/${fixture.projectId}/grounding-checks`,
        headers: {
          origin: "https://teacher.example.test",
          "idempotency-key": "grounding-key-1",
        },
        payload: body,
        cookies: { [sessionCookieName]: "other" },
      });
      expect(response.statusCode).toBe(404);
      expect(groundingService.check).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request", async () => {
      const { fixture, server } = await api();
      const response = await server.inject({
        method: "POST",
        url: `/projects/${fixture.projectId}/grounding-checks`,
        headers: {
          origin: "https://teacher.example.test",
          "idempotency-key": "grounding-key-1",
        },
        payload: body,
      });
      expect(response.statusCode).toBe(401);
    });

    it("rejects requests from an untrusted origin", async () => {
      const { fixture, server, groundingService } = await api();
      const response = await server.inject({
        method: "POST",
        url: `/projects/${fixture.projectId}/grounding-checks`,
        headers: {
          origin: "https://evil.example.test",
          "idempotency-key": "grounding-key-1",
        },
        payload: body,
        cookies: { [sessionCookieName]: "owner" },
      });
      expect(response.statusCode).toBe(403);
      expect(groundingService.check).not.toHaveBeenCalled();
    });
  });

  describe("GET /projects/:projectId/grounding-checks/latest", () => {
    it("returns the latest grounding check for the owner", async () => {
      const { fixture, server, groundingService } = await api();
      const response = await server.inject({
        method: "GET",
        url: `/projects/${fixture.projectId}/grounding-checks/latest`,
        cookies: { [sessionCookieName]: "owner" },
      });
      expect(response.statusCode).toBe(200);
      expect(groundingService.current).toHaveBeenCalledWith({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      });
      expect(JSON.parse(response.body)).toEqual(emptyResult);
    });

    it("hides grounding results from another teacher", async () => {
      const { fixture, server, groundingService } = await api();
      const response = await server.inject({
        method: "GET",
        url: `/projects/${fixture.projectId}/grounding-checks/latest`,
        cookies: { [sessionCookieName]: "other" },
      });
      expect(response.statusCode).toBe(404);
      expect(groundingService.current).not.toHaveBeenCalled();
    });

    it("rejects an unauthenticated request", async () => {
      const { fixture, server } = await api();
      const response = await server.inject({
        method: "GET",
        url: `/projects/${fixture.projectId}/grounding-checks/latest`,
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
