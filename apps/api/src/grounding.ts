import { createHash } from "node:crypto";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  groundingChecks,
  jobs,
  lessonSpecs,
  outboxEvents,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentGroundingCompatibility,
  groundingCheckParamsSchema,
  groundingCheckRequestSchema,
  groundingCheckResponseSchema,
  groundingCheckResultResponseSchema,
  lessonStoryboardSchema,
  modelCallJobPayloadSchema,
  type GroundingCheckResponse,
  type GroundingCheckResultResponse,
  type SourceRef,
} from "@avlp/schemas";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { SourceSnapshotService } from "./source-snapshot.js";

function canonicalHash(value: unknown): string {
  const canonical = JSON.stringify(sortCanonical(value));
  return createHash("sha256").update(canonical).digest("hex");
}

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(record)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortCanonical(nested)]),
    );
  }
  return value;
}

export interface GroundingService {
  check(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<GroundingCheckResponse>;
  current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<GroundingCheckResultResponse>;
}

type LessonSpecRow = typeof lessonSpecs.$inferSelect;
type JobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

/**
 * Triggers a grounding recheck after teacher edits and reads the latest
 * grounding result. The check runs as a background `grounding.check` job so
 * model-assisted entailment classification is metered, idempotent, and
 * tenant-scoped.
 */
export class PostgresGroundingService implements GroundingService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly sourceApprovalStatus: SourceSnapshotService["status"],
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async check(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<GroundingCheckResponse> {
    const parsed = parseBoundary(input.body);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to run a grounding check.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (!approval.approved || approval.stale || approval.snapshotId === null)
      throw groundingSourceNotConfirmed();
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.lessonSpecId,
        parsed.lessonSpecRevision,
      );
      const storyboard = lessonStoryboardSchema.parse(lessonSpec.payload);
      const targetScenes =
        parsed.scope === "scene"
          ? storyboard.scenes.filter(
              (scene) => scene.stableSceneId === parsed.sceneId,
            )
          : storyboard.scenes;
      if (parsed.scope === "scene" && targetScenes.length === 0)
        throw sceneNotFound();
      const blockIds = [
        ...new Set(
          targetScenes.flatMap((scene) =>
            (scene.scene.sourceRefs as SourceRef[]).flatMap((ref) =>
              ref.blockIds,
            ),
          ),
        ),
      ];
      const params = groundingCheckParamsSchema.parse({
        lessonSpecId: lessonSpec.id,
        lessonSpecRevision: lessonSpec.revision,
        lessonSpecContentHash: lessonSpec.contentHash,
        sourceSnapshotId: approval.snapshotId,
        sourceSnapshotContentHash: approval.contentHash,
        scope: parsed.scope,
        ...(parsed.sceneId === undefined ? {} : { sceneId: parsed.sceneId }),
      });
      const cached = await this.cachedGroundingCheck(
        transaction,
        input.ownerUserId,
        input.projectId,
        params,
      );
      if (cached !== undefined)
        return groundingCheckResponseSchema.parse({
          jobId: cached.id,
          status: "queued",
          cached: true,
        });
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 1,
        operationType: "ai.grounding",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentGroundingCompatibility.promptId,
        promptVersion: currentGroundingCompatibility.promptVersion,
        model: currentGroundingCompatibility.model,
        ...(blockIds.length === 0 ? {} : { narrowing: { blockIds } }),
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "grounding",
        approval.snapshotId,
        approval.contentHash ?? "none",
        currentGroundingCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "grounding.check",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "grounding.check",
          projectId: input.projectId,
          inputVersion,
          options: { requestKey: idempotencyKey },
        }),
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
        requestedAt: timestamp,
      });
      const [created] = await transaction
        .insert(jobs)
        .values({
          id: envelope.jobId,
          jobType: envelope.jobType,
          queueName: "pipeline",
          projectId: envelope.projectId,
          ownerUserId: envelope.ownerUserId,
          inputVersion: envelope.inputVersion,
          idempotencyKey: envelope.idempotencyKey,
          correlationId: envelope.correlationId,
          payloadVersion: envelope.payloadVersion,
          payload: envelope.payload,
        })
        .onConflictDoNothing()
        .returning({ id: jobs.id });
      const jobId =
        created?.id ??
        (
          await transaction
            .select({ id: jobs.id })
            .from(jobs)
            .where(
              and(
                eq(jobs.ownerUserId, input.ownerUserId),
                eq(jobs.projectId, input.projectId),
                eq(jobs.idempotencyKey, envelope.idempotencyKey),
              ),
            )
            .limit(1)
        )[0]?.id;
      if (jobId === undefined)
        throw new Error("The idempotent grounding check job could not be read.");
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "grounding.check_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "grounding_check", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            lessonSpecId: params.lessonSpecId,
            lessonSpecRevision: params.lessonSpecRevision,
            scope: params.scope,
            sceneId: params.sceneId,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return groundingCheckResponseSchema.parse({
        jobId,
        status: "queued",
        cached: false,
      });
    });
  }

  public async current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<GroundingCheckResultResponse> {
    const [latestCheck, latestJob] = await Promise.all([
      this.latestGroundingCheck(input.ownerUserId, input.projectId),
      this.latestGroundingJob(input.ownerUserId, input.projectId),
    ]);
    return groundingCheckResultResponseSchema.parse({
      check:
        latestCheck === undefined
          ? null
          : {
              schemaVersion: "grounding-check-v1",
              id: latestCheck.id,
              projectId: latestCheck.projectId,
              lessonSpecId: latestCheck.lessonSpecId,
              lessonSpecRevision: latestCheck.lessonSpecRevision,
              lessonSpecContentHash: latestCheck.lessonSpecContentHash,
              sourceSnapshotId: latestCheck.sourceSnapshotId,
              sourceSnapshotContentHash: latestCheck.sourceSnapshotContentHash,
              claims: latestCheck.claims as never,
              results: latestCheck.results as never,
              summary: latestCheck.summary as never,
              modelCalls: latestCheck.modelCallIds as string[],
              createdAt: serializeUtcTimestamp(latestCheck.createdAt),
            },
      latestJob:
        latestJob === undefined
          ? null
          : {
              id: latestJob.id,
              state: latestJob.state,
              errorCode: jobErrorCode(latestJob.errorMetadata),
              updatedAt: serializeUtcTimestamp(latestJob.updatedAt),
            },
    });
  }

  private async mutableLessonSpecRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    lessonSpecId: Identifier,
    expectedRevision: number,
  ): Promise<LessonSpecRow> {
    const [row] = await executor
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.id, lessonSpecId),
          eq(lessonSpecs.ownerUserId, ownerUserId),
          eq(lessonSpecs.projectId, projectId),
        ),
      )
      .limit(1);
    if (row === undefined) throw lessonSpecNotFound();
    if (row.revision !== expectedRevision) throw groundingConflict();
    return row;
  }

  private async latestGroundingCheck(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof groundingChecks.$inferSelect | undefined> {
    const [row] = await this.database
      .select()
      .from(groundingChecks)
      .where(
        and(
          eq(groundingChecks.ownerUserId, ownerUserId),
          eq(groundingChecks.projectId, projectId),
        ),
      )
      .orderBy(desc(groundingChecks.createdAt))
      .limit(1);
    return row;
  }

  /**
   * Content-hash cache: returns an existing completed grounding check for the
   * exact same lesson revision, content hash, source snapshot, and scope so an
   * identical recheck does not pay for another model call. Rows are only
   * inserted on completion, so any match is a finished check.
   */
  private async cachedGroundingCheck(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    params: ReturnType<typeof groundingCheckParamsSchema.parse>,
  ): Promise<typeof groundingChecks.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(groundingChecks)
      .where(
        and(
          eq(groundingChecks.ownerUserId, ownerUserId),
          eq(groundingChecks.projectId, projectId),
          eq(groundingChecks.lessonSpecId, params.lessonSpecId),
          eq(groundingChecks.lessonSpecRevision, params.lessonSpecRevision),
          eq(
            groundingChecks.lessonSpecContentHash,
            params.lessonSpecContentHash,
          ),
          eq(groundingChecks.sourceSnapshotId, params.sourceSnapshotId),
          eq(
            groundingChecks.sourceSnapshotContentHash,
            params.sourceSnapshotContentHash,
          ),
          eq(groundingChecks.scope, params.scope),
          params.sceneId === undefined
            ? isNull(groundingChecks.sceneId)
            : eq(groundingChecks.sceneId, params.sceneId),
        ),
      )
      .orderBy(desc(groundingChecks.createdAt))
      .limit(1);
    return row;
  }

  private async latestGroundingJob(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<
    | {
        id: Identifier;
        state: JobState;
        errorMetadata: unknown;
        updatedAt: Date;
      }
    | undefined
  > {
    const [job] = await this.database
      .select({
        id: jobs.id,
        state: jobs.state,
        errorMetadata: jobs.errorMetadata,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerUserId, ownerUserId),
          eq(jobs.projectId, projectId),
          eq(jobs.jobType, "grounding.check"),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (job === undefined) return undefined;
    return {
      id: job.id as Identifier,
      state: job.state as JobState,
      errorMetadata: job.errorMetadata,
      updatedAt: job.updatedAt,
    };
  }
}

function parseBoundary(input: unknown): ReturnType<typeof groundingCheckRequestSchema.parse> {
  const parsed = groundingCheckRequestSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fieldErrors = Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
  throw new PublicError(
    "validation_failed",
    "The request body is invalid.",
    400,
    false,
    fieldErrors,
  );
}

function jobErrorCode(errorMetadata: unknown): string | null {
  if (
    errorMetadata !== null &&
    typeof errorMetadata === "object" &&
    "code" in errorMetadata &&
    typeof errorMetadata.code === "string"
  )
    return errorMetadata.code;
  return null;
}

function groundingSourceNotConfirmed(): PublicError {
  return new PublicError(
    "bad_request",
    "Confirm the reviewed source before checking grounding.",
    409,
  );
}

function lessonSpecNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested lesson spec was not found.",
    404,
  );
}

function sceneNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested scene was not found.",
    404,
  );
}

function groundingConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The lesson spec changed. Please refresh and try again.",
    409,
  );
}
