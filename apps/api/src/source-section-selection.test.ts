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
  projectEffectiveSections,
  type SourceSectionSelectionService,
} from "./source-section-selection.js";
import {
  sourceSectionOverlayInputSchema,
  type SourceSectionSelection,
  type SourceSectionSelectionResponse,
} from "@avlp/schemas";
import { createApp, sessionCookieName } from "./app.js";

const documentId = "019ffbf1-610f-738a-b087-6775ff97568c";
const sectionId = "019ffbf1-6112-738a-b087-6775ff97568c";

const sampleSection: SourceSectionSelection = {
  id: sectionId,
  order: 1,
  level: 1,
  heading: "Introduction",
  displayHeading: null,
  included: true,
  reviewOrder: null,
  pageStart: 1,
  pageEnd: 2,
  revision: 0,
};

const sampleSelectionResponse: SourceSectionSelectionResponse = {
  documentId,
  sections: [sampleSection],
};

describe("projectEffectiveSections", () => {
  it("defaults a section with no overlay to included and original heading", () => {
    const result = projectEffectiveSections(
      [
        {
          id: sectionId,
          parentSectionId: null,
          order: 1,
          level: 1,
          heading: "Introduction",
          pageStart: 1,
          pageEnd: 2,
        },
      ],
      new Map(),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: sectionId,
      heading: "Introduction",
      displayHeading: null,
      included: true,
      revision: 0,
    });
  });

  it("applies rename, exclusion, and review order overlays", () => {
    const result = projectEffectiveSections(
      [
        {
          id: sectionId,
          parentSectionId: null,
          order: 1,
          level: 1,
          heading: "Introduction",
          pageStart: 1,
          pageEnd: 2,
        },
      ],
      new Map([
        [
          sectionId,
          {
            included: false,
            displayHeading: "Opening",
            reviewOrder: 2,
            revision: 4,
          },
        ],
      ]),
    );
    expect(result[0]).toMatchObject({
      heading: "Introduction",
      displayHeading: "Opening",
      included: false,
      reviewOrder: 2,
      revision: 4,
    });
  });

  it("keeps the immutable heading while exposing the display override", () => {
    const result = projectEffectiveSections(
      [
        {
          id: sectionId,
          parentSectionId: null,
          order: 1,
          level: 1,
          heading: "Original",
          pageStart: 1,
          pageEnd: 1,
        },
      ],
      new Map([[sectionId, { included: true, displayHeading: "Renamed", reviewOrder: null, revision: 1 }]]),
    );
    expect(result[0]?.heading).toBe("Original");
    expect(result[0]?.displayHeading).toBe("Renamed");
  });
});

describe("source section selection API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<SourceSectionSelectionService>) {
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
    const sourceSectionSelectionService: SourceSectionSelectionService = {
      list: vi.fn(async () => sampleSelectionResponse),
      update: vi.fn(async () => sampleSection),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      sourceSectionSelectionService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      sourceSectionSelectionService,
    };
  }

  it("lists the effective section selection for the owner", async () => {
    const { fixture, server, sourceSectionSelectionService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-sections`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(sourceSectionSelectionService.list).toHaveBeenCalledWith(
      fixture.ownerUserId,
      fixture.projectId,
    );
    const body = JSON.parse(response.body);
    expect(body.documentId).toBe(documentId);
    expect(body.sections).toHaveLength(1);
  });

  it("updates a section overlay for the owner with the patch body", async () => {
    const { fixture, server, sourceSectionSelectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-sections/${sectionId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(200);
    expect(sourceSectionSelectionService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        sectionId,
        body: { revision: 0, included: false },
      }),
    );
    const body = JSON.parse(response.body);
    expect(body.included).toBe(true);
  });

  it("does not reveal another teacher's section selection", async () => {
    const { fixture, server, sourceSectionSelectionService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-sections`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSectionSelectionService.list).not.toHaveBeenCalled();
  });

  it("does not update another teacher's section selection", async () => {
    const { fixture, server, sourceSectionSelectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-sections/${sectionId}`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSectionSelectionService.update).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-sections`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a malformed section identifier", async () => {
    const { fixture, server, sourceSectionSelectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-sections/not-a-uuid`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 0, included: false },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSectionSelectionService.update).not.toHaveBeenCalled();
  });

  it("surfaces a stale-revision conflict as HTTP 409", async () => {
    const conflict = new (await import("@avlp/config")).PublicError(
      "bad_request",
      "The section selection changed. Please refresh and try again.",
      409,
    );
    const { fixture, server } = await api({
      update: vi.fn(async () => {
        throw conflict;
      }),
    });
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-sections/${sectionId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 1, included: false },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain("changed");
  });
});

describe("sourceSectionOverlayInputSchema", () => {
  it("rejects a patch body with no change fields", () => {
    const result = sourceSectionOverlayInputSchema.safeParse({ revision: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts include, exclude, rename, and restore shapes", () => {
    expect(
      sourceSectionOverlayInputSchema.safeParse({ revision: 0, included: true })
        .success,
    ).toBe(true);
    expect(
      sourceSectionOverlayInputSchema.safeParse({
        revision: 1,
        displayHeading: null,
      }).success,
    ).toBe(true);
    expect(
      sourceSectionOverlayInputSchema.safeParse({
        revision: 1,
        included: true,
        displayHeading: null,
        reviewOrder: null,
      }).success,
    ).toBe(true);
  });
});
