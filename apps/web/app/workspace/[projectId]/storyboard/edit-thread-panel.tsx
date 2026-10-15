"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  type EditThreadMessage,
  type EditThreadResponse,
  type EditThreadScope,
  type EditThreadScopeKind,
} from "@avlp/schemas";
import { CaretDown as CaretDownIcon } from "@phosphor-icons/react";
import { OnionSkinLoader } from "../../../../components/brand/onion-skin-loader";
import {
  actionableOperations,
  buildEditScope,
  editMessageStatusLabel,
  editOperationStateLabel,
  editOperationTitle,
  editPlanAnswer,
  editRequestSuggestions,
  editScopeLabel,
  editScopeTag,
  editThreadNeedsPolling,
  EditThreadRequestError,
  fetchEditThread,
  formatEditValue,
  isGeneratedOperation,
  mergeThreadMessages,
  newlyReadyOperations,
  postPlanAction,
  remainingScenesNote,
  sendEditRequest,
  type EditThreadSceneOption,
} from "./edit-thread-input";
import styles from "./storyboard.module.css";

type PlanNotice = Readonly<{
  planId: string;
  message: string;
  replan: boolean;
}>;

export type EditThreadPanelProps = Readonly<{
  projectId: string;
  revision: number | null;
  scenes: readonly EditThreadSceneOption[];
  selectedSceneId: string | null;
  disabled: boolean;
  /** Opens a scene so its existing before/after candidate review shows. */
  onSelectScene: (sceneId: string) => void;
  /** A regeneration was queued for this scene; the workspace polls for it. */
  onScenePending: (sceneId: string) => void;
  /** The storyboard changed; reload it and its derived views. */
  onStoryboardChanged: (message?: string) => void;
}>;

/**
 * ST-115: the "Ask for changes" panel. A teacher describes a change for the
 * selected scene, chosen scenes or the whole lesson; each request becomes a
 * proposed plan that changes nothing until it is applied. Generated changes
 * hand off to the existing before/after review, field edits show a diff, and
 * the last applied turn can be undone while nothing has changed since.
 */
export function EditThreadPanel({
  projectId,
  revision,
  scenes,
  selectedSceneId,
  disabled,
  onSelectScene,
  onScenePending,
  onStoryboardChanged,
}: EditThreadPanelProps) {
  const reduceMotion = useReducedMotion();
  const fieldId = useId();
  const hintId = useId();
  const [thread, setThread] = useState<EditThreadResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scopeKind, setScopeKind] = useState<EditThreadScopeKind>("scene");
  const [checked, setChecked] = useState<readonly string[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [notice, setNotice] = useState<PlanNotice | null>(null);
  const [selections, setSelections] = useState<
    Readonly<Record<string, readonly string[]>>
  >({});
  const threadRef = useRef<EditThreadResponse | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const [earlier, setEarlier] = useState<readonly EditThreadMessage[]>([]);
  const [earlierCursor, setEarlierCursor] = useState<number | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);

  const scope = buildEditScope(scopeKind, selectedSceneId, checked);

  const accept = useCallback(
    (next: EditThreadResponse) => {
      const ready = newlyReadyOperations(threadRef.current, next);
      threadRef.current = next;
      setThread(next);
      setLoadError(null);
      if (ready.length > 0) onStoryboardChanged();
    },
    [onStoryboardChanged],
  );

  const load = useCallback(async () => {
    try {
      accept(await fetchEditThread(projectId));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "The change requests could not be loaded.",
      );
    }
  }, [accept, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadEarlier = useCallback(
    async (before: number) => {
      setLoadingEarlier(true);
      try {
        const page = await fetchEditThread(projectId, before);
        setEarlier((current) => mergeThreadMessages(page.messages, current));
        setEarlierCursor(page.earlierCursor);
      } catch (error) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Earlier change requests could not be loaded.",
        );
      } finally {
        setLoadingEarlier(false);
      }
    },
    [projectId],
  );

  const polling = editThreadNeedsPolling(thread);
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void load(), 2_500);
    return () => window.clearInterval(timer);
  }, [polling, load]);

  const submit = useCallback(
    async (requestText: string, requestScope: EditThreadScope | null) => {
      const trimmed = requestText.trim();
      if (trimmed.length === 0 || requestScope === null || revision === null)
        return;
      setSending(true);
      setSendError(null);
      try {
        accept(
          await sendEditRequest({
            projectId,
            text: trimmed,
            scope: requestScope,
            expectedRevision: revision,
            idempotencyKey: globalThis.crypto.randomUUID(),
          }),
        );
        setText("");
        fieldRef.current?.focus();
      } catch (error) {
        // Keep the typed request so the teacher can resend it (design.md §8.4).
        setSendError(
          error instanceof Error ? error.message : "Your request could not be sent.",
        );
        if (error instanceof EditThreadRequestError && error.status === 409)
          onStoryboardChanged();
      } finally {
        setSending(false);
      }
    },
    [accept, onStoryboardChanged, projectId, revision],
  );

  const act = useCallback(
    async (
      message: EditThreadMessage,
      action: "apply" | "dismiss" | "undo",
      operationIds?: readonly string[],
    ) => {
      if (revision === null && action !== "dismiss") return;
      setBusyPlanId(message.id);
      setNotice(null);
      try {
        const next = await postPlanAction({
          projectId,
          planId: message.id,
          action,
          body:
            action === "dismiss"
              ? {}
              : {
                  expectedRevision: revision,
                  ...(operationIds === undefined
                    ? {}
                    : { operationIds: [...operationIds] }),
                },
        });
        accept(next);
        if (action === "dismiss") return;
        if (action === "undo") {
          onStoryboardChanged("Undid the last change from your requests.");
          return;
        }
        const applied = next.messages.find((entry) => entry.id === message.id);
        const generated = (applied?.plan?.operations ?? []).filter(
          (entry) =>
            isGeneratedOperation(entry) &&
            applied?.operations.some(
              (state) =>
                state.operationId === entry.id && state.state === "queued",
            ),
        );
        const sceneIds = generated.flatMap(({ operation }) =>
          operation.type === "regenerate-scene" ? [operation.sceneId] : [],
        );
        for (const sceneId of sceneIds) onScenePending(sceneId);
        if (sceneIds[0] !== undefined) onSelectScene(sceneIds[0]);
        onStoryboardChanged(
          generated.length > 0
            ? "Generating new versions for you to compare. Each opens in the scene review when ready."
            : "Applied the changes from your request.",
        );
      } catch (error) {
        setNotice({
          planId: message.id,
          message:
            error instanceof Error ? error.message : "That did not work.",
          replan: error instanceof EditThreadRequestError && error.replan,
        });
        if (error instanceof EditThreadRequestError && error.status === 409)
          onStoryboardChanged();
        void load();
      } finally {
        setBusyPlanId(null);
      }
    },
    [
      accept,
      load,
      onScenePending,
      onSelectScene,
      onStoryboardChanged,
      projectId,
      revision,
    ],
  );

  const messages = mergeThreadMessages(earlier, thread?.messages ?? []);
  // Before any earlier page is opened, the latest page says whether more exist.
  const olderCursor =
    earlier.length === 0 ? (thread?.earlierCursor ?? null) : earlierCursor;
  const requests = new Map(
    messages
      .filter((message) => message.role === "teacher")
      .map((message) => [message.id, message]),
  );
  const remaining = thread?.turnLimit.remaining ?? null;
  const canSend =
    !disabled &&
    !sending &&
    scope !== null &&
    revision !== null &&
    text.trim().length > 0 &&
    remaining !== 0;

  return (
    <details className={styles.lessonStyle} open>
      <summary>
        <span>
          <strong>Ask for changes</strong>
          <small>Describe a change; review the plan before anything changes</small>
        </span>
        <CaretDownIcon size={16} aria-hidden />
      </summary>
      <section aria-label="Ask for changes" className={styles.editThread}>
        {loadError !== null ? (
          <div role="alert" className={`${styles.alert} ${styles.alertError}`}>
            {loadError}{" "}
            <button
              type="button"
              onClick={() => void load()}
              className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
            >
              Try again
            </button>
          </div>
        ) : null}

        {olderCursor !== null ? (
          <button
            type="button"
            disabled={loadingEarlier}
            onClick={() => void loadEarlier(olderCursor)}
            className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
          >
            {loadingEarlier ? "Loading earlier requests…" : "Show earlier requests"}
          </button>
        ) : null}
        <ol aria-live="polite" aria-label="Change requests" className={styles.editThreadList}>
          {messages.length === 0 ? (
            <li className={styles.noteMuted}>
              Ask for a change in plain language, for example “make scene 3
              simpler”. You review every plan before it changes your storyboard.
            </li>
          ) : null}
          {messages.map((message) =>
            message.role === "teacher" ? (
              <motion.li
                key={message.id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={styles.editRequest}
              >
                <span className={styles.editScopeTag}>
                  {editScopeTag(message.scope, scenes)}
                </span>
                <p>{message.text}</p>
              </motion.li>
            ) : (
              <motion.li
                key={message.id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={styles.editPlan}
                data-status={message.status}
                aria-label={`Plan: ${editMessageStatusLabel(message.status)}`}
              >
                <EditPlanCard
                  message={message}
                  request={
                    message.replyToId === null
                      ? undefined
                      : requests.get(message.replyToId)
                  }
                  busy={busyPlanId === message.id}
                  disabled={disabled || busyPlanId !== null}
                  notice={notice?.planId === message.id ? notice : null}
                  selection={selections[message.id]}
                  onSelectionChange={(ids) =>
                    setSelections((current) => ({ ...current, [message.id]: ids }))
                  }
                  onApply={(ids) => void act(message, "apply", ids)}
                  onDismiss={() => void act(message, "dismiss")}
                  onUndo={() => void act(message, "undo")}
                  onRetry={(request) => {
                    setNotice(null);
                    void submit(request.text ?? "", request.scope);
                  }}
                  onReview={onSelectScene}
                  narrationHref={`/workspace/${encodeURIComponent(projectId)}/narration`}
                />
              </motion.li>
            ),
          )}
        </ol>

        <form
          className={styles.editComposer}
          onSubmit={(event) => {
            event.preventDefault();
            if (canSend) void submit(text, scope);
          }}
        >
          <fieldset className={styles.editScope}>
            <legend>Scope</legend>
            {(
              [
                ["scene", "This scene"],
                ["selected", "Selected scenes"],
                ["lesson", "Whole lesson"],
              ] as const
            ).map(([kind, label]) => (
              <label key={kind}>
                <input
                  type="radio"
                  name={`${fieldId}-scope`}
                  value={kind}
                  checked={scopeKind === kind}
                  onChange={() => setScopeKind(kind)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {scopeKind === "selected" ? (
            <fieldset className={styles.editSceneChoices}>
              <legend>Scenes (up to 8)</legend>
              {scenes.map((scene) => {
                const isChecked = checked.includes(scene.sceneId);
                return (
                  <label key={scene.sceneId}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!isChecked && checked.length >= 8}
                      onChange={() =>
                        setChecked((current) =>
                          isChecked
                            ? current.filter((id) => id !== scene.sceneId)
                            : [...current, scene.sceneId],
                        )
                      }
                    />
                    Scene {scene.order}
                    {scene.title === null ? "" : ` · ${scene.title}`}
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <label htmlFor={fieldId} className={styles.editFieldLabel}>
            {editScopeLabel(scope, scenes)}
          </label>
          <textarea
            ref={fieldRef}
            id={fieldId}
            aria-describedby={hintId}
            aria-busy={sending}
            value={text}
            rows={3}
            maxLength={1_000}
            // Read-only, not disabled, while sending: a disabled field drops
            // keyboard focus to the page.
            readOnly={sending}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                canSend
              ) {
                event.preventDefault();
                void submit(text, scope);
              }
            }}
            className={styles.editTextarea}
          />
          <div className={styles.editSuggestions} aria-label="Suggested requests">
            {editRequestSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={disabled || sending}
                onClick={() => setText(suggestion)}
                className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p id={hintId} className={styles.noteMuted}>
            Each request uses one AI planning call
            {thread === null
              ? "."
              : ` (${thread.turnLimit.remaining} of ${thread.turnLimit.limit} left this hour).`}{" "}
            Press Ctrl+Enter to send.
          </p>
          {sendError !== null ? (
            <p role="alert" className={`${styles.alert} ${styles.alertError}`}>
              {sendError}
            </p>
          ) : null}
          <div className={styles.editActions}>
            <button
              type="submit"
              disabled={!canSend}
              className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonCompact}`}
            >
              {sending ? "Sending…" : "Ask for changes"}
            </button>
          </div>
        </form>
      </section>
    </details>
  );
}

/** One assistant reply: its plan, progress and the actions it allows. */
export function EditPlanCard({
  message,
  request,
  busy,
  disabled,
  notice,
  selection,
  onSelectionChange,
  onApply,
  onDismiss,
  onUndo,
  onRetry,
  onReview,
  narrationHref,
}: Readonly<{
  message: EditThreadMessage;
  request: EditThreadMessage | undefined;
  busy: boolean;
  disabled: boolean;
  notice: PlanNotice | null;
  selection: readonly string[] | undefined;
  onSelectionChange: (ids: readonly string[]) => void;
  onApply: (ids?: readonly string[]) => void;
  onDismiss: () => void;
  onUndo: () => void;
  onRetry: (request: EditThreadMessage) => void;
  onReview: (sceneId: string) => void;
  /** Narration candidates are reviewed in the narration workspace (ST-049). */
  narrationHref?: string;
}>) {
  const operations = actionableOperations(message);
  const chosen = selection ?? operations.map(({ id }) => id);
  const proposed = message.status === "proposed";
  const answer = editPlanAnswer(message);
  const note = remainingScenesNote(message);
  const progress = new Map(
    message.operations.map((state) => [state.operationId, state]),
  );

  if (message.status === "planning")
    return (
      <div role="status" className={styles.editPlanning}>
        <OnionSkinLoader size={28} />
        <span>{editMessageStatusLabel(message.status)}</span>
      </div>
    );

  if (message.status === "failed")
    return (
      <div className={styles.editPlanBody}>
        <p role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {message.failure?.message ?? editMessageStatusLabel("failed")}
        </p>
        {request !== undefined ? (
          <div className={styles.editActions}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRetry(request)}
              className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    );

  return (
    <div className={styles.editPlanBody}>
      <p className={styles.editPlanStatus}>
        <strong>{editMessageStatusLabel(message.status)}</strong>
      </p>
      {message.plan !== null ? (
        <p className={styles.editPlanSummary}>
          {answer ?? message.plan.summary}
        </p>
      ) : null}
      {note !== null ? <p className={styles.noteMuted}>{note}</p> : null}
      {operations.length > 0 ? (
        <ul className={styles.editOperations}>
          {operations.map((entry) => {
            const state = progress.get(entry.id);
            const stateLabel = editOperationStateLabel(state);
            const sceneId =
              entry.operation.type === "regenerate-scene"
                ? entry.operation.sceneId
                : null;
            const checkboxId = `${message.id}-${entry.id}`;
            return (
              <li key={entry.id} className={styles.editOperation}>
                <div className={styles.editOperationHead}>
                  {proposed && operations.length > 1 ? (
                    <>
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={chosen.includes(entry.id)}
                        disabled={disabled}
                        onChange={() =>
                          onSelectionChange(
                            chosen.includes(entry.id)
                              ? chosen.filter((id) => id !== entry.id)
                              : [...chosen, entry.id],
                          )
                        }
                      />
                      <label htmlFor={checkboxId}>
                        <strong>{editOperationTitle(entry)}</strong>
                      </label>
                    </>
                  ) : (
                    <strong>{editOperationTitle(entry)}</strong>
                  )}
                  {stateLabel !== null ? (
                    <span
                      className={styles.editOperationState}
                      data-state={state?.state}
                    >
                      {stateLabel}
                    </span>
                  ) : null}
                </div>
                {"rationale" in entry.operation ? (
                  <p className={styles.noteMuted}>{entry.operation.rationale}</p>
                ) : null}
                {entry.operation.type === "edit-scene-field" ? (
                  <p className={styles.editDiff}>
                    <del aria-label="Before">
                      {formatEditValue(entry.display.before)}
                    </del>
                    <span aria-hidden> → </span>
                    <ins aria-label="After">
                      {formatEditValue(entry.operation.value)}
                    </ins>
                  </p>
                ) : null}
                {state?.state === "ready" && sceneId !== null ? (
                  <button
                    type="button"
                    onClick={() => onReview(sceneId)}
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
                  >
                    Review scene {entry.display.sceneOrder ?? ""}
                  </button>
                ) : null}
                {state?.state === "ready" &&
                entry.operation.type === "regenerate-narration-block" &&
                narrationHref !== undefined ? (
                  <a
                    href={narrationHref}
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
                  >
                    Review in Narration
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {notice !== null ? (
        <div role="alert" className={`${styles.alert} ${styles.alertWarning}`}>
          {notice.message}
          {notice.replan && request !== undefined ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRetry(request)}
              className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
            >
              Re-plan
            </button>
          ) : null}
        </div>
      ) : null}
      {proposed ? (
        <div className={styles.editActions}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onApply()}
            className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonCompact}`}
          >
            {busy ? "Applying…" : "Apply all"}
          </button>
          {operations.length > 1 ? (
            <button
              type="button"
              disabled={disabled || chosen.length === 0}
              onClick={() => onApply(chosen)}
              className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
            >
              Apply selected ({chosen.length})
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={onDismiss}
            className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {message.canUndo ? (
        <div className={styles.editActions}>
          <button
            type="button"
            disabled={disabled}
            onClick={onUndo}
            className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
          >
            {busy ? "Undoing…" : "Undo this change"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
