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
  lessonOutlineSetSchema,
  type OutlineGenerationResponse,
  type OutlineResponse,
} from "@avlp/schemas";
import type { OutlineService } from "./outline.js";
import { createApp, sessionCookieName } from "./app.js";

const jobId = "019ffbf1-eeee-7000-8000-000000000099";
const setId = "019ffbf1-eeee-7000-8000-000000000098";
const objectiveSetId = "019ffbf1-eeee-7000-8000-000000000097";
const objectiveId = "019ffbf1-eeee-7000-8000-000000000096";

function sampleSet() {
  return lessonOutlineSetSchema.parse({
    schemaVersion: 1,
    id: setId,
    projectId: "019ffbf1-ffff-7000-8000-000000000001",
    sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
    sourceSnapshotContentHash: "a".repeat(64),
    objectiveSetId,
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000002",
    status: "draft",
    revision: 0,
    items: [
      {
        id: "019ffbf1-eeee-7000-8000-000000000001",
        order: 1,
        kind: "hook",
        title: "Where does the water go?",
        description: "Open with a question.",
        estimatedSeconds: 20,
        sourceRefs: [],
        objectiveIds: [objectiveId],
        framingNote: "Generated framing question.",
        generated: true,
        revision: 0,
      },
      {
        id: "019ffbf1-eeee-7000-8000-000000000002",
        order: 2,
        kind: "concept",
        title: "Evaporation",
        description: "Explain evaporation.",
        estimatedSeconds: 40,
        sourceRefs: [],
        objectiveIds: [objectiveId],
        framingNote: null,
        generated: true,
        revision: 0,
      },
    ],
    totalEstimatedSeconds: 60,
    generatedAt: "2026-08-17T10:00:00.000Z",
    createdAt: "2026-08-17T10:00:00.000Z",
  });
}

describe("outline API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<OutlineService>) {
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
    const outlineService: OutlineService = {
      generate: vi.fn(
        async (): Promise<OutlineGenerationResponse> => ({
          jobId,
          status: "queued",
        }),
      ),
      current: vi.fn(
        async (): Promise<OutlineResponse> => ({
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
          canApprove: true,
        }),
      ),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      outlineService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      outlineService,
    };
  }

  it("returns the current outline for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/outline`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(outlineService.current).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    const payload = response.json();
    expect(payload.state).toBe("draft");
    expect(payload.set.items[0].kind).toBe("hook");
  });

  it("hides outline state from another tenant", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/outline`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(outlineService.current).not.toHaveBeenCalled();
  });

  it("queues an outline generation for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ jobId, status: "queued" });
    expect(outlineService.generate).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      idempotencyKey: "generate-1",
      correlationId: expect.any(String),
    });
  });

  it("forbids generating an outline for another tenant", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/generate`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(404);
    expect(outlineService.generate).not.toHaveBeenCalled();
  });

  it("rejects a non-trusted origin", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://evil.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(outlineService.generate).not.toHaveBeenCalled();
  });
});
