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
} from "@avlp/schemas";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  LessonReadinessService,
  type RecoveryScope,
} from "./lesson-readiness.js";
import type { LessonValidationService } from "./lesson-validation.js";
import { SceneAudioService, sceneAudioProvider } from "./scene-audio.js";
import type { OneShotPricing } from "./one-shot-budget.js";

type Run = typeof lessonRecoveryRuns.$inferSelect;
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const money = (value: number) => Math.ceil(value * 1_000_000) / 1_000_000;
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
  ) {}

  private assertEnabled() {
    if (!this.readiness.enabled)
      throw new PublicError(
        "not_found",
        "Lesson preparation is unavailable.",
        404,
      );
  }

  /** Free durable notification delivery; it neither grants nor expands authority. */
  async drainSignals(): Promise<number> {
    if (!this.readiness.enabled) return 0;
    const candidates = await this.database.select().from(lessonRecoverySignals)
      .where(sql`${lessonRecoverySignals.changedAt} <= ${new Date(this.now().getTime() - 2000).toISOString()}`)
      .orderBy(lessonRecoverySignals.changedAt).limit(100);
    let scheduled = 0;
    for (const candidate of candidates) {
      scheduled += await this.database.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${candidate.projectId}))`);
        const [run] = await tx.select().from(lessonRecoveryRuns).where(and(
          eq(lessonRecoveryRuns.ownerUserId, candidate.ownerUserId),
          eq(lessonRecoveryRuns.projectId, candidate.projectId),
          isNull(lessonRecoveryRuns.stoppedAt),
        )).for("update");
        // A running coordinator may have already read its inputs. Leave the
        // notification for its successor rather than losing that concurrent edit.
        if (run?.leaseUntil) return 0;
        const consumed = await tx.delete(lessonRecoverySignals).where(and(
          eq(lessonRecoverySignals.ownerUserId, candidate.ownerUserId),
          eq(lessonRecoverySignals.projectId, candidate.projectId),
          eq(lessonRecoverySignals.changedAt, candidate.changedAt),
        )).returning();
        if (!consumed.length || !run) return 0;
        await tx.update(lessonRecoveryRuns).set({ state: "queued", updatedAt: this.now() })
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
      const cost =
        sceneAudioProvider.providerId === "fixture-v1"
          ? 0
          : money(
              0.0001 +
                3 *
                  ((scene.scene.narration.length / 1_000_000) *
                    this.pricing.ttsCostUsdPerMillionCharacters +
                    this.pricing.alignmentCostUsdPerAudioMinute),
            );
      return { scene, audio, fingerprint, cost };
    });
    return { ...current, voice, entries };
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
        state.entries.reduce((sum, entry) => sum + entry.cost, 0),
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
          or(eq(lessonRecoveryRuns.idempotencyKey, command.idempotencyKey), sql`${lessonRecoveryRuns.authorizationRequests} ->> ${command.idempotencyKey} is not null`),
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
      if (
        oneShot &&
        ["queued", "running", "preparing", "repairing"].includes(oneShot.status)
      )
        throw new PublicError(
          "edit_conflict",
          "Lesson generation is already preparing this project. Its allowance will be reused.",
          409,
        );
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
        // Explicit retries retain lifetime attempts; terminal/no-progress content needs review.
        await tx
          .update(lessonRecoveryTasks)
          .set({
            state: "needs_action",
            jobId: null,
            priorAttempts: sql`${lessonRecoveryTasks.attempts}`,
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
              eq(lessonRecoveryTasks.state, "failed"),
              sql`${lessonRecoveryTasks.attempts} < 3`,
              sql`${lessonRecoveryTasks.failureCode} <> 'RECOVERY_NO_PROGRESS'`,
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
          priorAttempts: sql`${lessonRecoveryTasks.attempts}`,
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
    const { row } = await this.readiness.currentSpec(input);
    if (row.revision !== command.expectedRevision)
      throw new PublicError(
        "edit_conflict",
        "The lesson changed. Refresh before stopping preparation.",
        409,
      );
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const runs = await tx
        .update(lessonRecoveryRuns)
        .set({
          stoppedAt: this.now(),
          state: "cancelled",
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
              sql`${lessonRecoveryTasks.state} in ('queued','running','retry_wait')`,
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
    await this.database
      .update(lessonRecoveryRuns)
      .set({ failureCode: state.voice ? null : "VOICE_REQUIRED" })
      .where(eq(lessonRecoveryRuns.id, run.id));
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
    for (const task of previous)
      if (
        ["audio", "captions"].includes(task.operation) &&
        !fingerprints.has(task.fingerprint) &&
        !["succeeded", "superseded", "cancelled"].includes(task.state)
      )
        await this.database
          .update(lessonRecoveryTasks)
          .set({ state: "superseded", updatedAt: this.now() })
          .where(eq(lessonRecoveryTasks.id, task.id));
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
        report.issues.some((issue) => issue.sceneId === entry.scene.stableSceneId && issue.code === "audio_duration_mismatch")
      ) continue;
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
        for (const finished of previous.filter(
          (task) =>
            task.fingerprint === entry.fingerprint &&
            task.state !== "succeeded" &&
            ["audio", "captions"].includes(task.operation),
        ))
          await this.database.transaction(async (tx) => {
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtext(${scope.projectId}))`,
            );
            const spent = Object.values(
              z.record(z.number()).parse(finished.calls),
            ).reduce((sum, cost) => sum + cost, 0);
            const release = Math.max(0, Number(finished.reservedUsd) - spent);
            await tx
              .update(lessonRecoveryTasks)
              .set({
                state: "succeeded",
                reservedUsd: String(money(spent)),
                updatedAt: this.now(),
              })
              .where(eq(lessonRecoveryTasks.id, finished.id));
            await tx
              .update(lessonRecoveryRuns)
              .set({
                reservedUsd: sql`greatest(0, ${lessonRecoveryRuns.reservedUsd} - ${release})`,
              })
              .where(eq(lessonRecoveryRuns.id, finished.runId));
          });
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
      if (old?.jobId) {
        await this.database
          .update(lessonRecoveryTasks)
          .set({
            state: "failed",
            attempts: Math.min(3, old.priorAttempts + (job?.attempts ?? 0)),
            failureCode:
              job?.state === "succeeded"
                ? "RECOVERY_NO_PROGRESS"
                : (entry.audio?.failureCode ?? "RECOVERY_JOB_FAILED"),
            updatedAt: this.now(),
          })
          .where(eq(lessonRecoveryTasks.id, old.id));
        continue;
      }
      if (!state.voice || entry.scene.scene.narration.trim().length === 0)
        continue;
      const priorAttempts =
        entry.audio?.status === "ready" ? 0 : (job?.attempts ?? 0);
      const canRetry =
        priorAttempts < 3 && job?.errorClassification !== "terminal";
      const reserved =
        entry.audio?.storageKey && entry.audio.durationMs ? 0 : entry.cost;
      const task =
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
        expectedRevision: state.row.revision,
        repairCaptions: codes.includes("caption_timing_invalid"),
        body: {
          idempotencyKey: `recovery:${task.id}:${task.priorAttempts}:${task.runId}`,
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
        const [existing] = job ? [job] : await tx.select().from(jobs).where(and(eq(jobs.ownerUserId, scope.ownerUserId), eq(jobs.projectId, scope.projectId), eq(jobs.idempotencyKey, envelope.idempotencyKey)));
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
    if (pending) {
      await this.database.update(lessonRecoveryRuns).set({ state: "running", updatedAt: this.now() }).where(eq(lessonRecoveryRuns.id, run.id));
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
