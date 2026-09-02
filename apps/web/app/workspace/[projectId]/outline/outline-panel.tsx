"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  objectivesResponseSchema,
  outlineResponseSchema,
  type LearningObjectiveSet,
  type LessonOutlineItem,
  type ObjectivesResponse,
  type OutlineItemKind,
  type OutlineResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  outlineDurationStatusLabel,
  outlineFailureMessage,
  outlineItemKindLabel,
  outlineValidationWarnings,
} from "./outline-input";
import { ReviewEditorScaffold } from "../../../../components/review-editor/review-editor-scaffold";
import { ReorderItemContainer } from "../../../../components/review-editor/reorder-item-container";
import { SourceDrawer } from "../../../../components/review-editor/source-drawer";
import { CandidateBanner } from "../../../../components/review-editor/candidate-banner";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import { StatusLabel } from "../../../../components/ui/status-label";
import { toast } from "../../../../components/ui/toast-provider";
import { useTaskStatusNotification } from "../../../../lib/use-task-notification";
import {
  ArrowRight,
  BookOpen,
  CheckCircle,
  Clock,
  PencilSimple,
  Plus,
  Sparkle,
  Target,
  Trash,
  TreeStructure,
} from "@phosphor-icons/react";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: OutlineResponse }
  | { kind: "failed"; message: string };

type ObjectivesViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: ObjectivesResponse }
  | { kind: "failed" };

type ItemDraft = {
  kind: OutlineItemKind;
  title: string;
  description: string;
  estimatedSeconds: string;
  sourceBlockIds: string;
  framingNote: string;
  objectiveIds: string[];
};

type EditingState = { itemId: string } & ItemDraft;

const emptyDraft = (): ItemDraft => ({
  kind: "concept",
  title: "",
  description: "",
  estimatedSeconds: "30",
  sourceBlockIds: "",
  framingNote: "",
  objectiveIds: [],
});

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

function citationText(item: LessonOutlineItem): string {
  if (item.sourceRefs.length === 0) return "No source references";
  const blocks = item.sourceRefs.reduce(
    (count, ref) => count + ref.blockIds.length,
    0,
  );
  return `${item.sourceRefs.length} section${
    item.sourceRefs.length === 1 ? "" : "s"
  }, ${blocks} source block${blocks === 1 ? "" : "s"}`;
}

export function OutlinePanel({
  projectId,
  projectTitle = "Lesson",
}: {
  projectId: string;
  projectTitle?: string;
}) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [objectivesView, setObjectivesView] = useState<ObjectivesViewState>({
    kind: "loading",
  });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionMessageType, setActionMessageType] = useState<
    "info" | "success" | "error" | "warning"
  >("info");
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [adding, setAdding] = useState<ItemDraft>(emptyDraft());
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  // Drag-and-drop & Reorder state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [lastMovedId, setLastMovedId] = useState<string | null>(null);
  const [lastMovedDirection, setLastMovedDirection] = useState<-1 | 1 | null>(
    null,
  );

  // Source drawer inspection state
  const [inspectedItem, setInspectedItem] = useState<LessonOutlineItem | null>(
    null,
  );

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

  const outlineReady = view.kind === "ready";

  useEffect(() => {
    if (!outlineReady) return;
    let cancelled = false;
    void fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/objectives`),
      { credentials: "include", cache: "no-store" },
    )
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error("objectives");
        const parsed = objectivesResponseSchema.safeParse(payload);
        if (!parsed.success) throw new Error("objectives");
        if (!cancelled)
          setObjectivesView({ kind: "ready", value: parsed.data });
      })
      .catch(() => {
        if (!cancelled) setObjectivesView({ kind: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [outlineReady, projectId]);

  const value = view.kind === "ready" ? view.value : null;
  const generating = value !== null && isGenerating(value.state);

  useTaskStatusNotification({
    taskName: "Lesson outline generation",
    status: value?.latestJob?.state,
    successMessage: "Lesson outline generated successfully.",
    errorMessage:
      (value?.latestJob?.errorCode &&
        outlineFailureMessage(value.latestJob.errorCode)) ||
      "Outline generation failed.",
  });

  useEffect(() => {
    if (!pending && !generating) return;
    const timer = window.setInterval(() => {
      void refresh()
        .then(() => setPending(false))
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [pending, generating, refresh]);

  const approvedObjectives = useMemo(
    () =>
      objectivesView.kind === "ready" &&
      objectivesView.value.approved !== null
        ? objectivesView.value.approved
        : null,
    [objectivesView],
  );

  const objectiveStatement = useCallback(
    (objectiveId: string): string => {
      const set: LearningObjectiveSet | null = approvedObjectives;
      const objective = set?.objectives.find(
        (candidate) => candidate.id === objectiveId,
      );
      return objective === undefined
        ? objectiveId.slice(0, 8)
        : objective.statement;
    },
    [approvedObjectives],
  );

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
      const msg = "Outline generation job started.";
      setActionMessage(msg);
      setActionMessageType("info");
      toast.info("Lesson outline generation started.");
    } catch (error) {
      setPending(false);
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Unable to start outline generation.";
      setActionMessage(errorMsg);
      setActionMessageType("error");
      toast.error(errorMsg);
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  const router = useRouter();

  const mutate = useCallback(
    async (
      method: string,
      path: string,
      body: unknown,
      successMessage: string,
    ): Promise<boolean> => {
      setActionMessage(null);
      setSubmitting(true);
      try {
        const response = await fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/outline${path}`),
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
        setAdding(emptyDraft());
        setIsAddingOpen(false);
        const msg = `Outline ${successMessage.toLowerCase()}.`;
        setActionMessage(msg);
        setActionMessageType("success");
        toast.success(msg);
        await refresh().catch(() => undefined);
        return true;
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unable to update outline.";
        setActionMessage(errorMsg);
        setActionMessageType("error");
        toast.error(errorMsg);
        await refresh().catch(() => undefined);
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [projectId, refresh],
  );

  const addItem = useCallback(() => {
    if (value === null || value.set === null) return;
    const estimatedSeconds = Number(adding.estimatedSeconds);
    if (!Number.isInteger(estimatedSeconds) || estimatedSeconds < 10) {
      setActionMessage("Enter an estimated duration of at least 10 seconds.");
      setActionMessageType("warning");
      return;
    }
    if (adding.objectiveIds.length === 0) {
      setActionMessage("Link the item to at least one approved objective.");
      setActionMessageType("warning");
      return;
    }
    void mutate(
      "POST",
      "/items",
      {
        kind: adding.kind,
        title: adding.title,
        description: adding.description,
        estimatedSeconds,
        objectiveIds: adding.objectiveIds,
        ...(adding.sourceBlockIds.trim().length === 0
          ? {}
          : {
              sourceBlockIds: adding.sourceBlockIds
                .split(",")
                .map((id) => id.trim())
                .filter((id) => id.length > 0),
            }),
        ...(adding.framingNote.trim().length === 0
          ? {}
          : { framingNote: adding.framingNote.trim() }),
        expectedRevision: value.set.revision,
      },
      "item added",
    );
  }, [adding, mutate, value]);

  const updateItem = useCallback(() => {
    if (value === null || value.set === null || editing === null) return;
    const estimatedSeconds = Number(editing.estimatedSeconds);
    if (!Number.isInteger(estimatedSeconds) || estimatedSeconds < 10) {
      setActionMessage("Enter an estimated duration of at least 10 seconds.");
      setActionMessageType("warning");
      return;
    }
    if (editing.objectiveIds.length === 0) {
      setActionMessage("Link the item to at least one approved objective.");
      setActionMessageType("warning");
      return;
    }
    void mutate(
      "PATCH",
      `/items/${encodeURIComponent(editing.itemId)}`,
      {
        kind: editing.kind,
        title: editing.title,
        description: editing.description,
        estimatedSeconds,
        objectiveIds: editing.objectiveIds,
        sourceBlockIds: editing.sourceBlockIds
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
        framingNote:
          editing.framingNote.trim().length === 0
            ? null
            : editing.framingNote.trim(),
        expectedRevision: value.set.revision,
      },
      "item updated",
    );
  }, [editing, mutate, value]);

  const removeItem = useCallback(
    (itemId: string) => {
      if (value === null || value.set === null) return;
      void mutate(
        "DELETE",
        `/items/${encodeURIComponent(itemId)}`,
        { expectedRevision: value.set.revision },
        "item removed",
      );
    },
    [mutate, value],
  );

  const moveItem = useCallback(
    (itemId: string, direction: -1 | 1) => {
      if (value === null || value.set === null) return;
      const items = value.set.items;
      const index = items.findIndex((item) => item.id === itemId);
      const swapWith = index + direction;
      if (index === -1 || swapWith < 0 || swapWith >= items.length) return;
      const itemIds = items.map((item) => item.id);
      [itemIds[index], itemIds[swapWith]] = [
        itemIds[swapWith]!,
        itemIds[index]!,
      ];
      setLastMovedId(itemId);
      setLastMovedDirection(direction);
      void mutate(
        "POST",
        "/reorder",
        { itemIds, expectedRevision: value.set.revision },
        "reordered",
      );
    },
    [mutate, value],
  );

  const dropItem = useCallback(
    (draggedId: string, targetId: string) => {
      if (value === null || value.set === null || draggedId === targetId)
        return;
      const itemIds = value.set.items.map((item) => item.id);
      const fromIndex = itemIds.indexOf(draggedId);
      const toIndex = itemIds.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      itemIds.splice(fromIndex, 1);
      itemIds.splice(toIndex, 0, draggedId);
      setLastMovedId(draggedId);
      setLastMovedDirection(null);
      void mutate(
        "POST",
        "/reorder",
        { itemIds, expectedRevision: value.set.revision },
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
    ).then((ok) => {
      // Approval moves the project to narration_storyboard_review. The pipeline
      // rail is rendered by the server component from project.stage, so without
      // this the Narration step stays blocked until a manual reload.
      if (ok) router.refresh();
    });
  }, [mutate, router, value]);

  if (view.kind === "loading") {
    return (
      <ReviewEditorScaffold
        title="Lesson outline"
        subtitle="Loading lesson outline…"
        mainContent={
          <div style={{ padding: "40px 0", textAlign: "center" }}>
            <p role="status" style={{ color: "var(--color-text-muted)" }}>
              Loading the lesson outline…
            </p>
          </div>
        }
      />
    );
  }

  if (view.kind === "failed") {
    return (
      <ReviewEditorScaffold
        title="Lesson outline"
        subtitle="Review lesson outline"
        notices={
          <Notice
            type="error"
            title="Failed to load outline"
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
  const warnings = outlineValidationWarnings(view.value.validation);
  const isApproved = draft !== null && draft.status === "approved";
  const hasDiffWithApproved =
    approved !== null && draft !== null && approved.id !== draft.id;

  return (
    <ReviewEditorScaffold
      title="Lesson outline"
      subtitle={`Review the structured vertical story arc and timing for ${projectTitle}.`}
      statusBadge={
        draft ? (
          <>
            {isApproved ? (
              <StatusLabel status="success" label="Approved outline" />
            ) : (
              <StatusLabel status="info" label="Draft outline" />
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
              message={outlineFailureMessage(
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

          {warnings.map((warning, idx) => (
            <Notice
              key={idx}
              type={view.value.canApprove ? "warning" : "error"}
              title="Outline validation note"
              message={warning}
            />
          ))}

          {hasDiffWithApproved && (
            <Notice
              type="warning"
              title="Draft outline in progress"
              message="An approved outline still guides narration and storyboard until you approve this draft."
            />
          )}
        </>
      }
      candidateBanner={
        <CandidateBanner
          hasCandidate={false}
          isGenerating={generating}
          generatingMessage="AI is analyzing approved objectives and source citations to build a duration-aware outline…"
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
            <TreeStructure size={36} weight="duotone" style={{ color: "var(--color-brand)" }} />
            <div>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: 600 }}>
                No outline generated yet
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "var(--color-text-muted)",
                  maxWidth: "440px",
                }}
              >
                Confirm your reviewed source, complete lesson setup, and approve
                learning objectives before generating the outline.
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
                  : "Generate outline"}
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
                  Story Arc ({draft.items.length} section
                  {draft.items.length === 1 ? "" : "s"})
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
                      : "Regenerate outline"}
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
                  Add section
                </Button>
              )}
            </div>

            {/* Inline Add Item Form */}
            {isAddingOpen && !isApproved && (
              <div
                style={{
                  padding: "18px 20px",
                  backgroundColor: "var(--color-surface-subtle)",
                  border: "1px solid var(--color-brand)",
                  borderRadius: "var(--radius-card)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px 0",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Add a new outline section
                </h3>
                <ItemFormFields
                  draft={adding}
                  approvedObjectives={approvedObjectives}
                  objectiveStatement={objectiveStatement}
                  onChange={setAdding}
                  onSave={addItem}
                  onCancel={() => setIsAddingOpen(false)}
                  disabled={submitting}
                  isAdd
                />
              </div>
            )}

            {/* Outline Ordered Items List */}
            <ol
              aria-label="Outline items"
              data-testid="outline-items"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {draft.items.map((item, index) => {
                const isFirst = index === 0;
                const isLast = index === draft.items.length - 1;
                const isEditingThis = editing?.itemId === item.id;

                return (
                  <ReorderItemContainer
                    key={item.id}
                    id={item.id}
                    index={index}
                    totalItems={draft.items.length}
                    isFirst={isFirst}
                    isLast={isLast}
                    disabled={submitting || isApproved}
                    isDragging={draggingId === item.id}
                    lastMovedId={lastMovedId}
                    lastMovedDirection={lastMovedDirection}
                    onMoveUp={() => moveItem(item.id, -1)}
                    onMoveDown={() => moveItem(item.id, 1)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", item.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(item.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingId !== null) {
                        dropItem(draggingId, item.id);
                      }
                    }}
                    data-testid={`outline-item-${item.id}`}
                  >
                    {isEditingThis ? (
                      <div
                        style={{
                          padding: "16px",
                          backgroundColor: "var(--color-surface-subtle)",
                          borderRadius: "var(--radius-control)",
                          border: "1px solid var(--color-brand)",
                        }}
                      >
                        <ItemFormFields
                          draft={editing}
                          approvedObjectives={approvedObjectives}
                          objectiveStatement={objectiveStatement}
                          onChange={(d) =>
                            setEditing({ itemId: editing.itemId, ...d })
                          }
                          onSave={updateItem}
                          onCancel={() => setEditing(null)}
                          disabled={submitting}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        {/* Title line */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: "12px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
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
                              {item.order}.
                            </span>
                            <span
                              style={{
                                fontSize: "15px",
                                fontWeight: 600,
                                color: "var(--color-text)",
                              }}
                            >
                              {item.title}
                            </span>
                            <StatusLabel
                              status="info"
                              label={outlineItemKindLabel(item.kind)}
                              size="compact"
                            />
                            <StatusLabel
                              status="info"
                              label={`${item.estimatedSeconds}s`}
                              size="compact"
                            />
                          </div>

                          {/* Action buttons */}
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
                                    itemId: item.id,
                                    kind: item.kind,
                                    title: item.title,
                                    description: item.description,
                                    estimatedSeconds: String(
                                      item.estimatedSeconds,
                                    ),
                                    sourceBlockIds: item.sourceRefs
                                      .flatMap((ref) => ref.blockIds)
                                      .join(", "),
                                    framingNote: item.framingNote ?? "",
                                    objectiveIds: item.objectiveIds,
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
                                onClick={() => removeItem(item.id)}
                                disabled={submitting}
                              >
                                <Trash size={13} />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Description */}
                        <p
                          style={{
                            margin: 0,
                            paddingLeft: "28px",
                            fontSize: "14px",
                            color: "var(--color-text-muted)",
                            lineHeight: "1.5",
                          }}
                        >
                          {item.description}
                        </p>

                        {/* Framing Note if present */}
                        {item.framingNote && (
                          <div
                            style={{
                              marginLeft: "28px",
                              padding: "6px 10px",
                              borderRadius: "4px",
                              backgroundColor: "var(--color-surface-subtle)",
                              borderLeft: "3px solid var(--color-brand)",
                              fontSize: "12px",
                              color: "var(--color-text)",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>Framing note:</span>{" "}
                            {item.framingNote}
                          </div>
                        )}

                        {/* Objective chips & Citations */}
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
                          {item.objectiveIds.length > 0 && (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                flexWrap: "wrap",
                              }}
                            >
                              <Target size={14} style={{ color: "var(--color-brand)" }} />
                              <span>Covers:</span>
                              {item.objectiveIds.map((objId) => (
                                <span
                                  key={objId}
                                  title={objectiveStatement(objId)}
                                  style={{
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    backgroundColor: "var(--color-surface-subtle)",
                                    border: "1px solid var(--color-border)",
                                    fontSize: "11px",
                                    color: "var(--color-text)",
                                    maxWidth: "200px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {objectiveStatement(objId)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Source References */}
                          {item.sourceRefs.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setInspectedItem(item)}
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
                              {citationText(item)}
                            </button>
                          )}

                          {!item.generated && (
                            <StatusLabel
                              status="info"
                              label="Teacher added"
                              size="compact"
                            />
                          )}

                          {item.revision > 0 && (
                            <StatusLabel
                              status="info"
                              label={`Edited (${item.revision}×)`}
                              size="compact"
                            />
                          )}
                        </div>
                      </div>
                    )}
                  </ReorderItemContainer>
                );
              })}
            </ol>

            {/* Approval Footer */}
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
                  {isApproved ? "Outline Approved" : "Ready to proceed?"}
                </h4>
                <p
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {isApproved
                    ? "This outline is approved and guides narration generation. Editing creates a new draft."
                    : "Approving confirms the lesson structure and unlocks narration writing."}
                </p>
              </div>

              {!isApproved ? (
                <Button
                  variant="primary"
                  onClick={() => approve()}
                  disabled={!view.value.canApprove || submitting}
                >
                  <CheckCircle size={16} weight="bold" />
                  Approve outline
                </Button>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <StatusLabel
                    status="success"
                    label="Active approved outline"
                  />
                  <Link
                    href={`/workspace/${encodeURIComponent(projectId)}/narration`}
                    prefetch={true}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "9px 18px",
                      backgroundColor: "var(--color-brand)",
                      color: "var(--color-on-brand)",
                      borderRadius: "var(--radius-control)",
                      fontSize: "14px",
                      fontWeight: 600,
                      textDecoration: "none",
                      cursor: "pointer",
                      boxShadow: "var(--shadow-elevation)",
                      transition:
                        "opacity var(--motion-quick) var(--motion-easing)",
                    }}
                  >
                    <span>Proceed to narration</span>
                    <ArrowRight weight="bold" size={16} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )
      }
      sidebarContent={
        draft ? (
          <>
            {/* Timing & Duration Tracker */}
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "10px",
                }}
              >
                <Clock size={16} weight="bold" style={{ color: "var(--color-brand)" }} />
                <h3
                  style={{
                    margin: 0,
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Estimated duration
                </h3>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  padding: "12px",
                  backgroundColor: "var(--color-surface-subtle)",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  Total runtime
                </span>
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "var(--color-text)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {draft.totalEstimatedSeconds}s
                </span>
              </div>

              <div style={{ marginTop: "6px" }}>
                <StatusLabel
                  status={
                    view.value.validation.durationStatus === "within"
                      ? "success"
                      : "warning"
                  }
                  label={outlineDurationStatusLabel(
                    view.value.validation.durationStatus,
                  )}
                  size="compact"
                />
              </div>
            </div>

            {/* Objective Coverage Breakdown */}
            {approvedObjectives && (
              <div
                style={{
                  paddingTop: "16px",
                  borderTop: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "8px",
                  }}
                >
                  <Target size={16} weight="bold" style={{ color: "var(--color-brand)" }} />
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "var(--color-text)",
                    }}
                  >
                    Objective coverage
                  </h3>
                </div>

                <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "var(--color-text-muted)" }}>
                  {
                    approvedObjectives.objectives.filter((o) =>
                      !view.value.validation.uncoveredObjectiveIds.includes(o.id),
                    ).length
                  }{" "}
                  of {approvedObjectives.objectives.length} objectives covered
                </p>

                {view.value.validation.uncoveredObjectiveIds.length > 0 && (
                  <div
                    style={{
                      padding: "8px 10px",
                      borderRadius: "var(--radius-control)",
                      backgroundColor: "var(--color-warning-bg)",
                      color: "var(--color-warning-fg)",
                      fontSize: "12px",
                    }}
                  >
                    {view.value.validation.uncoveredObjectiveIds.length} uncovered
                    objective(s) remaining.
                  </div>
                )}
              </div>
            )}

            {/* Outline Metadata */}
            <div
              style={{
                paddingTop: "16px",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <h3
                style={{
                  margin: "0 0 10px 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Outline details
              </h3>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Outline ID:</span>
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
          </>
        ) : null
      }
      sourceDrawer={
        <SourceDrawer
          isOpen={inspectedItem !== null}
          onClose={() => setInspectedItem(null)}
          title={
            inspectedItem
              ? `Sources for Section #${inspectedItem.order}: ${inspectedItem.title}`
              : "Source Citations"
          }
          sourceRefs={inspectedItem?.sourceRefs ?? []}
          projectId={projectId}
        />
      }
    />
  );
}

function ItemFormFields({
  draft,
  approvedObjectives,
  onChange,
  onSave,
  onCancel,
  disabled,
  isAdd = false,
}: {
  draft: ItemDraft;
  approvedObjectives: LearningObjectiveSet | null;
  objectiveStatement?: (objectiveId: string) => string;
  onChange: (draft: ItemDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  disabled: boolean;
  isAdd?: boolean;
}) {
  const toggleObjective = (objectiveId: string) => {
    const selected = draft.objectiveIds.includes(objectiveId)
      ? draft.objectiveIds.filter((id) => id !== objectiveId)
      : [...draft.objectiveIds, objectiveId];
    onChange({ ...draft, objectiveIds: selected });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "14px" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Structural kind
          </label>
          <select
            value={draft.kind}
            onChange={(e) =>
              onChange({
                ...draft,
                kind: e.target.value as OutlineItemKind,
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
          >
            {(
              [
                "hook",
                "concept",
                "example",
                "analogy",
                "summary",
                "recall_question",
              ] as const
            ).map((kind) => (
              <option key={kind} value={kind}>
                {outlineItemKindLabel(kind)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Estimated duration (seconds)
          </label>
          <input
            type="number"
            min={10}
            max={240}
            value={draft.estimatedSeconds}
            onChange={(e) =>
              onChange({ ...draft, estimatedSeconds: e.target.value })
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
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Section title
        </label>
        <input
          type="text"
          value={draft.title}
          maxLength={160}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="e.g. The Chemical Equation for Photosynthesis"
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

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Teaching purpose & description
        </label>
        <textarea
          value={draft.description}
          maxLength={1000}
          rows={3}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Describe what learners should see and understand during this section…"
          style={{
            padding: "8px 10px",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            fontSize: "13px",
            color: "var(--color-text)",
            resize: "vertical",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Source block IDs (comma-separated, optional)
        </label>
        <input
          type="text"
          value={draft.sourceBlockIds}
          onChange={(e) =>
            onChange({ ...draft, sourceBlockIds: e.target.value })
          }
          placeholder="e.g. block-1, block-2"
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

      {draft.kind === "hook" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Framing note (required when hook cites no source blocks)
          </label>
          <input
            type="text"
            value={draft.framingNote}
            maxLength={500}
            onChange={(e) =>
              onChange({ ...draft, framingNote: e.target.value })
            }
            placeholder="e.g. Why do leaves turn green?"
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
      )}

      {/* Linked Objectives */}
      <fieldset
        style={{
          margin: 0,
          padding: "12px",
          borderRadius: "var(--radius-control)",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <legend
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text)",
            padding: "0 4px",
          }}
        >
          Covered Learning Objectives (select at least one)
        </legend>
        {approvedObjectives === null ||
        approvedObjectives.objectives.length === 0 ? (
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
            No approved objectives found. Return to the Objectives step to
            approve objectives first.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {approvedObjectives.objectives.map((obj) => {
              const checked = draft.objectiveIds.includes(obj.id);
              return (
                <label
                  key={obj.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    fontSize: "12px",
                    color: "var(--color-text)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleObjective(obj.id)}
                    style={{ marginTop: "2px" }}
                  />
                  <span>
                    <span style={{ fontWeight: 600 }}>{obj.order}.</span>{" "}
                    {obj.statement}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "8px",
          marginTop: "4px",
        }}
      >
        <Button
          type="button"
          variant="tertiary"
          size="compact"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="compact"
          disabled={disabled}
        >
          {isAdd ? "Add section" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
