import { PublicError, type Identifier } from "@avlp/config";
import {
  lessonSpecs,
  lessonRecoveryRuns,
  lessonRecoveryTasks,
  type DatabaseClient,
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
import { and, desc, eq, isNull } from "drizzle-orm";
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
        : issue.code === "grounding_recheck_required"
          ? "grounding"
          : "review";
    const id = `${issue.sceneId ?? "lesson"}:${operation}`;
    const existing = groups.get(id);
    if (existing) {
      existing.issueCodes.push(issue.code);
      continue;
    }
    const source = issue.scopeType === "grounding";
    const asset = issue.scopeType === "asset";
    groups.set(id, {
      id,
      sceneId: issue.sceneId,
      operation,
      issueCodes: [issue.code],
      state: "needs_action",
      attempts: 0,
      failureCode: null,
      message:
        operation === "audio"
          ? "Audio, captions and scene timing need preparation."
          : operation === "timing"
            ? "The lesson timing will follow the finished narration."
            : operation === "grounding"
              ? "Source checking has not caught up with this revision."
              : issue.message,
      action:
        operation === "review"
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
  constructor(
    private readonly database: DatabaseClient,
    private readonly validation: LessonValidationService,
    public readonly enabled: boolean,
  ) {}

  async currentSpec(scope: RecoveryScope) {
    const find = async (status: "draft" | "approved") =>
      (
        await this.database
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
    const validation = await this.validation.latest(scope);
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
        if (["queued", "running", "retry_wait"].includes(saved.state)) {
          task.action = null;
          task.message =
            saved.state === "retry_wait"
              ? "Retrying narration preparation. You can keep editing."
              : "Preparing audio, captions and timing. You can keep editing.";
        } else if (saved.state === "failed") {
          task.action = "retry";
          task.message =
            "Preparation could not finish. Your work is saved. Review the scene or retry when the service is available.";
        }
      }
    }
    const capabilities = readinessCapabilities(
      storyboard.scenes.length > 0,
      validation,
    );
    return lessonReadinessSchema.parse({
      enabled: this.enabled,
      revision: row.revision,
      capabilities,
      state: capabilities.render
        ? "ready"
        : tasks.some((task) => task.state === "retry_wait")
          ? "recovering"
          : tasks.some((task) => ["running", "queued"].includes(task.state))
            ? "preparing"
            : tasks.some((task) => task.state === "failed")
              ? "unavailable"
              : "needs_action",
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
    });
  }
}
