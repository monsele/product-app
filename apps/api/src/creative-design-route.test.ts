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
import { createApp, sessionCookieName } from "./app.js";
import type { CreativeDesignService } from "./creative-design.js";

describe("ST-097 creative-design routes", () => {
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
        throw new Error("unused");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const service: CreativeDesignService = {
      getDraft: vi.fn(async () => null),
      plan: vi.fn(async () => ({ revision: 1, manifest: {} as never })),
      createOrUpdateDraft: vi.fn(async () => ({
        revision: 2,
        manifest: {} as never,
      })),
      alternatives: vi.fn(async () => []),
      apply: vi.fn(async () => ({
        snapshotId: createId(),
        manifestHash: "a".repeat(64),
      })),
      savePreset: vi.fn(async () => ({
        presetId: createId(),
        versionId: createId(),
        versionNumber: 1,
      })),
      archivePreset: vi.fn(async () => {}),
      listPresets: vi.fn(async () => []),
      applyPreset: vi.fn(async () => ({ revision: 2, manifest: {} as never })),
      describe: vi.fn(async () => ({
        patch: {},
        unsupported: [],
        draftRevision: 1,
      })),
      describeStatus: vi.fn(async () => ({
        patch: {},
        unsupported: [],
        draftRevision: 1,
      })),
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      creativeDesignService: service,
      trustedOrigin: "https://teacher.example.test",
    });
    return { fixture, service, server: app.getHttpAdapter().getInstance() };
  }

  it("keeps drafts tenant-scoped", async () => {
    const { fixture, service, server } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/creative-design`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(service.getDraft).not.toHaveBeenCalled();
  });

  it("requires a trusted origin for design mutation", async () => {
    const { fixture, service, server } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/creative-design/plan`,
      cookies: { [sessionCookieName]: "owner" },
      payload: { packId: "essential", expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(403);
    expect(service.plan).not.toHaveBeenCalled();
  });

  it("passes only an authorized project scope to explicit planning", async () => {
    const { fixture, service, server } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/creative-design/plan`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { packId: "essential", expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(201);
    expect(service.plan).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: { packId: "essential", expectedRevision: 0 },
    });
  });
});
