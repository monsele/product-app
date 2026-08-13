import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  ProjectAuthorizationService,
  type AuthGateway,
  type AuthenticatedUser,
  type ProjectAccessScope,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import {
  assertProjectStageTransition,
  ProjectService,
  type ProjectDetail,
  type ProjectListPage,
  type ProjectListQuery,
  type ProjectRepository,
  type ProjectStage,
} from "./projects.js";
import type { SourceUploadService } from "./source-uploads.js";

class InMemoryProjectRepository implements ProjectRepository {
  public readonly records: ProjectDetail[] = [];

  public async create(input: {
    ownerUserId: Identifier;
    title: string;
    correlationId: Identifier;
  }): Promise<ProjectDetail> {
    const now = new Date("2026-08-13T12:00:00.000Z").toISOString();
    const record: ProjectDetail = {
      id: createId(new Date("2026-08-13T12:00:00.000Z")),
      title: input.title,
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    this.records.push(record);
    this.owners.set(record.id, input.ownerUserId);
    return record;
  }

  public async listOwnedProjects(
    ownerUserId: Identifier,
    query: ProjectListQuery,
  ): Promise<ProjectListPage> {
    const records = this.records.filter(
      (record) =>
        this.owners.get(record.id) === ownerUserId &&
        !this.deleted.has(record.id),
    );
    return { items: records.slice(0, query.limit) };
  }

  public async loadOwnedProject(
    scope: ProjectAccessScope,
  ): Promise<{ id: Identifier; ownerUserId: Identifier } | null> {
    return this.owners.get(scope.projectId) === scope.ownerUserId &&
      !this.deleted.has(scope.projectId)
      ? { id: scope.projectId, ownerUserId: scope.ownerUserId }
      : null;
  }

  public async loadOwnedProjectDetail(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectDetail | null> {
    return this.owners.get(projectId) === ownerUserId &&
      !this.deleted.has(projectId)
      ? (this.records.find((record) => record.id === projectId) ?? null)
      : null;
  }

  public async duplicate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    title?: string;
    idempotencyKey: string;
    correlationId: Identifier;
  }): Promise<ProjectDetail> {
    const source = await this.loadOwnedProjectDetail(
      input.ownerUserId,
      input.projectId,
    );
    if (source === null)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.create({
      ownerUserId: input.ownerUserId,
      title: input.title ?? `Copy of ${source.title}`,
      correlationId: input.correlationId,
    });
  }

  public async delete(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
  }): Promise<void> {
    const project = await this.loadOwnedProjectDetail(
      input.ownerUserId,
      input.projectId,
    );
    if (project === null)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    this.deleted.add(project.id);
  }

  public add(
    ownerUserId: Identifier,
    id: Identifier,
    title: string,
    stage: ProjectStage = "draft",
  ): void {
    this.owners.set(id, ownerUserId);
    this.records.push({
      id,
      title,
      stage,
      latestFailedOperation: null,
      createdAt: "2026-08-13T12:00:00.000Z",
      updatedAt: "2026-08-13T12:00:00.000Z",
      revision: 1,
    });
  }

  private readonly owners = new Map<Identifier, Identifier>();
  private readonly deleted = new Set<Identifier>();
}

describe("project stage transitions", () => {
  it("starts at draft and permits only the defined next workflow stage", () => {
    expect(() =>
      assertProjectStageTransition("draft", "uploading"),
    ).not.toThrow();
    expect(() => assertProjectStageTransition("draft", "rendering")).toThrow(
      "cannot transition",
    );
  });
});

describe("project API", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function api(
    trustedOrigin?: string,
    sourceUploadService?: Pick<SourceUploadService, "create" | "complete">,
  ) {
    const ownerUserId = createId(new Date("2026-08-13T10:00:00.000Z"));
    const otherUserId = createId(new Date("2026-08-13T10:00:01.000Z"));
    const otherProjectId = createId(new Date("2026-08-13T10:00:02.000Z"));
    const repository = new InMemoryProjectRepository();
    repository.add(otherUserId, otherProjectId, "Other teacher project");
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner",
        { id: ownerUserId, email: "owner@example.test", displayName: "Owner" },
      ],
      [
        "other",
        { id: otherUserId, email: "other@example.test", displayName: "Other" },
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
    app = await createApp({
      authGateway: auth,
      projectService: new ProjectService(repository),
      projectAuthorizer: new ProjectAuthorizationService(repository),
      ...(sourceUploadService === undefined ? {} : { sourceUploadService }),
      ...(trustedOrigin === undefined ? {} : { trustedOrigin }),
    });
    return { server: app.getHttpAdapter().getInstance(), otherProjectId };
  }

  it("creates a titled draft project for the authenticated teacher", async () => {
    const { server } = await api();
    const response = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      payload: { title: "  Water cycle  " },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().project).toMatchObject({
      title: "Water cycle",
      stage: "draft",
      latestFailedOperation: null,
      revision: 1,
    });
  });

  it("lists only the authenticated teacher's projects and validates titles", async () => {
    const { server } = await api();
    const list = await server.inject({
      method: "GET",
      url: "/projects?limit=25",
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toEqual([]);

    const invalid = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      payload: { title: "   " },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({
      error: { code: "validation_failed", retryable: false },
    });
  });

  it("rejects cross-origin project creation when an origin policy is configured", async () => {
    const { server } = await api("https://teacher.example.test");
    const response = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://attacker.example.test" },
      payload: { title: "Water cycle" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: { code: "forbidden", retryable: false },
    });
  });

  it("conceals another teacher's project detail", async () => {
    const { server, otherProjectId } = await api();
    const response = await server.inject({
      method: "GET",
      url: `/projects/${otherProjectId}`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });

  it("duplicates only the owner's project as an independent draft", async () => {
    const { server } = await api();
    const created = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      payload: { title: "Water cycle" },
    });
    const sourceId = created.json().project.id as string;
    const duplicated = await server.inject({
      method: "POST",
      url: `/projects/${sourceId}/duplicate`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { "idempotency-key": "duplicate-source-once" },
      payload: {},
    });
    expect(duplicated.statusCode).toBe(201);
    expect(duplicated.json().project).toMatchObject({
      title: "Copy of Water cycle",
      stage: "draft",
    });
    expect(duplicated.json().project.id).not.toBe(sourceId);
  });

  it("requires an idempotency key before cloning", async () => {
    const { server } = await api();
    const created = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      payload: { title: "Water cycle" },
    });
    const response = await server.inject({
      method: "POST",
      url: `/projects/${created.json().project.id as string}/duplicate`,
      cookies: { [sessionCookieName]: "owner" },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "validation_failed", retryable: false },
    });
  });

  it("requires confirmation and hides a deleted project immediately", async () => {
    const { server } = await api();
    const created = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      payload: { title: "Water cycle" },
    });
    const projectId = created.json().project.id as string;
    const missingConfirmation = await server.inject({
      method: "DELETE",
      url: `/projects/${projectId}`,
      cookies: { [sessionCookieName]: "owner" },
      payload: {},
    });
    expect(missingConfirmation.statusCode).toBe(400);
    const deleted = await server.inject({
      method: "DELETE",
      url: `/projects/${projectId}`,
      cookies: { [sessionCookieName]: "owner" },
      payload: { confirm: true },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ deleted: true });
    const detail = await server.inject({
      method: "GET",
      url: `/projects/${projectId}`,
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(detail.statusCode).toBe(404);
  });

  it("does not permit another teacher to duplicate or delete a project", async () => {
    const { server, otherProjectId } = await api();
    for (const request of [
      {
        method: "POST" as const,
        url: `/projects/${otherProjectId}/duplicate`,
        headers: { "idempotency-key": "duplicate-foreign-once" },
        payload: {},
      },
      {
        method: "DELETE" as const,
        url: `/projects/${otherProjectId}`,
        payload: { confirm: true },
      },
    ]) {
      const response = await server.inject({
        ...request,
        cookies: { [sessionCookieName]: "owner" },
      });
      expect(response.statusCode).toBe(404);
    }
  });

  it("creates and completes a source upload only within the authorized project", async () => {
    const sourceUploadService: Pick<
      SourceUploadService,
      "create" | "complete"
    > = {
      create: vi.fn(async () => ({
        sessionId: createId(new Date("2026-08-13T10:01:00.000Z")),
        documentId: createId(new Date("2026-08-13T10:01:01.000Z")),
        uploadUrl: "https://storage.example.test/upload",
        method: "PUT" as const,
        requiredHeaders: { "content-type": "application/pdf" },
        expiresAt: "2026-08-13T10:06:00.000Z",
      })),
      complete: vi.fn(async () => ({
        documentId: createId(new Date("2026-08-13T10:01:01.000Z")),
        status: "active" as const,
        ingestionRequested: true as const,
      })),
    };
    const { server, otherProjectId } = await api(
      undefined,
      sourceUploadService,
    );
    const created = await server.inject({
      method: "POST",
      url: "/projects",
      cookies: { [sessionCookieName]: "owner" },
      payload: { title: "Water cycle" },
    });
    const projectId = created.json().project.id as string;
    const started = await server.inject({
      method: "POST",
      url: `/projects/${projectId}/source-upload`,
      cookies: { [sessionCookieName]: "owner" },
      payload: {
        fileName: "water-cycle.pdf",
        mediaType: "application/pdf",
        sizeBytes: 17,
        sha256: "a".repeat(64),
      },
    });
    expect(started.statusCode).toBe(201);
    expect(sourceUploadService.create).toHaveBeenCalledOnce();
    const completed = await server.inject({
      method: "POST",
      url: `/projects/${projectId}/source-upload/${started.json().sessionId}/complete`,
      cookies: { [sessionCookieName]: "owner" },
      payload: {},
    });
    expect(completed.statusCode).toBe(202);
    expect(sourceUploadService.complete).toHaveBeenCalledOnce();

    const foreign = await server.inject({
      method: "POST",
      url: `/projects/${otherProjectId}/source-upload`,
      cookies: { [sessionCookieName]: "owner" },
      payload: {
        fileName: "water-cycle.pdf",
        mediaType: "application/pdf",
        sizeBytes: 17,
        sha256: "a".repeat(64),
      },
    });
    expect(foreign.statusCode).toBe(404);
    expect(sourceUploadService.create).toHaveBeenCalledOnce();
  });
});
