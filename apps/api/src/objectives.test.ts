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
          latestJob: {
            id: jobId,
            state: "succeeded",
            errorCode: null,
            updatedAt: "2026-08-17T10:00:00.000Z",
          },
          canGenerate: true,
        }),
      ),
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
});
