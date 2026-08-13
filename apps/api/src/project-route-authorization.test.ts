import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import type { AuthorizedProjectRequest } from "./project-route-authorization.js";

describe("project route authorization", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function api() {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner-session",
        {
          id: fixture.ownerUserId,
          email: "owner@example.test",
          displayName: "Owner",
        },
      ],
      [
        "other-session",
        {
          id: fixture.otherUserId,
          email: "other@example.test",
          displayName: "Other",
        },
      ],
    ]);
    const authGateway: AuthGateway = {
      register: async () => {
        throw new Error("Not used by this test.");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const projectAuthorizer = new ProjectAuthorizationService(
      new InMemoryOwnerScopedProjectRepository([fixture.project]),
    );
    app = await createApp({
      authGateway,
      projectAuthorizer,
      configure: (application) => {
        const server = application.getHttpAdapter().getInstance();
        const response = (request: unknown) => {
          const authorizedRequest = request as AuthorizedProjectRequest;
          return {
            method: authorizedRequest.method,
            projectAccess: authorizedRequest.projectAccess,
          };
        };
        server.get("/projects/:projectId/resource", response);
        server.put("/projects/:projectId/resource", response);
        server.delete("/projects/:projectId/resource", response);
      },
    });
    return { fixture, server: app.getHttpAdapter().getInstance() };
  }

  it("allows the owner and attaches the verified tenant scope", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/resource`,
      cookies: { [sessionCookieName]: "owner-session" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().projectAccess).toEqual({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
  });

  it.each(["GET", "PUT", "DELETE"] as const)(
    "rejects a cross-user %s before the route handler",
    async (method) => {
      const { fixture, server } = await api();
      const response = await server.inject({
        method,
        url: `/projects/${fixture.projectId}/resource`,
        cookies: { [sessionCookieName]: "other-session" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        error: {
          code: "not_found",
          message: "The requested resource was not found.",
          retryable: false,
        },
      });
      expect(response.json().error.correlationId).toBe(
        response.headers["x-correlation-id"],
      );
    },
  );

  it("returns identical envelopes for foreign and missing identifiers", async () => {
    const { fixture, server } = await api();
    const request = (projectId: string, session: string) =>
      server.inject({
        method: "GET",
        url: `/projects/${projectId}/resource`,
        cookies: { [sessionCookieName]: session },
        headers: {
          "x-correlation-id": "018f3c2d-4a00-7000-8000-000000000099",
        },
      });
    const foreign = await request(fixture.projectId, "other-session");
    const missing = await request(fixture.missingProjectId, "owner-session");

    expect(foreign.statusCode).toBe(404);
    expect(missing.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
  });

  it("requires an authenticated session before resolving project access", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/resource`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized", retryable: false },
    });
  });
});
