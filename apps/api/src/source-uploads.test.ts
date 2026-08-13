import { describe, expect, it, vi } from "vitest";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  outboxEvents,
  projects,
  sourceDocuments,
  uploadSessions,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import {
  StorageObjectNotFoundError,
  type ObjectStorage,
  type SignedStorageRequest,
  type StorageObjectMetadata,
} from "@avlp/storage";
import {
  PostgresSourceUploadRepository,
  SourceUploadService,
  type SourceUploadRepository,
} from "./source-uploads.js";

const ownerId = createId(new Date("2026-08-13T10:00:00.000Z"));
const otherOwnerId = createId(new Date("2026-08-13T10:00:01.000Z"));
const projectId = createId(new Date("2026-08-13T10:00:02.000Z"));
const sessionId = createId(new Date("2026-08-13T10:00:03.000Z"));
const documentId = createId(new Date("2026-08-13T10:00:04.000Z"));
const correlationId = createId(new Date("2026-08-13T10:00:05.000Z"));
const checksum = "a".repeat(64);
const key = `users/${ownerId}/projects/${projectId}/source/${documentId}/original.pdf`;

function session(
  overrides: Partial<{
    ownerUserId: Identifier;
    expiresAt: Date;
    completedAt: Date | null;
  }> = {},
) {
  return {
    id: sessionId,
    documentId,
    projectId,
    ownerUserId: ownerId,
    originalName: "water-cycle.pdf",
    mediaType: "application/pdf" as const,
    sizeBytes: 17,
    sha256: checksum,
    storageKey: key,
    expiresAt: new Date("2026-08-13T12:05:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

function signed(): SignedStorageRequest {
  return {
    object: { bucket: "private", key },
    url: "https://storage.example.test/upload",
    method: "PUT",
    expiresAt: new Date("2026-08-13T12:05:00.000Z"),
    requiredHeaders: { "content-type": "application/pdf" },
  };
}

function metadata(
  overrides: Partial<StorageObjectMetadata> = {},
): StorageObjectMetadata {
  return {
    object: { bucket: "private", key },
    sizeBytes: 17,
    contentType: "application/pdf",
    checksumSha256: checksum,
    etag: "etag",
    lastModified: new Date("2026-08-13T12:00:00.000Z"),
    metadata: {},
    ...overrides,
  };
}

function harness(
  input: {
    pending?: ReturnType<typeof session>;
    objectMetadata?: StorageObjectMetadata;
    metadataError?: Error;
  } = {},
) {
  const createSession = vi.fn<SourceUploadRepository["createSession"]>(
    async () => {},
  );
  const findSession = vi.fn<SourceUploadRepository["findSession"]>(
    async (userId) => {
      if (userId !== ownerId)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      return input.pending ?? session();
    },
  );
  const completeSession = vi.fn<SourceUploadRepository["completeSession"]>(
    async () => ({
      documentId,
      status: "active",
      ingestionRequested: true,
    }),
  );
  const repository: SourceUploadRepository = {
    createSession,
    findSession,
    completeSession,
  };
  const createSignedUpload = vi.fn<ObjectStorage["createSignedUpload"]>(
    async () => signed(),
  );
  const getMetadata = vi.fn<ObjectStorage["getMetadata"]>(async () => {
    if (input.metadataError !== undefined) throw input.metadataError;
    return input.objectMetadata ?? metadata();
  });
  const storage = { createSignedUpload, getMetadata } as Pick<
    ObjectStorage,
    "createSignedUpload" | "getMetadata"
  > as ObjectStorage;
  return {
    service: new SourceUploadService(
      repository,
      storage,
      () => new Date("2026-08-13T12:00:00.000Z"),
    ),
    createSession,
    findSession,
    completeSession,
    createSignedUpload,
    getMetadata,
  };
}

describe("SourceUploadService", () => {
  it("issues a constrained tenant-scoped PDF upload session", async () => {
    const test = harness();
    const result = await test.service.create(ownerId, projectId, {
      fileName: "water-cycle.pdf",
      mediaType: "application/pdf",
      sizeBytes: 17,
      sha256: checksum,
    });

    expect(result).toMatchObject({
      method: "PUT",
      uploadUrl: "https://storage.example.test/upload",
    });
    expect(test.createSignedUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "application/pdf",
        contentLength: 17,
        checksumSha256: checksum,
        key: expect.stringContaining(
          `users/${ownerId}/projects/${projectId}/source/`,
        ),
      }),
    );
    expect(test.createSession).toHaveBeenCalledOnce();
    await expect(
      test.service.create(ownerId, projectId, {
        fileName: "spoofed.docx",
        mediaType: "application/pdf",
        sizeBytes: 17,
        sha256: checksum,
      }),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
  });

  it("rejects missing or mismatched objects before completing", async () => {
    const missing = harness({
      metadataError: new StorageObjectNotFoundError(key),
    });
    await expect(
      missing.service.complete(
        ownerId,
        projectId,
        sessionId,
        {},
        correlationId,
      ),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
    expect(missing.completeSession).not.toHaveBeenCalled();

    const mismatched = harness({ objectMetadata: metadata({ sizeBytes: 18 }) });
    await expect(
      mismatched.service.complete(
        ownerId,
        projectId,
        sessionId,
        {},
        correlationId,
      ),
    ).rejects.toMatchObject({ code: "validation_failed", statusCode: 400 });
    expect(mismatched.completeSession).not.toHaveBeenCalled();
  });

  it("preserves transient metadata failures as retryable server errors", async () => {
    const unavailable = harness({ metadataError: new Error("storage unavailable") });
    await expect(
      unavailable.service.complete(
        ownerId,
        projectId,
        sessionId,
        {},
        correlationId,
      ),
    ).rejects.toThrow("storage unavailable");
    expect(unavailable.completeSession).not.toHaveBeenCalled();
  });

  it("completes an uploaded object once and lets the repository preserve idempotency", async () => {
    const test = harness();
    await expect(
      test.service.complete(ownerId, projectId, sessionId, {}, correlationId),
    ).resolves.toEqual({
      documentId,
      status: "active",
      ingestionRequested: true,
    });
    expect(test.getMetadata).toHaveBeenCalledWith(key);
    expect(test.completeSession).toHaveBeenCalledWith({
      ownerUserId: ownerId,
      projectId,
      sessionId,
      correlationId,
    });
  });

  it("does not disclose another teacher's upload session", async () => {
    const test = harness();
    await expect(
      test.service.complete(
        otherOwnerId,
        projectId,
        sessionId,
        {},
        correlationId,
      ),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    expect(test.getMetadata).not.toHaveBeenCalled();
  });
});

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("PostgresSourceUploadRepository", () => {
  let database: TestDatabase | undefined;
  let repository: PostgresSourceUploadRepository;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
    await database!.client.delete(auditEvents);
    await database!.client.delete(uploadSessions);
    await database!.client.delete(sourceDocuments);
    await database!.client.delete(projects);
    await database!.client.delete(users);
    await database!.client.insert(users).values({
      id: ownerId,
      emailNormalized: "owner@example.test",
      displayName: "Owner",
    });
    await database!.client.insert(projects).values({
      id: projectId,
      ownerUserId: ownerId,
      title: "Water cycle",
      stage: "draft",
    });
    repository = new PostgresSourceUploadRepository(
      database!.client,
      () => new Date("2026-08-13T12:00:00.000Z"),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("creates one document, job, and outbox request across repeated completion", async () => {
    await repository.createSession(session());
    const getMetadata = vi.fn<ObjectStorage["getMetadata"]>(async () =>
      metadata(),
    );
    const storage = { getMetadata } as Pick<
      ObjectStorage,
      "getMetadata"
    > as ObjectStorage;
    const service = new SourceUploadService(
      repository,
      storage,
      () => new Date("2026-08-13T12:00:00.000Z"),
    );

    const [first, second] = await Promise.all([
      service.complete(ownerId, projectId, sessionId, {}, correlationId),
      service.complete(ownerId, projectId, sessionId, {}, correlationId),
    ]);

    expect(first).toEqual(second);
    expect(await database!.client.select().from(sourceDocuments)).toHaveLength(
      1,
    );
    expect(await database!.client.select().from(jobs)).toHaveLength(1);
    const events = await database!.client.select().from(outboxEvents);
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("document.ingestion.requested.v1");
    expect(getMetadata).toHaveBeenCalledTimes(1);
  });

  it("refuses completion after the project has been deleted", async () => {
    await repository.createSession(session());
    await database!.client
      .update(projects)
      .set({ deletedAt: new Date("2026-08-13T12:01:00.000Z") })
      .where(eq(projects.id, projectId));

    await expect(
      repository.completeSession({
        ownerUserId: ownerId,
        projectId,
        sessionId,
        correlationId,
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    expect(await database!.client.select().from(sourceDocuments)).toHaveLength(
      0,
    );
    expect(await database!.client.select().from(jobs)).toHaveLength(0);
  });
});
