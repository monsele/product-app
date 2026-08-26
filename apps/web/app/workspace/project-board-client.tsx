"use client";

import React, { useState, useRef } from "react";
import type { ProjectSummary } from "@avlp/schemas";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { StatusLabel, type StatusType } from "../../components/ui/status-label";
import { Menu } from "../../components/ui/menu";
import { Notice } from "../../components/ui/notice";
import { DeleteProjectDialog } from "./delete-project-dialog";
import {
  getStageDetails,
  formatDateTime,
} from "./project-stage-utils";
import {
  Plus,
  ArrowRight,
  Copy,
  Trash,
  Sparkle,
  WarningOctagon,
  FolderDashed,
} from "@phosphor-icons/react";

export interface ProjectBoardClientProps {
  projects: ProjectSummary[];
  nextCursor?: string | undefined;
  error?: string | undefined;
}

const PIPELINE_STEP_LABELS = [
  "Source",
  "Review",
  "Setup",
  "Objectives",
  "Outline",
  "Script",
  "Storyboard",
  "Preview",
  "Deliver",
] as const;

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

  const duplicateFormRef = useRef<HTMLFormElement>(null);
  const [duplicateProjectId, setDuplicateProjectId] = useState<string>("");
  const [duplicateKey, setDuplicateKey] = useState<string>("");

  const handleDuplicate = (projectId: string) => {
    const key =
      typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setDuplicateProjectId(projectId);
    setDuplicateKey(key);
    globalThis.setTimeout(() => {
      if (duplicateFormRef.current) {
        duplicateFormRef.current.submit();
      }
    }, 50);
  };

  const featuredProject = projects.length > 0 ? projects[0] : null;
  const remainingProjects = projects.length > 1 ? projects.slice(1) : [];

  const mapBadgeStatus = (badgeStyle: string): StatusType => {
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
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* Hidden Duplicate Form */}
      {duplicateProjectId && (
        <form
          ref={duplicateFormRef}
          action={`/api/projects/${encodeURIComponent(duplicateProjectId)}/duplicate`}
          method="post"
          style={{ display: "none" }}
        >
          <input type="hidden" name="idempotencyKey" value={duplicateKey} />
        </form>
      )}

      {/* Delete Dialog */}
      {projectToDelete && (
        <DeleteProjectDialog
          isOpen={true}
          projectId={projectToDelete.id}
          projectTitle={projectToDelete.title}
          onClose={() => setProjectToDelete(null)}
        />
      )}

      {/* Workspace Error Notices */}
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

      {/* Dominant Action: Create Lesson Surface */}
      <section
        aria-labelledby="create-lesson-heading"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-card)",
          padding: "24px 28px",
          boxShadow: "var(--shadow-elevation)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface-brand)",
              color: "var(--color-brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plus size={20} weight="bold" />
          </div>
          <div>
            <h2
              id="create-lesson-heading"
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}
            >
              Create new lesson
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "13px",
                color: "var(--color-text-muted)",
              }}
            >
              Start by naming your lesson and uploading a teaching document.
            </p>
          </div>
        </div>

        <form
          action="/api/projects"
          method="post"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: "240px" }}>
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
                id="project-title"
                name="title"
                maxLength={160}
                required
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                placeholder="e.g. Photosynthesis and Plant Cells"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: "14px",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-control)",
                  backgroundColor: "var(--color-surface-subtle)",
                  color: "var(--color-text)",
                  boxSizing: "border-box",
                }}
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

      {/* Empty State */}
      {projects.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px dashed var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              backgroundColor: "var(--color-surface-brand)",
              color: "var(--color-brand)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FolderDashed size={28} weight="duotone" />
          </div>
          <div>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              No lessons created yet
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "var(--color-text-muted)",
                maxWidth: "420px",
                lineHeight: "22px",
              }}
            >
              Create your first project above to upload a source PDF or Word document
              and begin generating your interactive visual lesson.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Featured Project */}
          {featuredProject && (
            <section
              aria-labelledby="featured-lesson-heading"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Sparkle
                    size={16}
                    weight="fill"
                    style={{ color: "var(--color-brand)" }}
                  />
                  <span
                    id="featured-lesson-heading"
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--color-brand)",
                    }}
                  >
                    Recently Active Lesson
                  </span>
                </div>
              </div>

              {(() => {
                const hasFailure =
                  featuredProject.latestFailedOperation !== null;
                const stageDetails = getStageDetails(
                  featuredProject.stage,
                  hasFailure,
                );

                return (
                  <div
                    style={{
                      backgroundColor: "var(--color-surface)",
                      border: "2px solid var(--color-surface-brand)",
                      borderRadius: "var(--radius-card)",
                      padding: "24px",
                      boxShadow: "var(--shadow-elevation)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "16px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          flex: "1 1 300px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <StatusLabel
                            status={mapBadgeStatus(stageDetails.badgeStyle)}
                            label={stageDetails.label}
                            size="compact"
                          />
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            Last modified{" "}
                            <time dateTime={featuredProject.updatedAt}>
                              {formatDateTime(featuredProject.updatedAt)}
                            </time>
                          </span>
                        </div>

                        <h3
                          style={{
                            margin: 0,
                            fontSize: "22px",
                            fontWeight: 700,
                            letterSpacing: "-0.01em",
                            color: "var(--color-text)",
                          }}
                        >
                          <a
                            href={stageDetails.nextActionPath(
                              featuredProject.id,
                            )}
                            style={{
                              color: "inherit",
                              textDecoration: "none",
                            }}
                          >
                            {featuredProject.title}
                          </a>
                        </h3>
                      </div>

                      {/* Top Right Actions */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <a
                          href={stageDetails.nextActionPath(featuredProject.id)}
                          style={{ textDecoration: "none" }}
                        >
                          <Button
                            variant="primary"
                            size="default"
                            rightIcon={<ArrowRight weight="bold" />}
                          >
                            {stageDetails.nextActionLabel}
                          </Button>
                        </a>

                        <Menu
                          triggerLabel="Featured project actions"
                          items={[
                            {
                              label: "Duplicate lesson",
                              icon: <Copy size={16} />,
                              onClick: () =>
                                handleDuplicate(featuredProject.id),
                            },
                            {
                              label: "Delete lesson",
                              icon: <Trash size={16} />,
                              destructive: true,
                              onClick: () =>
                                setProjectToDelete({
                                  id: featuredProject.id,
                                  title: featuredProject.title,
                                }),
                            },
                          ]}
                        />
                      </div>
                    </div>

                    {/* Failure Notice for Featured Project */}
                    {hasFailure && (
                      <div
                        style={{
                          backgroundColor: "var(--color-error-bg)",
                          border: "1px solid var(--color-error-border)",
                          borderRadius: "var(--radius-control)",
                          padding: "12px 16px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          color: "var(--color-error-fg)",
                          fontSize: "13px",
                        }}
                        role="alert"
                      >
                        <WarningOctagon size={20} weight="fill" />
                        <div style={{ flex: 1 }}>
                          <strong>Operation issue:</strong> Failed during{" "}
                          <code>{featuredProject.latestFailedOperation}</code>.
                        </div>
                        <a
                          href={stageDetails.nextActionPath(featuredProject.id)}
                          style={{ textDecoration: "none" }}
                        >
                          <Button variant="destructive" size="compact">
                            Resolve Issue
                          </Button>
                        </a>
                      </div>
                    )}

                    {/* Stage Pipeline Connectors (Single project only) */}
                    <div
                      style={{
                        borderTop: "1px solid var(--color-border)",
                        paddingTop: "16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--color-text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.03em",
                        }}
                      >
                        Lesson Progress
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          overflowX: "auto",
                          paddingBottom: "4px",
                        }}
                      >
                        {PIPELINE_STEP_LABELS.map((stepLabel, idx) => {
                          const isPast = idx < stageDetails.stepIndex;
                          const isCurrent = idx === stageDetails.stepIndex;
                          return (
                            <React.Fragment key={stepLabel}>
                              <div
                                style={{
                                  padding: "4px 10px",
                                  borderRadius: "var(--radius-pill)",
                                  fontSize: "12px",
                                  fontWeight: isCurrent ? 600 : 500,
                                  whiteSpace: "nowrap",
                                  backgroundColor: isCurrent
                                    ? "var(--color-surface-brand)"
                                    : isPast
                                      ? "var(--color-surface-subtle)"
                                      : "transparent",
                                  color: isCurrent
                                    ? "var(--color-brand)"
                                    : isPast
                                      ? "var(--color-text)"
                                      : "var(--color-text-muted)",
                                  border: isCurrent
                                    ? "1px solid var(--color-brand)"
                                    : "1px solid var(--color-border)",
                                }}
                              >
                                {stepLabel}
                              </div>
                              {idx < PIPELINE_STEP_LABELS.length - 1 && (
                                <div
                                  style={{
                                    height: "1px",
                                    width: "12px",
                                    backgroundColor: isPast
                                      ? "var(--color-brand)"
                                      : "var(--color-border)",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {/* Remaining Projects */}
          {remainingProjects.length > 0 && (
            <section
              aria-labelledby="all-lessons-heading"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <h3
                id="all-lessons-heading"
                style={{
                  margin: 0,
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  letterSpacing: "-0.01em",
                }}
              >
                Other lessons
              </h3>

              <ul
                aria-label="Projects"
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: "16px",
                }}
              >
                {remainingProjects.map((project) => {
                  const hasFailure = project.latestFailedOperation !== null;
                  const details = getStageDetails(project.stage, hasFailure);

                  return (
                    <li
                      key={project.id}
                      style={{
                        backgroundColor: "var(--color-surface)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-card)",
                        padding: "18px 20px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: "16px",
                        transition:
                          "border-color var(--motion-quick) var(--motion-easing)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                          }}
                        >
                          <StatusLabel
                            status={mapBadgeStatus(details.badgeStyle)}
                            label={details.label}
                            size="compact"
                          />
                          <Menu
                            triggerLabel={`${project.title} actions`}
                            items={[
                              {
                                label: "Duplicate lesson",
                                icon: <Copy size={16} />,
                                onClick: () => handleDuplicate(project.id),
                              },
                              {
                                label: "Delete lesson",
                                icon: <Trash size={16} />,
                                destructive: true,
                                onClick: () =>
                                  setProjectToDelete({
                                    id: project.id,
                                    title: project.title,
                                  }),
                              },
                            ]}
                          />
                        </div>

                        <h4
                          style={{
                            margin: 0,
                            fontSize: "16px",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            lineHeight: "22px",
                          }}
                        >
                          <a
                            href={details.nextActionPath(project.id)}
                            style={{
                              color: "inherit",
                              textDecoration: "none",
                            }}
                          >
                            {project.title}
                          </a>
                        </h4>

                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          Last modified{" "}
                          <time dateTime={project.updatedAt}>
                            {formatDateTime(project.updatedAt)}
                          </time>
                        </span>

                        {hasFailure && (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "var(--color-error-fg)",
                              display: "flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            role="status"
                          >
                            <WarningOctagon size={14} weight="bold" />
                            <span>Failed: {project.latestFailedOperation}</span>
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          borderTop: "1px solid var(--color-surface-subtle)",
                          paddingTop: "12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <a
                          href={details.nextActionPath(project.id)}
                          style={{ textDecoration: "none", width: "100%" }}
                        >
                          <Button
                            variant="secondary"
                            size="compact"
                            rightIcon={<ArrowRight size={14} />}
                            style={{ width: "100%" }}
                          >
                            {details.nextActionLabel}
                          </Button>
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Pagination Controls */}
          {nextCursor ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "16px 0",
              }}
            >
              <a
                href={`/workspace?cursor=${encodeURIComponent(nextCursor)}`}
                style={{ textDecoration: "none" }}
              >
                <Button variant="secondary" size="default">
                  Load more lessons
                </Button>
              </a>
            </div>
          ) : (
            projects.length > 0 && (
              <div
                style={{
                  textAlign: "center",
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  padding: "12px 0",
                }}
              >
                Showing all lessons
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
