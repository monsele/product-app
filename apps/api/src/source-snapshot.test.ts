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
import {
  sourceApprovalResponseSchema,
  sourceApprovalStatusSchema,
  sourceSnapshotMetadataSchema,
  type SourceApprovalResponse,
  type SourceApprovalStatus,
  type SourceSnapshotMetadata,
} from "@avlp/schemas";
import type { SourceSnapshotService } from "./source-snapshot.js";
import { createApp, sessionCookieName } from "./app.js";

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const parsedDocumentId = "019ffbf1-ffff-7000-8000-000000000001";

const sampleMetadata: SourceSnapshotMetadata =
  sourceSnapshotMetadataSchema.parse({
    id: snapshotId,
    snapshotVersion: 1,
    schemaVersion: "1.0",
    parsedDocumentId,
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy: ownerUserId,
    approvedAt: "2026-08-16T10:00:00.000Z",
    sectionCount: 1,
    blockCount: 1,
    figureCount: 0,
    tableCount: 0,
  });

const sampleApprovalResponse: SourceApprovalResponse =
  sourceApprovalResponseSchema.parse({ snapshot: sampleMetadata });

const sampleStatus: SourceApprovalStatus = sourceApprovalStatusSchema.parse({
  approved: true,
  parsedDocumentVersion: 1,
  snapshotId,
  snapshotVersion: 1,
  contentHash: "a".repeat(64),
  approvedAt: "2026-08-16T10:00:00.000Z",
  stale: false,
});

describe("source snapshot API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => app?.close());

  async function api(service?: Partial<SourceSnapshotService>) {
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
    const sourceSnapshotService: SourceSnapshotService = {
      approve: vi.fn(async () => sampleApprovalResponse),
      metadata: vi.fn(async () => sampleMetadata),
      status: vi.fn(async () => sampleStatus),
      lookupBlocks: vi.fn(async () => []),
      ...service,
    };
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      sourceSnapshotService,
      trustedOrigin: "https://teacher.example.test",
    });
    return {
      fixture,
      server: app.getHttpAdapter().getInstance(),
      sourceSnapshotService,
    };
  }

  it("approves the source review for the project owner", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-review/approve`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
    });
    expect(response.statusCode).toBe(200);
    expect(sourceSnapshotService.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      }),
    );
    expect(JSON.parse(response.body)).toEqual(sampleApprovalResponse);
  });

  it("does not approve another teacher's source review", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-review/approve`,
      cookies: { [sessionCookieName]: "other" },
      headers: { origin: "https://teacher.example.test" },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSnapshotService.approve).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated approval request", async () => {
    const { fixture, server } = await api();
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-review/approve`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns the approval status for the project owner", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-review`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(sourceSnapshotService.status).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    expect(JSON.parse(response.body)).toEqual(sampleStatus);
  });

  it("hides the approval status from another teacher", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-review`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSnapshotService.status).not.toHaveBeenCalled();
  });

  it("returns snapshot metadata for the project owner", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-snapshots/${snapshotId}`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(200);
    expect(sourceSnapshotService.metadata).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      snapshotId,
    });
    expect(JSON.parse(response.body)).toEqual(sampleMetadata);
  });

  it("hides snapshot metadata from another teacher", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-snapshots/${snapshotId}`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSnapshotService.metadata).not.toHaveBeenCalled();
  });

  it("rejects a malformed snapshot id", async () => {
    const { fixture, server, sourceSnapshotService } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/source-snapshots/not-a-uuid`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(404);
    expect(sourceSnapshotService.metadata).not.toHaveBeenCalled();
  });

  it("surfaces a missing source as HTTP 404", async () => {
    const missing = new PublicError(
      "not_found",
      "No parsed document is available for this project.",
      404,
    );
    const { fixture, server } = await api({
      approve: vi.fn(async () => {
        throw missing;
      }),
    });
    const response = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/source-review/approve`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://teacher.example.test" },
    });
    expect(response.statusCode).toBe(404);
  });
});
