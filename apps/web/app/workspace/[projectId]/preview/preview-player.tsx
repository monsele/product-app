"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FullLessonPreviewPlayer } from "@avlp/scene-library";
import {
  lessonValidationRunSchema,
  previewManifestSchema,
  type LessonValidationRun,
  type PreviewManifest,
  type ValidationIssue,
} from "@avlp/schemas";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

const templateDisplayNames: Record<string, string> = {
  hook: "Hook & Question",
  definition: "Definition",
  process: "Process & Sequence",
  "input-process-output": "Input-Process-Output",
  comparison: "Comparison",
  "cause-and-effect": "Cause & Effect",
  "labelled-diagram": "Labelled Diagram",
  analogy: "Analogy",
  "worked-example": "Worked Example",
  summary: "Summary",
};

const scopeLabels: Record<string, string> = {
  lesson: "Lesson",
  scene: "Scenes",
  audio: "Audio",
  captions: "Captions",
  asset: "Assets",
  grounding: "Grounding",
};

function formatSecondsToTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function FullLessonPreview({
  projectId,
  initialManifest,
  projectTitle,
}: {
  projectId: string;
  initialManifest: unknown;
  projectTitle?: string;
}) {
  const [quality, setQuality] = useState<"standard" | "low">("standard");
  const [manifest, setManifest] = useState(initialManifest as PreviewManifest);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Preflight validation state
  const [validation, setValidation] = useState<LessonValidationRun | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadValidation = useCallback(async () => {
    setValidationLoading(true);
    setValidationError(null);
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/validation`),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const candidate =
        typeof payload === "object" && payload !== null && "run" in payload
          ? payload.run
          : null;
      if (
        !response.ok ||
        (candidate !== null &&
          !lessonValidationRunSchema.safeParse(candidate).success)
      ) {
        throw new Error("Unable to load validation status.");
      }
      setValidation(
        candidate === null ? null : lessonValidationRunSchema.parse(candidate),
      );
    } catch {
      // Non-blocking: validation might not have run yet
      setValidation(null);
    } finally {
      setValidationLoading(false);
    }
  }, [projectId]);

  const runValidation = useCallback(async () => {
    setValidationLoading(true);
    setValidationError(null);
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/validation/run`),
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = lessonValidationRunSchema.safeParse(payload);
      if (!response.ok || !parsed.success) {
        throw new Error("Unable to run lesson checks.");
      }
      setValidation(parsed.data);
    } catch (error) {
      setValidationError(
        error instanceof Error ? error.message : "Unable to run checks.",
      );
    } finally {
      setValidationLoading(false);
    }
  }, [projectId]);

  const acknowledgeValidation = useCallback(
    async (issueId: string, inputHash: string) => {
      setValidationLoading(true);
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/validation/issues/${encodeURIComponent(issueId)}/acknowledge`,
          ),
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ inputHash }),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        const parsed = lessonValidationRunSchema.safeParse(payload);
        if (!response.ok || !parsed.success) {
          throw new Error("Unable to acknowledge warning.");
        }
        setValidation(parsed.data);
      } catch (error) {
        setValidationError(
          error instanceof Error
            ? error.message
            : "Unable to acknowledge warning.",
        );
      } finally {
        setValidationLoading(false);
      }
    },
    [projectId],
  );

  const refreshSignedUrls = useCallback(async () => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/preview-manifest?quality=${quality}`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      if (!response.ok) throw new Error();
      const parsed = previewManifestSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error();
      setManifest(parsed.data);
    } catch {
      setRefreshError("Preview media could not be renewed. Please try again.");
    } finally {
      setRefreshing(false);
    }
  }, [projectId, quality]);

  useEffect(() => {
    void refreshSignedUrls();
    void loadValidation();
  }, [refreshSignedUrls, loadValidation]);

  const input = useMemo(() => {
    const offsetByStableSceneId = new Map<string, number>();
    const compositionSceneIdByStableId = new Map<string, string>();
    let offset = 0;
    for (const entry of manifest.storyboard.scenes) {
      offsetByStableSceneId.set(entry.stableSceneId, offset);
      compositionSceneIdByStableId.set(entry.stableSceneId, entry.scene.id);
      offset += Math.round(entry.scene.durationSeconds * manifest.canvas.fps);
    }
    return {
      lesson: {
        scenes: manifest.storyboard.scenes.map((entry) => entry.scene),
      },
      assets: manifest.assets,
      narrationTracks: manifest.storyboard.scenes.map((entry) => {
        const audio = manifest.scenes.find(
          (candidate) => candidate.sceneId === entry.stableSceneId,
        )?.audio;
        return audio?.url === null || audio?.url === undefined
          ? { kind: "deterministic-silence" as const, sceneId: entry.scene.id }
          : {
              kind: "browser-audio" as const,
              sceneId: entry.scene.id,
              src: audio.url,
            };
      }),
      captions: manifest.scenes.flatMap((entry) =>
        entry.captions.map((cue) => ({
          sceneId:
            compositionSceneIdByStableId.get(entry.sceneId) ?? entry.sceneId,
          startFrame:
            (offsetByStableSceneId.get(entry.sceneId) ?? 0) +
            Math.round((cue.startMs * manifest.canvas.fps) / 1_000),
          endFrame:
            (offsetByStableSceneId.get(entry.sceneId) ?? 0) +
            Math.round((cue.endMs * manifest.canvas.fps) / 1_000),
          text: cue.text,
        })),
      ),
    };
  }, [manifest]);

  const stale = manifest.scenes.filter((entry) => entry.stale);
  const totalDurationSeconds = manifest.storyboard.scenes.reduce(
    (sum, s) => sum + s.scene.durationSeconds,
    0,
  );

  const errors = validation?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings =
    validation?.issues.filter((i) => i.severity === "warning") ?? [];
  const isStaleValidation = validation?.stale === true;
  const isReadyToRender =
    validation !== null &&
    !isStaleValidation &&
    errors.length === 0 &&
    stale.length === 0 &&
    !refreshing &&
    !validationLoading;

  // Group validation issues by scope
  const groupedIssues = useMemo(() => {
    const map = new Map<string, ValidationIssue[]>();
    if (!validation) return map;
    for (const issue of validation.issues) {
      const list = map.get(issue.scopeType) ?? [];
      list.push(issue);
      map.set(issue.scopeType, list);
    }
    return map;
  }, [validation]);

  return (
    <div
      data-quality={quality}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "24px 16px 64px",
        width: "100%",
        maxWidth: "1440px",
        margin: "0 auto",
      }}
    >
      {/* Top Theater Header & Controls */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "16px 20px",
          backgroundColor: "var(--color-surface, #211A2B)",
          borderRadius: "12px",
          border: "1px solid var(--color-border, #3A3046)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <a
            href={`/workspace/${encodeURIComponent(projectId)}/storyboard`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid var(--color-border, #3A3046)",
              color: "var(--color-text, #F4F1F8)",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 500,
              transition: "background 0.15s ease",
            }}
          >
            ← Back to storyboard
          </a>

          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--color-text, #F4F1F8)",
                letterSpacing: "-0.01em",
              }}
            >
              Lesson preview
            </h1>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "13px",
                color: "var(--color-text-muted, #BDB5C7)",
              }}
            >
              {projectTitle ? `${projectTitle} • ` : ""}
              {manifest.storyboard.scenes.length} scene
              {manifest.storyboard.scenes.length === 1 ? "" : "s"} •{" "}
              {formatSecondsToTime(totalDurationSeconds)} total • Focus Studio Theater
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {/* Quality Mode Selector */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "var(--color-text-muted, #BDB5C7)",
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--color-border, #3A3046)",
            }}
          >
            <span>Preview quality</span>
            <select
              value={quality}
              onChange={(event) =>
                setQuality(event.target.value as "standard" | "low")
              }
              aria-label="Preview quality"
              style={{
                backgroundColor: "var(--color-surface-raised, #292035)",
                color: "var(--color-text, #F4F1F8)",
                border: "1px solid var(--color-border, #3A3046)",
                borderRadius: "6px",
                padding: "4px 8px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <option value="standard">Standard (1080p)</option>
              <option value="low">Lower quality (540p)</option>
            </select>
          </label>

          {/* Refresh Media Button */}
          <button
            disabled={refreshing}
            onClick={() => void refreshSignedUrls()}
            type="button"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "8px",
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid var(--color-border, #3A3046)",
              color: "var(--color-text, #F4F1F8)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: refreshing ? "not-allowed" : "pointer",
            }}
          >
            {refreshing ? "Refreshing preview media…" : "Refresh preview media"}
          </button>

          {/* Render Lesson Primary Action */}
          {isReadyToRender ? (
            <a
              href={`/workspace/${encodeURIComponent(projectId)}/render`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 18px",
                borderRadius: "8px",
                backgroundColor: "var(--color-brand, #A883FF)",
                color: "var(--color-on-brand, #1B1027)",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 600,
                boxShadow: "0 2px 10px rgba(168, 131, 255, 0.3)",
              }}
            >
              Render lesson →
            </a>
          ) : (
            <button
              disabled
              title={
                stale.length > 0
                  ? "Refresh outdated media before rendering"
                  : errors.length > 0
                    ? "Fix blocking validation errors before rendering"
                    : isStaleValidation
                      ? "Re-run validation checks before rendering"
                      : "Run checks to verify render readiness"
              }
              type="button"
              style={{
                padding: "8px 18px",
                borderRadius: "8px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                color: "var(--color-text-muted, #BDB5C7)",
                border: "1px solid var(--color-border, #3A3046)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "not-allowed",
                opacity: 0.6,
              }}
            >
              Render lesson
            </button>
          )}
        </div>
      </header>

      {/* Quality Explanation Banner when Low Quality is Selected */}
      {quality === "low" && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(168, 131, 255, 0.1)",
            border: "1px solid rgba(168, 131, 255, 0.2)",
            fontSize: "13px",
            color: "var(--color-text, #F4F1F8)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span style={{ color: "var(--color-brand, #A883FF)", fontWeight: 600 }}>
            Draft Preview Mode:
          </span>
          <span>
            Lower quality scales video to 540p for smoother playback. The final video will always render at full 1080p.
          </span>
        </div>
      )}

      {/* Media Refresh Error Notice */}
      {refreshError !== null && (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: "12px 16px",
            borderRadius: "8px",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#FCA5A5",
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          {refreshError}
        </p>
      )}

      {/* Stale Artifacts Banner */}
      {stale.length > 0 && (
        <section
          role="alert"
          style={{
            padding: "16px 20px",
            borderRadius: "10px",
            backgroundColor: "rgba(245, 158, 11, 0.12)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <p
              style={{
                margin: 0,
                fontWeight: 600,
                fontSize: "14px",
                color: "#FCD34D",
              }}
            >
              {stale.length} scene{stale.length === 1 ? " is" : "s are"} outdated
              or missing media. Preview timing is shown, but this is not render-ready.
            </p>
            <button
              onClick={() => void refreshSignedUrls()}
              disabled={refreshing}
              type="button"
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                backgroundColor: "rgba(245, 158, 11, 0.2)",
                border: "1px solid rgba(245, 158, 11, 0.4)",
                color: "#FDE68A",
                fontSize: "12px",
                fontWeight: 600,
                cursor: refreshing ? "not-allowed" : "pointer",
              }}
            >
              {refreshing ? "Refreshing…" : "Refresh media now"}
            </button>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: "20px",
              color: "var(--color-text, #F4F1F8)",
              fontSize: "13px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            {stale.map((entry) => {
              const index = manifest.storyboard.scenes.findIndex(
                (scene) => scene.stableSceneId === entry.sceneId,
              );
              const issues = [
                ...(entry.audio.status === "ready" ? [] : ["audio"]),
                ...(entry.captions.length > 0 ? [] : ["captions"]),
                ...(entry.missingAssetIds.length === 0
                  ? []
                  : [`${entry.missingAssetIds.length} asset${entry.missingAssetIds.length === 1 ? "" : "s"}`]),
              ];
              return (
                <li key={entry.sceneId}>
                  Scene {index + 1}: missing or outdated {issues.join(", ") || "artifacts"}.
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Centered Dominant Theater Player Container */}
      <section
        aria-label="Full lesson theater"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          backgroundColor: "var(--color-surface, #211A2B)",
          borderRadius: "16px",
          border: "1px solid var(--color-border, #3A3046)",
          padding: "24px",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: quality === "low" ? "960px" : "1200px",
            aspectRatio: "16 / 9",
            backgroundColor: "#0B0710",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid var(--color-border, #3A3046)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.7)",
          }}
        >
          <FullLessonPreviewPlayer
            input={input}
            onMediaError={() => void refreshSignedUrls()}
            quality={quality}
          />
        </div>
      </section>

      {/* Contextual Scene Navigation & Deep Links */}
      <section
        aria-labelledby="scene-nav-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          padding: "20px",
          backgroundColor: "var(--color-surface, #211A2B)",
          borderRadius: "12px",
          border: "1px solid var(--color-border, #3A3046)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2
            id="scene-nav-heading"
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--color-text, #F4F1F8)",
            }}
          >
            Scene navigation
          </h2>
          <span style={{ fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
            Jump to any scene or edit in Focus Studio
          </span>
        </div>

        <nav
          aria-label="Edit preview scene"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: "12px",
          }}
        >
          {manifest.storyboard.scenes.map((entry, index) => {
            const isStale = manifest.scenes.some(
              (s) => s.sceneId === entry.stableSceneId && s.stale,
            );
            const templateName =
              templateDisplayNames[entry.template] ?? entry.template;
            return (
              <div
                key={entry.stableSceneId}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "12px 14px",
                  backgroundColor: "var(--color-surface-raised, #292035)",
                  borderRadius: "8px",
                  border: `1px solid ${
                    isStale
                      ? "rgba(245, 158, 11, 0.4)"
                      : "var(--color-border, #3A3046)"
                  }`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      color: "var(--color-brand, #A883FF)",
                    }}
                  >
                    Scene {index + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--color-text-muted, #BDB5C7)",
                    }}
                  >
                    {entry.scene.durationSeconds}s
                  </span>
                </div>

                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
                  {templateName}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                  {isStale ? (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-warning-fg, #FBBF24)",
                        fontWeight: 500,
                      }}
                    >
                      Outdated media
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--color-success-fg, #86EFAC)",
                      }}
                    >
                      Ready
                    </span>
                  )}

                  <a
                    href={`/workspace/${encodeURIComponent(projectId)}/storyboard#scene=${encodeURIComponent(entry.stableSceneId)}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(168, 131, 255, 0.12)",
                      border: "1px solid rgba(168, 131, 255, 0.3)",
                      color: "var(--color-brand, #A883FF)",
                      textDecoration: "none",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    Edit scene {index + 1} →
                  </a>
                </div>
              </div>
            );
          })}
        </nav>
      </section>

      {/* Preflight & Quality Center */}
      <section
        aria-labelledby="preflight-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "20px",
          backgroundColor: "var(--color-surface, #211A2B)",
          borderRadius: "12px",
          border: "1px solid var(--color-border, #3A3046)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h2
              id="preflight-heading"
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text, #F4F1F8)",
              }}
            >
              Preflight check & render readiness
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                fontSize: "13px",
                color: "var(--color-text-muted, #BDB5C7)",
              }}
            >
              Deterministic validation of scene structure, assets, grounding, audio, and render bounds.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void runValidation()}
            disabled={validationLoading}
            style={{
              padding: "6px 14px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              border: "1px solid var(--color-border, #3A3046)",
              color: "var(--color-text, #F4F1F8)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: validationLoading ? "not-allowed" : "pointer",
            }}
          >
            {validationLoading ? "Running checks…" : "Run checks again"}
          </button>
        </div>

        {validationError !== null && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "8px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#FCA5A5",
              fontSize: "13px",
            }}
          >
            {validationError}
          </p>
        )}

        {/* Readiness Status Banner */}
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "8px",
            backgroundColor:
              isStaleValidation
                ? "rgba(138, 75, 8, 0.15)"
                : errors.length > 0
                  ? "rgba(180, 35, 24, 0.15)"
                  : stale.length > 0
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(23, 107, 70, 0.15)",
            border: `1px solid ${
              isStaleValidation
                ? "rgba(138, 75, 8, 0.3)"
                : errors.length > 0
                  ? "rgba(180, 35, 24, 0.3)"
                  : stale.length > 0
                    ? "rgba(245, 158, 11, 0.3)"
                    : "rgba(23, 107, 70, 0.3)"
            }`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <p
              data-testid="preflight-status"
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 600,
                color:
                  isStaleValidation
                    ? "var(--color-warning-fg, #FBBF24)"
                    : errors.length > 0
                      ? "#FCA5A5"
                      : stale.length > 0
                        ? "#FDE68A"
                        : "#86EFAC",
              }}
            >
              {isStaleValidation
                ? "Validation results are outdated. Re-run checks to verify readiness."
                : errors.length > 0
                  ? `${errors.length} blocking issue${errors.length === 1 ? "" : "s"} must be fixed before rendering.`
                  : stale.length > 0
                    ? `${stale.length} scene${stale.length === 1 ? "" : "s"} need media renewal before rendering.`
                    : validation === null
                      ? "Checks not run yet. Click 'Run checks again' to verify."
                      : "✓ All preflight checks passed. Lesson is ready for rendering."}
            </p>
            {validation !== null && !isStaleValidation && errors.length === 0 && warnings.length > 0 && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "12px",
                  color: "var(--color-text-muted, #BDB5C7)",
                }}
              >
                {warnings.filter((w) => w.acknowledgedAt !== null).length} of{" "}
                {warnings.length} advisory warning
                {warnings.length === 1 ? "" : "s"} acknowledged.
              </p>
            )}
          </div>

          {isReadyToRender && (
            <a
              href={`/workspace/${encodeURIComponent(projectId)}/render`}
              style={{
                padding: "6px 14px",
                borderRadius: "6px",
                backgroundColor: "var(--color-brand, #A883FF)",
                color: "var(--color-on-brand, #1B1027)",
                textDecoration: "none",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Proceed to Render →
            </a>
          )}
        </div>

        {/* Grouped Issues List */}
        {validation !== null && validation.issues.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[...groupedIssues].map(([group, issues]) => (
              <div
                key={group}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--color-text-muted, #BDB5C7)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  {scopeLabels[group] ?? group}
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
                        padding: "10px 14px",
                        borderRadius: "8px",
                        backgroundColor: "var(--color-surface-raised, #292035)",
                        border: "1px solid var(--color-border, #3A3046)",
                        fontSize: "13px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <span
                          style={{
                            color:
                              issue.severity === "error"
                                ? "#FCA5A5"
                                : "var(--color-warning-fg, #FBBF24)",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginTop: "1px",
                            flexShrink: 0,
                          }}
                        >
                          {issue.severity === "error" ? "Fix required:" : "Warning:"}
                        </span>
                        <span style={{ color: "var(--color-text, #F4F1F8)" }}>
                          {issue.message}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                          marginTop: "2px",
                        }}
                      >
                        {issue.sceneId !== null ? (
                          <a
                            href={`/workspace/${encodeURIComponent(projectId)}/storyboard#scene=${encodeURIComponent(issue.sceneId)}`}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(255, 255, 255, 0.08)",
                              border: "1px solid var(--color-border, #3A3046)",
                              color: "var(--color-brand, #A883FF)",
                              fontSize: "12px",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            Open affected scene →
                          </a>
                        ) : issue.scopeType === "objective" ? (
                          <a
                            href={`/workspace/${encodeURIComponent(projectId)}/objectives`}
                            style={{
                              color: "var(--color-brand, #A883FF)",
                              fontSize: "12px",
                              textDecoration: "none",
                            }}
                          >
                            Review learning objectives →
                          </a>
                        ) : (
                          <a
                            href={`/workspace/${encodeURIComponent(projectId)}/storyboard`}
                            style={{
                              color: "var(--color-brand, #A883FF)",
                              fontSize: "12px",
                              textDecoration: "none",
                            }}
                          >
                            Review storyboard →
                          </a>
                        )}

                        {issue.acknowledgeable &&
                        issue.acknowledgedAt === null &&
                        !validation.stale ? (
                          <button
                            type="button"
                            onClick={() =>
                              void acknowledgeValidation(
                                issue.id,
                                validation.inputHash,
                              )
                            }
                            disabled={validationLoading}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(245, 158, 11, 0.15)",
                              border: "1px solid rgba(245, 158, 11, 0.3)",
                              color: "#FCD34D",
                              fontSize: "12px",
                              fontWeight: 500,
                              cursor: validationLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            Acknowledge warning
                          </button>
                        ) : null}

                        {issue.acknowledgedAt !== null ? (
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--color-success-fg, #86EFAC)",
                            }}
                          >
                            ✓ Acknowledged
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
