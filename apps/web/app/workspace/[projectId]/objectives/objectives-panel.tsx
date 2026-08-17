"use client";

import { useCallback, useEffect, useState } from "react";
import {
  objectivesResponseSchema,
  type LearningObjectiveSet,
  type ObjectivesResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  objectiveFailureMessage,
  objectiveGenerationStateLabel,
} from "./objectives-input";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: ObjectivesResponse }
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

function citationText(sourceRefs: LearningObjectiveSet["objectives"][number]["sourceRefs"]) {
  return sourceRefs
    .map((ref) => {
      const pages = ref.pageEnd === undefined ? `p. ${ref.pageStart}` : `pp. ${ref.pageStart}–${ref.pageEnd}`;
      return `${ref.sectionId?.slice(0, 8) ?? ""} ${pages} (${ref.blockIds.length} block${ref.blockIds.length === 1 ? "" : "s"})`;
    })
    .join(", ");
}

export function ObjectivesPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/objectives`),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error("objectives");
    const parsed = objectivesResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("objectives");
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
            message: "We could not load the learning objectives. Please try again.",
          });
      })
      .then(() => {
        cancelled = true;
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const generating =
    view.kind === "ready" && isGenerating(view.value.state);

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
        apiUrl(`/projects/${encodeURIComponent(projectId)}/objectives/generate`),
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
            "Unable to start objective generation.",
          ),
        );
      await refresh().catch(() => undefined);
    } catch (error) {
      setPending(false);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start objective generation.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  if (view.kind === "loading")
    return (
      <section aria-labelledby="objectives-heading">
        <h2 id="objectives-heading">Learning objectives</h2>
        <p role="status">Loading learning objectives.</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section aria-labelledby="objectives-heading">
        <h2 id="objectives-heading">Learning objectives</h2>
        <p role="alert">{view.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const value = view.value;
  const draft = value.set;

  return (
    <section aria-labelledby="objectives-heading">
      <h2 id="objectives-heading">Learning objectives</h2>

      <p role="status">{objectiveGenerationStateLabel(value.state)}</p>

      {value.latestJob?.state === "failed" && draft === null ? (
        <p role="alert">
          {objectiveFailureMessage(value.latestJob.errorCode)}
        </p>
      ) : null}

      {actionMessage !== null ? <p role="alert">{actionMessage}</p> : null}

      {value.canGenerate ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={submitting || generating}
        >
          {submitting || generating
            ? "Starting generation…"
            : draft === null
              ? "Generate objectives"
              : "Regenerate objectives"}
        </button>
      ) : (
        <p role="status">
          Confirm the reviewed source and save the lesson configuration before
          generating objectives.
        </p>
      )}

      {draft === null ? null : <ObjectiveSetView set={draft} />}
    </section>
  );
}

function ObjectiveSetView({ set }: { set: LearningObjectiveSet }) {
  return (
    <div>
      <p>
        Draft set {set.id.slice(0, 8)} — prompt {set.promptId}@{set.promptVersion},
        configuration v{set.configurationVersion}.
      </p>
      <ol aria-label="Objectives">
        {set.objectives.map((objective) => (
          <li key={objective.id}>
            <p>
              {objective.order}. {objective.statement}
            </p>
            <p>
              Measurable verb: {objective.verb}. Confidence:{" "}
              {objective.confidence.toFixed(2)}.
            </p>
            <p>Source: {citationText(objective.sourceRefs)}.</p>
          </li>
        ))}
      </ol>

      {set.keyConcepts.length > 0 ? (
        <section aria-label="Key concepts">
          <h3>Key concepts</h3>
          <ul>
            {set.keyConcepts.map((item) => (
              <li key={item.id}>
                {item.text} — {citationText(item.sourceRefs)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {set.prerequisiteKnowledge.length > 0 ? (
        <section aria-label="Prerequisite knowledge">
          <h3>Prerequisite knowledge</h3>
          <ul>
            {set.prerequisiteKnowledge.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {set.vocabulary.length > 0 ? (
        <section aria-label="Vocabulary">
          <h3>Vocabulary</h3>
          <ul>
            {set.vocabulary.map((item) => (
              <li key={item.id}>
                <strong>{item.term}</strong> — {item.definition}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {set.misconceptions.length > 0 ? (
        <section aria-label="Misconceptions">
          <h3>Likely misconceptions</h3>
          <ul>
            {set.misconceptions.map((item) => (
              <li key={item.id}>
                <strong>{item.misconception}</strong> — {item.correction}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {set.assessmentQuestions.length > 0 ? (
        <section aria-label="Assessment questions">
          <h3>Possible assessment questions</h3>
          <ul>
            {set.assessmentQuestions.map((item) => (
              <li key={item.id}>{item.question}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
