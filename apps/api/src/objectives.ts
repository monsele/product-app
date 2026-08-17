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
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentObjectiveGenerationCompatibility,
  learningObjectiveSetSchema,
  modelCallJobPayloadSchema,
  objectiveGenerationParamsSchema,
  objectiveGenerationResponseSchema,
  objectivesResponseSchema,
  type LearningObjectiveSet,
  type ObjectiveGenerationParams,
  type ObjectiveGenerationResponse,
  type ObjectivesResponse,
} from "@avlp/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
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
}

type ObjectiveSetRow = typeof learningObjectiveSets.$inferSelect;
type GenerationJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

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
    const [latestSet, latestJob, configuration, approval] = await Promise.all([
      this.latestSetRow(input.ownerUserId, input.projectId),
      this.latestGenerationJob(input.ownerUserId, input.projectId),
      this.loadConfiguration(this.database, input.ownerUserId, input.projectId),
      this.sourceApprovalStatus({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
      }),
    ]);
    const set =
      latestSet === undefined ? null : await this.assembleSet(latestSet);
    const generating =
      latestJob !== undefined &&
      (latestJob.state === "queued" ||
        latestJob.state === "running" ||
        latestJob.state === "retry_wait");
    const state: ObjectivesResponse["state"] = generating
      ? "generating"
      : set !== null
        ? "draft"
        : latestJob?.state === "failed"
          ? "failed"
          : "idle";
    return objectivesResponseSchema.parse({
      state,
      set,
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
    });
  }

  private async latestSetRow(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ObjectiveSetRow | undefined> {
    const [row] = await this.database
      .select()
      .from(learningObjectiveSets)
      .where(
        and(
          eq(learningObjectiveSets.ownerUserId, ownerUserId),
          eq(learningObjectiveSets.projectId, projectId),
        ),
      )
      .orderBy(desc(learningObjectiveSets.generatedAt))
      .limit(1);
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
      objectives: objectiveRows.map((objective) => ({
        id: objective.id,
        order: objective.order,
        statement: objective.statement,
        verb: objective.verb,
        confidence: objective.confidence,
        sourceRefs: objective.sourceRefs,
        generated: objective.generated,
        revision: objective.revision,
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
          sql`${projects.deletedAt} is null`,
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

export type { ObjectiveGenerationParams };
