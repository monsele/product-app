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
  lessonNarrationSetSchema,
  type NarrationGenerationResponse,
  type NarrationResponse,
} from "@avlp/schemas";
import type { NarrationService } from "./narration.js";
import { createApp, sessionCookieName } from "./app.js";

const jobId = "019ffbf1-eeee-7000-8000-000000000099";
const setId = "019ffbf1-eeee-7000-8000-000000000098";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000097";
const outlineItemId = "019ffbf1-eeee-7000-8000-000000000096";

function sampleSet(overrides: Record<string, unknown> = {}) {
  return lessonNarrationSetSchema.parse({
    schemaVersion: 1,
    id: setId,
    projectId: "019ffbf1-ffff-7000-8000-000000000001",
    sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
    sourceSnapshotContentHash: "a".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000002",
    status: "draft",
    revision: 0,
    blocks: [
      {
        id: "019ffbf1-eeee-7000-8000-000000000001",
        outlineItemId,
        order: 1,
        text: "Where does the water go when a puddle dries?",
        estimatedWords: 38,
        targetSeconds: 20,
        sourceRefs: [],
        generatedAdditions: [],
        generated: true,
        revision: 0,
      },
    ],
    totalEstimatedSeconds: 180,
    generatedAt: "2026-08-17T10:00:00.000Z",
    createdAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  });
}

describe("narration API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<NarrationService>) {
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
    const narrationService: NarrationService = {
      generate: vi.fn(
        async (): Promise<NarrationGenerationResponse> => ({
          jobId,
          status: "queued",
        }),
      ),
      current: vi.fn(
        async (): Promise<NarrationResponse> => ({
          state: "draft",
          set: sampleSet(),
          approved: null,
          latestJob: {
            id: jobId,
            state: "succeeded",
            errorCode: null,
            updatedAt: "2026-08-17T10:00:00.000Z",
          },
          canGenerate: true,
          canApprove: false,
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            wordCountStatus: "within",
            wordCountWarning: null,
            uncoveredOutlineItemIds: [],
          },
        }),
      ),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      narrationService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      narrationService,
    };
  }

  it("returns the current narration for the project owner", async () => {
    const { fixture, server, narrationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/narration`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(narrationService.current).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    const payload = response.json();
    expect(payload.state).toBe("draft");
    expect(payload.set.blocks[0].outlineItemId).toBe(outlineItemId);
  });

  it("hides narration state from another tenant", async () => {
    const { fixture, server, narrationService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/narration`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(narrationService.current).not.toHaveBeenCalled();
  });

  it("queues a narration generation for the project owner", async () => {
    const { fixture, server, narrationService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/narration/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ jobId, status: "queued" });
    expect(narrationService.generate).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      idempotencyKey: "generate-1",
      correlationId: expect.any(String),
    });
  });

  it("forbids generating narration for another tenant", async () => {
    const { fixture, server, narrationService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/narration/generate`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(404);
    expect(narrationService.generate).not.toHaveBeenCalled();
  });

  it("rejects a non-trusted origin", async () => {
    const { fixture, server, narrationService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/narration/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://evil.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(narrationService.generate).not.toHaveBeenCalled();
  });
});
