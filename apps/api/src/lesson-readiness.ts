import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  lessonSpecs,
  lessonRecoveryRuns,
  lessonRecoveryTasks,
  lessonRecoveryActivity,
  lessonPreparationMilestones,
  usageRecords,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  lessonStoryboardSchema,
  lessonReadinessSchema,
  recoveryTaskSchema,
  type LessonReadiness,
  type RecoveryTask,
  type ValidationIssue,
  type LessonValidationRun,
} from "@avlp/schemas";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { LessonValidationService } from "./lesson-validation.js";

export type RecoveryScope = { ownerUserId: Identifier; projectId: Identifier };
const audioCodes = new Set([
  "audio_missing",
  "audio_not_ready",
  "audio_duration_mismatch",
  "captions_missing",
  "captions_not_ready",
  "caption_timing_invalid",
  "narration_duration_mismatch",
]);

/** Display aggregation only. The validator remains the render authority. */
export function recoveryTasksForIssues(
  issues: readonly ValidationIssue[],
): RecoveryTask[] {
  const groups = new Map<string, RecoveryTask>();
  for (const issue of issues) {
    if (issue.severity === "info" || issue.acknowledgedAt !== null) continue;
    if (
      issue.severity === "warning" &&
      issue.code !== "grounding_recheck_required"
    )
      continue;
    const operation = audioCodes.has(issue.code)
      ? "audio"
      : issue.code === "lesson_duration_mismatch"
        ? "timing"
        : issue.code === "grounding_recheck_required" &&
            issue.fieldPath.endsWith(".sourceRefs")
          ? "grounding"
          : issue.scopeType === "asset"
            ? "asset"
            : "review";
    const sceneId = operation === "grounding" ? null : issue.sceneId;
    const id = `${sceneId ?? "lesson"}:${operation}`;
    const existing = groups.get(id);
    if (existing) {
      existing.issueCodes.push(issue.code);
      continue;
    }
    const source = issue.scopeType === "grounding";
    const asset = issue.scopeType === "asset";
    groups.set(id, {
      id,
      sceneId,
      operation,
      issueCodes: [issue.code],
      state: "needs_action",
      attempts: 0,
      failureCode: null,
      fieldPath: issue.fieldPath,
      message:
        operation === "audio"
          ? "Audio, captions and scene timing need preparation."
          : operation === "timing"
            ? "The lesson timing will follow the finished narration."
            : operation === "grounding"
              ? "Source checking has not caught up with this revision."
              : issue.message,
      action:
        operation === "review" || operation === "asset"
          ? source
            ? "review_sources"
            : asset
              ? "review_assets"
              : "review_content"
          : "prepare",
    });
  }
  // Target-duration drift is a consequence of unfinished media, not a second repair.
  const tasks = [...groups.values()];
  return tasks.some((task) => task.operation === "audio")
    ? tasks.filter((task) => task.operation !== "timing")
    : tasks;
}

export function readinessCapabilities(
  hasDraft: boolean,
  validation: LessonValidationRun | null,
) {
  return {
    edit: hasDraft,
    preview: hasDraft,
    render:
      hasDraft &&
      validation !== null &&
      !validation.stale &&
      validation.status === "passed" &&
      !validation.issues.some((issue) => issue.severity === "error"),
  };
}

export class LessonReadinessService {
  /** Concurrent reads in this process share one revalidation per project. */
  private readonly revalidating = new Map<
    string,
    ReturnType<LessonValidationService["run"]>
  >();

  constructor(
    private readonly database: DatabaseClient,
    private readonly validation: LessonValidationService,
    public readonly enabled: boolean,
    /** Polling reads revalidate a stale report at most this often. */
    private readonly revalidateAfterMs = 10_000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private revalidate(scope: RecoveryScope) {
    const key = `${scope.ownerUserId}:${scope.projectId}`;
    let pending = this.revalidating.get(key);
    if (!pending) {
      pending = this.validation
        .run({ ...scope, body: {} })
        .finally(() => this.revalidating.delete(key));
      this.revalidating.set(key, pending);
    }
    return pending;
  }

  async currentSpec(
    scope: RecoveryScope,
    database: DatabaseExecutor = this.database,
  ) {
    const find = async (status: "draft" | "approved") =>
      (
        await database
          .select()
          .from(lessonSpecs)
          .where(
            and(
              eq(lessonSpecs.ownerUserId, scope.ownerUserId),
              eq(lessonSpecs.projectId, scope.projectId),
              eq(lessonSpecs.status, status),
            ),
          )
          .orderBy(desc(lessonSpecs.generatedAt))
          .limit(1)
      )[0];
    const spec = (await find("draft")) ?? (await find("approved"));
    if (!spec)
      throw new PublicError(
        "not_found",
        "Generate a storyboard before preparing the lesson.",
        404,
      );
    return {
      row: spec,
      storyboard: lessonStoryboardSchema.parse(spec.payload),
    };
  }

  async read(scope: RecoveryScope): Promise<LessonReadiness> {
    const { row, storyboard } = await this.currentSpec(scope);
    if (this.enabled) await this.recordMilestone(scope, row);
    let validation = await this.validation.latest(scope);
    // Each open tab polls every few seconds while media prepares. A stale
    // report is shown (render stays blocked) until the throttle window passes.
    if (
      this.enabled &&
      (!validation ||
        ((validation.stale ||
          validation.lessonSpecRevision !== row.revision ||
          validation.lessonSpecId !== row.id) &&
          this.now().getTime() - Date.parse(validation.completedAt) >=
            this.revalidateAfterMs))
    )
      validation = await this.revalidate(scope);
    if (
      validation &&
      (validation.lessonSpecRevision !== row.revision ||
        validation.lessonSpecId !== row.id)
    )
      validation = { ...validation, stale: true };
    const [run] = this.enabled
      ? await this.database
          .select()
          .from(lessonRecoveryRuns)
          .where(
            and(
              eq(lessonRecoveryRuns.ownerUserId, scope.ownerUserId),
              eq(lessonRecoveryRuns.projectId, scope.projectId),
              isNull(lessonRecoveryRuns.stoppedAt),
            ),
          )
          .orderBy(desc(lessonRecoveryRuns.createdAt))
          .limit(1)
      : [];
    const persisted = run
      ? await this.database
          .select()
          .from(lessonRecoveryTasks)
          .where(
            and(
              eq(lessonRecoveryTasks.ownerUserId, scope.ownerUserId),
              eq(lessonRecoveryTasks.projectId, scope.projectId),
              eq(lessonRecoveryTasks.runId, run.id),
            ),
          )
      : [];
    const tasks = recoveryTasksForIssues(validation?.issues ?? []);
    for (const task of tasks) {
      const saved = persisted
        .filter(
          (item) =>
            item.sceneId === task.sceneId &&
            (item.operation === task.operation ||
              (task.operation === "audio" && item.operation === "captions")) &&
            item.state !== "superseded",
        )
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
      if (saved) {
        task.id = saved.id;
        task.state = recoveryTaskSchema.shape.state.parse(saved.state);
        task.attempts = saved.attempts;
        task.failureCode = saved.failureCode;
        if (saved.failureCode === "RECOVERY_ALLOWANCE_EXHAUSTED") {
          task.action = "approve_usage";
          task.message =
            "The approved preparation allowance has been used. Approve more usage to continue.";
        }
        if (
          saved.state === "needs_action" &&
          saved.failureCode === "RECOVERY_REVIEW_REQUIRED"
        ) {
          task.action =
            task.operation === "grounding"
              ? "review_sources"
              : task.operation === "asset"
                ? "review_assets"
                : "review_content";
          task.message =
            "Preparation needs a review of this dependency before it can continue. Your edits are saved.";
        }
        if (["queued", "running", "retry_wait"].includes(saved.state)) {
          task.action = null;
          task.message =
            saved.state === "retry_wait"
              ? "Retrying narration preparation. You can keep editing."
              : "Preparing audio, captions and timing. You can keep editing.";
        } else if (saved.state === "failed") {
          task.action =
            task.operation === "asset"
              ? "review_assets"
              : task.operation === "grounding"
                ? "review_sources"
                : saved.attempts >= 3 ||
                    saved.failureCode === "RECOVERY_NO_PROGRESS"
                  ? "review_content"
                  : "retry";
          task.message =
            "Preparation could not finish. Your work is saved. Review the scene or retry when the service is available.";
        }
      }
      if (task.operation === "audio" && run?.failureCode === "VOICE_REQUIRED") {
        task.state = "needs_action";
        task.action = "choose_voice";
        task.message =
          "Choose a narration voice to finish preparing this lesson.";
      }
      if (
        run?.failureCode === "RECOVERY_SERVICE_UNAVAILABLE" &&
        task.operation !== "review"
      ) {
        task.state = "failed";
        task.action = "retry";
        task.message =
          "Preparation is unavailable. Your work is saved. Retry when the service is available.";
      }
    }
    const capabilities = readinessCapabilities(
      storyboard.scenes.length > 0,
      validation,
    );
    const activity = this.enabled
      ? await this.database
          .select()
          .from(lessonRecoveryActivity)
          .where(
            and(
              eq(lessonRecoveryActivity.ownerUserId, scope.ownerUserId),
              eq(lessonRecoveryActivity.projectId, scope.projectId),
            ),
          )
          .orderBy(desc(lessonRecoveryActivity.occurredAt))
          .limit(50)
      : [];
    const [milestone] = this.enabled
      ? await this.database
          .select()
          .from(lessonPreparationMilestones)
          .where(
            and(
              eq(lessonPreparationMilestones.ownerUserId, scope.ownerUserId),
              eq(lessonPreparationMilestones.projectId, scope.projectId),
              eq(lessonPreparationMilestones.lessonSpecId, row.id),
            ),
          )
      : [];
    const [counts] = this.enabled
      ? await this.database
          .select({
            succeeded: sql<string>`count(*) filter (where ${lessonRecoveryTasks.state} = 'succeeded')`,
            retries: sql<string>`coalesce(sum(greatest(0, ${lessonRecoveryTasks.attempts} - 1)), 0)`,
          })
          .from(lessonRecoveryTasks)
          .where(
            and(
              eq(lessonRecoveryTasks.ownerUserId, scope.ownerUserId),
              eq(lessonRecoveryTasks.projectId, scope.projectId),
            ),
          )
      : [];
    const [cost] = this.enabled
      ? await this.database
          .select({
            total: sql<string>`coalesce(sum(${usageRecords.estimatedCostUsd}), 0)`,
          })
          .from(usageRecords)
          .where(
            and(
              eq(usageRecords.ownerUserId, scope.ownerUserId),
              eq(usageRecords.projectId, scope.projectId),
              sql`exists (select 1 from lesson_recovery_tasks t where t.owner_user_id = ${scope.ownerUserId} and t.project_id = ${scope.projectId} and t.job_id::text = ${usageRecords.metadata}->'providerSelection'->>'approvalReference')`,
            ),
          )
      : [];
    return lessonReadinessSchema.parse({
      enabled: this.enabled,
      revision: row.revision,
      capabilities,
      state: tasks.some((task) => task.state === "retry_wait")
        ? "recovering"
        : tasks.some((task) => ["running", "queued"].includes(task.state))
          ? "preparing"
          : tasks.some((task) => task.state === "failed")
            ? "unavailable"
            : tasks.some((task) => task.state === "needs_action")
              ? "needs_action"
              : capabilities.render ? "ready" : "needs_action",
      actualDurationSeconds: storyboard.scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
      targetDurationSeconds: storyboard.targetDurationSeconds,
      validationRunId: validation?.id ?? null,
      runId: run?.id ?? null,
      tasks,
      completedTasks: persisted.filter((task) => task.state === "succeeded")
        .length,
      allowanceUsd: Number(run?.allowanceUsd ?? 0),
      reservedUsd: Number(run?.reservedUsd ?? 0),
      activity: activity.map((entry) => ({
        id: entry.id,
        sceneId: entry.sceneId,
        operation: entry.operation,
        state: entry.state,
        attempts: entry.attempts,
        occurredAt: entry.occurredAt.toISOString(),
        message: recoveryActivityMessage(entry.operation, entry.state),
      })),
      ...(milestone
        ? {
            metrics: {
              timeToEditableMs: Math.max(
                0,
                milestone.firstEditableAt.getTime() -
                  milestone.generatedAt.getTime(),
              ),
              timeToPreviewMs: milestone.firstPreviewAt
                ? Math.max(
                    0,
                    milestone.firstPreviewAt.getTime() -
                      milestone.generatedAt.getTime(),
                  )
                : null,
              successfulRepairs: Number(counts?.succeeded ?? 0),
              unresolvedTasks: tasks.filter(
                (task) =>
                  !["succeeded", "superseded", "cancelled"].includes(
                    task.state,
                  ),
              ).length,
              retryCount: Number(counts?.retries ?? 0),
              recoveryCostUsd: Number(cost?.total ?? 0),
            },
          }
        : {}),
    });
  }

  private async recordMilestone(
    scope: RecoveryScope,
    spec: Awaited<ReturnType<LessonReadinessService["currentSpec"]>>["row"],
  ) {
    await this.database
      .insert(lessonPreparationMilestones)
      .values({
        id: createId(),
        ...scope,
        lessonSpecId: spec.id,
        generatedAt: spec.generatedAt,
        firstEditableAt: new Date(),
      })
      .onConflictDoNothing();
  }

  async recordPreview(scope: RecoveryScope) {
    if (!this.enabled) return;
    const { row } = await this.currentSpec(scope);
    await this.recordMilestone(scope, row);
    await this.database
      .update(lessonPreparationMilestones)
      .set({ firstPreviewAt: new Date() })
      .where(
        and(
          eq(lessonPreparationMilestones.ownerUserId, scope.ownerUserId),
          eq(lessonPreparationMilestones.projectId, scope.projectId),
          eq(lessonPreparationMilestones.lessonSpecId, row.id),
          isNull(lessonPreparationMilestones.firstPreviewAt),
        ),
      );
  }
}

function recoveryActivityMessage(operation: string, state: string) {
  const subject =
    operation === "audio"
      ? "Audio and captions"
      : operation === "captions"
        ? "Captions"
        : operation === "grounding"
          ? "Source check"
          : operation === "asset"
            ? "Visual preparation"
            : "Lesson preparation";
  const outcome =
    state === "succeeded"
      ? "finished"
      : state === "retry_wait"
        ? "is waiting to retry"
        : state === "failed"
          ? "could not finish; review the available action"
          : state === "needs_action"
            ? "needs your review"
            : state === "cancelled"
              ? "was stopped"
              : state === "superseded"
                ? "was replaced after an edit"
                : state === "running"
                  ? "is running"
                  : "is queued";
  return `${subject} ${outcome}.`;
}
