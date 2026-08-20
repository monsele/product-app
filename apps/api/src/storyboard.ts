import { createHash } from "node:crypto";
import {
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentStoryboardGenerationCompatibility,
  lessonStoryboardSchema,
  modelCallJobPayloadSchema,
  storyboardDurationToleranceSeconds,
  storyboardGenerationParamsSchema,
  storyboardGenerationResponseSchema,
  storyboardResponseSchema,
  type LessonStoryboard,
  type NarrationBudgetStatus,
  type SourceApprovalStatus,
  type SourceRef,
  type StoryboardGenerationParams,
  type StoryboardGenerationResponse,
  type StoryboardResponse,
  type StoryboardValidation,
} from "@avlp/schemas";
import { and, desc, eq } from "drizzle-orm";
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
}

type LessonSpecRow = typeof lessonSpecs.$inferSelect;
type NarrationSetRow = typeof narrationSets.$inferSelect;
type GenerationJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

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
    const [workingRow, approvedRow, latestJob, configuration, approval, approvedOutline] =
      await Promise.all([
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

  private computeStaleness(input: {
    storyboard: LessonStoryboard | null;
    configuration: typeof lessonConfigurations.$inferSelect | undefined;
    approval: SourceApprovalStatus;
    approvedOutline:
      | typeof lessonOutlineSets.$inferSelect
      | undefined;
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
    return this.latestNarrationSetRow(executor, ownerUserId, projectId, "approved");
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
      .select({ id: narrationBlocks.id, outlineItemId: narrationBlocks.outlineItemId })
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
}

function parseStoryboard(row: LessonSpecRow): LessonStoryboard {
  return lessonStoryboardSchema.parse(row.payload);
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

export type { StoryboardGenerationParams };
