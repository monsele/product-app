"use client";

import React, { useState } from "react";
import {
  recoveryEstimateSchema,
  type LessonReadiness,
  type RecoveryEstimate,
  type RecoveryTask,
} from "@avlp/schemas";
import { preparationUrl } from "./use-lesson-readiness";
import styles from "./preparation.module.css";

export const preparationTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
export function preparationHeadline(state: LessonReadiness): string {
  const count = state.tasks.filter((task) =>
    ["queued", "running", "retry_wait"].includes(task.state),
  ).length;
  if (state.state === "ready")
    return `Ready to render · ${preparationTime(state.actualDurationSeconds)}`;
  if (state.state === "unavailable")
    return "Preparation is unavailable. Your work is saved.";
  if (state.state === "recovering")
    return `Retrying preparation for ${count} ${count === 1 ? "scene" : "scenes"}.`;
  if (state.state === "preparing")
    return `Preparing audio and captions for ${count} ${count === 1 ? "scene" : "scenes"}.`;
  return state.tasks.some((task) => task.operation === "review")
    ? "Your lesson needs a review."
    : "Finish preparing your lesson.";
}
const actionLabels: Record<NonNullable<RecoveryTask["action"]>, string> = {
  prepare: "Finish preparing lesson",
  retry: "Retry preparation",
  approve_usage: "Approve additional usage",
  review_content: "Review scene",
  review_sources: "Open source references",
  review_assets: "Review visual",
  choose_voice: "Choose voice",
};

export function PreparationSummary({
  projectId,
  readiness,
  error,
  onRefresh,
  onNavigate,
  sceneLabels = {},
}: {
  projectId: string;
  readiness: LessonReadiness;
  error?: string | null;
  onRefresh: () => Promise<unknown>;
  onNavigate: (task: RecoveryTask) => void;
  sceneLabels?: Readonly<Record<string, string>>;
}) {
  const [estimate, setEstimate] = useState<RecoveryEstimate | null>(null);
  const [intent, setIntent] = useState<
    "prepare" | "retry" | "increase_allowance"
  >("prepare");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const command = async (suffix: string, body: unknown) => {
    const response = await fetch(preparationUrl(projectId, suffix), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const result: unknown = await response.json().catch(() => null);
      const detail = result as { error?: { message?: unknown } } | null;
      throw new Error(
        typeof detail?.error?.message === "string"
          ? detail.error.message
          : "Preparation could not start. Refresh the estimate and try again.",
      );
    }
    await onRefresh();
  };
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (failure) {
      setMessage(
        failure instanceof Error ? failure.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const requestEstimate = (nextIntent: typeof intent) =>
    void act(async () => {
      setIntent(nextIntent);
      const response = await fetch(
        preparationUrl(projectId, "recovery/estimate"),
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok)
        throw new Error(
          "The preparation estimate is unavailable. Your work is saved.",
        );
      setEstimate(recoveryEstimateSchema.parse(await response.json()));
    });
  const start = () =>
    void act(async () => {
      if (!estimate) return;
      await command("recovery", {
        intent,
        expectedRevision: estimate.revision,
        estimateFingerprint: estimate.fingerprint,
        acceptedMaximumCostUsd: estimate.maximumCostUsd,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
      setEstimate(null);
    });
  const navigate = (task: RecoveryTask) => {
    if (
      task.action === "prepare" ||
      task.action === "retry" ||
      task.action === "approve_usage"
    )
      requestEstimate(
        task.action === "approve_usage" ? "increase_allowance" : task.action,
      );
    else onNavigate(task);
  };
  if (!readiness.enabled) return null;
  return (
    <section className={styles.summary} aria-label="Lesson preparation">
      <div className={styles.heading}>
        <div>
          <p className={styles.headline} role="status">
            {preparationHeadline(readiness)}
          </p>
          <p className={styles.help}>
            {readiness.state === "ready"
              ? `Planning estimate: ${preparationTime(readiness.targetDurationSeconds)}.`
              : "You can keep editing and preview available scenes."}
          </p>
        </div>
        {!readiness.runId &&
        readiness.tasks.some((task) => task.action === "prepare") ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => requestEstimate("prepare")}
          >
            Finish preparing lesson
          </button>
        ) : null}
      </div>
      {estimate ? (
        <div
          className={styles.authorization}
          aria-label="Preparation allowance"
        >
          <p>
            {readiness.runId && intent !== "increase_allowance"
              ? `Use the remaining approved allowance of up to $${Math.max(0, readiness.allowanceUsd - readiness.reservedUsd).toFixed(4)}.`
              : `Approve up to $${estimate.maximumCostUsd.toFixed(4)}${intent === "increase_allowance" ? " additional usage" : " for preparation and recovery"}.`}
          </p>
          <p>
            Includes up to three attempts per operation and saved edits in this
            preparation session. Teaching content stays under your control.
          </p>
          <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={start}>
              {busy ? "Starting…" : "Approve and prepare"}
            </button>
            <button
              type="button"
              onClick={() => setEstimate(null)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {message || error ? (
        <p role="alert">
          {message ?? error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await onRefresh();
              })
            }
          >
            Refresh status
          </button>
        </p>
      ) : null}
      <details>
        <summary>
          View progress
          {readiness.completedTasks > 0
            ? ` · ${readiness.completedTasks} ${readiness.completedTasks === 1 ? "task" : "tasks"} completed`
            : ""}
        </summary>
        <ul className={styles.tasks}>
          {readiness.tasks.map((task) => (
            <li key={task.id}>
              <strong>
                {task.sceneId
                  ? (sceneLabels[task.sceneId] ?? "Scene")
                  : "Lesson"}
              </strong>
              <p>{task.message}</p>
              <p className={styles.help}>
                {task.attempts > 0
                  ? `${task.attempts} of 3 attempts used.`
                  : "No recovery attempts yet."}
              </p>
              {task.action ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => navigate(task)}
                >
                  {actionLabels[task.action]}
                </button>
              ) : null}
              <details>
                <summary>Details</summary>
                <p>{task.issueCodes.join(", ")}</p>
                {task.failureCode ? <p>{task.failureCode}</p> : null}
              </details>
            </li>
          ))}
        </ul>
        <p className={styles.help}>
          Planning estimate: {preparationTime(readiness.targetDurationSeconds)}.
          Current running time:{" "}
          {preparationTime(readiness.actualDurationSeconds)}.
        </p>
        {readiness.runId ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await command("recovery/stop", {
                  expectedRevision: readiness.revision,
                  idempotencyKey: globalThis.crypto.randomUUID(),
                });
                setMessage(
                  "Preparation stopped. Calls already dispatched may still incur usage.",
                );
              })
            }
          >
            Stop further preparation
          </button>
        ) : null}
      </details>
    </section>
  );
}
