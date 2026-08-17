"use client";

import { useCallback, useEffect, useState } from "react";
import {
  objectivesResponseSchema,
  type LearningObjective,
  type LearningObjectiveSet,
  type ObjectivesResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  objectiveFailureMessage,
  objectiveGenerationStateLabel,
  objectiveGroundingLabel,
} from "./objectives-input";

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

function citationText(
  sourceRefs: LearningObjective["sourceRefs"],
): string {
  if (sourceRefs.length === 0) return "No source references";
  return sourceRefs
    .map((ref) => {
      const pages =
        ref.pageEnd === undefined
          ? `p. ${ref.pageStart}`
          : `pp. ${ref.pageStart}–${ref.pageEnd}`;
      return `${ref.sectionId?.slice(0, 8) ?? ""} ${pages} (${ref.blockIds.length} block${ref.blockIds.length === 1 ? "" : "s"})`;
    })
    .join(", ");
}

export function ObjectivesPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [addStatement, setAddStatement] = useState("");
  const [addVerb, setAddVerb] = useState("");

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
            extractErrorMessage(payload, `Unable to ${successMessage.toLowerCase()}.`),
          );
        setEditing(null);
        setAddStatement("");
        setAddVerb("");
        setActionMessage(`Objective ${successMessage.toLowerCase()}.`);
        await refresh().catch(() => undefined);
      } catch (error) {
        setActionMessage(
          error instanceof Error ? error.message : "Unable to update objectives.",
        );
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
      const index = objectives.findIndex((objective) => objective.id === objectiveId);
      const swapWith = index + direction;
      if (index === -1 || swapWith < 0 || swapWith >= objectives.length) return;
      const objectiveIds = objectives.map((objective) => objective.id);
      [objectiveIds[index], objectiveIds[swapWith]] = [
        objectiveIds[swapWith]!,
        objectiveIds[index]!,
      ];
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

  if (view.kind === "ready") {
    const draft = view.value.set;
    const approved = view.value.approved;

    return (
      <section aria-labelledby="objectives-heading">
        <h2 id="objectives-heading">Learning objectives</h2>

        <p role="status">{objectiveGenerationStateLabel(view.value.state)}</p>

        {view.value.latestJob?.state === "failed" ? (
          <p role="alert">
            {objectiveFailureMessage(view.value.latestJob.errorCode)}
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
                ? "Generate objectives"
                : "Regenerate objectives"}
          </button>
        ) : null}

        {approved !== null && approved.id !== draft?.id ? (
          <p role="status">
            Approved objectives still guide the lesson until you approve this
            draft.
          </p>
        ) : null}

        {draft === null ? (
          <p role="status">
            Confirm the reviewed source and save the lesson configuration before
            generating objectives.
          </p>
        ) : (
          <ObjectiveEditor
            set={draft}
            approved={approved}
            editing={editing}
            onEditStart={setEditing}
            onEditChange={setEditing}
            onEditCancel={() => setEditing(null)}
            onAddStatement={setAddStatement}
            onAddVerb={setAddVerb}
            addStatement={addStatement}
            addVerb={addVerb}
            onAdd={addObjective}
            onUpdate={updateObjective}
            onRemove={removeObjective}
            onMove={moveObjective}
            onApprove={approve}
            canApprove={view.value.canApprove && !submitting}
            disabled={submitting}
          />
        )}
      </section>
    );
  }

  throw new Error("Unreachable objectives panel state.");
}

function ObjectiveEditor({
  set,
  approved,
  editing,
  onEditStart,
  onEditChange,
  onEditCancel,
  onAddStatement,
  onAddVerb,
  addStatement,
  addVerb,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
  onApprove,
  canApprove,
  disabled,
}: {
  set: LearningObjectiveSet;
  approved: LearningObjectiveSet | null;
  editing: EditingState | null;
  onEditStart: (state: EditingState) => void;
  onEditChange: (state: EditingState) => void;
  onEditCancel: () => void;
  onAddStatement: (value: string) => void;
  onAddVerb: (value: string) => void;
  addStatement: string;
  addVerb: string;
  onAdd: () => void;
  onUpdate: () => void;
  onRemove: (objectiveId: string) => void;
  onMove: (objectiveId: string, direction: -1 | 1) => void;
  onApprove: () => void;
  canApprove: boolean;
  disabled: boolean;
}) {
  const isApproved = set.status === "approved";
  return (
    <div>
      <p>
        {isApproved ? "Approved set" : "Draft set"} {set.id.slice(0, 8)} —
        prompt {set.promptId}@{set.promptVersion}, configuration v
        {set.configurationVersion}.
      </p>

      <ol aria-label="Objectives">
        {set.objectives.map((objective, index) => (
          <li key={objective.id}>
            {editing?.objectiveId === objective.id ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onUpdate();
                }}
              >
                <label>
                  Statement
                  <input
                    type="text"
                    value={editing.statement}
                    maxLength={500}
                    onChange={(event) =>
                      onEditChange({
                        ...editing,
                        statement: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Measurable verb
                  <input
                    type="text"
                    value={editing.verb}
                    maxLength={50}
                    onChange={(event) =>
                      onEditChange({ ...editing, verb: event.target.value })
                    }
                  />
                </label>
                <button type="submit" disabled={disabled}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={onEditCancel}
                  disabled={disabled}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <p>
                  {objective.order}. {objective.statement}
                </p>
                <p>
                  Measurable verb: {objective.verb}
                  {objective.generated
                    ? ""
                    : ". Teacher-added objective"}
                  {objective.groundingStatus === "unsupported" ? (
                    <span role="alert">
                      {" "}
                      ({objectiveGroundingLabel("unsupported")})
                    </span>
                  ) : (
                    ""
                  )}
                  {objective.confidence === undefined
                    ? ""
                    : `. Confidence: ${objective.confidence.toFixed(2)}`}
                </p>
                <p>
                  Source: {citationText(objective.sourceRefs)}.
                  {objective.revision > 0
                    ? ` Edited ${objective.revision} time${objective.revision === 1 ? "" : "s"}.`
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onEditStart({
                      objectiveId: objective.id,
                      statement: objective.statement,
                      verb: objective.verb,
                    })
                  }
                  disabled={disabled}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onMove(objective.id, -1)}
                  disabled={disabled || index === 0}
                >
                  Move up
                </button>
                <button
                  type="button"
                  onClick={() => onMove(objective.id, 1)}
                  disabled={disabled || index === set.objectives.length - 1}
                >
                  Move down
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(objective.id)}
                  disabled={disabled}
                >
                  Remove
                </button>
              </>
            )}
          </li>
        ))}
      </ol>

      {!isApproved ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <h3>Add an objective</h3>
          <label>
            Statement
            <input
              type="text"
              value={addStatement}
              maxLength={500}
              onChange={(event) => onAddStatement(event.target.value)}
            />
          </label>
          <label>
            Measurable verb
            <input
              type="text"
              value={addVerb}
              maxLength={50}
              onChange={(event) => onAddVerb(event.target.value)}
            />
          </label>
          <button type="submit" disabled={disabled}>
            Add objective
          </button>
          <p role="status">
            Teacher-added objectives without source references are marked as not
            supported.
          </p>
        </form>
      ) : null}

      {approved !== null ? (
        <section aria-label="Approved objectives">
          <h3>Approved objectives (used by outline generation)</h3>
          <ul>
            {approved.objectives.map((objective) => (
              <li key={objective.id}>
                {objective.order}. {objective.statement}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!isApproved ? (
        <button
          type="button"
          onClick={() => onApprove()}
          disabled={!canApprove}
        >
          Approve objectives
        </button>
      ) : (
        <p role="status">
          These objectives are approved. Editing them creates a new draft.
        </p>
      )}
    </div>
  );
}
