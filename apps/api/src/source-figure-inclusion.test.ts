import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { PublicError } from "@avlp/config";
import {
  figureInclusionInputSchema,
  type EffectiveFigure,
} from "@avlp/schemas";
import { createApp, sessionCookieName } from "./app.js";
import {
  projectEffectiveFigures,
  type FigureInclusionService,
} from "./source-figure-inclusion.js";

const figureId = "019ffbf1-6115-738a-b087-6775ff97568c";

const sampleFigure: EffectiveFigure = {
  id: figureId,
  order: 1,
  pageStart: 1,
  pageEnd: 1,
  contentType: "image/png",
  width: 800,
  height: 600,
  included: true,
  revision: 0,
};

describe("projectEffectiveFigures", () => {
  it("defaults a figure with no overlay to included with revision 0", () => {
    const result = projectEffectiveFigures(
      [
        {
          id: figureId,
          order: 1,
          pageStart: 1,
          pageEnd: 1,
          captionBlockId: null,
          altText: null,
          sourceLocator: "fig-1",
          contentType: "image/png",
          width: 800,
          height: 600,
        },
      ],
      new Map(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: figureId,
      included: true,
      revision: 0,
      contentType: "image/png",
    });
  });

  it("projects an exclusion overlay while preserving the immutable figure", () => {
    const result = projectEffectiveFigures(
      [
        {
          id: figureId,
          order: 1,
          pageStart: 1,
          pageEnd: 1,
          captionBlockId: null,
          altText: "water cycle diagram",
          sourceLocator: "fig-1",
          contentType: "image/png",
          width: 800,
          height: 600,
        },
      ],
      new Map([[figureId, { included: false, revision: 2 }]]),
    );
    expect(result[0]).toMatchObject({
      id: figureId,
      altText: "water cycle diagram",
      sourceLocator: "fig-1",
      included: false,
      revision: 2,
    });
  });

  it("filters excluded figures out of asset-planning candidates", () => {
    const includedId = "019ffbf1-6116-738a-b087-6775ff97568c";
    const candidates = projectEffectiveFigures(
      [
        {
          id: figureId,
          order: 1,
          pageStart: 1,
          pageEnd: 1,
          captionBlockId: null,
          altText: "decorative",
          sourceLocator: "fig-1",
          contentType: "image/png",
          width: 100,
          height: 100,
        },
        {
          id: includedId,
          order: 2,
          pageStart: 2,
          pageEnd: 2,
          captionBlockId: null,
          altText: "labelled diagram",
          sourceLocator: "fig-2",
          contentType: "image/jpeg",
          width: 400,
          height: 300,
        },
      ],
      new Map([[figureId, { included: false, revision: 1 }]]),
    );
    const plannerCandidates = candidates.filter(
      (candidate) => candidate.included,
    );
    expect(plannerCandidates).toHaveLength(1);
    expect(plannerCandidates[0]?.id).toBe(includedId);
    expect(candidates[0]).toMatchObject({ id: figureId, included: false });
  });
});

describe("figure inclusion API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<FigureInclusionService>) {
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
    const figureInclusionService: FigureInclusionService = {
      update: vi.fn(async () => sampleFigure),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      figureInclusionService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      figureInclusionService,
    };
  }

  it("updates a figure overlay for the owner with the patch body", async () => {
    const { fixture, server, figureInclusionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-figures/${figureId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(200);
    expect(figureInclusionService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        figureId,
        body: { revision: 0, included: false },
      }),
    );
    const body = JSON.parse(response.body);
    expect(body.included).toBe(true);
  });

  it("does not update another teacher's figure inclusion", async () => {
    const { fixture, server, figureInclusionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-figures/${figureId}`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(404);
    expect(figureInclusionService.update).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-figures/${figureId}`,
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a malformed figure identifier", async () => {
    const { fixture, server, figureInclusionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-figures/not-a-uuid`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(404);
    expect(figureInclusionService.update).not.toHaveBeenCalled();
  });

  it("surfaces a stale-revision conflict as HTTP 409", async () => {
    const conflict = new PublicError(
      "bad_request",
      "The figure selection changed. Please refresh and try again.",
      409,
    );
    const { fixture, server } = await api({
      update: vi.fn(async () => {
        throw conflict;
      }),
    });
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-figures/${figureId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 1, included: false },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain("changed");
  });
});

describe("figureInclusionInputSchema", () => {
  it("requires an included value", () => {
    const result = figureInclusionInputSchema.safeParse({ revision: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts exclude and restore shapes", () => {
    expect(
      figureInclusionInputSchema.safeParse({ revision: 0, included: false })
        .success,
    ).toBe(true);
    expect(
      figureInclusionInputSchema.safeParse({ revision: 2, included: true })
        .success,
    ).toBe(true);
  });
});
