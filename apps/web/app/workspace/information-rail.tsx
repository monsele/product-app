"use client";

import React from "react";
import type { ProjectSummary } from "@avlp/schemas";
import { FileText, ShieldCheck, WarningOctagon, Spinner, ArrowRight } from "@phosphor-icons/react";
import { getStageDetails, formatRelativeTimestamp } from "./project-stage-utils";
import styles from "./workspace.module.css";

/**
 * Stages where the backend is working and the teacher is waiting. Named
 * stages only: docs/design.md 10.4 forbids invented percentages.
 */
const PROCESSING_STAGES: ReadonlySet<string> = new Set([
  "uploading",
  "validating_source",
  "ingesting",
  "audio_generation",
  "rendering",
]);

export interface ContextualInformationRailProps {
  /**
   * Projects on the current page only. Per docs/design.md 6.2 the rail must not
   * present these as workspace-wide totals, because /projects is paginated and
   * the API returns no aggregate.
   */
  projects: ProjectSummary[];
}

export function ContextualInformationRail({
  projects,
}: ContextualInformationRailProps) {
  const failing = projects.filter(
    (project) => project.latestFailedOperation !== null,
  );
  const processing = projects.filter(
    (project) =>
      project.latestFailedOperation === null &&
      PROCESSING_STAGES.has(project.stage),
  );

  // Most recently updated project that is neither blocked nor mid-job, so the
  // resume prompt never duplicates a row already shown above. The board leads
  // with projects[0] and its own next action, so prompting to resume that same
  // project would put two controls with one intent on the screen
  // (docs/design.md 7). Only offer it when the board is led by something else.
  const resumableCandidate = projects.find(
    (project) =>
      project.latestFailedOperation === null &&
      !PROCESSING_STAGES.has(project.stage),
  );
  const resumable =
    resumableCandidate !== undefined &&
    resumableCandidate.id !== projects[0]?.id
      ? resumableCandidate
      : undefined;

  return (
    <aside aria-label="Workspace Contextual Guidance" className={styles.rail}>
      {failing.length > 0 && (
        <section
          className={`${styles.railCard} ${styles.railCardAttention}`}
          aria-labelledby="rail-attention-heading"
        >
          <div className={styles.railHeading}>
            <WarningOctagon
              size={18}
              weight="fill"
              style={{ color: "var(--color-error-fg)" }}
            />
            <h3 id="rail-attention-heading" className={styles.railTitle}>
              Needs your attention
            </h3>
          </div>
          <ul className={styles.railList}>
            {failing.map((project) => {
              const details = getStageDetails(project.stage, true);
              return (
                <li key={project.id} className={styles.railItem}>
                  <a
                    href={details.nextActionPath(project.id)}
                    className={styles.railItemTitle}
                  >
                    {project.title}
                  </a>
                  <span className={styles.railItemMeta}>
                    Failed during {project.latestFailedOperation}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {processing.length > 0 && (
        <section
          className={styles.railCard}
          aria-labelledby="rail-processing-heading"
        >
          <div className={styles.railHeading}>
            <Spinner
              size={18}
              weight="bold"
              style={{ color: "var(--color-brand)" }}
            />
            <h3 id="rail-processing-heading" className={styles.railTitle}>
              Working now
            </h3>
          </div>
          <ul className={styles.railList}>
            {processing.map((project) => {
              const details = getStageDetails(project.stage, false);
              return (
                <li key={project.id} className={styles.railItem}>
                  <a
                    href={details.nextActionPath(project.id)}
                    className={styles.railItemTitle}
                  >
                    {project.title}
                  </a>
                  <span className={styles.railItemMeta}>{details.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {resumable !== undefined && (
        <section
          className={styles.railCard}
          aria-labelledby="rail-resume-heading"
        >
          <div className={styles.railHeading}>
            <ArrowRight
              size={18}
              weight="bold"
              style={{ color: "var(--color-brand)" }}
            />
            <h3 id="rail-resume-heading" className={styles.railTitle}>
              Pick up where you left off
            </h3>
          </div>
          {(() => {
            const details = getStageDetails(resumable.stage, false);
            return (
              <div className={styles.railItem}>
                <a
                  href={details.nextActionPath(resumable.id)}
                  className={styles.railItemTitle}
                >
                  {resumable.title}
                </a>
                <span className={styles.railItemMeta}>
                  {details.nextActionLabel} · edited{" "}
                  <span className="tabular-nums">
                    {formatRelativeTimestamp(resumable.updatedAt)}
                  </span>
                </span>
              </div>
            );
          })()}
        </section>
      )}

      <section className={styles.railCard} aria-labelledby="rail-sources-heading">
        <div className={styles.railHeading}>
          <FileText
            size={18}
            weight="bold"
            style={{ color: "var(--color-brand)" }}
          />
          <h3 id="rail-sources-heading" className={styles.railTitle}>
            Supported sources
          </h3>
        </div>
        <ul className={styles.railRequirements}>
          <li>PDF or Word (.docx) documents</li>
          <li>Up to 20 pages and 25 MB per document</li>
          <li>English-language teaching material</li>
          <li>Original figures and text preserved</li>
        </ul>
        <div className={styles.railDivider}>
          <div className={styles.railHeading}>
            <ShieldCheck
              size={16}
              weight="bold"
              style={{ color: "var(--color-success-fg)" }}
            />
            <h4 className={styles.railSubTitle}>Private to your workspace</h4>
          </div>
          <p className={styles.railBody}>
            Source documents stay in your workspace. Uploads are validated,
            scanned, and hashed before processing.
          </p>
        </div>
      </section>
    </aside>
  );
}
