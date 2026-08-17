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
  learningObjectiveSetSchema,
  type ObjectiveGenerationResponse,
  type ObjectivesResponse,
} from "@avlp/schemas";
import type { ObjectivesService } from "./objectives.js";
import { createApp, sessionCookieName } from "./app.js";

const jobId = "019ffbf1-eeee-7000-8000-000000000099";
const setId = "019ffbf1-eeee-7000-8000-000000000098";

function editorResponse(): ObjectivesResponse {
  return {
    state: "draft",
    set: sampleSet(),
    approved: null,
    latestJob: null,
    canGenerate: true,
    canApprove: true,
  };
}

function sampleSet() {
  return learningObjectiveSetSchema.parse({
    schemaVersion: 1,
    id: setId,
    projectId: "019ffbf1-ffff-7000-8000-000000000001",
    sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
    sourceSnapshotContentHash: "a".repeat(64),
    configurationVersion: 3,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000002",
    status: "draft",
    revision: 0,
    objectives: [
      {
        id: "019ffbf1-eeee-7000-8000-000000000001",
        order: 1,
        statement: "Describe how evaporation forms water vapour.",
        verb: "describe",
        confidence: 0.95,
        sourceRefs: [
          {
            documentId: "019ffbf1-3333-7000-8000-000000000001",
            parsedDocumentVersion: 1,
            pageStart: 1,
            pageEnd: 1,
            sectionId: "019ffbf1-1111-7000-8000-000000000001",
            blockIds: ["019ffbf1-2222-7000-8000-000000000001"],
          },
        ],
        generated: true,
        revision: 0,
        groundingStatus: "supported",
      },
    ],
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: "2026-08-17T10:00:00.000Z",
    createdAt: "2026-08-17T10:00:00.000Z",
  });
}

describe("objectives API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<ObjectivesService>) {
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
    const objectivesService: ObjectivesService = {
      generate: vi.fn(
        async (): Promise<ObjectiveGenerationResponse> => ({
          jobId,
          status: "queued",
        }),
      ),
      current: vi.fn(
        async (): Promise<ObjectivesResponse> => ({
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
      add: vi.fn(async (): Promise<ObjectivesResponse> => editorResponse()),
      update: vi.fn(async (): Promise<ObjectivesResponse> => editorResponse()),
      remove: vi.fn(async (): Promise<ObjectivesResponse> => editorResponse()),
      reorder: vi.fn(async (): Promise<ObjectivesResponse> => editorResponse()),
      approve: vi.fn(async (): Promise<ObjectivesResponse> => editorResponse()),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      objectivesService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      objectivesService,
    };
  }

  it("returns the current objective set for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/objectives`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(objectivesService.current).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    const payload = response.json();
    expect(payload.state).toBe("draft");
    expect(payload.set.objectives[0].statement).toContain("evaporation");
  });

  it("hides objective state from another tenant", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/objectives`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(objectivesService.current).not.toHaveBeenCalled();
  });

  it("queues an objectives generation for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ jobId, status: "queued" });
    expect(objectivesService.generate).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      idempotencyKey: "generate-1",
      correlationId: expect.any(String),
    });
  });

  it("forbids generating objectives for another tenant", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives/generate`,
      cookies: { [sessionCookieName]: "other" },
      headers: {
        origin: "https://teacher.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(404);
    expect(objectivesService.generate).not.toHaveBeenCalled();
  });

  it("rejects a non-trusted origin", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives/generate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: {
        origin: "https://evil.example.test",
        "idempotency-key": "generate-1",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(objectivesService.generate).not.toHaveBeenCalled();
  });

  it("adds a teacher-authored objective for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        statement: "Label the parts of the water cycle.",
        verb: "label",
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(objectivesService.add).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: {
        statement: "Label the parts of the water cycle.",
        verb: "label",
        expectedRevision: 0,
      },
      correlationId: expect.any(String),
    });
  });

  it("forbids editing objectives for another tenant", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        statement: "Label the parts of the water cycle.",
        verb: "label",
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(objectivesService.add).not.toHaveBeenCalled();
  });

  it("updates an objective for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "PATCH",
      url: `/projects/${fixture.projectId}/objectives/019ffbf1-eeee-7000-8000-000000000001`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { statement: "Explain condensation.", expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(200);
    expect(objectivesService.update).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      objectiveId: "019ffbf1-eeee-7000-8000-000000000001",
      body: { statement: "Explain condensation.", expectedRevision: 0 },
      correlationId: expect.any(String),
    });
  });

  it("removes an objective for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "DELETE",
      url: `/projects/${fixture.projectId}/objectives/019ffbf1-eeee-7000-8000-000000000001`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(200);
    expect(objectivesService.remove).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      objectiveId: "019ffbf1-eeee-7000-8000-000000000001",
      body: { expectedRevision: 0 },
      correlationId: expect.any(String),
    });
  });

  it("reorders objectives for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives/reorder`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: {
        objectiveIds: ["019ffbf1-eeee-7000-8000-000000000002"],
        expectedRevision: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(objectivesService.reorder).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: {
        objectiveIds: ["019ffbf1-eeee-7000-8000-000000000002"],
        expectedRevision: 0,
      },
      correlationId: expect.any(String),
    });
  });

  it("approves draft objectives for the project owner", async () => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/objectives/approve`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
      payload: { expectedRevision: 0 },
    });
    expect(response.statusCode).toBe(200);
    expect(objectivesService.approve).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      body: { expectedRevision: 0 },
      correlationId: expect.any(String),
    });
  });

  it.each([
    ["update", "PATCH", "/objectives/019ffbf1-eeee-7000-8000-000000000001", { statement: "x", expectedRevision: 0 }],
    ["remove", "DELETE", "/objectives/019ffbf1-eeee-7000-8000-000000000001", { expectedRevision: 0 }],
    ["reorder", "POST", "/objectives/reorder", { objectiveIds: ["019ffbf1-eeee-7000-8000-000000000001"], expectedRevision: 0 }],
    ["approve", "POST", "/objectives/approve", { expectedRevision: 0 }],
  ])("forbids %s for another tenant", async (methodLabel, method, suffix, payload) => {
    const { fixture, server, objectivesService } = await api();
    const response = await server.inject({
      method: method as "PATCH" | "DELETE" | "POST",
      url: `/projects/${fixture.projectId}${suffix}`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
      payload,
    });
    expect(response.statusCode).toBe(404);
    expect(objectivesService.update).not.toHaveBeenCalled();
    expect(objectivesService.remove).not.toHaveBeenCalled();
    expect(objectivesService.reorder).not.toHaveBeenCalled();
    expect(objectivesService.approve).not.toHaveBeenCalled();
  });
});
