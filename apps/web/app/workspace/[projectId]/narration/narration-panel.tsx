"use client";

import { useCallback, useEffect, useState } from "react";
import {
  narrationResponseSchema,
  type LessonNarrationBlock,
  type LessonNarrationSet,
  type NarrationBudgetStatus,
  type NarrationResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  narrationBudgetStatusLabel,
  narrationFailureMessage,
  narrationGenerationStateLabel,
  narrationValidationWarnings,
} from "./narration-input";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: NarrationResponse }
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

function citationText(block: LessonNarrationBlock): string {
  if (block.sourceRefs.length === 0)
    return block.generatedAdditions.length > 0
      ? "Generated addition"
      : "No source references";
  const blocks = block.sourceRefs.reduce(
    (count, ref) => count + ref.blockIds.length,
    0,
  );
  return `${block.sourceRefs.length} section${
    block.sourceRefs.length === 1 ? "" : "s"
  }, ${blocks} source block${blocks === 1 ? "" : "s"}`;
}

export function NarrationPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/narration`),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error("narration");
    const parsed = narrationResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("narration");
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
            message: "We could not load the narration. Please try again.",
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
        apiUrl(`/projects/${encodeURIComponent(projectId)}/narration/generate`),
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
            "Unable to start narration generation.",
          ),
        );
      await refresh().catch(() => undefined);
    } catch (error) {
      setPending(false);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start narration generation.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  if (view.kind === "loading")
    return (
      <section aria-labelledby="narration-heading">
        <h2 id="narration-heading">Narration</h2>
        <p role="status">Loading the narration.</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section aria-labelledby="narration-heading">
        <h2 id="narration-heading">Narration</h2>
        <p role="alert">{view.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const draft = view.value.set;
  const approved = view.value.approved;
  const warnings = narrationValidationWarnings(view.value.validation);

  return (
    <section aria-labelledby="narration-heading">
      <h2 id="narration-heading">Narration</h2>

      <p role="status">{narrationGenerationStateLabel(view.value.state)}</p>

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert">
          {narrationFailureMessage(view.value.latestJob.errorCode)}
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
              ? "Generate narration"
              : "Regenerate narration"}
        </button>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} role="alert">
          {warning}
        </p>
      ))}

      {approved !== null && approved.id !== draft?.id ? (
        <p role="status">
          An approved narration still guides the lesson until you review this
          draft.
        </p>
      ) : null}

      {draft === null ? (
        <p role="status">
          Confirm the reviewed source, save the lesson configuration, and
          approve the lesson outline before generating narration.
        </p>
      ) : (
        <NarrationEditor
          projectId={projectId}
          set={draft}
          approved={approved}
          durationStatus={view.value.validation.durationStatus}
          wordCountStatus={view.value.validation.wordCountStatus}
        />
      )}
    </section>
  );
}

function NarrationEditor({
  projectId,
  set,
  approved,
  durationStatus,
  wordCountStatus,
}: {
  projectId: string;
  set: LessonNarrationSet;
  approved: LessonNarrationSet | null;
  durationStatus: NarrationBudgetStatus;
  wordCountStatus: NarrationBudgetStatus;
}) {
  const isApproved = set.status === "approved";
  return (
    <div>
      <p>
        {isApproved ? "Approved narration" : "Draft narration"} {set.id.slice(0, 8)}{" "}
        — prompt {set.promptId}@{set.promptVersion}, configuration v
        {set.configurationVersion}. Estimated total: {set.totalEstimatedSeconds}{" "}
        seconds, {set.blocks.reduce((sum, block) => sum + block.estimatedWords, 0)}{" "}
        words.
      </p>

      <ol aria-label="Narration blocks" data-testid="narration-blocks">
        {set.blocks.map((block) => (
          <li key={block.id} data-testid={`narration-block-${block.id}`}>
            <p>
              {block.order}. {block.outlineItemId.slice(0, 8)} ·{" "}
              {block.estimatedWords} words · ~{block.targetSeconds}s
            </p>
            <p>{block.text}</p>
            <p>
              Source: {citationText(block)}.
              {block.generatedAdditions.map((addition, index) => (
                <span key={`${addition.kind}-${index}`}>
                  {" "}
                  Generated {addition.kind}: {addition.content}.
                </span>
              ))}
              {block.revision > 0
                ? ` Edited ${block.revision} time${
                    block.revision === 1 ? "" : "s"
                  }.`
                : ""}
            </p>
          </li>
        ))}
      </ol>

      {approved !== null ? (
        <section aria-label="Approved narration">
          <h3>Approved narration</h3>
          <ol>
            {approved.blocks.map((block) => (
              <li key={block.id}>
                {block.order}. {block.estimatedWords} words · ~{block.targetSeconds}s
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p role="status">
        Duration: {narrationBudgetStatusLabel(durationStatus)} · Word count:{" "}
        {narrationBudgetStatusLabel(wordCountStatus)}.{" "}
        <a href={`/workspace/${encodeURIComponent(projectId)}/outline`}>
          Review the lesson outline
        </a>{" "}
        if the narration does not match your plan.
      </p>
    </div>
  );
}
