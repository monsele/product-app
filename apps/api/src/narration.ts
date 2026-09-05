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
  narrationBlockCandidates,
  narrationBlockRevisions,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentNarrationGenerationCompatibility,
  currentNarrationTransformCompatibility,
  lessonNarrationSetSchema,
  modelCallJobPayloadSchema,
  narrationBlockCandidateSchema,
  narrationBlockMaximumActiveCandidates,
  narrationBlockRestoreInputSchema,
  narrationBlockRevisionsResponseSchema,
  narrationBlockTransformInputSchema,
  narrationBlockUpdateInputSchema,
  narrationApproveInputSchema,
  narrationCandidateDecisionInputSchema,
  narrationGenerationParamsSchema,
  narrationGenerationResponseSchema,
  narrationResponseSchema,
  narrationTransformParamsSchema,
  narrationTransformResponseSchema,
  narrationWordCountRange,
  sourceSnapshotSchema,
  type GeneratedAddition,
  type LessonNarrationSet,
  type NarrationBlockCandidate,
  type NarrationBlockRevisionOrigin,
  type NarrationBlockRevisionsResponse,
  type NarrationBudgetStatus,
  type NarrationGenerationParams,
  type NarrationGenerationResponse,
  type NarrationResponse,
  type NarrationTransformResponse,
  type NarrationValidation,
  type SourceApprovalStatus,
  type SourceRef,
} from "@avlp/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { SourceSnapshotService } from "./source-snapshot.js";
import { resolveSnapshotSourceRefs } from "./objectives.js";

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

/**
 * Canonical content hash of the approved outline items a narration set was
 * bound to. Mirrors the pipeline worker's outline hash so staleness checks can
 * compare against the narration set's recorded `outlineSetContentHash`.
 */
function outlineItemsContentHash(
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

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
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
  approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse>;
  updateBlock(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse>;
  regenerateBlock(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<NarrationTransformResponse>;
  acceptCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse>;
  rejectCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse>;
  listBlockRevisions(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
  }): Promise<NarrationBlockRevisionsResponse>;
  restoreBlockRevision(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse>;
}

type NarrationSetRow = typeof narrationSets.$inferSelect;
type GenerationJobState =
  "queued" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";

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
      const requestedJobId = createId(timestamp);
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 2,
        operationType: "ai.narration",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentNarrationGenerationCompatibility.promptId,
        promptVersion: currentNarrationGenerationCompatibility.promptVersion,
        model: currentNarrationGenerationCompatibility.model,
        providerApproval: createModelCallProviderApproval({
          jobId: requestedJobId,
          model: currentNarrationGenerationCompatibility.model,
        }),
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
        jobId: requestedJobId,
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
        payloadVersion: 2,
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
    const [
      workingRow,
      approvedRow,
      latestJob,
      latestTransformJob,
      configuration,
      approval,
      approvedOutline,
    ] = await Promise.all([
      this.workingSetRow(input.ownerUserId, input.projectId),
      this.approvedSetRow(this.database, input.ownerUserId, input.projectId),
      this.latestGenerationJob(input.ownerUserId, input.projectId),
      this.latestTransformJob(input.ownerUserId, input.projectId),
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
    const approvedOutlineItems =
      approvedOutline === undefined
        ? []
        : await this.loadOutlineItems(
            this.database,
            approvedOutline.id,
            input.ownerUserId,
            input.projectId,
          );
    const approvedOutlineItemIds = approvedOutlineItems.map((item) => item.id);
    const candidates =
      workingRow === undefined
        ? []
        : await this.workingCandidates(
            input.ownerUserId,
            input.projectId,
            workingRow.id,
          );
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
    const staleState = this.computeStaleness({
      set,
      configuration,
      approval,
      approvedOutline,
      approvedOutlineItems,
    });
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
      latestTransformJob:
        latestTransformJob === undefined
          ? null
          : {
              id: latestTransformJob.id,
              state: latestTransformJob.state,
              errorCode: jobErrorCode(latestTransformJob.errorMetadata),
              updatedAt: serializeUtcTimestamp(latestTransformJob.updatedAt),
            },
      canGenerate:
        configuration !== undefined &&
        approval.approved &&
        !approval.stale &&
        approvedOutline !== undefined &&
        !generating,
      canApprove:
        !generating &&
        set !== null &&
        set.status === "draft" &&
        !staleState.stale &&
        validation.structurallyValid &&
        validation.uncoveredOutlineItemIds.length === 0,
      canEdit: set !== null && set.status === "draft" && !generating,
      stale: staleState.stale,
      staleReason: staleState.staleReason,
      candidates,
      validation,
    });
  }

  public async approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse> {
    const parsed = parseBoundary(narrationApproveInputSchema, input.body);
    const timestamp = this.now();
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    await this.database.transaction(async (transaction) => {
      const [generationJob, transformJob] = await Promise.all([
        this.latestGenerationJob(
          input.ownerUserId,
          input.projectId,
          transaction,
        ),
        this.latestTransformJob(
          input.ownerUserId,
          input.projectId,
          transaction,
        ),
      ]);
      if (inFlight(generationJob) || inFlight(transformJob))
        throw narrationApprovalInFlight();
      const draft = await this.latestDraftRowForUpdate(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (draft === undefined) throw narrationNothingToApprove();
      if (draft.revision !== parsed.expectedRevision) throw narrationConflict();
      const [configuration, approvedOutline] = await Promise.all([
        this.loadConfiguration(transaction, input.ownerUserId, input.projectId),
        this.latestApprovedOutlineSetRow(
          transaction,
          input.ownerUserId,
          input.projectId,
        ),
      ]);
      const approvedOutlineItems =
        approvedOutline === undefined
          ? []
          : await this.loadOutlineItems(
              transaction,
              approvedOutline.id,
              input.ownerUserId,
              input.projectId,
            );
      const set = await this.assembleSet(draft, transaction);
      // Approving binds this narration to the storyboard and every lesson
      // version derived from it, so the same staleness and completeness gates
      // the read model reports through `canApprove` are re-checked here under
      // the draft row lock.
      const staleState = this.computeStaleness({
        set,
        configuration,
        approval,
        approvedOutline,
        approvedOutlineItems,
      });
      if (staleState.stale)
        throw narrationStaleForApproval(staleState.staleReason);
      const validation = this.computeValidation({
        set,
        configuration,
        approvedOutlineItemIds: approvedOutlineItems.map((item) => item.id),
      });
      if (!validation.structurallyValid)
        throw narrationNotApprovable(
          "Every narration block must cite the reviewed source or record a generated addition before approval.",
        );
      if (validation.uncoveredOutlineItemIds.length > 0)
        throw narrationNotApprovable(
          "Write narration for every approved outline section before approving.",
        );
      const [approvedRow] = await transaction
        .update(narrationSets)
        .set({ status: "approved", updatedAt: timestamp })
        .where(
          and(
            eq(narrationSets.id, draft.id),
            eq(narrationSets.ownerUserId, input.ownerUserId),
            eq(narrationSets.projectId, input.projectId),
            eq(narrationSets.status, "draft"),
            eq(narrationSets.revision, parsed.expectedRevision),
          ),
        )
        .returning({ id: narrationSets.id });
      if (approvedRow === undefined) throw narrationConflict();
      // Exactly one approved set per project: any previously approved or
      // abandoned draft set becomes history so `approvedSetRow` and lesson
      // versioning always resolve the set the teacher just confirmed.
      await transaction
        .update(narrationSets)
        .set({ status: "superseded", updatedAt: timestamp })
        .where(
          and(
            eq(narrationSets.ownerUserId, input.ownerUserId),
            eq(narrationSets.projectId, input.projectId),
            sql`${narrationSets.status} <> 'superseded'`,
            sql`${narrationSets.id} <> ${draft.id}`,
          ),
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "narration.approved",
        target: { type: "narration_set", id: draft.id },
        correlationId: input.correlationId,
        metadata: {
          blockCount: set.blocks.length,
          totalEstimatedSeconds: set.totalEstimatedSeconds,
          outlineSetId: draft.outlineSetId,
          revision: parsed.expectedRevision,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  private computeStaleness(input: {
    set: LessonNarrationSet | null;
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
  }): { stale: boolean; staleReason: string | null } {
    const { set } = input;
    if (set === null) return { stale: false, staleReason: null };
    if (
      input.approval.approved &&
      !input.approval.stale &&
      input.approval.contentHash !== undefined &&
      set.sourceSnapshotContentHash !== input.approval.contentHash
    )
      return {
        stale: true,
        staleReason:
          "The reviewed source changed after this narration was generated.",
      };
    if (
      input.configuration !== undefined &&
      set.configurationVersion < input.configuration.version
    )
      return {
        stale: true,
        staleReason:
          "The lesson configuration changed after this narration was generated.",
      };
    if (input.approvedOutline === undefined)
      return {
        stale: true,
        staleReason: "The approved lesson outline is missing.",
      };
    if (set.outlineSetId !== input.approvedOutline.id)
      return {
        stale: true,
        staleReason:
          "The lesson outline was re-approved after this narration was generated.",
      };
    if (
      outlineItemsContentHash(input.approvedOutlineItems) !==
      set.outlineSetContentHash
    )
      return {
        stale: true,
        staleReason:
          "The approved lesson outline changed after this narration was generated.",
      };
    return { stale: false, staleReason: null };
  }

  public async updateBlock(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse> {
    const parsed = parseBoundary(narrationBlockUpdateInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const current = await this.loadBlock(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
      );
      if (current === undefined) throw narrationBlockNotFound();
      const sourceRefs =
        parsed.sourceBlockIds === undefined
          ? (current.sourceRefs as SourceRef[])
          : await this.resolveBlockSourceRefs(
              transaction,
              input.ownerUserId,
              input.projectId,
              set,
              parsed.sourceBlockIds,
            );
      const text = parsed.text;
      await this.archiveBlockRevision(transaction, current, timestamp);
      const [updated] = await transaction
        .update(narrationBlocks)
        .set({
          text,
          estimatedWords: countWords(text),
          sourceRefs,
          revision: current.revision + 1,
          origin: "teacher_edit",
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(narrationBlocks.id, current.id),
            eq(narrationBlocks.setId, set.id),
            eq(narrationBlocks.ownerUserId, input.ownerUserId),
            eq(narrationBlocks.projectId, input.projectId),
          ),
        )
        .returning({ id: narrationBlocks.id });
      if (updated === undefined) throw narrationConflict();
      await this.bumpSetRevision(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "narration.edited",
        target: { type: "narration_block", id: current.id },
        correlationId: input.correlationId,
        metadata: {
          operation: "update",
          setRevision: parsed.expectedRevision + 1,
          blockRevision: current.revision + 1,
          invalidatedScope: [
            "audio",
            "captions",
            "preview",
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

  public async regenerateBlock(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<NarrationTransformResponse> {
    const parsed = parseBoundary(
      narrationBlockTransformInputSchema,
      input.body,
    );
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to regenerate a narration block.",
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
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const block = await this.loadBlock(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
      );
      if (block === undefined) throw narrationBlockNotFound();
      const pending = await this.pendingCandidateCount(
        transaction,
        input.ownerUserId,
        input.projectId,
        block.id,
      );
      if (pending >= narrationBlockMaximumActiveCandidates)
        throw new PublicError(
          "bad_request",
          `This narration block already has ${pending} pending regenerations. Accept or reject them first.`,
          409,
        );
      const configuration = await this.loadConfiguration(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (configuration === undefined) throw narrationConfigurationMissing();
      const outlineItems = await this.loadOutlineItems(
        transaction,
        set.outlineSetId,
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
      const params = narrationTransformParamsSchema.parse({
        narrationSetId: set.id,
        narrationSetRevision: set.revision,
        blockId: block.id,
        outlineItemId: block.outlineItemId,
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
      const requestedJobId = createId(timestamp);
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 2,
        operationType: "ai.narration",
        sourceSnapshotId: set.sourceSnapshotId,
        promptId: currentNarrationTransformCompatibility.promptId,
        promptVersion: currentNarrationTransformCompatibility.promptVersion,
        model: currentNarrationTransformCompatibility.model,
        providerApproval: createModelCallProviderApproval({
          jobId: requestedJobId,
          model: currentNarrationTransformCompatibility.model,
        }),
        ...(blockIds.length === 0 ? {} : { narrowing: { blockIds } }),
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "narration-transform",
        set.sourceSnapshotId,
        set.sourceSnapshotContentHash,
        currentNarrationTransformCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: requestedJobId,
        jobType: "narration.transform",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "narration.transform",
          projectId: input.projectId,
          inputVersion,
          options: { requestKey: idempotencyKey },
        }),
        correlationId: input.correlationId,
        payloadVersion: 2,
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
          "The idempotent narration transform job could not be read.",
        );
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "narration.transform_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "narration_block_transform", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            mode: params.mode,
            narrationSetId: params.narrationSetId,
            blockId: params.blockId,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return narrationTransformResponseSchema.parse({
        jobId,
        status: "queued",
      });
    });
  }

  public async acceptCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse> {
    const parsed = parseBoundary(
      narrationCandidateDecisionInputSchema,
      input.body,
    );
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const block = await this.loadBlock(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
      );
      if (block === undefined) throw narrationBlockNotFound();
      const candidate = await this.loadCandidate(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
        input.candidateId,
      );
      if (candidate === undefined) throw narrationCandidateNotFound();
      if (candidate.status !== "pending") throw narrationCandidateNotPending();
      if (candidate.blockRevision !== block.revision) throw narrationConflict();
      await this.archiveBlockRevision(transaction, block, timestamp);
      const [updated] = await transaction
        .update(narrationBlocks)
        .set({
          text: candidate.text,
          estimatedWords: candidate.estimatedWords,
          sourceRefs: candidate.sourceRefs,
          generatedAdditions: candidate.generatedAdditions,
          generated: true,
          revision: block.revision + 1,
          origin: "transform",
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(narrationBlocks.id, block.id),
            eq(narrationBlocks.setId, set.id),
            eq(narrationBlocks.ownerUserId, input.ownerUserId),
            eq(narrationBlocks.projectId, input.projectId),
          ),
        )
        .returning({ id: narrationBlocks.id });
      if (updated === undefined) throw narrationConflict();
      await transaction
        .update(narrationBlockCandidates)
        .set({ status: "accepted", updatedAt: timestamp })
        .where(
          and(
            eq(narrationBlockCandidates.id, candidate.id),
            eq(narrationBlockCandidates.ownerUserId, input.ownerUserId),
            eq(narrationBlockCandidates.projectId, input.projectId),
            eq(narrationBlockCandidates.status, "pending"),
          ),
        );
      await this.bumpSetRevision(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "narration.block_candidate_accepted",
        target: { type: "narration_block_candidate", id: candidate.id },
        correlationId: input.correlationId,
        metadata: {
          blockId: block.id,
          mode: candidate.mode,
          setRevision: parsed.expectedRevision + 1,
          blockRevision: block.revision + 1,
          modelCallId: candidate.modelCallId,
          invalidatedScope: [
            "audio",
            "captions",
            "preview",
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

  public async rejectCandidate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse> {
    const parsed = parseBoundary(
      narrationCandidateDecisionInputSchema,
      input.body,
    );
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const block = await this.loadBlock(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
      );
      if (block === undefined) throw narrationBlockNotFound();
      const candidate = await this.loadCandidate(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
        input.candidateId,
      );
      if (candidate === undefined) throw narrationCandidateNotFound();
      if (candidate.status !== "pending") throw narrationCandidateNotPending();
      const [updated] = await transaction
        .update(narrationBlockCandidates)
        .set({ status: "rejected", updatedAt: timestamp })
        .where(
          and(
            eq(narrationBlockCandidates.id, candidate.id),
            eq(narrationBlockCandidates.ownerUserId, input.ownerUserId),
            eq(narrationBlockCandidates.projectId, input.projectId),
            eq(narrationBlockCandidates.status, "pending"),
          ),
        )
        .returning({ id: narrationBlockCandidates.id });
      if (updated === undefined) throw narrationConflict();
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "narration.block_candidate_rejected",
        target: { type: "narration_block_candidate", id: candidate.id },
        correlationId: input.correlationId,
        metadata: {
          blockId: block.id,
          mode: candidate.mode,
          setRevision: parsed.expectedRevision,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async listBlockRevisions(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
  }): Promise<NarrationBlockRevisionsResponse> {
    const [block] = await this.database
      .select({ id: narrationBlocks.id })
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.id, input.blockId),
          eq(narrationBlocks.ownerUserId, input.ownerUserId),
          eq(narrationBlocks.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (block === undefined) throw narrationBlockNotFound();
    const rows = await this.database
      .select()
      .from(narrationBlockRevisions)
      .where(
        and(
          eq(narrationBlockRevisions.blockId, input.blockId),
          eq(narrationBlockRevisions.ownerUserId, input.ownerUserId),
          eq(narrationBlockRevisions.projectId, input.projectId),
        ),
      )
      .orderBy(desc(narrationBlockRevisions.revision));
    return narrationBlockRevisionsResponseSchema.parse({
      revisions: rows.map((row) => ({
        id: row.id,
        blockId: row.blockId,
        revision: row.revision,
        text: row.text,
        estimatedWords: row.estimatedWords,
        sourceRefs: row.sourceRefs as SourceRef[],
        generatedAdditions: row.generatedAdditions,
        origin: row.origin as NarrationBlockRevisionOrigin,
        modelCallId: row.modelCallId,
        createdAt: serializeUtcTimestamp(row.createdAt),
      })),
    });
  }

  public async restoreBlockRevision(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    blockId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<NarrationResponse> {
    const parsed = parseBoundary(narrationBlockRestoreInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
      );
      const current = await this.loadBlock(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.blockId,
      );
      if (current === undefined) throw narrationBlockNotFound();
      const [history] = await transaction
        .select()
        .from(narrationBlockRevisions)
        .where(
          and(
            eq(narrationBlockRevisions.blockId, input.blockId),
            eq(narrationBlockRevisions.revision, parsed.revision),
            eq(narrationBlockRevisions.setId, set.id),
            eq(narrationBlockRevisions.ownerUserId, input.ownerUserId),
            eq(narrationBlockRevisions.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (history === undefined)
        throw new PublicError(
          "not_found",
          "The requested narration block revision was not found.",
          404,
        );
      await this.archiveBlockRevision(transaction, current, timestamp);
      const [updated] = await transaction
        .update(narrationBlocks)
        .set({
          text: history.text,
          estimatedWords: history.estimatedWords,
          sourceRefs: history.sourceRefs,
          generatedAdditions: history.generatedAdditions,
          generated: history.generated,
          revision: current.revision + 1,
          origin: "restore",
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(narrationBlocks.id, current.id),
            eq(narrationBlocks.setId, set.id),
            eq(narrationBlocks.ownerUserId, input.ownerUserId),
            eq(narrationBlocks.projectId, input.projectId),
          ),
        )
        .returning({ id: narrationBlocks.id });
      if (updated === undefined) throw narrationConflict();
      await this.bumpSetRevision(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
        timestamp,
      );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "narration.block_restored",
        target: { type: "narration_block", id: current.id },
        correlationId: input.correlationId,
        metadata: {
          restoredRevision: parsed.revision,
          setRevision: parsed.expectedRevision + 1,
          blockRevision: current.revision + 1,
          invalidatedScope: [
            "audio",
            "captions",
            "preview",
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

  private async mutableDraftSet(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    expectedRevision: number,
  ): Promise<NarrationSetRow> {
    const draft = await this.latestDraftRowForUpdate(
      executor,
      ownerUserId,
      projectId,
    );
    if (draft === undefined) throw nothingToEdit();
    if (draft.revision !== expectedRevision) throw narrationConflict();
    return draft;
  }

  private async latestDraftRowForUpdate(
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
      .limit(1)
      .for("update");
    return row;
  }

  private async loadBlock(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
    blockId: Identifier,
  ): Promise<typeof narrationBlocks.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.id, blockId),
          eq(narrationBlocks.setId, setId),
          eq(narrationBlocks.ownerUserId, ownerUserId),
          eq(narrationBlocks.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async loadCandidate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
    blockId: Identifier,
    candidateId: Identifier,
  ): Promise<typeof narrationBlockCandidates.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(narrationBlockCandidates)
      .where(
        and(
          eq(narrationBlockCandidates.id, candidateId),
          eq(narrationBlockCandidates.setId, setId),
          eq(narrationBlockCandidates.blockId, blockId),
          eq(narrationBlockCandidates.ownerUserId, ownerUserId),
          eq(narrationBlockCandidates.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async pendingCandidateCount(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    blockId: Identifier,
  ): Promise<number> {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(narrationBlockCandidates)
      .where(
        and(
          eq(narrationBlockCandidates.blockId, blockId),
          eq(narrationBlockCandidates.ownerUserId, ownerUserId),
          eq(narrationBlockCandidates.projectId, projectId),
          eq(narrationBlockCandidates.status, "pending"),
        ),
      );
    return row?.count ?? 0;
  }

  private async workingCandidates(
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
  ): Promise<NarrationBlockCandidate[]> {
    const rows = await this.database
      .select()
      .from(narrationBlockCandidates)
      .where(
        and(
          eq(narrationBlockCandidates.setId, setId),
          eq(narrationBlockCandidates.ownerUserId, ownerUserId),
          eq(narrationBlockCandidates.projectId, projectId),
        ),
      )
      .orderBy(desc(narrationBlockCandidates.createdAt))
      .limit(100);
    return rows.map((row) =>
      narrationBlockCandidateSchema.parse({
        id: row.id,
        blockId: row.blockId,
        mode: row.mode,
        text: row.text,
        estimatedWords: row.estimatedWords,
        sourceRefs: row.sourceRefs as SourceRef[],
        generatedAdditions: row.generatedAdditions,
        status: row.status,
        blockRevision: row.blockRevision,
        modelCallId: row.modelCallId,
        createdAt: serializeUtcTimestamp(row.createdAt),
      }),
    );
  }

  private async resolveBlockSourceRefs(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: NarrationSetRow,
    blockIds: readonly string[],
  ): Promise<SourceRef[]> {
    if (blockIds.length === 0) return [];
    const [row] = await executor
      .select({ payload: sourceSnapshots.payload })
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.id, set.sourceSnapshotId),
          eq(sourceSnapshots.ownerUserId, ownerUserId),
          eq(sourceSnapshots.projectId, projectId),
        ),
      )
      .limit(1);
    if (row === undefined)
      throw new PublicError(
        "not_found",
        "The approved source snapshot for this narration was not found.",
        404,
      );
    const snapshot = sourceSnapshotSchema.parse(row.payload);
    return resolveSnapshotSourceRefs(snapshot, blockIds);
  }

  private async archiveBlockRevision(
    executor: DatabaseExecutor,
    block: typeof narrationBlocks.$inferSelect,
    timestamp: Date,
  ): Promise<void> {
    await executor.insert(narrationBlockRevisions).values({
      id: createId(timestamp),
      projectId: block.projectId,
      ownerUserId: block.ownerUserId,
      setId: block.setId,
      blockId: block.id,
      revision: block.revision,
      text: block.text,
      estimatedWords: block.estimatedWords,
      sourceRefs: block.sourceRefs,
      generatedAdditions: block.generatedAdditions,
      generated: block.generated,
      origin: block.origin,
      modelCallId: null,
      createdAt: timestamp,
    });
  }

  private async bumpSetRevision(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: NarrationSetRow,
    timestamp: Date,
  ): Promise<void> {
    const [updated] = await executor
      .update(narrationSets)
      .set({
        revision: sql`${narrationSets.revision} + 1`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(narrationSets.id, set.id),
          eq(narrationSets.ownerUserId, ownerUserId),
          eq(narrationSets.projectId, projectId),
          eq(narrationSets.revision, set.revision),
        ),
      )
      .returning({ id: narrationSets.id });
    if (updated === undefined) throw narrationConflict();
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
      set.blocks.every(
        (block) =>
          block.sourceRefs.length > 0 || block.generatedAdditions.length > 0,
      );
    const target = configuration?.targetDurationSeconds;
    let durationStatus: NarrationBudgetStatus = "within";
    let durationWarning: string | null = null;
    if (target !== undefined && set.totalEstimatedSeconds !== target) {
      durationStatus = set.totalEstimatedSeconds < target ? "under" : "over";
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

  private async assembleSet(
    row: NarrationSetRow,
    executor: DatabaseExecutor = this.database,
  ): Promise<LessonNarrationSet> {
    const blockRows = await executor
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
    const blocks = blockRows.map((block) => {
      const sourceRefs = block.sourceRefs as SourceRef[];
      const generatedAdditions =
        block.generatedAdditions as GeneratedAddition[];
      return {
        id: block.id,
        outlineItemId: block.outlineItemId,
        order: block.order,
        text: block.text,
        estimatedWords: block.estimatedWords,
        targetSeconds: block.targetSeconds,
        sourceRefs,
        generatedAdditions,
        generated: block.generated,
        revision: block.revision,
        contentHash: computeNarrationBlockContentHash({
          text: block.text,
          sourceRefs,
          generatedAdditions,
          generated: block.generated,
        }),
      };
    });
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
      blocks,
      totalEstimatedSeconds: row.totalEstimatedSeconds,
      contentHash: computeNarrationSetContentHash(
        blocks,
        row.totalEstimatedSeconds,
      ),
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
    return this.latestJobOfType(
      "narration.generate",
      ownerUserId,
      projectId,
      executor,
    );
  }

  private async latestTransformJob(
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
    return this.latestJobOfType(
      "narration.transform",
      ownerUserId,
      projectId,
      executor,
    );
  }

  private async latestJobOfType(
    jobType: string,
    ownerUserId: Identifier,
    projectId: Identifier,
    executor: DatabaseExecutor,
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
          eq(jobs.jobType, jobType),
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

function narrationBlockNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested narration block was not found.",
    404,
  );
}

function narrationCandidateNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested narration candidate was not found.",
    404,
  );
}

function narrationCandidateNotPending(): PublicError {
  return new PublicError(
    "bad_request",
    "This narration candidate is no longer pending.",
    409,
  );
}

function nothingToEdit(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate narration before editing a block.",
    409,
  );
}

function narrationNothingToApprove(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate narration before approving it.",
    409,
  );
}

function narrationApprovalInFlight(): PublicError {
  return new PublicError(
    "bad_request",
    "Narration work is still running. Wait for it to finish before approving.",
    409,
  );
}

function narrationStaleForApproval(reason: string | null): PublicError {
  return new PublicError(
    "bad_request",
    reason ??
      "This narration is out of date with its approved inputs. Regenerate it before approving.",
    409,
  );
}

function narrationNotApprovable(message: string): PublicError {
  return new PublicError("bad_request", message, 409);
}

function inFlight(job: { state: GenerationJobState } | undefined): boolean {
  return (
    job !== undefined &&
    (job.state === "queued" ||
      job.state === "running" ||
      job.state === "retry_wait")
  );
}

function narrationConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The narration changed. Please refresh and try again.",
    409,
  );
}

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new PublicError(
      "validation_failed",
      "Request validation failed.",
      400,
      false,
      errorDetails(result.error),
    );
  return result.data;
}

function errorDetails(error: {
  issues: { path: (string | number)[]; message: string }[];
}): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.join(".") || "root",
      issue.message,
    ]),
  );
}

export type { NarrationGenerationParams };
