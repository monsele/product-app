import { createHash } from "node:crypto";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  outboxEvents,
  projects,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentObjectiveGenerationCompatibility,
  learningObjectiveSetSchema,
  modelCallJobPayloadSchema,
  objectiveApproveInputSchema,
  objectiveCreateInputSchema,
  objectiveGenerationParamsSchema,
  objectiveGenerationResponseSchema,
  objectiveRemoveInputSchema,
  objectiveReorderInputSchema,
  objectiveUpdateInputSchema,
  objectivesResponseSchema,
  sourceSnapshotSchema,
  type LearningObjectiveSet,
  type ObjectiveCreateInput,
  type ObjectiveGenerationParams,
  type ObjectiveGenerationResponse,
  type ObjectivesResponse,
  type SourceRef,
  type SourceSnapshot,
} from "@avlp/schemas";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { SourceSnapshotService } from "./source-snapshot.js";
import { assertProjectStageTransition } from "./projects.js";

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

export interface ObjectivesService {
  generate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<ObjectiveGenerationResponse>;
  current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<ObjectivesResponse>;
  add(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse>;
  update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    objectiveId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse>;
  remove(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    objectiveId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse>;
  reorder(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse>;
  approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse>;
}

type ObjectiveSetRow = typeof learningObjectiveSets.$inferSelect;
type GenerationJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

/**
 * Resolves source block IDs selected by the teacher into {@link SourceRef}
 * entries using the approved source snapshot. Application code derives
 * document, page, and section provenance; unknown block IDs are rejected so
 * teacher-authored objectives never cite blocks outside the approved snapshot.
 */
export function resolveSnapshotSourceRefs(
  snapshot: SourceSnapshot,
  blockIds: readonly string[],
): SourceRef[] {
  const blocksById = new Map(snapshot.blocks.map((block) => [block.blockId, block]));
  for (const blockId of blockIds)
    if (!blocksById.has(blockId))
      throw new PublicError(
        "validation_failed",
        "The objective cites a source block that is not in the approved source.",
        400,
        false,
        { sourceBlockIds: `Unknown source block ${blockId}.` },
      );
  const refsBySection = new Map<string, SourceRef>();
  const orderedSectionIds: string[] = [];
  for (const blockId of [...new Set(blockIds)]) {
    const block = blocksById.get(blockId)!;
    let ref = refsBySection.get(block.sectionId);
    if (ref === undefined) {
      ref = {
        documentId: snapshot.sourceDocumentId,
        parsedDocumentVersion: snapshot.parsedDocumentVersion,
        pageStart: block.pageStart,
        sectionId: block.sectionId,
        blockIds: [],
      };
      refsBySection.set(block.sectionId, ref);
      orderedSectionIds.push(block.sectionId);
    }
    ref.pageStart = Math.min(ref.pageStart, block.pageStart);
    if (block.pageEnd === undefined) {
      ref.pageEnd = Math.max(ref.pageEnd ?? block.pageStart, block.pageStart);
    } else {
      ref.pageEnd = Math.max(ref.pageEnd ?? block.pageStart, block.pageEnd);
    }
    ref.blockIds.push(blockId);
  }
  return orderedSectionIds.map((sectionId) => {
    const ref = refsBySection.get(sectionId)!;
    ref.blockIds.sort();
    return ref;
  });
}

export class PostgresObjectivesService implements ObjectivesService {
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
  }): Promise<ObjectiveGenerationResponse> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to generate objectives.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (!approval.approved || approval.stale || approval.snapshotId === null)
      throw objectivesSourceNotConfirmed();
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const configuration = await this.loadConfiguration(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (configuration === undefined) throw objectivesConfigurationMissing();

      const params = objectiveGenerationParamsSchema.parse({
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
        operationType: "ai.objectives",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentObjectiveGenerationCompatibility.promptId,
        promptVersion: currentObjectiveGenerationCompatibility.promptVersion,
        model: currentObjectiveGenerationCompatibility.model,
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "objectives",
        approval.snapshotId,
        approval.contentHash ?? "none",
        currentObjectiveGenerationCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "objectives.generate",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "objectives.generate",
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
        throw new Error("The idempotent objectives job could not be read.");
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "objectives.generate_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        const project = await this.loadProject(
          transaction,
          input.ownerUserId,
          input.projectId,
        );
        if (project !== undefined && project.stage === "lesson_configuration") {
          await transaction
            .update(projects)
            .set({
              stage: "objectives_review",
              latestFailedOperation: null,
              updatedAt: timestamp,
              revision: sql`${projects.revision} + 1`,
            })
            .where(
              and(
                eq(projects.id, input.projectId),
                eq(projects.ownerUserId, input.ownerUserId),
              ),
            );
        }
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "objective_generation", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            configurationVersion: params.configurationVersion,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return objectiveGenerationResponseSchema.parse({
        jobId,
        status: "queued",
      });
    });
  }

  public async current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<ObjectivesResponse> {
    const [workingRow, approvedRow, latestJob, configuration, approval] =
      await Promise.all([
        this.workingSetRow(input.ownerUserId, input.projectId),
        this.approvedSetRow(this.database, input.ownerUserId, input.projectId),
        this.latestGenerationJob(input.ownerUserId, input.projectId),
        this.loadConfiguration(this.database, input.ownerUserId, input.projectId),
        this.sourceApprovalStatus({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        }),
      ]);
    const set =
      workingRow === undefined ? null : await this.assembleSet(workingRow);
    const approved =
      approvedRow === undefined ? null : await this.assembleSet(approvedRow);
    const generating =
      latestJob !== undefined &&
      (latestJob.state === "queued" ||
        latestJob.state === "running" ||
        latestJob.state === "retry_wait");
    const state: ObjectivesResponse["state"] = generating
      ? "generating"
      : set === null
        ? latestJob?.state === "failed"
          ? "failed"
          : "idle"
        : set.status === "draft"
          ? "draft"
          : "approved";
    return objectivesResponseSchema.parse({
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
        !generating,
      canApprove:
        !generating &&
        set !== null &&
        set.status === "draft" &&
        set.objectives.length >= 1,
    });
  }

  public async add(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse> {
    const parsed = parseBoundary(objectiveCreateInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      const sourceRefs = await this.resolveRefsForCreate(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
        parsed,
      );
      const [maxRow] = await transaction
        .select({ max: sql<number>`coalesce(max(${learningObjectives.order}), 0)` })
        .from(learningObjectives)
        .where(eq(learningObjectives.setId, set.id));
      const order = (maxRow?.max ?? 0) + 1;
      await transaction.insert(learningObjectives).values({
        id: createId(timestamp),
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        setId: set.id,
        order,
        statement: parsed.statement,
        verb: parsed.verb,
        confidence: 1,
        sourceRefs,
        generated: false,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
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
        eventType: "objectives.edited",
        target: { type: "objective_set", id: set.id },
        correlationId: input.correlationId,
        metadata: { operation: "add", order, revision: parsed.expectedRevision + 1 },
        occurredAt: timestamp,
      });
    });
    return this.current({ ownerUserId: input.ownerUserId, projectId: input.projectId });
  }

  public async update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    objectiveId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse> {
    const parsed = parseBoundary(objectiveUpdateInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      const current = await this.loadObjective(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.objectiveId,
      );
      if (current === undefined) throw objectiveNotFound();
      const sourceRefs =
        parsed.sourceBlockIds === undefined
          ? current.sourceRefs
          : await this.resolveRefs(
              transaction,
              input.ownerUserId,
              input.projectId,
              set,
              parsed.sourceBlockIds,
            );
      const [updated] = await transaction
        .update(learningObjectives)
        .set({
          statement: parsed.statement ?? current.statement,
          verb: parsed.verb ?? current.verb,
          sourceRefs,
          revision: nextRevision(current.revision),
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(learningObjectives.id, input.objectiveId),
            eq(learningObjectives.setId, set.id),
            eq(learningObjectives.ownerUserId, input.ownerUserId),
            eq(learningObjectives.projectId, input.projectId),
          ),
        )
        .returning();
      if (updated === undefined) throw objectiveConflict();
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
        eventType: "objectives.edited",
        target: { type: "learning_objective", id: input.objectiveId },
        correlationId: input.correlationId,
        metadata: { operation: "update", revision: parsed.expectedRevision + 1 },
        occurredAt: timestamp,
      });
    });
    return this.current({ ownerUserId: input.ownerUserId, projectId: input.projectId });
  }

  public async remove(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    objectiveId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse> {
    const parsed = parseBoundary(objectiveRemoveInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      const current = await this.loadObjective(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.objectiveId,
      );
      if (current === undefined) throw objectiveNotFound();
      const [deleted] = await transaction
        .delete(learningObjectives)
        .where(
          and(
            eq(learningObjectives.id, input.objectiveId),
            eq(learningObjectives.setId, set.id),
            eq(learningObjectives.ownerUserId, input.ownerUserId),
            eq(learningObjectives.projectId, input.projectId),
          ),
        )
        .returning({ id: learningObjectives.id });
      if (deleted === undefined) throw objectiveConflict();
      await this.renumberObjectives(
        transaction,
        set.id,
        input.ownerUserId,
        input.projectId,
        timestamp,
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
        eventType: "objectives.edited",
        target: { type: "learning_objective", id: input.objectiveId },
        correlationId: input.correlationId,
        metadata: { operation: "remove", revision: parsed.expectedRevision + 1 },
        occurredAt: timestamp,
      });
    });
    return this.current({ ownerUserId: input.ownerUserId, projectId: input.projectId });
  }

  public async reorder(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse> {
    const parsed = parseBoundary(objectiveReorderInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      const rows = await transaction
        .select({ id: learningObjectives.id })
        .from(learningObjectives)
        .where(
          and(
            eq(learningObjectives.setId, set.id),
            eq(learningObjectives.ownerUserId, input.ownerUserId),
            eq(learningObjectives.projectId, input.projectId),
          ),
        );
      const existing = new Set(rows.map((row) => row.id));
      const requested = new Set(parsed.objectiveIds);
      if (
        existing.size !== requested.size ||
        [...existing].some((id) => !requested.has(id))
      )
        throw reorderMismatch();
      await this.applyObjectiveOrders(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        parsed.objectiveIds,
        timestamp,
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
        eventType: "objectives.edited",
        target: { type: "objective_set", id: set.id },
        correlationId: input.correlationId,
        metadata: {
          operation: "reorder",
          revision: parsed.expectedRevision + 1,
          objectiveIds: parsed.objectiveIds,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({ ownerUserId: input.ownerUserId, projectId: input.projectId });
  }

  public async approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<ObjectivesResponse> {
    const parsed = parseBoundary(objectiveApproveInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const draft = await this.latestDraftRowForUpdate(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (draft === undefined) throw nothingToApprove();
      if (draft.revision !== parsed.expectedRevision) throw objectiveConflict();
      const count = await this.objectiveCount(
        transaction,
        draft.id,
        input.ownerUserId,
        input.projectId,
      );
      if (count < 1) throw atLeastOneObjectiveRequired();
      const [approvedRow] = await transaction
        .update(learningObjectiveSets)
        .set({ status: "approved", updatedAt: timestamp })
        .where(
          and(
            eq(learningObjectiveSets.id, draft.id),
            eq(learningObjectiveSets.ownerUserId, input.ownerUserId),
            eq(learningObjectiveSets.projectId, input.projectId),
            eq(learningObjectiveSets.status, "draft"),
            eq(learningObjectiveSets.revision, parsed.expectedRevision),
          ),
        )
        .returning({ id: learningObjectiveSets.id });
      if (approvedRow === undefined) throw objectiveConflict();
      await transaction
        .update(learningObjectiveSets)
        .set({ status: "superseded", updatedAt: timestamp })
        .where(
          and(
            eq(learningObjectiveSets.ownerUserId, input.ownerUserId),
            eq(learningObjectiveSets.projectId, input.projectId),
            sql`${learningObjectiveSets.status} <> 'superseded'`,
            sql`${learningObjectiveSets.id} <> ${draft.id}`,
          ),
        );
      const project = await this.loadProject(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (project !== undefined && project.stage === "objectives_review") {
        assertProjectStageTransition("objectives_review", "outline_review");
        await transaction
          .update(projects)
          .set({
            stage: "outline_review",
            latestFailedOperation: null,
            updatedAt: timestamp,
            revision: sql`${projects.revision} + 1`,
          })
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerUserId, input.ownerUserId),
            ),
          );
      }
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "objectives.approved",
        target: { type: "objective_set", id: draft.id },
        correlationId: input.correlationId,
        metadata: {
          objectiveCount: count,
          sourceSnapshotId: draft.sourceSnapshotId,
          revision: parsed.expectedRevision,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({ ownerUserId: input.ownerUserId, projectId: input.projectId });
  }

  private async resolveRefsForCreate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: ObjectiveSetRow,
    input: ObjectiveCreateInput,
  ): Promise<SourceRef[]> {
    if (input.sourceBlockIds === undefined || input.sourceBlockIds.length === 0)
      return [];
    return this.resolveRefs(executor, ownerUserId, projectId, set, input.sourceBlockIds);
  }

  private async resolveRefs(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: ObjectiveSetRow,
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
        "The approved source snapshot for these objectives was not found.",
        404,
      );
    const snapshot = sourceSnapshotSchema.parse(row.payload);
    return resolveSnapshotSourceRefs(snapshot, blockIds);
  }

  private async mutableDraftSet(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    expectedRevision: number,
    timestamp: Date,
  ): Promise<ObjectiveSetRow> {
    const draft = await this.latestDraftRow(executor, ownerUserId, projectId);
    if (draft !== undefined) {
      if (draft.revision !== expectedRevision) throw objectiveConflict();
      return draft;
    }
    const approved = await this.approvedSetRowForUpdate(
      executor,
      ownerUserId,
      projectId,
    );
    if (approved === undefined) throw nothingToEdit();
    // Serialized on the approved row: after the lock is acquired, a competing
    // first-edit may have already cloned it into a draft revision.
    const latest = await this.latestDraftRow(executor, ownerUserId, projectId);
    if (latest !== undefined) {
      if (latest.revision !== expectedRevision) throw objectiveConflict();
      return latest;
    }
    if (approved.revision !== expectedRevision) throw objectiveConflict();
    return this.cloneApprovedToDraft(executor, approved, timestamp);
  }

  private async cloneApprovedToDraft(
    executor: DatabaseExecutor,
    approved: ObjectiveSetRow,
    timestamp: Date,
  ): Promise<ObjectiveSetRow> {
    const draftId = createId(timestamp);
    const draft: ObjectiveSetRow = {
      ...approved,
      id: draftId,
      status: "draft",
      revision: 0,
      idempotencyKey: `objectives:revision:${approved.id}:${draftId}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      generatedAt: timestamp,
    };
    await executor.insert(learningObjectiveSets).values({
      id: draft.id,
      projectId: draft.projectId,
      ownerUserId: draft.ownerUserId,
      sourceSnapshotId: draft.sourceSnapshotId,
      sourceSnapshotContentHash: draft.sourceSnapshotContentHash,
      configurationVersion: draft.configurationVersion,
      promptId: draft.promptId,
      promptVersion: draft.promptVersion,
      model: draft.model,
      modelCallId: draft.modelCallId,
      status: draft.status,
      revision: draft.revision,
      idempotencyKey: draft.idempotencyKey,
      keyConcepts: draft.keyConcepts,
      prerequisiteKnowledge: draft.prerequisiteKnowledge,
      vocabulary: draft.vocabulary,
      misconceptions: draft.misconceptions,
      assessmentQuestions: draft.assessmentQuestions,
      generatedAt: draft.generatedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    });
    const objectives = await executor
      .select()
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.setId, approved.id),
          eq(learningObjectives.ownerUserId, approved.ownerUserId),
          eq(learningObjectives.projectId, approved.projectId),
        ),
      );
    if (objectives.length > 0) {
      await executor.insert(learningObjectives).values(
        objectives.map((objective) => ({
          id: createId(timestamp),
          projectId: objective.projectId,
          ownerUserId: objective.ownerUserId,
          setId: draftId,
          order: objective.order,
          statement: objective.statement,
          verb: objective.verb,
          confidence: objective.confidence,
          sourceRefs: objective.sourceRefs,
          generated: objective.generated,
          revision: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    }
    return draft;
  }

  private async bumpSetRevision(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: ObjectiveSetRow,
    timestamp: Date,
  ): Promise<void> {
    const [updated] = await executor
      .update(learningObjectiveSets)
      .set({
        revision: sql`${learningObjectiveSets.revision} + 1`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(learningObjectiveSets.id, set.id),
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
          eq(learningObjectiveSets.revision, set.revision),
        ),
      )
      .returning({ id: learningObjectiveSets.id });
    if (updated === undefined) throw objectiveConflict();
  }

  private async renumberObjectives(
    executor: DatabaseExecutor,
    setId: Identifier,
    ownerUserId: Identifier,
    projectId: Identifier,
    timestamp: Date,
  ): Promise<void> {
    const rows = await executor
      .select({ id: learningObjectives.id })
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.setId, setId),
          eq(learningObjectives.ownerUserId, ownerUserId),
          eq(learningObjectives.projectId, projectId),
        ),
      )
      .orderBy(learningObjectives.order);
    await this.applyObjectiveOrders(
      executor,
      ownerUserId,
      projectId,
      setId,
      rows.map((row) => row.id),
      timestamp,
    );
  }

  /**
   * Applies a new ordering without ever violating the unique
   * `(set_id, order)` index: first every objective in the set is moved to a
   * negated temporary order (still unique, but outside the positive range),
   * then each objective receives its final positive order.
   */
  private async applyObjectiveOrders(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
    orderedIds: readonly Identifier[],
    timestamp: Date,
  ): Promise<void> {
    await executor
      .update(learningObjectives)
      .set({ order: sql`-${learningObjectives.order}`, updatedAt: timestamp })
      .where(
        and(
          eq(learningObjectives.setId, setId),
          eq(learningObjectives.ownerUserId, ownerUserId),
          eq(learningObjectives.projectId, projectId),
        ),
      );
    await Promise.all(
      orderedIds.map((objectiveId, index) =>
        executor
          .update(learningObjectives)
          .set({ order: index + 1, updatedAt: timestamp })
          .where(
            and(
              eq(learningObjectives.id, objectiveId),
              eq(learningObjectives.setId, setId),
              eq(learningObjectives.ownerUserId, ownerUserId),
              eq(learningObjectives.projectId, projectId),
            ),
          ),
      ),
    );
  }

  private async loadObjective(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
    objectiveId: Identifier,
  ): Promise<typeof learningObjectives.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.id, objectiveId),
          eq(learningObjectives.setId, setId),
          eq(learningObjectives.ownerUserId, ownerUserId),
          eq(learningObjectives.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async objectiveCount(
    executor: DatabaseExecutor,
    setId: Identifier,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<number> {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.setId, setId),
          eq(learningObjectives.ownerUserId, ownerUserId),
          eq(learningObjectives.projectId, projectId),
        ),
      );
    return row?.count ?? 0;
  }

  private async workingSetRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ObjectiveSetRow | undefined> {
    const draft = await this.latestDraftRow(this.database, ownerUserId, projectId);
    if (draft !== undefined) return draft;
    return this.approvedSetRow(this.database, ownerUserId, projectId);
  }

  private async latestDraftRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ObjectiveSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(learningObjectiveSets)
      .where(
        and(
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
          eq(learningObjectiveSets.status, "draft"),
        ),
      )
      .orderBy(desc(learningObjectiveSets.generatedAt))
      .limit(1);
    return row;
  }

  private async latestDraftRowForUpdate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ObjectiveSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(learningObjectiveSets)
      .where(
        and(
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
          eq(learningObjectiveSets.status, "draft"),
        ),
      )
      .orderBy(desc(learningObjectiveSets.generatedAt))
      .limit(1)
      .for("update");
    return row;
  }

  private async approvedSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ObjectiveSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(learningObjectiveSets)
      .where(
        and(
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
          eq(learningObjectiveSets.status, "approved"),
        ),
      )
      .orderBy(desc(learningObjectiveSets.generatedAt))
      .limit(1);
    return row;
  }

  private async approvedSetRowForUpdate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ObjectiveSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(learningObjectiveSets)
      .where(
        and(
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
          eq(learningObjectiveSets.status, "approved"),
        ),
      )
      .orderBy(desc(learningObjectiveSets.generatedAt))
      .limit(1)
      .for("update");
    return row;
  }

  private async assembleSet(row: ObjectiveSetRow): Promise<LearningObjectiveSet> {
    const objectiveRows = await this.database
      .select()
      .from(learningObjectives)
      .where(eq(learningObjectives.setId, row.id))
      .orderBy(learningObjectives.order);
    return learningObjectiveSetSchema.parse({
      schemaVersion: 1,
      id: row.id,
      projectId: row.projectId,
      sourceSnapshotId: row.sourceSnapshotId,
      sourceSnapshotContentHash: row.sourceSnapshotContentHash,
      configurationVersion: row.configurationVersion,
      promptId: row.promptId,
      promptVersion: row.promptVersion,
      model: row.model,
      modelCallId: row.modelCallId,
      status: row.status,
      revision: row.revision,
      objectives: objectiveRows.map((objective) => ({
        id: objective.id,
        order: objective.order,
        statement: objective.statement,
        verb: objective.verb,
        confidence: objective.confidence,
        sourceRefs: objective.sourceRefs as SourceRef[],
        generated: objective.generated,
        revision: objective.revision,
        groundingStatus:
          (objective.sourceRefs as SourceRef[]).length > 0
            ? "supported"
            : "unsupported",
      })),
      keyConcepts: row.keyConcepts,
      prerequisiteKnowledge: row.prerequisiteKnowledge,
      vocabulary: row.vocabulary,
      misconceptions: row.misconceptions,
      assessmentQuestions: row.assessmentQuestions,
      generatedAt: serializeUtcTimestamp(row.generatedAt),
      createdAt: serializeUtcTimestamp(row.createdAt),
    });
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
          eq(jobs.jobType, "objectives.generate"),
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

  private async loadProject(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof projects.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    return row;
  }
}

function nextRevision(current: number): number {
  return current + 1;
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

function errorDetails(
  error: { issues: { path: (string | number)[]; message: string }[] },
): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.join(".") || "root",
      issue.message,
    ]),
  );
}

function objectivesSourceNotConfirmed(): PublicError {
  return new PublicError(
    "bad_request",
    "Confirm the reviewed source before generating learning objectives.",
    409,
  );
}

function objectivesConfigurationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Save the lesson configuration before generating learning objectives.",
    409,
  );
}

function objectiveNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested objective was not found.",
    404,
  );
}

function objectiveConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The objectives changed. Please refresh and try again.",
    409,
  );
}

function nothingToEdit(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate learning objectives before editing.",
    409,
  );
}

function nothingToApprove(): PublicError {
  return new PublicError(
    "bad_request",
    "There are no draft objectives to approve.",
    409,
  );
}

function atLeastOneObjectiveRequired(): PublicError {
  return new PublicError(
    "bad_request",
    "At least one objective is required before approving.",
    409,
  );
}

function reorderMismatch(): PublicError {
  return new PublicError(
    "validation_failed",
    "Reordering must include every current objective exactly once.",
    400,
    false,
    { objectiveIds: "Provide the complete set of current objective ids." },
  );
}

export type { ObjectiveGenerationParams };
