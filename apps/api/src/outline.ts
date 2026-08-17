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
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentOutlineGenerationCompatibility,
  lessonOutlineSetSchema,
  modelCallJobPayloadSchema,
  outlineGenerationParamsSchema,
  outlineGenerationResponseSchema,
  outlineResponseSchema,
  type LessonOutlineSet,
  type OutlineGenerationParams,
  type OutlineGenerationResponse,
  type OutlineResponse,
  type SourceRef,
} from "@avlp/schemas";
import { and, desc, eq, inArray } from "drizzle-orm";
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
}

type OutlineSetRow = typeof lessonOutlineSets.$inferSelect;
type GenerationJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

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
            (objective.sourceRefs as SourceRef[]).flatMap((ref) => ref.blockIds),
          ),
        ),
      ];
      const params: OutlineGenerationParams = outlineGenerationParamsSchema.parse(
        {
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
        },
      );
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 1,
        operationType: "ai.outline",
        sourceSnapshotId: approval.snapshotId,
        promptId: currentOutlineGenerationCompatibility.promptId,
        promptVersion: currentOutlineGenerationCompatibility.promptVersion,
        model: currentOutlineGenerationCompatibility.model,
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
        jobId: createId(timestamp),
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
    const [workingRow, approvedRow, latestJob, configuration, approval, approvedSet] =
      await Promise.all([
        this.workingSetRow(input.ownerUserId, input.projectId),
        this.approvedSetRow(this.database, input.ownerUserId, input.projectId),
        this.latestGenerationJob(input.ownerUserId, input.projectId),
        this.loadConfiguration(this.database, input.ownerUserId, input.projectId),
        this.sourceApprovalStatus({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
        }),
        this.latestApprovedSetRow(this.database, input.ownerUserId, input.projectId),
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
    const state: OutlineResponse["state"] = generating
      ? "generating"
      : set === null
        ? latestJob?.state === "failed"
          ? "failed"
          : "idle"
        : set.status === "draft"
          ? "draft"
          : "approved";
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
        set.items.length >= 1,
    });
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

export type { OutlineGenerationParams };
