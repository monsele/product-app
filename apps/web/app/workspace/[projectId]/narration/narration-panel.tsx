"use client";

import { useCallback, useEffect, useState } from "react";
import {
  narrationBlockRevisionsResponseSchema,
  narrationResponseSchema,
  type LessonNarrationBlock,
  type LessonNarrationSet,
  type NarrationBlockCandidate,
  type NarrationBudgetStatus,
  type NarrationBlockRevision,
  type NarrationResponse,
  type NarrationTransformMode,
} from "@avlp/schemas";
import {
  isGenerating,
  narrationBudgetStatusLabel,
  narrationCandidateStatusLabel,
  narrationFailureMessage,
  narrationGenerationStateLabel,
  narrationTransformModeLabel,
  narrationValidationWarnings,
} from "./narration-input";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: NarrationResponse }
  | { kind: "failed"; message: string };

type EditingState = { blockId: string; text: string };

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
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [pendingTransforms, setPendingTransforms] = useState<Set<string>>(
    new Set(),
  );

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
    setPendingTransforms((current) => {
      if (current.size === 0) return current;
      const next = new Set(current);
      for (const blockId of next) {
        if (
          parsed.data.candidates.some(
            (candidate) =>
              candidate.blockId === blockId && candidate.status === "pending",
          )
        )
          next.delete(blockId);
      }
      if (parsed.data.latestTransformJob?.state === "failed") next.clear();
      return next;
    });
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
  const transformInFlight =
    value !== null &&
    value.latestTransformJob !== null &&
    (value.latestTransformJob.state === "queued" ||
      value.latestTransformJob.state === "running" ||
      value.latestTransformJob.state === "retry_wait");
  const busy = pendingTransforms.size > 0 || transformInFlight || generating;

  useEffect(() => {
    if (!pending && !generating && pendingTransforms.size === 0) return;
    const timer = window.setInterval(() => {
      void refresh()
        .then(() => setPending(false))
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [pending, generating, pendingTransforms, refresh]);

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

  const mutateNarration = useCallback(
    async (method: string, path: string, body: unknown, successMessage: string) => {
      setActionMessage(null);
      setSubmitting(true);
      try {
        const response = await fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/narration${path}`),
          {
            method,
            credentials: "include",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            extractErrorMessage(payload, `Unable to ${successMessage.toLowerCase()}.`),
          );
        setEditing(null);
        setActionMessage(`Narration ${successMessage.toLowerCase()}.`);
        await refresh().catch(() => undefined);
      } catch (error) {
        setActionMessage(
          error instanceof Error ? error.message : "Unable to update narration.",
        );
        await refresh().catch(() => undefined);
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, refresh],
  );

  const saveBlock = useCallback(
    (blockId: string) => {
      if (value === null || value.set === null || editing === null) return;
      const text = editing.text.trim();
      if (text.length === 0) {
        setActionMessage("Narration text cannot be empty.");
        return;
      }
      void mutateNarration(
        "PATCH",
        `/blocks/${encodeURIComponent(blockId)}`,
        { text, expectedRevision: value.set.revision },
        "saved",
      );
    },
    [editing, mutateNarration, value],
  );

  const regenerateBlock = useCallback(
    (blockId: string, mode: NarrationTransformMode) => {
      if (value === null || value.set === null) return;
      setActionMessage(null);
      void fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/narration-blocks/${encodeURIComponent(blockId)}/regenerate`,
        ),
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            "idempotency-key": globalThis.crypto.randomUUID(),
          },
          body: JSON.stringify({
            mode,
            expectedRevision: value.set.revision,
          }),
        },
      )
        .then(async (response) => {
          const payload: unknown = await response.json().catch(() => null);
          if (!response.ok)
            throw new Error(
              extractErrorMessage(
                payload,
                "Unable to start the rewrite.",
              ),
            );
          setPendingTransforms((current) => new Set(current).add(blockId));
          setPending(true);
          await refresh().catch(() => undefined);
        })
        .catch((error: unknown) => {
          setActionMessage(
            error instanceof Error ? error.message : "Unable to start the rewrite.",
          );
        });
    },
    [projectId, refresh, value],
  );

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

      {view.value.stale ? (
        <p role="status">
          {view.value.staleReason ??
            "This narration is out of date. Review the lesson outline, source, or configuration before continuing."}
        </p>
      ) : null}

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert">
          {narrationFailureMessage(view.value.latestJob.errorCode)}
        </p>
      ) : null}

      {view.value.latestTransformJob?.state === "failed" ? (
        <p role="alert">
          {narrationFailureMessage(view.value.latestTransformJob.errorCode)}
        </p>
      ) : null}

      {transformInFlight ? (
        <p role="status">A narration block rewrite is in progress…</p>
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
          candidates={view.value.candidates}
          durationStatus={view.value.validation.durationStatus}
          wordCountStatus={view.value.validation.wordCountStatus}
          editing={editing}
          onEditStart={setEditing}
          onEditChange={setEditing}
          onEditCancel={() => setEditing(null)}
          onSave={saveBlock}
          onRegenerate={regenerateBlock}
          onAccept={(candidate) =>
            void mutateNarration(
              "POST",
              `/blocks/${encodeURIComponent(candidate.blockId)}/candidates/${encodeURIComponent(candidate.id)}/accept`,
              { expectedRevision: draft.revision },
              "candidate accepted",
            )
          }
          onReject={(candidate) =>
            void mutateNarration(
              "POST",
              `/blocks/${encodeURIComponent(candidate.blockId)}/candidates/${encodeURIComponent(candidate.id)}/reject`,
              { expectedRevision: draft.revision },
              "candidate rejected",
            )
          }
          onRestore={(blockId, revision) =>
            void mutateNarration(
              "POST",
              `/blocks/${encodeURIComponent(blockId)}/restore`,
              { revision, expectedRevision: draft.revision },
              "revision restored",
            )
          }
          canEdit={view.value.canEdit && !busy}
          busy={busy}
        />
      )}
    </section>
  );
}

function NarrationEditor({
  projectId,
  set,
  approved,
  candidates,
  durationStatus,
  wordCountStatus,
  editing,
  onEditStart,
  onEditChange,
  onEditCancel,
  onSave,
  onRegenerate,
  onAccept,
  onReject,
  onRestore,
  canEdit,
  busy,
}: {
  projectId: string;
  set: LessonNarrationSet;
  approved: LessonNarrationSet | null;
  candidates: NarrationBlockCandidate[];
  durationStatus: NarrationBudgetStatus;
  wordCountStatus: NarrationBudgetStatus;
  editing: EditingState | null;
  onEditStart: (state: EditingState) => void;
  onEditChange: (state: EditingState) => void;
  onEditCancel: () => void;
  onSave: (blockId: string) => void;
  onRegenerate: (blockId: string, mode: NarrationTransformMode) => void;
  onAccept: (candidate: NarrationBlockCandidate) => void;
  onReject: (candidate: NarrationBlockCandidate) => void;
  onRestore: (blockId: string, revision: number) => void;
  canEdit: boolean;
  busy: boolean;
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
            {editing?.blockId === block.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onSave(block.id);
                }}
              >
                <label>
                  Narration text
                  <textarea
                    value={editing.text}
                    rows={4}
                    maxLength={10_000}
                    onChange={(event) =>
                      onEditChange({ ...editing, text: event.target.value })
                    }
                  />
                </label>
                <button type="submit" disabled={busy}>
                  Save
                </button>
                <button type="button" onClick={onEditCancel} disabled={busy}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
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
                {canEdit ? (
                  <p>
                    <button
                      type="button"
                      onClick={() =>
                        onEditStart({ blockId: block.id, text: block.text })
                      }
                      disabled={busy}
                    >
                      Edit
                    </button>
                    {(
                      ["shorten", "simplify", "expand", "regenerate"] as const
                    ).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onRegenerate(block.id, mode)}
                        disabled={busy}
                      >
                        {narrationTransformModeLabel(mode)}
                      </button>
                    ))}
                    <BlockHistory
                      projectId={projectId}
                      blockId={block.id}
                      onRestore={(revision) => onRestore(block.id, revision)}
                      disabled={busy}
                    />
                  </p>
                ) : null}
                <BlockCandidates
                  blockId={block.id}
                  candidates={candidates}
                  onAccept={onAccept}
                  onReject={onReject}
                  disabled={!canEdit}
                />
              </>
            )}
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

function BlockCandidates({
  blockId,
  candidates,
  onAccept,
  onReject,
  disabled,
}: {
  blockId: string;
  candidates: NarrationBlockCandidate[];
  onAccept: (candidate: NarrationBlockCandidate) => void;
  onReject: (candidate: NarrationBlockCandidate) => void;
  disabled: boolean;
}) {
  const pending = candidates.filter(
    (candidate) => candidate.blockId === blockId && candidate.status === "pending",
  );
  if (pending.length === 0) return null;
  return (
    <section aria-label={`Rewrites for ${blockId}`}>
      {pending.map((candidate) => (
        <div key={candidate.id}>
          <p>
            <strong>{narrationTransformModeLabel(candidate.mode)} candidate</strong>
            {" — "}
            {candidate.text} ({candidate.estimatedWords} words)
          </p>
          <p role="status">
            {narrationCandidateStatusLabel(candidate.status)}. Generated from
            block revision {candidate.blockRevision}.
          </p>
          <button type="button" onClick={() => onAccept(candidate)} disabled={disabled}>
            Accept rewrite
          </button>
          <button type="button" onClick={() => onReject(candidate)} disabled={disabled}>
            Reject rewrite
          </button>
        </div>
      ))}
    </section>
  );
}

function BlockHistory({
  projectId,
  blockId,
  onRestore,
  disabled,
}: {
  projectId: string;
  blockId: string;
  onRestore: (revision: number) => void;
  disabled: boolean;
}) {
  const [revisions, setRevisions] = useState<NarrationBlockRevision[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMessage(null);
    const response = await fetch(
      apiUrl(
        `/projects/${encodeURIComponent(projectId)}/narration/blocks/${encodeURIComponent(blockId)}/revisions`,
      ),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage("We could not load the previous versions.");
      return;
    }
    const parsed = narrationBlockRevisionsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      setMessage("We could not load the previous versions.");
      return;
    }
    setRevisions(parsed.data.revisions);
  }, [projectId, blockId]);

  if (revisions === null)
    return (
      <button type="button" onClick={() => void load()} disabled={disabled}>
        Show previous versions
      </button>
    );
  return (
    <span>
      <button type="button" onClick={() => void load()} disabled={disabled}>
        Refresh versions
      </button>
      {message !== null ? <span role="alert"> {message}</span> : null}
      {revisions.length === 0 ? (
        <span role="status"> No previous versions.</span>
      ) : (
        <ol>
          {revisions.map((revision) => (
            <li key={revision.id}>
              revision {revision.revision} ({revision.origin}) —{" "}
              {revision.estimatedWords} words.
              <button
                type="button"
                onClick={() => onRestore(revision.revision)}
                disabled={disabled}
              >
                Restore
              </button>
            </li>
          ))}
        </ol>
      )}
    </span>
  );
}
