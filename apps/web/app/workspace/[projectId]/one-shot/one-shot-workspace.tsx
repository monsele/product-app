"use client";

/**
 * ST-106 — the prompt-to-video run page: request → progress → (needs
 * attention | not covered) → preview approval → delivery, all on ST-105's API.
 *
 * - The server is the source of truth. Every view is derived from the latest
 *   `GET one-shot`, so a reload lands on the right step and polling resumes.
 * - Paid work starts only from Create video and Render video. Both are
 *   guarded against double submission in the browser; Create video also sends
 *   an idempotency key that stays the same until the request changes, and the
 *   server refuses a second render once the run has left approval.
 * - The focus prompt only ever travels in a request body.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import type { OneShotResponse, OneShotRunView } from "@avlp/schemas/one-shot";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { Notice } from "../../../../components/ui/notice";
import { StatusLabel } from "../../../../components/ui/status-label";
import {
  OneShotRequestError,
  audienceFor,
  audienceKindFrom,
  currentDisplayStep,
  fetchOneShot,
  isPollingStatus,
  newIdempotencyKey,
  nextPollDelay,
  pollInitialMs,
  postRunAction,
  requestEstimate,
  requestSignature,
  runFingerprint,
  startOneShotRun,
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
  CoverageNotice,
  NotCoveredCard,
  OneShotUnavailable,
  RequestFields,
  RunMeta,
  RunProgressCard,
  type EstimateState,
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
  const [busy, setBusy] = useState<RunAction | null>(null);
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
          error instanceof OneShotRequestError
            ? error.message
            : "The request could not be sent. Check your connection and try again.",
        );
        // The run may have moved on (for example a second tab rendered it).
        try {
          setState(await fetchOneShot(projectId));
        } catch {
          // Keep the last known state.
        }
      } finally {
        inFlight.current = false;
        setBusy(null);
        setConfirmCancel(false);
      }
    },
    [projectId],
  );

  if (!state.eligibility.visible)
    return <OneShotUnavailable projectId={projectId} />;

  const announcement = announcementFor(view, run);
  const cancelDialog = (
    <Dialog
      isOpen={confirmCancel}
      onClose={() => (busy === null ? setConfirmCancel(false) : undefined)}
      title="Cancel this video?"
      description={
        run?.status === "rendering"
          ? "The run stops tracking the render. A render that has already started still finishes and appears in the lesson's render history."
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
            Upload a document, say what to explain, and preview the video before
            anything is rendered.
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

      {view === "request" && (
        <RequestForm
          projectId={projectId}
          previous={run}
          documentReady={uploaded || run !== null}
          onDocumentReady={() => setUploaded(true)}
          blockedReason={
            state.eligibility.canStart
              ? null
              : (state.eligibility.reasons[0]?.message ??
                "New prompt-to-video runs are paused.")
          }
          onStarted={setState}
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
          <CoverageNotice coverage={run.focusCoverage} />
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
            {run.needsAttention?.errorCode === "RENDER_FAILED" && (
              <>
                <Notice type="error" message={run.needsAttention.message} />
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy !== null}
                    onClick={() => void act("resume")}
                    data-testid="one-shot-resume"
                  >
                    {busy === "resume" ? "Resuming…" : "Resume"}
                  </Button>
                  <p className={styles.helper}>
                    Resuming checks the lesson again and brings you back to
                    approve a new render.
                  </p>
                </div>
              </>
            )}
          </section>
          <CoverageNotice coverage={run.focusCoverage} />
          <OneShotDelivery
            key={`${run.renderJobId ?? "none"}:${run.status}`}
            projectId={projectId}
            projectTitle={projectTitle}
            lessonVersionId={run.lessonVersionId}
          />
        </div>
      )}

      {cancelDialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Request form
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

function RequestForm({
  projectId,
  previous,
  documentReady,
  onDocumentReady,
  blockedReason,
  onStarted,
}: Readonly<{
  projectId: string;
  previous: OneShotRunView | null;
  documentReady: boolean;
  onDocumentReady: () => void;
  blockedReason: string | null;
  onStarted: (response: OneShotResponse) => void;
}>) {
  const [values, setValues] = useState<RequestFormValues>(() =>
    initialValues(previous),
  );
  const [estimate, setEstimate] = useState<EstimateState>({ kind: "loading" });
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [estimateVersion, setEstimateVersion] = useState(0);
  const inFlight = useRef(false);
  const idempotency = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (blockedReason !== null) {
      setEstimate({
        kind: "error",
        message: "Estimates are unavailable while new runs are paused.",
      });
      return;
    }
    const controller = new AbortController();
    setEstimate({ kind: "loading" });
    requestEstimate(projectId, values.targetDurationSeconds, controller.signal)
      .then((result) => setEstimate({ kind: "ready", estimate: result }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setEstimate({
          kind: "error",
          message:
            error instanceof OneShotRequestError
              ? error.message
              : "The cost estimate could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [projectId, values.targetDurationSeconds, blockedReason, estimateVersion]);

  const readyEstimate = estimate.kind === "ready" ? estimate.estimate : null;
  const errors: RequestFormErrors = validateRequestForm(values, {
    documentReady,
    estimate: readyEstimate,
  });
  const visibleErrors: RequestFormErrors = showErrors ? errors : {};

  const submit = async () => {
    if (inFlight.current || blockedReason !== null) return;
    setShowErrors(true);
    setSubmitError(null);
    if (
      Object.keys(errors).length > 0 ||
      readyEstimate === null ||
      values.audienceKind === null
    ) {
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
    const signature = requestSignature(values, readyEstimate.totalUsd);
    if (idempotency.current?.signature !== signature)
      idempotency.current = { signature, key: newIdempotencyKey() };
    try {
      const response = await startOneShotRun(
        projectId,
        {
          focusPrompt: values.focusPrompt.trim(),
          audience: audienceFor(values.audienceKind, values.studentAgeBand),
          targetDurationSeconds: values.targetDurationSeconds,
          acceptedEstimateUsd: readyEstimate.totalUsd,
        },
        idempotency.current.key,
      );
      onStarted(response);
    } catch (error) {
      if (error instanceof OneShotRequestError && error.status === 409)
        // The estimate may have moved; show the current one to accept.
        setEstimateVersion((value) => value + 1);
      setSubmitError(
        error instanceof OneShotRequestError
          ? error.message
          : "The request could not be sent. Check your connection and try again.",
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
        The video is built from this document. Reading it continues in the
        background once you create the video.
      </p>
    </section>
  ) : (
    <SourceUploadForm projectId={projectId} onUploadSuccess={onDocumentReady} />
  );

  return (
    <RequestFields
      values={values}
      errors={visibleErrors}
      estimate={estimate}
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
