"use client";

import { useCallback, useEffect, useState } from "react";
import {
  outlineResponseSchema,
  type LessonOutlineItem,
  type LessonOutlineSet,
  type OutlineResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  outlineFailureMessage,
  outlineGenerationStateLabel,
  outlineItemKindLabel,
} from "./outline-input";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: OutlineResponse }
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

export function OutlinePanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/outline`),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error("outline");
    const parsed = outlineResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("outline");
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
            message: "We could not load the lesson outline. Please try again.",
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
        apiUrl(`/projects/${encodeURIComponent(projectId)}/outline/generate`),
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
          extractErrorMessage(payload, "Unable to start outline generation."),
        );
      await refresh().catch(() => undefined);
    } catch (error) {
      setPending(false);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start outline generation.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  if (view.kind === "loading")
    return (
      <section aria-labelledby="outline-heading">
        <h2 id="outline-heading">Lesson outline</h2>
        <p role="status">Loading the lesson outline.</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section aria-labelledby="outline-heading">
        <h2 id="outline-heading">Lesson outline</h2>
        <p role="alert">{view.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const draft = view.value.set;
  const approved = view.value.approved;

  return (
    <section aria-labelledby="outline-heading">
      <h2 id="outline-heading">Lesson outline</h2>

      <p role="status">{outlineGenerationStateLabel(view.value.state)}</p>

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert">
          {outlineFailureMessage(view.value.latestJob.errorCode)}
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
            : draft === null
              ? "Generate outline"
              : "Regenerate outline"}
        </button>
      ) : null}

      {approved !== null && approved.id !== draft?.id ? (
        <p role="status">
          An approved outline still guides the lesson until you review this
          draft.
        </p>
      ) : null}

      {draft === null ? (
        <p role="status">
          Confirm the reviewed source, save the lesson configuration, and
          approve learning objectives before generating the outline.
        </p>
      ) : (
        <OutlineList set={draft} />
      )}
    </section>
  );
}

function OutlineList({ set }: { set: LessonOutlineSet }) {
  return (
    <div>
      <p>
        {set.status === "approved" ? "Approved outline" : "Draft outline"}{" "}
        {set.id.slice(0, 8)} — prompt {set.promptId}@{set.promptVersion},
        configuration v{set.configurationVersion}. Estimated total:{" "}
        {set.totalEstimatedSeconds} seconds.
      </p>

      <ol aria-label="Outline items">
        {set.items.map((item) => (
          <li key={item.id}>
            <OutlineItem item={item} />
          </li>
        ))}
      </ol>

      <p role="status">
        Teacher editing and approval of the outline arrive in the next step.
      </p>
    </div>
  );
}

function OutlineItem({ item }: { item: LessonOutlineItem }) {
  return (
    <>
      <p>
        {item.order}. {item.title} — {outlineItemKindLabel(item.kind)} ·{" "}
        {item.estimatedSeconds}s
      </p>
      <p>{item.description}</p>
      {item.framingNote !== null ? (
        <p role="status">Generated framing: {item.framingNote}</p>
      ) : null}
      <p>
        Covers {item.objectiveIds.length} approved objective
        {item.objectiveIds.length === 1 ? "" : "s"} ·{" "}
        {item.sourceRefs.length === 0
          ? "No source references"
          : `${item.sourceRefs.reduce(
              (count, ref) => count + ref.blockIds.length,
              0,
            )} source block${item.sourceRefs.reduce(
              (count, ref) => count + ref.blockIds.length,
              0,
            ) === 1 ? "" : "s"}`}
      </p>
    </>
  );
}
