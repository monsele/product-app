"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  objectivesResponseSchema,
  outlineResponseSchema,
  type LearningObjectiveSet,
  type LessonOutlineItem,
  type LessonOutlineSet,
  type ObjectivesResponse,
  type OutlineItemKind,
  type OutlineResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  outlineFailureMessage,
  outlineGenerationStateLabel,
  outlineItemKindLabel,
  outlineValidationWarnings,
} from "./outline-input";

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

export function OutlinePanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [objectivesView, setObjectivesView] = useState<ObjectivesViewState>({
    kind: "loading",
  });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [adding, setAdding] = useState<ItemDraft>(emptyDraft());
  const [draggingId, setDraggingId] = useState<string | null>(null);

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
        setActionMessage(`Outline ${successMessage.toLowerCase()}.`);
        await refresh().catch(() => undefined);
      } catch (error) {
        setActionMessage(
          error instanceof Error ? error.message : "Unable to update outline.",
        );
        await refresh().catch(() => undefined);
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
      return;
    }
    if (adding.objectiveIds.length === 0) {
      setActionMessage("Link the item to at least one approved objective.");
      return;
    }
    void mutate("POST", "/items", {
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
    }, "item added");
  }, [adding, mutate, value]);

  const updateItem = useCallback(() => {
    if (value === null || value.set === null || editing === null) return;
    const estimatedSeconds = Number(editing.estimatedSeconds);
    if (!Number.isInteger(estimatedSeconds) || estimatedSeconds < 10) {
      setActionMessage("Enter an estimated duration of at least 10 seconds.");
      return;
    }
    if (editing.objectiveIds.length === 0) {
      setActionMessage("Link the item to at least one approved objective.");
      return;
    }
    void mutate("PATCH", `/items/${encodeURIComponent(editing.itemId)}`, {
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
    }, "item updated");
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
    );
  }, [mutate, value]);

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
  const warnings = outlineValidationWarnings(view.value.validation);

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

      {warnings.map((warning) => (
        <p key={warning} role={view.value.canApprove ? "status" : "alert"}>
          {warning}
        </p>
      ))}

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
        <OutlineEditor
          projectId={projectId}
          set={draft}
          approved={approved}
          approvedObjectives={approvedObjectives}
          objectiveStatement={objectiveStatement}
          editing={editing}
          adding={adding}
          onEditStart={(item) =>
            setEditing({
              itemId: item.id,
              kind: item.kind,
              title: item.title,
              description: item.description,
              estimatedSeconds: String(item.estimatedSeconds),
              sourceBlockIds: item.sourceRefs.flatMap((ref) =>
                ref.blockIds,
              ).join(", "),
              framingNote: item.framingNote ?? "",
              objectiveIds: item.objectiveIds,
            })
          }
          onEditChange={setEditing}
          onEditCancel={() => setEditing(null)}
          onAddingChange={setAdding}
          onAdd={addItem}
          onUpdate={updateItem}
          onRemove={removeItem}
          onMove={moveItem}
          onDropItem={dropItem}
          onApprove={approve}
          canApprove={view.value.canApprove && !submitting}
          disabled={submitting}
          draggingId={draggingId}
          onDraggingChange={setDraggingId}
        />
      )}
    </section>
  );
}

function OutlineEditor({
  projectId,
  set,
  approved,
  approvedObjectives,
  objectiveStatement,
  editing,
  adding,
  onEditStart,
  onEditChange,
  onEditCancel,
  onAddingChange,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onDropItem,
  onApprove,
  canApprove,
  disabled,
  draggingId,
  onDraggingChange,
}: {
  projectId: string;
  set: LessonOutlineSet;
  approved: LessonOutlineSet | null;
  approvedObjectives: LearningObjectiveSet | null;
  objectiveStatement: (objectiveId: string) => string;
  editing: EditingState | null;
  adding: ItemDraft;
  onEditStart: (item: LessonOutlineItem) => void;
  onEditChange: (state: EditingState) => void;
  onEditCancel: () => void;
  onAddingChange: (draft: ItemDraft) => void;
  onAdd: () => void;
  onUpdate: () => void;
  onRemove: (itemId: string) => void;
  onMove: (itemId: string, direction: -1 | 1) => void;
  onDropItem: (draggedId: string, targetId: string) => void;
  onApprove: () => void;
  canApprove: boolean;
  disabled: boolean;
  draggingId: string | null;
  onDraggingChange: (itemId: string | null) => void;
}) {
  const isApproved = set.status === "approved";
  return (
    <div>
      <p>
        {isApproved ? "Approved outline" : "Draft outline"} {set.id.slice(0, 8)}{" "}
        — prompt {set.promptId}@{set.promptVersion}, configuration v
        {set.configurationVersion}. Estimated total:{" "}
        {set.totalEstimatedSeconds} seconds.
      </p>

      <ol aria-label="Outline items" data-testid="outline-items">
        {set.items.map((item, index) => (
          <li
            key={item.id}
            draggable={!isApproved && !disabled}
            onDragStart={(event) => {
              event.dataTransfer.setData("text/plain", item.id);
              event.dataTransfer.effectAllowed = "move";
              onDraggingChange(item.id);
            }}
            onDragEnd={() => onDraggingChange(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (draggingId !== null) onDropItem(draggingId, item.id);
            }}
            data-testid={`outline-item-${item.id}`}
          >
            {editing?.itemId === item.id ? (
              <ItemForm
                draft={editing}
                approvedObjectives={approvedObjectives}
                objectiveStatement={objectiveStatement}
                onChange={(draft) =>
                  onEditChange({ itemId: editing.itemId, ...draft })
                }
                onSave={onUpdate}
                onCancel={onEditCancel}
                disabled={disabled}
              />
            ) : (
              <>
                <p>
                  {item.order}. {item.title} — {outlineItemKindLabel(item.kind)}{" "}
                  · {item.estimatedSeconds}s
                  {item.generated ? "" : ". Teacher-added item"}
                </p>
                <p>{item.description}</p>
                {item.framingNote !== null ? (
                  <p role="status">Generated framing: {item.framingNote}</p>
                ) : null}
                <p>
                  Links to {item.objectiveIds.length} objective
                  {item.objectiveIds.length === 1 ? "" : "s"}:{" "}
                  {item.objectiveIds.map(objectiveStatement).join("; ")}
                </p>
                <p>
                  Source:{" "}
                  <a
                    href={`/workspace/${encodeURIComponent(projectId)}/review`}
                  >
                    {citationText(item)}
                  </a>
                  .
                  {item.revision > 0
                    ? ` Edited ${item.revision} time${
                        item.revision === 1 ? "" : "s"
                      }.`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => onEditStart(item)}
                  disabled={disabled || isApproved}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.id, -1)}
                  disabled={disabled || isApproved || index === 0}
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => onMove(item.id, 1)}
                  disabled={disabled || isApproved || index === set.items.length - 1}
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={disabled || isApproved}
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ol>

      {!isApproved ? (
        <ItemForm
          draft={adding}
          approvedObjectives={approvedObjectives}
          objectiveStatement={objectiveStatement}
          onChange={onAddingChange}
          onSave={onAdd}
          onCancel={() => onAddingChange(emptyDraft())}
          disabled={disabled}
          isAdd
        />
      ) : null}

      {approved !== null ? (
        <section aria-label="Approved outline">
          <h3>Approved outline (used by narration generation)</h3>
          <ol>
            {approved.items.map((item) => (
              <li key={item.id}>
                {item.order}. {item.title} — {outlineItemKindLabel(item.kind)} ·{" "}
                {item.estimatedSeconds}s
              </li>
            ))}
          </ol>
          <p>
            Estimated total: {approved.totalEstimatedSeconds} seconds.
          </p>
        </section>
      ) : null}

      {!isApproved ? (
        <button type="button" onClick={() => onApprove()} disabled={!canApprove}>
          Approve outline
        </button>
      ) : (
        <p role="status">
          These outline items are approved and will guide narration. Editing
          them creates a new draft.
        </p>
      )}
    </div>
  );
}

function ItemForm({
  draft,
  approvedObjectives,
  objectiveStatement,
  onChange,
  onSave,
  onCancel,
  disabled,
  isAdd = false,
}: {
  draft: ItemDraft;
  approvedObjectives: LearningObjectiveSet | null;
  objectiveStatement: (objectiveId: string) => string;
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
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label>
        Item kind
        <select
          value={draft.kind}
          onChange={(event) =>
            onChange({ ...draft, kind: event.target.value as OutlineItemKind })
          }
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
      </label>
      <label>
        Title
        <input
          type="text"
          value={draft.title}
          maxLength={160}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          value={draft.description}
          maxLength={1000}
          onChange={(event) =>
            onChange({ ...draft, description: event.target.value })
          }
        />
      </label>
      <label>
        Estimated duration (seconds)
        <input
          type="number"
          min={10}
          max={240}
          value={draft.estimatedSeconds}
          onChange={(event) =>
            onChange({ ...draft, estimatedSeconds: event.target.value })
          }
        />
      </label>
      <label>
        Source block IDs (comma separated)
        <input
          type="text"
          value={draft.sourceBlockIds}
          onChange={(event) =>
            onChange({ ...draft, sourceBlockIds: event.target.value })
          }
        />
      </label>
      {draft.kind === "hook" ? (
        <label>
          Framing note (required when a hook cites no source blocks)
          <input
            type="text"
            value={draft.framingNote}
            maxLength={500}
            onChange={(event) =>
              onChange({ ...draft, framingNote: event.target.value })
            }
          />
        </label>
      ) : null}
      <fieldset>
        <legend>Linked approved objectives</legend>
        {approvedObjectives === null ? (
          <p role="status">Approved objectives are not available.</p>
        ) : (
          approvedObjectives.objectives.map((objective) => (
            <label key={objective.id}>
              <input
                type="checkbox"
                checked={draft.objectiveIds.includes(objective.id)}
                onChange={() => toggleObjective(objective.id)}
              />
              {objective.order}. {objectiveStatement(objective.id)}
            </label>
          ))
        )}
      </fieldset>
      <button type="submit" disabled={disabled}>
        {isAdd ? "Add outline item" : "Save"}
      </button>
      <button type="button" onClick={onCancel} disabled={disabled}>
        {isAdd ? "Clear" : "Cancel"}
      </button>
      <p role="status">
        Every non-hook item must cite a source block and every uncited hook
        needs a framing note before approval. The total estimated duration is
        recalculated after every save.
      </p>
    </form>
  );
}
