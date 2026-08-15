import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import type { ReviewContentBlock } from "@avlp/schemas";
import {
  projectEffectiveContentBlocks,
  type ContentBlockCorrectionService,
} from "./content-block-corrections.js";
import { createApp, sessionCookieName } from "./app.js";

const blockId = "019ffbf1-6120-738a-b087-6775ff97568c";

const sampleCorrectedBlock: ReviewContentBlock = {
  id: blockId,
  kind: "paragraph",
  order: 1,
  pageStart: 1,
  pageEnd: 1,
  text: "Water moves through the environment in a cycle.",
  correction: {
    revision: 1,
    correctedText: "Water circulates through the environment in a cycle.",
    correctedItems: null,
    correctedLatex: null,
  },
};

describe("projectEffectiveContentBlocks", () => {
  it("leaves an uncorrected block untouched", () => {
    const result = projectEffectiveContentBlocks(
      [
        {
          id: blockId,
          kind: "paragraph",
          order: 1,
          pageStart: 1,
          pageEnd: 1,
          content: { text: "Water moves through the environment in a cycle." },
        },
      ],
      new Map(),
    );
    expect(result[0]).toMatchObject({
      id: blockId,
      kind: "paragraph",
      text: "Water moves through the environment in a cycle.",
    });
    expect(result[0]).not.toHaveProperty("correction");
  });

  it("attaches the correction overlay to a corrected block", () => {
    const result = projectEffectiveContentBlocks(
      [
        {
          id: blockId,
          kind: "paragraph",
          order: 1,
          pageStart: 1,
          pageEnd: 1,
          content: { text: "Original" },
        },
      ],
      new Map([
        [
          blockId,
          {
            revision: 2,
            correctedText: "Corrected",
            correctedItems: null,
            correctedLatex: null,
          },
        ],
      ]),
    );
    expect(result[0]).toMatchObject({
      text: "Original",
      correction: { revision: 2, correctedText: "Corrected" },
    });
  });
});

describe("content block correction API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<ContentBlockCorrectionService>) {
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
    const contentBlockCorrectionService: ContentBlockCorrectionService = {
      update: vi.fn(async () => sampleCorrectedBlock),
      restore: vi.fn(async () => sampleCorrectedBlock),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      contentBlockCorrectionService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      contentBlockCorrectionService,
    };
  }

  it("applies a block correction for the owner", async () => {
    const { fixture, server, contentBlockCorrectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-blocks/${blockId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: { kind: "paragraph", revision: 0, correctedText: "Corrected" },
    });
    expect(response.statusCode).toBe(200);
    expect(contentBlockCorrectionService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        blockId,
        body: { kind: "paragraph", revision: 0, correctedText: "Corrected" },
      }),
    );
    const body = JSON.parse(response.body);
    expect(body.correction.correctedText).toBe(
      "Water circulates through the environment in a cycle.",
    );
  });

  it("restores the original block content for the owner", async () => {
    const { fixture, server, contentBlockCorrectionService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-blocks/${blockId}/restore`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: { revision: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(contentBlockCorrectionService.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        blockId,
        body: { revision: 1 },
      }),
    );
  });

  it("does not reveal another teacher's block correction", async () => {
    const { fixture, server, contentBlockCorrectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-blocks/${blockId}`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: { kind: "paragraph", revision: 0, correctedText: "X" },
    });
    expect(response.statusCode).toBe(404);
    expect(contentBlockCorrectionService.update).not.toHaveBeenCalled();
  });

  it("does not let another teacher restore a block", async () => {
    const { fixture, server, contentBlockCorrectionService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-blocks/${blockId}/restore`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: { revision: 1 },
    });
    expect(response.statusCode).toBe(404);
    expect(contentBlockCorrectionService.restore).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-blocks/${blockId}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for a malformed block identifier", async () => {
    const { fixture, server, contentBlockCorrectionService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-blocks/not-a-uuid`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { kind: "paragraph", revision: 0, correctedText: "X" },
    });
    expect(response.statusCode).toBe(404);
    expect(contentBlockCorrectionService.update).not.toHaveBeenCalled();
  });

  it("surfaces a stale-revision conflict as HTTP 409", async () => {
    const conflict = new (await import("@avlp/config")).PublicError(
      "bad_request",
      "The block content changed. Please refresh and try again.",
      409,
    );
    const { fixture, server } = await api({
      update: vi.fn(async () => {
        throw conflict;
      }),
    });
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/source-blocks/${blockId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { kind: "paragraph", revision: 1, correctedText: "X" },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain("changed");
  });
});
