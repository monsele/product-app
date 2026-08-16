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
import type { LessonConfigurationResponse } from "@avlp/schemas";
import { createApp, sessionCookieName } from "./app.js";
import type { LessonConfigurationService } from "./lesson-configuration.js";

const sampleResponse: LessonConfigurationResponse = {
  configuration: null,
  source: {
    parsedDocumentVersion: 1,
    sourceReviewComplete: true,
  },
  narrationTarget: null,
  canProceed: false,
};

describe("lesson configuration API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<LessonConfigurationService>) {
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
    const lessonConfigurationService: LessonConfigurationService = {
      get: vi.fn(async () => sampleResponse),
      save: vi.fn(async () => sampleResponse),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      lessonConfigurationService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      lessonConfigurationService,
    };
  }

  it("returns the configuration for the project owner", async () => {
    const { fixture, server, lessonConfigurationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/configuration`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(lessonConfigurationService.get).toHaveBeenCalledWith(
      fixture.ownerUserId,
      fixture.projectId,
    );
    expect(JSON.parse(response.body)).toEqual(sampleResponse);
  });

  it("does not expose another teacher's configuration", async () => {
    const { fixture, server, lessonConfigurationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/configuration`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(lessonConfigurationService.get).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated configuration request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/configuration`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("saves the configuration with the parsed body for the owner", async () => {
    const { fixture, server, lessonConfigurationService } = await api();
    const body = {
      expectedVersion: 0,
      ageBand: "11-13",
      difficulty: "introductory",
      subject: "Biology",
      lessonTitle: "The Water Cycle",
      targetDurationSeconds: 300,
      tone: "friendly",
      includeRecallQuestions: true,
    };
    const response = await server.inject({
      method: "PUT",
      url: `/projects/${fixture.projectId}/configuration`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "content-type": "application/json",
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(lessonConfigurationService.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        body,
      }),
    );
  });

  it("surfaces a stale-version conflict as HTTP 409", async () => {
    const conflict = new PublicError(
      "bad_request",
      "The lesson configuration changed. Please refresh and try again.",
      409,
    );
    const { fixture, server } = await api({
      save: vi.fn(async () => {
        throw conflict;
      }),
    });
    const response = await server.inject({
      method: "PUT",
      url: `/projects/${fixture.projectId}/configuration`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        expectedVersion: 1,
        ageBand: "11-13",
        difficulty: "introductory",
        subject: "Biology",
        lessonTitle: "The Water Cycle",
        targetDurationSeconds: 300,
        tone: "friendly",
        includeRecallQuestions: true,
      },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain("changed");
  });

  it("surfaces the source-not-confirmed workflow guard as HTTP 409", async () => {
    const guard = new PublicError(
      "bad_request",
      "Source content must be confirmed before configuring the lesson.",
      409,
    );
    const { fixture, server } = await api({
      save: vi.fn(async () => {
        throw guard;
      }),
    });
    const response = await server.inject({
      method: "PUT",
      url: `/projects/${fixture.projectId}/configuration`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        expectedVersion: 0,
        ageBand: "11-13",
        difficulty: "introductory",
        subject: "Biology",
        lessonTitle: "The Water Cycle",
        targetDurationSeconds: 300,
        tone: "friendly",
        includeRecallQuestions: true,
      },
    });
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error.message).toContain("Source content must be confirmed");
  });

  it("does not save another teacher's configuration", async () => {
    const { fixture, server, lessonConfigurationService } = await api();
    const response = await server.inject({
      method: "PUT",
      url: `/projects/${fixture.projectId}/configuration`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        expectedVersion: 0,
        ageBand: "11-13",
        difficulty: "introductory",
        subject: "Biology",
        lessonTitle: "The Water Cycle",
        targetDurationSeconds: 300,
        tone: "friendly",
        includeRecallQuestions: true,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(lessonConfigurationService.save).not.toHaveBeenCalled();
  });
});
