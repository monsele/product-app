import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import type {
  ParsedDocumentReviewResponse,
  ParsedDocumentSectionResponse,
} from "@avlp/schemas";
import { createApp, sessionCookieName } from "./app.js";
import type { ParsedDocumentReviewService } from "./parsed-document-review.js";

const documentId = "019ffbf1-610e-738a-b087-6775ff97568c";
const sourceDocumentId = "019ffbf1-6111-738a-b087-6775ff97568c";
const sectionId = "019ffbf1-6112-738a-b087-6775ff97568c";

const sampleReviewResponse: ParsedDocumentReviewResponse = {
  document: {
    id: documentId,
    sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    title: "The Water Cycle",
    language: "en",
    pageCount: 5,
  },
  sections: [
    {
      id: sectionId,
      order: 1,
      level: 1,
      heading: "Introduction",
      pageStart: 1,
      pageEnd: 2,
      blockCount: 3,
      figureCount: 1,
      tableCount: 0,
    },
  ],
  warnings: [
    {
      id: "019ffbf1-6113-738a-b087-6775ff97568c",
      code: "missing_caption",
      severity: "warning",
      message: "A figure is missing a caption.",
      pageStart: 1,
      pageEnd: 1,
      sectionId,
      figureId: "019ffbf1-6114-738a-b087-6775ff97568c",
    },
  ],
  quality: {
    score: 85,
    status: "review_required",
    findings: [],
  },
};

const sampleSectionResponse: ParsedDocumentSectionResponse = {
  section: {
    id: sectionId,
    order: 1,
    level: 1,
    heading: "Introduction",
    pageStart: 1,
    pageEnd: 2,
    blocks: [
      {
        id: "019ffbf1-6120-738a-b087-6775ff97568c",
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water moves through the environment in a cycle.",
      },
    ],
    figures: [
      {
        id: "019ffbf1-6114-738a-b087-6775ff97568c",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        contentType: "image/png",
        width: 800,
        height: 600,
        previewUrl: "https://signed.example.test/figure-original.png",
        included: true,
        revision: 0,
      },
    ],
    tables: [],
  },
};

describe("parsed-document review API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api() {
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
    const parsedDocumentReviewService: ParsedDocumentReviewService = {
      review: vi.fn(async () => sampleReviewResponse),
      section: vi.fn(async () => sampleSectionResponse),
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      parsedDocumentReviewService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      parsedDocumentReviewService,
    };
  }

  it("returns the parsed document review for the owner", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/parsed-document`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.document.title).toBe("The Water Cycle");
    expect(body.sections).toHaveLength(1);
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0].figureId).toBeDefined();
    expect(body.quality.status).toBe("review_required");
  });

  it("returns section detail with a signed figure preview URL for the owner", async () => {
    const { fixture, server, parsedDocumentReviewService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/parsed-document/sections/${sectionId}`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(parsedDocumentReviewService.section).toHaveBeenCalledWith(
      fixture.ownerUserId,
      fixture.projectId,
      sectionId,
    );
    const body = JSON.parse(response.body);
    expect(body.section.figures[0].previewUrl).toBe(
      "https://signed.example.test/figure-original.png",
    );
  });

  it("does not reveal another teacher's parsed document", async () => {
    const { fixture, server, parsedDocumentReviewService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/parsed-document`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(parsedDocumentReviewService.review).not.toHaveBeenCalled();
  });

  it("does not reveal another teacher's section detail", async () => {
    const { fixture, server, parsedDocumentReviewService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/parsed-document/sections/${sectionId}`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(parsedDocumentReviewService.section).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/parsed-document`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a malformed section identifier", async () => {
    const { fixture, server, parsedDocumentReviewService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/parsed-document/sections/not-a-uuid`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(404);
    expect(parsedDocumentReviewService.section).not.toHaveBeenCalled();
  });
});
