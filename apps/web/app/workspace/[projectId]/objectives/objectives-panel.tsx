"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  objectivesResponseSchema,
  type LearningObjective,
  type ObjectivesResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  objectiveFailureMessage,
  objectiveGroundingLabel,
} from "./objectives-input";
import { ReviewEditorScaffold } from "../../../../components/review-editor/review-editor-scaffold";
import { ReorderItemContainer } from "../../../../components/review-editor/reorder-item-container";
import { SourceDrawer } from "../../../../components/review-editor/source-drawer";
import { CandidateBanner } from "../../../../components/review-editor/candidate-banner";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import { StatusLabel } from "../../../../components/ui/status-label";
import {
  BookOpen,
  CheckCircle,
  PencilSimple,
  Plus,
  Sparkle,
  Target,
  Trash,
} from "@phosphor-icons/react";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: ObjectivesResponse }
  | { kind: "failed"; message: string };

type EditingState = { objectiveId: string; statement: string; verb: string };

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

function citationSummary(sourceRefs: LearningObjective["sourceRefs"]): string {
  if (sourceRefs.length === 0) return "No source references";
  return sourceRefs
    .map((ref) => {
      const pages =
        ref.pageEnd === undefined || ref.pageEnd === ref.pageStart
          ? `p. ${ref.pageStart}`
          : `pp. ${ref.pageStart}–${ref.pageEnd}`;
      return `${ref.sectionId ? `Section ${ref.sectionId.slice(0, 8)}` : "Source"} (${pages})`;
    })
    .join(", ");
}

export function ObjectivesPanel({
  projectId,
  projectTitle = "Lesson",
}: {
  projectId: string;
  projectTitle?: string;
}) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageType, setActionMessageType] = useState<
    "info" | "success" | "error" | "warning"
  >("info");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [addStatement, setAddStatement] = useState("");
  const [addVerb, setAddVerb] = useState("");
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  // Drag-and-drop & Reorder state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const [lastMovedDirection, setLastMovedDirection] = useState<-1 | 1 | null>(
    null,
  );

  // Source drawer inspection state
  const [inspectedObjective, setInspectedObjective] =
    useState<LearningObjective | null>(null);

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
            message:
              "We could not load the learning objectives. Please try again.",
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
      setActionMessage("Generation job started in background.");
      setActionMessageType("info");
    } catch (error) {
      setPending(false);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start objective generation.",
      );
      setActionMessageType("error");
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  const mutate = useCallback(
    async (
      method: string,
      path: string,
      body: unknown,
      successMessage: string,
    ) => {
      setActionMessage(null);
      setSubmitting(true);
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/objectives${path}`,
          ),
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
            extractErrorMessage(
              payload,
              `Unable to ${successMessage.toLowerCase()}.`,
            ),
          );
        setEditing(null);
        setAddStatement("");
        setAddVerb("");
        setIsAddingOpen(false);
        setActionMessage(`Objective ${successMessage.toLowerCase()}.`);
        setActionMessageType("success");
        await refresh().catch(() => undefined);
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : "Unable to update objectives.",
        );
        setActionMessageType("error");
        await refresh().catch(() => undefined);
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, refresh],
  );

  const addObjective = useCallback(() => {
    if (value === null || value.set === null) return;
    const statement = addStatement.trim();
    const verb = addVerb.trim();
    if (statement.length === 0 || verb.length === 0) {
      setActionMessage("Enter both a statement and a measurable verb.");
      setActionMessageType("warning");
      return;
    }
    void mutate(
      "POST",
      "",
      { statement, verb, expectedRevision: value.set.revision },
      "added",
    );
  }, [addStatement, addVerb, mutate, value]);

  const updateObjective = useCallback(() => {
    if (value === null || value.set === null || editing === null) return;
    const statement = editing.statement.trim();
    const verb = editing.verb.trim();
    if (statement.length === 0 || verb.length === 0) {
      setActionMessage("Objective statement and verb cannot be empty.");
      setActionMessageType("warning");
      return;
    }
    void mutate(
      "PATCH",
      `/${encodeURIComponent(editing.objectiveId)}`,
      { statement, verb, expectedRevision: value.set.revision },
      "updated",
    );
  }, [editing, mutate, value]);

  const removeObjective = useCallback(
    (objectiveId: string) => {
      if (value === null || value.set === null) return;
      void mutate(
        "DELETE",
        `/${encodeURIComponent(objectiveId)}`,
        { expectedRevision: value.set.revision },
        "removed",
      );
    },
    [mutate, value],
  );

  const moveObjective = useCallback(
    (objectiveId: string, direction: -1 | 1) => {
      if (value === null || value.set === null) return;
      const objectives = value.set.objectives;
      const index = objectives.findIndex(
        (objective) => objective.id === objectiveId,
      );
      const swapWith = index + direction;
      if (index === -1 || swapWith < 0 || swapWith >= objectives.length) return;
      const objectiveIds = objectives.map((objective) => objective.id);
      [objectiveIds[index], objectiveIds[swapWith]] = [
        objectiveIds[swapWith]!,
        objectiveIds[index]!,
      ];
      setLastMovedId(objectiveId);
      setLastMovedDirection(direction);
      void mutate(
        "POST",
        "/reorder",
        { objectiveIds, expectedRevision: value.set.revision },
        "reordered",
      );
    },
    [mutate, value],
  );

  const dropObjective = useCallback(
    (draggedId: string, targetId: string) => {
      if (value === null || value.set === null || draggedId === targetId)
        return;
      const objectiveIds = value.set.objectives.map((o) => o.id);
      const fromIndex = objectiveIds.indexOf(draggedId);
      const toIndex = objectiveIds.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      objectiveIds.splice(fromIndex, 1);
      objectiveIds.splice(toIndex, 0, draggedId);
      setLastMovedId(draggedId);
      setLastMovedDirection(null);
      void mutate(
        "POST",
        "/reorder",
        { objectiveIds, expectedRevision: value.set.revision },
        "reordered",
      );
    },
    [mutate, value],
  );

  const approve = useCallback(() => {
    if (value === null || value.set === null) return;
    void mutate(
      "POST",
      "/approve",
      { expectedRevision: value.set.revision },
      "approved",
    );
  }, [mutate, value]);

  if (view.kind === "loading") {
    return (
      <ReviewEditorScaffold
        title="Learning objectives"
        subtitle="Loading learning objectives…"
        mainContent={
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <p role="status" style={{ color: "var(--color-text-muted)" }}>
              Loading learning objectives…
            </p>
          </div>
        }
      />
    );
  }

  if (view.kind === "failed") {
    return (
      <ReviewEditorScaffold
        title="Learning objectives"
        subtitle="Review learning objectives"
        notices={
          <Notice
            type="error"
            title="Failed to load objectives"
            message={view.message}
            actionLabel="Try again"
            onAction={() => void refresh()}
          />
        }
        mainContent={null}
      />
    );
  }

  const draft = view.value.set;
  const approved = view.value.approved;
  const isApproved = draft !== null && draft.status === "approved";
  const hasDiffWithApproved =
    approved !== null && draft !== null && approved.id !== draft.id;

  return (
    <ReviewEditorScaffold
      title="Learning objectives"
      subtitle={`Define and refine measurable learning goals for ${projectTitle}.`}
      statusBadge={
        draft ? (
          <>
            {isApproved ? (
              <StatusLabel status="success" label="Approved set" />
            ) : (
              <StatusLabel status="info" label="Draft set" />
            )}
            <StatusLabel status="info" label={`Rev #${draft.revision}`} />
          </>
        ) : null
      }
      notices={
        <>
          {view.value.latestJob?.state === "failed" && (
            <Notice
              type="error"
              title="Generation failed"
              message={objectiveFailureMessage(
                view.value.latestJob.errorCode,
              )}
            />
          )}

          {actionMessage && (
            <Notice
              type={actionMessageType}
              message={actionMessage}
              onClose={() => setActionMessage(null)}
            />
          )}

          {hasDiffWithApproved && (
            <Notice
              type="warning"
              title="Draft in progress"
              message="Approved objectives still guide the lesson outline until you approve this new draft."
            />
          )}
        </>
      }
      candidateBanner={
        <CandidateBanner
          hasCandidate={false}
          isGenerating={generating}
          generatingMessage="AI is analyzing the confirmed source and generating structured learning objectives…"
        />
      }
      mainContent={
        draft === null ? (
          <div
            style={{
              padding: "36px 24px",
              textAlign: "center",
              backgroundColor: "var(--color-surface)",
              border: "1px dashed var(--color-border)",
              borderRadius: "var(--radius-card)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <Target size={36} weight="duotone" style={{ color: "var(--color-brand)" }} />
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 600 }}>
                No objectives generated yet
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "var(--color-text-muted)",
                  maxWidth: "440px",
                }}
              >
                Confirm your reviewed source and save the lesson configuration,
                then generate grounded learning objectives.
              </p>
            </div>
            {view.value.canGenerate && (
              <Button
                variant="primary"
                onClick={() => void generate()}
                disabled={submitting || generating}
              >
                <Sparkle size={16} weight="bold" />
                {submitting || generating
                  ? "Starting generation…"
                  : "Generate objectives"}
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Action Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "12px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Learning Plan ({draft.objectives.length} objective
                  {draft.objectives.length === 1 ? "" : "s"})
                </span>
                {view.value.canGenerate && (
                  <Button
                    variant="tertiary"
                    size="compact"
                    onClick={() => void generate()}
                    disabled={submitting || generating}
                  >
                    <Sparkle size={14} weight="bold" />
                    {submitting || generating
                      ? "Regenerating…"
                      : "Regenerate with AI"}
                  </Button>
                )}
              </div>

              {!isApproved && (
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => setIsAddingOpen((prev) => !prev)}
                  disabled={submitting}
                >
                  <Plus size={14} weight="bold" />
                  Add objective
                </Button>
              )}
            </div>

            {/* Inline Add Objective Form */}
            {isAddingOpen && !isApproved && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addObjective();
                }}
                style={{
                  padding: "16px 20px",
                  backgroundColor: "var(--color-surface-subtle)",
                  border: "1px solid var(--color-brand)",
                  borderRadius: "var(--radius-card)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Add a custom learning objective
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Objective statement
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Explain how photosynthesis converts light into glucose"
                    value={addStatement}
                    maxLength={500}
                    onChange={(e) => setAddStatement(e.target.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-control)",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      fontSize: "14px",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Measurable verb (Bloom's Taxonomy)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Explain, Identify, Compare"
                    value={addVerb}
                    maxLength={50}
                    onChange={(e) => setAddVerb(e.target.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "var(--radius-control)",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      fontSize: "14px",
                      color: "var(--color-text)",
                      outline: "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "4px",
                  }}
                >
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Teacher-added items without source citations will be tagged as
                    unsupported.
                  </span>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="compact"
                      onClick={() => setIsAddingOpen(false)}
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="compact"
                      disabled={submitting}
                    >
                      Add objective
                    </Button>
                  </div>
                </div>
              </form>
            )}

            {/* Objectives Ordered List */}
            <ol
              aria-label="Objectives"
              data-testid="objectives-list"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {draft.objectives.map((objective, index) => {
                const isFirst = index === 0;
                const isLast = index === draft.objectives.length - 1;
                const isEditingThis = editing?.objectiveId === objective.id;
                const isUnsupported =
                  objective.groundingStatus === "unsupported";

                return (
                  <ReorderItemContainer
                    key={objective.id}
                    id={objective.id}
                    index={index}
                    totalItems={draft.objectives.length}
                    isFirst={isFirst}
                    isLast={isLast}
                    disabled={submitting || isApproved}
                    isDragging={draggingId === objective.id}
                    lastMovedId={lastMovedId}
                    lastMovedDirection={lastMovedDirection}
                    onMoveUp={() => moveObjective(objective.id, -1)}
                    onMoveDown={() => moveObjective(objective.id, 1)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", objective.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(objective.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingId !== null) {
                        dropObjective(draggingId, objective.id);
                      }
                    }}
                    data-testid={`objective-item-${objective.id}`}
                  >
                    {isEditingThis ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          updateObjective();
                        }}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px",
                          padding: "12px",
                          backgroundColor: "var(--color-surface-subtle)",
                          borderRadius: "var(--radius-control)",
                          border: "1px solid var(--color-brand)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "var(--color-text)",
                            }}
                          >
                            Statement
                          </label>
                          <input
                            type="text"
                            value={editing.statement}
                            maxLength={500}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                statement: e.target.value,
                              })
                            }
                            style={{
                              padding: "8px 10px",
                              borderRadius: "var(--radius-control)",
                              border: "1px solid var(--color-border)",
                              backgroundColor: "var(--color-surface)",
                              fontSize: "13px",
                              color: "var(--color-text)",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: "var(--color-text)",
                            }}
                          >
                            Measurable verb
                          </label>
                          <input
                            type="text"
                            value={editing.verb}
                            maxLength={50}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                verb: e.target.value,
                              })
                            }
                            style={{
                              padding: "8px 10px",
                              borderRadius: "var(--radius-control)",
                              border: "1px solid var(--color-border)",
                              backgroundColor: "var(--color-surface)",
                              fontSize: "13px",
                              color: "var(--color-text)",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            justifyContent: "flex-end",
                          }}
                        >
                          <Button
                            type="button"
                            variant="tertiary"
                            size="compact"
                            onClick={() => setEditing(null)}
                            disabled={submitting}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            variant="primary"
                            size="compact"
                            disabled={submitting}
                          >
                            Save
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {/* Statement Line */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: "10px",
                            justifyContent: "space-between",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: 700,
                                color: "var(--color-brand)",
                                minWidth: "20px",
                              }}
                            >
                              {objective.order}.
                            </span>
                            <span
                              style={{
                                fontSize: "15px",
                                fontWeight: 500,
                                color: "var(--color-text)",
                                lineHeight: "1.5",
                              }}
                            >
                              {objective.statement}
                            </span>
                          </div>

                          {/* Item Controls */}
                          {!isApproved && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                flexShrink: 0,
                              }}
                            >
                              <Button
                                variant="tertiary"
                                size="compact"
                                onClick={() =>
                                  setEditing({
                                    objectiveId: objective.id,
                                    statement: objective.statement,
                                    verb: objective.verb,
                                  })
                                }
                                disabled={submitting}
                              >
                                <PencilSimple size={13} />
                                Edit
                              </Button>
                              <Button
                                variant="tertiary"
                                size="compact"
                                onClick={() => removeObjective(objective.id)}
                                disabled={submitting}
                              >
                                <Trash size={13} />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Metadata & Tag line */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: "8px",
                            paddingLeft: "28px",
                            fontSize: "12px",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          {/* Measurable Verb Tag */}
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "4px",
                              backgroundColor: "var(--color-surface-subtle)",
                              border: "1px solid var(--color-border)",
                              fontWeight: 600,
                              color: "var(--color-text)",
                            }}
                          >
                            Verb: {objective.verb}
                          </span>

                          {/* Author & Revision Tag */}
                          {!objective.generated && (
                            <StatusLabel
                              status="info"
                              label="Teacher added"
                              size="compact"
                            />
                          )}
                          {objective.revision > 0 && (
                            <StatusLabel
                              status="info"
                              label={`Edited (${objective.revision}×)`}
                              size="compact"
                            />
                          )}

                          {/* Grounding Status Tag */}
                          {isUnsupported ? (
                            <StatusLabel
                              status="warning"
                              label={objectiveGroundingLabel("unsupported")}
                              size="compact"
                            />
                          ) : (
                            <StatusLabel
                              status="success"
                              label={objectiveGroundingLabel("supported")}
                              size="compact"
                            />
                          )}

                          {objective.confidence !== undefined && (
                            <span style={{ fontSize: "11px" }}>
                              Confidence: {(objective.confidence * 100).toFixed(0)}%
                            </span>
                          )}

                          {/* Source Reference inspection link */}
                          {objective.sourceRefs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setInspectedObjective(objective)}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                color: "var(--color-brand)",
                                fontSize: "12px",
                                textDecoration: "underline",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <BookOpen size={13} />
                              {citationSummary(objective.sourceRefs)}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </ReorderItemContainer>
                );
              })}
            </ol>

            {/* Bottom Approval Area */}
            <div
              style={{
                marginTop: "16px",
                padding: "20px",
                backgroundColor: isApproved
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
                  {isApproved ? "Objectives Approved" : "Ready to proceed?"}
                </h4>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {isApproved
                    ? "These objectives are approved and currently guide lesson outline generation. Editing creates a new draft."
                    : "Approving captures an immutable snapshot of these objectives to guide outline generation."}
                </p>
              </div>

              {!isApproved ? (
                <Button
                  variant="primary"
                  onClick={() => approve()}
                  disabled={!view.value.canApprove || submitting}
                >
                  <CheckCircle size={16} weight="bold" />
                  Approve objectives
                </Button>
              ) : (
                <StatusLabel status="success" label="Active approved set" />
              )}
            </div>
          </div>
        )
      }
      sidebarContent={
        draft ? (
          <>
            <div>
              <h3
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Artifact details
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Set ID:</span>
                  <span style={{ fontWeight: 500, color: "var(--color-text)" }}>
                    {draft.id.slice(0, 8)}…
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Revision:</span>
                  <span style={{ fontWeight: 500, color: "var(--color-text)" }}>
                    v{draft.revision}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Config binding:</span>
                  <span style={{ fontWeight: 500, color: "var(--color-text)" }}>
                    v{draft.configurationVersion}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Prompt version:</span>
                  <span style={{ fontWeight: 500, color: "var(--color-text)" }}>
                    {draft.promptId}@{draft.promptVersion}
                  </span>
                </div>
              </div>
            </div>

            {/* Approved Baseline Comparison if viewing new draft */}
            {hasDiffWithApproved && approved && (
              <div
                style={{
                  paddingTop: "16px",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                <h4
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Previously approved baseline
                </h4>
                <p
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {approved.objectives.length} active objectives in lesson pipeline:
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: "16px",
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  {approved.objectives.map((o) => (
                    <li key={o.id}>
                      <span style={{ fontWeight: 500 }}>{o.order}.</span>{" "}
                      {o.statement}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : null
      }
      sourceDrawer={
        <SourceDrawer
          isOpen={inspectedObjective !== null}
          onClose={() => setInspectedObjective(null)}
          title={
            inspectedObjective
              ? `Sources for Objective #${inspectedObjective.order}`
              : "Source Citations"
          }
          sourceRefs={inspectedObjective?.sourceRefs ?? []}
          projectId={projectId}
        />
      }
    />
  );
}
