import {
  createId,
  PublicError,
  type Identifier,
} from "@avlp/config";
import {
  illustrationGenerationCandidates,
  jobs,
  outboxEvents,
  projectAssets,
  scenes,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  illustrationGenerationInputSchema,
  illustrationCandidateDecisionInputSchema,
  illustrationGenerationJobPayloadSchema,
  illustrationGenerationResponseSchema,
  lessonIllustrationGenerationResponseSchema,
  sceneAssetSlotRequirement,
  sceneSpecSchema,
  sceneTemplateSchema,
  visualRolePermits,
  type IllustrationCandidateBlockReason,
  type IllustrationGenerationResponse,
  type LessonIllustrationGenerationResponse,
  type VisualRole,
} from "@avlp/schemas";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

export const defaultMaximumIllustrationsPerHour = 10;

/** Shape of the persisted `scenes.asset_requirements` column. */
const sceneAssetRequirementsSchema = z.array(
  z.object({ slot: z.string().trim().min(1).max(64) }).passthrough(),
);

export type ContactSheetCandidate = {
  id: Identifier;
  jobId: Identifier | null;
  assetId: Identifier | null;
  assetReady: boolean;
  status: string;
  moderationStatus: string;
  provider: string;
  promptVersion: string;
  failureCode: string | null;
  costUsd: number | null;
  selectable: boolean;
  blockedReason: IllustrationCandidateBlockReason | null;
  blockedDetail: string | null;
};

export type ContactSheetResult = {
  scenes: {
    sceneId: Identifier;
    order: number;
    title: string | null;
    template: string;
    sceneRevision: number;
    slots: {
      slot: string;
      visualRole: VisualRole;
      visualRolePermits: string;
      required: boolean;
      candidates: ContactSheetCandidate[];
    }[];
  }[];
};

/**
 * Most recent candidates shown per slot in the contact sheet. Kept below the
 * DTO's `.max(100)` so response validation can never trip on an accumulated
 * history of regenerations.
 */
export const contactSheetCandidatesPerSlotLimit = 60;

/** Codes the worker records for a non-recoverable generation failure. */
const generationFailureCodes = new Set([
  "ILLUSTRATION_GENERATION_FAILED",
  "ILLUSTRATION_UNKNOWN_FAILURE",
  "INVALID_IMAGE_OUTPUT",
]);

/**
 * Deterministic mirror of the accept gate in `acceptIllustrationCandidate`: a
 * candidate is selectable only when it is awaiting review, moderation-approved,
 * and backed by a readable, correctly-dimensioned image. Any other state is
 * blocked with a stated reason rather than hidden.
 */
function selectability(input: {
  status: string;
  moderationStatus: string;
  failureCode: string | null;
  hasAsset: boolean;
  assetReady: boolean;
}): {
  selectable: boolean;
  blockedReason: IllustrationCandidateBlockReason | null;
  blockedDetail: string | null;
} {
  if (input.status === "accepted")
    return {
      selectable: false,
      blockedReason: "already_resolved",
      blockedDetail: "This illustration is already in use on the scene.",
    };
  if (input.status === "rejected")
    return {
      selectable: false,
      blockedReason: "already_resolved",
      blockedDetail: "You discarded this illustration.",
    };
  if (input.status === "queued" || input.status === "generating")
    return {
      selectable: false,
      blockedReason: "not_reviewable",
      blockedDetail: "Still generating. It will be ready to review shortly.",
    };
  if (input.status === "failed") {
    const isModeration =
      input.failureCode !== null &&
      !generationFailureCodes.has(input.failureCode);
    return isModeration
      ? {
          selectable: false,
          blockedReason: "moderation_rejected",
          blockedDetail:
            "Automated safety review rejected this image. Generate a new one.",
        }
      : {
          selectable: false,
          blockedReason: "generation_failed",
          blockedDetail:
            "Generation did not produce a usable image. Try generating again.",
        };
  }
  if (input.status === "pending_review") {
    // Moderation still running is a transient wait, not a failure: do not tell
    // the teacher to regenerate.
    if (input.moderationStatus === "pending")
      return {
        selectable: false,
        blockedReason: "not_reviewable",
        blockedDetail:
          "Waiting for the automated safety review to finish.",
      };
    if (
      input.moderationStatus !== "approved" ||
      !input.hasAsset ||
      !input.assetReady
    )
      return {
        selectable: false,
        blockedReason: "media_check_failed",
        blockedDetail:
          "This image failed an integrity check and cannot be used. Generate a new one.",
      };
    return { selectable: true, blockedReason: null, blockedDetail: null };
  }
  return {
    selectable: false,
    blockedReason: "not_reviewable",
    blockedDetail: null,
  };
}

/** Queues only bounded, explicitly requested scene illustration generation. */
export class IllustrationGenerationService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
    private readonly maximumIllustrationsPerHour = defaultMaximumIllustrationsPerHour,
  ) {}

  /**
   * Queue an illustration for every required asset slot in the lesson that has
   * no binding yet, so a teacher does not have to click through each scene.
   *
   * Each slot goes through `request` so the per-slot revision check, template
   * validation, idempotency key and rate-limit accounting stay identical to the
   * single-slot path. The hourly cap is typically lower than the number of
   * empty slots, so hitting it stops the run and is reported as `skipped`
   * rather than failing -- the already-queued work is real and worth keeping.
   */
  public async generateMissing(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
  }): Promise<LessonIllustrationGenerationResponse> {
    const sceneRows = await this.database
      .select({
        stableSceneId: scenes.stableSceneId,
        revision: scenes.revision,
        sceneJson: scenes.sceneJson,
        assetRequirements: scenes.assetRequirements,
        order: scenes.order,
      })
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
        ),
      )
      .orderBy(scenes.order);

    const missing: { sceneId: Identifier; slot: string; revision: number }[] =
      [];
    let guarded = 0;
    for (const row of sceneRows) {
      const parsed = sceneSpecSchema.safeParse(row.sceneJson);
      if (!parsed.success) continue;
      const bound = new Set(
        parsed.data.assetBindings.map((binding) => binding.slot),
      );
      // Enumerate the storyboard's own persisted requirements -- the exact set
      // the `asset_required` validation rule checks against. The template
      // defaults in requiredSceneAssetSlots() are a different, narrower notion
      // and would miss the slots the planner actually asked for.
      const requirements = sceneAssetRequirementsSchema.safeParse(
        row.assetRequirements,
      );
      if (!requirements.success) continue;
      for (const requirement of requirements.data) {
        if (bound.has(requirement.slot)) continue;
        // Interim guard ahead of ST-085. Bulk generation must never target a
        // grounding-critical slot: `diagram` carries the factual visual of a
        // labelled-diagram scene, so an invented illustration there would
        // stand in for content the learner is expected to trust. A slot the
        // template does not declare is guarded for the same reason -- its role
        // cannot be established here, and `request` rejects it anyway, which
        // would otherwise abort the whole run rather than skip one slot.
        const slotRequirement = sceneAssetSlotRequirement(
          parsed.data.template,
          requirement.slot,
        );
        if (
          slotRequirement === undefined ||
          slotRequirement.visualRole !== "decorative"
        ) {
          guarded += 1;
          continue;
        }
        missing.push({
          sceneId: row.stableSceneId as Identifier,
          slot: requirement.slot,
          revision: row.revision,
        });
      }
    }

    const requests: LessonIllustrationGenerationResponse["requests"] = [];
    let rateLimited = false;
    for (const entry of missing) {
      if (rateLimited) break;
      try {
        const queued = await this.request({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          sceneId: entry.sceneId,
          slot: entry.slot,
          correlationId: input.correlationId,
          body: {
            useCase: "conceptual-supporting-illustration",
            expectedSceneRevision: entry.revision,
            idempotencyKey: createId(this.now()),
          },
        });
        requests.push({
          sceneId: entry.sceneId,
          slot: entry.slot,
          candidateId: queued.candidateId,
          jobId: queued.jobId,
          status: "queued",
        });
      } catch (error: unknown) {
        if (error instanceof PublicError && error.code === "rate_limited") {
          rateLimited = true;
          break;
        }
        throw error;
      }
    }

    // Guarded slots are still missing an asset, so they count toward the total
    // the teacher is shown; they are reported as skipped rather than silently
    // dropped from it.
    const totalMissing = missing.length + guarded;
    return lessonIllustrationGenerationResponseSchema.parse({
      totalMissing,
      queued: requests.length,
      skipped: totalMissing - requests.length,
      rateLimited,
      requests,
    });
  }

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
      const requirement = sceneAssetSlotRequirement(
        sceneTemplateSchema.parse(scene.template),
        input.slot,
      );
      if (requirement === undefined)
        throw new PublicError(
          "validation_failed",
          "The asset slot is not supported by this scene.",
          400,
        );
      if (requirement.visualRole !== "decorative")
        throw new PublicError(
          "validation_failed",
          `Illustration generation is permitted only for decorative slots; ${scene.stableSceneId}/${input.slot} is ${requirement.visualRole}.`,
          400,
          false,
          { slot: "This slot requires a source-backed visual." },
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
          provider:
            process.env.TOGETHER_API_KEY?.trim() === undefined ||
            process.env.TOGETHER_API_KEY.trim().length === 0
              ? "mock-illustration"
              : "together",
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

  /**
   * ST-089: every illustration candidate for a project, grouped by scene and
   * slot, with the context a teacher needs to choose between them: the slot's
   * epistemic role and what it permits, provenance, persisted cost, moderation
   * status, and a deterministic `selectable` flag mirroring the accept gate.
   *
   * Tenant- and project-scoped on every table. Returns internal `assetId` and
   * `assetReady` so the caller can sign a preview URL through the existing
   * asset-access mechanism; the HTTP layer strips `assetId` before responding.
   */
  public async contactSheet(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<ContactSheetResult> {
    const sceneRows = await this.database
      .select({
        id: scenes.id,
        stableSceneId: scenes.stableSceneId,
        order: scenes.order,
        revision: scenes.revision,
        sceneJson: scenes.sceneJson,
      })
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
        ),
      )
      .orderBy(scenes.order);

    const candidateRows = await this.database
      .select({
        id: illustrationGenerationCandidates.id,
        sceneId: illustrationGenerationCandidates.sceneId,
        slot: illustrationGenerationCandidates.slot,
        assetId: illustrationGenerationCandidates.assetId,
        status: illustrationGenerationCandidates.status,
        moderationStatus: illustrationGenerationCandidates.moderationStatus,
        provider: illustrationGenerationCandidates.provider,
        promptVersion: illustrationGenerationCandidates.promptVersion,
        failureCode: illustrationGenerationCandidates.failureCode,
        createdAt: illustrationGenerationCandidates.createdAt,
        jobId: jobs.id,
        assetStatus: projectAssets.status,
        assetWidth: projectAssets.width,
        assetHeight: projectAssets.height,
        assetMediaType: projectAssets.mediaType,
        assetDeletedAt: projectAssets.deletedAt,
        estimatedCostUsd: usageRecords.estimatedCostUsd,
      })
      .from(illustrationGenerationCandidates)
      .leftJoin(
        jobs,
        and(
          eq(jobs.ownerUserId, illustrationGenerationCandidates.ownerUserId),
          eq(jobs.projectId, illustrationGenerationCandidates.projectId),
          eq(
            jobs.idempotencyKey,
            illustrationGenerationCandidates.idempotencyKey,
          ),
        ),
      )
      .leftJoin(
        projectAssets,
        and(
          eq(projectAssets.id, illustrationGenerationCandidates.assetId),
          eq(
            projectAssets.ownerUserId,
            illustrationGenerationCandidates.ownerUserId,
          ),
          eq(
            projectAssets.projectId,
            illustrationGenerationCandidates.projectId,
          ),
        ),
      )
      .leftJoin(
        usageRecords,
        and(
          eq(
            usageRecords.ownerUserId,
            illustrationGenerationCandidates.ownerUserId,
          ),
          eq(
            usageRecords.projectId,
            illustrationGenerationCandidates.projectId,
          ),
          sql`${usageRecords.idempotencyKey} = 'illustration:' || ${illustrationGenerationCandidates.id}`,
        ),
      )
      .where(
        and(
          eq(illustrationGenerationCandidates.ownerUserId, input.ownerUserId),
          eq(illustrationGenerationCandidates.projectId, input.projectId),
        ),
      )
      .orderBy(desc(illustrationGenerationCandidates.createdAt));

    const candidatesBySceneId = new Map<string, typeof candidateRows>();
    for (const row of candidateRows) {
      const list = candidatesBySceneId.get(row.sceneId) ?? [];
      list.push(row);
      candidatesBySceneId.set(row.sceneId, list);
    }

    const scenesOut: ContactSheetResult["scenes"] = [];
    for (const sceneRow of sceneRows) {
      const forScene = candidatesBySceneId.get(sceneRow.id) ?? [];
      if (forScene.length === 0) continue;
      const parsed = sceneSpecSchema.safeParse(sceneRow.sceneJson);
      const template = parsed.success
        ? parsed.data.template
        : sceneTemplateSchema.safeParse(
            (sceneRow.sceneJson as { template?: unknown })?.template,
          ).data;
      if (template === undefined) continue;

      const bySlot = new Map<string, typeof forScene>();
      for (const row of forScene) {
        const list = bySlot.get(row.slot) ?? [];
        list.push(row);
        bySlot.set(row.slot, list);
      }

      const slotsOut: ContactSheetResult["scenes"][number]["slots"] = [];
      for (const [slot, allRows] of bySlot) {
        const requirement = sceneAssetSlotRequirement(template, slot);
        const visualRole: VisualRole = requirement?.visualRole ?? "decorative";
        // `allRows` is newest-first (query orders by createdAt desc). A slot a
        // teacher has regenerated many times can exceed the DTO's per-slot cap;
        // show the most recent window rather than failing the whole sheet.
        const rows = allRows.slice(0, contactSheetCandidatesPerSlotLimit);
        slotsOut.push({
          slot,
          visualRole,
          visualRolePermits: visualRolePermits(visualRole),
          required: requirement?.required ?? false,
          candidates: rows.map((row) => {
            const assetReady =
              row.assetId !== null &&
              row.assetDeletedAt === null &&
              (row.assetStatus === "pending_review" ||
                row.assetStatus === "active") &&
              (row.assetWidth ?? 0) > 0 &&
              (row.assetHeight ?? 0) > 0 &&
              (row.assetMediaType ?? "").startsWith("image/");
            const { selectable, blockedReason, blockedDetail } =
              selectability({
                status: row.status,
                moderationStatus: row.moderationStatus,
                failureCode: row.failureCode,
                hasAsset: row.assetId !== null,
                assetReady,
              });
            return {
              id: row.id as Identifier,
              jobId: (row.jobId as Identifier | null) ?? null,
              assetId: (row.assetId as Identifier | null) ?? null,
              assetReady,
              status: row.status,
              moderationStatus: row.moderationStatus,
              provider: row.provider,
              promptVersion: row.promptVersion,
              failureCode: row.failureCode,
              costUsd:
                row.estimatedCostUsd === null
                  ? null
                  : Number(row.estimatedCostUsd),
              selectable,
              blockedReason,
              blockedDetail,
            };
          }),
        });
      }
      slotsOut.sort((left, right) => left.slot.localeCompare(right.slot));

      scenesOut.push({
        sceneId: sceneRow.stableSceneId as Identifier,
        order: sceneRow.order,
        title: parsed.success ? (parsed.data.title ?? null) : null,
        template,
        sceneRevision: sceneRow.revision,
        slots: slotsOut,
      });
    }

    return { scenes: scenesOut };
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
