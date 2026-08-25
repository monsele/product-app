import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  lessonVersions,
  outboxEvents,
  renderJobs,
  renderedVideos,
  renderThumbnails,
  captionCues,
  captionTracks,
  extractedFigures,
  sceneAudio,
  scenes,
  parsedDocuments,
  projectAssets,
  validationIssues,
  validationRuns,
  type DatabaseClient,
} from "@avlp/database";
import {
  createIdempotencyKey,
  createJobEnvelope,
  hashJobOptions,
} from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  renderRequestSchema,
  renderStatusResponseSchema,
  lessonSpecSchema,
  type RenderStatusResponse,
} from "@avlp/schemas";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { storageKeySchema, type ObjectStorage } from "@avlp/storage";
import { approvedAssetById } from "./approved-assets.js";
import type { LessonValidationService } from "./lesson-validation.js";

const renderProfile = Object.freeze({
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: "h264",
  audioCodec: "aac",
  pixelFormat: "yuv420p",
});
const rendererVersion = "st-024-remotion-4.0.507-scene-library-v1";
const defaultRenderLimits = Object.freeze({
  maxConcurrentPerProject: 1,
  maxStartsPerProjectHour: 12,
});

function isRenderableImage(
  value: string | null,
): value is "image/gif" | "image/jpeg" | "image/png" | "image/webp" {
  return (
    value === "image/gif" ||
    value === "image/jpeg" ||
    value === "image/png" ||
    value === "image/webp"
  );
}

type Scope = { ownerUserId: Identifier; projectId: Identifier };
export interface RenderService {
  start(
    input: Scope & {
      body: unknown;
      correlationId: Identifier;
      idempotencyKey?: string;
    },
  ): Promise<RenderStatusResponse>;
  list(input: Scope): Promise<{ renders: RenderStatusResponse[] }>;
  detail(
    input: Scope & { renderId: Identifier },
  ): Promise<RenderStatusResponse>;
  retry(
    input: Scope & { renderId: Identifier; correlationId: Identifier },
  ): Promise<RenderStatusResponse>;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}
function hash(value: unknown): string {
  return hashJobOptions(value);
}
/** Boundary contract stored in the durable generic job envelope. The renderer
 * performs the stricter production-manifest validation when it claims work. */
export const renderEnvelopePayloadSchema = z
  .object({
    assetManifest: z.unknown(),
    compositionSha256: z.string().length(64),
    lessonVersionId: z.string().uuid(),
    lessonSpecSha256: z.string().length(64),
    manifest: z.unknown(),
    optionsHash: z.string().length(64),
    profile: z.unknown(),
    rendererVersion: z.string(),
  })
  .strict();
/** A render profile/version identifies one paid logical operation. Request
 * tokens intentionally do not alter this key, preventing duplicate renders. */
export function renderIdempotencyKey(input: {
  projectId: Identifier;
  lessonVersionContentHash: string;
}): string {
  return createIdempotencyKey({
    jobType: "lesson.render",
    projectId: input.projectId,
    inputVersion: input.lessonVersionContentHash,
    options: { profile: renderProfile, rendererVersion },
  });
}
function safeErrorCode(
  value: string | null,
): z.infer<typeof renderStatusResponseSchema>["errorCode"] {
  const parsed = renderStatusResponseSchema.shape.errorCode.safeParse(value);
  return parsed.success ? (parsed.data ?? null) : "RENDER_FAILED";
}
function publicErrorMessage(code: string | null): string | null {
  if (code === null) return null;
  const messages: Record<string, string> = {
    VALIDATION_STALE: "Validation is no longer current. Run validation again.",
    VALIDATION_BLOCKED: "Resolve blocking validation issues before rendering.",
    RENDER_TIMEOUT: "Rendering took too long. You can retry it.",
    RENDER_WORKER_UNAVAILABLE:
      "The render service is temporarily unavailable. You can retry it.",
    ASSET_MISSING:
      "A required lesson asset is unavailable. Return to the storyboard and fix it.",
    ASSET_CHECKSUM_MISMATCH:
      "A required lesson asset changed. Regenerate the affected artifact.",
    OUTPUT_UNREADABLE:
      "The rendered video could not be verified. You can retry it.",
    OUTPUT_PROFILE_INVALID:
      "The rendered video did not meet the required media settings. You can retry it.",
    RENDER_STORAGE_FAILED:
      "The verified video could not be stored. You can retry it.",
    RENDER_CANCELLED: "This render was cancelled.",
    RENDER_FAILED:
      "The lesson could not be rendered. You can retry it when available.",
  };
  return (
    messages[code] ??
    "The lesson could not be rendered. You can retry it when available."
  );
}
function statusForJob(
  state: (typeof jobs.$inferSelect)["state"],
): RenderStatusResponse["status"] {
  if (state === "running") return "rendering";
  if (state === "succeeded") return "completed";
  if (state === "failed") return "failed";
  if (state === "cancelled") return "cancelled";
  return "queued";
}

/** Authoritative API orchestration. It only makes an immutable manifest and
 * queues work; the isolated renderer executes the expensive media operation. */
export class PostgresRenderService implements RenderService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly validationService?: Pick<
      LessonValidationService,
      "latest"
    >,
    private readonly limits: Readonly<{
      maxConcurrentPerProject: number;
      maxStartsPerProjectHour: number;
    }> = defaultRenderLimits,
    private readonly now: () => Date = () => new Date(),
    private readonly storage?: Pick<ObjectStorage, "createSignedDownload">,
  ) {}

  public async start(
    input: Scope & {
      body: unknown;
      correlationId: Identifier;
      idempotencyKey?: string;
    },
  ): Promise<RenderStatusResponse> {
    const command = parse(renderRequestSchema, input.body);
    const current = await this.validationService?.latest(input);
    if (
      current !== undefined &&
      (current === null || current.status !== "passed" || current.stale)
    )
      throw new PublicError(
        "bad_request",
        "Run current lesson validation before rendering.",
        409,
      );
    const now = this.now();
    const renderId = await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const [version] = await tx
        .select()
        .from(lessonVersions)
        .where(
          and(
            eq(lessonVersions.id, command.lessonVersionId),
            eq(lessonVersions.ownerUserId, input.ownerUserId),
            eq(lessonVersions.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (!version)
        throw new PublicError(
          "not_found",
          "The requested lesson version was not found.",
          404,
        );
      const [validation] = await tx
        .select()
        .from(validationRuns)
        .where(
          and(
            eq(validationRuns.ownerUserId, input.ownerUserId),
            eq(validationRuns.projectId, input.projectId),
            eq(validationRuns.lessonSpecId, version.lessonSpecId),
            eq(validationRuns.lessonSpecRevision, version.lessonSpecRevision),
            eq(validationRuns.status, "passed"),
            ...(current === undefined
              ? []
              : [eq(validationRuns.id, current.id)]),
          ),
        )
        .orderBy(desc(validationRuns.completedAt))
        .limit(1)
        .for("update");
      if (!validation)
        throw new PublicError(
          "bad_request",
          "Run validation for this exact lesson version before rendering.",
          409,
        );
      const blocking = await tx
        .select({ id: validationIssues.id })
        .from(validationIssues)
        .where(
          and(
            eq(validationIssues.ownerUserId, input.ownerUserId),
            eq(validationIssues.projectId, input.projectId),
            eq(validationIssues.runId, validation.id),
            eq(validationIssues.severity, "error"),
          ),
        )
        .limit(1);
      if (blocking.length > 0)
        throw new PublicError(
          "bad_request",
          "Resolve blocking validation issues before rendering.",
          409,
        );
      const lesson = lessonSpecSchema.parse(
        (version.snapshot as { lessonSpec?: unknown }).lessonSpec,
      );
      const assetIds = [
        ...new Set(
          lesson.scenes.flatMap((scene) =>
            scene.assetBindings.map((binding) => binding.assetId),
          ),
        ),
      ];
      const [projectAssetRows, sourceFigureRows] = await Promise.all([
        assetIds.length === 0
          ? []
          : tx
              .select()
              .from(projectAssets)
              .where(
                and(
                  eq(projectAssets.ownerUserId, input.ownerUserId),
                  eq(projectAssets.projectId, input.projectId),
                  eq(projectAssets.status, "active"),
                  isNull(projectAssets.deletedAt),
                  inArray(projectAssets.id, assetIds),
                ),
              ),
        assetIds.length === 0
          ? []
          : tx
              .select({ figure: extractedFigures })
              .from(extractedFigures)
              .innerJoin(
                parsedDocuments,
                eq(extractedFigures.parsedDocumentId, parsedDocuments.id),
              )
              .where(
                and(
                  eq(parsedDocuments.ownerUserId, input.ownerUserId),
                  eq(parsedDocuments.projectId, input.projectId),
                  inArray(extractedFigures.id, assetIds),
                ),
              ),
      ]);
      const projectAssetById = new Map(
        projectAssetRows.map((asset) => [asset.id, asset]),
      );
      const sourceFigureById = new Map(
        sourceFigureRows.map(({ figure }) => [figure.id, figure]),
      );
      const visualAssets = assetIds.map((assetId) => {
        const catalog = approvedAssetById(assetId);
        if (catalog)
          return {
            assetId,
            altText: catalog.subject,
            source: "library" as const,
            staticLocation: catalog.staticLocation,
          };
        const asset = projectAssetById.get(assetId);
        const figure = sourceFigureById.get(assetId);
        const storageKey = asset?.storageKey ?? figure?.storageKey;
        const checksumSha256 = asset?.sha256 ?? figure?.checksumSha256;
        const contentType = asset?.mediaType ?? figure?.contentType ?? null;
        if (
          storageKey === null ||
          storageKey === undefined ||
          checksumSha256 === null ||
          checksumSha256 === undefined ||
          !isRenderableImage(contentType)
        )
          throw new PublicError(
            "bad_request",
            "Every bound lesson asset must be active and renderable.",
            409,
          );
        return {
          assetId,
          altText: asset?.originalName ?? figure?.altText ?? "Source figure",
          source: "source" as const,
          storageKey,
          checksumSha256,
          contentType,
        };
      });
      const audioRows = await tx
        .select({ stableSceneId: scenes.stableSceneId, audio: sceneAudio })
        .from(scenes)
        .innerJoin(sceneAudio, eq(sceneAudio.sceneId, scenes.id))
        .where(
          and(
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
            eq(scenes.lessonSpecId, version.lessonSpecId),
            eq(sceneAudio.ownerUserId, input.ownerUserId),
            eq(sceneAudio.projectId, input.projectId),
            eq(sceneAudio.status, "ready"),
          ),
        )
        .orderBy(desc(sceneAudio.updatedAt));
      const audioBySceneId = new Map<string, typeof sceneAudio.$inferSelect>();
      for (const row of audioRows)
        if (!audioBySceneId.has(row.stableSceneId))
          audioBySceneId.set(row.stableSceneId, row.audio);
      if (
        lesson.scenes.some((scene) => {
          const audio = audioBySceneId.get(scene.id);
          return (
            audio?.storageKey === null ||
            audio?.checksumSha256 === null ||
            audio?.contentType === null
          );
        })
      )
        throw new PublicError(
          "bad_request",
          "Current narration audio is required for every scene before rendering.",
          409,
        );
      const audio = lesson.scenes.map((scene) => {
        const row = audioBySceneId.get(scene.id)!;
        const contentType = row.contentType;
        if (contentType !== "audio/mpeg" && contentType !== "audio/wav")
          throw new PublicError(
            "bad_request",
            "A scene audio format is unsupported for rendering.",
            409,
          );
        return {
          sceneId: scene.id,
          storageKey: row.storageKey!,
          checksumSha256: row.checksumSha256!,
          contentType,
        };
      });
      const trackRows = await tx
        .select({ track: captionTracks, audioId: sceneAudio.id })
        .from(captionTracks)
        .innerJoin(sceneAudio, eq(sceneAudio.id, captionTracks.sceneAudioId))
        .where(
          and(
            eq(captionTracks.ownerUserId, input.ownerUserId),
            eq(captionTracks.projectId, input.projectId),
            eq(captionTracks.status, "ready"),
            inArray(
              sceneAudio.id,
              [...audioBySceneId.values()].map((row) => row.id),
            ),
          ),
        )
        .orderBy(desc(captionTracks.updatedAt));
      const trackByAudioId = new Map<
        string,
        typeof captionTracks.$inferSelect
      >();
      for (const row of trackRows)
        if (!trackByAudioId.has(row.audioId))
          trackByAudioId.set(row.audioId, row.track);
      if (
        audio.some(
          (entry) => !trackByAudioId.has(audioBySceneId.get(entry.sceneId)!.id),
        )
      )
        throw new PublicError(
          "bad_request",
          "Current captions are required for every scene before rendering.",
          409,
        );
      const captions = [] as Array<{
        sceneId: Identifier;
        startFrame: number;
        endFrame: number;
        text: string;
      }>;
      let sceneOffsetFrames = 0;
      for (const scene of lesson.scenes) {
        const audioRow = audioBySceneId.get(scene.id)!;
        const track = trackByAudioId.get(audioRow.id)!;
        const cues = await tx
          .select({
            startMs: captionCues.startMs,
            endMs: captionCues.endMs,
            text: captionCues.text,
          })
          .from(captionCues)
          .where(
            and(
              eq(captionCues.ownerUserId, input.ownerUserId),
              eq(captionCues.projectId, input.projectId),
              eq(captionCues.trackId, track.id),
            ),
          )
          .orderBy(asc(captionCues.position));
        if (cues.length === 0)
          throw new PublicError(
            "bad_request",
            "Current captions are required for every scene before rendering.",
            409,
          );
        captions.push(
          ...cues.map((cue) => ({
            sceneId: scene.id,
            startFrame:
              sceneOffsetFrames + Math.round((cue.startMs / 1_000) * 30),
            endFrame: sceneOffsetFrames + Math.round((cue.endMs / 1_000) * 30),
            text: cue.text,
          })),
        );
        sceneOffsetFrames += scene.durationSeconds * 30;
      }
      const manifest = {
        lessonVersionId: version.id,
        lessonVersionContentHash: version.contentHash,
        validationRunId: validation.id,
        validationInputHash: validation.inputHash,
        sceneLibraryVersion: version.sceneLibraryVersion,
        schemaVersion: 1 as const,
        audio,
        captions,
        visualAssets,
        profile: renderProfile,
        snapshot: version.snapshot,
      };
      const manifestHash = hash(manifest);
      const idempotencyKey = renderIdempotencyKey({
        projectId: input.projectId,
        lessonVersionContentHash: version.contentHash,
      });
      const [existing] = await tx
        .select({ render: renderJobs, job: jobs })
        .from(renderJobs)
        .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
        .where(
          and(
            eq(renderJobs.ownerUserId, input.ownerUserId),
            eq(renderJobs.projectId, input.projectId),
            eq(jobs.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing) return existing.render.id as Identifier;
      const activeRenders = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, input.ownerUserId),
            eq(jobs.projectId, input.projectId),
            eq(jobs.jobType, "lesson.render"),
            inArray(jobs.state, ["queued", "running"]),
          ),
        );
      if (activeRenders.length >= this.limits.maxConcurrentPerProject)
        throw new PublicError(
          "bad_request",
          "A render is already queued or running for this project.",
          429,
        );
      const recentRenders = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, input.ownerUserId),
            eq(jobs.projectId, input.projectId),
            eq(jobs.jobType, "lesson.render"),
            gte(jobs.createdAt, new Date(now.getTime() - 60 * 60 * 1_000)),
          ),
        );
      if (recentRenders.length >= this.limits.maxStartsPerProjectHour)
        throw new PublicError(
          "bad_request",
          "The project render limit has been reached. Try again later.",
          429,
        );
      const renderId = createId(now);
      const jobId = createId(now);
      const sourceVisualMedia = visualAssets.flatMap((asset) => {
        if (asset.source !== "source") return [];
        const sceneId = lesson.scenes.find((scene) =>
          scene.assetBindings.some(
            (binding) => binding.assetId === asset.assetId,
          ),
        )?.id;
        if (sceneId === undefined)
          throw new Error("A bound render asset did not resolve to a scene.");
        return [
          {
            checksumSha256: asset.checksumSha256,
            contentType: asset.contentType,
            sceneId,
            storageKey: asset.storageKey,
          },
        ];
      });
      const assetManifest = {
        schemaVersion: 1 as const,
        assets: [...audio, ...sourceVisualMedia],
      };
      const lessonSpecSha256 = hash(lesson);
      const optionsHash = hashJobOptions({
        assetManifest,
        compositionSha256: manifestHash,
        lessonSpecSha256,
        profile: renderProfile,
        rendererVersion,
      });
      const payload = {
        assetManifest,
        compositionSha256: manifestHash,
        lessonVersionId: version.id as Identifier,
        lessonSpecSha256,
        manifest,
        optionsHash,
        profile: renderProfile,
        rendererVersion,
      };
      const envelope = createJobEnvelope(renderEnvelopePayloadSchema, {
        jobId,
        jobType: "lesson.render",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion: version.contentHash,
        idempotencyKey,
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
        requestedAt: now,
      });
      await tx.insert(jobs).values({
        id: jobId,
        jobType: envelope.jobType,
        queueName: "render",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion: envelope.inputVersion,
        idempotencyKey,
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
        maxAttempts: 3,
        retryDelayMs: 30_000,
      });
      await tx.insert(renderJobs).values({
        id: renderId,
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        jobId,
        lessonVersionId: version.id,
        validationRunId: validation.id,
        manifest,
        manifestHash,
        status: "queued",
        progress: 0,
        attempt: 0,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(outboxEvents).values({
        id: createId(now),
        jobId,
        eventType: "render.requested.v1",
        queueName: "render",
        envelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 30_000 },
      });
      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "render.initiated",
        target: { type: "render_job", id: renderId },
        correlationId: input.correlationId,
        metadata: {
          lessonVersionId: version.id,
          validationRunId: validation.id,
          manifestHash,
        },
        occurredAt: now,
      });
      return renderId as Identifier;
    });
    return this.response(this.database, input, renderId);
  }

  public async list(
    input: Scope,
  ): Promise<{ renders: RenderStatusResponse[] }> {
    const rows = await this.database
      .select({ id: renderJobs.id })
      .from(renderJobs)
      .where(
        and(
          eq(renderJobs.ownerUserId, input.ownerUserId),
          eq(renderJobs.projectId, input.projectId),
        ),
      )
      .orderBy(desc(renderJobs.createdAt));
    return {
      renders: await Promise.all(
        rows.map((row) =>
          this.response(this.database, input, row.id as Identifier),
        ),
      ),
    };
  }
  public async detail(
    input: Scope & { renderId: Identifier },
  ): Promise<RenderStatusResponse> {
    return this.response(this.database, input, input.renderId);
  }
  public async retry(
    input: Scope & { renderId: Identifier; correlationId: Identifier },
  ): Promise<RenderStatusResponse> {
    const now = this.now();
    const renderId = await this.database.transaction(async (tx) => {
      const [row] = await tx
        .select({ render: renderJobs, job: jobs })
        .from(renderJobs)
        .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
        .where(
          and(
            eq(renderJobs.id, input.renderId),
            eq(renderJobs.ownerUserId, input.ownerUserId),
            eq(renderJobs.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (!row)
        throw new PublicError(
          "not_found",
          "The requested render was not found.",
          404,
        );
      if (
        row.job.state !== "failed" ||
        row.job.errorClassification !== "retryable"
      )
        throw new PublicError(
          "bad_request",
          "This render is not eligible for retry.",
          409,
        );
      await tx
        .update(jobs)
        .set({
          state: "queued",
          availableAt: now,
          completedAt: null,
          errorClassification: null,
          errorMetadata: null,
          updatedAt: now,
        })
        .where(eq(jobs.id, row.job.id));
      await tx
        .update(renderJobs)
        .set({
          status: "queued",
          progress: 0,
          errorCode: null,
          errorMessage: null,
          completedAt: null,
          updatedAt: now,
        })
        .where(eq(renderJobs.id, row.render.id));
      const envelope = {
        schemaVersion: 1,
        payloadVersion: row.job.payloadVersion,
        jobId: row.job.id,
        jobType: row.job.jobType,
        projectId: row.job.projectId,
        ownerUserId: row.job.ownerUserId,
        inputVersion: row.job.inputVersion,
        idempotencyKey: row.job.idempotencyKey,
        correlationId: input.correlationId,
        payload: row.job.payload,
        requestedAt: now.toISOString(),
      };
      await tx.insert(outboxEvents).values({
        id: createId(now),
        jobId: row.job.id,
        eventType: `render.retry.attempt-${row.job.attempts + 1}`,
        queueName: "render",
        envelope,
        deliveryOptions: {
          maxAttempts: row.job.maxAttempts,
          retryDelayMs: row.job.retryDelayMs,
        },
      });
      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "render.initiated",
        target: { type: "render_job", id: row.render.id },
        correlationId: input.correlationId,
        metadata: { action: "retry", previousAttempts: row.job.attempts },
        occurredAt: now,
      });
      return row.render.id as Identifier;
    });
    return this.response(this.database, input, renderId);
  }

  private async response(
    executor: DatabaseClient,
    scope: Scope,
    renderId: Identifier,
  ): Promise<RenderStatusResponse> {
    const [row] = await executor
      .select({
        render: renderJobs,
        job: jobs,
        video: renderedVideos,
        thumbnail: renderThumbnails,
      })
      .from(renderJobs)
      .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
      .leftJoin(renderedVideos, eq(renderedVideos.renderJobId, renderJobs.id))
      .leftJoin(
        renderThumbnails,
        eq(renderThumbnails.renderedVideoId, renderedVideos.id),
      )
      .where(
        and(
          eq(renderJobs.id, renderId),
          eq(renderJobs.ownerUserId, scope.ownerUserId),
          eq(renderJobs.projectId, scope.projectId),
        ),
      )
      .limit(1);
    if (!row)
      throw new PublicError(
        "not_found",
        "The requested render was not found.",
        404,
      );
    const errorCode =
      row.job.errorMetadata &&
      typeof row.job.errorMetadata === "object" &&
      "code" in row.job.errorMetadata &&
      typeof row.job.errorMetadata.code === "string"
        ? row.job.errorMetadata.code
        : row.render.errorCode;
    const thumbnailUrl =
      row.thumbnail === null || this.storage === undefined
        ? null
        : (
            await this.storage.createSignedDownload({
              key: storageKeySchema.parse(row.thumbnail.storageKey),
              expiresInSeconds: 300,
            })
          ).url;
    return renderStatusResponseSchema.parse({
      id: row.render.id,
      lessonVersionId: row.render.lessonVersionId,
      validationRunId: row.render.validationRunId,
      status: statusForJob(row.job.state),
      progress: row.job.progress,
      attempt: row.job.attempts,
      errorCode: safeErrorCode(errorCode),
      errorMessage: publicErrorMessage(errorCode),
      retryable:
        row.job.state === "failed" &&
        row.job.errorClassification === "retryable",
      correlationId: row.job.correlationId,
      createdAt: serializeUtcTimestamp(row.render.createdAt),
      startedAt:
        row.job.startedAt === null
          ? null
          : serializeUtcTimestamp(row.job.startedAt),
      completedAt:
        row.job.completedAt === null
          ? null
          : serializeUtcTimestamp(row.job.completedAt),
      video:
        row.video === null
          ? null
          : {
              id: row.video.id,
              durationMs: row.video.durationMs,
              sizeBytes: row.video.sizeBytes,
              width: row.video.width,
              height: row.video.height,
              fps: row.video.fps,
              videoCodec: row.video.videoCodec,
              audioCodec: row.video.audioCodec,
              storageKey: row.video.storageKey,
              thumbnailStorageKey: row.thumbnail?.storageKey ?? null,
              thumbnailUrl,
            },
    });
  }
}
