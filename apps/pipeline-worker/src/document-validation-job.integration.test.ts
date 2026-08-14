import { createId } from "@avlp/config";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  outboxEvents,
  projects,
  sourceDocuments,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  documentValidationCleanupJobPayloadSchema,
  documentValidationJobPayloadSchema,
} from "@avlp/schemas";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createDocumentValidationJobHandler } from "./document-validation-job.js";
import {
  createDocumentValidationCleanupJobHandler,
  documentValidationCleanupJobType,
} from "./document-validation-cleanup-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;
const ownerUserId = createId(new Date("2026-08-14T09:00:00.000Z"));
const projectId = createId(new Date("2026-08-14T09:00:01.000Z"));
const documentId = createId(new Date("2026-08-14T09:00:02.000Z"));
const correlationId = createId(new Date("2026-08-14T09:00:03.000Z"));
const storageKey = `users/${ownerUserId}/projects/${projectId}/source/${documentId}/original.pdf`;

describeWithPostgres("document validation job", () => {
  let database: TestDatabase | undefined;
  let bytes: Uint8Array;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    bytes = await pdf.save();
    await database!.client.delete(outboxEvents);
    await database!.client.delete(jobs);
    await database!.client.delete(auditEvents);
    await database!.client.delete(sourceDocuments);
    await database!.client.delete(projects);
    await database!.client.delete(users);
    await database!.client.insert(users).values({
      id: ownerUserId,
      emailNormalized: "owner@example.test",
      displayName: "Owner",
    });
    await database!.client.insert(projects).values({
      id: projectId,
      ownerUserId,
      title: "Water cycle",
      stage: "validating_source",
    });
    await database!.client.insert(sourceDocuments).values({
      id: documentId,
      projectId,
      ownerUserId,
      originalName: "water-cycle.pdf",
      mediaType: "application/pdf",
      sizeBytes: bytes.byteLength,
      sha256: "a".repeat(64),
      storageKey,
      status: "pending_validation",
    });
  });

  afterAll(async () => database?.destroy());

  const context = {
    attempt: 1,
    correlationId,
    heartbeat: async () => undefined,
    idempotencyKey: "document-validation",
    jobId: createId(new Date("2026-08-14T09:00:04.000Z")),
    ownerUserId,
    projectId,
    reportProgress: async () => undefined,
  };

  it("activates a safe document and only then queues ingestion", async () => {
    const handler = createDocumentValidationJobHandler({
      database: database!.client,
      storage: {
        delete: async () => undefined,
        getBytes: async () => ({ body: bytes, metadata: {} as never }),
      },
      scanner: { scan: async () => ({ status: "safe" as const }) },
      maxUploadBytes: 1_024,
    });
    await expect(
      handler.handler(
        documentValidationJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).resolves.toMatchObject({ validation: "accepted", pageCount: 1 });
    const [document] = await database!.client
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId));
    expect(document).toMatchObject({
      status: "active",
      scanStatus: "safe",
      pageCount: 1,
    });
    const [ingestion] = await database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "document.ingestion"));
    expect(ingestion).toBeDefined();
  });

  it("quarantines an unsafe document, queues cleanup, and never queues ingestion", async () => {
    const deleteObject = vi.fn(async () => undefined);
    const handler = createDocumentValidationJobHandler({
      database: database!.client,
      storage: {
        delete: deleteObject,
        getBytes: async () => ({ body: bytes, metadata: {} as never }),
      },
      scanner: { scan: async () => ({ status: "unsafe" as const }) },
      maxUploadBytes: 1_024,
    });
    await expect(
      handler.handler(
        documentValidationJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).resolves.toMatchObject({
      validation: "rejected",
      code: "MALWARE_DETECTED",
    });
    expect(deleteObject).not.toHaveBeenCalled();
    const [document] = await database!.client
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId));
    expect(document).toMatchObject({
      status: "rejected",
      validationCode: "MALWARE_DETECTED",
    });
    const queuedJobs = await database!.client.select().from(jobs);
    expect(queuedJobs.some((job) => job.jobType === "document.ingestion")).toBe(
      false,
    );
    expect(
      queuedJobs.some((job) => job.jobType === documentValidationCleanupJobType),
    ).toBe(true);

    const failedCleanup = createDocumentValidationCleanupJobHandler({
      database: database!.client,
      storage: {
        delete: async () => {
          throw new Error("temporary storage error");
        },
      },
    });
    await expect(
      failedCleanup.handler(
        documentValidationCleanupJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).rejects.toThrow("temporary storage error");
    const [afterFailedCleanup] = await database!.client
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId));
    expect(afterFailedCleanup).toMatchObject({
      status: "rejected",
      validationCode: "MALWARE_DETECTED",
    });

    const successfulCleanup = createDocumentValidationCleanupJobHandler({
      database: database!.client,
      storage: { delete: deleteObject },
    });
    await expect(
      successfulCleanup.handler(
        documentValidationCleanupJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).resolves.toMatchObject({ cleanup: "deleted" });
    expect(deleteObject).toHaveBeenCalledWith(storageKey);
  });

  it("queues cleanup for a malformed document without starting ingestion", async () => {
    const handler = createDocumentValidationJobHandler({
      database: database!.client,
      storage: {
        delete: async () => undefined,
        getBytes: async () => ({
          body: new TextEncoder().encode("not a PDF"),
          metadata: {} as never,
        }),
      },
      scanner: { scan: async () => ({ status: "safe" as const }) },
      maxUploadBytes: 1_024,
    });
    await expect(
      handler.handler(
        documentValidationJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).resolves.toMatchObject({ validation: "rejected", code: "MIME_MISMATCH" });
    const [document] = await database!.client
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId));
    expect(document).toMatchObject({
      status: "rejected",
      validationCode: "MIME_MISMATCH",
    });
    const queuedJobs = await database!.client.select().from(jobs);
    expect(queuedJobs.some((job) => job.jobType === "document.ingestion")).toBe(
      false,
    );
    expect(
      queuedJobs.some((job) => job.jobType === documentValidationCleanupJobType),
    ).toBe(true);
  });

  it("records a distinct retryable inspection error when storage cannot be read", async () => {
    const handler = createDocumentValidationJobHandler({
      database: database!.client,
      storage: {
        delete: async () => undefined,
        getBytes: async () => {
          throw new Error("object unavailable");
        },
      },
      scanner: { scan: async () => ({ status: "safe" as const }) },
      maxUploadBytes: 1_024,
    });
    await expect(
      handler.handler(
        documentValidationJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).rejects.toMatchObject({ code: "DOCUMENT_READ_FAILED" });
    const [document] = await database!.client
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId));
    expect(document).toMatchObject({
      status: "validation_error",
      validationCode: "DOCUMENT_INSPECTION_UNAVAILABLE",
    });
    expect(await database!.client.select().from(jobs)).toEqual([]);
  });

  it("records a distinct retryable scanner error when malware scanning is unavailable", async () => {
    const handler = createDocumentValidationJobHandler({
      database: database!.client,
      storage: {
        delete: async () => undefined,
        getBytes: async () => ({ body: bytes, metadata: {} as never }),
      },
      scanner: {
        scan: async () => {
          throw new Error("scanner unavailable");
        },
      },
      maxUploadBytes: 1_024,
    });
    await expect(
      handler.handler(
        documentValidationJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).rejects.toMatchObject({ code: "MALWARE_SCAN_UNAVAILABLE" });
    const [document] = await database!.client
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.id, documentId));
    expect(document).toMatchObject({
      status: "validation_error",
      validationCode: "MALWARE_SCAN_UNAVAILABLE",
    });
    expect(await database!.client.select().from(jobs)).toEqual([]);
  });
});
