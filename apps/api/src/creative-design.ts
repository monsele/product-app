import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  creativeDesignProposals,
  creativeDesignPresetVersions,
  creativeDesignPresets,
  creativeDesignSnapshots,
  jobs,
  outboxEvents,
  sourceSnapshots,
  lessonSpecs,
  projectAssets,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  canonicalCreativeDesignJson,
  createDefaultCreativeDesignManifest,
  creativeDesignCapability,
  creativeDesignHash,
  legacyCreativeDesignPlannerVersion,
  creativeDesignPlannerVersion,
  creativeDesignDraftInputSchema,
  creativeDesignApplyPresetInputSchema,
  creativeDesignManifestSchema,
  creativeDesignPlanInputSchema,
  creativeDesignNaturalLanguageInputSchema,
  creativeDesignPresetInputSchema,
  creativeDesignProposalPatchSchema,
  planCreativeDesign,
  treatmentFor,
  validateCreativeDesignManifest,
  type CreativeDesignManifest,
  type CreativeDesignProposalPatch,
  type CreativeDesignSceneType,
  modelCallJobPayloadSchema,
} from "@avlp/schemas";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import { lessonStoryboardSchema } from "@avlp/schemas";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

type Scope = Readonly<{ ownerUserId: Identifier; projectId: Identifier }>;
type StoryboardScene = Readonly<{
  id: string;
  template: string;
  durationSeconds: number;
  processShape?: "legacy" | "graph";
}>;

/** A provider is optional by design: unavailable interpretation leaves manual controls usable. */
export interface CreativeDesignService {
  getDraft(input: Scope): Promise<{
    revision: number;
    manifest: CreativeDesignManifest;
    eligibility: readonly string[];
  } | null>;
  plan(
    input: Scope & { body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }>;
  createOrUpdateDraft(
    input: Scope & { body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }>;
  alternatives(
    input: Scope & { sceneId: Identifier },
  ): Promise<readonly { treatmentId: string; description: string }[]>;
  apply(
    input: Scope & { expectedRevision: number },
  ): Promise<{ snapshotId: Identifier; manifestHash: string }>;
  savePreset(input: Scope & { body: unknown }): Promise<{
    presetId: Identifier;
    versionId: Identifier;
    versionNumber: number;
  }>;
  archivePreset(
    input: Scope & { presetId: Identifier; expectedRevision: number },
  ): Promise<void>;
  listPresets(input: Scope): Promise<
    readonly {
      id: Identifier;
      name: string;
      revision: number;
      versions: readonly { id: Identifier; versionNumber: number }[];
    }[]
  >;
  applyPreset(
    input: Scope & { presetId: Identifier; body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }>;
  describe(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<
    | {
        patch: CreativeDesignProposalPatch;
        unsupported: readonly string[];
        draftRevision: number;
      }
    | { jobId: Identifier; status: "queued" }
  >;
  describeStatus(input: Scope & { jobId: Identifier }): Promise<
    | {
        patch: CreativeDesignProposalPatch;
        unsupported: readonly string[];
        draftRevision: number;
      }
    | { status: "queued" | "running" | "retry_wait" | "failed" }
  >;
}

export {
  canonicalCreativeDesignJson,
  creativeDesignHash,
  createDefaultCreativeDesignManifest,
};

/**
 * ST-100 introduced additional scene treatments. A small number of mutable
 * pilot drafts were written with those treatments while still carrying the
 * previous planner label. Recover only that internally inconsistent state by
 * re-validating the unchanged manifest with the current planner identity.
 *
 * This deliberately does not broaden the legacy contract: a genuine ST-097
 * manifest with invalid current content still fails its original validation.
 */
export function parseStoredCreativeDesignManifest(
  value: unknown,
): CreativeDesignManifest {
  const parsed = creativeDesignManifestSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  if (
    typeof value === "object" &&
    value !== null &&
    "plannerVersion" in value &&
    value.plannerVersion === legacyCreativeDesignPlannerVersion
  ) {
    const recovered = creativeDesignManifestSchema.safeParse({
      ...(value as Record<string, unknown>),
      plannerVersion: creativeDesignPlannerVersion,
    });
    if (recovered.success) return recovered.data;
  }
  return creativeDesignManifestSchema.parse(value);
}

export class PostgresCreativeDesignService implements CreativeDesignService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getDraft(input: Scope): Promise<{
    revision: number;
    manifest: CreativeDesignManifest;
    eligibility: readonly string[];
  } | null> {
    const [draft] = await this.database
      .select()
      .from(creativeDesignDrafts)
      .where(
        and(
          eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
          eq(creativeDesignDrafts.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (draft === undefined) return null;
    const manifest = parseStoredCreativeDesignManifest(draft.manifest);
    const scenes = await this.storyboardScenes(
      this.database,
      input,
      draft.lessonSpecId,
    );
    return {
      revision: draft.revision,
      manifest,
      eligibility: creativeDesignCapability({
        approach: manifest.approach,
        scenes,
      }),
    };
  }

  public async plan(
    input: Scope & { body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }> {
    const command = parse(creativeDesignPlanInputSchema, input.body);
    const spec = await this.currentSpec(this.database, input);
    const scenes = await this.storyboardScenes(this.database, input, spec.id);
    const typedScenes = scenes.map((scene) => ({
      id: scene.id,
      template: scene.template as CreativeDesignSceneType,
      durationSeconds: scene.durationSeconds,
    }));
    const manifest = createDefaultCreativeDesignManifest({
      packId: command.packId,
      scenes: typedScenes,
    });
    return this.createOrUpdateDraft({
      ...input,
      body: { expectedRevision: command.expectedRevision, manifest },
    });
  }

  public async createOrUpdateDraft(
    input: Scope & { body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }> {
    const command = parse(creativeDesignDraftInputSchema, input.body);
    const now = this.now();
    return this.database.transaction(async (tx) => {
      const spec = await this.currentSpec(tx, input);
      const scenes = await this.storyboardScenes(tx, input, spec.id);
      let preservedSelections: ReturnType<typeof planCreativeDesign>;
      try {
        preservedSelections = planCreativeDesign({
          packId: command.manifest.pack.id,
          scenes: scenes.map((scene) => ({
            id: scene.id,
            template: scene.template as CreativeDesignSceneType,
            durationSeconds: scene.durationSeconds,
          })),
          locks: Object.fromEntries(
            Object.entries(command.manifest.selections)
              // Preserve every compatible teacher choice. A lock means that an
              // incompatible storyboard edit reports a conflict instead of
              // silently replacing it; an unlocked alternate remains a valid
              // explicit selection until the teacher asks to re-plan.
              .map(([sceneId, value]) => [sceneId, value.treatmentId]),
          ),
        });
      } catch {
        throw invalidDesign([
          "A saved layout no longer fits the edited scene. Choose a compatible layout; the saved design was not changed.",
        ]);
      }
      const manifest = creativeDesignManifestSchema.parse({
        ...command.manifest,
        selections: Object.fromEntries(
          Object.entries(preservedSelections).map(([sceneId, selection]) => [
            sceneId,
            {
              ...selection,
              locked: command.manifest.selections[sceneId]?.locked ?? false,
            },
          ]),
        ),
      });
      const issues = validateCreativeDesignManifest(manifest, scenes);
      if (issues.length > 0) throw invalidDesign(issues);
      await this.assertLogoOwnership(tx, input, manifest.settings.logoAssetId);
      const hash = creativeDesignHash(manifest);
      const [current] = await tx
        .select()
        .from(creativeDesignDrafts)
        .where(
          and(
            eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
            eq(creativeDesignDrafts.projectId, input.projectId),
            eq(creativeDesignDrafts.lessonSpecId, spec.id),
          ),
        )
        .limit(1)
        .for("update");
      if (current === undefined) {
        if (command.expectedRevision !== 0) throw editConflict();
        const [created] = await tx
          .insert(creativeDesignDrafts)
          .values({
            id: createId(now),
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            lessonSpecId: spec.id,
            lessonSpecRevision: spec.revision,
            manifest,
            manifestHash: hash,
            revision: 1,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (created === undefined) throw editConflict();
        return { revision: created.revision, manifest };
      }
      if (
        hasCreativeDesignDraftEditConflict({
          currentRevision: current.revision,
          expectedRevision: command.expectedRevision,
        })
      )
        throw editConflict();
      const [updated] = await tx
        .update(creativeDesignDrafts)
        .set({
          manifest,
          manifestHash: hash,
          lessonSpecRevision: spec.revision,
          revision: current.revision + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(creativeDesignDrafts.id, current.id),
            eq(creativeDesignDrafts.revision, current.revision),
            eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
          ),
        )
        .returning();
      if (updated === undefined) throw editConflict();
      return { revision: updated.revision, manifest };
    });
  }

  public async alternatives(
    input: Scope & { sceneId: Identifier },
  ): Promise<readonly { treatmentId: string; description: string }[]> {
    const draft = await this.getDraft(input);
    if (draft === null)
      throw new PublicError(
        "not_found",
        "Create a design draft before choosing another layout.",
        404,
      );
    const selected = draft.manifest.selections[input.sceneId];
    if (selected === undefined)
      throw new PublicError(
        "not_found",
        "This scene is not eligible for a creative layout.",
        404,
      );
    const chosen = treatmentFor(selected.treatmentId);
    return Object.freeze(
      ["primary", "alternate"].map((variant) => ({
        treatmentId: `${chosen.packId}.${chosen.sceneType}.${variant}`,
        description:
          variant === "primary"
            ? `Primary ${chosen.family} composition.`
            : "Alternative composition using the same factual content.",
      })),
    );
  }

  public async apply(
    input: Scope & { expectedRevision: number },
  ): Promise<{ snapshotId: Identifier; manifestHash: string }> {
    // A resolved design snapshot is a teacher's presentation decision, not a
    // render request. Validate its treatments and settings below, but leave
    // unrelated asset, narration, caption, and media readiness to the existing
    // render/approval preflight. This lets a teacher refine one scene's layout
    // while another scene is still being prepared.
    const now = this.now();
    return this.database.transaction(async (tx) => {
      const [draft] = await tx
        .select()
        .from(creativeDesignDrafts)
        .where(
          and(
            eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
            eq(creativeDesignDrafts.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (draft === undefined)
        throw new PublicError(
          "not_found",
          "No saved design draft exists.",
          404,
        );
      if (draft.revision !== input.expectedRevision) throw editConflict();
      const spec = await this.currentSpec(tx, input);
      if (
        spec.id !== draft.lessonSpecId ||
        spec.revision !== draft.lessonSpecRevision
      )
        throw editConflict();
      const manifest = parseStoredCreativeDesignManifest(draft.manifest);
      const manifestHash = creativeDesignHash(manifest);
      const scenes = await this.storyboardScenes(tx, input, spec.id);
      const issues = validateCreativeDesignManifest(manifest, scenes);
      if (issues.length > 0) throw invalidDesign(issues);
      await this.assertLogoOwnership(tx, input, manifest.settings.logoAssetId);
      const [snapshot] = await tx
        .insert(creativeDesignSnapshots)
        .values({
          id: createId(now),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          lessonSpecId: spec.id,
          lessonSpecRevision: spec.revision,
          manifest,
          manifestHash,
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [
            creativeDesignSnapshots.ownerUserId,
            creativeDesignSnapshots.projectId,
            creativeDesignSnapshots.lessonSpecId,
            creativeDesignSnapshots.lessonSpecRevision,
            creativeDesignSnapshots.manifestHash,
          ],
        })
        .returning();
      if (snapshot !== undefined)
        return {
          snapshotId: snapshot.id as Identifier,
          manifestHash: snapshot.manifestHash,
        };
      const [existing] = await tx
        .select()
        .from(creativeDesignSnapshots)
        .where(
          and(
            eq(creativeDesignSnapshots.ownerUserId, input.ownerUserId),
            eq(creativeDesignSnapshots.projectId, input.projectId),
            eq(creativeDesignSnapshots.lessonSpecId, spec.id),
            eq(creativeDesignSnapshots.lessonSpecRevision, spec.revision),
            eq(creativeDesignSnapshots.manifestHash, manifestHash),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error("Creative design snapshot was not persisted.");
      return {
        snapshotId: existing.id as Identifier,
        manifestHash: existing.manifestHash,
      };
    });
  }

  public async savePreset(input: Scope & { body: unknown }): Promise<{
    presetId: Identifier;
    versionId: Identifier;
    versionNumber: number;
  }> {
    const command = parse(creativeDesignPresetInputSchema, input.body);
    const now = this.now();
    const hash = creativeDesignHash(command.manifest);
    return this.database.transaction(async (tx) => {
      const spec = await this.currentSpec(tx, input);
      const issues = validateCreativeDesignManifest(
        command.manifest,
        await this.storyboardScenes(tx, input, spec.id),
      );
      if (issues.length > 0) throw invalidDesign(issues);
      await this.assertLogoOwnership(
        tx,
        input,
        command.manifest.settings.logoAssetId,
      );
      const [preset] = await tx
        .select()
        .from(creativeDesignPresets)
        .where(
          and(
            eq(creativeDesignPresets.ownerUserId, input.ownerUserId),
            eq(creativeDesignPresets.projectId, input.projectId),
            eq(creativeDesignPresets.name, command.name),
          ),
        )
        .limit(1)
        .for("update");
      if (preset !== undefined && preset.archivedAt !== null)
        throw new PublicError(
          "bad_request",
          "Archived personal styles cannot be edited. Save under a new name.",
          409,
        );
      if (
        preset !== undefined &&
        command.expectedRevision !== undefined &&
        preset.revision !== command.expectedRevision
      )
        throw editConflict();
      const active =
        preset === undefined
          ? (
              await tx
                .insert(creativeDesignPresets)
                .values({
                  id: createId(now),
                  ownerUserId: input.ownerUserId,
                  projectId: input.projectId,
                  name: command.name,
                  archivedAt: null,
                  revision: 1,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning()
            )[0]
          : (
              await tx
                .update(creativeDesignPresets)
                .set({ revision: preset.revision + 1, updatedAt: now })
                .where(
                  and(
                    eq(creativeDesignPresets.id, preset.id),
                    eq(creativeDesignPresets.ownerUserId, input.ownerUserId),
                    eq(creativeDesignPresets.revision, preset.revision),
                  ),
                )
                .returning()
            )[0];
      if (active === undefined)
        throw new Error("Personal style was not persisted.");
      const [latest] = await tx
        .select({ versionNumber: creativeDesignPresetVersions.versionNumber })
        .from(creativeDesignPresetVersions)
        .where(
          and(
            eq(creativeDesignPresetVersions.ownerUserId, input.ownerUserId),
            eq(creativeDesignPresetVersions.projectId, input.projectId),
            eq(creativeDesignPresetVersions.presetId, active.id),
          ),
        )
        .orderBy(desc(creativeDesignPresetVersions.versionNumber))
        .limit(1);
      const versionNumber = (latest?.versionNumber ?? 0) + 1;
      const [created] = await tx
        .insert(creativeDesignPresetVersions)
        .values({
          id: createId(new Date(now.getTime() + 1)),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          presetId: active.id,
          versionNumber,
          manifest: command.manifest,
          manifestHash: hash,
          createdAt: now,
        })
        .returning();
      if (created === undefined)
        throw new Error("Personal style version was not persisted.");
      return {
        presetId: active.id as Identifier,
        versionId: created.id as Identifier,
        versionNumber,
      };
    });
  }

  public async archivePreset(
    input: Scope & { presetId: Identifier; expectedRevision: number },
  ): Promise<void> {
    const [updated] = await this.database
      .update(creativeDesignPresets)
      .set({
        archivedAt: this.now(),
        revision: sql`${creativeDesignPresets.revision} + 1`,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(creativeDesignPresets.id, input.presetId),
          eq(creativeDesignPresets.ownerUserId, input.ownerUserId),
          eq(creativeDesignPresets.projectId, input.projectId),
          eq(creativeDesignPresets.revision, input.expectedRevision),
          isNull(creativeDesignPresets.archivedAt),
        ),
      )
      .returning({ id: creativeDesignPresets.id });
    if (updated === undefined) throw editConflict();
  }

  public async listPresets(input: Scope): Promise<
    readonly {
      id: Identifier;
      name: string;
      revision: number;
      versions: readonly { id: Identifier; versionNumber: number }[];
    }[]
  > {
    const presets = await this.database
      .select()
      .from(creativeDesignPresets)
      .where(
        and(
          eq(creativeDesignPresets.ownerUserId, input.ownerUserId),
          eq(creativeDesignPresets.projectId, input.projectId),
          isNull(creativeDesignPresets.archivedAt),
        ),
      )
      .orderBy(creativeDesignPresets.name);
    return Promise.all(
      presets.map(async (preset) => ({
        id: preset.id as Identifier,
        name: preset.name,
        revision: preset.revision,
        versions: (
          await this.database
            .select({
              id: creativeDesignPresetVersions.id,
              versionNumber: creativeDesignPresetVersions.versionNumber,
            })
            .from(creativeDesignPresetVersions)
            .where(
              and(
                eq(creativeDesignPresetVersions.ownerUserId, input.ownerUserId),
                eq(creativeDesignPresetVersions.projectId, input.projectId),
                eq(creativeDesignPresetVersions.presetId, preset.id),
              ),
            )
            .orderBy(desc(creativeDesignPresetVersions.versionNumber))
        ).map((version) => ({
          id: version.id as Identifier,
          versionNumber: version.versionNumber,
        })),
      })),
    );
  }

  public async applyPreset(
    input: Scope & { presetId: Identifier; body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }> {
    const command = parse(creativeDesignApplyPresetInputSchema, input.body);
    const [preset] = await this.database
      .select()
      .from(creativeDesignPresets)
      .where(
        and(
          eq(creativeDesignPresets.id, input.presetId),
          eq(creativeDesignPresets.ownerUserId, input.ownerUserId),
          eq(creativeDesignPresets.projectId, input.projectId),
          isNull(creativeDesignPresets.archivedAt),
        ),
      )
      .limit(1);
    if (preset === undefined)
      throw new PublicError(
        "not_found",
        "That personal style is unavailable.",
        404,
      );
    const versions = this.database
      .select()
      .from(creativeDesignPresetVersions)
      .where(
        and(
          eq(creativeDesignPresetVersions.presetId, preset.id),
          eq(creativeDesignPresetVersions.ownerUserId, input.ownerUserId),
          eq(creativeDesignPresetVersions.projectId, input.projectId),
          ...(command.versionId === undefined
            ? []
            : [eq(creativeDesignPresetVersions.id, command.versionId)]),
        ),
      )
      .orderBy(desc(creativeDesignPresetVersions.versionNumber))
      .limit(1);
    const [version] = await versions;
    if (version === undefined)
      throw new PublicError(
        "not_found",
        "That personal-style version is unavailable.",
        404,
      );
    const saved = creativeDesignManifestSchema.parse(version.manifest);
    return this.createOrUpdateDraft({
      ...input,
      body: {
        expectedRevision: command.expectedRevision,
        manifest: { ...saved, presetVersionId: version.id as Identifier },
      },
    });
  }

  public async describe(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<
    | {
        patch: CreativeDesignProposalPatch;
        unsupported: readonly string[];
        draftRevision: number;
      }
    | { jobId: Identifier; status: "queued" }
  > {
    const command = parse(creativeDesignNaturalLanguageInputSchema, input.body);
    const draft = await this.getDraft(input);
    if (draft === null || draft.revision !== command.expectedRevision)
      throw editConflict();
    return this.enqueueDescription(input, command, draft);
  }

  public async describeStatus(input: Scope & { jobId: Identifier }): Promise<
    | {
        patch: CreativeDesignProposalPatch;
        unsupported: readonly string[];
        draftRevision: number;
      }
    | { status: "queued" | "running" | "retry_wait" | "failed" }
  > {
    const [job] = await this.database
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.id, input.jobId),
          eq(jobs.ownerUserId, input.ownerUserId),
          eq(jobs.projectId, input.projectId),
          eq(jobs.jobType, "creative-design.interpret"),
        ),
      )
      .limit(1);
    if (job === undefined)
      throw new PublicError(
        "not_found",
        "That style proposal is unavailable.",
        404,
      );
    if (job.state !== "succeeded")
      return {
        status: job.state as "queued" | "running" | "retry_wait" | "failed",
      };
    const candidateId = (job.resultMetadata as { candidateId?: unknown } | null)
      ?.candidateId;
    if (typeof candidateId !== "string")
      throw new PublicError(
        "validation_failed",
        "The style proposal did not produce a safe result.",
        422,
      );
    const [proposal] = await this.database
      .select()
      .from(creativeDesignProposals)
      .where(
        and(
          eq(creativeDesignProposals.id, candidateId as Identifier),
          eq(creativeDesignProposals.ownerUserId, input.ownerUserId),
          eq(creativeDesignProposals.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (proposal === undefined)
      throw new PublicError(
        "not_found",
        "That style proposal is unavailable.",
        404,
      );
    const [currentDraft] = await this.database
      .select({ revision: creativeDesignDrafts.revision })
      .from(creativeDesignDrafts)
      .where(
        and(
          eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
          eq(creativeDesignDrafts.projectId, input.projectId),
        ),
      )
      .limit(1);
    // A provider result is a review suggestion for exactly the draft the
    // teacher submitted. Never merge it into a newer draft merely because the
    // asynchronous job completed later.
    if (
      currentDraft === undefined ||
      currentDraft.revision !== proposal.draftRevision
    )
      throw editConflict();
    return {
      patch: creativeDesignProposalPatchSchema.parse(proposal.patch),
      unsupported: z.array(z.string()).parse(proposal.unsupported),
      draftRevision: proposal.draftRevision,
    };
  }

  private async enqueueDescription(
    input: Scope & { correlationId: Identifier },
    command: z.infer<typeof creativeDesignNaturalLanguageInputSchema>,
    draft: NonNullable<
      Awaited<ReturnType<PostgresCreativeDesignService["getDraft"]>>
    >,
  ): Promise<{ jobId: Identifier; status: "queued" }> {
    const [draftRow] = await this.database
      .select()
      .from(creativeDesignDrafts)
      .where(
        and(
          eq(creativeDesignDrafts.ownerUserId, input.ownerUserId),
          eq(creativeDesignDrafts.projectId, input.projectId),
          eq(creativeDesignDrafts.revision, draft.revision),
        ),
      )
      .limit(1);
    const [source] = await this.database
      .select()
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, input.ownerUserId),
          eq(sourceSnapshots.projectId, input.projectId),
        ),
      )
      .orderBy(desc(sourceSnapshots.snapshotVersion))
      .limit(1);
    if (draftRow === undefined || source === undefined)
      throw new PublicError(
        "not_found",
        "An approved source snapshot is required before describing changes.",
        409,
      );
    const timestamp = this.now();
    const requestedJobId = createId(timestamp);
    const payload = modelCallJobPayloadSchema.parse({
      schemaVersion: 2,
      operationType: "ai.creative_design",
      sourceSnapshotId: source.id,
      promptId: "creative-design",
      promptVersion: "v1",
      model: "moonshotai/Kimi-K3",
      providerApproval: createModelCallProviderApproval({
        jobId: requestedJobId,
        model: "moonshotai/Kimi-K3",
      }),
      params: {
        draftId: draftRow.id,
        draftRevision: draftRow.revision,
        request: command.request,
      },
    });
    const inputVersion = `creative-design:${draftRow.id}:${draftRow.revision}:${creativeDesignHash(command.request)}:v1`;
    const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
      jobId: requestedJobId,
      jobType: "creative-design.interpret",
      projectId: input.projectId,
      ownerUserId: input.ownerUserId,
      inputVersion,
      idempotencyKey: createIdempotencyKey({
        jobType: "creative-design.interpret",
        projectId: input.projectId,
        inputVersion,
        options: {},
      }),
      correlationId: input.correlationId,
      payloadVersion: 2,
      payload,
      requestedAt: timestamp,
    });
    return this.database.transaction(async (tx) => {
      const [created] = await tx
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
      const jobId = (created?.id ??
        (
          await tx
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
        )[0]?.id) as Identifier | undefined;
      if (jobId === undefined)
        throw new Error(
          "Creative-design interpretation job could not be persisted.",
        );
      if (created !== undefined)
        await tx.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "creative_design.interpret_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
      return { jobId, status: "queued" as const };
    });
  }

  private async currentSpec(
    db: DatabaseExecutor,
    input: Scope,
  ): Promise<typeof lessonSpecs.$inferSelect> {
    const [draft] = await db
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, input.ownerUserId),
          eq(lessonSpecs.projectId, input.projectId),
          eq(lessonSpecs.status, "draft"),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1);
    if (draft !== undefined) return draft;
    const [approved] = await db
      .select()
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, input.ownerUserId),
          eq(lessonSpecs.projectId, input.projectId),
          eq(lessonSpecs.status, "approved"),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1);
    if (approved === undefined)
      throw new PublicError(
        "not_found",
        "No current storyboard is available for design.",
        404,
      );
    return approved;
  }
  private async storyboardScenes(
    db: DatabaseExecutor,
    input: Scope,
    lessonSpecId: string,
  ): Promise<readonly StoryboardScene[]> {
    const [row] = await db
      .select({ payload: lessonSpecs.payload })
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.id, lessonSpecId),
          eq(lessonSpecs.ownerUserId, input.ownerUserId),
          eq(lessonSpecs.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (row === undefined)
      throw new PublicError("not_found", "The storyboard is unavailable.", 404);
    const storyboard = lessonStoryboardSchema.parse(row.payload);
    return storyboard.scenes.map((entry) => ({
      id: entry.stableSceneId,
      template: entry.scene.template,
      durationSeconds: entry.scene.durationSeconds,
      ...(entry.scene.template !== "process"
        ? {}
        : {
            processShape:
              "nodes" in entry.scene.visual
                ? ("graph" as const)
                : ("legacy" as const),
          }),
    }));
  }

  private async assertLogoOwnership(
    db: DatabaseExecutor,
    input: Scope,
    logoAssetId: Identifier | null,
  ): Promise<void> {
    if (logoAssetId === null) return;
    const [asset] = await db
      .select({
        id: projectAssets.id,
        status: projectAssets.status,
        deletedAt: projectAssets.deletedAt,
      })
      .from(projectAssets)
      .where(
        and(
          eq(projectAssets.id, logoAssetId),
          eq(projectAssets.ownerUserId, input.ownerUserId),
          eq(projectAssets.projectId, input.projectId),
        ),
      )
      .limit(1);
    // ProjectAssetService promotes a safety-checked upload to `active`.
    // `available` is not a project-assets state, so accepting it here would
    // make every otherwise-valid logo impossible to apply.
    if (
      asset === undefined ||
      asset.deletedAt !== null ||
      asset.status !== "active"
    )
      throw invalidDesign([
        "The selected logo must be an approved asset owned by this project.",
      ]);
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}
function editConflict(): PublicError {
  return new PublicError(
    "edit_conflict",
    "The design changed while you were editing it. Refresh and try again.",
    409,
  );
}

/**
 * Lesson content revisions are revalidated and then recorded when a design is
 * saved. Only the design draft revision represents a competing design edit.
 */
export function hasCreativeDesignDraftEditConflict(input: {
  currentRevision: number;
  expectedRevision: number;
}): boolean {
  return input.currentRevision !== input.expectedRevision;
}
function invalidDesign(issues: readonly string[]): PublicError {
  return new PublicError(
    "validation_failed",
    "This lesson cannot use the selected creative style yet. Existing design remains unchanged.",
    422,
    false,
    Object.fromEntries(
      issues.map((issue, index) => [`issues.${index}`, issue]),
    ),
  );
}
