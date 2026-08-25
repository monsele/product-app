import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import type { IngestionStatusService } from "./ingestion-status.js";

describe("ingestion status API", () => {
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
    const ingestionStatusService: IngestionStatusService = {
      status: vi.fn(async () => ({
        quality: { score: 70, status: "blocked" as const, findings: [] },
        latestJob: null,
        canProceed: false,
      })),
      retry: vi.fn(async () => ({
        jobId: "018f3c2d-4a00-7000-8000-000000000001",
        status: "queued" as const,
      })),
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      ingestionStatusService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      ingestionStatusService,
    };
  }

  it("returns persisted status and queues an idempotent retry for the owner", async () => {
    const { fixture, server, ingestionStatusService } = await api();
    const status = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/ingestion`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(status.statusCode).toBe(200);
    const retry = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/ingestion/retry`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "retry-once",
      },
      payload: { configurationVersion: "retry-v1" },
    });
    expect(retry.statusCode).toBe(202);
    expect(ingestionStatusService.retry).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        idempotencyKey: "retry-once",
      }),
    );
  });

  it("does not reveal or retry another teacher's ingestion", async () => {
    const { fixture, server, ingestionStatusService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/ingestion/retry`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "retry-once",
      },
      payload: { configurationVersion: "retry-v1" },
    });
    expect(response.statusCode).toBe(404);
    expect(ingestionStatusService.retry).not.toHaveBeenCalled();
  });
});
