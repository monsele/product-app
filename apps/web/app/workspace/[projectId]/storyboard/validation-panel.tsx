"use client";

import { type JSX } from "react";
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
      <section aria-labelledby="validation-heading">
        <h2 id="validation-heading">Lesson checks</h2>
        <p role="status">Run lesson checks before rendering.</p>
        <button type="button" onClick={onRun} disabled={busy}>
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
    >
      <h2 id="validation-heading">Lesson checks</h2>
      <p role={run.stale ? "alert" : "status"}>
        {run.stale
          ? "These results are out of date and cannot be used for rendering. Run checks again."
          : errors.length > 0
            ? `${errors.length} blocking issue${errors.length === 1 ? "" : "s"} must be fixed before rendering.`
            : "Ready for rendering."}
      </p>
      <button type="button" onClick={onRun} disabled={busy}>
        {busy ? "Checking…" : "Run checks again"}
      </button>
      {[...grouped].map(([group, issues]) => (
        <section key={group} aria-label={`${labels[group] ?? group} issues`}>
          <h3>{labels[group] ?? group}</h3>
          <ul>
            {issues.map((issue) => (
              <li key={issue.id}>
                <strong>
                  {issue.severity === "error" ? "Fix required" : "Warning"}:
                </strong>{" "}
                {issue.message}{" "}
                {issue.sceneId !== null ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(issue.sceneId)}
                  >
                    Open affected scene
                  </button>
                ) : issue.scopeType === "objective" ? (
                  <a
                    href={`/workspace/${encodeURIComponent(projectId)}/objectives`}
                  >
                    Review learning objectives
                  </a>
                ) : issue.scopeType === "lesson" ? (
                  <a href="#scenes">Review scene durations</a>
                ) : (
                  <a href="#storyboard-heading">Review storyboard</a>
                )}{" "}
                {issue.acknowledgeable &&
                issue.acknowledgedAt === null &&
                !run.stale ? (
                  <button
                    type="button"
                    onClick={() => onAcknowledge(issue.id, run.inputHash)}
                    disabled={busy}
                  >
                    Acknowledge warning
                  </button>
                ) : null}{" "}
                {issue.acknowledgedAt !== null ? (
                  <span> Acknowledged.</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  );
}
