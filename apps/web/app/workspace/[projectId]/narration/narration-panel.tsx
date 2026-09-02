"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useStageNavigation } from "../../../../lib/use-stage-navigation";
import {
  narrationBlockRevisionsResponseSchema,
  narrationResponseSchema,
  type LessonNarrationBlock,
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
import { ReviewEditorScaffold } from "../../../../components/review-editor/review-editor-scaffold";
import { SourceDrawer } from "../../../../components/review-editor/source-drawer";
import { CandidateBanner } from "../../../../components/review-editor/candidate-banner";
import { Button } from "../../../../components/ui/button";
import { Drawer } from "../../../../components/ui/drawer";
import { Notice, type NoticeType } from "../../../../components/ui/notice";
import { StatusLabel } from "../../../../components/ui/status-label";
import { toast } from "../../../../components/ui/toast-provider";
import { useTaskStatusNotification } from "../../../../lib/use-task-notification";
import {
  ArrowClockwise,
  ArrowRight,
  ArrowsClockwise,
  BookOpen,
  CheckCircle,
  Clock,
  FileText,
  PencilSimple,
  Sparkle,
} from "@phosphor-icons/react";

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
  if (block.sourceRefs.length === 0) {
    return block.generatedAdditions.length > 0
      ? "Generated addition (no direct source passage)"
      : "No direct source references";
  }
  const blocks = block.sourceRefs.reduce(
    (count, ref) => count + ref.blockIds.length,
    0,
  );
  return `${block.sourceRefs.length} section${
    block.sourceRefs.length === 1 ? "" : "s"
  }, ${blocks} source block${blocks === 1 ? "" : "s"}`;
}

export function NarrationPanel({
  projectId,
  projectTitle = "Lesson",
}: {
  projectId: string;
  projectTitle?: string;
}) {
  const stageNavigation = useStageNavigation();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageType, setActionMessageType] = useState<NoticeType>("info");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pendingTransforms, setPendingTransforms] = useState<Set<string>>(
    new Set(),
  );

  // Source drawer inspection state
  const [inspectedBlock, setInspectedBlock] =
    useState<LessonNarrationBlock | null>(null);

  // Mobile details drawer state
  const [isMobileDetailsOpen, setIsMobileDetailsOpen] = useState(false);

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

  useTaskStatusNotification({
    taskName: "Narration script generation",
    status: value?.latestJob?.state,
    successMessage: "Narration script generated successfully.",
    errorMessage:
      (value?.latestJob?.errorCode &&
        narrationFailureMessage(value.latestJob.errorCode)) ||
      "Narration generation failed.",
  });

  useTaskStatusNotification({
    taskName: "Narration block rewrite",
    status: value?.latestTransformJob?.state,
    successMessage: "Narration block rewrite completed.",
    errorMessage:
      (value?.latestTransformJob?.errorCode &&
        narrationFailureMessage(value.latestTransformJob.errorCode)) ||
      "Narration block rewrite failed.",
  });

  // Auto-select first block once loaded if none is selected
  useEffect(() => {
    if (value?.set && value.set.blocks.length > 0 && selectedBlockId === null) {
      setSelectedBlockId(value.set.blocks[0]?.id ?? null);
    }
  }, [value, selectedBlockId]);

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
      setActionMessageType("info");
      setActionMessage("Narration generation started in the background.");
      toast.info("Narration script generation started.");
      await refresh().catch(() => undefined);
    } catch (error) {
      setPending(false);
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Unable to start narration generation.";
      setActionMessageType("error");
      setActionMessage(errorMsg);
      toast.error(errorMsg);
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
        setActionMessageType("success");
        const msg = `Narration ${successMessage.toLowerCase()}.`;
        setActionMessage(msg);
        toast.success(msg);
        await refresh().catch(() => undefined);
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unable to update narration.";
        setActionMessageType("error");
        setActionMessage(errorMsg);
        toast.error(errorMsg);
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
        setActionMessageType("warning");
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

  const approveNarration = useCallback(() => {
    if (value === null || value.set === null) return;
    void mutateNarration(
      "POST",
      "/approve",
      { expectedRevision: value.set.revision },
      "approved",
    );
  }, [mutateNarration, value]);

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
          setActionMessageType("info");
          setActionMessage(
            `Started ${narrationTransformModeLabel(mode).toLowerCase()} rewrite for block.`,
          );
          await refresh().catch(() => undefined);
        })
        .catch((error: unknown) => {
          setActionMessageType("error");
          setActionMessage(
            error instanceof Error ? error.message : "Unable to start the rewrite.",
          );
        });
    },
    [projectId, refresh, value],
  );

  if (view.kind === "loading") {
    return (
      <ReviewEditorScaffold
        title="Narration script"
        subtitle="Loading narration script…"
        mainContent={
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <p role="status" style={{ color: "var(--color-text-muted)" }}>
              Loading the narration…
            </p>
          </div>
        }
      />
    );
  }

  if (view.kind === "failed") {
    return (
      <ReviewEditorScaffold
        title="Narration script"
        subtitle={projectTitle}
        notices={
          <Notice type="error" title="Unable to load narration" message={view.message} />
        }
        mainContent={
          <div style={{ padding: "20px 0" }}>
            <Button variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        }
      />
    );
  }

  const draft = view.value.set;
  const approved = view.value.approved;
  // Before anything is generated the API reports every approved outline item as
  // uncovered (narration.ts computeValidation, set === null). That is correct as
  // data -- it gates canApprove -- but as a notice it tells the teacher to
  // "regenerate" something they never generated. The empty state already says
  // what to do, so only surface validation warnings once a draft exists.
  const warnings =
    draft === null ? [] : narrationValidationWarnings(view.value.validation);
  const isNarrationApproved = draft !== null && draft.status === "approved";
  const selectedBlock =
    draft?.blocks.find((b) => b.id === selectedBlockId) ?? draft?.blocks[0] ?? null;

  // Status badge calculation
  let statusBadge: React.ReactNode = null;
  if (generating) {
    statusBadge = <StatusLabel status="info" label="Generating…" size="compact" />;
  } else if (view.value.stale) {
    statusBadge = <StatusLabel status="warning" label="Outline changed" size="compact" />;
  } else if (isNarrationApproved) {
    statusBadge = <StatusLabel status="success" label="Narration approved" size="compact" />;
  } else if (draft !== null) {
    statusBadge = <StatusLabel status="info" label="Draft ready" size="compact" />;
  } else {
    statusBadge = <StatusLabel status="info" label="Not generated" size="compact" />;
  }

  // Header notices
  const notices = (
    <>
      <p role="status" className="sr-only">
        {narrationGenerationStateLabel(view.value.state)}
      </p>

      {view.value.stale && (
        <Notice
          type="warning"
          title="Narration may be out of date"
          message={
            view.value.staleReason ??
            "This narration is out of date. Review the lesson outline, source, or configuration before continuing."
          }
        />
      )}

      {view.value.latestJob?.state === "failed" && (
        <Notice
          type="error"
          title="Narration generation failed"
          message={narrationFailureMessage(view.value.latestJob.errorCode)}
        />
      )}

      {view.value.latestTransformJob?.state === "failed" && (
        <Notice
          type="error"
          title="Block rewrite failed"
          message={narrationFailureMessage(view.value.latestTransformJob.errorCode)}
        />
      )}

      {actionMessage !== null && (
        <Notice
          type={actionMessageType}
          title={actionMessageType === "error" ? "Error" : "Update"}
          message={actionMessage}
          onClose={() => setActionMessage(null)}
        />
      )}

      {warnings.map((warning) => (
        <Notice key={warning} type="warning" title="Narration warning" message={warning} />
      ))}

      {approved !== null && approved.id !== draft?.id && (
        <Notice
          type="info"
          title="Approved version active"
          message="An approved narration still guides the lesson until you review and confirm this draft."
        />
      )}
    </>
  );

  // Candidate banner at top if global rewrite in progress
  const candidateBanner = transformInFlight ? (
    <CandidateBanner
      isGenerating
      generatingMessage="A narration block rewrite is processing in the background… Your existing text and revisions are safe."
      hasCandidate={false}
    />
  ) : null;

  // Empty state when draft is null
  if (draft === null) {
    return (
      <ReviewEditorScaffold
        title="Narration script"
        subtitle={projectTitle}
        statusBadge={statusBadge}
        notices={notices}
        candidateBanner={candidateBanner}
        mainContent={
          <div
            style={{
              padding: "40px 24px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <BookOpen size={48} weight="duotone" style={{ color: "var(--color-brand)" }} />
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
              No narration generated yet
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-muted)",
                maxWidth: "480px",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Confirm the reviewed source, save your lesson setup, and approve the lesson outline
              before generating narration.
            </p>
            {view.value.canGenerate && (
              <Button
                variant="primary"
                onClick={() => void generate()}
                disabled={submitting || generating}
              >
                <Sparkle size={16} weight="fill" />
                <span>{submitting || generating ? "Starting generation…" : "Generate narration"}</span>
              </Button>
            )}
          </div>
        }
        sidebarContent={
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
              Prerequisites
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)" }}>
                <CheckCircle size={16} weight="fill" style={{ color: "var(--color-brand)" }} />
                <span>Source document intake</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)" }}>
                <CheckCircle size={16} weight="fill" style={{ color: "var(--color-brand)" }} />
                <span>Lesson configuration</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)" }}>
                <CheckCircle size={16} weight="fill" style={{ color: "var(--color-brand)" }} />
                <span>Approved lesson outline</span>
              </div>
            </div>
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "14px" }}>
              <a
                href={`/workspace/${encodeURIComponent(projectId)}/outline`}
                style={{
                  fontSize: "13px",
                  color: "var(--color-brand)",
                  textDecoration: "underline",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                Review lesson outline &rarr;
              </a>
            </div>
          </div>
        }
      />
    );
  }

  // Sidebar / Details Content (used on desktop sidebar and mobile drawer)
  const sidebarOrDrawerContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Active Selected Block Context */}
      {selectedBlock ? (
        <section aria-labelledby="selected-block-heading" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3
              id="selected-block-heading"
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--color-text)",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <FileText size={18} style={{ color: "var(--color-brand)" }} />
              Section {selectedBlock.order} Details
            </h3>
            <StatusLabel
              status="info"
              label={selectedBlock.revision > 0 ? `Rev ${selectedBlock.revision}` : "Original"}
              size="compact"
            />
          </div>

          <div
            style={{
              padding: "12px",
              backgroundColor: "var(--color-surface-subtle)",
              borderRadius: "var(--radius-control)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "13px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-muted)" }}>Target duration:</span>
              <strong style={{ color: "var(--color-text)" }}>~{selectedBlock.targetSeconds}s</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-muted)" }}>Word estimate:</span>
              <strong style={{ color: "var(--color-text)" }}>{selectedBlock.estimatedWords} words</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-muted)" }}>Outline section ID:</span>
              <span style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--color-text-muted)" }}>
                {selectedBlock.outlineItemId.slice(0, 8)}
              </span>
            </div>
          </div>

          {/* Source Support & Citation Button */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text)" }}>
              Source grounding
            </span>
            <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: 0 }}>
              {citationText(selectedBlock)}
            </p>
            {selectedBlock.sourceRefs.length > 0 && (
              <button
                type="button"
                onClick={() => setInspectedBlock(selectedBlock)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: "12px",
                  color: "var(--color-brand)",
                  textDecoration: "underline",
                  textAlign: "left",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  marginTop: "2px",
                }}
              >
                <BookOpen size={14} />
                Inspect cited passages ({selectedBlock.sourceRefs.length})
              </button>
            )}
          </div>

          {/* Generated Additions if any */}
          {selectedBlock.generatedAdditions.length > 0 && (
            <div
              style={{
                padding: "10px 12px",
                backgroundColor: "var(--color-surface-brand)",
                borderRadius: "var(--radius-control)",
                fontSize: "12px",
                color: "var(--color-text)",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              <strong style={{ color: "var(--color-brand)" }}>AI Generated Content Note:</strong>
              {selectedBlock.generatedAdditions.map((addition, i) => (
                <div key={i} style={{ color: "var(--color-text-muted)" }}>
                  • {addition.kind}: {addition.content}
                </div>
              ))}
            </div>
          )}

          {/* Scoped Rewrite Controls */}
          {view.value.canEdit && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                borderTop: "1px solid var(--color-border)",
                paddingTop: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Sparkle size={16} weight="fill" style={{ color: "var(--color-brand)" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text)" }}>
                  Scoped AI Rewrite
                </span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: 0 }}>
                Rewrites only Section {selectedBlock.order}. All other sections and previous revisions
                remain unchanged.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                {(["shorten", "simplify", "expand", "regenerate"] as const).map((mode) => (
                  <Button
                    key={mode}
                    variant="secondary"
                    size="compact"
                    onClick={() => regenerateBlock(selectedBlock.id, mode)}
                    disabled={busy}
                  >
                    {narrationTransformModeLabel(mode)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Block Revisions History */}
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <BlockHistory
              projectId={projectId}
              blockId={selectedBlock.id}
              onRestore={(revision) =>
                void mutateNarration(
                  "POST",
                  `/blocks/${encodeURIComponent(selectedBlock.id)}/restore`,
                  { revision, expectedRevision: draft.revision },
                  "revision restored",
                )
              }
              disabled={busy || !view.value.canEdit}
            />
          </div>
        </section>
      ) : (
        <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
          Select a script block to view its grounding, duration, and rewrite options.
        </p>
      )}

      {/* Lesson Narration Budget Summary */}
      <section
        aria-labelledby="budget-summary-heading"
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <h3
          id="budget-summary-heading"
          style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--color-text)",
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <Clock size={16} />
          Lesson narration budget
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Total duration:</span>
            <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
              {draft.totalEstimatedSeconds}s ({narrationBudgetStatusLabel(view.value.validation.durationStatus)})
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--color-text-muted)" }}>Total words:</span>
            <span style={{ fontWeight: 600, color: "var(--color-text)" }}>
              {draft.blocks.reduce((sum, b) => sum + b.estimatedWords, 0)} words ({narrationBudgetStatusLabel(view.value.validation.wordCountStatus)})
            </span>
          </div>
        </div>
      </section>

      {/* Re-generate Whole Narration Action */}
      {view.value.canGenerate && (
        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "14px" }}>
          <Button
            variant="tertiary"
            size="compact"
            onClick={() => void generate()}
            disabled={submitting || generating || busy}
          >
            <ArrowsClockwise size={14} />
            <span>{submitting || generating ? "Generating…" : "Regenerate whole narration"}</span>
          </Button>
        </div>
      )}

      {/* Continuation to Storyboard */}
      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <Button
          variant="primary"
          isLoading={stageNavigation.isNavigating}
          disabled={stageNavigation.isNavigating}
          onClick={() => {
            stageNavigation.navigate(
              `/workspace/${encodeURIComponent(projectId)}/storyboard`,
            );
          }}
        >
          <span>
            {stageNavigation.isNavigating
              ? "Opening storyboard…"
              : "Continue to storyboard"}
          </span>
          {!stageNavigation.isNavigating && <ArrowRight size={16} weight="bold" />}
        </Button>
        {stageNavigation.isNavigating && (
          <span
            aria-live="polite"
            style={{
              fontSize: "12px",
              color: "var(--color-text-muted)",
              textAlign: "center",
            }}
          >
            Loading your scenes. This can take a few seconds.
          </span>
        )}
        <Link
          href={`/workspace/${encodeURIComponent(projectId)}/outline`}
          prefetch={true}
          style={{
            fontSize: "12px",
            color: "var(--color-text-muted)",
            textAlign: "center",
            textDecoration: "underline",
          }}
        >
          Review the lesson outline
        </Link>
      </div>
    </div>
  );

  return (
    <ReviewEditorScaffold
      title="Narration script"
      subtitle={`${projectTitle} · ${draft.blocks.length} sections · ~${draft.totalEstimatedSeconds}s`}
      statusBadge={statusBadge}
      notices={notices}
      candidateBanner={candidateBanner}
      mainContent={
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Mobile details toggle button */}
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              variant="secondary"
              size="compact"
              onClick={() => setIsMobileDetailsOpen(true)}
            >
              <FileText size={16} />
              <span>
                {selectedBlock
                  ? `Section ${selectedBlock.order} Details & Rewrites`
                  : "View Section Details"}
              </span>
            </Button>
          </div>

          {/* Central Script Column (constrained to max 72ch for reading comfort) */}
          <section
            aria-labelledby="script-blocks-heading"
            style={{
              maxWidth: "72ch",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <h2 id="script-blocks-heading" className="sr-only">
              Narration blocks
            </h2>

            <ol
              aria-label="Narration blocks"
              data-testid="narration-blocks"
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {draft.blocks.map((block) => {
                const isSelected = selectedBlock?.id === block.id;
                const isEditingThis = editing?.blockId === block.id;
                const blockCandidate = view.value.candidates.find(
                  (c) => c.blockId === block.id && c.status === "pending",
                );

                return (
                  <li
                    key={block.id}
                    data-testid={`narration-block-${block.id}`}
                    onClick={() => {
                      if (!isEditingThis) setSelectedBlockId(block.id);
                    }}
                    style={{
                      backgroundColor: "var(--color-surface)",
                      border: isSelected
                        ? "2px solid var(--color-brand)"
                        : "1px solid var(--color-border)",
                      borderRadius: "var(--radius-card)",
                      padding: "20px",
                      boxShadow: isSelected
                        ? "0 4px 16px rgba(100, 48, 215, 0.08)"
                        : "none",
                      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                      cursor: isEditingThis ? "default" : "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {/* Block Header Info */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "8px",
                        borderBottom: "1px solid var(--color-border)",
                        paddingBottom: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            color: isSelected ? "var(--color-brand)" : "var(--color-text)",
                          }}
                        >
                          Section {block.order}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                          {block.estimatedWords} words · ~{block.targetSeconds}s
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        {block.revision > 0 ? (
                          <StatusLabel
                            status="info"
                            label={`Edited (rev ${block.revision})`}
                            size="compact"
                          />
                        ) : (
                          <StatusLabel
                            status="info"
                            label="Generated"
                            size="compact"
                          />
                        )}
                        {block.generatedAdditions.length > 0 && (
                          <StatusLabel
                            status="warning"
                            label="Inferred additions"
                            size="compact"
                          />
                        )}
                      </div>
                    </div>

                    {/* Block Script Body: Form or Text */}
                    {isEditingThis ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveBlock(block.id);
                        }}
                        style={{ display: "flex", flexDirection: "column", gap: "12px" }}
                      >
                        <label
                          htmlFor={`textarea-${block.id}`}
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-text)",
                          }}
                        >
                          Edit narration script
                        </label>
                        <textarea
                          id={`textarea-${block.id}`}
                          value={editing.text}
                          rows={5}
                          maxLength={10_000}
                          autoFocus
                          onChange={(e) =>
                            setEditing({ ...editing, text: e.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: "12px",
                            fontSize: "15px",
                            lineHeight: "1.6",
                            fontFamily: "inherit",
                            color: "var(--color-text)",
                            backgroundColor: "var(--color-canvas)",
                            border: "1px solid var(--color-brand)",
                            borderRadius: "var(--radius-control)",
                            outline: "none",
                            resize: "vertical",
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Button type="submit" variant="primary" size="compact" disabled={busy}>
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="tertiary"
                            size="compact"
                            onClick={() => setEditing(null)}
                            disabled={busy}
                          >
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div
                          style={{
                            fontSize: "15px",
                            lineHeight: "1.65",
                            color: "var(--color-text)",
                            letterSpacing: "-0.005em",
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {block.text}
                        </div>

                        {/* Citations and Provenance footnote */}
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-muted)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: "8px",
                            paddingTop: "6px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <BookOpen size={14} />
                            <span>Source: {citationText(block)}</span>
                          </div>

                          {view.value.canEdit && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Button
                                variant="tertiary"
                                size="compact"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing({ blockId: block.id, text: block.text });
                                }}
                                disabled={busy}
                              >
                                <PencilSimple size={14} />
                                <span>Edit</span>
                              </Button>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Candidate rewrite preview banner if present for this block */}
                    {blockCandidate && (
                      <div
                        style={{
                          marginTop: "8px",
                          padding: "14px",
                          backgroundColor: "var(--color-surface-brand)",
                          border: "1.5px solid var(--color-brand)",
                          borderRadius: "var(--radius-control)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <Sparkle size={16} weight="fill" style={{ color: "var(--color-brand)" }} />
                            <strong style={{ fontSize: "13px", color: "var(--color-brand)" }}>
                              {narrationTransformModeLabel(blockCandidate.mode)} Candidate Ready
                            </strong>
                          </div>
                          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                            {blockCandidate.estimatedWords} words · {narrationCandidateStatusLabel(blockCandidate.status)}
                          </span>
                        </div>

                        <div
                          style={{
                            fontSize: "14px",
                            lineHeight: "1.6",
                            color: "var(--color-text)",
                            backgroundColor: "var(--color-surface)",
                            padding: "10px 12px",
                            borderRadius: "var(--radius-control)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          {blockCandidate.text}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
                          <Button
                            variant="tertiary"
                            size="compact"
                            onClick={(e) => {
                              e.stopPropagation();
                              void mutateNarration(
                                "POST",
                                `/blocks/${encodeURIComponent(block.id)}/candidates/${encodeURIComponent(blockCandidate.id)}/reject`,
                                { expectedRevision: draft.revision },
                                "candidate rejected",
                              );
                            }}
                            disabled={busy || !view.value.canEdit}
                          >
                            Reject rewrite
                          </Button>
                          <Button
                            variant="primary"
                            size="compact"
                            onClick={(e) => {
                              e.stopPropagation();
                              void mutateNarration(
                                "POST",
                                `/blocks/${encodeURIComponent(block.id)}/candidates/${encodeURIComponent(blockCandidate.id)}/accept`,
                                { expectedRevision: draft.revision },
                                "candidate accepted",
                              );
                            }}
                            disabled={busy || !view.value.canEdit}
                          >
                            Accept rewrite
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {/* Approval Footer */}
          <div
            style={{
              marginTop: "16px",
              padding: "20px",
              maxWidth: "72ch",
              backgroundColor: isNarrationApproved
                ? "var(--color-surface-subtle)"
                : "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "16px",
            }}
          >
            <div>
              <h4
                style={{
                  margin: "0 0 4px 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                {isNarrationApproved ? "Narration Approved" : "Ready to proceed?"}
              </h4>
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                }}
              >
                {isNarrationApproved
                  ? "This narration is approved and guides the storyboard. Editing creates a new draft."
                  : "Approving confirms the spoken script and unlocks saving a lesson version for rendering."}
              </p>
            </div>

            {!isNarrationApproved ? (
              <Button
                variant="primary"
                onClick={() => approveNarration()}
                disabled={!view.value.canApprove || submitting || generating}
              >
                <CheckCircle size={16} weight="bold" />
                Approve narration
              </Button>
            ) : (
              <StatusLabel status="success" label="Active approved narration" />
            )}
          </div>

          {/* Approved Narration Comparison (if another version was previously approved) */}
          {approved !== null && approved.id !== draft.id && (
            <section
              aria-label="Approved narration"
              style={{
                marginTop: "20px",
                padding: "20px",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-card)",
                border: "1px solid var(--color-border)",
                maxWidth: "72ch",
              }}
            >
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text)", margin: "0 0 12px 0" }}>
                Active Approved Narration ({approved.blocks.length} sections)
              </h3>
              <ol style={{ paddingLeft: "20px", margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}>
                {approved.blocks.map((b) => (
                  <li key={b.id} style={{ marginBottom: "6px" }}>
                    Section {b.order}: {b.estimatedWords} words (~{b.targetSeconds}s) —{" "}
                    <em>{b.text.slice(0, 80)}…</em>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Mobile details drawer */}
          <Drawer
            isOpen={isMobileDetailsOpen}
            onClose={() => setIsMobileDetailsOpen(false)}
            title="Section details & rewrites"
          >
            {sidebarOrDrawerContent}
          </Drawer>
        </div>
      }
      sidebarContent={sidebarOrDrawerContent}
      sourceDrawer={
        inspectedBlock ? (
          <SourceDrawer
            isOpen={true}
            onClose={() => setInspectedBlock(null)}
            title={`Source Citations — Section ${inspectedBlock.order}`}
            sourceRefs={inspectedBlock.sourceRefs}
            projectId={projectId}
          />
        ) : null
      }
    />
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
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setMessage(null);
    setLoading(true);
    try {
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
      setIsOpen(true);
    } catch {
      setMessage("We could not load the previous versions.");
    } finally {
      setLoading(false);
    }
  }, [projectId, blockId]);

  if (!isOpen || revisions === null) {
    return (
      <Button
        variant="tertiary"
        size="compact"
        onClick={() => void load()}
        disabled={disabled || loading}
      >
        <ArrowClockwise size={14} />
        <span>{loading ? "Loading history…" : "View revision history"}</span>
      </Button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px",
        backgroundColor: "var(--color-surface)",
        borderRadius: "var(--radius-control)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text)" }}>
          Previous Revisions ({revisions.length})
        </span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          style={{
            background: "none",
            border: "none",
            fontSize: "11px",
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          Hide
        </button>
      </div>

      {message !== null && (
        <span role="alert" style={{ fontSize: "12px", color: "var(--color-error-fg)" }}>
          {message}
        </span>
      )}

      {revisions.length === 0 ? (
        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
          No previous revisions saved.
        </span>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
          {revisions.map((rev) => (
            <li
              key={rev.id}
              style={{
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px",
                backgroundColor: "var(--color-surface-subtle)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <div>
                <strong>Rev {rev.revision}</strong> ({rev.origin}) · {rev.estimatedWords} words
              </div>
              <Button
                variant="secondary"
                size="compact"
                onClick={() => onRestore(rev.revision)}
                disabled={disabled}
              >
                Restore
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
