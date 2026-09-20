import { createHash } from "node:crypto";
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
  creativeDesignCapability,
  creativeDesignPlannerVersion,
  creativeDesignDraftInputSchema,
  creativeDesignApplyPresetInputSchema,
  creativeDesignManifestSchema,
  creativeDesignPlanInputSchema,
  creativeDesignNaturalLanguageInputSchema,
  creativeDesignPresetInputSchema,
  creativeDesignProposalPatchSchema,
  defaultCreativeDesignSettings,
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
import type { LessonValidationService } from "./lesson-validation.js";

type Scope = Readonly<{ ownerUserId: Identifier; projectId: Identifier }>;
type StoryboardScene = Readonly<{
  id: string;
  template: string;
  durationSeconds: number;
  processShape?: "legacy" | "graph";
}>;

export interface CreativeDesignCohort {
  enabled(): boolean;
  includes(userId: Identifier): boolean;
}

export function createEnvironmentCreativeDesignCohort(environment: {
  CREATIVE_DESIGN_PILOT_ENABLED?: boolean;
  CREATIVE_DESIGN_PILOT_USER_IDS?: string;
}): CreativeDesignCohort {
  const members = new Set(
    (environment.CREATIVE_DESIGN_PILOT_USER_IDS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  return {
    enabled: () => environment.CREATIVE_DESIGN_PILOT_ENABLED === true,
    includes: (userId) => members.has(userId.toLowerCase()),
  };
}

/** A provider is optional by design: unavailable interpretation leaves manual controls usable. */
export interface CreativeDesignService {
  getDraft(
    input: Scope,
  ): Promise<{
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
  savePreset(
    input: Scope & { body: unknown },
  ): Promise<{
    presetId: Identifier;
    versionId: Identifier;
    versionNumber: number;
  }>;
  archivePreset(
    input: Scope & { presetId: Identifier; expectedRevision: number },
  ): Promise<void>;
  listPresets(input: Scope): Promise<readonly {
    id: Identifier;
    name: string;
    revision: number;
    versions: readonly { id: Identifier; versionNumber: number }[];
  }[]>;
  applyPreset(
    input: Scope & { presetId: Identifier; body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }>;
  describe(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<{
    patch: CreativeDesignProposalPatch;
    unsupported: readonly string[];
    draftRevision: number;
  } | { jobId: Identifier; status: "queued" }>;
  describeStatus(input: Scope & { jobId: Identifier }): Promise<{
    patch: CreativeDesignProposalPatch;
    unsupported: readonly string[];
    draftRevision: number;
  } | { status: "queued" | "running" | "retry_wait" | "failed" }>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonical(nested)]),
    );
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error(
      "Creative design identity cannot contain a non-finite number.",
    );
  return value;
}
export function canonicalCreativeDesignJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
export function creativeDesignHash(value: unknown): string {
  return createHash("sha256")
    .update(canonicalCreativeDesignJson(value))
    .digest("hex");
}

export class PostgresCreativeDesignService implements CreativeDesignService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly cohort: CreativeDesignCohort = {
      enabled: () => false,
      includes: () => false,
    },
    private readonly validations?: LessonValidationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async getDraft(
    input: Scope,
  ): Promise<{
    revision: number;
    manifest: CreativeDesignManifest;
    eligibility: readonly string[];
  } | null> {
    this.assertPilot(input);
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
    const manifest = creativeDesignManifestSchema.parse(draft.manifest);
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
    this.assertPilot(input);
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
    this.assertPilot(input);
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
        current.revision !== command.expectedRevision ||
        current.lessonSpecRevision !== spec.revision
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
    this.assertPilot(input);
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
    this.assertPilot(input);
    // Design-specific validation below checks the resolved manifest. This
    // reuses the authoritative full-lesson preflight for assets, captions,
    // narration, source grounding, and semantic scene constraints before any
    // immutable design snapshot is written. It is safely idempotent by the
    // validation input hash and deliberately happens outside the snapshot tx.
    if (this.validations !== undefined) {
      const preflight = await this.validations.run({ ...input, body: {} });
      if (preflight.status !== "passed" || preflight.stale)
        throw invalidDesign(
          preflight.issues
            .filter((issue) => issue.severity === "error")
            .map((issue) => issue.message)
            .slice(0, 12)
            .concat(
              preflight.issues.some((issue) => issue.severity === "error")
                ? []
                : ["The full lesson preflight must pass before applying a design."],
            ),
        );
    }
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
      const manifest = creativeDesignManifestSchema.parse(draft.manifest);
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
          manifestHash: draft.manifestHash,
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
            eq(creativeDesignSnapshots.manifestHash, draft.manifestHash),
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

  public async savePreset(
    input: Scope & { body: unknown },
  ): Promise<{
    presetId: Identifier;
    versionId: Identifier;
    versionNumber: number;
  }> {
    this.assertPilot(input);
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
    this.assertPilot(input);
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

  public async listPresets(
    input: Scope,
  ): Promise<readonly {
    id: Identifier;
    name: string;
    revision: number;
    versions: readonly { id: Identifier; versionNumber: number }[];
  }[]> {
    this.assertPilot(input);
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
        versions: (await this.database
          .select({ id: creativeDesignPresetVersions.id, versionNumber: creativeDesignPresetVersions.versionNumber })
          .from(creativeDesignPresetVersions)
          .where(
            and(
              eq(creativeDesignPresetVersions.ownerUserId, input.ownerUserId),
              eq(creativeDesignPresetVersions.projectId, input.projectId),
              eq(creativeDesignPresetVersions.presetId, preset.id),
            ),
          )
          .orderBy(desc(creativeDesignPresetVersions.versionNumber)))
          .map((version) => ({ id: version.id as Identifier, versionNumber: version.versionNumber })),
      })),
    );
  }

  public async applyPreset(
    input: Scope & { presetId: Identifier; body: unknown },
  ): Promise<{ revision: number; manifest: CreativeDesignManifest }> {
    this.assertPilot(input);
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
      throw new PublicError("not_found", "That personal style is unavailable.", 404);
    const versions = this.database
      .select()
      .from(creativeDesignPresetVersions)
      .where(
        and(
          eq(creativeDesignPresetVersions.presetId, preset.id),
          eq(creativeDesignPresetVersions.ownerUserId, input.ownerUserId),
          eq(creativeDesignPresetVersions.projectId, input.projectId),
          ...(command.versionId === undefined ? [] : [eq(creativeDesignPresetVersions.id, command.versionId)]),
        ),
      )
      .orderBy(desc(creativeDesignPresetVersions.versionNumber))
      .limit(1);
    const [version] = await versions;
    if (version === undefined)
      throw new PublicError("not_found", "That personal-style version is unavailable.", 404);
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
  ): Promise<{
    patch: CreativeDesignProposalPatch;
    unsupported: readonly string[];
    draftRevision: number;
  } | { jobId: Identifier; status: "queued" }> {
    this.assertPilot(input);
    const command = parse(creativeDesignNaturalLanguageInputSchema, input.body);
    const draft = await this.getDraft(input);
    if (draft === null || draft.revision !== command.expectedRevision)
      throw editConflict();
    return this.enqueueDescription(input, command, draft);
  }

  public async describeStatus(input: Scope & { jobId: Identifier }): Promise<{
    patch: CreativeDesignProposalPatch;
    unsupported: readonly string[];
    draftRevision: number;
  } | { status: "queued" | "running" | "retry_wait" | "failed" }> {
    this.assertPilot(input);
    const [job] = await this.database.select().from(jobs).where(and(eq(jobs.id, input.jobId), eq(jobs.ownerUserId, input.ownerUserId), eq(jobs.projectId, input.projectId), eq(jobs.jobType, "creative-design.interpret"))).limit(1);
    if (job === undefined) throw new PublicError("not_found", "That style proposal is unavailable.", 404);
    if (job.state !== "succeeded") return { status: job.state as "queued" | "running" | "retry_wait" | "failed" };
    const candidateId = (job.resultMetadata as { candidateId?: unknown } | null)?.candidateId;
    if (typeof candidateId !== "string") throw new PublicError("validation_failed", "The style proposal did not produce a safe result.", 422);
    const [proposal] = await this.database.select().from(creativeDesignProposals).where(and(eq(creativeDesignProposals.id, candidateId as Identifier), eq(creativeDesignProposals.ownerUserId, input.ownerUserId), eq(creativeDesignProposals.projectId, input.projectId))).limit(1);
    if (proposal === undefined) throw new PublicError("not_found", "That style proposal is unavailable.", 404);
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
    if (currentDraft === undefined || currentDraft.revision !== proposal.draftRevision)
      throw editConflict();
    return { patch: creativeDesignProposalPatchSchema.parse(proposal.patch), unsupported: z.array(z.string()).parse(proposal.unsupported), draftRevision: proposal.draftRevision };
  }

  private async enqueueDescription(
    input: Scope & { correlationId: Identifier },
    command: z.infer<typeof creativeDesignNaturalLanguageInputSchema>,
    draft: NonNullable<Awaited<ReturnType<PostgresCreativeDesignService["getDraft"]>>>,
  ): Promise<{ jobId: Identifier; status: "queued" }> {
    const [draftRow] = await this.database.select().from(creativeDesignDrafts).where(and(eq(creativeDesignDrafts.ownerUserId, input.ownerUserId), eq(creativeDesignDrafts.projectId, input.projectId), eq(creativeDesignDrafts.revision, draft.revision))).limit(1);
    const [source] = await this.database.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.ownerUserId, input.ownerUserId), eq(sourceSnapshots.projectId, input.projectId))).orderBy(desc(sourceSnapshots.snapshotVersion)).limit(1);
    if (draftRow === undefined || source === undefined) throw new PublicError("not_found", "An approved source snapshot is required before describing changes.", 409);
    const timestamp = this.now();
    const requestedJobId = createId(timestamp);
    const payload = modelCallJobPayloadSchema.parse({ schemaVersion: 2, operationType: "ai.creative_design", sourceSnapshotId: source.id, promptId: "creative-design", promptVersion: "v1", model: "moonshotai/Kimi-K3", providerApproval: createModelCallProviderApproval({ jobId: requestedJobId, model: "moonshotai/Kimi-K3" }), params: { draftId: draftRow.id, draftRevision: draftRow.revision, request: command.request } });
    const inputVersion = `creative-design:${draftRow.id}:${draftRow.revision}:${creativeDesignHash(command.request)}:v1`;
    const envelope = createJobEnvelope(modelCallJobPayloadSchema, { jobId: requestedJobId, jobType: "creative-design.interpret", projectId: input.projectId, ownerUserId: input.ownerUserId, inputVersion, idempotencyKey: createIdempotencyKey({ jobType: "creative-design.interpret", projectId: input.projectId, inputVersion, options: {} }), correlationId: input.correlationId, payloadVersion: 2, payload, requestedAt: timestamp });
    return this.database.transaction(async (tx) => {
      const [created] = await tx.insert(jobs).values({ id: envelope.jobId, jobType: envelope.jobType, queueName: "pipeline", projectId: envelope.projectId, ownerUserId: envelope.ownerUserId, inputVersion: envelope.inputVersion, idempotencyKey: envelope.idempotencyKey, correlationId: envelope.correlationId, payloadVersion: envelope.payloadVersion, payload: envelope.payload }).onConflictDoNothing().returning({ id: jobs.id });
      const jobId = (created?.id ?? (await tx.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.ownerUserId, input.ownerUserId), eq(jobs.projectId, input.projectId), eq(jobs.idempotencyKey, envelope.idempotencyKey))).limit(1))[0]?.id) as Identifier | undefined;
      if (jobId === undefined) throw new Error("Creative-design interpretation job could not be persisted.");
      if (created !== undefined) await tx.insert(outboxEvents).values({ id: createId(timestamp), jobId, eventType: "creative_design.interpret_requested.v1", queueName: "pipeline", envelope, deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 } });
      return { jobId, status: "queued" as const };
    });
  }

  private assertPilot(input: Scope): void {
    if (!this.cohort.enabled() || !this.cohort.includes(input.ownerUserId))
      throw new PublicError(
        "not_found",
        "Creative design is not enabled for this account.",
        404,
      );
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
              "nodes" in entry.scene.visual ? ("graph" as const) : ("legacy" as const),
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
      .select({ id: projectAssets.id, status: projectAssets.status, deletedAt: projectAssets.deletedAt })
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
    if (asset === undefined || asset.deletedAt !== null || asset.status !== "active")
      throw invalidDesign([
        "The selected logo must be an approved asset owned by this project.",
      ]);
  }
}

export function createDefaultCreativeDesignManifest(
  input: Readonly<{
    packId: "essential" | "editorial" | "everyday";
    scenes: readonly Readonly<{
      id: string;
      template: CreativeDesignSceneType;
      durationSeconds: number;
    }>[];
  }>,
): CreativeDesignManifest {
  return creativeDesignManifestSchema.parse({
    manifestVersion: "1.0",
    plannerVersion: creativeDesignPlannerVersion,
    pack: { id: input.packId, version: "1.0.0" },
    approach: "standard",
    settings: defaultCreativeDesignSettings,
    selections: planCreativeDesign(input),
    presetVersionId: null,
  });
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
