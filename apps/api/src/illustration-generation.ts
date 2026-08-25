import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  illustrationGenerationCandidates,
  jobs,
  outboxEvents,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  illustrationGenerationInputSchema,
  illustrationCandidateDecisionInputSchema,
  illustrationGenerationJobPayloadSchema,
  illustrationGenerationResponseSchema,
  sceneAssetSlotRequirement,
  sceneTemplateSchema,
  type IllustrationGenerationResponse,
} from "@avlp/schemas";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export const defaultMaximumIllustrationsPerHour = 10;

/** Queues only bounded, explicitly requested scene illustration generation. */
export class IllustrationGenerationService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumIllustrationsPerHour = defaultMaximumIllustrationsPerHour,
  ) {}

  public async request(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    slot: string;
    body: unknown;
    correlationId: Identifier;
  }): Promise<IllustrationGenerationResponse> {
    const request = illustrationGenerationInputSchema.parse(input.body);
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(input.slot))
      throw new PublicError(
        "validation_failed",
        "The asset slot is invalid.",
        400,
      );
    const now = this.now();
    return this.database.transaction(async (transaction) => {
      const [scene] = await transaction
        .select({
          id: scenes.id,
          stableSceneId: scenes.stableSceneId,
          revision: scenes.revision,
          template: scenes.template,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.stableSceneId, input.sceneId),
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (scene === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      if (scene.revision !== request.expectedSceneRevision)
        throw new PublicError(
          "edit_conflict",
          "The scene changed. Refresh and try again.",
          409,
        );
      if (
        sceneAssetSlotRequirement(
          sceneTemplateSchema.parse(scene.template),
          input.slot,
        ) === undefined
      )
        throw new PublicError(
          "validation_failed",
          "The asset slot is not supported by this scene.",
          400,
        );
      const idempotencyKey = createIdempotencyKey({
        jobType: "illustration.generate",
        projectId: input.projectId,
        inputVersion: `${input.sceneId}:${scene.revision}:${input.slot}`,
        options: { requestKey: request.idempotencyKey },
      });
      const [existing] = await transaction
        .select({ id: illustrationGenerationCandidates.id })
        .from(illustrationGenerationCandidates)
        .where(
          and(
            eq(illustrationGenerationCandidates.ownerUserId, input.ownerUserId),
            eq(illustrationGenerationCandidates.projectId, input.projectId),
            eq(illustrationGenerationCandidates.sceneId, input.sceneId),
            eq(illustrationGenerationCandidates.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      const [usage] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(illustrationGenerationCandidates)
        .where(
          and(
            eq(illustrationGenerationCandidates.ownerUserId, input.ownerUserId),
            eq(illustrationGenerationCandidates.projectId, input.projectId),
            gte(
              illustrationGenerationCandidates.createdAt,
              new Date(now.getTime() - 60 * 60 * 1000),
            ),
          ),
        );
      if (
        existing === undefined &&
        (usage?.count ?? 0) >= this.maximumIllustrationsPerHour
      )
        throw new PublicError(
          "rate_limited",
          "This project has reached its illustration-generation limit.",
          429,
        );
      const candidateId = createId(now);
      const [candidate] = await transaction
        .insert(illustrationGenerationCandidates)
        .values({
          id: candidateId,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          sceneId: scene.id,
          slot: input.slot,
          status: "queued",
          promptVersion: "v1",
          provider: "mock-illustration",
          moderationStatus: "pending",
          idempotencyKey,
        })
        .onConflictDoNothing()
        .returning({ id: illustrationGenerationCandidates.id });
      const resolvedCandidateId =
        candidate?.id ??
        (
          await transaction
            .select({ id: illustrationGenerationCandidates.id })
            .from(illustrationGenerationCandidates)
            .where(
              and(
                eq(
                  illustrationGenerationCandidates.ownerUserId,
                  input.ownerUserId,
                ),
                eq(illustrationGenerationCandidates.projectId, input.projectId),
                eq(illustrationGenerationCandidates.sceneId, input.sceneId),
                eq(
                  illustrationGenerationCandidates.idempotencyKey,
                  idempotencyKey,
                ),
              ),
            )
            .limit(1)
        )[0]?.id;
      if (resolvedCandidateId === undefined)
        throw new Error("The illustration candidate could not be read.");
      const payload = illustrationGenerationJobPayloadSchema.parse({
        schemaVersion: 1,
        candidateId: resolvedCandidateId,
      });
      const envelope = createJobEnvelope(
        illustrationGenerationJobPayloadSchema,
        {
          jobId: createId(now),
          jobType: "illustration.generate",
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          inputVersion: `${input.sceneId}:${scene.revision}:${input.slot}`,
          idempotencyKey,
          correlationId: input.correlationId,
          payloadVersion: 1,
          payload,
          requestedAt: now,
        },
      );
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
                eq(jobs.idempotencyKey, idempotencyKey),
              ),
            )
            .limit(1)
        )[0]?.id;
      if (jobId === undefined)
        throw new Error("The illustration job could not be read.");
      if (created !== undefined)
        await transaction.insert(outboxEvents).values({
          id: createId(now),
          jobId,
          eventType: "illustration.generation.requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
      return illustrationGenerationResponseSchema.parse({
        candidateId: resolvedCandidateId,
        jobId,
        status: "queued",
      });
    });
  }

  /** Returns only the caller's candidates for a stable public scene ID. */
  public async list(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<
    readonly {
      id: Identifier;
      sceneId: Identifier;
      slot: string;
      assetId: Identifier | null;
      status: string;
      moderationStatus: string;
      provenance: "ai_generated";
    }[]
  > {
    const rows = await this.database
      .select({
        id: illustrationGenerationCandidates.id,
        stableSceneId: scenes.stableSceneId,
        slot: illustrationGenerationCandidates.slot,
        assetId: illustrationGenerationCandidates.assetId,
        status: illustrationGenerationCandidates.status,
        moderationStatus: illustrationGenerationCandidates.moderationStatus,
      })
      .from(illustrationGenerationCandidates)
      .innerJoin(
        scenes,
        eq(scenes.id, illustrationGenerationCandidates.sceneId),
      )
      .where(
        and(
          eq(illustrationGenerationCandidates.ownerUserId, input.ownerUserId),
          eq(illustrationGenerationCandidates.projectId, input.projectId),
          eq(scenes.stableSceneId, input.sceneId),
        ),
      )
      .orderBy(desc(illustrationGenerationCandidates.createdAt));
    return rows.map((row) => ({
      id: row.id as Identifier,
      sceneId: row.stableSceneId as Identifier,
      slot: row.slot,
      assetId: row.assetId as Identifier | null,
      status: row.status,
      moderationStatus: row.moderationStatus,
      provenance: "ai_generated" as const,
    }));
  }

  /** Rejection is an auditable state transition; generated media is retained. */
  public async reject(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    candidateId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<{ status: "rejected" }> {
    const request = illustrationCandidateDecisionInputSchema.parse(input.body);
    const timestamp = this.now();
    await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction
        .select({
          id: illustrationGenerationCandidates.id,
          sceneId: illustrationGenerationCandidates.sceneId,
        })
        .from(illustrationGenerationCandidates)
        .where(
          and(
            eq(illustrationGenerationCandidates.id, input.candidateId),
            eq(illustrationGenerationCandidates.ownerUserId, input.ownerUserId),
            eq(illustrationGenerationCandidates.projectId, input.projectId),
            eq(illustrationGenerationCandidates.status, "pending_review"),
          ),
        )
        .limit(1)
        .for("update");
      if (candidate === undefined) throw reviewableCandidateNotFound();
      const [scene] = await transaction
        .select({
          revision: scenes.revision,
          stableSceneId: scenes.stableSceneId,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.id, candidate.sceneId),
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (scene === undefined) throw reviewableCandidateNotFound();
      if (scene.revision !== request.expectedSceneRevision)
        throw new PublicError(
          "edit_conflict",
          "The scene changed. Refresh and try again.",
          409,
        );
      const [updated] = await transaction
        .update(illustrationGenerationCandidates)
        .set({ status: "rejected", updatedAt: timestamp })
        .where(
          and(
            eq(illustrationGenerationCandidates.id, candidate.id),
            eq(illustrationGenerationCandidates.status, "pending_review"),
          ),
        )
        .returning({ id: illustrationGenerationCandidates.id });
      if (updated === undefined)
        throw new PublicError(
          "edit_conflict",
          "The illustration was already reviewed. Refresh and try again.",
          409,
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "storyboard.scene_candidate_rejected",
        target: { type: "illustration_candidate", id: candidate.id },
        correlationId: input.correlationId,
        metadata: {
          sceneId: scene.stableSceneId,
          operation: "reject_ai_illustration",
        },
        occurredAt: timestamp,
      });
    });
    return { status: "rejected" };
  }
}

function reviewableCandidateNotFound(): PublicError {
  return new PublicError(
    "not_found",
    "The reviewable illustration was not found.",
    404,
  );
}
