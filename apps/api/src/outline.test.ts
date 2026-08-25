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

function sampleSet(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
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
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            uncoveredObjectiveIds: [],
            structureWarning: null,
          },
        }),
      ),
      add: vi.fn(
        async (): Promise<OutlineResponse> => ({
          state: "draft",
          set: sampleSet(),
          approved: null,
          latestJob: null,
          canGenerate: true,
          canApprove: true,
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            uncoveredObjectiveIds: [],
            structureWarning: null,
          },
        }),
      ),
      update: vi.fn(
        async (): Promise<OutlineResponse> => ({
          state: "draft",
          set: sampleSet(),
          approved: null,
          latestJob: null,
          canGenerate: true,
          canApprove: true,
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            uncoveredObjectiveIds: [],
            structureWarning: null,
          },
        }),
      ),
      remove: vi.fn(
        async (): Promise<OutlineResponse> => ({
          state: "draft",
          set: sampleSet(),
          approved: null,
          latestJob: null,
          canGenerate: true,
          canApprove: true,
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            uncoveredObjectiveIds: [],
            structureWarning: null,
          },
        }),
      ),
      reorder: vi.fn(
        async (): Promise<OutlineResponse> => ({
          state: "draft",
          set: sampleSet(),
          approved: null,
          latestJob: null,
          canGenerate: true,
          canApprove: true,
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            uncoveredObjectiveIds: [],
            structureWarning: null,
          },
        }),
      ),
      approve: vi.fn(
        async (): Promise<OutlineResponse> => ({
          state: "approved",
          set: sampleSet({ status: "approved" }),
          approved: sampleSet({ status: "approved" }),
          latestJob: null,
          canGenerate: true,
          canApprove: false,
          validation: {
            structurallyValid: true,
            durationStatus: "within",
            durationWarning: null,
            uncoveredObjectiveIds: [],
            structureWarning: null,
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

  it("adds an outline item for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/items`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        kind: "concept",
        title: "Condensation",
        description: "Explain condensation.",
        estimatedSeconds: 40,
        objectiveIds: [objectiveId],
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(outlineService.add).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: expect.objectContaining({ kind: "concept" }),
      correlationId: expect.any(String),
    });
  });

  it("forbids adding an outline item for another tenant", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/items`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        kind: "concept",
        title: "Condensation",
        description: "Explain condensation.",
        estimatedSeconds: 40,
        objectiveIds: [objectiveId],
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(outlineService.add).not.toHaveBeenCalled();
  });

  it("rejects a malformed outline item id on update", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/outline/items/not-a-uuid`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { title: "x", expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(404);
    expect(outlineService.update).not.toHaveBeenCalled();
  });

  it("updates an outline item for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/outline/items/${objectiveId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { title: "Evaporation and condensation", expectedRevision: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(outlineService.update).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      itemId: objectiveId,
      body: expect.objectContaining({ title: "Evaporation and condensation" }),
      correlationId: expect.any(String),
    });
  });

  it("removes an outline item for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "DELETE",
      url: `/projects/${fixture.projectId}/outline/items/${objectiveId}`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(200);
    expect(outlineService.remove).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      itemId: objectiveId,
      body: { expectedRevision: 0 },
      correlationId: expect.any(String),
    });
  });

  it("reorders outline items for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/reorder`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        itemIds: [
          "019ffbf1-eeee-7000-8000-000000000002",
          "019ffbf1-eeee-7000-8000-000000000001",
        ],
        expectedRevision: 1,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(outlineService.reorder).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: expect.objectContaining({ itemIds: expect.any(Array) }),
      correlationId: expect.any(String),
    });
  });

  it("approves the outline for the project owner", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/approve`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { expectedRevision: 1 },
    });
    expect(response.statusCode).toBe(200);
    expect(outlineService.approve).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: { expectedRevision: 1 },
      correlationId: expect.any(String),
    });
  });

  it("forbids approving another tenant's outline", async () => {
    const { fixture, server, outlineService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/outline/approve`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: { expectedRevision: 1 },
    });
    expect(response.statusCode).toBe(404);
    expect(outlineService.approve).not.toHaveBeenCalled();
  });
});
