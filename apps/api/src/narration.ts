import { createHash } from "node:crypto";
import { createId, PublicError, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  jobs,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentNarrationGenerationCompatibility,
  lessonNarrationSetSchema,
  modelCallJobPayloadSchema,
  narrationGenerationParamsSchema,
  narrationGenerationResponseSchema,
  narrationResponseSchema,
  narrationWordCountRange,
  type LessonNarrationSet,
  type NarrationBudgetStatus,
  type NarrationGenerationParams,
  type NarrationGenerationResponse,
  type NarrationResponse,
  type NarrationValidation,
  type SourceRef,
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

export interface NarrationService {
  generate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<NarrationGenerationResponse>;
  current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<NarrationResponse>;
}

type NarrationSetRow = typeof narrationSets.$inferSelect;
type GenerationJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

export class PostgresNarrationService implements NarrationService {
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
  }): Promise<NarrationGenerationResponse> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to generate narration.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (!approval.approved || approval.stale || approval.snapshotId === null)
      throw narrationSourceNotConfirmed();
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const configuration = await this.loadConfiguration(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (configuration === undefined) throw narrationConfigurationMissing();
      const approvedOutline = await this.latestApprovedOutlineSetRow(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (approvedOutline === undefined) throw narrationOutlineMissing();
      const outlineItems = await this.loadOutlineItems(
        transaction,
        approvedOutline.id,
        input.ownerUserId,
        input.projectId,
      );
      if (outlineItems.length === 0) throw narrationOutlineMissing();
      const blockIds = [
        ...new Set(
          outlineItems.flatMap((item) =>
            (item.sourceRefs as SourceRef[]).flatMap((ref) => ref.blockIds),
          ),
        ),
      ];
      const params: NarrationGenerationParams =
        narrationGenerationParamsSchema.parse({
          configurationVersion: configuration.version,
          lessonTitle: configuration.lessonTitle,
          subject: configuration.subject,
          ageBand: configuration.ageBand,
          difficulty: configuration.difficulty,
          tone: configuration.tone,
          targetDurationSeconds: configuration.targetDurationSeconds,
          includeRecallQuestions: configuration.includeRecallQuestions,
          outlineSetId: approvedOutline.id,
          outlineSetRevision: approvedOutline.revision,
        });
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 1,
        operationType: "ai.narration",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentNarrationGenerationCompatibility.promptId,
        promptVersion: currentNarrationGenerationCompatibility.promptVersion,
        model: currentNarrationGenerationCompatibility.model,
        ...(blockIds.length === 0 ? {} : { narrowing: { blockIds } }),
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "narration",
        approval.snapshotId,
        approval.contentHash ?? "none",
        currentNarrationGenerationCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "narration.generate",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "narration.generate",
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
        throw new Error("The idempotent narration job could not be read.");
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "narration.generate_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "narration_generation", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            configurationVersion: params.configurationVersion,
            outlineSetId: params.outlineSetId,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return narrationGenerationResponseSchema.parse({
        jobId,
        status: "queued",
      });
    });
  }

  public async current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<NarrationResponse> {
    const [workingRow, approvedRow, latestJob, configuration, approval, approvedOutline] =
      await Promise.all([
        this.workingSetRow(input.ownerUserId, input.projectId),
        this.approvedSetRow(this.database, input.ownerUserId, input.projectId),
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
    const set =
      workingRow === undefined ? null : await this.assembleSet(workingRow);
    const approved =
      approvedRow === undefined ? null : await this.assembleSet(approvedRow);
    const approvedOutlineItemIds =
      approvedOutline === undefined
        ? []
        : (
            await this.loadOutlineItems(
              this.database,
              approvedOutline.id,
              input.ownerUserId,
              input.projectId,
            )
          ).map((item) => item.id);
    const generating =
      latestJob !== undefined &&
      (latestJob.state === "queued" ||
        latestJob.state === "running" ||
        latestJob.state === "retry_wait");
    const state: NarrationResponse["state"] = generating
      ? "generating"
      : set === null
        ? latestJob?.state === "failed"
          ? "failed"
          : "idle"
        : set.status === "draft"
          ? "draft"
          : "approved";
    const validation = this.computeValidation({
      set,
      configuration,
      approvedOutlineItemIds,
    });
    return narrationResponseSchema.parse({
      state,
      set,
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
      validation,
    });
  }

  private computeValidation(input: {
    set: LessonNarrationSet | null;
    configuration: typeof lessonConfigurations.$inferSelect | undefined;
    approvedOutlineItemIds: readonly string[];
  }): NarrationValidation {
    const { set, configuration, approvedOutlineItemIds } = input;
    if (set === null)
      return {
        structurallyValid: false,
        durationStatus: "within",
        durationWarning: null,
        wordCountStatus: "within",
        wordCountWarning: null,
        uncoveredOutlineItemIds: [...approvedOutlineItemIds],
      };
    const covered = new Set(set.blocks.map((block) => block.outlineItemId));
    const uncoveredOutlineItemIds = approvedOutlineItemIds.filter(
      (itemId) => !covered.has(itemId),
    );
    const structurallyValid =
      set.blocks.length >= 1 &&
      set.blocks.every((block) =>
        block.sourceRefs.length > 0 || block.generatedAdditions.length > 0,
      );
    const target = configuration?.targetDurationSeconds;
    let durationStatus: NarrationBudgetStatus = "within";
    let durationWarning: string | null = null;
    if (target !== undefined && set.totalEstimatedSeconds !== target) {
      durationStatus =
        set.totalEstimatedSeconds < target ? "under" : "over";
      durationWarning = `The narration's estimated total (${set.totalEstimatedSeconds} seconds) is ${
        durationStatus === "under" ? "under" : "over"
      } the lesson target (${target} seconds).`;
    }
    let wordCountStatus: NarrationBudgetStatus = "within";
    let wordCountWarning: string | null = null;
    if (target !== undefined) {
      const budget = narrationWordCountRange(target);
      const words = set.blocks.reduce(
        (sum, block) => sum + block.estimatedWords,
        0,
      );
      if (words < budget.min || words > budget.max) {
        wordCountStatus = words < budget.min ? "under" : "over";
        wordCountWarning = `The narration totals ${words} words; the lesson target requires ${budget.min}-${budget.max}.`;
      }
    }
    return {
      structurallyValid,
      durationStatus,
      durationWarning,
      wordCountStatus,
      wordCountWarning,
      uncoveredOutlineItemIds,
    };
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

  private async workingSetRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<NarrationSetRow | undefined> {
    const draft = await this.latestDraftRow(
      this.database,
      ownerUserId,
      projectId,
    );
    if (draft !== undefined) return draft;
    return this.approvedSetRow(this.database, ownerUserId, projectId);
  }

  private async latestDraftRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<NarrationSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(narrationSets)
      .where(
        and(
          eq(narrationSets.ownerUserId, ownerUserId),
          eq(narrationSets.projectId, projectId),
          eq(narrationSets.status, "draft"),
        ),
      )
      .orderBy(desc(narrationSets.generatedAt))
      .limit(1);
    return row;
  }

  private async approvedSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<NarrationSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(narrationSets)
      .where(
        and(
          eq(narrationSets.ownerUserId, ownerUserId),
          eq(narrationSets.projectId, projectId),
          eq(narrationSets.status, "approved"),
        ),
      )
      .orderBy(desc(narrationSets.generatedAt))
      .limit(1);
    return row;
  }

  private async assembleSet(row: NarrationSetRow): Promise<LessonNarrationSet> {
    const blockRows = await this.database
      .select()
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.setId, row.id),
          eq(narrationBlocks.ownerUserId, row.ownerUserId),
          eq(narrationBlocks.projectId, row.projectId),
        ),
      )
      .orderBy(narrationBlocks.order);
    return lessonNarrationSetSchema.parse({
      schemaVersion: 1,
      id: row.id,
      projectId: row.projectId,
      sourceSnapshotId: row.sourceSnapshotId,
      sourceSnapshotContentHash: row.sourceSnapshotContentHash,
      outlineSetId: row.outlineSetId,
      outlineSetContentHash: row.outlineSetContentHash,
      configurationVersion: row.configurationVersion,
      promptId: row.promptId,
      promptVersion: row.promptVersion,
      model: row.model,
      modelCallId: row.modelCallId,
      status: row.status,
      revision: row.revision,
      blocks: blockRows.map((block) => ({
        id: block.id,
        outlineItemId: block.outlineItemId,
        order: block.order,
        text: block.text,
        estimatedWords: block.estimatedWords,
        targetSeconds: block.targetSeconds,
        sourceRefs: block.sourceRefs as SourceRef[],
        generatedAdditions: block.generatedAdditions,
        generated: block.generated,
        revision: block.revision,
      })),
      totalEstimatedSeconds: row.totalEstimatedSeconds,
      generatedAt: serializeUtcTimestamp(row.generatedAt),
      createdAt: serializeUtcTimestamp(row.createdAt),
    });
  }

  private async latestGenerationJob(
    ownerUserId: Identifier,
    projectId: Identifier,
    executor: DatabaseExecutor = this.database,
  ): Promise<
    | {
        id: Identifier;
        state: GenerationJobState;
        errorMetadata: unknown;
        updatedAt: Date;
      }
    | undefined
  > {
    const [job] = await executor
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
          eq(jobs.jobType, "narration.generate"),
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

function narrationSourceNotConfirmed(): PublicError {
  return new PublicError(
    "bad_request",
    "Confirm the reviewed source before generating narration.",
    409,
  );
}

function narrationOutlineMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Approve the lesson outline before generating narration.",
    409,
  );
}

function narrationConfigurationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Save the lesson configuration before generating narration.",
    409,
  );
}

export type { NarrationGenerationParams };
