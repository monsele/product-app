"use client";

import { type JSX } from "react";
import Link from "next/link";
import { type LessonValidationRun, type ValidationIssue } from "@avlp/schemas";

const labels: Record<string, string> = {
  lesson: "Lesson",
  scene: "Scenes",
  audio: "Audio",
  captions: "Captions",
  asset: "Assets",
  grounding: "Grounding",
};

export function groupValidationIssues(
  issues: readonly ValidationIssue[],
): ReadonlyMap<string, readonly ValidationIssue[]> {
  const groups = new Map<string, ValidationIssue[]>();
  for (const issue of issues)
    groups.set(issue.scopeType, [
      ...(groups.get(issue.scopeType) ?? []),
      issue,
    ]);
  return groups;
}

export function ValidationPanel({
  projectId,
  run,
  onRun,
  onAcknowledge,
  onNavigate,
  busy,
}: {
  projectId: string;
  run: LessonValidationRun | null;
  onRun: () => void;
  onAcknowledge: (issueId: string, inputHash: string) => void;
  onNavigate: (sceneId: string | null) => void;
  busy: boolean;
}): JSX.Element {
  if (run === null)
    return (
      <section
        aria-labelledby="validation-heading"
        style={{
          padding: "16px",
          backgroundColor: "var(--color-surface, #211A2B)",
          borderRadius: "8px",
          border: "1px solid var(--color-border, #3A3046)",
        }}
      >
        <h2 id="validation-heading" style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
          Lesson checks
        </h2>
        <p role="status" style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--color-text-muted, #BDB5C7)" }}>
          Run lesson checks before rendering.
        </p>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          style={{
            padding: "8px 14px",
            borderRadius: "6px",
            backgroundColor: "var(--color-brand, #A883FF)",
            color: "var(--color-on-brand, #1B1027)",
            border: "none",
            fontSize: "13px",
            fontWeight: 600,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Run checks
        </button>
      </section>
    );

  const errors = run.issues.filter((issue) => issue.severity === "error");
  const warnings = run.issues.filter((issue) => issue.severity === "warning");
  const grouped = groupValidationIssues([...errors, ...warnings]);

  return (
    <section
      aria-labelledby="validation-heading"
      data-testid="validation-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        backgroundColor: "var(--color-surface, #211A2B)",
        borderRadius: "8px",
        border: "1px solid var(--color-border, #3A3046)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <h2 id="validation-heading" style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
          Lesson checks
        </h2>
        <button
          type="button"
          onClick={onRun}
          disabled={busy}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            border: "1px solid var(--color-border, #3A3046)",
            color: "var(--color-text, #F4F1F8)",
            fontSize: "12px",
            fontWeight: 500,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Checking…" : "Run checks again"}
        </button>
      </div>

      <div
        style={{
          padding: "10px 12px",
          borderRadius: "6px",
          backgroundColor: run.stale
            ? "rgba(138, 75, 8, 0.15)"
            : errors.length > 0
              ? "rgba(180, 35, 24, 0.15)"
              : "rgba(23, 107, 70, 0.15)",
          border: `1px solid ${
            run.stale
              ? "rgba(138, 75, 8, 0.3)"
              : errors.length > 0
                ? "rgba(180, 35, 24, 0.3)"
                : "rgba(23, 107, 70, 0.3)"
          }`,
        }}
      >
        <p
          role={run.stale ? "alert" : "status"}
          style={{
            margin: 0,
            fontSize: "13px",
            fontWeight: 500,
            color: run.stale
              ? "var(--color-warning-fg, #FBBF24)"
              : errors.length > 0
                ? "#FCA5A5"
                : "#86EFAC",
          }}
        >
          {run.stale
            ? "These results are out of date and cannot be used for rendering. Run checks again."
            : errors.length > 0
              ? `${errors.length} blocking issue${errors.length === 1 ? "" : "s"} must be fixed before rendering.`
              : "Ready for rendering."}
        </p>
      </div>

      {[...grouped].map(([group, issues]) => (
        <section
          key={group}
          aria-label={`${labels[group] ?? group} issues`}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-text-muted, #BDB5C7)" }}>
            {labels[group] ?? group}
          </h3>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {issues.map((issue) => (
              <li
                key={issue.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  backgroundColor: "var(--color-surface-subtle, #292035)",
                  border: "1px solid var(--color-border, #3A3046)",
                  fontSize: "13px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                  <strong
                    style={{
                      color:
                        issue.severity === "error"
                          ? "#FCA5A5"
                          : "var(--color-warning-fg, #FBBF24)",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginTop: "1px",
                      flexShrink: 0,
                    }}
                  >
                    {issue.severity === "error" ? "Fix required" : "Warning"}:
                  </strong>
                  <span style={{ color: "var(--color-text, #F4F1F8)" }}>{issue.message}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                  {issue.sceneId !== null ? (
                    <button
                      type="button"
                      onClick={() => onNavigate(issue.sceneId)}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        border: "1px solid var(--color-border, #3A3046)",
                        color: "var(--color-brand, #A883FF)",
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      Open affected scene
                    </button>
                  ) : issue.scopeType === "objective" ? (
                    <Link
                      href={`/workspace/${encodeURIComponent(projectId)}/objectives`}
                      prefetch={true}
                      style={{ color: "var(--color-brand, #A883FF)", fontSize: "12px", textDecoration: "none" }}
                    >
                      Review learning objectives
                    </Link>
                  ) : issue.scopeType === "lesson" ? (
                    <a href="#scenes" style={{ color: "var(--color-brand, #A883FF)", fontSize: "12px", textDecoration: "none" }}>
                      Review scene durations
                    </a>
                  ) : (
                    <a href="#storyboard-heading" style={{ color: "var(--color-brand, #A883FF)", fontSize: "12px", textDecoration: "none" }}>
                      Review storyboard
                    </a>
                  )}

                  {issue.acknowledgeable &&
                  issue.acknowledgedAt === null &&
                  !run.stale ? (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(issue.id, run.inputHash)}
                      disabled={busy}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        color: "#FCD34D",
                        fontSize: "12px",
                        cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      Acknowledge warning
                    </button>
                  ) : null}

                  {issue.acknowledgedAt !== null ? (
                    <span style={{ fontSize: "12px", color: "var(--color-success-fg, #86EFAC)" }}>
                      {" "}
                      Acknowledged.
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
