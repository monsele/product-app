"use client";

/**
 * ST-106 — presentational pieces of the prompt-to-video run page. They hold no
 * state and make no requests, so each run status renders the same on the
 * server, in the browser and in the component tests.
 *
 * ST-107 adds the video brief, the budget readout and cap card, the
 * "How this video was made" panel and the coverage-gap notice.
 */

import React from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  CheckCircle,
  DownloadSimple,
  FilmSlate,
  PencilSimple,
  Sparkle,
} from "@phosphor-icons/react";
import type {
  CreativeDesignPackId,
  ObjectiveFocusCoverage,
  SoundBedChoice,
  ValidationIssue,
} from "@avlp/schemas";
import type {
  OneShotBrief,
  OneShotDecisionsResponse,
  OneShotEstimate,
  OneShotRunView,
} from "@avlp/schemas/one-shot";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import {
  StatusLabel,
  type StatusType,
} from "../../../../components/ui/status-label";
import {
  audienceKindOptions,
  decisionKindLabels,
  durationOptions,
  focusPromptMaxLength,
  formatUsd,
  ledgerStepLabels,
  stylePackLabels,
  studentAgeBandLabels,
  studentAgeBands,
  toDisplaySteps,
  displayStepLabelForStage,
  isOurSideStop,
  wizardLinkForStage,
  type AudienceKind,
  type DisplayStepState,
  type RequestFormErrors,
  type RequestFormValues,
  type SoundBedOption,
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

export function EstimatePanel({
  state,
  lead,
}: Readonly<{ state: EstimateState; lead?: string }>) {
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
            {lead ??
              `An upper bound for about ${state.estimate.estimatedScenes} scenes. You are charged only for what the run actually uses.`}
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
  /** ST-107. Brief calls used for this video and the limit, once a brief
   * exists; `null` before the first one. */
  revisions: { used: number; max: number } | null;
  /** ST-107. Shown when revising an existing brief: return to it unchanged. */
  onBackToBrief?: (() => void) | undefined;
  /** The upload panel, or a "document ready" summary. */
  documentSlot: React.ReactNode;
  documentError?: string | undefined;
  blockedReason: string | null;
  submitting: boolean;
  reading?: boolean;
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
  revisions,
  onBackToBrief,
  documentSlot,
  blockedReason,
  submitting,
  reading = false,
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

        {blockedReason !== null && (
          <Notice
            type="warning"
            title="New runs are paused"
            message={blockedReason}
          />
        )}
        {reading && (
          <Notice
            type="info"
            title="Still reading your document"
            message="Your upload is done, but the document is still being read. The brief will be prepared automatically as soon as it is ready. You don't need to click again."
          />
        )}
        {submitError !== null && (
          <Notice
            type="error"
            title="The brief was not prepared"
            message={submitError}
          />
        )}

        {revisions !== null && (
          <p className={styles.helper} data-testid="one-shot-brief-revisions">
            {revisionsLeftText(revisions)}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            size="large"
            disabled={
              submitting ||
              blockedReason !== null ||
              (revisions !== null && revisions.used >= revisions.max)
            }
            isLoading={submitting}
            leftIcon={<Sparkle weight="bold" />}
            data-testid="one-shot-prepare-brief"
          >
            {reading
              ? "Reading your document…"
              : submitting
                ? "Preparing the brief…"
                : "Prepare brief"}
          </Button>
          {onBackToBrief !== undefined && (
            <Button
              type="button"
              variant="secondary"
              onClick={onBackToBrief}
              disabled={submitting}
              data-testid="one-shot-back-to-brief"
            >
              Back to the brief
            </Button>
          )}
          <p className={styles.helper}>
            The brief shows what the video will cover and what it will cost. It
            makes one small AI call; nothing else is paid for until you confirm
            it.
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
    <dl className={styles.meta} data-testid="one-shot-budget">
      <div>
        <dt>Cost so far</dt>
        <dd data-testid="one-shot-cost">{formatUsd(run.actualCostUsd)}</dd>
      </div>
      <div>
        <dt>Estimate you approved</dt>
        <dd data-testid="one-shot-estimate-approved">
          {formatUsd(run.budget?.reservedUsd ?? run.acceptedEstimateUsd)}
        </dd>
      </div>
      {run.budget !== null && (
        <div>
          <dt>Stops before passing</dt>
          <dd data-testid="one-shot-cap">{formatUsd(run.budget.capUsd)}</dd>
        </div>
      )}
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
  const ourSide = isOurSideStop(attention?.errorCode);
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
          {ourSide
            ? "Something went wrong on our side. Nothing has been lost, and trying again continues from where the video stopped."
            : "Nothing has been lost. Fix the step in the editor, then resume to continue from where the run stopped."}
        </p>
      </div>
      <Notice
        type={failed ? "error" : "warning"}
        {...(attention === null
          ? {}
          : { title: `Stopped at ${displayStepLabelForStage(attention.stage)}` })}
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
          {busy ? "Resuming…" : ourSide ? "Try again" : "Resume"}
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

// ---------------------------------------------------------------------------
// ST-107 — video brief
// ---------------------------------------------------------------------------

export function revisionsLeftText(revisions: {
  used: number;
  max: number;
}): string {
  const left = Math.max(0, revisions.max - revisions.used);
  if (left === 0)
    return `You have prepared this brief ${revisions.max} times, the most for one video. Confirm it, or cancel and start again.`;
  return `Brief ${revisions.used} of ${revisions.max} prepared. You can change the request and prepare it again ${left} more time${left === 1 ? "" : "s"}.`;
}

export interface BriefCardProps {
  brief: OneShotBrief;
  revisions: { used: number; max: number };
  stylePackIds: readonly CreativeDesignPackId[];
  stylePackId: CreativeDesignPackId;
  soundBed: SoundBedChoice;
  soundBedOptions: readonly SoundBedOption[];
  onStylePackChange: (value: CreativeDesignPackId) => void;
  onSoundBedChange: (value: SoundBedChoice) => void;
  onEdit: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
  confirmError: string | null;
  blockedReason: string | null;
}

export function BriefCard({
  brief,
  revisions,
  stylePackIds,
  stylePackId,
  soundBed,
  soundBedOptions,
  onStylePackChange,
  onSoundBedChange,
  onEdit,
  onConfirm,
  onCancel,
  confirming,
  confirmError,
  blockedReason,
}: Readonly<BriefCardProps>) {
  const headings = new Map(
    brief.sections.map((section) => [section.sectionId, section.heading]),
  );
  const canRevise = revisions.used < revisions.max;
  return (
    <section
      aria-labelledby="one-shot-brief-heading"
      className={styles.card}
      data-testid="one-shot-brief"
      data-revision={brief.revision}
    >
      <div>
        <h2 id="one-shot-brief-heading" className={styles.cardTitle}>
          Review the video brief
        </h2>
        <p className={styles.cardLead}>
          This is what the video will cover, how it will look and sound, and
          what it will cost. Nothing else is paid for until you confirm it.
        </p>
      </div>

      <dl className={styles.meta}>
        <div>
          <dt>Lesson</dt>
          <dd data-testid="one-shot-brief-title">{brief.lessonTitle}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{brief.subject}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>
            {Math.round(brief.targetDurationSeconds / 60)} minutes, about{" "}
            {brief.plannedSceneCount} scenes
          </dd>
        </div>
      </dl>

      <RunRequestSummaryText text={brief.focusPrompt} />

      <div className={styles.fieldset}>
        <h3 className={styles.label} style={{ margin: 0 }}>
          What the video will cover
        </h3>
        <ol className={styles.coverageList}>
          {brief.coverage.map((point) => (
            <li
              key={point.point}
              className={styles.coveragePoint}
              data-testid="one-shot-brief-point"
            >
              <span>{point.point}</span>
              <ul className={styles.chips} aria-label="From these sections">
                {point.sectionIds.map((sectionId) => (
                  <li
                    key={sectionId}
                    className={styles.chip}
                    data-testid="one-shot-source-chip"
                  >
                    {headings.get(sectionId) ?? "Document section"}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      {brief.notCovered.length > 0 && (
        <div className={styles.fieldset} data-testid="one-shot-brief-not-covered">
          <h3 className={styles.label} style={{ margin: 0 }}>
            What it will leave out
          </h3>
          <ul className={styles.issueList}>
            {brief.notCovered.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={styles.choiceRow}>
        <div className={styles.fieldset}>
          <label htmlFor="one-shot-style" className={styles.label}>
            Style pack
          </label>
          <select
            id="one-shot-style"
            className={styles.select}
            value={stylePackId}
            onChange={(event) =>
              onStylePackChange(event.target.value as CreativeDesignPackId)
            }
            disabled={confirming}
            aria-describedby="one-shot-style-reason"
            data-testid="one-shot-style"
          >
            {stylePackIds.map((id) => (
              <option key={id} value={id}>
                {stylePackLabels[id]}
              </option>
            ))}
          </select>
          <p className={styles.helper} id="one-shot-style-reason">
            {stylePackId === brief.stylePackId
              ? `Suggested: ${brief.stylePackReason}`
              : `Your choice. The brief suggested ${stylePackLabels[brief.stylePackId]}.`}
          </p>
        </div>
        <div className={styles.fieldset}>
          <label htmlFor="one-shot-sound" className={styles.label}>
            Background sound
          </label>
          <select
            id="one-shot-sound"
            className={styles.select}
            value={soundBed}
            onChange={(event) => onSoundBedChange(event.target.value)}
            disabled={confirming}
            aria-describedby="one-shot-sound-reason"
            data-testid="one-shot-sound"
          >
            {soundBedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className={styles.helper} id="one-shot-sound-reason">
            {soundBed === brief.soundBed
              ? `Suggested: ${brief.soundBedReason}`
              : "Your choice. It plays quietly under the narration."}
          </p>
        </div>
      </div>

      <EstimatePanel
        state={{ kind: "ready", estimate: brief.estimate }}
        lead={`An upper bound for about ${brief.plannedSceneCount} scenes, including automatic fixes the checks may need. You are charged only for what the run uses, and it stops before any step that would go past its budget.`}
      />

      {blockedReason !== null && (
        <Notice type="warning" title="New runs are paused" message={blockedReason} />
      )}
      {confirmError !== null && (
        <Notice
          type="error"
          title="The video was not started"
          message={confirmError}
        />
      )}
      <p className={styles.helper} data-testid="one-shot-brief-revisions">
        {revisionsLeftText(revisions)}
      </p>

      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          size="large"
          onClick={onConfirm}
          disabled={confirming || blockedReason !== null}
          isLoading={confirming}
          leftIcon={<CheckCircle weight="bold" />}
          data-testid="one-shot-confirm"
        >
          {confirming ? "Creating video…" : "Confirm & create video"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onEdit}
          disabled={confirming || !canRevise}
          leftIcon={<PencilSimple weight="bold" />}
          data-testid="one-shot-edit-brief"
        >
          Edit request
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onCancel}
          disabled={confirming}
          className={styles.destructiveLink}
          data-testid="one-shot-cancel"
        >
          Cancel video
        </Button>
      </div>
      <p className={styles.helper}>
        Confirming approves the estimate above. Nothing is rendered until you
        approve the preview.
      </p>
    </section>
  );
}

function RunRequestSummaryText({ text }: Readonly<{ text: string }>) {
  return (
    <div className={styles.fieldset}>
      <span className={styles.label}>Your request</span>
      <p className={styles.request}>{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ST-107 — budget cap
// ---------------------------------------------------------------------------

export function BudgetCapCard({
  run,
  busy,
  onAccept,
  onCancel,
}: Readonly<{
  run: OneShotRunView;
  busy: boolean;
  onAccept: () => void;
  onCancel: () => void;
}>) {
  const proposal = run.budget?.proposedEstimateUsd ?? null;
  return (
    <section
      aria-labelledby="one-shot-budget-heading"
      className={styles.card}
      data-testid="one-shot-budget-cap"
    >
      <div>
        <h2 id="one-shot-budget-heading" className={styles.cardTitle}>
          The video reached its budget
        </h2>
        <p className={styles.cardLead}>
          The run stopped before a step that would cost more than you approved.
          Nothing past that step has been paid for.
        </p>
      </div>
      <Notice
        type="warning"
        title="Budget reached"
        message={run.needsAttention?.message ?? "The next step would pass the budget."}
      />
      <RunSteps run={run} />
      <RunMeta run={run} />
      <div className={styles.actions}>
        <Button
          type="button"
          variant="primary"
          onClick={onAccept}
          disabled={busy || proposal === null}
          leftIcon={<ArrowClockwise weight="bold" />}
          data-testid="one-shot-accept-budget"
        >
          {busy
            ? "Continuing…"
            : proposal === null
              ? "Accept the new estimate"
              : `Accept ${formatUsd(proposal)} and continue`}
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
      <p className={styles.helper}>
        The new estimate covers what has been spent and the rest of the video.
        The run again stops before any step that would go past the new budget.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// ST-107 — coverage gaps and "How this video was made"
// ---------------------------------------------------------------------------

export function CoverageGapNotice({
  gaps,
}: Readonly<{ gaps: readonly string[] }>) {
  if (gaps.length === 0) return null;
  return (
    <section
      aria-labelledby="one-shot-gap-heading"
      className={styles.card}
      data-testid="one-shot-coverage-gap"
      style={{
        backgroundColor: "var(--color-warning-bg)",
        borderColor: "var(--color-warning-border)",
      }}
    >
      <h3
        id="one-shot-gap-heading"
        className={styles.label}
        style={{ margin: 0, color: "var(--color-warning-fg)" }}
      >
        Some of the brief is not covered
      </h3>
      <p className={styles.cardLead} style={{ color: "var(--color-text)" }}>
        No scene uses the document sections behind these points, even after an
        automatic fix. Decide whether to render as it is or refine it in the
        editor first.
      </p>
      <ul className={styles.issueList}>
        {gaps.map((gap) => (
          <li key={gap}>Not covered: {gap}</li>
        ))}
      </ul>
    </section>
  );
}

export type DecisionsState =
  | { kind: "loading" }
  | { kind: "ready"; log: OneShotDecisionsResponse }
  | { kind: "error"; message: string };

export function DecisionPanel({
  state,
  onExport,
}: Readonly<{ state: DecisionsState; onExport: () => void }>) {
  return (
    <section
      aria-labelledby="one-shot-decisions-heading"
      aria-busy={state.kind === "loading"}
      className={styles.card}
      data-testid="one-shot-decisions"
    >
      <div className={styles.actions}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h3 id="one-shot-decisions-heading" className={styles.cardTitle}>
            How this video was made
          </h3>
          <p className={styles.cardLead}>
            Every automatic decision, with its reason, the model that made it
            and what it cost.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={onExport}
          disabled={state.kind !== "ready"}
          leftIcon={<DownloadSimple weight="bold" />}
          data-testid="one-shot-decisions-export"
        >
          Export JSON
        </Button>
      </div>
      {state.kind === "loading" ? (
        <p className={styles.helper} role="status">
          Loading the decision log…
        </p>
      ) : state.kind === "error" ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : (
        <>
          {state.log.ledger.length > 0 && (
            <table className={styles.estimateTable} data-testid="one-shot-ledger">
              <caption className={styles.srOnly}>
                Estimated and actual cost by step
              </caption>
              <thead>
                <tr>
                  <th scope="col">Step</th>
                  <th scope="col" className={styles.amount}>
                    Estimated
                  </th>
                  <th scope="col" className={styles.amount}>
                    Actual
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.log.ledger.map((line) => (
                  <tr key={line.step} data-testid="one-shot-ledger-row">
                    <td>{ledgerStepLabels[line.step]}</td>
                    <td className={styles.amount}>
                      {formatUsd(line.estimateUsd)}
                    </td>
                    <td className={styles.amount}>{formatUsd(line.actualUsd)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className={styles.amount}>
                    {formatUsd(
                      state.log.ledger.reduce((sum, line) => sum + line.estimateUsd, 0),
                    )}
                  </td>
                  <td className={styles.amount} data-testid="one-shot-ledger-actual">
                    {formatUsd(
                      state.log.ledger.reduce((sum, line) => sum + line.actualUsd, 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          {state.log.decisions.length === 0 ? (
            <p className={styles.helper}>No decisions have been made yet.</p>
          ) : (
            <ol className={styles.decisionList}>
              {state.log.decisions.map((decision) => (
                <li
                  key={decision.seq}
                  className={styles.decision}
                  data-testid="one-shot-decision"
                  data-kind={decision.kind}
                >
                  <span className={styles.decisionKind}>
                    {decisionKindLabels[decision.kind]}
                  </span>
                  <div className={styles.decisionBody}>
                    <p className={styles.decisionSummary}>{decision.summary}</p>
                    {decision.reason !== null && (
                      <p className={styles.helper}>{decision.reason}</p>
                    )}
                    {(decision.model !== null || decision.costUsd !== null) && (
                      <p className={styles.helper}>
                        {[
                          decision.model === null ? null : `Model: ${decision.model}`,
                          decision.costUsd === null
                            ? null
                            : `Cost: ${formatUsd(decision.costUsd)}`,
                        ]
                          .filter((part) => part !== null)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
