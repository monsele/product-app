"use client";

import React, { useEffect, useState, type JSX } from "react";
import type {
  LessonValidationRun,
  StoryboardSceneDetailResponse,
  ValidationIssue,
} from "@avlp/schemas";
import { SceneMutationError, updateStoryboardScene } from "./storyboard-scene-query";

/** Grounding findings a teacher can resolve from this scene's content. */
const sceneGroundingCodes: ReadonlySet<ValidationIssue["code"]> = new Set([
  "grounding_unsupported_claim",
  "grounding_recheck_required",
]);

/**
 * The flagged sentences of one scene from the latest validation run: each
 * quoted claim the source did not clearly support, so the teacher sees it next
 * to the narration and either edits it or keeps it.
 */
export function sceneGroundingFlags(
  validation: LessonValidationRun | null | undefined,
  sceneId: string,
): readonly ValidationIssue[] {
  if (validation === null || validation === undefined || validation.stale)
    return [];
  return validation.issues.filter(
    (issue) =>
      issue.sceneId === sceneId &&
      sceneGroundingCodes.has(issue.code) &&
      typeof issue.details.claimText === "string" &&
      issue.details.claimText !== "",
  );
}

function claimText(issue: ValidationIssue): string {
  return typeof issue.details.claimText === "string"
    ? issue.details.claimText
    : "";
}

function claimReasons(issue: ValidationIssue): readonly string[] {
  return Array.isArray(issue.details.reasons)
    ? issue.details.reasons.filter(
        (reason): reason is string => typeof reason === "string",
      )
    : [];
}

export function SceneNarrationEditor({
  projectId,
  detail,
  revision,
  disabled,
  validation,
  onAcknowledge,
  onPersisted,
}: {
  projectId: string;
  detail: StoryboardSceneDetailResponse;
  revision: number;
  disabled: boolean;
  validation?: LessonValidationRun | null;
  onAcknowledge?: (issueId: string, inputHash: string) => void;
  onPersisted: (message?: string) => void;
}): JSX.Element {
  const scene = detail.scene.scene;
  const [narration, setNarration] = useState(scene.narration);
  const [onScreen, setOnScreen] = useState(scene.onScreenText.join("\n"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setNarration(scene.narration);
    setOnScreen(scene.onScreenText.join("\n"));
    setMessage(null);
  }, [scene.narration, scene.onScreenText]);

  const onScreenLines = onScreen
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const changed =
    narration !== scene.narration ||
    onScreenLines.join("\n") !== scene.onScreenText.join("\n");
  const flags = sceneGroundingFlags(validation, detail.scene.stableSceneId);
  const openFlags = flags.filter((issue) => issue.acknowledgedAt === null);

  const save = async (): Promise<void> => {
    if (narration.trim() === "") {
      setMessage("Narration cannot be empty.");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await updateStoryboardScene(
        projectId,
        detail.scene.stableSceneId,
        { ...scene, narration: narration.trim(), onScreenText: onScreenLines },
        revision,
      );
      onPersisted(
        result.warning ??
          "Saved. The scene's audio and checks will be redone; run checks again to confirm the fix.",
      );
    } catch (error) {
      const mutation = error instanceof SceneMutationError ? error : null;
      setMessage(
        mutation === null
          ? "The scene could not be saved."
          : [mutation.message, ...Object.values(mutation.fields)].join(" "),
      );
    } finally {
      setSaving(false);
    }
  };

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    backgroundColor: "var(--color-surface, #211A2B)",
    border: "1px solid var(--color-border, #3A3046)",
    borderRadius: "6px",
    color: "var(--color-text, #F4F1F8)",
    padding: "8px 10px",
    fontSize: "13px",
    lineHeight: 1.5,
    fontFamily: "inherit",
    resize: "vertical" as const,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {flags.length > 0 ? (
        <section
          aria-label="Sentences to check"
          style={{
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid rgba(245, 158, 11, 0.35)",
            backgroundColor: "rgba(245, 158, 11, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <h4 style={{ margin: 0, fontSize: "13px", color: "#FCD34D" }}>
            {openFlags.length === 0
              ? "You kept every flagged sentence in this scene."
              : `${openFlags.length} sentence${openFlags.length === 1 ? "" : "s"} not clearly backed by your document`}
          </h4>
          <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
            Edit the text below, or keep a sentence if you&apos;re sure it&apos;s right. Neither stops you rendering.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            {flags.map((issue) => (
              <li
                key={issue.id}
                data-testid={`grounding-flag-${issue.id}`}
                style={{ display: "flex", flexDirection: "column", gap: "4px" }}
              >
                <q style={{ fontSize: "13px", color: "var(--color-text, #F4F1F8)" }}>
                  {claimText(issue)}
                </q>
                {claimReasons(issue).map((reason) => (
                  <span key={reason} style={{ fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
                    {reason}
                  </span>
                ))}
                <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  {issue.acknowledgedAt !== null ? (
                    <span style={{ fontSize: "12px", color: "var(--color-success-fg, #86EFAC)" }}>
                      Kept as is.
                    </span>
                  ) : onAcknowledge !== undefined && validation ? (
                    <button
                      type="button"
                      disabled={disabled || saving}
                      onClick={() => onAcknowledge(issue.id, validation.inputHash)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "4px",
                        backgroundColor: "rgba(245, 158, 11, 0.15)",
                        border: "1px solid rgba(245, 158, 11, 0.3)",
                        color: "#FCD34D",
                        fontSize: "12px",
                        cursor: disabled || saving ? "not-allowed" : "pointer",
                      }}
                    >
                      Keep it
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted, #BDB5C7)" }}>
          Narration script
        </span>
        <textarea
          data-testid={`scene-narration-${detail.scene.stableSceneId}`}
          value={narration}
          disabled={disabled || saving}
          onChange={(event) => setNarration(event.target.value)}
          rows={6}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted, #BDB5C7)" }}>
          On-screen text (one line each)
        </span>
        <textarea
          value={onScreen}
          disabled={disabled || saving}
          onChange={(event) => setOnScreen(event.target.value)}
          rows={3}
          style={fieldStyle}
        />
      </label>

      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <button
          type="button"
          data-testid={`scene-narration-save-${detail.scene.stableSceneId}`}
          disabled={disabled || saving || !changed}
          onClick={() => void save()}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            backgroundColor: "var(--color-brand, #A883FF)",
            color: "var(--color-on-brand, #1B1027)",
            border: "none",
            fontSize: "12px",
            fontWeight: 600,
            cursor: disabled || saving || !changed ? "not-allowed" : "pointer",
            opacity: !changed ? 0.6 : 1,
          }}
        >
          {saving ? "Saving…" : "Save text"}
        </button>
        {changed ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setNarration(scene.narration);
              setOnScreen(scene.onScreenText.join("\n"));
            }}
            style={{
              padding: "6px 10px",
              borderRadius: "6px",
              background: "transparent",
              border: "1px solid var(--color-border, #3A3046)",
              color: "var(--color-text-muted, #BDB5C7)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Undo changes
          </button>
        ) : null}
      </div>
      {message !== null ? (
        <p role="alert" style={{ margin: 0, fontSize: "12px", color: "#FCA5A5" }}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
