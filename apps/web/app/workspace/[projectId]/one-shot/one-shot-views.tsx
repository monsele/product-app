"use client";

/**
 * ST-106 — presentational pieces of the prompt-to-video run page. They hold no
 * state and make no requests, so each run status renders the same on the
 * server, in the browser and in the component tests.
 */

import React from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  FilmSlate,
  PencilSimple,
  Sparkle,
} from "@phosphor-icons/react";
import type { ObjectiveFocusCoverage, ValidationIssue } from "@avlp/schemas";
import type { OneShotEstimate, OneShotRunView } from "@avlp/schemas/one-shot";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import {
  StatusLabel,
  type StatusType,
} from "../../../../components/ui/status-label";
import {
  audienceKindOptions,
  durationOptions,
  focusPromptMaxLength,
  formatUsd,
  studentAgeBandLabels,
  studentAgeBands,
  toDisplaySteps,
  wizardLinkForStage,
  type AudienceKind,
  type DisplayStepState,
  type RequestFormErrors,
  type RequestFormValues,
  type StudentAgeBand,
} from "../../../../lib/one-shot";
import styles from "./one-shot.module.css";

// ---------------------------------------------------------------------------
// Unavailable
// ---------------------------------------------------------------------------

export function OneShotUnavailable({
  projectId,
}: Readonly<{ projectId: string }>) {
  return (
    <section
      aria-labelledby="one-shot-unavailable-heading"
      className={styles.card}
      data-testid="one-shot-unavailable"
    >
      <h2 id="one-shot-unavailable-heading" className={styles.cardTitle}>
        Quick video is unavailable
      </h2>
      <p className={styles.cardLead}>
        Quick video from a PDF is an invited pilot and is not enabled for this
        account. You can still build this lesson step by step in the editor.
      </p>
      <div className={styles.actions}>
        <Link
          className={styles.link}
          href={`/workspace/${encodeURIComponent(projectId)}/upload`}
        >
          Open the lesson editor
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export type EstimateState =
  | { kind: "loading" }
  | { kind: "ready"; estimate: OneShotEstimate }
  | { kind: "error"; message: string };

export function EstimatePanel({ state }: Readonly<{ state: EstimateState }>) {
  return (
    <section
      aria-labelledby="one-shot-estimate-heading"
      aria-busy={state.kind === "loading"}
      className={styles.estimate}
      data-testid="one-shot-estimate"
    >
      <h3
        id="one-shot-estimate-heading"
        className={styles.label}
        style={{ margin: 0 }}
      >
        Estimated cost
      </h3>
      {state.kind === "loading" ? (
        <p className={styles.helper} role="status">
          Calculating the estimate…
        </p>
      ) : state.kind === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : (
        <>
          <p className={styles.helper}>
            An upper bound for about {state.estimate.estimatedScenes} scenes.
            You are charged only for what the run actually uses.
          </p>
          <table className={styles.estimateTable}>
            <caption className={styles.srOnly}>Itemised cost estimate</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className={styles.amount}>
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {state.estimate.items.map((item) => (
                <tr key={item.key} data-testid="one-shot-estimate-item">
                  <td>
                    {item.label}
                    {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                  </td>
                  <td className={styles.amount}>{formatUsd(item.costUsd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total, at most</td>
                <td
                  className={styles.amount}
                  data-testid="one-shot-estimate-total"
                >
                  {formatUsd(state.estimate.totalUsd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Request form
// ---------------------------------------------------------------------------

export interface RequestFieldsProps {
  values: RequestFormValues;
  errors: RequestFormErrors;
  estimate: EstimateState;
  /** The upload panel, or a "document ready" summary. */
  documentSlot: React.ReactNode;
  documentError?: string | undefined;
  blockedReason: string | null;
  submitting: boolean;
  submitError: string | null;
  onFocusPromptChange: (value: string) => void;
  onAudienceKindChange: (value: AudienceKind) => void;
  onStudentAgeBandChange: (value: StudentAgeBand) => void;
  onDurationChange: (value: RequestFormValues["targetDurationSeconds"]) => void;
  onSubmit: () => void;
}

export function RequestFields({
  values,
  errors,
  estimate,
  documentSlot,
  blockedReason,
  submitting,
  submitError,
  onFocusPromptChange,
  onAudienceKindChange,
  onStudentAgeBandChange,
  onDurationChange,
  onSubmit,
}: Readonly<RequestFieldsProps>) {
  const length = values.focusPrompt.length;
  const over = length > focusPromptMaxLength;
  return (
    <div className={styles.column}>
      <section
        aria-labelledby="one-shot-document-heading"
        className={styles.wide}
      >
        <h2 id="one-shot-document-heading" className={styles.srOnly}>
          Document
        </h2>
        {documentSlot}
        {errors.document !== undefined && (
          <p className={styles.error} id="one-shot-document-error">
            {errors.document}
          </p>
        )}
      </section>

      <form
        aria-labelledby="one-shot-request-heading"
        className={styles.card}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div>
          <h2 id="one-shot-request-heading" className={styles.cardTitle}>
            Describe the video
          </h2>
          <p className={styles.cardLead}>
            Say what the video should explain from your document, who it is for,
            and how long it should be.
          </p>
        </div>

        <div className={styles.fieldset}>
          <label htmlFor="one-shot-focus" className={styles.label}>
            What should the video explain?
          </label>
          <p className={styles.helper} id="one-shot-focus-help">
            Name the idea, process or question to focus on. Only what your
            document covers is used.
          </p>
          <textarea
            id="one-shot-focus"
            name="focusPrompt"
            className={styles.textarea}
            value={values.focusPrompt}
            maxLength={focusPromptMaxLength + 200}
            placeholder="For example: explain the main idea of section 2 step by step, with one worked example."
            aria-describedby={[
              "one-shot-focus-help",
              "one-shot-focus-count",
              errors.focusPrompt === undefined ? "" : "one-shot-focus-error",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-invalid={errors.focusPrompt !== undefined || over}
            onChange={(event) => onFocusPromptChange(event.target.value)}
            disabled={submitting}
          />
          <div className={styles.counterRow}>
            {errors.focusPrompt !== undefined ? (
              <p className={styles.error} id="one-shot-focus-error">
                {errors.focusPrompt}
              </p>
            ) : (
              <span />
            )}
            <span
              id="one-shot-focus-count"
              className={`${styles.counter} ${over ? styles.counterOver : ""}`}
              data-testid="one-shot-focus-count"
            >
              {length.toLocaleString("en-US")} /{" "}
              {focusPromptMaxLength.toLocaleString("en-US")} characters
            </span>
          </div>
        </div>

        <fieldset
          className={styles.fieldset}
          aria-describedby={
            errors.audience === undefined
              ? undefined
              : "one-shot-audience-error"
          }
        >
          <legend className={styles.legend}>Who is it for?</legend>
          <div className={styles.choiceGrid}>
            {audienceKindOptions.map((option) => (
              <label key={option.value} className={styles.choice}>
                <input
                  type="radio"
                  name="audienceKind"
                  value={option.value}
                  checked={values.audienceKind === option.value}
                  onChange={() => onAudienceKindChange(option.value)}
                  disabled={submitting}
                />
                <span className={styles.choiceText}>
                  <span className={styles.choiceLabel}>{option.label}</span>
                  <span className={styles.choiceHint}>
                    {option.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {errors.audience !== undefined && (
            <p className={styles.error} id="one-shot-audience-error">
              {errors.audience}
            </p>
          )}
        </fieldset>

        {values.audienceKind === "students" && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Student age band</legend>
            <div className={styles.inlineChoices}>
              {studentAgeBands.map((band) => (
                <label key={band} className={styles.choice}>
                  <input
                    type="radio"
                    name="studentAgeBand"
                    value={band}
                    checked={values.studentAgeBand === band}
                    onChange={() => onStudentAgeBandChange(band)}
                    disabled={submitting}
                  />
                  <span className={styles.choiceLabel}>
                    {studentAgeBandLabels[band]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Length</legend>
          <div className={styles.inlineChoices}>
            {durationOptions.map((option) => (
              <label key={option.seconds} className={styles.choice}>
                <input
                  type="radio"
                  name="targetDurationSeconds"
                  value={option.seconds}
                  checked={values.targetDurationSeconds === option.seconds}
                  onChange={() => onDurationChange(option.seconds)}
                  disabled={submitting}
                />
                <span className={styles.choiceLabel}>
                  {option.minutes} minutes
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <EstimatePanel state={estimate} />
        {errors.estimate !== undefined && estimate.kind === "ready" && (
          <p className={styles.error}>{errors.estimate}</p>
        )}

        {blockedReason !== null && (
          <Notice
            type="warning"
            title="New runs are paused"
            message={blockedReason}
          />
        )}
        {submitError !== null && (
          <Notice
            type="error"
            title="The video was not started"
            message={submitError}
          />
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="large"
            disabled={submitting || blockedReason !== null}
            isLoading={submitting}
            leftIcon={<Sparkle weight="bold" />}
            data-testid="one-shot-create"
          >
            {submitting ? "Creating video…" : "Create video"}
          </Button>
          <p className={styles.helper}>
            Creating the video approves the estimate above. Nothing is rendered
            until you approve the preview.
          </p>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

const stepStatus: Record<
  DisplayStepState,
  { status: StatusType; label: string }
> = {
  pending: { status: "blocked", label: "Waiting" },
  running: { status: "in_progress", label: "In progress" },
  done: { status: "success", label: "Done" },
  attention: { status: "warning", label: "Needs attention" },
  failed: { status: "error", label: "Failed" },
};

export function RunSteps({ run }: Readonly<{ run: OneShotRunView }>) {
  const steps = toDisplaySteps(run);
  return (
    <ol className={styles.steps} aria-label="Video build steps">
      {steps.map((step) => {
        const current = step.state === "running";
        return (
          <li
            key={step.id}
            className={`${styles.step} ${current ? styles.stepCurrent : ""}`}
            aria-current={current ? "step" : undefined}
            data-testid="one-shot-step"
            data-step={step.id}
            data-state={step.state}
          >
            <span className={styles.stepName}>{step.label}</span>
            <StatusLabel
              size="compact"
              status={stepStatus[step.state].status}
              label={stepStatus[step.state].label}
            />
          </li>
        );
      })}
    </ol>
  );
}

export function RunMeta({ run }: Readonly<{ run: OneShotRunView }>) {
  return (
    <dl className={styles.meta}>
      <div>
        <dt>Cost so far</dt>
        <dd data-testid="one-shot-cost">{formatUsd(run.actualCostUsd)}</dd>
      </div>
      <div>
        <dt>Approved estimate</dt>
        <dd>{formatUsd(run.acceptedEstimateUsd)}</dd>
      </div>
      <div>
        <dt>Length</dt>
        <dd>{Math.round(run.targetDurationSeconds / 60)} minutes</dd>
      </div>
    </dl>
  );
}

export function RunRequestSummary({ run }: Readonly<{ run: OneShotRunView }>) {
  return (
    <div className={styles.fieldset}>
      <span className={styles.label}>Your request</span>
      <p className={styles.request}>{run.focusPrompt}</p>
    </div>
  );
}

export function RunProgressCard({
  run,
  onCancel,
  busy,
}: Readonly<{ run: OneShotRunView; onCancel: () => void; busy: boolean }>) {
  return (
    <section
      aria-labelledby="one-shot-progress-heading"
      className={styles.card}
      data-testid="one-shot-progress"
      data-status={run.status}
    >
      <div>
        <h2 id="one-shot-progress-heading" className={styles.cardTitle}>
          Building your video
        </h2>
        <p className={styles.cardLead}>
          Each step uses the same checks as the lesson editor. You can leave
          this page; the video keeps building and this page picks up where it is
          when you come back.
        </p>
      </div>
      <RunSteps run={run} />
      <RunMeta run={run} />
      <RunRequestSummary run={run} />
      <div className={styles.actions}>
        <Button
          type="button"
          variant="destructive"
          onClick={onCancel}
          disabled={busy}
          className={styles.destructiveLink}
          data-testid="one-shot-cancel"
        >
          Cancel video
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Needs attention / not covered
// ---------------------------------------------------------------------------

export function AttentionCard({
  run,
  projectId,
  onResume,
  onCancel,
  busy,
}: Readonly<{
  run: OneShotRunView;
  projectId: string;
  onResume: () => void;
  onCancel: () => void;
  busy: boolean;
}>) {
  const attention = run.needsAttention;
  const link =
    attention === null ? null : wizardLinkForStage(projectId, attention.stage);
  const failed = run.status === "failed";
  return (
    <section
      aria-labelledby="one-shot-attention-heading"
      className={styles.card}
      data-testid="one-shot-attention"
      data-status={run.status}
    >
      <div>
        <h2 id="one-shot-attention-heading" className={styles.cardTitle}>
          {failed ? "A step failed" : "Your video needs attention"}
        </h2>
        <p className={styles.cardLead}>
          Nothing has been lost. Fix the step in the editor, then resume to
          continue from where the run stopped.
        </p>
      </div>
      <Notice
        type={failed ? "error" : "warning"}
        {...(link === null ? {} : { title: `Stopped at ${link.label}` })}
        message={
          attention?.message ??
          "The run stopped. Open the editor to check the lesson, then resume."
        }
      />
      <RunSteps run={run} />
      <RunMeta run={run} />
      <div className={styles.actions}>
        {link !== null && (
          <Link
            className={styles.link}
            href={link.href}
            data-testid="one-shot-attention-link"
          >
            Open {link.label} in the editor
          </Link>
        )}
        <Button
          type="button"
          variant="primary"
          onClick={onResume}
          disabled={busy}
          leftIcon={<ArrowClockwise weight="bold" />}
          data-testid="one-shot-resume"
        >
          {busy ? "Resuming…" : "Resume"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onCancel}
          disabled={busy}
          className={styles.destructiveLink}
          data-testid="one-shot-cancel"
        >
          Cancel video
        </Button>
      </div>
    </section>
  );
}

export function NotCoveredCard({
  run,
  onEditPrompt,
  busy,
}: Readonly<{ run: OneShotRunView; onEditPrompt: () => void; busy: boolean }>) {
  const reason =
    run.focusCoverage?.status === "not_covered"
      ? run.focusCoverage.reason
      : (run.needsAttention?.message ??
        "The document does not cover what you asked for.");
  return (
    <section
      aria-labelledby="one-shot-not-covered-heading"
      className={styles.card}
      data-testid="one-shot-not-covered"
    >
      <div>
        <h2 id="one-shot-not-covered-heading" className={styles.cardTitle}>
          Your document does not cover this request
        </h2>
        <p className={styles.cardLead}>
          The video only explains what your document contains. Change the
          request to something the document covers and start again.
        </p>
      </div>
      <Notice type="warning" title="Not covered" message={reason} />
      <RunRequestSummary run={run} />
      <RunMeta run={run} />
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={onEditPrompt}
          disabled={busy}
          leftIcon={<PencilSimple weight="bold" />}
          data-testid="one-shot-edit-prompt"
        >
          {busy ? "Closing this run…" : "Edit prompt"}
        </Button>
        <p className={styles.helper}>
          Editing closes this run and starts a new one when you create the video
          again.
        </p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

export function CoverageNotice({
  coverage,
}: Readonly<{ coverage: ObjectiveFocusCoverage | null }>) {
  if (coverage === null || coverage.status !== "partial") return null;
  return (
    <section
      aria-labelledby="one-shot-coverage-heading"
      className={styles.card}
      data-testid="one-shot-coverage"
      style={{
        backgroundColor: "var(--color-warning-bg)",
        borderColor: "var(--color-warning-border)",
      }}
    >
      <h3
        id="one-shot-coverage-heading"
        className={styles.label}
        style={{ margin: 0, color: "var(--color-warning-fg)" }}
      >
        Your document covers only part of this request
      </h3>
      <p className={styles.cardLead} style={{ color: "var(--color-text)" }}>
        The video explains what the document supports. These parts are missing:
      </p>
      <ul className={styles.issueList}>
        {coverage.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function ValidationWarnings({
  issues,
}: Readonly<{ issues: readonly ValidationIssue[] }>) {
  const warnings = issues.filter((issue) => issue.severity === "warning");
  if (warnings.length === 0) return null;
  const messages = [...new Set(warnings.map((issue) => issue.message))];
  return (
    <section
      aria-labelledby="one-shot-warnings-heading"
      className={styles.card}
      data-testid="one-shot-warnings"
    >
      <h3
        id="one-shot-warnings-heading"
        className={styles.label}
        style={{ margin: 0 }}
      >
        Check notes ({warnings.length})
      </h3>
      <p className={styles.cardLead}>
        These do not stop the render. Refine the lesson in the editor if you
        want to address them.
      </p>
      <ul className={styles.issueList}>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </section>
  );
}

export function ApprovalActions({
  projectId,
  onRender,
  busy,
  onCancel,
}: Readonly<{
  projectId: string;
  onRender: () => void;
  busy: boolean;
  onCancel: () => void;
}>) {
  return (
    <div className={styles.actions}>
      <Button
        type="button"
        variant="primary"
        size="large"
        onClick={onRender}
        disabled={busy}
        isLoading={busy}
        leftIcon={<FilmSlate weight="bold" />}
        data-testid="one-shot-render"
      >
        {busy ? "Starting render…" : "Render video"}
      </Button>
      <Link
        className={styles.link}
        href={`/workspace/${encodeURIComponent(projectId)}/storyboard`}
        data-testid="one-shot-refine"
      >
        Refine in editor
      </Link>
      <Button
        type="button"
        variant="destructive"
        onClick={onCancel}
        disabled={busy}
        className={styles.destructiveLink}
        data-testid="one-shot-cancel"
      >
        Cancel video
      </Button>
    </div>
  );
}
