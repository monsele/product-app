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
  sceneCitationsResponseSchema,
  type SceneCitationsResponse,
} from "@avlp/schemas";
import type { CitationService } from "./citations.js";
import { createApp, sessionCookieName } from "./app.js";

const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";

const sampleResponse: SceneCitationsResponse = sceneCitationsResponseSchema.parse(
  {
    sceneId,
    citations: [],
    generatedAdditions: [],
  },
);

describe("scene citations API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<CitationService>) {
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
    const citationService: CitationService = {
      forScene: vi.fn(async () => sampleResponse),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      citationService,
      trustedOrigin: "https://teacher.example.test",
    });
    return { fixture, server: app.getHttpAdapter().getInstance(), citationService };
  }

  it("returns citations for the project owner", async () => {
    const { fixture, server, citationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/scenes/${sceneId}/citations`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(citationService.forScene).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      sceneId,
    });
    expect(JSON.parse(response.body)).toEqual(sampleResponse);
  });

  it("hides citations from another teacher", async () => {
    const { fixture, server, citationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/scenes/${sceneId}/citations`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(citationService.forScene).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/scenes/${sceneId}/citations`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a malformed scene id", async () => {
    const { fixture, server, citationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/scenes/not-a-uuid/citations`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(404);
    expect(citationService.forScene).not.toHaveBeenCalled();
  });
});
