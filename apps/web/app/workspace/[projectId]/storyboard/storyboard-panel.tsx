"use client";

import { useCallback, useEffect, useState } from "react";
import {
  storyboardResponseSchema,
  type LessonStoryboard,
  type LessonStoryboardScene,
  type StoryboardResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  storyboardFailureMessage,
  storyboardGenerationStateLabel,
  storyboardValidationWarnings,
} from "./storyboard-input";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: StoryboardResponse }
  | { kind: "failed"; message: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
    ? payload.error.message
    : fallback;
}

function visualSummary(scene: LessonStoryboardScene): string {
  return JSON.stringify(scene.scene.visual).slice(0, 200);
}

export function StoryboardPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/storyboard`),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error("storyboard");
    const parsed = storyboardResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("storyboard");
    setView({ kind: "ready", value: parsed.data });
    return parsed.data;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void refresh()
      .catch(() => {
        if (!cancelled)
          setView({
            kind: "failed",
            message: "We could not load the storyboard. Please try again.",
          });
      })
      .then(() => {
        cancelled = true;
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = view.kind === "ready" ? view.value : null;
  const generating = value !== null && isGenerating(value.state);

  useEffect(() => {
    if (!pending && !generating) return;
    const timer = window.setInterval(() => {
      void refresh()
        .then(() => setPending(false))
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [pending, generating, refresh]);

  const generate = useCallback(async () => {
    setActionMessage(null);
    setSubmitting(true);
    setPending(true);
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/storyboard/generate`),
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "idempotency-key": globalThis.crypto.randomUUID() },
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          extractErrorMessage(
            payload,
            "Unable to start storyboard generation.",
          ),
        );
      await refresh().catch(() => undefined);
    } catch (error) {
      setPending(false);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start storyboard generation.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  if (view.kind === "loading")
    return (
      <section aria-labelledby="storyboard-heading">
        <h2 id="storyboard-heading">Storyboard</h2>
        <p role="status">Loading the storyboard.</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section aria-labelledby="storyboard-heading">
        <h2 id="storyboard-heading">Storyboard</h2>
        <p role="alert">{view.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const storyboard = view.value.storyboard;
  const approved = view.value.approved;
  const warnings = storyboardValidationWarnings(view.value.validation);

  return (
    <section aria-labelledby="storyboard-heading">
      <h2 id="storyboard-heading">Storyboard</h2>

      <p role="status">{storyboardGenerationStateLabel(view.value.state)}</p>

      {view.value.stale ? (
        <p role="status">
          {view.value.staleReason ??
            "This storyboard is out of date. Review the narration, outline, source, or configuration before continuing."}
        </p>
      ) : null}

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert">
          {storyboardFailureMessage(view.value.latestJob.errorCode)}
        </p>
      ) : null}

      {actionMessage !== null ? <p role="alert">{actionMessage}</p> : null}

      {view.value.canGenerate ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={submitting || generating}
        >
          {submitting || generating
            ? "Starting generation…"
            : storyboard === null
              ? "Generate storyboard"
              : "Regenerate storyboard"}
        </button>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} role="alert">
          {warning}
        </p>
      ))}

      {approved !== null && approved.id !== storyboard?.id ? (
        <p role="status">
          An approved storyboard still guides production until you review this
          draft.
        </p>
      ) : null}

      {storyboard === null ? (
        <p role="status">
          Confirm the reviewed source, save the lesson configuration, approve
          the lesson outline, and generate narration before generating a
          storyboard.
        </p>
      ) : (
        <StoryboardDraft
          storyboard={storyboard}
          approved={approved}
          projectId={projectId}
        />
      )}
    </section>
  );
}

function StoryboardDraft({
  storyboard,
  approved,
  projectId,
}: {
  storyboard: LessonStoryboard;
  approved: LessonStoryboard | null;
  projectId: string;
}) {
  return (
    <div>
      <p>
        {storyboard.status === "approved" ? "Approved" : "Draft"} storyboard{" "}
        {storyboard.id.slice(0, 8)} — prompt {storyboard.promptId}@
        {storyboard.promptVersion}, configuration v
        {storyboard.configurationVersion}. Total duration:{" "}
        {storyboard.totalDurationSeconds} seconds (target{" "}
        {storyboard.targetDurationSeconds}).
      </p>

      <ol aria-label="Storyboard scenes" data-testid="storyboard-scenes">
        {storyboard.scenes.map((scene) => (
          <li key={scene.id} data-testid={`storyboard-scene-${scene.id}`}>
            <p>
              {scene.order}. {scene.template} — {scene.durationSeconds}s ·{" "}
              {scene.narrationBlockIds.length} narration block
              {scene.narrationBlockIds.length === 1 ? "" : "s"}
              {scene.scene.title !== undefined
                ? ` · ${scene.scene.title}`
                : ""}
            </p>
            <p>{scene.scene.narration}</p>
            {scene.scene.onScreenText.length > 0 ? (
              <p>On screen: {scene.scene.onScreenText.join(" · ")}</p>
            ) : null}
            <p>Visual: {visualSummary(scene)}</p>
            {scene.assetRequirements.length > 0 ? (
              <ul aria-label="Planned assets">
                {scene.assetRequirements.map((requirement, index) => (
                  <li key={`${requirement.slot}-${index}`}>
                    {requirement.slot}: {requirement.purpose}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      {approved !== null ? (
        <section aria-label="Approved storyboard">
          <h3>Approved storyboard</h3>
          <ol>
            {approved.scenes.map((scene) => (
              <li key={scene.id}>
                {scene.order}. {scene.template} · {scene.durationSeconds}s
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p role="status">
        <a href={`/workspace/${encodeURIComponent(projectId)}/narration`}>
          Review the narration
        </a>{" "}
        if the storyboard does not match your plan.
      </p>
    </div>
  );
}
