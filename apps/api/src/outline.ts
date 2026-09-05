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
  lessonOutlineItems,
  lessonOutlineSets,
  outboxEvents,
  outlineObjectiveLinks,
  projects,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentOutlineGenerationCompatibility,
  lessonOutlineSetSchema,
  minimumOutlineItemsForTarget,
  modelCallJobPayloadSchema,
  outlineApproveInputSchema,
  outlineDurationToleranceRatio,
  outlineGenerationParamsSchema,
  outlineGenerationResponseSchema,
  outlineItemCreateInputSchema,
  outlineItemRemoveInputSchema,
  outlineItemUpdateInputSchema,
  outlineReorderInputSchema,
  outlineResponseSchema,
  sourceSnapshotSchema,
  type LessonOutlineSet,
  type OutlineDurationStatus,
  type OutlineGenerationParams,
  type OutlineGenerationResponse,
  type OutlineResponse,
  type OutlineValidation,
  type SourceRef,
} from "@avlp/schemas";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { SourceSnapshotService } from "./source-snapshot.js";
import { assertProjectStageTransition } from "./projects.js";
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

export interface OutlineService {
  generate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<OutlineGenerationResponse>;
  current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<OutlineResponse>;
  add(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse>;
  update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    itemId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse>;
  remove(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    itemId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse>;
  reorder(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse>;
  approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse>;
}

type OutlineSetRow = typeof lessonOutlineSets.$inferSelect;
type GenerationJobState =
  "queued" | "running" | "retry_wait" | "succeeded" | "failed" | "cancelled";

export class PostgresOutlineService implements OutlineService {
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
  }): Promise<OutlineGenerationResponse> {
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to generate the lesson outline.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const approval = await this.sourceApprovalStatus({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
    if (!approval.approved || approval.stale || approval.snapshotId === null)
      throw outlineSourceNotConfirmed();
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const configuration = await this.loadConfiguration(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (configuration === undefined) throw outlineConfigurationMissing();
      const approvedSet = await this.latestApprovedSetRow(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (approvedSet === undefined) throw outlineObjectivesMissing();
      const objectiveRows = await transaction
        .select()
        .from(learningObjectives)
        .where(
          and(
            eq(learningObjectives.setId, approvedSet.id),
            eq(learningObjectives.ownerUserId, input.ownerUserId),
            eq(learningObjectives.projectId, input.projectId),
          ),
        )
        .orderBy(learningObjectives.order);
      const blockIds = [
        ...new Set(
          objectiveRows.flatMap((objective) =>
            (objective.sourceRefs as SourceRef[]).flatMap(
              (ref) => ref.blockIds,
            ),
          ),
        ),
      ];
      const params: OutlineGenerationParams =
        outlineGenerationParamsSchema.parse({
          configurationVersion: configuration.version,
          lessonTitle: configuration.lessonTitle,
          subject: configuration.subject,
          ageBand: configuration.ageBand,
          difficulty: configuration.difficulty,
          tone: configuration.tone,
          targetDurationSeconds: configuration.targetDurationSeconds,
          includeRecallQuestions: configuration.includeRecallQuestions,
          objectiveSetId: approvedSet.id,
          objectiveSetRevision: approvedSet.revision,
        });
      const requestedJobId = createId(timestamp);
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 2,
        operationType: "ai.outline",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentOutlineGenerationCompatibility.promptId,
        promptVersion: currentOutlineGenerationCompatibility.promptVersion,
        model: currentOutlineGenerationCompatibility.model,
        providerApproval: createModelCallProviderApproval({
          jobId: requestedJobId,
          model: currentOutlineGenerationCompatibility.model,
        }),
        ...(blockIds.length === 0 ? {} : { narrowing: { blockIds } }),
        params,
      });
      const paramsHash = canonicalHash(params);
      const inputVersion = [
        "outline",
        approval.snapshotId,
        approval.contentHash ?? "none",
        currentOutlineGenerationCompatibility.promptVersion,
        paramsHash,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId: requestedJobId,
        jobType: "outline.generate",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "outline.generate",
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
        throw new Error("The idempotent outline job could not be read.");
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "outline.generate_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "ai.generated",
          target: { type: "outline_generation", id: jobId },
          correlationId: input.correlationId,
          metadata: {
            operationType: payload.operationType,
            promptId: payload.promptId,
            promptVersion: payload.promptVersion,
            configurationVersion: params.configurationVersion,
            objectiveSetId: params.objectiveSetId,
            sourceSnapshotId: payload.sourceSnapshotId,
          },
          occurredAt: timestamp,
        });
      }
      return outlineGenerationResponseSchema.parse({
        jobId,
        status: "queued",
      });
    });
  }

  public async current(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<OutlineResponse> {
    const [
      workingRow,
      approvedRow,
      latestJob,
      configuration,
      approval,
      approvedSet,
    ] = await Promise.all([
      this.workingSetRow(input.ownerUserId, input.projectId),
      this.approvedSetRow(this.database, input.ownerUserId, input.projectId),
      this.latestGenerationJob(input.ownerUserId, input.projectId),
      this.loadConfiguration(this.database, input.ownerUserId, input.projectId),
      this.sourceApprovalStatus({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
      }),
      this.latestApprovedSetRow(
        this.database,
        input.ownerUserId,
        input.projectId,
      ),
    ]);
    const set =
      workingRow === undefined ? null : await this.assembleSet(workingRow);
    const approved =
      approvedRow === undefined ? null : await this.assembleSet(approvedRow);
    const objectiveSetId =
      workingRow?.objectiveSetId ?? approvedRow?.objectiveSetId;
    const approvedObjectiveIds =
      objectiveSetId === undefined
        ? []
        : await this.loadObjectiveIds(
            this.database,
            input.ownerUserId,
            input.projectId,
            objectiveSetId,
          );
    const generating =
      latestJob !== undefined &&
      (latestJob.state === "queued" ||
        latestJob.state === "running" ||
        latestJob.state === "retry_wait");
    const state: OutlineResponse["state"] = generating
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
      approvedObjectiveIds,
    });
    return outlineResponseSchema.parse({
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
        approvedSet !== undefined &&
        !generating,
      canApprove:
        !generating &&
        set !== null &&
        set.status === "draft" &&
        validation.structurallyValid &&
        validation.uncoveredObjectiveIds.length === 0,
      validation,
    });
  }

  public async add(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse> {
    const parsed = parseBoundary(outlineItemCreateInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      await this.assertObjectiveLinks(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.objectiveSetId,
        parsed.objectiveIds,
      );
      const sourceRefs = await this.resolveRefs(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
        parsed.sourceBlockIds,
      );
      const [maxRow] = await transaction
        .select({
          max: sql<number>`coalesce(max(${lessonOutlineItems.order}), 0)`,
        })
        .from(lessonOutlineItems)
        .where(eq(lessonOutlineItems.setId, set.id));
      const order = (maxRow?.max ?? 0) + 1;
      const itemId = createId(timestamp);
      await transaction.insert(lessonOutlineItems).values({
        id: itemId,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        setId: set.id,
        order,
        kind: parsed.kind,
        title: parsed.title,
        description: parsed.description,
        estimatedSeconds: parsed.estimatedSeconds,
        sourceRefs,
        framingNote: parsed.framingNote ?? null,
        generated: false,
        revision: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await this.replaceLinks(
        transaction,
        input.ownerUserId,
        input.projectId,
        itemId,
        parsed.objectiveIds,
        timestamp,
      );
      await this.recomputeTotal(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
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
        eventType: "outline.edited",
        target: { type: "outline_item", id: itemId },
        correlationId: input.correlationId,
        metadata: {
          operation: "add",
          order,
          revision: parsed.expectedRevision + 1,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async update(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    itemId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse> {
    const parsed = parseBoundary(outlineItemUpdateInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      const current = await this.loadItem(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.itemId,
      );
      if (current === undefined) throw outlineItemNotFound();
      if (parsed.objectiveIds !== undefined)
        await this.assertObjectiveLinks(
          transaction,
          input.ownerUserId,
          input.projectId,
          set.objectiveSetId,
          parsed.objectiveIds,
        );
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
        .update(lessonOutlineItems)
        .set({
          kind: parsed.kind ?? current.kind,
          title: parsed.title ?? current.title,
          description: parsed.description ?? current.description,
          estimatedSeconds: parsed.estimatedSeconds ?? current.estimatedSeconds,
          sourceRefs,
          framingNote:
            parsed.framingNote === undefined
              ? current.framingNote
              : parsed.framingNote,
          revision: current.revision + 1,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(lessonOutlineItems.id, input.itemId),
            eq(lessonOutlineItems.setId, set.id),
            eq(lessonOutlineItems.ownerUserId, input.ownerUserId),
            eq(lessonOutlineItems.projectId, input.projectId),
          ),
        )
        .returning();
      if (updated === undefined) throw outlineConflict();
      if (parsed.objectiveIds !== undefined)
        await this.replaceLinks(
          transaction,
          input.ownerUserId,
          input.projectId,
          input.itemId,
          parsed.objectiveIds,
          timestamp,
        );
      await this.recomputeTotal(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
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
        eventType: "outline.edited",
        target: { type: "outline_item", id: input.itemId },
        correlationId: input.correlationId,
        metadata: {
          operation: "update",
          revision: parsed.expectedRevision + 1,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async remove(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    itemId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse> {
    const parsed = parseBoundary(outlineItemRemoveInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const set = await this.mutableDraftSet(
        transaction,
        input.ownerUserId,
        input.projectId,
        parsed.expectedRevision,
        timestamp,
      );
      const current = await this.loadItem(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        input.itemId,
      );
      if (current === undefined) throw outlineItemNotFound();
      await transaction
        .delete(outlineObjectiveLinks)
        .where(
          and(
            eq(outlineObjectiveLinks.outlineItemId, input.itemId),
            eq(outlineObjectiveLinks.ownerUserId, input.ownerUserId),
            eq(outlineObjectiveLinks.projectId, input.projectId),
          ),
        );
      const [deleted] = await transaction
        .delete(lessonOutlineItems)
        .where(
          and(
            eq(lessonOutlineItems.id, input.itemId),
            eq(lessonOutlineItems.setId, set.id),
            eq(lessonOutlineItems.ownerUserId, input.ownerUserId),
            eq(lessonOutlineItems.projectId, input.projectId),
          ),
        )
        .returning({ id: lessonOutlineItems.id });
      if (deleted === undefined) throw outlineConflict();
      await this.renumberItems(
        transaction,
        set.id,
        input.ownerUserId,
        input.projectId,
        timestamp,
      );
      await this.recomputeTotal(
        transaction,
        input.ownerUserId,
        input.projectId,
        set,
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
        eventType: "outline.edited",
        target: { type: "outline_item", id: input.itemId },
        correlationId: input.correlationId,
        metadata: {
          operation: "remove",
          revision: parsed.expectedRevision + 1,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async reorder(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse> {
    const parsed = parseBoundary(outlineReorderInputSchema, input.body);
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
        .select({ id: lessonOutlineItems.id })
        .from(lessonOutlineItems)
        .where(
          and(
            eq(lessonOutlineItems.setId, set.id),
            eq(lessonOutlineItems.ownerUserId, input.ownerUserId),
            eq(lessonOutlineItems.projectId, input.projectId),
          ),
        );
      const existing = new Set(rows.map((row) => row.id));
      const requested = new Set(parsed.itemIds);
      if (
        existing.size !== requested.size ||
        [...existing].some((id) => !requested.has(id))
      )
        throw outlineReorderMismatch();
      await this.applyItemOrders(
        transaction,
        input.ownerUserId,
        input.projectId,
        set.id,
        parsed.itemIds,
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
        eventType: "outline.edited",
        target: { type: "outline_set", id: set.id },
        correlationId: input.correlationId,
        metadata: {
          operation: "reorder",
          revision: parsed.expectedRevision + 1,
          itemIds: parsed.itemIds,
        },
        occurredAt: timestamp,
      });
    });
    return this.current({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
    });
  }

  public async approve(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<OutlineResponse> {
    const parsed = parseBoundary(outlineApproveInputSchema, input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const latestJob = await this.latestGenerationJob(
        input.ownerUserId,
        input.projectId,
        transaction,
      );
      if (
        latestJob !== undefined &&
        (latestJob.state === "queued" ||
          latestJob.state === "running" ||
          latestJob.state === "retry_wait")
      )
        throw outlineGenerationInFlight();
      const draft = await this.latestDraftRowForUpdate(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (draft === undefined) throw outlineNothingToApprove();
      if (draft.revision !== parsed.expectedRevision) throw outlineConflict();
      const items = await this.loadItems(
        transaction,
        draft.id,
        input.ownerUserId,
        input.projectId,
      );
      const links = await this.loadLinks(
        transaction,
        draft.id,
        input.ownerUserId,
        input.projectId,
      );
      const linksByItem = new Map<string, string[]>();
      for (const link of links) {
        const existing = linksByItem.get(link.outlineItemId) ?? [];
        existing.push(link.objectiveId);
        linksByItem.set(link.outlineItemId, existing);
      }
      const approvedObjectiveIds = await this.loadObjectiveIds(
        transaction,
        input.ownerUserId,
        input.projectId,
        draft.objectiveSetId,
      );
      this.assertApprovable(
        items.map((item) => ({
          kind: item.kind,
          objectiveIds: linksByItem.get(item.id) ?? [],
          sourceRefs: item.sourceRefs as SourceRef[],
          framingNote: item.framingNote,
        })),
        approvedObjectiveIds,
      );
      const [approvedRow] = await transaction
        .update(lessonOutlineSets)
        .set({ status: "approved", updatedAt: timestamp })
        .where(
          and(
            eq(lessonOutlineSets.id, draft.id),
            eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
            eq(lessonOutlineSets.projectId, input.projectId),
            eq(lessonOutlineSets.status, "draft"),
            eq(lessonOutlineSets.revision, parsed.expectedRevision),
          ),
        )
        .returning({ id: lessonOutlineSets.id });
      if (approvedRow === undefined) throw outlineConflict();
      await transaction
        .update(lessonOutlineSets)
        .set({ status: "superseded", updatedAt: timestamp })
        .where(
          and(
            eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
            eq(lessonOutlineSets.projectId, input.projectId),
            sql`${lessonOutlineSets.status} <> 'superseded'`,
            sql`${lessonOutlineSets.id} <> ${draft.id}`,
          ),
        );
      const project = await this.loadProject(
        transaction,
        input.ownerUserId,
        input.projectId,
      );
      if (project !== undefined && project.stage === "outline_review") {
        assertProjectStageTransition(
          "outline_review",
          "narration_storyboard_review",
        );
        await transaction
          .update(projects)
          .set({
            stage: "narration_storyboard_review",
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
        eventType: "outline.approved",
        target: { type: "outline_set", id: draft.id },
        correlationId: input.correlationId,
        metadata: {
          itemCount: items.length,
          totalEstimatedSeconds: draft.totalEstimatedSeconds,
          coveredObjectiveCount: approvedObjectiveIds.length,
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

  private computeValidation(input: {
    set: LessonOutlineSet | null;
    configuration: typeof lessonConfigurations.$inferSelect | undefined;
    approvedObjectiveIds: readonly string[];
  }): OutlineValidation {
    const { set, configuration, approvedObjectiveIds } = input;
    if (set === null)
      return {
        structurallyValid: false,
        durationStatus: "within",
        durationWarning: null,
        uncoveredObjectiveIds: [...approvedObjectiveIds],
        structureWarning: null,
      };
    const items = set.items;
    const uncoveredObjectiveIds = approvedObjectiveIds.filter(
      (objectiveId) =>
        !items.some((item) => item.objectiveIds.includes(objectiveId)),
    );
    const structurallyValid =
      items.length >= 1 &&
      items.length <= 20 &&
      items.every((item) => item.objectiveIds.length >= 1) &&
      items.every((item) =>
        item.kind === "hook"
          ? item.sourceRefs.length > 0 || item.framingNote !== null
          : item.sourceRefs.length > 0,
      );
    const target = configuration?.targetDurationSeconds;
    let durationStatus: OutlineDurationStatus = "within";
    let durationWarning: string | null = null;
    if (target !== undefined) {
      const delta = set.totalEstimatedSeconds - target;
      const ratio = Math.abs(delta) / target;
      if (ratio > outlineDurationToleranceRatio) {
        durationStatus = delta < 0 ? "under" : "over";
        durationWarning = `The estimated total (${set.totalEstimatedSeconds} seconds) is ${
          durationStatus === "under" ? "under" : "over"
        } the lesson target (${target} seconds).`;
      }
    }
    const hasHook = items.some((item) => item.kind === "hook");
    const hasSummary = items.some((item) => item.kind === "summary");
    // Each item becomes exactly one narration block and every block lands in
    // one scene of at most 60s, so an outline with too few items for the target
    // can be approved and narrated but never storyboarded.
    const minimumItems =
      target === undefined ? 0 : minimumOutlineItemsForTarget(target);
    const structureWarning =
      !hasHook && !hasSummary
        ? "The outline has no hook or summary item."
        : !hasHook
          ? "The outline has no hook item."
          : !hasSummary
            ? "The outline has no summary item."
            : items.length < minimumItems
              ? `The outline has ${items.length} items; a ${target} second lesson needs at least ${minimumItems} to be storyboarded.`
              : null;
    return {
      structurallyValid,
      durationStatus,
      durationWarning,
      uncoveredObjectiveIds,
      structureWarning,
    };
  }

  private assertApprovable(
    items: readonly {
      kind: string;
      objectiveIds: readonly string[];
      sourceRefs: readonly SourceRef[];
      framingNote: string | null;
    }[],
    approvedObjectiveIds: readonly string[],
  ): void {
    if (items.length === 0) throw atLeastOneOutlineItemRequired();
    if (items.length > 20) throw outlineTooManyItems();
    for (const [index, item] of items.entries()) {
      if (item.objectiveIds.length === 0)
        throw new PublicError(
          "bad_request",
          "Every outline item must link to at least one approved objective.",
          409,
          false,
          { items: `Item ${index + 1} has no objective links.` },
        );
      if (item.kind !== "hook" && item.sourceRefs.length === 0)
        throw new PublicError(
          "bad_request",
          "Every non-hook outline item must cite at least one source block.",
          409,
          false,
          { items: `Item ${index + 1} has no source references.` },
        );
      if (
        item.kind === "hook" &&
        item.sourceRefs.length === 0 &&
        item.framingNote === null
      )
        throw new PublicError(
          "bad_request",
          "An uncited hook item must be labelled as generated framing.",
          409,
          false,
          { items: `Item ${index + 1} needs a framing note.` },
        );
    }
    const covered = new Set(items.flatMap((item) => item.objectiveIds));
    const uncovered = approvedObjectiveIds.filter((id) => !covered.has(id));
    if (uncovered.length > 0)
      throw new PublicError(
        "bad_request",
        "Every approved objective must be covered by at least one outline item before approval.",
        409,
        false,
        { objectiveIds: uncovered.join(",") },
      );
  }

  private async assertObjectiveLinks(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    objectiveSetId: Identifier,
    objectiveIds: readonly string[],
  ): Promise<void> {
    const approved = await this.loadObjectiveIds(
      executor,
      ownerUserId,
      projectId,
      objectiveSetId,
    );
    const approvedSet = new Set(approved);
    const unknown = [...new Set(objectiveIds)].filter(
      (objectiveId) => !approvedSet.has(objectiveId),
    );
    if (unknown.length > 0)
      throw new PublicError(
        "validation_failed",
        "Outline items can only link to objectives from the approved set.",
        400,
        false,
        { objectiveIds: unknown.join(",") },
      );
  }

  private async replaceLinks(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    outlineItemId: Identifier,
    objectiveIds: readonly string[],
    timestamp: Date,
  ): Promise<void> {
    await executor
      .delete(outlineObjectiveLinks)
      .where(
        and(
          eq(outlineObjectiveLinks.outlineItemId, outlineItemId),
          eq(outlineObjectiveLinks.ownerUserId, ownerUserId),
          eq(outlineObjectiveLinks.projectId, projectId),
        ),
      );
    if (objectiveIds.length === 0) return;
    await executor.insert(outlineObjectiveLinks).values(
      [...new Set(objectiveIds)].map((objectiveId) => ({
        id: createId(timestamp),
        projectId,
        ownerUserId,
        outlineItemId,
        objectiveId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })),
    );
  }

  private async resolveRefs(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: OutlineSetRow,
    blockIds: readonly string[] | undefined,
  ): Promise<SourceRef[]> {
    if (blockIds === undefined || blockIds.length === 0) return [];
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
        "The approved source snapshot for this outline was not found.",
        404,
      );
    const snapshot = sourceSnapshotSchema.parse(row.payload);
    return resolveSnapshotSourceRefs(snapshot, blockIds);
  }

  private async loadObjectiveIds(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    objectiveSetId: Identifier,
  ): Promise<string[]> {
    const rows = await executor
      .select({ id: learningObjectives.id })
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.setId, objectiveSetId),
          eq(learningObjectives.ownerUserId, ownerUserId),
          eq(learningObjectives.projectId, projectId),
        ),
      );
    return rows.map((row) => row.id);
  }

  private async loadItems(
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

  private async loadItem(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
    itemId: Identifier,
  ): Promise<typeof lessonOutlineItems.$inferSelect | undefined> {
    const [row] = await executor
      .select()
      .from(lessonOutlineItems)
      .where(
        and(
          eq(lessonOutlineItems.id, itemId),
          eq(lessonOutlineItems.setId, setId),
          eq(lessonOutlineItems.ownerUserId, ownerUserId),
          eq(lessonOutlineItems.projectId, projectId),
        ),
      )
      .limit(1);
    return row;
  }

  private async loadLinks(
    executor: DatabaseExecutor,
    setId: Identifier,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<Array<typeof outlineObjectiveLinks.$inferSelect>> {
    const items = await this.loadItems(executor, setId, ownerUserId, projectId);
    if (items.length === 0) return [];
    return executor
      .select()
      .from(outlineObjectiveLinks)
      .where(
        and(
          eq(outlineObjectiveLinks.ownerUserId, ownerUserId),
          eq(outlineObjectiveLinks.projectId, projectId),
          inArray(
            outlineObjectiveLinks.outlineItemId,
            items.map((item) => item.id),
          ),
        ),
      );
  }

  private async mutableDraftSet(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    expectedRevision: number,
    timestamp: Date,
  ): Promise<OutlineSetRow> {
    const draft = await this.latestDraftRowForUpdate(
      executor,
      ownerUserId,
      projectId,
    );
    if (draft !== undefined) {
      if (draft.revision !== expectedRevision) throw outlineConflict();
      return draft;
    }
    const approved = await this.approvedSetRowForUpdate(
      executor,
      ownerUserId,
      projectId,
    );
    if (approved === undefined) throw outlineNothingToEdit();
    // Serialized on the approved row: after the lock is acquired, a competing
    // first-edit may have already cloned it into a draft revision.
    const latest = await this.latestDraftRow(executor, ownerUserId, projectId);
    if (latest !== undefined) {
      if (latest.revision !== expectedRevision) throw outlineConflict();
      return latest;
    }
    if (approved.revision !== expectedRevision) throw outlineConflict();
    return this.cloneApprovedToDraft(executor, approved, timestamp);
  }

  private async cloneApprovedToDraft(
    executor: DatabaseExecutor,
    approved: OutlineSetRow,
    timestamp: Date,
  ): Promise<OutlineSetRow> {
    const draftId = createId(timestamp);
    const draft: OutlineSetRow = {
      ...approved,
      id: draftId,
      status: "draft",
      revision: 0,
      idempotencyKey: `outline:revision:${approved.id}:${draftId}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      generatedAt: timestamp,
    };
    await executor.insert(lessonOutlineSets).values({
      id: draft.id,
      projectId: draft.projectId,
      ownerUserId: draft.ownerUserId,
      sourceSnapshotId: draft.sourceSnapshotId,
      sourceSnapshotContentHash: draft.sourceSnapshotContentHash,
      objectiveSetId: draft.objectiveSetId,
      objectiveSetContentHash: draft.objectiveSetContentHash,
      configurationVersion: draft.configurationVersion,
      promptId: draft.promptId,
      promptVersion: draft.promptVersion,
      model: draft.model,
      modelCallId: draft.modelCallId,
      status: draft.status,
      revision: draft.revision,
      idempotencyKey: draft.idempotencyKey,
      totalEstimatedSeconds: draft.totalEstimatedSeconds,
      generatedAt: draft.generatedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    });
    const items = await this.loadItems(
      executor,
      approved.id,
      approved.ownerUserId,
      approved.projectId,
    );
    if (items.length > 0) {
      const replacements = new Map<string, Identifier>();
      await executor.insert(lessonOutlineItems).values(
        items.map((item) => {
          const id = createId(timestamp);
          replacements.set(item.id, id);
          return {
            id,
            projectId: item.projectId,
            ownerUserId: item.ownerUserId,
            setId: draftId,
            order: item.order,
            kind: item.kind,
            title: item.title,
            description: item.description,
            estimatedSeconds: item.estimatedSeconds,
            sourceRefs: item.sourceRefs,
            framingNote: item.framingNote,
            generated: item.generated,
            revision: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
        }),
      );
      const links = await this.loadLinks(
        executor,
        approved.id,
        approved.ownerUserId,
        approved.projectId,
      );
      if (links.length > 0)
        await executor.insert(outlineObjectiveLinks).values(
          links.map((link) => {
            const outlineItemId = replacements.get(link.outlineItemId);
            if (outlineItemId === undefined)
              throw new Error(
                "A cloned outline link references a missing cloned item.",
              );
            return {
              id: createId(timestamp),
              projectId: link.projectId,
              ownerUserId: link.ownerUserId,
              outlineItemId,
              objectiveId: link.objectiveId,
              createdAt: timestamp,
              updatedAt: timestamp,
            };
          }),
        );
    }
    return draft;
  }

  private async recomputeTotal(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: OutlineSetRow,
    timestamp: Date,
  ): Promise<void> {
    const [row] = await executor
      .select({
        total: sql<number>`coalesce(sum(${lessonOutlineItems.estimatedSeconds}), 0)::int`,
      })
      .from(lessonOutlineItems)
      .where(
        and(
          eq(lessonOutlineItems.setId, set.id),
          eq(lessonOutlineItems.ownerUserId, ownerUserId),
          eq(lessonOutlineItems.projectId, projectId),
        ),
      );
    const [updated] = await executor
      .update(lessonOutlineSets)
      .set({
        totalEstimatedSeconds: row?.total ?? 0,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(lessonOutlineSets.id, set.id),
          eq(lessonOutlineSets.ownerUserId, ownerUserId),
          eq(lessonOutlineSets.projectId, projectId),
        ),
      )
      .returning({ id: lessonOutlineSets.id });
    if (updated === undefined) throw outlineConflict();
  }

  private async bumpSetRevision(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    set: OutlineSetRow,
    timestamp: Date,
  ): Promise<void> {
    const [updated] = await executor
      .update(lessonOutlineSets)
      .set({
        revision: sql`${lessonOutlineSets.revision} + 1`,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(lessonOutlineSets.id, set.id),
          eq(lessonOutlineSets.ownerUserId, ownerUserId),
          eq(lessonOutlineSets.projectId, projectId),
          eq(lessonOutlineSets.revision, set.revision),
        ),
      )
      .returning({ id: lessonOutlineSets.id });
    if (updated === undefined) throw outlineConflict();
  }

  private async renumberItems(
    executor: DatabaseExecutor,
    setId: Identifier,
    ownerUserId: Identifier,
    projectId: Identifier,
    timestamp: Date,
  ): Promise<void> {
    const rows = await executor
      .select({ id: lessonOutlineItems.id })
      .from(lessonOutlineItems)
      .where(
        and(
          eq(lessonOutlineItems.setId, setId),
          eq(lessonOutlineItems.ownerUserId, ownerUserId),
          eq(lessonOutlineItems.projectId, projectId),
        ),
      )
      .orderBy(lessonOutlineItems.order);
    await this.applyItemOrders(
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
   * `(set_id, order)` index: first every item in the set is moved to a
   * negated temporary order (still unique, but outside the positive range),
   * then each item receives its final positive order.
   */
  private async applyItemOrders(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
    setId: Identifier,
    orderedIds: readonly Identifier[],
    timestamp: Date,
  ): Promise<void> {
    await executor
      .update(lessonOutlineItems)
      .set({ order: sql`-${lessonOutlineItems.order}`, updatedAt: timestamp })
      .where(
        and(
          eq(lessonOutlineItems.setId, setId),
          eq(lessonOutlineItems.ownerUserId, ownerUserId),
          eq(lessonOutlineItems.projectId, projectId),
        ),
      );
    await Promise.all(
      orderedIds.map((itemId, index) =>
        executor
          .update(lessonOutlineItems)
          .set({ order: index + 1, updatedAt: timestamp })
          .where(
            and(
              eq(lessonOutlineItems.id, itemId),
              eq(lessonOutlineItems.setId, setId),
              eq(lessonOutlineItems.ownerUserId, ownerUserId),
              eq(lessonOutlineItems.projectId, projectId),
            ),
          ),
      ),
    );
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

  private async workingSetRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<OutlineSetRow | undefined> {
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
  ): Promise<OutlineSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(lessonOutlineSets)
      .where(
        and(
          eq(lessonOutlineSets.ownerUserId, ownerUserId),
          eq(lessonOutlineSets.projectId, projectId),
          eq(lessonOutlineSets.status, "draft"),
        ),
      )
      .orderBy(desc(lessonOutlineSets.generatedAt))
      .limit(1);
    return row;
  }

  private async approvedSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<OutlineSetRow | undefined> {
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

  private async latestDraftRowForUpdate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<OutlineSetRow | undefined> {
    const [row] = await executor
      .select()
      .from(lessonOutlineSets)
      .where(
        and(
          eq(lessonOutlineSets.ownerUserId, ownerUserId),
          eq(lessonOutlineSets.projectId, projectId),
          eq(lessonOutlineSets.status, "draft"),
        ),
      )
      .orderBy(desc(lessonOutlineSets.generatedAt))
      .limit(1)
      .for("update");
    return row;
  }

  private async approvedSetRowForUpdate(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<OutlineSetRow | undefined> {
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
      .limit(1)
      .for("update");
    return row;
  }

  private async latestApprovedSetRow(
    executor: DatabaseExecutor,
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<typeof learningObjectiveSets.$inferSelect | undefined> {
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

  private async assembleSet(row: OutlineSetRow): Promise<LessonOutlineSet> {
    const itemRows = await this.database
      .select()
      .from(lessonOutlineItems)
      .where(
        and(
          eq(lessonOutlineItems.setId, row.id),
          eq(lessonOutlineItems.ownerUserId, row.ownerUserId),
          eq(lessonOutlineItems.projectId, row.projectId),
        ),
      )
      .orderBy(lessonOutlineItems.order);
    const itemIds = itemRows.map((item) => item.id);
    const linkRows =
      itemIds.length === 0
        ? []
        : await this.database
            .select()
            .from(outlineObjectiveLinks)
            .where(
              and(
                eq(outlineObjectiveLinks.ownerUserId, row.ownerUserId),
                eq(outlineObjectiveLinks.projectId, row.projectId),
                inArray(outlineObjectiveLinks.outlineItemId, itemIds),
              ),
            );
    const linksByItem = new Map<string, string[]>();
    for (const link of linkRows) {
      const existing = linksByItem.get(link.outlineItemId) ?? [];
      existing.push(link.objectiveId);
      linksByItem.set(link.outlineItemId, existing);
    }
    return lessonOutlineSetSchema.parse({
      schemaVersion: 1,
      id: row.id,
      projectId: row.projectId,
      sourceSnapshotId: row.sourceSnapshotId,
      sourceSnapshotContentHash: row.sourceSnapshotContentHash,
      objectiveSetId: row.objectiveSetId,
      objectiveSetContentHash: row.objectiveSetContentHash,
      configurationVersion: row.configurationVersion,
      promptId: row.promptId,
      promptVersion: row.promptVersion,
      model: row.model,
      modelCallId: row.modelCallId,
      status: row.status,
      revision: row.revision,
      items: itemRows.map((item) => ({
        id: item.id,
        order: item.order,
        kind: item.kind,
        title: item.title,
        description: item.description,
        estimatedSeconds: item.estimatedSeconds,
        sourceRefs: item.sourceRefs as SourceRef[],
        objectiveIds: linksByItem.get(item.id) ?? [],
        framingNote: item.framingNote,
        generated: item.generated,
        revision: item.revision,
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
          eq(jobs.jobType, "outline.generate"),
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

function outlineSourceNotConfirmed(): PublicError {
  return new PublicError(
    "bad_request",
    "Confirm the reviewed source before generating the lesson outline.",
    409,
  );
}

function outlineObjectivesMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Approve learning objectives before generating the lesson outline.",
    409,
  );
}

function outlineConfigurationMissing(): PublicError {
  return new PublicError(
    "bad_request",
    "Save the lesson configuration before generating the lesson outline.",
    409,
  );
}

function outlineItemNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested outline item was not found.",
    404,
  );
}

function outlineConflict(): PublicError {
  return new PublicError(
    "bad_request",
    "The outline changed. Please refresh and try again.",
    409,
  );
}

function outlineNothingToEdit(): PublicError {
  return new PublicError(
    "bad_request",
    "Generate a lesson outline before editing.",
    409,
  );
}

function outlineNothingToApprove(): PublicError {
  return new PublicError(
    "bad_request",
    "There are no draft outline items to approve.",
    409,
  );
}

function outlineGenerationInFlight(): PublicError {
  return new PublicError(
    "bad_request",
    "An outline generation is in progress. Wait for it to finish before approving.",
    409,
  );
}

function atLeastOneOutlineItemRequired(): PublicError {
  return new PublicError(
    "bad_request",
    "At least one outline item is required before approving.",
    409,
  );
}

function outlineTooManyItems(): PublicError {
  return new PublicError(
    "bad_request",
    "The outline cannot exceed 20 items.",
    409,
  );
}

function outlineReorderMismatch(): PublicError {
  return new PublicError(
    "validation_failed",
    "Reordering must include every current outline item exactly once.",
    400,
    false,
    { itemIds: "Provide the complete set of current outline item ids." },
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

export type { OutlineGenerationParams };
