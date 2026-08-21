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
  lessonStoryboardSchema,
  type SceneRegenerationResponse,
  type StoryboardGenerationResponse,
  type StoryboardResponse,
} from "@avlp/schemas";
import type { StoryboardService } from "./storyboard.js";
import { createApp, sessionCookieName } from "./app.js";

const jobId = "019ffbf1-eeee-7000-8000-000000000099";
const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const narrationSetId = "019ffbf1-eeee-7000-8000-000000000020";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const objectiveId = "019ffbf1-eeee-7000-8000-000000000009";
const blockA = "019ffbf1-eeee-7000-8000-000000000021";

function sampleStoryboard(overrides: Record<string, unknown> = {}) {
  const scene = {
    id: "019ffbf1-eeee-7000-8000-000000000050",
    stableSceneId: "019ffbf1-eeee-7000-8000-000000000050",
    order: 1,
    template: "definition",
    durationSeconds: 30,
    narrationBlockIds: [blockA],
    assetRequirements: [],
    scene: {
      id: "019ffbf1-eeee-7000-8000-000000000050",
      order: 1,
      narration: "Water evaporates when heated and rises as water vapour into the sky.",
      durationSeconds: 30,
      onScreenText: [],
      transition: "cut",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          blockIds: [blockA],
        },
      ],
      generatedAdditions: [],
      template: "definition",
      visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    },
  };
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: "019ffbf1-eeee-7000-8000-000000000040",
    projectId,
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: "a".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: [objectiveId],
    contentHash: "c".repeat(64),
    scenes: [scene],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
    ...overrides,
  });
}

function sampleResponse(overrides: Record<string, unknown> = {}): StoryboardResponse {
  return {
    state: "draft",
    storyboard: sampleStoryboard(),
    approved: null,
    latestJob: {
      id: jobId,
      state: "succeeded",
      errorCode: null,
      updatedAt: "2026-08-18T10:00:00.000Z",
    },
    latestSceneRegenerationJob: null,
    sceneCandidates: [],
    canGenerate: true,
    canApprove: false,
    canEdit: false,
    stale: false,
    staleReason: null,
    validation: {
      structurallyValid: true,
      durationStatus: "within",
      durationWarning: null,
      uncoveredOutlineItemIds: [],
      unassignedBlockIds: [],
    },
    ...overrides,
  };
}

describe("storyboard API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<StoryboardService>) {
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
    const storyboardService: StoryboardService = {
      generate: vi.fn(
        async (): Promise<StoryboardGenerationResponse> => ({
          jobId,
          status: "queued",
        }),
      ),
      current: vi.fn(async (): Promise<StoryboardResponse> => sampleResponse()),
      regenerateScene: vi.fn(
        async (): Promise<SceneRegenerationResponse> => ({
          jobId,
          status: "queued",
        }),
      ),
      applySceneCandidate: vi.fn(
        async (): Promise<StoryboardResponse> => sampleResponse(),
      ),
      rejectSceneCandidate: vi.fn(
        async (): Promise<StoryboardResponse> => sampleResponse(),
      ),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      storyboardService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      storyboardService,
    };
  }

  it("returns the current storyboard for the project owner", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/storyboard`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(storyboardService.current).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    const payload = response.json();
    expect(payload.state).toBe("draft");
    expect(payload.storyboard.scenes[0].template).toBe("definition");
  });

  it("hides the storyboard from another tenant", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/storyboard`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(storyboardService.current).not.toHaveBeenCalled();
  });

  it("queues a storyboard generation for the project owner", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/storyboard/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ jobId, status: "queued" });
    expect(storyboardService.generate).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      idempotencyKey: "generate-1",
      correlationId: expect.any(String),
    });
  });

  it("forbids generating a storyboard for another tenant", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/storyboard/generate`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(404);
    expect(storyboardService.generate).not.toHaveBeenCalled();
  });

  it("rejects storyboard requests from an untrusted origin", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/storyboard/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://evil.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(storyboardService.generate).not.toHaveBeenCalled();
  });

  it("queues a scene regeneration for the project owner", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/scenes/019ffbf1-eeee-7000-8000-000000000050/regenerate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "scene-regenerate-1",
      },
      payload: {
        mode: "improve-visual",
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ jobId, status: "queued" });
    expect(storyboardService.regenerateScene).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      sceneId: "019ffbf1-eeee-7000-8000-000000000050",
      body: { mode: "improve-visual", expectedRevision: 0 },
      idempotencyKey: "scene-regenerate-1",
      correlationId: expect.any(String),
    });
  });

  it("forbids regenerating a scene for another tenant", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/scenes/019ffbf1-eeee-7000-8000-000000000050/regenerate`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "scene-regenerate-1",
      },
      payload: {
        mode: "regenerate",
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(storyboardService.regenerateScene).not.toHaveBeenCalled();
  });

  it("applies a scene candidate for the project owner", async () => {
    const { fixture, server, storyboardService } = await api();
    const candidateId = "019ffbf1-eeee-7000-8000-000000000060";
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/scenes/019ffbf1-eeee-7000-8000-000000000050/apply-candidate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
      },
      payload: {
        candidateId,
        expectedRevision: 0,
        expectedSceneRevision: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().state).toBe("draft");
    expect(storyboardService.applySceneCandidate).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      sceneId: "019ffbf1-eeee-7000-8000-000000000050",
      candidateId,
      body: {
        candidateId,
        expectedRevision: 0,
        expectedSceneRevision: 0,
      },
      correlationId: expect.any(String),
    });
  });

  it("rejects an apply-candidate request without a candidate id", async () => {
    const { fixture, server, storyboardService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/scenes/019ffbf1-eeee-7000-8000-000000000050/apply-candidate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
      },
      payload: {
        expectedRevision: 0,
        expectedSceneRevision: 0,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(storyboardService.applySceneCandidate).not.toHaveBeenCalled();
  });

  it("rejects a scene candidate for another tenant", async () => {
    const { fixture, server, storyboardService } = await api();
    const candidateId = "019ffbf1-eeee-7000-8000-000000000060";
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/scenes/019ffbf1-eeee-7000-8000-000000000050/reject-candidate`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
      },
      payload: {
        candidateId,
        expectedRevision: 0,
        expectedSceneRevision: 0,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(storyboardService.rejectSceneCandidate).not.toHaveBeenCalled();
  });
});
