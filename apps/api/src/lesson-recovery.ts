import { createHash } from "node:crypto";
import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  jobs,
  outboxEvents,
  lessonRecoveryRuns,
  lessonRecoveryTasks,
  lessonRecoverySignals,
  sceneAudio,
  voiceConfigurations,
  pronunciationEntries,
  oneShotRuns,
  projects,
  usageRecords,
  narrationSets,
  narrationBlocks,
  lessonPreparationGrants,
  lessonSpecs,
  illustrationGenerationCandidates,
  scenes,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  createJobEnvelope,
  defineJobHandler,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  lessonTimingRepairPayloadSchema,
  recoveryAdvancePayloadSchema,
  recoveryCommandSchema,
  recoveryStartSchema,
  recoveryEstimateSchema,
  type RecoveryEstimate,
  generationPreparationEstimateSchema,
  generationPreparationConsentSchema,
} from "@avlp/schemas";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { z } from "zod";
import {
  LessonReadinessService,
  type RecoveryScope,
} from "./lesson-readiness.js";
import type { LessonValidationService } from "./lesson-validation.js";
import { SceneAudioService, sceneAudioProvider } from "./scene-audio.js";
import type { OneShotPricing } from "./one-shot-budget.js";
import type { StoryboardService } from "./storyboard.js";
import type { GroundingService } from "./grounding.js";

type Run = typeof lessonRecoveryRuns.$inferSelect;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const money = (value: number) => Math.ceil(value * 1_000_000) / 1_000_000;
/** A consented generation that has not produced an enrollable draft by now never will. */
const generationGrantEnrollmentWindowMs = 24 * 60 * 60 * 1000;
const terminalTaskStates = ["succeeded", "failed", "cancelled", "superseded"];
const activeJob = (state: string | undefined) =>
  state !== undefined && ["queued", "running", "retry_wait"].includes(state);
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new PublicError(
      "validation_failed",
      "The preparation request is invalid.",
      400,
    );
  return result.data;
}
export interface LessonRecoveryApi {
  generationEstimate?(scope: RecoveryScope): Promise<unknown>;
  generatePrepared?(
    input: RecoveryScope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<unknown>;
  estimate(scope: RecoveryScope): Promise<RecoveryEstimate>;
  start(
    input: RecoveryScope & { body: unknown; correlationId: Identifier },
  ): Promise<unknown>;
  stop(input: RecoveryScope & { body: unknown }): Promise<unknown>;
}

/** Durable orchestration only. Provider work remains in existing pipeline jobs. */
export class LessonRecoveryService implements LessonRecoveryApi {
  constructor(
    private readonly database: DatabaseClient,
    private readonly readiness: LessonReadinessService,
    private readonly validation: LessonValidationService,
    private readonly audio: SceneAudioService,
    private readonly pricing: OneShotPricing,
    private readonly now: () => Date = () => new Date(),
    private readonly integrations: {
      storyboard?: Pick<StoryboardService, "generate">;
      grounding?: Pick<GroundingService, "check">;
    } = {},
  ) {}

  private assertEnabled() {
    if (!this.readiness.enabled)
      throw new PublicError(
        "not_found",
        "Lesson preparation is unavailable.",
        404,
      );
  }

  async generationEstimate(
    scope: RecoveryScope,
    executor: DatabaseExecutor = this.database,
  ) {
    if (!this.readiness.enabled)
      return generationPreparationEstimateSchema.parse({
        enabled: false,
        fingerprint: "0".repeat(64),
        maximumCostUsd: 0,
      });
    const [set] = await executor
      .select()
      .from(narrationSets)
      .where(
        and(
          eq(narrationSets.ownerUserId, scope.ownerUserId),
          eq(narrationSets.projectId, scope.projectId),
          sql`${narrationSets.status} in ('draft','approved')`,
        ),
      )
      .orderBy(
        sql`case when ${narrationSets.status} = 'draft' then 0 else 1 end`,
        desc(narrationSets.generatedAt),
      )
      .limit(1);
    if (!set)
      throw new PublicError(
        "not_found",
        "Prepare narration before generating a storyboard.",
        404,
      );
    const blocks = await executor
      .select()
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.ownerUserId, scope.ownerUserId),
          eq(narrationBlocks.projectId, scope.projectId),
          eq(narrationBlocks.setId, set.id),
        ),
      )
      .orderBy(narrationBlocks.order);
    const audio =
      3 *
      ((blocks.reduce((sum, block) => sum + block.text.length, 0) / 1_000_000) *
        this.pricing.ttsCostUsdPerMillionCharacters +
        blocks.length * this.pricing.alignmentCostUsdPerAudioMinute);
    return generationPreparationEstimateSchema.parse({
      enabled: true,
      fingerprint: digest({
        set: set.id,
        revision: set.revision,
        blocks: blocks.map((block) => [block.id, block.revision, block.text]),
        pricing: this.pricing,
      }),
      maximumCostUsd: money(
        audio +
          3 * this.pricing.modelCallCostUsd +
          3 * blocks.length * this.pricing.imageCostUsd,
      ),
    });
  }

  async generatePrepared(
    input: RecoveryScope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ) {
    this.assertEnabled();
    const consent = parse(generationPreparationConsentSchema, input.body);
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 160)
      throw new PublicError(
        "validation_failed",
        "A generation request key is required.",
        400,
      );
    const grant = await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const [existing] = await tx
        .select()
        .from(lessonPreparationGrants)
        .where(
          and(
            eq(lessonPreparationGrants.ownerUserId, input.ownerUserId),
            eq(lessonPreparationGrants.projectId, input.projectId),
            eq(lessonPreparationGrants.idempotencyKey, input.idempotencyKey!),
          ),
        );
      if (existing) return existing;
      const estimate = await this.generationEstimate(input, tx);
      if (
        consent.estimateFingerprint !== estimate.fingerprint ||
        consent.acceptedMaximumCostUsd !== estimate.maximumCostUsd
      )
        throw new PublicError(
          "edit_conflict",
          "Narration or pricing changed. Review the preparation estimate again.",
          409,
        );
      const [created] = await tx
        .insert(lessonPreparationGrants)
        .values({
          id: createId(),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          idempotencyKey: input.idempotencyKey!,
          fingerprint: estimate.fingerprint,
          allowanceUsd: String(estimate.maximumCostUsd),
          correlationId: input.correlationId,
        })
        .returning();
      return created!;
    });
    if (grant.stoppedAt)
      throw new PublicError(
        "edit_conflict",
        "This preparation request was stopped. Start a new request to continue.",
        409,
      );
    return this.dispatchGeneration(grant);
  }

  private async dispatchGeneration(
    grant: typeof lessonPreparationGrants.$inferSelect,
  ) {
    if (!this.integrations.storyboard)
      throw new PublicError(
        "internal_error",
        "Storyboard generation is unavailable.",
        503,
      );
    if (grant.jobId)
      return { jobId: grant.jobId as Identifier, status: "queued" as const };
    const [project] = await this.database
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.id, grant.projectId),
          eq(projects.ownerUserId, grant.ownerUserId),
          isNull(projects.deletedAt),
        ),
      );
    if (!project)
      throw new PublicError(
        "not_found",
        "The project is no longer available.",
        404,
      );
    const estimate = await this.generationEstimate({
      ownerUserId: grant.ownerUserId as Identifier,
      projectId: grant.projectId as Identifier,
    });
    if (estimate.fingerprint !== grant.fingerprint)
      throw new PublicError(
        "edit_conflict",
        "Narration changed before generation started. Review a new preparation estimate.",
        409,
      );
    const response = await this.integrations.storyboard.generate({
      ownerUserId: grant.ownerUserId as Identifier,
      projectId: grant.projectId as Identifier,
      correlationId: grant.correlationId as Identifier,
      idempotencyKey: grant.idempotencyKey,
    });
    await this.database
      .update(lessonPreparationGrants)
      .set({ jobId: response.jobId, updatedAt: this.now() })
      .where(eq(lessonPreparationGrants.id, grant.id));
    return response;
  }

  private async enrollGenerationGrants() {
    // Least recently checked first: a waiting grant moves to the back of the
    // queue, so grants that cannot enroll yet never starve the others.
    const grants = await this.database
      .select()
      .from(lessonPreparationGrants)
      .where(
        and(
          isNull(lessonPreparationGrants.runId),
          isNull(lessonPreparationGrants.stoppedAt),
        ),
      )
      .orderBy(lessonPreparationGrants.updatedAt)
      .limit(100);
    for (const grant of grants) {
      try {
        await this.enrollGenerationGrant(grant);
      } catch {
        // Unexpected failures are transient here; other projects still drain.
        await this.touchGrant(grant.id);
      }
    }
  }

  private async touchGrant(id: string) {
    await this.database
      .update(lessonPreparationGrants)
      .set({ updatedAt: this.now() })
      .where(eq(lessonPreparationGrants.id, id));
  }

  private async enrollGenerationGrant(
    grant: typeof lessonPreparationGrants.$inferSelect,
  ) {
    if (
      grant.createdAt.getTime() <
      this.now().getTime() - generationGrantEnrollmentWindowMs
    ) {
      await this.database
        .update(lessonPreparationGrants)
        .set({ stoppedAt: this.now(), updatedAt: this.now() })
        .where(eq(lessonPreparationGrants.id, grant.id));
      return;
    }
    if (!grant.jobId) {
      try {
        await this.dispatchGeneration(grant);
      } catch (error) {
        if (!(error instanceof PublicError)) throw error;
        // Rate limits and outages leave the paid consent pending for retry.
        if (error.statusCode === 429 || error.statusCode >= 500) {
          await this.touchGrant(grant.id);
          return;
        }
        await this.database
          .update(lessonPreparationGrants)
          .set({ stoppedAt: this.now() })
          .where(eq(lessonPreparationGrants.id, grant.id));
      }
      return;
    }
    // Resolves true once the grant is enrolled or stopped, false while it waits.
    const resolved = await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${grant.projectId}))`,
      );
      const stop = async () => {
        await tx
          .update(lessonPreparationGrants)
          .set({ stoppedAt: this.now() })
          .where(eq(lessonPreparationGrants.id, grant.id));
        return true;
      };
      const [fresh] = await tx
        .select()
        .from(lessonPreparationGrants)
        .where(eq(lessonPreparationGrants.id, grant.id))
        .for("update");
      if (!fresh || fresh.runId || fresh.stoppedAt) return true;
      const [job] = await tx
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, grant.jobId!),
            eq(jobs.ownerUserId, grant.ownerUserId),
            eq(jobs.projectId, grant.projectId),
          ),
        );
      if (!job || activeJob(job.state)) return false;
      const result = z
        .object({ candidateId: z.string().uuid() })
        .safeParse(job.resultMetadata);
      if (job.state !== "succeeded" || !result.success) return stop();
      const [spec] = await tx
        .select()
        .from(lessonSpecs)
        .where(
          and(
            eq(lessonSpecs.id, result.data.candidateId),
            eq(lessonSpecs.ownerUserId, grant.ownerUserId),
            eq(lessonSpecs.projectId, grant.projectId),
          ),
        );
      if (!spec) return false;
      // Only a draft can be prepared, and a spec never returns to draft.
      if (spec.status !== "draft") return stop();
      const current = await this.readiness.currentSpec(
        {
          ownerUserId: grant.ownerUserId as Identifier,
          projectId: grant.projectId as Identifier,
        },
        tx,
      );
      if (current.row.id !== spec.id) return stop();
      const [active] = await tx
        .select()
        .from(lessonRecoveryRuns)
        .where(
          and(
            eq(lessonRecoveryRuns.ownerUserId, grant.ownerUserId),
            eq(lessonRecoveryRuns.projectId, grant.projectId),
            isNull(lessonRecoveryRuns.stoppedAt),
          ),
        )
        .for("update");
      if (this.leaseHeld(active)) return false;
      const [run] = active
        ? await tx
            .update(lessonRecoveryRuns)
            .set({
              lessonSpecId: spec.id,
              revision: spec.revision,
              state: "queued",
              failureCode: null,
              allowanceUsd: String(
                money(Number(active.allowanceUsd) + Number(grant.allowanceUsd)),
              ),
            })
            .where(eq(lessonRecoveryRuns.id, active.id))
            .returning()
        : await tx
            .insert(lessonRecoveryRuns)
            .values({
              id: createId(),
              ownerUserId: grant.ownerUserId,
              projectId: grant.projectId,
              lessonSpecId: spec.id,
              revision: spec.revision,
              idempotencyKey: `generation:${grant.id}`,
              allowanceUsd: grant.allowanceUsd,
              correlationId: grant.correlationId,
              authorizationRequests: {
                [grant.idempotencyKey]: grant.fingerprint,
              },
            })
            .returning();
      await tx
        .update(lessonPreparationGrants)
        .set({ runId: run!.id, updatedAt: this.now() })
        .where(eq(lessonPreparationGrants.id, grant.id));
      await this.schedule(tx, run!, run!.sequence, 0);
      return true;
    });
    if (!resolved) await this.touchGrant(grant.id);
  }

  /** A crashed coordinator's lease expires; only a live lease defers work. */
  private leaseHeld(run: Run | undefined) {
    return (
      run?.leaseUntil !== null &&
      run?.leaseUntil !== undefined &&
      run.leaseUntil.getTime() > this.now().getTime()
    );
  }

  async oneShotState(
    scope: RecoveryScope,
  ): Promise<
    "available" | "preparing" | "complete" | "needs_action" | undefined
  > {
    if (!this.readiness.enabled) return undefined;
    const [generation] = await this.database
      .select()
      .from(oneShotRuns)
      .where(
        and(
          eq(oneShotRuns.ownerUserId, scope.ownerUserId),
          eq(oneShotRuns.projectId, scope.projectId),
        ),
      )
      .orderBy(desc(oneShotRuns.createdAt))
      .limit(1);
    if (!generation?.preparationAuthorized) return undefined;
    const [run] = await this.database
      .select()
      .from(lessonRecoveryRuns)
      .where(
        and(
          eq(lessonRecoveryRuns.ownerUserId, scope.ownerUserId),
          eq(lessonRecoveryRuns.projectId, scope.projectId),
          eq(lessonRecoveryRuns.oneShotRunId, generation.id),
        ),
      )
      .orderBy(desc(lessonRecoveryRuns.createdAt))
      .limit(1);
    if (!run) return "available";
    if (run.stoppedAt) return "needs_action";
    if (["queued", "running", "retry_wait"].includes(run.state))
      return "preparing";
    const readiness = await this.readiness.read(scope);
    return readiness.tasks.some(
      (task) =>
        ["audio", "captions", "timing", "asset"].includes(task.operation) &&
        !["succeeded", "superseded", "cancelled"].includes(task.state),
    )
      ? "needs_action"
      : "complete";
  }

  /** Transfer a bounded portion of the already-confirmed video cap, never a new grant. */
  async prepareOneShot(
    input: RecoveryScope & { oneShotRunId: Identifier },
  ): Promise<boolean> {
    if (!this.readiness.enabled) return false;
    const estimate = await this.estimate(input);
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const [generation] = await tx
        .select()
        .from(oneShotRuns)
        .where(
          and(
            eq(oneShotRuns.id, input.oneShotRunId),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
          ),
        )
        .for("update");
      if (
        !generation?.preparationAuthorized ||
        generation.capUsd === null ||
        generation.status === "cancelled"
      )
        throw new PublicError(
          "edit_conflict",
          "Confirm a preparation allowance before continuing.",
          409,
        );
      const [existing] = await tx
        .select()
        .from(lessonRecoveryRuns)
        .where(
          and(
            eq(lessonRecoveryRuns.ownerUserId, input.ownerUserId),
            eq(lessonRecoveryRuns.projectId, input.projectId),
            or(
              eq(lessonRecoveryRuns.oneShotRunId, generation.id),
              isNull(lessonRecoveryRuns.stoppedAt),
            ),
          ),
        )
        .orderBy(desc(lessonRecoveryRuns.createdAt))
        .limit(1)
        .for("update");
      if (existing) {
        // Switching workflows reuses the session. A stopped session requires an
        // explicit preparation command; a runner tick is not new authorization.
        if (!existing.stoppedAt && existing.oneShotRunId !== generation.id)
          await tx
            .update(lessonRecoveryRuns)
            .set({ oneShotRunId: generation.id })
            .where(eq(lessonRecoveryRuns.id, existing.id));
        return;
      }
      const current = await this.readiness.currentSpec(input, tx);
      if (current.row.revision !== estimate.revision)
        throw new PublicError(
          "edit_conflict",
          "The lesson changed while preparation was estimated.",
          409,
        );
      const [usage] = await tx
        .select({
          total: sql<string>`coalesce(sum(${usageRecords.estimatedCostUsd}), 0)`,
        })
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.ownerUserId, input.ownerUserId),
            eq(usageRecords.projectId, input.projectId),
            eq(usageRecords.correlationId, generation.correlationId),
          ),
        );
      const allocation = Math.max(
        0,
        Math.min(
          estimate.maximumCostUsd,
          money(
            Number(generation.capUsd) -
              Number(generation.preparationAllowanceUsd) -
              Number(usage?.total ?? 0),
          ),
        ),
      );
      await tx
        .update(oneShotRuns)
        .set({
          preparationAllowanceUsd: String(
            money(Number(generation.preparationAllowanceUsd) + allocation),
          ),
        })
        .where(eq(oneShotRuns.id, generation.id));
      const [run] = await tx
        .insert(lessonRecoveryRuns)
        .values({
          id: createId(),
          ...input,
          lessonSpecId: current.row.id,
          revision: current.row.revision,
          idempotencyKey: `oneshot:${generation.id}`,
          allowanceUsd: String(allocation),
          correlationId: createId(),
          authorizationRequests: {
            [`oneshot:${generation.id}`]: estimate.fingerprint,
          },
        })
        .returning();
      await this.schedule(tx, run!, 0, 0);
    });
    return true;
  }

  /** Free durable notification delivery; it neither grants nor expands authority. */
  async drainSignals(): Promise<number> {
    if (!this.readiness.enabled) return 0;
    await this.enrollGenerationGrants();
    const candidates = await this.database
      .select()
      .from(lessonRecoverySignals)
      .where(
        sql`${lessonRecoverySignals.changedAt} <= ${new Date(this.now().getTime() - 2000).toISOString()}`,
      )
      .orderBy(lessonRecoverySignals.changedAt)
      .limit(100);
    let scheduled = 0;
    for (const candidate of candidates) {
      scheduled += await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${candidate.projectId}))`,
        );
        const [run] = await tx
          .select()
          .from(lessonRecoveryRuns)
          .where(
            and(
              eq(lessonRecoveryRuns.ownerUserId, candidate.ownerUserId),
              eq(lessonRecoveryRuns.projectId, candidate.projectId),
              isNull(lessonRecoveryRuns.stoppedAt),
            ),
          )
          .for("update");
        // A running coordinator may have already read its inputs. Leave the
        // notification for its successor rather than losing that concurrent edit.
        if (this.leaseHeld(run)) return 0;
        const consumed = await tx
          .delete(lessonRecoverySignals)
          .where(
            and(
              eq(lessonRecoverySignals.ownerUserId, candidate.ownerUserId),
              eq(lessonRecoverySignals.projectId, candidate.projectId),
              eq(lessonRecoverySignals.changedAt, candidate.changedAt),
            ),
          )
          .returning();
        if (!consumed.length || !run) return 0;
        await tx
          .update(lessonRecoveryRuns)
          .set({ state: "queued", updatedAt: this.now() })
          .where(eq(lessonRecoveryRuns.id, run.id));
        await this.schedule(tx, run, run.sequence, 0);
        return 1;
      });
    }
    return scheduled;
  }

  private async inputs(scope: RecoveryScope) {
    const current = await this.readiness.currentSpec(scope);
    const [voice] = await this.database
      .select()
      .from(voiceConfigurations)
      .where(
        and(
          eq(voiceConfigurations.ownerUserId, scope.ownerUserId),
          eq(voiceConfigurations.projectId, scope.projectId),
        ),
      );
    const overrides = voice
      ? await this.database
          .select({
            phrase: pronunciationEntries.phrase,
            replacement: pronunciationEntries.replacement,
          })
          .from(pronunciationEntries)
          .where(eq(pronunciationEntries.voiceConfigurationId, voice.id))
      : [];
    const voiceHash = voice
      ? digest({
          voiceId: voice.voiceId,
          speakingRate: voice.speakingRate,
          overrides: overrides.sort((a, b) => a.phrase.localeCompare(b.phrase)),
        })
      : null;
    const audioRows = await this.database
      .select()
      .from(sceneAudio)
      .where(
        and(
          eq(sceneAudio.ownerUserId, scope.ownerUserId),
          eq(sceneAudio.projectId, scope.projectId),
        ),
      )
      .orderBy(desc(sceneAudio.updatedAt));
    const entries = current.storyboard.scenes.map((scene) => {
      const contentHash = digest({
        narrationHash: digest(scene.scene.narration.trim()),
        voiceHash,
        provider: sceneAudioProvider,
      });
      const audio = audioRows.find(
        (row) => row.sceneId === scene.id && row.contentHash === contentHash,
      );
      const fingerprint = digest({ sceneId: scene.stableSceneId, contentHash });
      // All three dispatches plus alignment for a supported 60-second scene.
      const cost = money(
        0.0001 +
          3 *
            ((scene.scene.narration.length / 1_000_000) *
              this.pricing.ttsCostUsdPerMillionCharacters +
              this.pricing.alignmentCostUsdPerAudioMinute),
      );
      return { scene, audio, fingerprint, cost };
    });
    const [source] = await this.database
      .select({
        id: sourceSnapshots.id,
        contentHash: sourceSnapshots.contentHash,
      })
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, scope.ownerUserId),
          eq(sourceSnapshots.projectId, scope.projectId),
        ),
      )
      .orderBy(desc(sourceSnapshots.snapshotVersion))
      .limit(1);
    return {
      ...current,
      voice,
      entries,
      sourceFingerprint: digest(source ?? null),
    };
  }

  async estimate(scope: RecoveryScope): Promise<RecoveryEstimate> {
    this.assertEnabled();
    const state = await this.inputs(scope);
    return recoveryEstimateSchema.parse({
      revision: state.row.revision,
      fingerprint: digest({
        spec: state.row.id,
        revision: state.row.revision,
        inputs: state.entries.map((entry) => entry.fingerprint),
        pricing: this.pricing,
      }),
      maximumCostUsd: money(
        state.entries.reduce((sum, entry) => sum + entry.cost, 0) +
          (this.integrations.grounding
            ? 3 * this.pricing.modelCallCostUsd +
              3 * state.entries.length * this.pricing.imageCostUsd
            : 0),
      ),
      scenes: state.entries.length,
      coversSavedEdits: true,
      maxAttempts: 3,
    });
  }

  async start(
    input: RecoveryScope & { body: unknown; correlationId: Identifier },
  ) {
    this.assertEnabled();
    const command = parse(recoveryStartSchema, input.body);
    // Idempotent retries remain valid even after reconciliation changed the revision.
    const [existing] = await this.database
      .select()
      .from(lessonRecoveryRuns)
      .where(
        and(
          eq(lessonRecoveryRuns.ownerUserId, input.ownerUserId),
          eq(lessonRecoveryRuns.projectId, input.projectId),
          or(
            eq(lessonRecoveryRuns.idempotencyKey, command.idempotencyKey),
            sql`${lessonRecoveryRuns.authorizationRequests} ->> ${command.idempotencyKey} is not null`,
          ),
        ),
      );
    if (existing) return this.readiness.read(input);
    const estimate = await this.estimate(input);
    if (
      estimate.revision !== command.expectedRevision ||
      estimate.fingerprint !== command.estimateFingerprint
    )
      throw new PublicError(
        "edit_conflict",
        "The lesson changed. Refresh the preparation estimate.",
        409,
      );
    if (command.acceptedMaximumCostUsd !== estimate.maximumCostUsd)
      throw new PublicError(
        "validation_failed",
        "Accept the current preparation allowance.",
        400,
      );
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const { row } = await this.readiness.currentSpec(input, tx);
      if (row.revision !== command.expectedRevision)
        throw new PublicError(
          "edit_conflict",
          "The lesson changed. Refresh the preparation estimate.",
          409,
        );
      const [oneShot] = await tx
        .select()
        .from(oneShotRuns)
        .where(
          and(
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
          ),
        )
        .orderBy(desc(oneShotRuns.createdAt))
        .limit(1);
      const [active] = await tx
        .select()
        .from(lessonRecoveryRuns)
        .where(
          and(
            eq(lessonRecoveryRuns.ownerUserId, input.ownerUserId),
            eq(lessonRecoveryRuns.projectId, input.projectId),
            isNull(lessonRecoveryRuns.stoppedAt),
          ),
        )
        .for("update");
      if (
        !active &&
        oneShot &&
        ["queued", "running", "preparing", "repairing"].includes(oneShot.status)
      )
        throw new PublicError(
          "edit_conflict",
          "Lesson generation is already preparing this project. Its allowance will be reused.",
          409,
        );
      if (active) {
        const receipts = z
          .record(z.string())
          .parse(active.authorizationRequests);
        if (receipts[command.idempotencyKey]) return;
        // Explicit top-up, never a second project allowance. Existing tasks/attempts remain.
        await tx
          .update(lessonRecoveryRuns)
          .set({
            allowanceUsd: String(
              money(
                Number(active.allowanceUsd) +
                  (command.intent === "increase_allowance"
                    ? estimate.maximumCostUsd
                    : 0),
              ),
            ),
            state: "queued",
            failureCode: null,
            authorizationRequests: {
              ...receipts,
              [command.idempotencyKey]: estimate.fingerprint,
            },
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryRuns.id, active.id));
        // Explicit retries retain lifetime attempts; terminal/no-progress content
        // needs review. Their unspent reservations were already released.
        await tx
          .update(lessonRecoveryTasks)
          .set({
            state: "needs_action",
            jobId: null,
            priorAttempts: sql`case when ${lessonRecoveryTasks.operation} = 'asset' then 0 else ${lessonRecoveryTasks.attempts} end`,
            failureCode: "RECOVERY_ALLOWANCE_EXHAUSTED",
            calls: {},
            reservedUsd: "0",
            updatedAt: this.now(),
          })
          .where(
            and(
              eq(lessonRecoveryTasks.ownerUserId, input.ownerUserId),
              eq(lessonRecoveryTasks.projectId, input.projectId),
              eq(lessonRecoveryTasks.runId, active.id),
              or(
                eq(lessonRecoveryTasks.state, "failed"),
                // Parked by a coordinator error rather than by a content finding.
                and(
                  eq(lessonRecoveryTasks.state, "needs_action"),
                  inArray(lessonRecoveryTasks.failureCode, [
                    "RECOVERY_REVIEW_REQUIRED",
                    "RECOVERY_SERVICE_UNAVAILABLE",
                  ]),
                ),
              ),
              sql`${lessonRecoveryTasks.attempts} < 3`,
              sql`${lessonRecoveryTasks.failureCode} is distinct from 'RECOVERY_NO_PROGRESS'`,
            ),
          );
        await this.schedule(tx, active, active.sequence, 0);
        return;
      }
      const [run] = await tx
        .insert(lessonRecoveryRuns)
        .values({
          id: createId(),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          lessonSpecId: row.id,
          revision: row.revision,
          idempotencyKey: command.idempotencyKey,
          allowanceUsd: String(estimate.maximumCostUsd),
          authorizationRequests: {
            [command.idempotencyKey]: estimate.fingerprint,
          },
          correlationId: input.correlationId,
        })
        .returning();
      await tx
        .update(lessonRecoveryTasks)
        .set({
          runId: run!.id,
          state: "needs_action",
          jobId: null,
          priorAttempts: sql`case when ${lessonRecoveryTasks.operation} = 'asset' then 0 else ${lessonRecoveryTasks.attempts} end`,
          failureCode: "RECOVERY_ALLOWANCE_EXHAUSTED",
          calls: {},
          reservedUsd: "0",
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(lessonRecoveryTasks.ownerUserId, input.ownerUserId),
            eq(lessonRecoveryTasks.projectId, input.projectId),
            eq(lessonRecoveryTasks.state, "cancelled"),
            sql`${lessonRecoveryTasks.attempts} < 3`,
          ),
        );
      await this.schedule(tx, run!, 0, 0);
    });
    return this.readiness.read(input);
  }

  async stop(input: RecoveryScope & { body: unknown }) {
    const command = parse(recoveryCommandSchema, input.body);
    const stopReceipt = `stop:${command.idempotencyKey}`;
    const [stopped] = await this.database
      .select({ id: lessonRecoveryRuns.id })
      .from(lessonRecoveryRuns)
      .where(
        and(
          eq(lessonRecoveryRuns.ownerUserId, input.ownerUserId),
          eq(lessonRecoveryRuns.projectId, input.projectId),
          sql`${lessonRecoveryRuns.authorizationRequests} ->> ${stopReceipt} is not null`,
        ),
      )
      .limit(1);
    if (stopped) return this.readiness.read(input);
    // Stopping spend is never refused. The coordinator itself advances the
    // revision (timing reconciliation), so expectedRevision is not checked.
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      await tx
        .update(lessonPreparationGrants)
        .set({ stoppedAt: this.now(), updatedAt: this.now() })
        .where(
          and(
            eq(lessonPreparationGrants.ownerUserId, input.ownerUserId),
            eq(lessonPreparationGrants.projectId, input.projectId),
            isNull(lessonPreparationGrants.stoppedAt),
          ),
        );
      const runs = await tx
        .update(lessonRecoveryRuns)
        .set({
          stoppedAt: this.now(),
          state: "cancelled",
          authorizationRequests: sql`${lessonRecoveryRuns.authorizationRequests} || ${JSON.stringify({ [stopReceipt]: "stopped" })}::jsonb`,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(lessonRecoveryRuns.ownerUserId, input.ownerUserId),
            eq(lessonRecoveryRuns.projectId, input.projectId),
            isNull(lessonRecoveryRuns.stoppedAt),
          ),
        )
        .returning();
      for (const run of runs)
        await tx
          .update(lessonRecoveryTasks)
          .set({ state: "cancelled", updatedAt: this.now() })
          .where(
            and(
              eq(lessonRecoveryTasks.runId, run.id),
              eq(lessonRecoveryTasks.ownerUserId, input.ownerUserId),
              eq(lessonRecoveryTasks.projectId, input.projectId),
              sql`${lessonRecoveryTasks.state} in ('queued','running','retry_wait','needs_action')`,
            ),
          );
    });
    return this.readiness.read(input);
  }

  private async schedule(
    tx: DatabaseExecutor,
    run: Run,
    sequence: number,
    delayMs: number,
  ) {
    const envelope = createJobEnvelope(recoveryAdvancePayloadSchema, {
      jobId: createId(),
      jobType: "lesson.recovery.advance",
      ownerUserId: run.ownerUserId as Identifier,
      projectId: run.projectId as Identifier,
      correlationId: run.correlationId as Identifier,
      inputVersion: `${run.id}:${sequence}`,
      idempotencyKey: `recovery:${run.id}:${sequence}`,
      payloadVersion: 1,
      payload: { schemaVersion: 1, runId: run.id as Identifier, sequence },
      requestedAt: this.now(),
    });
    const [job] = await tx
      .insert(jobs)
      .values({
        id: envelope.jobId,
        jobType: envelope.jobType,
        queueName: "orchestration",
        ownerUserId: run.ownerUserId,
        projectId: run.projectId,
        correlationId: run.correlationId,
        inputVersion: envelope.inputVersion,
        idempotencyKey: envelope.idempotencyKey,
        payloadVersion: 1,
        payload: envelope.payload,
      })
      .onConflictDoNothing()
      .returning();
    if (job)
      await tx.insert(outboxEvents).values({
        id: createId(),
        jobId: job.id,
        queueName: "orchestration",
        eventType: "lesson.recovery.advance.v1",
        envelope,
        availableAt: new Date(this.now().getTime() + delayMs),
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5000 },
      });
  }

  /** Reopens a succeeded media task for a recurring issue with fresh attempts,
   * reserved against the current run. Returns null when the run has stopped
   * or the task changed meanwhile. */
  private async reopenTask(
    run: Run,
    task: typeof lessonRecoveryTasks.$inferSelect,
    issueCodes: string[],
    reserved: number,
  ) {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${task.projectId}))`,
      );
      const [fresh] = await tx
        .select()
        .from(lessonRecoveryRuns)
        .where(
          and(
            eq(lessonRecoveryRuns.id, run.id),
            isNull(lessonRecoveryRuns.stoppedAt),
          ),
        )
        .for("update");
      if (!fresh) return null;
      const affordable =
        Number(fresh.reservedUsd) + reserved <=
        Number(fresh.allowanceUsd) + 0.0000001;
      // The earlier cycle's spend stays debited on its run; calls restart here.
      const [reopened] = await tx
        .update(lessonRecoveryTasks)
        .set({
          runId: run.id,
          issueCodes,
          jobId: null,
          priorAttempts: 0,
          attempts: 0,
          calls: {},
          state: affordable ? "queued" : "needs_action",
          failureCode: affordable ? null : "RECOVERY_ALLOWANCE_EXHAUSTED",
          reservedUsd: String(affordable ? reserved : 0),
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(lessonRecoveryTasks.id, task.id),
            eq(lessonRecoveryTasks.state, "succeeded"),
          ),
        )
        .returning();
      if (!reopened) return null;
      if (affordable)
        await tx
          .update(lessonRecoveryRuns)
          .set({
            reservedUsd: String(money(Number(fresh.reservedUsd) + reserved)),
          })
          .where(eq(lessonRecoveryRuns.id, run.id));
      return reopened;
    });
  }

  private async reserveTechnicalTask(
    run: Run,
    scope: RecoveryScope,
    operation: "grounding" | "asset",
    fingerprint: string,
    cost: number,
    sceneId: string | null,
    issueCodes: string[],
  ) {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${scope.projectId}))`,
      );
      const [existing] = await tx
        .select()
        .from(lessonRecoveryTasks)
        .where(
          and(
            eq(lessonRecoveryTasks.ownerUserId, scope.ownerUserId),
            eq(lessonRecoveryTasks.projectId, scope.projectId),
            eq(lessonRecoveryTasks.operation, operation),
            eq(lessonRecoveryTasks.fingerprint, fingerprint),
          ),
        )
        .for("update");
      if (
        existing &&
        !(
          existing.state === "needs_action" &&
          existing.failureCode === "RECOVERY_ALLOWANCE_EXHAUSTED"
        )
      )
        return existing;
      const [authority] = await tx
        .select()
        .from(lessonRecoveryRuns)
        .where(
          and(
            eq(lessonRecoveryRuns.id, run.id),
            isNull(lessonRecoveryRuns.stoppedAt),
          ),
        )
        .for("update");
      if (!authority) return undefined;
      const affordable =
        Number(authority.reservedUsd) + cost <=
        Number(authority.allowanceUsd) + 0.0000001;
      const values = {
        state: affordable ? "queued" : "needs_action",
        reservedUsd: String(affordable ? cost : 0),
        failureCode: affordable ? null : "RECOVERY_ALLOWANCE_EXHAUSTED",
        updatedAt: this.now(),
      };
      const [task] = existing
        ? await tx
            .update(lessonRecoveryTasks)
            .set(values)
            .where(eq(lessonRecoveryTasks.id, existing.id))
            .returning()
        : await tx
            .insert(lessonRecoveryTasks)
            .values({
              id: createId(),
              ...scope,
              runId: run.id,
              operation,
              fingerprint,
              sceneId,
              issueCodes,
              ...values,
            })
            .returning();
      if (affordable)
        await tx
          .update(lessonRecoveryRuns)
          .set({
            reservedUsd: String(money(Number(authority.reservedUsd) + cost)),
          })
          .where(eq(lessonRecoveryRuns.id, run.id));
      return task;
    });
  }

  private async settleTechnicalTask(
    task: typeof lessonRecoveryTasks.$inferSelect,
    state: "succeeded" | "failed",
    failureCode: string | null = null,
  ) {
    await this.releaseTasks(
      task.projectId,
      and(
        eq(lessonRecoveryTasks.id, task.id),
        notInArray(lessonRecoveryTasks.state, terminalTaskStates),
      ),
      { state, failureCode },
    );
  }

  /** Moves matching tasks to a state that can no longer dispatch and returns
   * each one's unspent reservation to its run. Spent calls stay debited, and
   * the task keeps only what it spent, so releasing again returns nothing. */
  private async releaseTasks(
    projectId: string,
    condition: SQL | undefined,
    values: { state: string; failureCode?: string | null; attempts?: number },
  ) {
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${projectId}))`,
      );
      const tasks = await tx
        .select()
        .from(lessonRecoveryTasks)
        .where(condition)
        .for("update");
      for (const task of tasks) {
        const spent = Object.values(
          z.record(z.number()).parse(task.calls),
        ).reduce((sum, cost) => sum + cost, 0);
        const release = Math.max(0, Number(task.reservedUsd) - spent);
        await tx
          .update(lessonRecoveryTasks)
          .set({
            ...values,
            reservedUsd: String(money(spent)),
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryTasks.id, task.id));
        if (release > 0)
          await tx
            .update(lessonRecoveryRuns)
            .set({
              reservedUsd: sql`greatest(0, ${lessonRecoveryRuns.reservedUsd} - ${release})`,
            })
            .where(eq(lessonRecoveryRuns.id, task.runId));
      }
    });
  }

  private async recoverGrounding(
    run: Run,
    scope: RecoveryScope,
    state: Awaited<ReturnType<LessonRecoveryService["inputs"]>>,
    report: Awaited<ReturnType<LessonValidationService["run"]>>,
  ) {
    const stale = report.issues.filter(
      (issue) =>
        issue.code === "grounding_recheck_required" &&
        issue.fieldPath.endsWith(".sourceRefs"),
    );
    const fingerprint = digest({
      spec: state.row.id,
      revision: state.row.revision,
      hash: state.row.contentHash,
      source: state.sourceFingerprint,
    });
    if (stale.length === 0) {
      const completed = await this.database
        .select()
        .from(lessonRecoveryTasks)
        .where(
          and(
            eq(lessonRecoveryTasks.runId, run.id),
            eq(lessonRecoveryTasks.operation, "grounding"),
            eq(lessonRecoveryTasks.fingerprint, fingerprint),
            sql`${lessonRecoveryTasks.state} in ('queued','running','retry_wait')`,
          ),
        );
      for (const task of completed)
        await this.settleTechnicalTask(task, "succeeded");
    }
    if (
      !this.integrations.grounding ||
      stale.length === 0 ||
      report.issues.some(
        (issue) =>
          issue.code === "grounding_missing" && issue.severity === "error",
      )
    )
      return false;
    await this.releaseTasks(
      scope.projectId,
      and(
        eq(lessonRecoveryTasks.ownerUserId, scope.ownerUserId),
        eq(lessonRecoveryTasks.projectId, scope.projectId),
        eq(lessonRecoveryTasks.operation, "grounding"),
        sql`${lessonRecoveryTasks.fingerprint} <> ${fingerprint}`,
        sql`${lessonRecoveryTasks.state} in ('queued','running','retry_wait')`,
      ),
      { state: "superseded" },
    );
    const task = await this.reserveTechnicalTask(
      run,
      scope,
      "grounding",
      fingerprint,
      money(3 * this.pricing.modelCallCostUsd),
      null,
      ["grounding_recheck_required"],
    );
    if (
      !task ||
      [
        "needs_action",
        "failed",
        "succeeded",
        "cancelled",
        "superseded",
      ].includes(task.state)
    )
      return false;
    if (task.jobId) {
      const [job] = await this.database
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, task.jobId),
            eq(jobs.ownerUserId, scope.ownerUserId),
            eq(jobs.projectId, scope.projectId),
          ),
        );
      if (job && activeJob(job.state)) {
        await this.database
          .update(lessonRecoveryTasks)
          .set({
            state: job.state === "retry_wait" ? "retry_wait" : "running",
            attempts: Math.min(3, task.priorAttempts + job.attempts),
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryTasks.id, task.id));
        return true;
      }
      if (job)
        await this.database
          .update(lessonRecoveryTasks)
          .set({
            attempts: Math.min(3, task.priorAttempts + job.attempts),
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryTasks.id, task.id));
      await this.settleTechnicalTask(
        task,
        "failed",
        job?.state === "succeeded"
          ? "RECOVERY_NO_PROGRESS"
          : "RECOVERY_SERVICE_UNAVAILABLE",
      );
      return false;
    }
    const response = await this.integrations.grounding.check({
      ...scope,
      recoveryTaskId: task.id as Identifier,
      correlationId: run.correlationId as Identifier,
      ...(run.oneShotRunId
        ? { oneShotRunId: run.oneShotRunId as Identifier }
        : {}),
      idempotencyKey: `recovery:${task.id}:${task.priorAttempts}:${task.runId}`,
      body: {
        scope: "lesson",
        lessonSpecId: state.row.id,
        lessonSpecRevision: state.row.revision,
      },
    });
    if (response.cached) await this.settleTechnicalTask(task, "succeeded");
    return !response.cached;
  }

  private async recoverAssets(run: Run, scope: RecoveryScope) {
    const candidates = await this.database
      .select()
      .from(illustrationGenerationCandidates)
      .innerJoin(
        scenes,
        eq(scenes.id, illustrationGenerationCandidates.sceneId),
      )
      .where(
        and(
          eq(illustrationGenerationCandidates.ownerUserId, scope.ownerUserId),
          eq(illustrationGenerationCandidates.projectId, scope.projectId),
          eq(scenes.lessonSpecId, run.lessonSpecId),
          eq(illustrationGenerationCandidates.status, "failed"),
        ),
      );
    let pending = false;
    for (const candidate of candidates) {
      const [job] = await this.database
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, scope.ownerUserId),
            eq(jobs.projectId, scope.projectId),
            eq(jobs.jobType, "illustration.generate"),
            sql`${jobs.payload} ->> 'candidateId' = ${candidate.illustration_generation_candidates.id}`,
          ),
        )
        .orderBy(desc(jobs.createdAt))
        .limit(1);
      if (!job || activeJob(job.state)) {
        pending ||= !!job && activeJob(job.state);
        continue;
      }
      if (job.state === "succeeded") continue; // An approved fallback already completed this job.
      const task = await this.reserveTechnicalTask(
        run,
        scope,
        "asset",
        digest({ job: job.id, input: job.inputVersion }),
        money(3 * this.pricing.imageCostUsd),
        candidate.scenes.stableSceneId,
        ["asset_missing"],
      );
      if (
        !task ||
        [
          "needs_action",
          "failed",
          "succeeded",
          "cancelled",
          "superseded",
        ].includes(task.state)
      )
        continue;
      // The existing illustration worker builds from the scene. An intervening
      // teacher edit therefore needs review rather than a changed prompt retry.
      if (
        job.state !== "failed" ||
        job.errorClassification !== "retryable" ||
        job.attempts >= 3 ||
        candidate.scenes.updatedAt > job.createdAt
      ) {
        await this.settleTechnicalTask(
          task,
          "failed",
          job.attempts >= 3
            ? "RECOVERY_ATTEMPTS_EXHAUSTED"
            : "RECOVERY_ASSET_REVIEW_REQUIRED",
        );
        continue;
      }
      if (task.jobId) {
        await this.settleTechnicalTask(
          task,
          "failed",
          "RECOVERY_SERVICE_UNAVAILABLE",
        );
        continue;
      }
      await this.database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${scope.projectId}))`,
        );
        const [authority] = await tx
          .select()
          .from(lessonRecoveryRuns)
          .where(
            and(
              eq(lessonRecoveryRuns.id, run.id),
              isNull(lessonRecoveryRuns.stoppedAt),
            ),
          )
          .for("update");
        if (!authority) return;
        const [retried] = await tx
          .update(jobs)
          .set({
            state: "queued",
            completedAt: null,
            availableAt: this.now(),
            updatedAt: this.now(),
          })
          .where(
            and(
              eq(jobs.id, job.id),
              eq(jobs.state, "failed"),
              sql`${jobs.attempts} < 3`,
            ),
          )
          .returning();
        if (!retried) return;
        await tx
          .update(lessonRecoveryTasks)
          .set({
            jobId: job.id,
            state: "running",
            attempts: job.attempts,
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryTasks.id, task.id));
        const envelope = createJobEnvelope(z.unknown(), {
          jobId: job.id as Identifier,
          jobType: job.jobType,
          ...scope,
          correlationId: job.correlationId as Identifier,
          inputVersion: job.inputVersion,
          idempotencyKey: job.idempotencyKey,
          payloadVersion: job.payloadVersion,
          payload: job.payload,
          requestedAt: this.now(),
        });
        await tx.insert(outboxEvents).values({
          id: createId(),
          jobId: job.id,
          queueName: job.queueName,
          eventType: `recovery.asset_retry.${job.attempts}`,
          envelope,
          deliveryOptions: {
            maxAttempts: Math.max(1, 3 - job.attempts),
            retryDelayMs: 5000,
          },
        });
      });
      pending = true;
    }
    // Successful candidates still require the existing asset review/apply flow.
    const active = await this.database
      .select()
      .from(lessonRecoveryTasks)
      .where(
        and(
          eq(lessonRecoveryTasks.runId, run.id),
          eq(lessonRecoveryTasks.operation, "asset"),
          sql`${lessonRecoveryTasks.state} in ('running','retry_wait')`,
        ),
      );
    for (const task of active) {
      const [job] = await this.database
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, task.jobId!),
            eq(jobs.ownerUserId, scope.ownerUserId),
            eq(jobs.projectId, scope.projectId),
          ),
        );
      if (job)
        await this.database
          .update(lessonRecoveryTasks)
          .set({
            attempts: Math.min(3, job.attempts),
            ...(activeJob(job.state)
              ? { state: job.state === "retry_wait" ? "retry_wait" : "running" }
              : {}),
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryTasks.id, task.id));
      if (job && activeJob(job.state)) pending = true;
      else
        await this.settleTechnicalTask(
          task,
          job?.state === "succeeded" ? "succeeded" : "failed",
          job?.state === "succeeded" ? null : "RECOVERY_SERVICE_UNAVAILABLE",
        );
    }
    return pending;
  }

  handler(): RegisteredJobHandler {
    return defineJobHandler(
      "lesson.recovery.advance",
      1,
      recoveryAdvancePayloadSchema,
      async (payload, context) => {
        const scope = {
          ownerUserId: context.ownerUserId,
          projectId: context.projectId,
        };
        const [run] = await this.database
          .update(lessonRecoveryRuns)
          .set({
            leaseJobId: context.jobId,
            leaseUntil: new Date(this.now().getTime() + 120_000),
          })
          .where(
            and(
              eq(lessonRecoveryRuns.id, payload.runId),
              eq(lessonRecoveryRuns.ownerUserId, scope.ownerUserId),
              eq(lessonRecoveryRuns.projectId, scope.projectId),
              isNull(lessonRecoveryRuns.stoppedAt),
              eq(lessonRecoveryRuns.sequence, payload.sequence),
              sql`(${lessonRecoveryRuns.leaseUntil} is null or ${lessonRecoveryRuns.leaseUntil} < ${this.now().toISOString()} or ${lessonRecoveryRuns.leaseJobId} = ${context.jobId})`,
            ),
          )
          .returning();
        if (!run) return { status: "superseded" };
        try {
          await this.advance(run, scope);
        } catch (error) {
          if (!(error instanceof PublicError) && context.attempt < 3)
            throw error;
          if (error instanceof PublicError && error.code === "edit_conflict") {
            // A save landed mid-tick. Inputs changed, not their validity: queued
            // tasks stay queued and the next tick replans against the new revision.
            await this.database
              .update(lessonRecoveryRuns)
              .set({ state: "queued", updatedAt: this.now() })
              .where(eq(lessonRecoveryRuns.id, run.id));
          } else {
            await this.database
              .update(lessonRecoveryRuns)
              .set({
                state: "needs_action",
                failureCode:
                  error instanceof PublicError
                    ? error.code
                    : "RECOVERY_SERVICE_UNAVAILABLE",
                updatedAt: this.now(),
              })
              .where(eq(lessonRecoveryRuns.id, run.id));
            await this.releaseTasks(
              run.projectId,
              and(
                eq(lessonRecoveryTasks.runId, run.id),
                eq(lessonRecoveryTasks.state, "queued"),
                isNull(lessonRecoveryTasks.jobId),
              ),
              {
                state: "needs_action",
                failureCode:
                  error instanceof PublicError
                    ? "RECOVERY_REVIEW_REQUIRED"
                    : "RECOVERY_SERVICE_UNAVAILABLE",
              },
            );
          }
          if (!(error instanceof PublicError)) {
            await this.database
              .update(lessonRecoveryRuns)
              .set({
                sequence: payload.sequence + 1,
                leaseJobId: null,
                leaseUntil: null,
              })
              .where(eq(lessonRecoveryRuns.id, run.id));
            return { status: "needs_action" };
          }
        }
        await this.database.transaction(async (tx) => {
          const [next] = await tx
            .update(lessonRecoveryRuns)
            .set({
              sequence: payload.sequence + 1,
              leaseJobId: null,
              leaseUntil: null,
              updatedAt: this.now(),
            })
            .where(
              and(
                eq(lessonRecoveryRuns.id, run.id),
                isNull(lessonRecoveryRuns.stoppedAt),
                eq(lessonRecoveryRuns.sequence, payload.sequence),
              ),
            )
            .returning();
          if (next && ["queued", "running", "retry_wait"].includes(next.state))
            await this.schedule(tx, next, next.sequence, 5000);
        });
        return { status: "advanced" };
      },
    );
  }

  private async advance(run: Run, scope: RecoveryScope) {
    const [project] = await this.database
      .select({ deletedAt: projects.deletedAt })
      .from(projects)
      .where(
        and(
          eq(projects.id, scope.projectId),
          eq(projects.ownerUserId, scope.ownerUserId),
        ),
      );
    if (!project || project.deletedAt !== null) {
      await this.database
        .update(lessonRecoveryRuns)
        .set({ stoppedAt: this.now(), state: "cancelled" })
        .where(eq(lessonRecoveryRuns.id, run.id));
      return;
    }
    const state = await this.inputs(scope);
    // Record or clear only the voice requirement; other failure codes stand.
    await this.database
      .update(lessonRecoveryRuns)
      .set({ failureCode: state.voice ? null : "VOICE_REQUIRED" })
      .where(
        and(
          eq(lessonRecoveryRuns.id, run.id),
          state.voice
            ? eq(lessonRecoveryRuns.failureCode, "VOICE_REQUIRED")
            : undefined,
        ),
      );
    if (state.row.id !== run.lessonSpecId) {
      await this.database
        .update(lessonRecoveryRuns)
        .set({
          state: "needs_action",
          failureCode: "RECOVERY_STORYBOARD_REPLACED",
          stoppedAt: this.now(),
        })
        .where(eq(lessonRecoveryRuns.id, run.id));
      return;
    }
    let report = await this.validation.latest(scope);
    if (!report || report.stale)
      report = await this.validation.run({ ...scope, body: {} });
    const previous = await this.database
      .select()
      .from(lessonRecoveryTasks)
      .where(
        and(
          eq(lessonRecoveryTasks.ownerUserId, scope.ownerUserId),
          eq(lessonRecoveryTasks.projectId, scope.projectId),
        ),
      );
    const fingerprints = new Set(
      state.entries.map((entry) => entry.fingerprint),
    );
    // An edit replaced these inputs. The superseded task can no longer
    // dispatch, so its unspent reservation funds the replacement work.
    const replaced = previous
      .filter(
        (task) =>
          ["audio", "captions"].includes(task.operation) &&
          !fingerprints.has(task.fingerprint) &&
          !["succeeded", "superseded", "cancelled"].includes(task.state),
      )
      .map((task) => task.id);
    if (replaced.length > 0)
      await this.releaseTasks(
        scope.projectId,
        and(
          inArray(lessonRecoveryTasks.id, replaced),
          notInArray(lessonRecoveryTasks.state, [
            "succeeded",
            "superseded",
            "cancelled",
          ]),
        ),
        { state: "superseded" },
      );
    let pending = false;
    for (const entry of state.entries) {
      const codes = report.issues
        .filter(
          (issue) =>
            issue.sceneId === entry.scene.stableSceneId &&
            [
              "audio_missing",
              "audio_not_ready",
              "captions_missing",
              "captions_not_ready",
              "caption_timing_invalid",
            ].includes(issue.code),
        )
        .map((issue) => issue.code);
      // Captions aligned to valid measured audio can exceed the *planned*
      // duration while another scene is still preparing. Reconcile the lesson
      // first, then revalidate cues; rebuilding them now cannot fix that cause.
      if (
        entry.audio?.status === "ready" &&
        entry.audio.durationMs !== null &&
        entry.audio.durationMs > entry.scene.durationSeconds * 1000 &&
        codes.every((code) => code === "caption_timing_invalid") &&
        report.issues.some(
          (issue) =>
            issue.sceneId === entry.scene.stableSceneId &&
            issue.code === "audio_duration_mismatch",
        )
      )
        continue;
      const operation =
        entry.audio?.status === "ready" && codes.length > 0
          ? "captions"
          : "audio";
      const old =
        previous.find(
          (task) =>
            task.fingerprint === entry.fingerprint &&
            ["queued", "running", "retry_wait"].includes(task.state),
        ) ??
        previous.find(
          (task) =>
            task.operation === operation &&
            task.fingerprint === entry.fingerprint,
        );
      if (codes.length === 0 && entry.audio?.status === "ready") {
        const finished = previous
          .filter(
            (task) =>
              task.fingerprint === entry.fingerprint &&
              task.state !== "succeeded" &&
              ["audio", "captions"].includes(task.operation),
          )
          .map((task) => task.id);
        if (finished.length > 0)
          await this.releaseTasks(
            scope.projectId,
            and(
              inArray(lessonRecoveryTasks.id, finished),
              ne(lessonRecoveryTasks.state, "succeeded"),
            ),
            { state: "succeeded" },
          );
        continue;
      }
      const jobId = old?.jobId ?? entry.audio?.jobId;
      const [job] = jobId
        ? await this.database
            .select()
            .from(jobs)
            .where(
              and(
                eq(jobs.id, jobId),
                eq(jobs.ownerUserId, scope.ownerUserId),
                eq(jobs.projectId, scope.projectId),
              ),
            )
        : [];
      if (activeJob(job?.state)) {
        pending = true;
        if (old)
          await this.database
            .update(lessonRecoveryTasks)
            .set({
              state: job!.state === "retry_wait" ? "retry_wait" : "running",
              attempts: Math.min(3, old.priorAttempts + job!.attempts),
              updatedAt: this.now(),
            })
            .where(eq(lessonRecoveryTasks.id, old.id));
        continue;
      }
      const reserved =
        entry.audio?.storageKey && entry.audio.durationMs ? 0 : entry.cost;
      // A repair that succeeded earlier is new work when its issue returns (for
      // example, captions invalidated again). Only a job that finished with the
      // issue still present is "no progress".
      const reopened =
        old?.state === "succeeded" &&
        state.voice &&
        entry.scene.scene.narration.trim().length > 0
          ? await this.reopenTask(run, old, codes, reserved)
          : undefined;
      if (reopened === null) continue;
      if (old?.jobId && !reopened) {
        await this.releaseTasks(
          scope.projectId,
          eq(lessonRecoveryTasks.id, old.id),
          {
            state: "failed",
            attempts: Math.min(3, old.priorAttempts + (job?.attempts ?? 0)),
            failureCode:
              job?.state === "succeeded"
                ? "RECOVERY_NO_PROGRESS"
                : (entry.audio?.failureCode ?? "RECOVERY_JOB_FAILED"),
          },
        );
        continue;
      }
      if (!state.voice || entry.scene.scene.narration.trim().length === 0)
        continue;
      const priorAttempts =
        entry.audio?.status === "ready" ? 0 : (job?.attempts ?? 0);
      const canRetry =
        priorAttempts < 3 && job?.errorClassification !== "terminal";
      const task =
        reopened ??
        old ??
        (await this.database.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${scope.projectId}))`,
          );
          const [fresh] = await tx
            .select()
            .from(lessonRecoveryRuns)
            .where(
              and(
                eq(lessonRecoveryRuns.id, run.id),
                isNull(lessonRecoveryRuns.stoppedAt),
              ),
            )
            .for("update");
          if (!fresh) return undefined;
          const affordable =
            Number(fresh.reservedUsd) + reserved <=
            Number(fresh.allowanceUsd) + 0.0000001;
          const [created] = await tx
            .insert(lessonRecoveryTasks)
            .values({
              id: createId(),
              ...scope,
              runId: run.id,
              sceneId: entry.scene.stableSceneId,
              operation,
              fingerprint: entry.fingerprint,
              issueCodes: codes,
              state: !canRetry
                ? "failed"
                : !affordable
                  ? "needs_action"
                  : "queued",
              priorAttempts,
              attempts: priorAttempts,
              reservedUsd: String(affordable && canRetry ? reserved : 0),
              failureCode: !canRetry
                ? "RECOVERY_ATTEMPTS_EXHAUSTED"
                : !affordable
                  ? "RECOVERY_ALLOWANCE_EXHAUSTED"
                  : null,
            })
            .onConflictDoNothing()
            .returning();
          if (created && affordable && canRetry)
            await tx
              .update(lessonRecoveryRuns)
              .set({
                reservedUsd: String(
                  money(Number(fresh.reservedUsd) + reserved),
                ),
              })
              .where(eq(lessonRecoveryRuns.id, run.id));
          return created;
        }));
      if (
        task?.state === "needs_action" &&
        task.failureCode === "RECOVERY_ALLOWANCE_EXHAUSTED"
      ) {
        await this.database.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${scope.projectId}))`,
          );
          const [fresh] = await tx
            .select()
            .from(lessonRecoveryRuns)
            .where(
              and(
                eq(lessonRecoveryRuns.id, run.id),
                isNull(lessonRecoveryRuns.stoppedAt),
              ),
            )
            .for("update");
          if (
            fresh &&
            Number(fresh.reservedUsd) + reserved <= Number(fresh.allowanceUsd)
          ) {
            await tx
              .update(lessonRecoveryRuns)
              .set({
                reservedUsd: String(
                  money(Number(fresh.reservedUsd) + reserved),
                ),
              })
              .where(eq(lessonRecoveryRuns.id, run.id));
            await tx
              .update(lessonRecoveryTasks)
              .set({
                state: "queued",
                reservedUsd: String(reserved),
                failureCode: null,
              })
              .where(eq(lessonRecoveryTasks.id, task.id));
            task.state = "queued";
          }
        });
      }
      if (!task || task.state !== "queued") continue;
      const result = await this.audio.generate({
        ...scope,
        sceneId: entry.scene.stableSceneId as Identifier,
        correlationId: run.correlationId as Identifier,
        recoveryTaskId: task.id as Identifier,
        ...(run.oneShotRunId
          ? { oneShotRunId: run.oneShotRunId as Identifier }
          : {}),
        expectedRevision: state.row.revision,
        repairCaptions: codes.includes("caption_timing_invalid"),
        body: {
          // updatedAt is fixed between queueing and dispatch, and changes when a
          // succeeded task is reopened, so each repair cycle gets its own job.
          idempotencyKey: `recovery:${task.id}:${task.priorAttempts}:${task.runId}:${task.updatedAt.getTime()}`,
        },
      });
      await this.database
        .update(lessonRecoveryTasks)
        .set({ jobId: result.jobId, state: "running", updatedAt: this.now() })
        .where(eq(lessonRecoveryTasks.id, task.id));
      pending = true;
    }
    if (
      !pending &&
      state.entries.every((entry) => entry.audio?.status === "ready") &&
      report.issues.some((issue) =>
        [
          "audio_duration_mismatch",
          "narration_duration_mismatch",
          "scene_duration_out_of_range",
        ].includes(issue.code),
      )
    ) {
      const fingerprint = digest({
        revision: state.row.revision,
        audio: state.entries.map((entry) => [
          entry.fingerprint,
          entry.audio?.durationMs,
        ]),
      });
      await this.database.transaction(async (tx) => {
        const envelope = createJobEnvelope(lessonTimingRepairPayloadSchema, {
          jobId: createId(),
          jobType: "lesson.timing.reconcile",
          ...scope,
          correlationId: run.correlationId as Identifier,
          inputVersion: fingerprint,
          idempotencyKey: `timing:${fingerprint}`,
          payloadVersion: 1,
          payload: { schemaVersion: 1 },
          requestedAt: this.now(),
        });
        const [job] = await tx
          .insert(jobs)
          .values({
            id: envelope.jobId,
            jobType: envelope.jobType,
            queueName: "pipeline",
            ...scope,
            correlationId: run.correlationId,
            inputVersion: fingerprint,
            idempotencyKey: envelope.idempotencyKey,
            payloadVersion: 1,
            payload: envelope.payload,
          })
          .onConflictDoNothing()
          .returning();
        const [existing] = job
          ? [job]
          : await tx
              .select()
              .from(jobs)
              .where(
                and(
                  eq(jobs.ownerUserId, scope.ownerUserId),
                  eq(jobs.projectId, scope.projectId),
                  eq(jobs.idempotencyKey, envelope.idempotencyKey),
                ),
              );
        pending = activeJob(existing?.state);
        if (job)
          await tx.insert(outboxEvents).values({
            id: createId(),
            jobId: job.id,
            queueName: "pipeline",
            eventType: "lesson.timing.reconcile.v1",
            envelope,
            deliveryOptions: { maxAttempts: 3, retryDelayMs: 5000 },
          });
      });
    }
    pending = (await this.recoverAssets(run, scope)) || pending;
    if (!pending)
      pending = await this.recoverGrounding(run, scope, state, report);
    if (pending) {
      await this.database
        .update(lessonRecoveryRuns)
        .set({ state: "running", updatedAt: this.now() })
        .where(eq(lessonRecoveryRuns.id, run.id));
    } else {
      report = await this.validation.run({ ...scope, body: {} });
      await this.database
        .update(lessonRecoveryRuns)
        .set({
          state: report.status === "passed" ? "succeeded" : "needs_action",
          revision: state.row.revision,
          validationRunId: report.id,
          updatedAt: this.now(),
        })
        .where(eq(lessonRecoveryRuns.id, run.id));
    }
  }
}
