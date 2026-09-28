"use client";

/**
 * ST-106 — the prompt-to-video run page: request → progress → (needs
 * attention | not covered) → preview approval → delivery, all on ST-105's API.
 * ST-107 inserts the video brief between the request and the run, adds the
 * budget-cap stop, and shows "How this video was made" on the preview and
 * delivery views.
 *
 * - The server is the source of truth. Every view is derived from the latest
 *   `GET one-shot`, so a reload lands on the right step and polling resumes.
 * - Paid work starts only from Prepare brief (one small call), Confirm &
 *   create video, Accept the new estimate and Render video. Each is guarded
 *   against double submission; Prepare brief and Confirm also send an
 *   idempotency key that stays the same until the request changes.
 * - The focus prompt only ever travels in a request body.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle } from "@phosphor-icons/react";
import type { CreativeDesignPackId, SoundBedChoice } from "@avlp/schemas";
import type {
  OneShotBriefResponse,
  OneShotResponse,
  OneShotRunView,
} from "@avlp/schemas/one-shot";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { Notice } from "../../../../components/ui/notice";
import { StatusLabel } from "../../../../components/ui/status-label";
import {
  OneShotRequestError,
  acceptBudget,
  audienceFor,
  audienceKindFrom,
  confirmBrief,
  currentDisplayStep,
  decisionLogExport,
  fetchBrief,
  fetchDecisions,
  fetchOneShot,
  fetchSoundBedTitles,
  isOurSideStop,
  isPollingStatus,
  newIdempotencyKey,
  nextPollDelay,
  pollInitialMs,
  postRunAction,
  prepareBrief,
  requestSignature,
  runFingerprint,
  soundBedOptions,
  toDisplaySteps,
  validateRequestForm,
  viewForRun,
  type RequestFormErrors,
  type RequestFormValues,
  type RunView,
} from "../../../../lib/one-shot";
import { SourceUploadForm } from "../upload/source-upload-form";
import { OneShotDelivery } from "./one-shot-delivery";
import { OneShotPreview } from "./one-shot-preview";
import {
  ApprovalActions,
  AttentionCard,
  BriefCard,
  BudgetCapCard,
  CoverageGapNotice,
  CoverageNotice,
  DecisionPanel,
  NotCoveredCard,
  OneShotUnavailable,
  RequestFields,
  RunMeta,
  RunProgressCard,
  type DecisionsState,
} from "./one-shot-views";
import styles from "./one-shot.module.css";

type RunAction = "render" | "resume" | "cancel";

export function announcementFor(
  view: RunView,
  run: OneShotRunView | null,
): string {
  switch (view) {
    case "request":
      return "";
    case "brief":
      return run?.status === "brief_ready"
        ? "Your video brief is ready to review."
        : "Preparing your video brief.";
    case "budget":
      return "Your video reached its budget and is waiting for a new estimate.";
    case "progress": {
      const step =
        run === null ? null : currentDisplayStep(toDisplaySteps(run));
      return step === null
        ? "Your video is queued."
        : `Building your video: ${step.label} in progress.`;
    }
    case "attention":
      return "Your video needs attention before it can continue.";
    case "not_covered":
      return "Your document does not cover this request.";
    case "approval":
      return "Your preview is ready. Review it, then render the video.";
    case "delivery":
      return run?.status === "completed"
        ? "Your video is ready to download."
        : run?.status === "rendering"
          ? "Rendering your video."
          : "The render did not finish.";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof OneShotRequestError ? error.message : fallback;
}

export function OneShotWorkspace({
  projectId,
  projectTitle,
  initial,
  documentReady: initialDocumentReady,
}: Readonly<{
  projectId: string;
  projectTitle: string;
  initial: OneShotResponse;
  documentReady: boolean;
}>) {
  const [state, setState] = useState<OneShotResponse>(initial);
  // Held here, not in the form, so an upload made on this page survives the
  // form remounting (for example after Edit prompt). A run can only start
  // with a document, so any earlier run also proves there is one.
  const [uploaded, setUploaded] = useState(initialDocumentReady);
  const [busy, setBusy] = useState<RunAction | "budget" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const inFlight = useRef(false);
  const run = state.run;
  const view = viewForRun(run);

  // ---- Polling with backoff while the server is doing the work. ----------
  const fingerprint = runFingerprint(run);
  const polling = run !== null && isPollingStatus(run.status);
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = pollInitialMs;
    let last = fingerprint;
    const tick = async () => {
      try {
        const next = await fetchOneShot(projectId);
        if (cancelled) return;
        const changed = runFingerprint(next.run) !== last;
        last = runFingerprint(next.run);
        delay = nextPollDelay(delay, changed);
        if (changed) setState(next);
      } catch {
        delay = nextPollDelay(delay, false);
      }
      if (!cancelled) timer = window.setTimeout(() => void tick(), delay);
    };
    timer = window.setTimeout(() => void tick(), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Restart only when polling starts or stops, or the run changes; the loop
    // tracks step changes itself, so `fingerprint` is only its starting point.
  }, [polling, projectId, run?.id]);

  const refresh = useCallback(async () => {
    try {
      setState(await fetchOneShot(projectId));
    } catch {
      // Keep the last known state.
    }
  }, [projectId]);

  // ---- Run actions: one in flight at a time. -----------------------------
  const act = useCallback(
    async (action: RunAction) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(action);
      setActionError(null);
      try {
        setState(await postRunAction(projectId, action));
      } catch (error) {
        setActionError(
          errorMessage(
            error,
            "The request could not be sent. Check your connection and try again.",
          ),
        );
        // The run may have moved on (for example a second tab rendered it).
        await refresh();
      } finally {
        inFlight.current = false;
        setBusy(null);
        setConfirmCancel(false);
      }
    },
    [projectId, refresh],
  );

  const acceptNewBudget = useCallback(async () => {
    const budget = run?.budget;
    if (inFlight.current || budget?.proposedEstimateUsd == null) return;
    inFlight.current = true;
    setBusy("budget");
    setActionError(null);
    try {
      setState(
        await acceptBudget(projectId, {
          reservationRevision: budget.reservationRevision,
          acceptedEstimateUsd: budget.proposedEstimateUsd,
        }),
      );
    } catch (error) {
      setActionError(
        errorMessage(error, "The new estimate could not be accepted. Try again."),
      );
      await refresh();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, [projectId, refresh, run?.budget]);

  if (!state.eligibility.visible)
    return <OneShotUnavailable projectId={projectId} />;

  const announcement = announcementFor(view, run);
  const blockedReason = state.eligibility.canStart
    ? null
    : (state.eligibility.reasons[0]?.message ??
      "New prompt-to-video runs are paused.");
  const cancelDialog = (
    <Dialog
      isOpen={confirmCancel}
      onClose={() => (busy === null ? setConfirmCancel(false) : undefined)}
      title="Cancel this video?"
      description={
        run?.status === "rendering"
          ? "The run stops tracking the render. A render that has already started still finishes and appears in the lesson's render history."
          : run?.status === "brief_ready" || run?.status === "brief_pending"
            ? "The brief is discarded. You can describe a new video afterwards; the brief call already made is not refunded."
            : "The run stops at its current step. Work already done stays in the lesson editor, and costs already incurred are not refunded."
      }
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setConfirmCancel(false)}
            disabled={busy !== null}
          >
            Keep building
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void act("cancel")}
            disabled={busy !== null}
            data-testid="one-shot-cancel-confirm"
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel video"}
          </Button>
        </>
      }
    />
  );

  return (
    <div className={styles.page} data-testid="one-shot-page" data-view={view}>
      <p
        className={styles.srOnly}
        role="status"
        aria-live="polite"
        data-testid="one-shot-live"
      >
        {announcement}
      </p>

      {view !== "delivery" && (
        <header className={styles.header}>
          <h1 className={styles.title}>Quick video from a PDF</h1>
          <p className={styles.lead}>
            Upload a document, say what to explain, review the brief, and
            preview the video before anything is rendered.
          </p>
        </header>
      )}

      {actionError !== null && (
        <Notice
          type="error"
          title="That did not work"
          message={actionError}
          onClose={() => setActionError(null)}
        />
      )}

      {(view === "request" || view === "brief") && (
        <BriefStage
          key={run?.status === "cancelled" ? "new" : (run?.id ?? "new")}
          projectId={projectId}
          run={view === "brief" ? run : null}
          previous={run}
          documentReady={uploaded || run !== null}
          onDocumentReady={() => setUploaded(true)}
          blockedReason={blockedReason}
          onRunChanged={setState}
          onCancel={() => setConfirmCancel(true)}
          refresh={refresh}
        />
      )}

      {view === "progress" && run !== null && (
        <div className={styles.column}>
          <RunProgressCard
            run={run}
            busy={busy !== null}
            onCancel={() => setConfirmCancel(true)}
          />
        </div>
      )}

      {view === "budget" && run !== null && (
        <div className={styles.column}>
          <BudgetCapCard
            run={run}
            busy={busy !== null}
            onAccept={() => void acceptNewBudget()}
            onCancel={() => setConfirmCancel(true)}
          />
        </div>
      )}

      {view === "attention" && run !== null && (
        <div className={styles.column}>
          <AttentionCard
            run={run}
            projectId={projectId}
            busy={busy !== null}
            onResume={() => void act("resume")}
            onCancel={() => setConfirmCancel(true)}
          />
        </div>
      )}

      {view === "not_covered" && run !== null && (
        <div className={styles.column}>
          <NotCoveredCard
            run={run}
            busy={busy !== null}
            onEditPrompt={() => void act("cancel")}
          />
        </div>
      )}

      {view === "approval" && run !== null && (
        <div className={styles.wide} data-testid="one-shot-approval">
          <section
            aria-labelledby="one-shot-approval-heading"
            className={styles.card}
          >
            <div>
              <h2 id="one-shot-approval-heading" className={styles.cardTitle}>
                Preview your video
              </h2>
              <p className={styles.cardLead}>
                Everything passed the checks. Watch the preview, then render the
                final video or refine it in the editor first.
              </p>
            </div>
            <OneShotPreview projectId={projectId} />
            <RunMeta run={run} />
            <ApprovalActions
              projectId={projectId}
              busy={busy !== null}
              onRender={() => void act("render")}
              onCancel={() => setConfirmCancel(true)}
            />
          </section>
          <CoverageGapNotice gaps={run.coverageGaps} />
          <CoverageNotice coverage={run.focusCoverage} />
          <Decisions projectId={projectId} runKey={`${run.id}:${run.updatedAt}`} />
        </div>
      )}

      {view === "delivery" && run !== null && (
        <div className={styles.wide}>
          <section
            aria-label="Prompt-to-video run"
            className={styles.card}
            data-testid="one-shot-delivery"
            data-status={run.status}
          >
            <div className={styles.actions}>
              <StatusLabel
                status={
                  run.status === "completed"
                    ? "success"
                    : run.status === "rendering"
                      ? "in_progress"
                      : "error"
                }
                label={
                  run.status === "completed"
                    ? "Video ready"
                    : run.status === "rendering"
                      ? "Rendering"
                      : run.needsAttention?.errorCode === "RENDER_REVIEW_FAILED"
                        ? "The video failed its quality review"
                        : "Render did not finish"
                }
              />
              {run.status === "rendering" && (
                <Button
                  type="button"
                  variant="destructive"
                  size="compact"
                  className={styles.destructiveLink}
                  disabled={busy !== null}
                  onClick={() => setConfirmCancel(true)}
                  data-testid="one-shot-cancel"
                >
                  Cancel video
                </Button>
              )}
            </div>
            <RunMeta run={run} />
            {(run.needsAttention?.errorCode === "RENDER_FAILED" ||
              run.needsAttention?.errorCode === "RENDER_REVIEW_FAILED") && (
              <>
                <Notice
                  type="error"
                  message={run.needsAttention.message}
                  data-testid="one-shot-render-problem"
                />
                <div className={styles.actions}>
                  {run.needsAttention.errorCode === "RENDER_REVIEW_FAILED" && (
                    <Link
                      className={styles.link}
                      href={`/workspace/${encodeURIComponent(projectId)}/storyboard`}
                      data-testid="one-shot-review-fix-link"
                    >
                      Fix it in the editor
                    </Link>
                  )}
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy !== null}
                    onClick={() => void act("resume")}
                    data-testid="one-shot-resume"
                  >
                    {busy === "resume"
                      ? "Resuming…"
                      : run.needsAttention.errorCode === "RENDER_REVIEW_FAILED"
                        ? "Retry render"
                        : isOurSideStop(run.needsAttention.errorCode)
                          ? "Try again"
                          : "Resume"}
                  </Button>
                  <p className={styles.helper}>
                    {run.needsAttention.errorCode === "RENDER_REVIEW_FAILED"
                      ? "The same lesson always renders to the same video, so fix the findings in the editor first. Retrying then checks the lesson again and brings you back to approve a new render."
                      : "This checks the lesson again and brings you back to approve a new render."}
                  </p>
                </div>
              </>
            )}
          </section>
          <CoverageGapNotice gaps={run.coverageGaps} />
          <CoverageNotice coverage={run.focusCoverage} />
          <OneShotDelivery
            key={`${run.renderJobId ?? "none"}:${run.status}`}
            projectId={projectId}
            projectTitle={projectTitle}
            lessonVersionId={run.lessonVersionId}
          />
          <Decisions projectId={projectId} runKey={`${run.id}:${run.updatedAt}`} />
        </div>
      )}

      {cancelDialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision log
// ---------------------------------------------------------------------------

function Decisions({
  projectId,
  runKey,
}: Readonly<{ projectId: string; runKey: string }>) {
  const [state, setState] = useState<DecisionsState>({ kind: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetchDecisions(projectId)
      .then((log) => {
        if (!cancelled) setState({ kind: "ready", log });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({
            kind: "error",
            message: errorMessage(error, "The decision log could not be loaded."),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, runKey]);
  const exportLog = () => {
    if (state.kind !== "ready") return;
    const blob = new Blob(
      [decisionLogExport(state.log, new Date().toISOString())],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "how-this-video-was-made.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <DecisionPanel state={state} onExport={exportLog} />;
}

// ---------------------------------------------------------------------------
// Request and brief
// ---------------------------------------------------------------------------

function initialValues(previous: OneShotRunView | null): RequestFormValues {
  if (previous === null)
    return {
      focusPrompt: "",
      audienceKind: null,
      studentAgeBand: "11-13",
      targetDurationSeconds: 300,
    };
  const audience = audienceKindFrom(previous.audience);
  return {
    focusPrompt: previous.focusPrompt,
    audienceKind: audience.kind,
    studentAgeBand: audience.studentAgeBand,
    targetDurationSeconds: previous.targetDurationSeconds,
  };
}

type BriefState =
  | { kind: "none" }
  | { kind: "loading" }
  | { kind: "ready"; response: OneShotBriefResponse }
  | { kind: "error"; message: string };

/**
 * The request form and the brief it produces. A run in `brief_pending` or
 * `brief_ready` shows its latest brief; "Edit request" returns to the form,
 * prefilled, until the per-video brief limit is used up.
 */
function BriefStage({
  projectId,
  run,
  previous,
  documentReady,
  onDocumentReady,
  blockedReason,
  onRunChanged,
  onCancel,
  refresh,
}: Readonly<{
  projectId: string;
  /** The run in a brief status, or `null` for a new request. */
  run: OneShotRunView | null;
  /** The latest run of any status, to prefill the form. */
  previous: OneShotRunView | null;
  documentReady: boolean;
  onDocumentReady: () => void;
  blockedReason: string | null;
  onRunChanged: (response: OneShotResponse) => void;
  onCancel: () => void;
  refresh: () => Promise<void>;
}>) {
  const [brief, setBrief] = useState<BriefState>(
    run === null ? { kind: "none" } : { kind: "loading" },
  );
  const [editing, setEditing] = useState(false);
  const [stylePackId, setStylePackId] = useState<CreativeDesignPackId | null>(
    null,
  );
  const [soundBed, setSoundBed] = useState<SoundBedChoice | null>(null);
  const [tracks, setTracks] = useState<{ trackId: string; title: string }[]>(
    [],
  );
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmInFlight = useRef(false);
  const confirmKey = useRef<{ signature: string; key: string } | null>(null);

  // Load the brief of a run that has one (a reload lands here too).
  useEffect(() => {
    if (run === null) return;
    let cancelled = false;
    fetchBrief(projectId)
      .then((response) => {
        if (!cancelled) setBrief({ kind: "ready", response });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setBrief({
            kind: "error",
            message: errorMessage(error, "The brief could not be loaded."),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, run?.id]);

  useEffect(() => {
    let cancelled = false;
    fetchSoundBedTitles()
      .then((list) => {
        if (!cancelled) setTracks(list);
      })
      .catch(() => {
        // The brief's own choice and "none" are still offered.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current =
    brief.kind === "ready" && brief.response.brief !== null
      ? brief.response.brief
      : null;
  // A new brief resets the choices to its suggestions.
  useEffect(() => {
    if (current === null) return;
    setStylePackId(current.stylePackId);
    setSoundBed(current.soundBed);
  }, [current?.revision]);

  const revisions =
    brief.kind === "ready"
      ? { used: brief.response.revisionsUsed, max: brief.response.maxRevisions }
      : null;

  const onBrief = async (response: OneShotBriefResponse) => {
    setBrief({ kind: "ready", response });
    setEditing(false);
    setConfirmError(null);
    await refresh();
  };

  if (current === null || editing) {
    return (
      <>
        {brief.kind === "loading" && (
          <p className={styles.helper} role="status">
            Loading your brief…
          </p>
        )}
        {brief.kind === "error" && (
          <Notice type="error" title="The brief could not be loaded" message={brief.message} />
        )}
        <RequestForm
          projectId={projectId}
          previous={current !== null ? null : previous}
          fromBrief={
            current === null
              ? null
              : {
                  focusPrompt: current.focusPrompt,
                  audience: current.audience,
                  targetDurationSeconds: current.targetDurationSeconds,
                }
          }
          documentReady={documentReady}
          onDocumentReady={onDocumentReady}
          blockedReason={blockedReason}
          revisions={revisions}
          onBackToBrief={current === null ? undefined : () => setEditing(false)}
          onBrief={(response) => void onBrief(response)}
        />
      </>
    );
  }

  const chosenStyle = stylePackId ?? current.stylePackId;
  const chosenSound = soundBed ?? current.soundBed;
  const confirm = async () => {
    if (confirmInFlight.current || blockedReason !== null) return;
    confirmInFlight.current = true;
    setConfirming(true);
    setConfirmError(null);
    const signature = JSON.stringify([current.revision, chosenStyle, chosenSound]);
    if (confirmKey.current?.signature !== signature)
      confirmKey.current = { signature, key: newIdempotencyKey() };
    try {
      onRunChanged(
        await confirmBrief(
          projectId,
          {
            briefRevision: current.revision,
            acceptedEstimateUsd: current.estimate.totalUsd,
            stylePackId: chosenStyle,
            soundBed: chosenSound,
          },
          confirmKey.current.key,
        ),
      );
    } catch (error) {
      setConfirmError(
        errorMessage(
          error,
          "The request could not be sent. Check your connection and try again.",
        ),
      );
      // A newer brief or a started run replaces what is on screen.
      try {
        setBrief({ kind: "ready", response: await fetchBrief(projectId) });
      } catch {
        // Keep the brief on screen.
      }
      await refresh();
    } finally {
      confirmInFlight.current = false;
      setConfirming(false);
    }
  };

  return (
    <div className={styles.column}>
      <BriefCard
        brief={current}
        revisions={revisions ?? { used: 1, max: 1 }}
        stylePackIds={brief.kind === "ready" ? brief.response.stylePackIds : [current.stylePackId]}
        stylePackId={chosenStyle}
        soundBed={chosenSound}
        soundBedOptions={soundBedOptions(tracks, current.soundBed)}
        onStylePackChange={setStylePackId}
        onSoundBedChange={setSoundBed}
        onEdit={() => setEditing(true)}
        onConfirm={() => void confirm()}
        onCancel={onCancel}
        confirming={confirming}
        confirmError={confirmError}
        blockedReason={blockedReason}
      />
    </div>
  );
}

function RequestForm({
  projectId,
  previous,
  fromBrief,
  documentReady,
  onDocumentReady,
  blockedReason,
  revisions,
  onBackToBrief,
  onBrief,
}: Readonly<{
  projectId: string;
  previous: OneShotRunView | null;
  fromBrief: Pick<
    OneShotRunView,
    "focusPrompt" | "audience" | "targetDurationSeconds"
  > | null;
  documentReady: boolean;
  onDocumentReady: () => void;
  blockedReason: string | null;
  revisions: { used: number; max: number } | null;
  onBackToBrief: (() => void) | undefined;
  onBrief: (response: OneShotBriefResponse) => void;
}>) {
  const [values, setValues] = useState<RequestFormValues>(() =>
    fromBrief === null
      ? initialValues(previous)
      : initialValues({ ...(previous ?? ({} as OneShotRunView)), ...fromBrief }),
  );
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const idempotency = useRef<{ signature: string; key: string } | null>(null);

  const errors: RequestFormErrors = validateRequestForm(values, {
    documentReady,
  });
  const visibleErrors: RequestFormErrors = showErrors ? errors : {};

  const submit = async () => {
    if (inFlight.current || blockedReason !== null) return;
    setShowErrors(true);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 || values.audienceKind === null) {
      // Move focus to the first field that needs a change.
      if (errors.focusPrompt !== undefined)
        document.getElementById("one-shot-focus")?.focus();
      else if (errors.audience !== undefined)
        document
          .querySelector<HTMLInputElement>('input[name="audienceKind"]')
          ?.focus();
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    const signature = requestSignature(values);
    if (idempotency.current?.signature !== signature)
      idempotency.current = { signature, key: newIdempotencyKey() };
    try {
      onBrief(
        await prepareBrief(
          projectId,
          {
            focusPrompt: values.focusPrompt.trim(),
            audience: audienceFor(values.audienceKind, values.studentAgeBand),
            targetDurationSeconds: values.targetDurationSeconds,
          },
          idempotency.current.key,
        ),
      );
    } catch (error) {
      setSubmitError(
        errorMessage(
          error,
          "The request could not be sent. Check your connection and try again.",
        ),
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const documentSlot = documentReady ? (
    <section
      aria-label="Source document"
      className={styles.card}
      data-testid="one-shot-document-ready"
    >
      <div className={styles.actions}>
        <CheckCircle
          size={22}
          weight="fill"
          color="var(--color-success-fg)"
          aria-hidden="true"
        />
        <span className={styles.label}>Your document is uploaded</span>
        <StatusLabel status="success" label="Ready" size="compact" />
      </div>
      <p className={styles.helper}>
        The video is built from this document. The brief is prepared once it
        has been read, which usually takes under a minute.
      </p>
    </section>
  ) : (
    <SourceUploadForm projectId={projectId} onUploadSuccess={onDocumentReady} />
  );

  return (
    <RequestFields
      values={values}
      errors={visibleErrors}
      revisions={revisions}
      onBackToBrief={onBackToBrief}
      documentSlot={documentSlot}
      blockedReason={blockedReason}
      submitting={submitting}
      submitError={submitError}
      onFocusPromptChange={(focusPrompt) =>
        setValues((prev) => ({ ...prev, focusPrompt }))
      }
      onAudienceKindChange={(audienceKind) =>
        setValues((prev) => ({ ...prev, audienceKind }))
      }
      onStudentAgeBandChange={(studentAgeBand) =>
        setValues((prev) => ({ ...prev, studentAgeBand }))
      }
      onDurationChange={(targetDurationSeconds) =>
        setValues((prev) => ({ ...prev, targetDurationSeconds }))
      }
      onSubmit={() => void submit()}
    />
  );
}
