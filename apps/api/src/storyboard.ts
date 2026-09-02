import { createHash } from "node:crypto";
import {
  computeLessonStoryboardContentHash,
  computeLessonStoryboardSceneContentHash,
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  captionCues,
  captionTracks,
  extractedFigures,
  figureInclusionOverlays,
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  parsedDocuments,
  projectAssets,
  illustrationGenerationCandidates,
  sceneCandidates,
  sceneAudio,
  scenes,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  createDefaultStoryboardSceneSpec,
  currentSceneRegenerationCompatibility,
  currentStoryboardGenerationCompatibility,
  migrateStoryboardSceneTemplate,
  sceneEditInvalidation,
  sceneEditorMetadata,
  sceneAssetSlotRequirement,
  requiredSceneAssetSlots,
  isCatalogAssetCompatibleWithSlot,
  lessonStoryboardSceneSchema,
  lessonStoryboardSchema,
  modelCallJobPayloadSchema,
  sceneCandidateDecisionInputSchema,
  illustrationCandidateDecisionInputSchema,
  sceneCandidateSchema,
  sceneRegenerationInputSchema,
  sceneRegenerationMaximumActiveCandidates,
  sceneRegenerationParamsSchema,
  sceneRegenerationResponseSchema,
  storyboardDurationToleranceSeconds,
  storyboardGenerationParamsSchema,
  storyboardGenerationResponseSchema,
  storyboardResponseSchema,
  storyboardSceneCreateInputSchema,
  storyboardSceneDefaultDurationSeconds,
  storyboardSceneDeleteInputSchema,
  storyboardSceneDetailResponseSchema,
  storyboardSceneEditResponseSchema,
  storyboardSceneDuplicateInputSchema,
  storyboardSceneListResponseSchema,
  storyboardSceneReorderInputSchema,
  storyboardSceneTemplateSwitchInputSchema,
  storyboardSceneUpdateInputSchema,
  storyboardSceneAssetBindingInputSchema,
  storyboardSceneAssetUnbindingInputSchema,
  type LessonStoryboard,
  type LessonStoryboardScene,
  type NarrationBudgetStatus,
  type SceneCandidate,
  type SceneRegenerationResponse,
  type SourceApprovalStatus,
  type SourceRef,
  type StoryboardGenerationParams,
  type StoryboardGenerationResponse,
  type StoryboardResponse,
  type StoryboardSceneDetailResponse,
  type StoryboardSceneEditResponse,
  type StoryboardSceneAudioStatus,
  type StoryboardSceneCaptionStatus,
  type StoryboardSceneListResponse,
  type StoryboardSceneStatus,
  type StoryboardValidation,
} from "@avlp/schemas";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { SourceSnapshotService } from "./source-snapshot.js";
import { approvedAssetById } from "./approved-assets.js";

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

export interface StoryboardService {
  generate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<StoryboardGenerationResponse>;
  current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<StoryboardResponse>;
  regenerateScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<SceneRegenerationResponse>;
  applySceneCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardResponse>;
  rejectSceneCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardResponse>;
  scenes(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<StoryboardSceneListResponse>;
  sceneDetail(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<StoryboardSceneDetailResponse>;
  addScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse>;
  duplicateScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse>;
  deleteScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse>;
  reorderScenes(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse>;
  updateScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse>;
  switchSceneTemplate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse>;
  bindCatalogAsset(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    slot: string;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse>;
  unbindCatalogAsset(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    slot: string;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse>;
  acceptIllustrationCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse>;
}

type LessonSpecRow = typeof lessonSpecs.$inferSelect;
type NarrationSetRow = typeof narrationSets.$inferSelect;
type GenerationJobState =
  "queued" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";

export class PostgresStoryboardService implements StoryboardService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly sourceApprovalStatus: SourceSnapshotService["status"],
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async generate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<StoryboardGenerationResponse> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to generate a storyboard.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (!approval.approved || approval.stale || approval.snapshotId === null)
      throw storyboardSourceNotConfirmed();
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const configuration = await this.loadConfiguration(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (configuration === undefined) throw storyboardConfigurationMissing();
      const narrationSet = await this.workingNarrationSetRow(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (narrationSet === undefined) throw storyboardNarrationMissing();
      if (narrationSet.sourceSnapshotId !== approval.snapshotId)
        throw storyboardSourceSnapshotMismatch();
      const blockIds = await this.narrationSourceBlockIds(
        transaction,
        input.ownerUserId,
        input.projectId,
        narrationSet.id,
      );
      const params = storyboardGenerationParamsSchema.parse({
        configurationVersion: configuration.version,
        lessonTitle: configuration.lessonTitle,
        subject: configuration.subject,
        ageBand: configuration.ageBand,
        difficulty: configuration.difficulty,
        tone: configuration.tone,
        targetDurationSeconds: configuration.targetDurationSeconds,
        includeRecallQuestions: configuration.includeRecallQuestions,
        narrationSetId: narrationSet.id,
        narrationSetRevision: narrationSet.revision,
      });
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 1,
        operationType: "ai.storyboard",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentStoryboardGenerationCompatibility.promptId,
        promptVersion: currentStoryboardGenerationCompatibility.promptVersion,
        model: currentStoryboardGenerationCompatibility.model,
        ...(blockIds.length === 0 ? {} : { narrowing: { blockIds } }),
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "storyboard",
        approval.snapshotId,
        approval.contentHash ?? "none",
        currentStoryboardGenerationCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "storyboard.generate",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "storyboard.generate",
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
        throw new Error("The idempotent storyboard job could not be read.");
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "storyboard.generate_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "storyboard_generation", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            configurationVersion: params.configurationVersion,
            narrationSetId: params.narrationSetId,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return storyboardGenerationResponseSchema.parse({
        jobId,
        status: "queued",
      });
    });
  }

  public async current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<StoryboardResponse> {
    const [
      workingRow,
      approvedRow,
      latestJob,
      configuration,
      approval,
      approvedOutline,
    ] = await Promise.all([
      this.workingLessonSpecRow(input.ownerUserId, input.projectId),
      this.approvedLessonSpecRow(input.ownerUserId, input.projectId),
      this.latestGenerationJob(input.ownerUserId, input.projectId),
      this.loadConfiguration(this.database, input.ownerUserId, input.projectId),
      this.sourceApprovalStatus({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
      }),
      this.latestApprovedOutlineSetRow(
        this.database,
        input.ownerUserId,
        input.projectId,
      ),
    ]);
    const storyboard =
      workingRow === undefined ? null : parseStoryboard(workingRow);
    const approved =
      approvedRow === undefined ? null : parseStoryboard(approvedRow);
    const approvedOutlineItems =
      approvedOutline === undefined
        ? []
        : await this.loadOutlineItems(
            this.database,
            approvedOutline.id,
            input.ownerUserId,
            input.projectId,
          );
    const narrationBlocksFor =
      storyboard === null
        ? []
        : await this.loadNarrationSetBlocks(
            this.database,
            input.ownerUserId,
            input.projectId,
            storyboard.basedOnNarrationSetId,
          );
    const narrationSetContentHash =
      storyboard === null
        ? undefined
        : await this.recomputeNarrationSetContentHash(
            this.database,
            input.ownerUserId,
            input.projectId,
            storyboard.basedOnNarrationSetId,
          );
    const sceneCandidates =
      workingRow === undefined
        ? []
        : await this.sceneCandidatesForLessonSpec(
            this.database,
            input.ownerUserId,
            input.projectId,
            workingRow.id,
          );
    const latestSceneRegenerationJob = await this.latestSceneRegenerationJobRow(
      input.ownerUserId,
      input.projectId,
    );
    const generating =
      latestJob !== undefined &&
      (latestJob.state === "queued" ||
        latestJob.state === "running" ||
        latestJob.state === "retry_wait");
    const state: StoryboardResponse["state"] = generating
      ? "generating"
      : storyboard === null
        ? latestJob?.state === "failed"
          ? "failed"
          : "idle"
        : storyboard.status === "draft"
          ? "draft"
          : "approved";
    const stale = this.computeStaleness({
      storyboard,
      configuration,
      approval,
      approvedOutline,
      approvedOutlineItems,
      narrationSetContentHash,
    });
    const validation = this.computeValidation({
      storyboard,
      approvedOutlineItemIds: approvedOutlineItems.map((item) => item.id),
      narrationBlocksFor,
    });
    return storyboardResponseSchema.parse({
      state,
      storyboard,
      approved,
      latestJob:
        latestJob === undefined
          ? null
          : {
              id: latestJob.id,
              state: latestJob.state,
              errorCode: jobErrorCode(latestJob.errorMetadata),
              updatedAt: serializeUtcTimestamp(latestJob.updatedAt),
            },
      latestSceneRegenerationJob:
        latestSceneRegenerationJob === undefined
          ? null
          : {
              id: latestSceneRegenerationJob.id,
              state: latestSceneRegenerationJob.state,
              errorCode: jobErrorCode(latestSceneRegenerationJob.errorMetadata),
              updatedAt: serializeUtcTimestamp(
                latestSceneRegenerationJob.updatedAt,
              ),
            },
      sceneCandidates,
      canGenerate:
        configuration !== undefined &&
        approval.approved &&
        !approval.stale &&
        approvedOutline !== undefined &&
        !generating,
      canApprove: false,
      canEdit: false,
      stale: stale.stale,
      staleReason: stale.staleReason,
      validation,
    });
  }

  public async regenerateScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<SceneRegenerationResponse> {
    const parsed = parseBoundary(sceneRegenerationInputSchema, input.body);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to regenerate a scene.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const currentScene = storyboard.scenes.find(
        (scene) => scene.stableSceneId === input.sceneId,
      );
      if (currentScene === undefined) throw sceneNotFound();
      const sceneRow = await this.sceneRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        input.sceneId,
      );
      if (sceneRow === undefined) throw sceneNotFound();
      const pending = await this.pendingSceneCandidateCount(
        transaction,
        input.ownerUserId,
        input.projectId,
        sceneRow.id,
      );
      if (pending >= sceneRegenerationMaximumActiveCandidates)
        throw new PublicError(
          "bad_request",
          `This scene already has ${pending} pending regenerations. Apply or reject them first.`,
          409,
        );
      const narrationSet = await this.workingNarrationSetRow(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (narrationSet === undefined) throw sceneNarrationMissing();
      if (narrationSet.id !== storyboard.basedOnNarrationSetId)
        throw sceneSourceSnapshotMismatch();
      const configuration = await this.loadConfiguration(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (configuration === undefined) throw sceneConfigurationMissing();
      const blockIds = currentScene.scene.sourceRefs.flatMap(
        (ref) => ref.blockIds,
      );
      const params = sceneRegenerationParamsSchema.parse({
        lessonSpecId: lessonSpec.id,
        lessonSpecRevision: lessonSpec.revision,
        sceneId: input.sceneId,
        sceneRevision: sceneRow.revision,
        mode: parsed.mode,
        instruction: parsed.instruction ?? null,
        configurationVersion: configuration.version,
        lessonTitle: configuration.lessonTitle,
        subject: configuration.subject,
        ageBand: configuration.ageBand,
        difficulty: configuration.difficulty,
        tone: configuration.tone,
        targetDurationSeconds: configuration.targetDurationSeconds,
        includeRecallQuestions: configuration.includeRecallQuestions,
      });
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 1,
        operationType: "ai.scene_regeneration",
        sourceSnapshotId: narrationSet.sourceSnapshotId,
        promptId: currentSceneRegenerationCompatibility.promptId,
        promptVersion: currentSceneRegenerationCompatibility.promptVersion,
        model: currentSceneRegenerationCompatibility.model,
        ...(blockIds.length === 0 ? {} : { narrowing: { blockIds } }),
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "scene-regenerate",
        narrationSet.sourceSnapshotId,
        narrationSet.sourceSnapshotContentHash,
        currentSceneRegenerationCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "storyboard.scene-regenerate",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "storyboard.scene-regenerate",
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
        throw new Error(
          "The idempotent scene regeneration job could not be read.",
        );
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "storyboard.scene_regenerate_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "storyboard_scene_regeneration", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            mode: params.mode,
            lessonSpecId: params.lessonSpecId,
            sceneId: params.sceneId,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return sceneRegenerationResponseSchema.parse({
        jobId,
        status: "queued",
      });
    });
  }

  public async applySceneCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardResponse> {
    const parsed = parseBoundary(sceneCandidateDecisionInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const currentScene = storyboard.scenes.find(
        (scene) => scene.stableSceneId === input.sceneId,
      );
      if (currentScene === undefined) throw sceneNotFound();
      const sceneRow = await this.sceneRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        input.sceneId,
      );
      if (sceneRow === undefined) throw sceneNotFound();
      if (sceneRow.revision !== parsed.expectedSceneRevision)
        throw sceneConflict();
      const candidate = await this.loadSceneCandidate(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        sceneRow.id,
        input.candidateId,
      );
      if (candidate === undefined) throw sceneCandidateNotFound();
      if (candidate.status !== "pending") throw sceneCandidateNotPending();
      if (candidate.sceneRevision !== sceneRow.revision) throw sceneConflict();
      const afterScene = lessonStoryboardSceneSchema.parse(
        candidate.afterScene,
      );
      const replacement = lessonStoryboardSceneSchema.parse({
        ...afterScene,
        id: currentScene.id,
        stableSceneId: currentScene.stableSceneId,
        order: currentScene.order,
      });
      const scenesUpdated = storyboard.scenes.map((scene) =>
        scene.stableSceneId === replacement.stableSceneId ? replacement : scene,
      );
      const totalDurationSeconds = scenesUpdated.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      );
      const updatedStoryboard = lessonStoryboardSchema.parse({
        ...storyboard,
        revision: storyboard.revision + 1,
        totalDurationSeconds,
        contentHash: computeLessonStoryboardContentHash({
          totalDurationSeconds,
          objectiveIds: storyboard.objectiveIds,
          scenes: scenesUpdated.map((scene) => ({
            contentHash: computeLessonStoryboardSceneContentHash({
              template: scene.scene.template,
              title: scene.scene.title,
              narration: scene.scene.narration,
              durationSeconds: scene.scene.durationSeconds,
              onScreenText: scene.scene.onScreenText,
              transition: scene.scene.transition,
              visual: scene.scene.visual,
              sourceRefs: scene.scene.sourceRefs,
              generatedAdditions: scene.scene.generatedAdditions,
              assetBindings: scene.scene.assetBindings,
            }),
            narrationBlockIds: scene.narrationBlockIds,
            assetRequirements: scene.assetRequirements,
          })),
        }),
        scenes: scenesUpdated,
      });
      const [updated] = await transaction
        .update(lessonSpecs)
        .set({
          revision: lessonSpec.revision + 1,
          totalDurationSeconds,
          contentHash: updatedStoryboard.contentHash,
          payload: updatedStoryboard,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(lessonSpecs.id, lessonSpec.id),
            eq(lessonSpecs.ownerUserId, input.ownerUserId),
            eq(lessonSpecs.projectId, input.projectId),
            eq(lessonSpecs.revision, lessonSpec.revision),
          ),
        )
        .returning({ id: lessonSpecs.id });
      if (updated === undefined) throw sceneConflict();
      await transaction
        .update(scenes)
        .set({
          template: replacement.template,
          durationSeconds: replacement.durationSeconds,
          narrationBlockIds: replacement.narrationBlockIds,
          assetRequirements: replacement.assetRequirements,
          sceneJson: replacement.scene,
          revision: sceneRow.revision + 1,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(scenes.id, sceneRow.id),
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
            eq(scenes.revision, sceneRow.revision),
          ),
        );
      await transaction
        .update(sceneCandidates)
        .set({ status: "accepted", updatedAt: timestamp })
        .where(
          and(
            eq(sceneCandidates.id, candidate.id),
            eq(sceneCandidates.ownerUserId, input.ownerUserId),
            eq(sceneCandidates.projectId, input.projectId),
            eq(sceneCandidates.status, "pending"),
          ),
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.scene_candidate_accepted",
        target: { type: "storyboard_scene_candidate", id: candidate.id },
        correlationId: input.correlationId,
        metadata: {
          sceneId: input.sceneId,
          mode: candidate.mode,
          lessonSpecRevision: parsed.expectedRevision + 1,
          sceneRevision: sceneRow.revision + 1,
          modelCallId: candidate.modelCallId,
          invalidatedScope: [
            "preview",
            "assets",
            "audio",
            "validation",
            "render",
          ],
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async rejectSceneCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardResponse> {
    const parsed = parseBoundary(sceneCandidateDecisionInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const sceneRow = await this.sceneRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        input.sceneId,
      );
      if (sceneRow === undefined) throw sceneNotFound();
      if (sceneRow.revision !== parsed.expectedSceneRevision)
        throw sceneConflict();
      const candidate = await this.loadSceneCandidate(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        sceneRow.id,
        input.candidateId,
      );
      if (candidate === undefined) throw sceneCandidateNotFound();
      if (candidate.status !== "pending") throw sceneCandidateNotPending();
      const [updated] = await transaction
        .update(sceneCandidates)
        .set({ status: "rejected", updatedAt: timestamp })
        .where(
          and(
            eq(sceneCandidates.id, candidate.id),
            eq(sceneCandidates.ownerUserId, input.ownerUserId),
            eq(sceneCandidates.projectId, input.projectId),
            eq(sceneCandidates.status, "pending"),
          ),
        )
        .returning({ id: sceneCandidates.id });
      if (updated === undefined) throw sceneConflict();
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.scene_candidate_rejected",
        target: { type: "storyboard_scene_candidate", id: candidate.id },
        correlationId: input.correlationId,
        metadata: {
          sceneId: input.sceneId,
          mode: candidate.mode,
          lessonSpecRevision: parsed.expectedRevision,
          sceneRevision: parsed.expectedSceneRevision,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async scenes(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<StoryboardSceneListResponse> {
    const workingRow = await this.workingLessonSpecRow(
      input.ownerUserId,
      input.projectId,
    );
    if (workingRow === undefined)
      throw new PublicError(
        "not_found",
        "Generate a storyboard before opening the scene list.",
        404,
      );
    const storyboard = parseStoryboard(workingRow);
    const configuration = await this.loadConfiguration(
      this.database,
      input.ownerUserId,
      input.projectId,
    );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    const approvedOutline = await this.latestApprovedOutlineSetRow(
      this.database,
      input.ownerUserId,
      input.projectId,
    );
    const approvedOutlineItems =
      approvedOutline === undefined
        ? []
        : await this.loadOutlineItems(
            this.database,
            approvedOutline.id,
            input.ownerUserId,
            input.projectId,
          );
    const narrationSetContentHash = await this.recomputeNarrationSetContentHash(
      this.database,
      input.ownerUserId,
      input.projectId,
      storyboard.basedOnNarrationSetId,
    );
    const stale = this.computeStaleness({
      storyboard,
      configuration,
      approval,
      approvedOutline,
      approvedOutlineItems,
      narrationSetContentHash,
    });
    const validation = this.computeValidation({
      storyboard,
      approvedOutlineItemIds: approvedOutlineItems.map((item) => item.id),
      narrationBlocksFor: await this.loadNarrationSetBlocks(
        this.database,
        input.ownerUserId,
        input.projectId,
        storyboard.basedOnNarrationSetId,
      ),
    });
    const mediaBySceneId = await projectSceneMediaStatuses(
      this.database,
      input.ownerUserId,
      input.projectId,
      workingRow.id,
    );
    return storyboardSceneListResponseSchema.parse({
      revision: storyboard.revision,
      stale: stale.stale,
      staleReason: stale.staleReason,
      totalDurationSeconds: storyboard.totalDurationSeconds,
      targetDurationSeconds: storyboard.targetDurationSeconds,
      scenes: storyboard.scenes.map((scene) =>
        projectSceneListEntry(
          scene,
          stale.stale,
          validation,
          mediaBySceneId.get(scene.stableSceneId),
        ),
      ),
    });
  }

  public async sceneDetail(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<StoryboardSceneDetailResponse> {
    const workingRow = await this.workingLessonSpecRow(
      input.ownerUserId,
      input.projectId,
    );
    if (workingRow === undefined) throw sceneNotFound();
    const storyboard = parseStoryboard(workingRow);
    const currentScene = storyboard.scenes.find(
      (scene) => scene.stableSceneId === input.sceneId,
    );
    if (currentScene === undefined) throw sceneNotFound();
    const configuration = await this.loadConfiguration(
      this.database,
      input.ownerUserId,
      input.projectId,
    );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    const approvedOutline = await this.latestApprovedOutlineSetRow(
      this.database,
      input.ownerUserId,
      input.projectId,
    );
    const approvedOutlineItems =
      approvedOutline === undefined
        ? []
        : await this.loadOutlineItems(
            this.database,
            approvedOutline.id,
            input.ownerUserId,
            input.projectId,
          );
    const narrationSetContentHash = await this.recomputeNarrationSetContentHash(
      this.database,
      input.ownerUserId,
      input.projectId,
      storyboard.basedOnNarrationSetId,
    );
    const stale = this.computeStaleness({
      storyboard,
      configuration,
      approval,
      approvedOutline,
      approvedOutlineItems,
      narrationSetContentHash,
    });
    const validation = this.computeValidation({
      storyboard,
      approvedOutlineItemIds: approvedOutlineItems.map((item) => item.id),
      narrationBlocksFor: await this.loadNarrationSetBlocks(
        this.database,
        input.ownerUserId,
        input.projectId,
        storyboard.basedOnNarrationSetId,
      ),
    });
    const sceneRow = await this.sceneRow(
      this.database,
      input.ownerUserId,
      input.projectId,
      workingRow.id,
      input.sceneId,
    );
    if (sceneRow === undefined) throw sceneNotFound();
    const media = (
      await projectSceneMediaStatuses(
        this.database,
        input.ownerUserId,
        input.projectId,
        workingRow.id,
      )
    ).get(currentScene.stableSceneId);
    return storyboardSceneDetailResponseSchema.parse({
      scene: currentScene,
      sceneRevision: sceneRow.revision,
      status: projectSceneStatus(
        stale.stale,
        validation,
        projectSceneAssetStatus(currentScene),
        media,
      ),
    });
  }

  public async updateScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse> {
    const parsed = parseBoundary(storyboardSceneUpdateInputSchema, input.body);
    const timestamp = this.now();
    let result: StoryboardSceneEditResponse | undefined;
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const index = storyboard.scenes.findIndex(
        (scene) => scene.stableSceneId === input.sceneId,
      );
      if (index < 0) throw sceneNotFound();
      const current = storyboard.scenes[index]!;
      if (
        parsed.scene.id !== current.scene.id ||
        parsed.scene.order !== current.scene.order ||
        parsed.scene.template !== current.scene.template ||
        JSON.stringify(parsed.scene.sourceRefs) !==
          JSON.stringify(current.scene.sourceRefs) ||
        JSON.stringify(parsed.scene.generatedAdditions) !==
          JSON.stringify(current.scene.generatedAdditions)
      )
        throw immutableSceneFields();
      if (
        parsed.scene.assetBindings.some(
          (binding) =>
            binding.slot !== undefined &&
            !sceneEditorMetadata(parsed.scene.template).assetSlots.includes(
              binding.slot,
            ),
        )
      )
        throw incompatibleSceneAssetSlot();
      if (
        JSON.stringify(parsed.scene.assetBindings) !==
        JSON.stringify(current.scene.assetBindings)
      )
        await this.assertAuthorizedAssetBindings(
          transaction,
          input.ownerUserId,
          input.projectId,
          parsed.scene,
        );
      const edited = lessonStoryboardSceneSchema.parse({
        ...current,
        template: parsed.scene.template,
        durationSeconds: parsed.scene.durationSeconds,
        scene: parsed.scene,
      });
      const nextScenes = [...storyboard.scenes];
      nextScenes[index] = edited;
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      const impact = sceneEditInvalidation(current.scene, edited.scene);
      if (impact.invalidated.includes("captions")) {
        await transaction
          .update(sceneAudio)
          .set({ status: "stale", updatedAt: timestamp })
          .where(
            and(
              eq(sceneAudio.ownerUserId, input.ownerUserId),
              eq(sceneAudio.projectId, input.projectId),
              eq(sceneAudio.sceneId, current.id),
            ),
          );
        await transaction
          .update(captionTracks)
          .set({ status: "stale", updatedAt: timestamp })
          .where(
            and(
              eq(captionTracks.ownerUserId, input.ownerUserId),
              eq(captionTracks.projectId, input.projectId),
              inArray(
                captionTracks.sceneAudioId,
                transaction
                  .select({ id: sceneAudio.id })
                  .from(sceneAudio)
                  .where(
                    and(
                      eq(sceneAudio.ownerUserId, input.ownerUserId),
                      eq(sceneAudio.projectId, input.projectId),
                      eq(sceneAudio.sceneId, current.id),
                    ),
                  ),
              ),
            ),
          );
      }
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.edited",
        target: { type: "storyboard_scene", id: input.sceneId },
        correlationId: input.correlationId,
        metadata: {
          operation: "update",
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: impact.invalidated,
        },
        occurredAt: timestamp,
      });
      result = storyboardSceneEditResponseSchema.parse({
        revision: updatedStoryboard.revision,
        scene: edited,
        invalidated: impact.invalidated,
        warning: impact.warning,
        requiresConfirmation: false,
        resetFields: [],
      });
    });
    if (result === undefined) throw sceneConflict();
    return result;
  }

  public async bindCatalogAsset(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    slot: string;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse> {
    const parsed = parseBoundary(
      storyboardSceneAssetBindingInputSchema,
      input.body,
    );
    const detail = await this.sceneDetail(input);
    const requirement = sceneAssetSlotRequirement(
      detail.scene.scene.template,
      input.slot,
    );
    const asset = approvedAssetById(parsed.assetId);
    if (
      requirement === undefined ||
      (asset !== undefined &&
        !isCatalogAssetCompatibleWithSlot(asset, requirement))
    )
      throw incompatibleCatalogAsset();
    const assetBindings = detail.scene.scene.assetBindings.filter(
      (binding) => binding.slot !== input.slot,
    );
    assetBindings.push({
      assetId: parsed.assetId,
      role: requirement.bindingRole,
      slot: input.slot,
      ...(parsed.altText === undefined ? {} : { altText: parsed.altText }),
    });
    return this.updateScene({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      sceneId: input.sceneId,
      body: {
        expectedRevision: parsed.expectedRevision,
        scene: { ...detail.scene.scene, assetBindings },
      },
      correlationId: input.correlationId,
    });
  }

  public async acceptIllustrationCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse> {
    const parsed = parseBoundary(
      illustrationCandidateDecisionInputSchema,
      input.body,
    );
    const timestamp = this.now();
    let result: StoryboardSceneEditResponse | undefined;
    await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select()
        .from(illustrationGenerationCandidates)
        .where(
          and(
            eq(illustrationGenerationCandidates.id, input.candidateId),
            eq(illustrationGenerationCandidates.ownerUserId, input.ownerUserId),
            eq(illustrationGenerationCandidates.projectId, input.projectId),
            eq(illustrationGenerationCandidates.status, "pending_review"),
            eq(illustrationGenerationCandidates.moderationStatus, "approved"),
          ),
        )
        .limit(1)
        .for("update");
      if (candidate === undefined || candidate.assetId === null)
        throw sceneNotFound();
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedStoryboardRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const sceneRow = await transaction
        .select({
          id: scenes.id,
          stableSceneId: scenes.stableSceneId,
          revision: scenes.revision,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.id, candidate.sceneId),
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
            eq(scenes.lessonSpecId, lessonSpec.id),
          ),
        )
        .limit(1)
        .for("update");
      const scene = sceneRow[0];
      if (scene === undefined) throw sceneNotFound();
      if (scene.revision !== parsed.expectedSceneRevision)
        throw sceneConflict();
      const index = storyboard.scenes.findIndex(
        (item) => item.stableSceneId === scene.stableSceneId,
      );
      if (index < 0) throw sceneNotFound();
      const current = storyboard.scenes[index]!;
      const requirement = sceneAssetSlotRequirement(
        current.scene.template,
        candidate.slot,
      );
      if (requirement === undefined) throw incompatibleSceneAssetSlot();
      const [asset] = await transaction
        .update(projectAssets)
        .set({ status: "active", updatedAt: timestamp })
        .where(
          and(
            eq(projectAssets.id, candidate.assetId),
            eq(projectAssets.ownerUserId, input.ownerUserId),
            eq(projectAssets.projectId, input.projectId),
            eq(projectAssets.status, "pending_review"),
          ),
        )
        .returning({ id: projectAssets.id });
      if (asset === undefined) throw sceneConflict();
      const nextScene = {
        ...current.scene,
        assetBindings: [
          ...current.scene.assetBindings.filter(
            (binding) => binding.slot !== candidate.slot,
          ),
          {
            assetId: candidate.assetId,
            role: requirement.bindingRole,
            slot: candidate.slot,
          },
        ],
      };
      await this.assertAuthorizedAssetBindings(
        transaction,
        input.ownerUserId,
        input.projectId,
        nextScene,
      );
      const edited = lessonStoryboardSceneSchema.parse({
        ...current,
        scene: nextScene,
      });
      const nextScenes = [...storyboard.scenes];
      nextScenes[index] = edited;
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      await transaction
        .update(illustrationGenerationCandidates)
        .set({ status: "accepted", updatedAt: timestamp })
        .where(eq(illustrationGenerationCandidates.id, candidate.id));
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.scene_candidate_accepted",
        target: { type: "illustration_candidate", id: candidate.id },
        correlationId: input.correlationId,
        metadata: {
          sceneId: scene.stableSceneId,
          slot: candidate.slot,
          assetId: candidate.assetId,
          operation: "accept_ai_illustration",
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: ["preview", "render", "validation"],
        },
        occurredAt: timestamp,
      });
      result = storyboardSceneEditResponseSchema.parse({
        revision: updatedStoryboard.revision,
        scene: edited,
        invalidated: ["preview", "render", "validation"],
        warning: null,
        requiresConfirmation: false,
        resetFields: [],
      });
    });
    if (result === undefined) throw sceneConflict();
    return result;
  }

  public async unbindCatalogAsset(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    slot: string;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse> {
    const parsed = parseBoundary(
      storyboardSceneAssetUnbindingInputSchema,
      input.body,
    );
    const detail = await this.sceneDetail(input);
    if (
      sceneAssetSlotRequirement(detail.scene.scene.template, input.slot) ===
      undefined
    )
      throw incompatibleSceneAssetSlot();
    return this.updateScene({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      sceneId: input.sceneId,
      body: {
        expectedRevision: parsed.expectedRevision,
        scene: {
          ...detail.scene.scene,
          assetBindings: detail.scene.scene.assetBindings.filter(
            (binding) => binding.slot !== input.slot,
          ),
        },
      },
      correlationId: input.correlationId,
    });
  }

  public async switchSceneTemplate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneEditResponse> {
    const parsed = parseBoundary(
      storyboardSceneTemplateSwitchInputSchema,
      input.body,
    );
    const timestamp = this.now();
    let result: StoryboardSceneEditResponse | undefined;
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const index = storyboard.scenes.findIndex(
        (scene) => scene.stableSceneId === input.sceneId,
      );
      if (index < 0) throw sceneNotFound();
      const current = storyboard.scenes[index]!;
      const migration = migrateStoryboardSceneTemplate(
        current.scene,
        parsed.template,
      );
      const compatibleAssetSlots = sceneEditorMetadata(
        parsed.template,
      ).assetSlots;
      const resetFields = [
        ...migration.resetFields,
        ...current.assetRequirements
          .filter(
            (requirement) => !compatibleAssetSlots.includes(requirement.slot),
          )
          .map((requirement) => `assetRequirements.${requirement.slot}`),
      ];
      const preview = lessonStoryboardSceneSchema.parse({
        ...current,
        template: parsed.template,
        durationSeconds: migration.scene.durationSeconds,
        assetRequirements: current.assetRequirements.filter((requirement) =>
          compatibleAssetSlots.includes(requirement.slot),
        ),
        scene: migration.scene,
      });
      const impact = sceneEditInvalidation(current.scene, preview.scene);
      if (resetFields.length > 0 && parsed.confirmReset !== true) {
        result = storyboardSceneEditResponseSchema.parse({
          revision: storyboard.revision,
          scene: preview,
          invalidated: impact.invalidated,
          warning: impact.warning,
          requiresConfirmation: true,
          resetFields,
        });
        return;
      }
      const nextScenes = [...storyboard.scenes];
      nextScenes[index] = preview;
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.edited",
        target: { type: "storyboard_scene", id: input.sceneId },
        correlationId: input.correlationId,
        metadata: {
          operation: "change-template",
          fromTemplate: current.template,
          toTemplate: parsed.template,
          resetFields,
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: impact.invalidated,
        },
        occurredAt: timestamp,
      });
      result = storyboardSceneEditResponseSchema.parse({
        revision: updatedStoryboard.revision,
        scene: preview,
        invalidated: impact.invalidated,
        warning: impact.warning,
        requiresConfirmation: false,
        resetFields,
      });
    });
    if (result === undefined) throw sceneConflict();
    return result;
  }

  public async addScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse> {
    const parsed = parseBoundary(storyboardSceneCreateInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const sceneId = createId(timestamp);
      const sceneSpec = createDefaultStoryboardSceneSpec(parsed.template, {
        id: sceneId,
        order: storyboard.scenes.length + 1,
        durationSeconds: storyboardSceneDefaultDurationSeconds,
      });
      const added = lessonStoryboardSceneSchema.parse({
        id: sceneId,
        stableSceneId: sceneId,
        order: storyboard.scenes.length + 1,
        template: parsed.template,
        durationSeconds: storyboardSceneDefaultDurationSeconds,
        narrationBlockIds: [],
        assetRequirements: [],
        scene: sceneSpec,
      });
      const nextScenes = this.renumberScenes([...storyboard.scenes, added]);
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.edited",
        target: { type: "storyboard_scene", id: sceneId },
        correlationId: input.correlationId,
        metadata: {
          operation: "add",
          template: parsed.template,
          order: nextScenes.length,
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: ["timeline", "validation", "render"],
        },
        occurredAt: timestamp,
      });
    });
    return this.scenes({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async duplicateScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse> {
    const parsed = parseBoundary(
      storyboardSceneDuplicateInputSchema,
      input.body,
    );
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const sourceIndex = storyboard.scenes.findIndex(
        (scene) => scene.stableSceneId === input.sceneId,
      );
      if (sourceIndex < 0) throw sceneNotFound();
      const source = storyboard.scenes[sourceIndex]!;
      const sceneId = createId(timestamp);
      const duplicate = lessonStoryboardSceneSchema.parse({
        ...source,
        id: sceneId,
        stableSceneId: sceneId,
        scene: { ...source.scene, id: sceneId },
      });
      const reordered = [...storyboard.scenes];
      reordered.splice(sourceIndex + 1, 0, duplicate);
      const nextScenes = this.renumberScenes(reordered);
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.edited",
        target: { type: "storyboard_scene", id: sceneId },
        correlationId: input.correlationId,
        metadata: {
          operation: "duplicate",
          sourceSceneId: source.stableSceneId,
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: ["timeline", "validation", "render"],
        },
        occurredAt: timestamp,
      });
    });
    return this.scenes({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async deleteScene(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse> {
    const parsed = parseBoundary(storyboardSceneDeleteInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      if (storyboard.scenes.length <= 1) throw atLeastOneSceneRequired();
      const scene = storyboard.scenes.find(
        (candidate) => candidate.stableSceneId === input.sceneId,
      );
      if (scene === undefined) throw sceneNotFound();
      const nextScenes = this.renumberScenes(
        storyboard.scenes.filter(
          (candidate) => candidate.stableSceneId !== input.sceneId,
        ),
      );
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.edited",
        target: { type: "storyboard_scene", id: input.sceneId },
        correlationId: input.correlationId,
        metadata: {
          operation: "delete",
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: ["timeline", "validation", "render"],
        },
        occurredAt: timestamp,
      });
    });
    return this.scenes({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async reorderScenes(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<StoryboardSceneListResponse> {
    const parsed = parseBoundary(storyboardSceneReorderInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const lessonSpec = await this.mutableDraftLessonSpecRow(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const storyboard = parseStoryboard(lessonSpec);
      const byId = new Map(
        storyboard.scenes.map((scene) => [scene.stableSceneId, scene]),
      );
      if (
        byId.size !== parsed.sceneIds.length ||
        [...byId.keys()].some((id) => !parsed.sceneIds.includes(id))
      )
        throw sceneReorderMismatch();
      const nextScenes = this.renumberScenes(
        parsed.sceneIds.map((stableSceneId) => {
          const scene = byId.get(stableSceneId);
          if (scene === undefined) throw sceneReorderMismatch();
          return scene;
        }),
      );
      const updatedStoryboard = this.rebuildStoryboard(storyboard, nextScenes);
      await this.persistStoryboard(
        transaction,
        lessonSpec,
        updatedStoryboard,
        timestamp,
      );
      await this.syncSceneRows(
        transaction,
        input.ownerUserId,
        input.projectId,
        lessonSpec.id,
        nextScenes,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.edited",
        target: { type: "storyboard", id: storyboard.id },
        correlationId: input.correlationId,
        metadata: {
          operation: "reorder",
          sceneIds: parsed.sceneIds,
          lessonSpecRevision: updatedStoryboard.revision,
          invalidatedScope: ["timeline", "validation", "render"],
        },
        occurredAt: timestamp,
      });
    });
    return this.scenes({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  private renumberScenes(
    scenes: readonly LessonStoryboardScene[],
  ): LessonStoryboardScene[] {
    return scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
      scene: { ...scene.scene, order: index + 1 },
    }));
  }

  private rebuildStoryboard(
    storyboard: LessonStoryboard,
    scenes: readonly LessonStoryboardScene[],
  ): LessonStoryboard {
    const totalDurationSeconds = scenes.reduce(
      (sum, scene) => sum + scene.durationSeconds,
      0,
    );
    return lessonStoryboardSchema.parse({
      ...storyboard,
      revision: storyboard.revision + 1,
      totalDurationSeconds,
      contentHash: computeLessonStoryboardContentHash({
        totalDurationSeconds,
        objectiveIds: storyboard.objectiveIds,
        scenes: scenes.map((scene) => ({
          contentHash: computeLessonStoryboardSceneContentHash({
            template: scene.scene.template,
            title: scene.scene.title,
            narration: scene.scene.narration,
            durationSeconds: scene.scene.durationSeconds,
            onScreenText: scene.scene.onScreenText,
            transition: scene.scene.transition,
            visual: scene.scene.visual,
            sourceRefs: scene.scene.sourceRefs,
            generatedAdditions: scene.scene.generatedAdditions,
            assetBindings: scene.scene.assetBindings,
          }),
          narrationBlockIds: scene.narrationBlockIds,
          assetRequirements: scene.assetRequirements,
        })),
      }),
      scenes,
    });
  }

  private async persistStoryboard(
    executor: DatabaseExecutor,
    lessonSpec: LessonSpecRow,
    storyboard: LessonStoryboard,
    timestamp: Date,
  ): Promise<void> {
    const [updated] = await executor
      .update(lessonSpecs)
      .set({
        revision: storyboard.revision,
        totalDurationSeconds: storyboard.totalDurationSeconds,
        contentHash: storyboard.contentHash,
        payload: storyboard,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(lessonSpecs.id, lessonSpec.id),
          eq(lessonSpecs.ownerUserId, lessonSpec.ownerUserId),
          eq(lessonSpecs.projectId, lessonSpec.projectId),
          eq(lessonSpecs.revision, lessonSpec.revision),
        ),
      )
      .returning({ id: lessonSpecs.id });
    if (updated === undefined) throw sceneConflict();
  }

  /**
   * Reconciles the normalized `scenes` rows with the reordered storyboard
   * payload. Existing orders are first negated to free the positive order
   * space, removed rows are deleted, new rows are inserted, and then every row
   * receives its final contiguous positive order without ever violating the
   * unique `(lesson_spec_id, order)` index.
   */
  private async syncSceneRows(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    lessonSpecId: Identifier,
    nextScenes: readonly LessonStoryboardScene[],
    timestamp: Date,
  ): Promise<void> {
    const existingRows = await executor
      .select({
        id: scenes.id,
        order: scenes.order,
        template: scenes.template,
        durationSeconds: scenes.durationSeconds,
        narrationBlockIds: scenes.narrationBlockIds,
        assetRequirements: scenes.assetRequirements,
        sceneJson: scenes.sceneJson,
      })
      .from(scenes)
      .where(
        and(
          eq(scenes.lessonSpecId, lessonSpecId),
          eq(scenes.ownerUserId, ownerUserId),
          eq(scenes.projectId, projectId),
        ),
      );
    const nextIds = new Set(nextScenes.map((scene) => scene.id));
    const removedIds = existingRows
      .map((row) => row.id)
      .filter((id) => !nextIds.has(id));
    if (removedIds.length > 0)
      await executor
        .delete(scenes)
        .where(
          and(
            eq(scenes.lessonSpecId, lessonSpecId),
            eq(scenes.ownerUserId, ownerUserId),
            eq(scenes.projectId, projectId),
            inArray(scenes.id, removedIds),
          ),
        );
    const existingIds = new Set(existingRows.map((row) => row.id));
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const requiresOrderReconciliation =
      existingRows.length !== nextScenes.length ||
      nextScenes.some(
        (scene, index) => existingById.get(scene.id)?.order !== index + 1,
      );
    if (requiresOrderReconciliation)
      await executor
        .update(scenes)
        .set({ order: sql`-${scenes.order}`, updatedAt: timestamp })
        .where(
          and(
            eq(scenes.lessonSpecId, lessonSpecId),
            eq(scenes.ownerUserId, ownerUserId),
            eq(scenes.projectId, projectId),
          ),
        );
    const newScenes = nextScenes.filter((scene) => !existingIds.has(scene.id));
    if (newScenes.length > 0)
      await executor.insert(scenes).values(
        newScenes.map((scene) => ({
          id: scene.id,
          projectId,
          ownerUserId,
          lessonSpecId,
          stableSceneId: scene.stableSceneId,
          order: scene.order,
          template: scene.template,
          durationSeconds: scene.durationSeconds,
          narrationBlockIds: scene.narrationBlockIds,
          assetRequirements: scene.assetRequirements,
          sceneJson: scene.scene,
          revision: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    await Promise.all(
      nextScenes.map((scene, index) => {
        const existing = existingById.get(scene.id);
        const changed =
          existing !== undefined &&
          (existing.order !== index + 1 ||
            existing.template !== scene.template ||
            existing.durationSeconds !== scene.durationSeconds ||
            JSON.stringify(existing.narrationBlockIds) !==
              JSON.stringify(scene.narrationBlockIds) ||
            JSON.stringify(existing.assetRequirements) !==
              JSON.stringify(scene.assetRequirements) ||
            JSON.stringify(existing.sceneJson) !== JSON.stringify(scene.scene));
        if (existing === undefined) return Promise.resolve();
        if (!changed && !requiresOrderReconciliation) return Promise.resolve();
        return executor
          .update(scenes)
          .set({
            order: index + 1,
            template: scene.template,
            durationSeconds: scene.durationSeconds,
            narrationBlockIds: scene.narrationBlockIds,
            assetRequirements: scene.assetRequirements,
            sceneJson: scene.scene,
            ...(changed ? { revision: sql`${scenes.revision} + 1` } : {}),
            ...(changed ? { updatedAt: timestamp } : {}),
          })
          .where(
            and(
              eq(scenes.id, scene.id),
              eq(scenes.lessonSpecId, lessonSpecId),
              eq(scenes.ownerUserId, ownerUserId),
              eq(scenes.projectId, projectId),
            ),
          );
      }),
    );
  }

  /**
   * Catalog bindings are global immutable approved assets. Any non-catalog
   * binding must be a private teacher asset or an included source figure in
   * this tenant; IDs are never trusted across project boundaries.
   */
  private async assertAuthorizedAssetBindings(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    scene: LessonStoryboardScene["scene"],
  ): Promise<void> {
    const catalogBindings = scene.assetBindings.filter(
      (binding) => approvedAssetById(binding.assetId) !== undefined,
    );
    for (const binding of catalogBindings) {
      const requirement =
        binding.slot === undefined
          ? undefined
          : sceneAssetSlotRequirement(scene.template, binding.slot);
      const asset = approvedAssetById(binding.assetId);
      if (
        requirement === undefined ||
        asset === undefined ||
        binding.role !== requirement.bindingRole ||
        !isCatalogAssetCompatibleWithSlot(asset, requirement)
      )
        throw incompatibleCatalogAsset();
    }
    const uniqueIds = [
      ...new Set(
        scene.assetBindings
          .filter((binding) => approvedAssetById(binding.assetId) === undefined)
          .map((binding) => binding.assetId),
      ),
    ];
    if (uniqueIds.length === 0) return;
    const teacherAssets = await executor
      .select({ id: projectAssets.id })
      .from(projectAssets)
      .where(
        and(
          eq(projectAssets.ownerUserId, ownerUserId),
          eq(projectAssets.projectId, projectId),
          eq(projectAssets.status, "active"),
          isNull(projectAssets.deletedAt),
          inArray(projectAssets.id, uniqueIds),
        ),
      );
    const teacherAssetIds = new Set(teacherAssets.map((asset) => asset.id));
    for (const binding of scene.assetBindings) {
      if (!teacherAssetIds.has(binding.assetId)) continue;
      const requirement =
        binding.slot === undefined
          ? undefined
          : sceneAssetSlotRequirement(scene.template, binding.slot);
      if (requirement === undefined || binding.role !== requirement.bindingRole)
        throw incompatibleSceneAssetSlot();
    }
    const sourceFigureIds = uniqueIds.filter((id) => !teacherAssetIds.has(id));
    if (sourceFigureIds.length === 0) return;
    const [document] = await executor
      .select({ id: parsedDocuments.id })
      .from(parsedDocuments)
      .where(
        and(
          eq(parsedDocuments.ownerUserId, ownerUserId),
          eq(parsedDocuments.projectId, projectId),
        ),
      )
      .orderBy(desc(parsedDocuments.createdAt))
      .limit(1);
    if (document === undefined) throw sourceFigureAssetUnavailable();
    const figures = await executor
      .select({ id: extractedFigures.id })
      .from(extractedFigures)
      .where(
        and(
          eq(extractedFigures.parsedDocumentId, document.id),
          inArray(extractedFigures.id, sourceFigureIds),
        ),
      );
    if (figures.length !== sourceFigureIds.length)
      throw sourceFigureAssetUnavailable();
    const excluded = await executor
      .select({ figureId: figureInclusionOverlays.figureId })
      .from(figureInclusionOverlays)
      .where(
        and(
          eq(figureInclusionOverlays.ownerUserId, ownerUserId),
          eq(figureInclusionOverlays.projectId, projectId),
          eq(figureInclusionOverlays.parsedDocumentId, document.id),
          eq(figureInclusionOverlays.included, false),
          inArray(figureInclusionOverlays.figureId, uniqueIds),
        ),
      );
    if (excluded.length > 0) throw sourceFigureAssetUnavailable();
  }

  private computeStaleness(input: {
    storyboard: LessonStoryboard | null;
    configuration: typeof lessonConfigurations.$inferSelect | undefined;
    approval: SourceApprovalStatus;
    approvedOutline: typeof lessonOutlineSets.$inferSelect | undefined;
    approvedOutlineItems: readonly {
      id: Identifier;
      order: number;
      kind: string;
      title: string;
      description: string;
      estimatedSeconds: number;
    }[];
    narrationSetContentHash: string | undefined;
  }): { stale: boolean; staleReason: string | null } {
    const { storyboard } = input;
    if (storyboard === null) return { stale: false, staleReason: null };
    if (
      input.narrationSetContentHash !== undefined &&
      storyboard.narrationSetContentHash !== input.narrationSetContentHash
    )
      return {
        stale: true,
        staleReason:
          "The approved narration changed after this storyboard was generated.",
      };
    if (
      input.configuration !== undefined &&
      storyboard.configurationVersion < input.configuration.version
    )
      return {
        stale: true,
        staleReason:
          "The lesson configuration changed after this storyboard was generated.",
      };
    if (input.approvedOutline === undefined)
      return {
        stale: true,
        staleReason: "The approved lesson outline is missing.",
      };
    if (storyboard.outlineSetId !== input.approvedOutline.id)
      return {
        stale: true,
        staleReason:
          "The lesson outline was re-approved after this storyboard was generated.",
      };
    const outlineItemsContentHash = this.outlineItemsContentHash(
      input.approvedOutlineItems,
    );
    if (outlineItemsContentHash !== storyboard.outlineSetContentHash)
      return {
        stale: true,
        staleReason:
          "The approved lesson outline changed after this storyboard was generated.",
      };
    return { stale: false, staleReason: null };
  }

  private outlineItemsContentHash(
    items: readonly {
      id: Identifier;
      order: number;
      kind: string;
      title: string;
      description: string;
      estimatedSeconds: number;
    }[],
  ): string {
    const canonical = JSON.stringify(
      [...items]
        .sort((left, right) => left.order - right.order)
        .map((item) => ({
          id: item.id,
          order: item.order,
          kind: item.kind,
          title: item.title,
          description: item.description,
          estimatedSeconds: item.estimatedSeconds,
        })),
    );
    return createHash("sha256").update(canonical).digest("hex");
  }

  private computeValidation(input: {
    storyboard: LessonStoryboard | null;
    approvedOutlineItemIds: readonly string[];
    narrationBlocksFor: readonly {
      id: Identifier;
      outlineItemId: Identifier;
    }[];
  }): StoryboardValidation {
    const { storyboard } = input;
    if (storyboard === null)
      return {
        structurallyValid: false,
        durationStatus: "within",
        durationWarning: null,
        uncoveredOutlineItemIds: [...input.approvedOutlineItemIds],
        unassignedBlockIds: input.narrationBlocksFor.map((block) => block.id),
      };
    const assignedBlockIds = new Set(
      storyboard.scenes.flatMap((scene) => scene.narrationBlockIds),
    );
    const coveredOutlineItemIds = new Set(
      input.narrationBlocksFor
        .filter((block) => assignedBlockIds.has(block.id))
        .map((block) => block.outlineItemId),
    );
    const uncoveredOutlineItemIds = input.approvedOutlineItemIds.filter(
      (itemId) => !coveredOutlineItemIds.has(itemId),
    );
    const unassignedBlockIds = input.narrationBlocksFor
      .map((block) => block.id)
      .filter((blockId) => !assignedBlockIds.has(blockId));
    const structurallyValid =
      storyboard.scenes.length >= 1 &&
      uncoveredOutlineItemIds.length === 0 &&
      unassignedBlockIds.length === 0;
    const target = storyboard.targetDurationSeconds;
    let durationStatus: NarrationBudgetStatus = "within";
    let durationWarning: string | null = null;
    if (storyboard.totalDurationSeconds !== target) {
      const tolerance = storyboardDurationToleranceSeconds(target);
      const difference = Math.abs(storyboard.totalDurationSeconds - target);
      durationStatus =
        storyboard.totalDurationSeconds < target ? "under" : "over";
      if (difference > tolerance)
        durationWarning = `The storyboard totals ${storyboard.totalDurationSeconds} seconds; the lesson target is ${target} seconds.`;
    }
    return {
      structurallyValid,
      durationStatus,
      durationWarning,
      uncoveredOutlineItemIds,
      unassignedBlockIds,
    };
  }

  private async workingNarrationSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<NarrationSetRow | undefined> {
    const draft = await this.latestNarrationSetRow(
      executor,
      ownerUserId,
      projectId,
      "draft",
    );
    if (draft !== undefined) return draft;
    return this.latestNarrationSetRow(
      executor,
      ownerUserId,
      projectId,
      "approved",
    );
  }

  private async latestNarrationSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    status: "draft" | "approved",
  ): Promise<NarrationSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(narrationSets)
      .where(
        and(
          eq(narrationSets.ownerUserId, ownerUserId),
          eq(narrationSets.projectId, projectId),
          eq(narrationSets.status, status),
        ),
      )
      .orderBy(desc(narrationSets.generatedAt))
      .limit(1);
    return row;
  }

  private async narrationSourceBlockIds(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    narrationSetId: Identifier,
  ): Promise<Identifier[]> {
    const rows = await executor
      .select({ sourceRefs: narrationBlocks.sourceRefs })
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.setId, narrationSetId),
          eq(narrationBlocks.ownerUserId, ownerUserId),
          eq(narrationBlocks.projectId, projectId),
        ),
      );
    return [
      ...new Set(
        rows.flatMap((row) =>
          (row.sourceRefs as SourceRef[]).flatMap((ref) => ref.blockIds),
        ),
      ),
    ];
  }

  private async loadNarrationSetBlocks(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    narrationSetId: Identifier,
  ): Promise<readonly { id: Identifier; outlineItemId: Identifier }[]> {
    return executor
      .select({
        id: narrationBlocks.id,
        outlineItemId: narrationBlocks.outlineItemId,
      })
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.setId, narrationSetId),
          eq(narrationBlocks.ownerUserId, ownerUserId),
          eq(narrationBlocks.projectId, projectId),
        ),
      )
      .orderBy(narrationBlocks.order);
  }

  private async recomputeNarrationSetContentHash(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    narrationSetId: Identifier,
  ): Promise<string | undefined> {
    const [setRow] = await executor
      .select()
      .from(narrationSets)
      .where(
        and(
          eq(narrationSets.id, narrationSetId),
          eq(narrationSets.ownerUserId, ownerUserId),
          eq(narrationSets.projectId, projectId),
        ),
      )
      .limit(1);
    if (setRow === undefined) return undefined;
    const rows = await executor
      .select()
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.setId, setRow.id),
          eq(narrationBlocks.ownerUserId, ownerUserId),
          eq(narrationBlocks.projectId, projectId),
        ),
      )
      .orderBy(narrationBlocks.order);
    return computeNarrationSetContentHash(
      rows.map((block) => ({
        contentHash: computeNarrationBlockContentHash({
          text: block.text,
          sourceRefs: block.sourceRefs as readonly unknown[],
          generatedAdditions: block.generatedAdditions as readonly unknown[],
          generated: block.generated,
        }),
      })),
      setRow.totalEstimatedSeconds,
    );
  }

  private async loadConfiguration(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof lessonConfigurations.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(lessonConfigurations)
      .where(
        and(
          eq(lessonConfigurations.ownerUserId, ownerUserId),
          eq(lessonConfigurations.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async loadOutlineItems(
    executor: DatabaseExecutor,
    setId: Identifier,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<Array<typeof lessonOutlineItems.$inferSelect>> {
    return executor
      .select()
      .from(lessonOutlineItems)
      .where(
        and(
          eq(lessonOutlineItems.setId, setId),
          eq(lessonOutlineItems.ownerUserId, ownerUserId),
          eq(lessonOutlineItems.projectId, projectId),
        ),
      )
      .orderBy(lessonOutlineItems.order);
  }

  private async latestApprovedOutlineSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof lessonOutlineSets.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(lessonOutlineSets)
      .where(
        and(
          eq(lessonOutlineSets.ownerUserId, ownerUserId),
          eq(lessonOutlineSets.projectId, projectId),
          eq(lessonOutlineSets.status, "approved"),
        ),
      )
      .orderBy(desc(lessonOutlineSets.generatedAt))
      .limit(1);
    return row;
  }

  private async workingLessonSpecRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<LessonSpecRow | undefined> {
    const draft = await this.latestLessonSpecRow(
      this.database,
      ownerUserId,
      projectId,
      "draft",
    );
    if (draft !== undefined) return draft;
    return this.latestLessonSpecRow(
      this.database,
      ownerUserId,
      projectId,
      "approved",
    );
  }

  private async approvedLessonSpecRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<LessonSpecRow | undefined> {
    return this.latestLessonSpecRow(
      this.database,
      ownerUserId,
      projectId,
      "approved",
    );
  }

  private async latestLessonSpecRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    status: "draft" | "approved",
  ): Promise<LessonSpecRow | undefined> {
    const [row] = await executor
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, ownerUserId),
          eq(lessonSpecs.projectId, projectId),
          eq(lessonSpecs.status, status),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1);
    return row;
  }

  private async latestGenerationJob(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<
    | {
        id: Identifier;
        state: GenerationJobState;
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
          eq(jobs.jobType, "storyboard.generate"),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (job === undefined) return undefined;
    return {
      id: job.id as Identifier,
      state: job.state as GenerationJobState,
      errorMetadata: job.errorMetadata,
      updatedAt: job.updatedAt,
    };
  }

  private async latestSceneRegenerationJobRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<
    | {
        id: Identifier;
        state: GenerationJobState;
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
          eq(jobs.jobType, "storyboard.scene-regenerate"),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (job === undefined) return undefined;
    return {
      id: job.id as Identifier,
      state: job.state as GenerationJobState,
      errorMetadata: job.errorMetadata,
      updatedAt: job.updatedAt,
    };
  }

  private async mutableDraftLessonSpecRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    expectedRevision: number,
  ): Promise<LessonSpecRow> {
    const [row] = await executor
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, ownerUserId),
          eq(lessonSpecs.projectId, projectId),
          eq(lessonSpecs.status, "draft"),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1)
      .for("update");
    if (row === undefined) throw nothingToEdit();
    if (row.revision !== expectedRevision)
      throw sceneConflict({
        revision: row.revision,
        storyboard: parseStoryboard(row),
      });
    return row;
  }

  private async sceneRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    lessonSpecId: Identifier,
    stableSceneId: Identifier,
  ): Promise<typeof scenes.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(scenes)
      .where(
        and(
          eq(scenes.lessonSpecId, lessonSpecId),
          eq(scenes.stableSceneId, stableSceneId),
          eq(scenes.ownerUserId, ownerUserId),
          eq(scenes.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async pendingSceneCandidateCount(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    sceneId: Identifier,
  ): Promise<number> {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(sceneCandidates)
      .where(
        and(
          eq(sceneCandidates.sceneId, sceneId),
          eq(sceneCandidates.ownerUserId, ownerUserId),
          eq(sceneCandidates.projectId, projectId),
          eq(sceneCandidates.status, "pending"),
        ),
      );
    return row?.count ?? 0;
  }

  private async loadSceneCandidate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    lessonSpecId: Identifier,
    sceneId: Identifier,
    candidateId: Identifier,
  ): Promise<typeof sceneCandidates.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(sceneCandidates)
      .where(
        and(
          eq(sceneCandidates.id, candidateId),
          eq(sceneCandidates.lessonSpecId, lessonSpecId),
          eq(sceneCandidates.sceneId, sceneId),
          eq(sceneCandidates.ownerUserId, ownerUserId),
          eq(sceneCandidates.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async sceneCandidatesForLessonSpec(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    lessonSpecId: Identifier,
  ): Promise<SceneCandidate[]> {
    const rows = await executor
      .select()
      .from(sceneCandidates)
      .where(
        and(
          eq(sceneCandidates.lessonSpecId, lessonSpecId),
          eq(sceneCandidates.ownerUserId, ownerUserId),
          eq(sceneCandidates.projectId, projectId),
        ),
      )
      .orderBy(desc(sceneCandidates.createdAt))
      .limit(100);
    return rows.map((row) =>
      sceneCandidateSchema.parse({
        id: row.id,
        sceneId: row.sceneId,
        mode: row.mode,
        before: row.beforeScene,
        after: row.afterScene,
        status: row.status,
        sceneRevision: row.sceneRevision,
        modelCallId: row.modelCallId,
        createdAt: serializeUtcTimestamp(row.createdAt),
      }),
    );
  }
}

function parseStoryboard(row: LessonSpecRow): LessonStoryboard {
  return lessonStoryboardSchema.parse(row.payload);
}

const sceneNarrationSummaryLength = 120;

function truncateNarration(
  text: string,
  maximum = sceneNarrationSummaryLength,
): string {
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum).trimEnd()}…`;
}

function projectSceneAssetStatus(
  scene: LessonStoryboardScene,
): StoryboardSceneStatus["assets"] {
  const requiredSlots = new Set([
    ...requiredSceneAssetSlots(scene.scene),
    ...scene.assetRequirements.map((requirement) => requirement.slot),
  ]);
  if (
    [...requiredSlots].some(
      (slot) =>
        !scene.scene.assetBindings.some((binding) => binding.slot === slot),
    )
  )
    return "missing_required";
  if (scene.scene.assetBindings.length > 0) return "resolved";
  if (scene.assetRequirements.length > 0) return "planned";
  return "none";
}

function projectSceneStatus(
  stale: boolean,
  validation: StoryboardValidation,
  assets: StoryboardSceneStatus["assets"],
  media: SceneMediaStatus | undefined,
): StoryboardSceneStatus {
  return {
    assets,
    audio: media?.audio ?? "not_generated",
    captions: media?.captions ?? "not_generated",
    validation:
      assets === "missing_required" || !validation.structurallyValid
        ? "error"
        : validation.durationStatus !== "within"
          ? "warning"
          : "ok",
    stale,
  };
}

function projectSceneListEntry(
  scene: LessonStoryboardScene,
  stale: boolean,
  validation: StoryboardValidation,
  media: SceneMediaStatus | undefined,
) {
  return {
    sceneId: scene.stableSceneId,
    order: scene.order,
    template: scene.template,
    title: scene.scene.title ?? null,
    narrationSummary: truncateNarration(scene.scene.narration),
    narrationBlockCount: scene.narrationBlockIds.length,
    durationSeconds: scene.durationSeconds,
    status: projectSceneStatus(
      stale,
      validation,
      projectSceneAssetStatus(scene),
      media,
    ),
  };
}

type SceneMediaStatus = {
  audio: StoryboardSceneAudioStatus;
  captions: StoryboardSceneCaptionStatus;
};

async function projectSceneMediaStatuses(
  database: DatabaseExecutor,
  ownerUserId: Identifier,
  projectId: Identifier,
  lessonSpecId: string,
): Promise<Map<string, SceneMediaStatus>> {
  const sceneRows = await database
    .select({ id: scenes.id, stableSceneId: scenes.stableSceneId })
    .from(scenes)
    .where(
      and(
        eq(scenes.ownerUserId, ownerUserId),
        eq(scenes.projectId, projectId),
        eq(scenes.lessonSpecId, lessonSpecId),
      ),
    );
  const sceneIds = sceneRows.map((scene) => scene.id);
  if (sceneIds.length === 0) return new Map();
  const audioRows = await database
    .select()
    .from(sceneAudio)
    .where(
      and(
        eq(sceneAudio.ownerUserId, ownerUserId),
        eq(sceneAudio.projectId, projectId),
        inArray(sceneAudio.sceneId, sceneIds),
      ),
    )
    .orderBy(desc(sceneAudio.updatedAt));
  const latestAudioBySceneId = new Map<
    string,
    typeof sceneAudio.$inferSelect
  >();
  for (const audio of audioRows)
    if (!latestAudioBySceneId.has(audio.sceneId))
      latestAudioBySceneId.set(audio.sceneId, audio);
  const audioIds = [...latestAudioBySceneId.values()].map((audio) => audio.id);
  const trackRows =
    audioIds.length === 0
      ? []
      : await database
          .select()
          .from(captionTracks)
          .where(
            and(
              eq(captionTracks.ownerUserId, ownerUserId),
              eq(captionTracks.projectId, projectId),
              inArray(captionTracks.sceneAudioId, audioIds),
            ),
          )
          .orderBy(desc(captionTracks.updatedAt));
  const latestTrackByAudioId = new Map<
    string,
    typeof captionTracks.$inferSelect
  >();
  for (const track of trackRows)
    if (!latestTrackByAudioId.has(track.sceneAudioId))
      latestTrackByAudioId.set(track.sceneAudioId, track);
  const trackIds = [...latestTrackByAudioId.values()].map((track) => track.id);
  const cueRows =
    trackIds.length === 0
      ? []
      : await database
          .select({ trackId: captionCues.trackId })
          .from(captionCues)
          .where(
            and(
              eq(captionCues.ownerUserId, ownerUserId),
              eq(captionCues.projectId, projectId),
              inArray(captionCues.trackId, trackIds),
            ),
          );
  const tracksWithCues = new Set(cueRows.map((cue) => cue.trackId));
  const result = new Map<string, SceneMediaStatus>();
  for (const scene of sceneRows) {
    const audio = latestAudioBySceneId.get(scene.id);
    if (audio === undefined) {
      result.set(scene.stableSceneId, {
        audio: "not_generated",
        captions: "not_generated",
      });
      continue;
    }
    const track = latestTrackByAudioId.get(audio.id);
    const captions: StoryboardSceneCaptionStatus =
      audio.status === "queued" || audio.status === "generating"
        ? "pending"
        : audio.status === "failed"
          ? "failed"
          : audio.status === "stale"
            ? "stale"
            : track?.status === "ready" && tracksWithCues.has(track.id)
              ? "ready"
              : track?.status === "queued" || track?.status === "generating"
                ? "pending"
                : track?.status === "failed"
                  ? "failed"
                  : track?.status === "stale"
                    ? "stale"
                    : "not_generated";
    result.set(scene.stableSceneId, { audio: audio.status, captions });
  }
  return result;
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

function storyboardSourceNotConfirmed(): PublicError {
  return new PublicError(
    "bad_request",
    "Confirm the reviewed source before generating a storyboard.",
    409,
  );
}

function storyboardConfigurationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Save the lesson configuration before generating a storyboard.",
    409,
  );
}

function storyboardNarrationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate narration before generating a storyboard.",
    409,
  );
}

function storyboardSourceSnapshotMismatch(): PublicError {
  return new PublicError(
    "bad_request",
    "The source was re-approved after the narration was generated. Regenerate the outline and narration, then generate a storyboard.",
    409,
  );
}

function sceneNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested scene was not found.",
    404,
  );
}

function sceneCandidateNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested scene regeneration candidate was not found.",
    404,
  );
}

function sceneCandidateNotPending(): PublicError {
  return new PublicError(
    "bad_request",
    "This scene regeneration candidate is no longer pending.",
    409,
  );
}

function sceneConflict(latest?: {
  revision: number;
  storyboard: LessonStoryboard;
}): PublicError {
  return new PublicError(
    "edit_conflict",
    "The storyboard or scene changed. Please refresh and try again.",
    409,
    false,
    undefined,
    latest,
  );
}

function immutableSceneFields(): PublicError {
  return new PublicError(
    "validation_failed",
    "Scene identity, order, template, provenance, and generated-addition history cannot be edited here.",
    400,
    false,
    {
      scene: "Edit only teacher-controlled scene fields.",
    },
  );
}

function incompatibleSceneAssetSlot(): PublicError {
  return new PublicError(
    "validation_failed",
    "An asset binding uses a slot that is not supported by this template.",
    400,
    false,
    {
      "scene.assetBindings":
        "Use a named slot declared by the selected template.",
    },
  );
}

function incompatibleCatalogAsset(): PublicError {
  return new PublicError(
    "validation_failed",
    "This approved asset is not compatible with the selected scene slot.",
    400,
    false,
    {
      assetId: "Choose an approved asset compatible with this scene slot.",
    },
  );
}

function sourceFigureAssetUnavailable(): PublicError {
  return new PublicError(
    "validation_failed",
    "Choose an included source figure from this project.",
    400,
    false,
    {
      "scene.assetBindings":
        "Each asset ID must be an included source figure in this project.",
    },
  );
}

function nothingToEdit(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate a storyboard before editing individual scenes.",
    409,
  );
}

function sceneConfigurationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Save the lesson configuration before regenerating a scene.",
    409,
  );
}

function sceneNarrationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate narration before regenerating a scene.",
    409,
  );
}

function sceneSourceSnapshotMismatch(): PublicError {
  return new PublicError(
    "bad_request",
    "The source was re-approved after the narration was generated. Regenerate the outline, narration, and storyboard first.",
    409,
  );
}

function atLeastOneSceneRequired(): PublicError {
  return new PublicError(
    "bad_request",
    "A storyboard must keep at least one scene.",
    409,
  );
}

function sceneReorderMismatch(): PublicError {
  return new PublicError(
    "bad_request",
    "The reorder list must contain every current scene exactly once.",
    409,
  );
}

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
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

export type { StoryboardGenerationParams };
