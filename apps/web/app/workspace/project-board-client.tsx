"use client";

import React, { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "@avlp/schemas";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { StatusLabel, type StatusType } from "../../components/ui/status-label";
import { Menu } from "../../components/ui/menu";
import { Notice } from "../../components/ui/notice";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { getStageDetails, formatDateTime } from "./project-stage-utils";
import {
  PIPELINE_STAGES,
  getProjectStageIndex,
} from "../../lib/project-pipeline";
import styles from "./workspace.module.css";
import {
  Plus,
  ArrowRight,
  Copy,
  Trash,
  WarningOctagon,
  FolderDashed,
} from "@phosphor-icons/react";

export interface ProjectBoardClientProps {
  projects: ProjectSummary[];
  nextCursor?: string | undefined;
  error?: string | undefined;
}

function createIdempotencyKey(): string {
  return typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapBadgeStatus(badgeStyle: string): StatusType {
  switch (badgeStyle) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "error";
    case "info":
      return "info";
    default:
      return "in_progress";
  }
}

export function ProjectBoardClient({
  projects,
  nextCursor,
  error,
}: ProjectBoardClientProps) {
  const [projectTitle, setProjectTitle] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [duplicating, setDuplicating] = useState<{
    id: string;
    key: string;
  } | null>(null);

  const duplicateFormRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Submit once the hidden form has rendered with the target project's action,
  // rather than guessing at a timeout.
  useEffect(() => {
    if (duplicating !== null) {
      duplicateFormRef.current?.requestSubmit();
    }
  }, [duplicating]);

  const handleDuplicate = (projectId: string) => {
    setDuplicating({ id: projectId, key: createIdempotencyKey() });
  };

  const focusCreateField = () => {
    const input = titleInputRef.current;
    if (input === null) return;
    const reduceMotion = globalThis.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    input.scrollIntoView({
      block: "center",
      behavior: reduceMotion === true ? "auto" : "smooth",
    });
    input.focus();
  };

  const featuredProject = projects.length > 0 ? projects[0] : null;
  const remainingProjects = projects.length > 1 ? projects.slice(1) : [];

  const renderRecordMenu = (project: ProjectSummary, triggerLabel: string) => (
    <Menu
      triggerLabel={triggerLabel}
      items={[
        {
          label: "Duplicate lesson",
          icon: <Copy size={16} />,
          disabled: duplicating !== null,
          onClick: () => handleDuplicate(project.id),
        },
        {
          label: "Delete lesson",
          icon: <Trash size={16} />,
          destructive: true,
          disabled: duplicating !== null,
          onClick: () =>
            setProjectToDelete({ id: project.id, title: project.title }),
        },
      ]}
    />
  );

  return (
    <>
      {duplicating !== null && (
        <form
          ref={duplicateFormRef}
          action={`/api/projects/${encodeURIComponent(duplicating.id)}/duplicate`}
          method="post"
          hidden
        >
          <input type="hidden" name="idempotencyKey" value={duplicating.key} />
        </form>
      )}

      {projectToDelete && (
        <DeleteProjectDialog
          isOpen={true}
          projectId={projectToDelete.id}
          projectTitle={projectToDelete.title}
          onClose={() => setProjectToDelete(null)}
        />
      )}

      {error === "title" && (
        <Notice
          type="error"
          title="Invalid project title"
          message="Please enter a valid lesson title before continuing."
        />
      )}
      {error === "duplicate" && (
        <Notice
          type="error"
          title="Duplication failed"
          message="The project could not be duplicated. Please try again."
        />
      )}
      {error === "confirm-delete" && (
        <Notice
          type="warning"
          title="Confirmation required"
          message="Please confirm project deletion before proceeding."
        />
      )}
      {error === "delete" && (
        <Notice
          type="error"
          title="Deletion failed"
          message="The project could not be deleted. Please try again."
        />
      )}

      {/* Dominant action. See docs/design.md 10.3. */}
      <section
        aria-labelledby="create-lesson-heading"
        className={styles.createCard}
      >
        <div className={styles.createHeading}>
          <div className={styles.createIcon}>
            <Plus size={20} weight="bold" />
          </div>
          <div>
            <h2 id="create-lesson-heading" className={styles.createTitle}>
              Create new lesson
            </h2>
            <p className={styles.createHint}>
              Start by naming your lesson and uploading a teaching document.
            </p>
          </div>
        </div>

        <form action="/api/projects" method="post" className={styles.createForm}>
          <div className={styles.createField}>
            <Field
              id="project-title"
              label="Project title"
              required
              error={
                error === "title" && !projectTitle.trim()
                  ? "Enter a project title."
                  : undefined
              }
            >
              <input
                ref={titleInputRef}
                id="project-title"
                name="title"
                maxLength={160}
                required
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g. Photosynthesis and Plant Cells"
                className={styles.textInput}
              />
            </Field>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="default"
            leftIcon={<Plus weight="bold" />}
            style={{ height: "42px" }}
          >
            Create lesson
          </Button>
        </form>
      </section>

      {projects.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FolderDashed size={28} weight="duotone" />
          </div>
          <div>
            <h2 className={styles.emptyTitle}>No lessons created yet</h2>
            <p className={styles.emptyBody}>
              Start from a PDF or Word document of your teaching material. We
              keep your original figures and text, and turn them into an
              editable visual lesson.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="default"
            leftIcon={<Plus weight="bold" />}
            onClick={focusCreateField}
          >
            Create lesson
          </Button>
        </div>
      ) : (
        <>
          {featuredProject && (
            <section
              aria-labelledby="featured-lesson-heading"
              className={styles.section}
            >
              <h2 id="featured-lesson-heading" className={styles.sectionTitle}>
                Most recent lesson
              </h2>

              {(() => {
                const hasFailure =
                  featuredProject.latestFailedOperation !== null;
                const stageDetails = getStageDetails(
                  featuredProject.stage,
                  hasFailure,
                );
                // One source of truth with the per-stage pipeline rail, so the
                // board and the stage screens never name a different step.
                const stepIndex = getProjectStageIndex(featuredProject.stage);
                const stepNumber = stepIndex + 1;

                return (
                  <div className={styles.featuredCard}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardIdentity}>
                        <div className={styles.cardMeta}>
                          <StatusLabel
                            status={mapBadgeStatus(stageDetails.badgeStyle)}
                            label={stageDetails.label}
                            size="compact"
                          />
                          <span className={styles.metaText}>
                            Last modified{" "}
                            <time
                              dateTime={featuredProject.updatedAt}
                              className="tabular-nums"
                            >
                              {formatDateTime(featuredProject.updatedAt)}
                            </time>
                          </span>
                          {duplicating?.id === featuredProject.id && (
                            <span className={styles.metaText} role="status">
                              Duplicating…
                            </span>
                          )}
                        </div>

                        <h3 className={styles.featuredTitle}>
                          <a
                            href={stageDetails.nextActionPath(
                              featuredProject.id,
                            )}
                            className={styles.titleLink}
                          >
                            {featuredProject.title}
                          </a>
                        </h3>
                      </div>

                      <div className={styles.cardActions}>
                        <a
                          href={stageDetails.nextActionPath(featuredProject.id)}
                          className={styles.actionLinkPrimary}
                        >
                          {stageDetails.nextActionLabel}
                          <ArrowRight size={16} weight="bold" />
                        </a>

                        {renderRecordMenu(
                          featuredProject,
                          "Featured project actions",
                        )}
                      </div>
                    </div>

                    {hasFailure && (
                      <div className={styles.failureBanner} role="alert">
                        <WarningOctagon size={20} weight="fill" />
                        <div className={styles.failureBannerBody}>
                          <strong>Operation issue:</strong> Failed during{" "}
                          <code>{featuredProject.latestFailedOperation}</code>.
                        </div>
                        <a
                          href={stageDetails.nextActionPath(featuredProject.id)}
                          className={styles.actionLinkDestructive}
                        >
                          Resolve issue
                        </a>
                      </div>
                    )}

                    {/*
                     * Connectors are limited to one selected project.
                     * See docs/design.md 6.2.
                     */}
                    <div className={styles.progress}>
                      <div className={styles.progressHeader}>
                        <span className={styles.progressLabel}>
                          Lesson progress
                        </span>
                        <span className={styles.progressCount}>
                          Step{" "}
                          <span className="tabular-nums">{stepNumber}</span> of{" "}
                          <span className="tabular-nums">
                            {PIPELINE_STAGES.length}
                          </span>{" "}
                          · {PIPELINE_STAGES[stepIndex]?.label}
                        </span>
                      </div>
                      <div className={styles.progressTrack} aria-hidden="true">
                        {PIPELINE_STAGES.map((stage, index) => {
                          const state =
                            index < stepIndex
                              ? styles.progressStepPast
                              : index === stepIndex
                                ? styles.progressStepCurrent
                                : "";
                          return (
                            <span
                              key={stage.id}
                              className={`${styles.progressStep} ${state}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {remainingProjects.length > 0 && (
            <section
              aria-labelledby="all-lessons-heading"
              className={styles.section}
            >
              <h2 id="all-lessons-heading" className={styles.sectionTitle}>
                Other lessons
              </h2>

              <ul aria-label="Projects" className={styles.projectGrid}>
                {remainingProjects.map((project) => {
                  const hasFailure = project.latestFailedOperation !== null;
                  const details = getStageDetails(project.stage, hasFailure);

                  return (
                    <li key={project.id} className={styles.projectCard}>
                      <div className={styles.projectCardHead}>
                        <div className={styles.projectCardMeta}>
                          <StatusLabel
                            status={mapBadgeStatus(details.badgeStyle)}
                            label={details.label}
                            size="compact"
                          />
                          {renderRecordMenu(
                            project,
                            `${project.title} actions`,
                          )}
                        </div>

                        <h3 className={styles.projectTitle}>
                          <a
                            href={details.nextActionPath(project.id)}
                            className={styles.titleLink}
                          >
                            {project.title}
                          </a>
                        </h3>

                        <span className={styles.metaText}>
                          Last modified{" "}
                          <time
                            dateTime={project.updatedAt}
                            className="tabular-nums"
                          >
                            {formatDateTime(project.updatedAt)}
                          </time>
                        </span>

                        {duplicating?.id === project.id && (
                          <span className={styles.metaText} role="status">
                            Duplicating…
                          </span>
                        )}

                        {hasFailure && (
                          <span className={styles.failureInline} role="status">
                            <WarningOctagon size={14} weight="bold" />
                            <span>Failed: {project.latestFailedOperation}</span>
                          </span>
                        )}
                      </div>

                      <div className={styles.cardFooter}>
                        <a
                          href={details.nextActionPath(project.id)}
                          className={`${styles.actionLinkSecondary} ${styles.actionLinkCompact}`}
                        >
                          {details.nextActionLabel}
                          <ArrowRight size={14} weight="bold" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {nextCursor ? (
            <div className={styles.pagination}>
              <a
                href={`/workspace?cursor=${encodeURIComponent(nextCursor)}`}
                className={styles.actionLinkSecondary}
                style={{ width: "auto" }}
              >
                Load more lessons
              </a>
            </div>
          ) : (
            projects.length > 0 && (
              <p className={styles.paginationEnd}>Showing all lessons</p>
            )
          )}
        </>
      )}
    </>
  );
}
