import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  projectAssets,
  projectAssetUploadSessions,
  projects,
  scenes,
  jobs,
  outboxEvents,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import {
  completeProjectAssetUploadInputSchema,
  completeProjectAssetUploadResponseSchema,
  createProjectAssetUploadInputSchema,
  projectAssetListResponseSchema,
  projectAssetMediaTypeSchema,
  projectAssetUploadSessionSchema,
  projectAssetCleanupJobPayloadSchema,
  projectAssetValidationJobPayloadSchema,
  type CompleteProjectAssetUploadResponse,
  type ProjectAssetListResponse,
  type ProjectAssetUploadSession,
} from "@avlp/schemas";
import {
  storageKeySchema,
  storageKeys,
  StorageObjectNotFoundError,
  type ObjectStorage,
} from "@avlp/storage";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";

const uploadSessionTtlMs = 5 * 60 * 1_000;
const maxUploadBytes = 10 * 1024 * 1024;
const maxPixels = 20_000_000;
const maxDimension = 8_000;
const maxAspectRatio = 8;
/** Retain a deleted private image long enough for operational recovery. */
export const projectAssetDeletionRetentionMs = 30 * 24 * 60 * 60 * 1_000;

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}

function validation(message: string, field = "file"): PublicError {
  return new PublicError(
    "validation_failed",
    "The image upload is invalid.",
    400,
    false,
    { [field]: message },
  );
}

function extensionFor(
  mediaType: z.infer<typeof projectAssetMediaTypeSchema>,
): "png" | "jpg" | "webp" {
  if (mediaType === "image/png") return "png";
  if (mediaType === "image/jpeg") return "jpg";
  return "webp";
}

/** Decode bytes instead of trusting extension or client MIME claims. */
export async function inspectTeacherImage(input: {
  bytes: Uint8Array;
  mediaType: unknown;
}): Promise<{
  width: number;
  height: number;
  mediaType: z.infer<typeof projectAssetMediaTypeSchema>;
}> {
  const mediaType = projectAssetMediaTypeSchema.parse(input.mediaType);
  const inspected = await sharp(input.bytes, {
    limitInputPixels: maxPixels,
    animated: false,
  })
    .metadata()
    .catch(() => {
      throw validation("The uploaded file is not a supported image.");
    });
  const expectedFormat =
    mediaType === "image/jpeg" ? "jpeg" : mediaType.slice("image/".length);
  if (
    inspected.format !== expectedFormat ||
    inspected.width === undefined ||
    inspected.height === undefined
  )
    throw validation(
      "The file signature does not match the selected image type.",
    );
  if (
    inspected.width > maxDimension ||
    inspected.height > maxDimension ||
    inspected.width * inspected.height > maxPixels ||
    Math.max(
      inspected.width / inspected.height,
      inspected.height / inspected.width,
    ) > maxAspectRatio
  )
    throw validation("The image dimensions or aspect ratio are not supported.");
  return { width: inspected.width, height: inspected.height, mediaType };
}

/** Re-encoding removes EXIF payloads while the immutable original remains private. */
export async function createTeacherAssetThumbnail(
  bytes: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const thumbnail = await sharp(bytes, {
    limitInputPixels: maxPixels,
    animated: false,
  })
    .rotate()
    .resize({
      width: 512,
      height: 512,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  const result = new Uint8Array(thumbnail.byteLength);
  result.set(thumbnail);
  return result;
}

/** Project-private, immutable teacher-uploaded images and their derived previews. */
export class ProjectAssetService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async create(
    ownerUserId: Identifier,
    projectId: Identifier,
    input: unknown,
  ): Promise<ProjectAssetUploadSession> {
    const request = parseBoundary(createProjectAssetUploadInputSchema, input);
    if (request.sizeBytes > maxUploadBytes)
      throw validation("Images are limited to 10 MB.", "sizeBytes");
    const [project] = await this.database
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (project === undefined)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    const timestamp = this.now();
    const assetId = createId(timestamp);
    const sessionId = createId(timestamp);
    const storageKey = storageKeys.assetOriginal({
      userId: ownerUserId,
      projectId,
      assetId,
      extension: extensionFor(request.mediaType),
    });
    const signed = await this.storage.createSignedUpload({
      key: storageKey,
      contentType: request.mediaType,
      contentLength: request.sizeBytes,
      checksumSha256: request.sha256,
      expiresInSeconds: Math.floor(uploadSessionTtlMs / 1_000),
      metadata: { "upload-session-id": sessionId },
    });
    await this.database.transaction(async (transaction) => {
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, projectId),
            eq(projects.ownerUserId, ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (project === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      await transaction.insert(projectAssetUploadSessions).values({
        id: sessionId,
        assetId,
        ownerUserId,
        projectId,
        originalName: request.fileName,
        expectedMediaType: request.mediaType,
        expectedSizeBytes: request.sizeBytes,
        expectedSha256: request.sha256,
        storageKey,
        expiresAt: signed.expiresAt,
      });
    });
    return projectAssetUploadSessionSchema.parse({
      sessionId,
      assetId,
      uploadUrl: signed.url,
      method: signed.method,
      requiredHeaders: signed.requiredHeaders,
      expiresAt: serializeUtcTimestamp(signed.expiresAt),
    });
  }

  public async complete(
    ownerUserId: Identifier,
    projectId: Identifier,
    sessionId: Identifier,
    input: unknown,
    correlationId: Identifier,
  ): Promise<CompleteProjectAssetUploadResponse> {
    parseBoundary(completeProjectAssetUploadInputSchema, input);
    const [session] = await this.database
      .select()
      .from(projectAssetUploadSessions)
      .where(
        and(
          eq(projectAssetUploadSessions.id, sessionId),
          eq(projectAssetUploadSessions.ownerUserId, ownerUserId),
          eq(projectAssetUploadSessions.projectId, projectId),
        ),
      )
      .limit(1);
    if (session === undefined)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    if (session.completedAt !== null) {
      const [asset] = await this.database
        .select()
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.id, session.assetId),
            eq(projectAssets.ownerUserId, ownerUserId),
            eq(projectAssets.projectId, projectId),
            isNull(projectAssets.deletedAt),
          ),
        )
        .limit(1);
      if (asset === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      if (asset.status === "active")
        return completeProjectAssetUploadResponseSchema.parse({
          asset: await this.toResponse(asset),
          status: "active",
        });
      return completeProjectAssetUploadResponseSchema.parse({
        asset: null,
        status: asset.status === "rejected" ? "rejected" : "pending_validation",
      });
    }
    if (session.expiresAt <= this.now())
      throw validation(
        "This upload session has expired. Start a new upload.",
        "sessionId",
      );
    let metadata;
    try {
      metadata = await this.storage.getMetadata(
        storageKeySchema.parse(session.storageKey),
      );
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError)
        throw validation(
          "The uploaded image could not be found. Retry the upload.",
        );
      throw error;
    }
    if (
      metadata.sizeBytes !== session.expectedSizeBytes ||
      metadata.contentType?.toLowerCase() !== session.expectedMediaType ||
      metadata.checksumSha256 !== session.expectedSha256
    )
      throw validation(
        "The uploaded image does not match the requested metadata. Retry the upload.",
      );
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const [locked] = await transaction
        .select()
        .from(projectAssetUploadSessions)
        .where(
          and(
            eq(projectAssetUploadSessions.id, sessionId),
            eq(projectAssetUploadSessions.ownerUserId, ownerUserId),
            eq(projectAssetUploadSessions.projectId, projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (locked === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      if (locked.completedAt === null) {
        const payload = projectAssetValidationJobPayloadSchema.parse({
          schemaVersion: 1,
          assetId: locked.assetId,
        });
        const inputVersion = `project-asset:${locked.assetId}:${locked.expectedSha256}`;
        const envelope = createJobEnvelope(
          projectAssetValidationJobPayloadSchema,
          {
            jobId: createId(timestamp),
            jobType: "project-asset.validation",
            projectId,
            ownerUserId,
            inputVersion,
            idempotencyKey: createIdempotencyKey({
              jobType: "project-asset.validation",
              projectId,
              inputVersion,
              options: {},
            }),
            correlationId,
            payloadVersion: 1,
            payload,
            requestedAt: timestamp,
          },
        );
        const [job] = await transaction
          .insert(jobs)
          .values({
            id: envelope.jobId,
            jobType: envelope.jobType,
            queueName: "pipeline",
            projectId,
            ownerUserId,
            inputVersion: envelope.inputVersion,
            idempotencyKey: envelope.idempotencyKey,
            correlationId,
            payloadVersion: 1,
            payload,
          })
          .onConflictDoNothing()
          .returning({ id: jobs.id });
        const jobId =
          job?.id ??
          (
            await transaction
              .select({ id: jobs.id })
              .from(jobs)
              .where(
                and(
                  eq(jobs.ownerUserId, ownerUserId),
                  eq(jobs.projectId, projectId),
                  eq(jobs.idempotencyKey, envelope.idempotencyKey),
                ),
              )
              .limit(1)
          )[0]?.id;
        if (jobId === undefined)
          throw new Error("The asset validation job could not be read.");
        await transaction
          .insert(projectAssets)
          .values({
            id: locked.assetId,
            ownerUserId,
            projectId,
            mediaType: locked.expectedMediaType,
            originalName: locked.originalName,
            sizeBytes: locked.expectedSizeBytes,
            sha256: locked.expectedSha256,
            storageKey: locked.storageKey,
            provenance: "teacher_uploaded",
            status: "pending_validation",
          })
          .onConflictDoNothing();
        await transaction
          .update(projectAssetUploadSessions)
          .set({
            completedAt: timestamp,
            validationJobId: jobId,
            updatedAt: timestamp,
          })
          .where(eq(projectAssetUploadSessions.id, sessionId));
        if (job !== undefined)
          await transaction.insert(outboxEvents).values({
            id: createId(timestamp),
            jobId,
            eventType: "project_asset.validation.requested.v1",
            queueName: "pipeline",
            envelope,
            deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
          });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId,
          projectId,
          actor: { type: "user", userId: ownerUserId },
          eventType: "project_asset.validation_requested",
          target: { type: "project_asset", id: locked.assetId },
          correlationId,
          metadata: { operation: "teacher_asset_validation_requested" },
          occurredAt: timestamp,
        });
      }
    });
    return completeProjectAssetUploadResponseSchema.parse({
      asset: null,
      status: "pending_validation",
    });
  }

  public async list(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectAssetListResponse> {
    const rows = await this.database
      .select()
      .from(projectAssets)
      .where(
        and(
          eq(projectAssets.ownerUserId, ownerUserId),
          eq(projectAssets.projectId, projectId),
          eq(projectAssets.status, "active"),
          isNull(projectAssets.deletedAt),
        ),
      )
      .orderBy(desc(projectAssets.createdAt));
    const assets = await Promise.all(rows.map((row) => this.toResponse(row)));
    return projectAssetListResponseSchema.parse({ assets });
  }

  /** Signs an AI candidate only after tenant-scoped asset lookup. */
  public async reviewPreview(
    ownerUserId: Identifier,
    projectId: Identifier,
    assetId: Identifier,
  ): Promise<string> {
    const [asset] = await this.database.select({ storageKey: projectAssets.storageKey })
      .from(projectAssets)
      .where(and(eq(projectAssets.id, assetId), eq(projectAssets.ownerUserId, ownerUserId), eq(projectAssets.projectId, projectId), eq(projectAssets.provenance, "ai_generated"), eq(projectAssets.status, "pending_review"), isNull(projectAssets.deletedAt)))
      .limit(1);
    if (asset === undefined) throw new PublicError("not_found", "The requested resource was not found.", 404);
    return (await this.storage.createSignedDownload({ key: storageKeySchema.parse(asset.storageKey) })).url;
  }

  public async remove(
    ownerUserId: Identifier,
    projectId: Identifier,
    assetId: Identifier,
    correlationId: Identifier,
  ): Promise<void> {
    const timestamp = this.now();
    const cleanupAfter = new Date(
      timestamp.getTime() + projectAssetDeletionRetentionMs,
    );
    await this.database.transaction(async (transaction) => {
      const [reference] = await transaction
        .select({ id: scenes.id })
        .from(scenes)
        .where(
          and(
            eq(scenes.ownerUserId, ownerUserId),
            eq(scenes.projectId, projectId),
            sql`${scenes.sceneJson} @> ${JSON.stringify({ assetBindings: [{ assetId }] })}::jsonb`,
          ),
        )
        .limit(1);
      if (reference !== undefined)
        throw new PublicError(
          "validation_failed",
          "This image is still used by a scene. Restore or replace that scene binding first.",
          409,
        );
      const result = await transaction
        .update(projectAssets)
        .set({ deletedAt: timestamp, cleanupAfter, updatedAt: timestamp })
        .where(
          and(
            eq(projectAssets.id, assetId),
            eq(projectAssets.ownerUserId, ownerUserId),
            eq(projectAssets.projectId, projectId),
            isNull(projectAssets.deletedAt),
          ),
        )
        .returning({ id: projectAssets.id });
      if (result.length === 0)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      const cleanupPayload = projectAssetCleanupJobPayloadSchema.parse({
        schemaVersion: 1,
        assetId,
        deletedAt: serializeUtcTimestamp(timestamp),
        cleanupAfter: serializeUtcTimestamp(cleanupAfter),
      });
      const cleanupEnvelope = createJobEnvelope(
        projectAssetCleanupJobPayloadSchema,
        {
          jobId: createId(timestamp),
          jobType: "project-asset.cleanup",
          projectId,
          ownerUserId,
          inputVersion: `project-asset-deletion:${assetId}`,
          idempotencyKey: createIdempotencyKey({
            jobType: "project-asset.cleanup",
            projectId,
            inputVersion: `project-asset-deletion:${assetId}`,
            options: { cleanupAfter: cleanupPayload.cleanupAfter },
          }),
          correlationId,
          payloadVersion: 1,
          payload: cleanupPayload,
          requestedAt: timestamp,
        },
      );
      await transaction.insert(jobs).values({
        id: cleanupEnvelope.jobId,
        jobType: cleanupEnvelope.jobType,
        queueName: "pipeline",
        projectId: cleanupEnvelope.projectId,
        ownerUserId: cleanupEnvelope.ownerUserId,
        inputVersion: cleanupEnvelope.inputVersion,
        idempotencyKey: cleanupEnvelope.idempotencyKey,
        correlationId: cleanupEnvelope.correlationId,
        payloadVersion: 1,
        payload: cleanupEnvelope.payload,
        availableAt: cleanupAfter,
      });
      await transaction.insert(outboxEvents).values({
        id: createId(timestamp),
        jobId: cleanupEnvelope.jobId,
        eventType: "project_asset.cleanup.requested.v1",
        queueName: "pipeline",
        envelope: cleanupEnvelope,
        deliveryOptions: { maxAttempts: 5, retryDelayMs: 30_000 },
        availableAt: cleanupAfter,
      });
      await new PostgresAuditWriter(transaction).write({
        ownerUserId,
        projectId,
        actor: { type: "user", userId: ownerUserId },
        eventType: "project_asset.deleted",
        target: { type: "project_asset", id: assetId },
        correlationId,
        metadata: {
          operation: "teacher_asset_deleted",
          cleanupAfter: serializeUtcTimestamp(cleanupAfter),
        },
        occurredAt: timestamp,
      });
    });
  }

  private async toResponse(row: typeof projectAssets.$inferSelect) {
    if (
      row.thumbnailStorageKey === null ||
      row.width === null ||
      row.height === null
    )
      throw new Error(
        "An active project asset is missing derived preview metadata.",
      );
    const signed = await this.storage.createSignedDownload({
      key: storageKeySchema.parse(row.thumbnailStorageKey),
    });
    return {
      assetId: row.id as Identifier,
      mediaType: projectAssetMediaTypeSchema.parse(row.mediaType),
      width: row.width,
      height: row.height,
      provenance: "teacher_uploaded" as const,
      previewUrl: signed.url,
      createdAt: serializeUtcTimestamp(row.createdAt),
    };
  }
}
