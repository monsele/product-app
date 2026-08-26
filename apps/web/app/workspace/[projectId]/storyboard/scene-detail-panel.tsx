"use client";

import React, { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import {
  sceneRegenerationModeValues,
  sceneEditorMetadata,
  type SceneCandidate,
  type SceneRegenerationMode,
  type ProjectAsset,
  type StoryboardSceneDetailResponse,
  type SceneAudioStatusResponse,
  type LessonValidationRun,
} from "@avlp/schemas";
import {
  sceneCandidateStatusLabel,
  sceneRegenerationModeLabel,
} from "./storyboard-input";
import { SceneCitations } from "./citation-panel";
import { SceneGrounding } from "./grounding-panel";
import { SceneEditorForm } from "./scene-editor-form";
import { IllustrationCandidatePanel } from "./illustration-candidate-panel";
import { SceneAudioPanel } from "./scene-audio-panel";
import { ValidationPanel } from "./validation-panel";
import { VersionBrowser, type VersionBrowserMetadata } from "./version-browser";
import { fetchTeacherAssets } from "./storyboard-scene-query";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
    ? payload.error.message
    : fallback;
}

function visualSummary(detail: StoryboardSceneDetailResponse): string {
  return JSON.stringify(detail.scene.scene.visual).slice(0, 200);
}

export function teacherReplacementPreviewForScene(
  detail: StoryboardSceneDetailResponse,
  assets: readonly ProjectAsset[],
): ProjectAsset | undefined {
  return assets.find((asset) =>
    detail.scene.scene.assetBindings.some(
      (binding) => binding.assetId === asset.assetId,
    ),
  );
}

export type InspectorTab = "content" | "visual" | "audio" | "sources" | "checks";

export function SceneDetailPanel({
  projectId,
  detail,
  lessonSpecId,
  lessonSpecRevision,
  sceneCandidates,
  generating,
  onChanged,
  onScenePending,
  onSceneDone,
  validation,
  validationBusy = false,
  onRunValidation,
  onAcknowledgeValidation,
  onNavigateScene,
  versionMetadata = null,
  versionPreview = null,
  restoringVersionId = null,
  savingVersion = false,
  onSaveVersion,
  onPreviewVersion,
  onRestoreVersion,
  initialTab = "content",
}: {
  projectId: string;
  detail: StoryboardSceneDetailResponse;
  lessonSpecId: string;
  lessonSpecRevision: number;
  sceneCandidates: readonly SceneCandidate[];
  generating: boolean;
  onChanged: (message?: string) => void;
  onScenePending: (sceneId: string) => void;
  onSceneDone: (sceneId: string) => void;
  validation?: LessonValidationRun | null;
  validationBusy?: boolean;
  onRunValidation?: () => void;
  onAcknowledgeValidation?: (issueId: string, inputHash: string) => void;
  onNavigateScene?: (sceneId: string | null) => void;
  versionMetadata?: VersionBrowserMetadata | null;
  versionPreview?: { id: string; durationSeconds: number; sceneCount: number; schemaVersion: string } | null;
  restoringVersionId?: string | null;
  savingVersion?: boolean;
  onSaveVersion?: () => void;
  onPreviewVersion?: (versionId: string) => void;
  onRestoreVersion?: (versionId: string) => void;
  initialTab?: InspectorTab;
}): JSX.Element {
  const scene = detail.scene;
  const sceneId = scene.stableSceneId;
  const [activeTab, setActiveTab] = useState<InspectorTab>(initialTab);
  const [sceneForm, setSceneForm] =
    useState<SceneRegenerationMode>("regenerate");
  const [pending, setPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [, setTeacherAssets] = useState<readonly ProjectAsset[]>(
    [],
  );
  const [, setAudio] = useState<SceneAudioStatusResponse | null>(null);
  const assetBindingSignature = scene.scene.assetBindings
    .map((binding) => binding.assetId)
    .join(":");

  useEffect(() => {
    let cancelled = false;
    void fetchTeacherAssets(projectId)
      .then((response) => {
        if (!cancelled) setTeacherAssets(response.assets);
      })
      .catch(() => {
        if (!cancelled) setTeacherAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [assetBindingSignature, projectId]);

  const regenerateScene = useCallback(async () => {
    setActionMessage(null);
    setPending(true);
    onScenePending(sceneId);
    try {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/regenerate`,
        ),
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "idempotency-key": globalThis.crypto.randomUUID(),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mode: sceneForm,
            expectedRevision: lessonSpecRevision,
          }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          extractErrorMessage(payload, "Unable to start scene regeneration."),
        );
      onChanged();
    } catch (error) {
      onSceneDone(sceneId);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start scene regeneration.",
      );
    } finally {
      setPending(false);
    }
  }, [
    projectId,
    sceneId,
    sceneForm,
    lessonSpecRevision,
    onChanged,
    onScenePending,
    onSceneDone,
  ]);

  const decideCandidate = useCallback(
    async (candidate: SceneCandidate, decision: "apply" | "reject") => {
      setActionMessage(null);
      setPending(true);
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/${decision}-candidate`,
          ),
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              candidateId: candidate.id,
              expectedRevision: lessonSpecRevision,
              expectedSceneRevision: candidate.sceneRevision,
            }),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            extractErrorMessage(
              payload,
              decision === "apply"
                ? "Unable to apply the regenerated scene."
                : "Unable to discard the regenerated scene.",
            ),
          );
        onChanged();
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : decision === "apply"
              ? "Unable to apply the regenerated scene."
              : "Unable to discard the regenerated scene.",
        );
      } finally {
        setPending(false);
      }
    },
    [projectId, sceneId, lessonSpecRevision, onChanged],
  );

  const candidatesForScene = useMemo(
    () => sceneCandidates.filter((candidate) => candidate.sceneId === sceneId),
    [sceneCandidates, sceneId],
  );

  const tabButtonStyle = (tab: InspectorTab): React.CSSProperties => ({
    padding: "8px 12px",
    fontSize: "12px",
    fontWeight: activeTab === tab ? 600 : 500,
    color: activeTab === tab ? "var(--color-brand, #A883FF)" : "var(--color-text-muted, #BDB5C7)",
    backgroundColor: activeTab === tab ? "var(--color-surface, #211A2B)" : "transparent",
    border: "none",
    borderBottom: activeTab === tab ? "2px solid var(--color-brand, #A883FF)" : "2px solid transparent",
    cursor: "pointer",
    transition: "all 0.15s ease",
    whiteSpace: "nowrap",
  });

  return (
    <section
      aria-label={`Scene ${scene.order} detail`}
      data-testid="storyboard-scene-detail"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--color-surface, #211A2B)",
        border: "1px solid var(--color-border, #3A3046)",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      {/* Header Info */}
      <div
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--color-border, #3A3046)",
          backgroundColor: "var(--color-surface-subtle, #292035)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--color-text, #F4F1F8)" }}>
            Scene {scene.order}
          </h3>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: "rgba(168, 131, 255, 0.15)",
              color: "var(--color-brand, #A883FF)",
              fontWeight: 600,
            }}
          >
            {scene.template}
          </span>
        </div>

        <p
          data-testid={`storyboard-scene-detail-${sceneId}`}
          style={{
            margin: "4px 0 0",
            fontSize: "12px",
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          {scene.template} — {scene.durationSeconds}s ·{" "}
          {scene.narrationBlockIds.length} narration block
          {scene.narrationBlockIds.length === 1 ? "" : "s"}
          {scene.scene.title !== undefined ? ` · ${scene.scene.title}` : ""}
        </p>
      </div>

      {/* Inspector Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Scene Inspector Tabs"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border, #3A3046)",
          backgroundColor: "var(--color-canvas, #18131F)",
          overflowX: "auto",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "content"}
          data-testid="tab-content"
          style={tabButtonStyle("content")}
          onClick={() => setActiveTab("content")}
        >
          Content
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "visual"}
          data-testid="tab-visual"
          style={tabButtonStyle("visual")}
          onClick={() => setActiveTab("visual")}
        >
          Visual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "audio"}
          data-testid="tab-audio"
          style={tabButtonStyle("audio")}
          onClick={() => setActiveTab("audio")}
        >
          Audio
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "sources"}
          data-testid="tab-sources"
          style={tabButtonStyle("sources")}
          onClick={() => setActiveTab("sources")}
        >
          Sources
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "checks"}
          data-testid="tab-checks"
          style={tabButtonStyle("checks")}
          onClick={() => setActiveTab("checks")}
        >
          Checks
        </button>
      </div>

      {/* Tab Contents */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {activeTab === "content" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: "var(--color-surface-subtle, #292035)", border: "1px solid var(--color-border, #3A3046)" }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted, #BDB5C7)" }}>
                Narration Script
              </h4>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "var(--color-text, #F4F1F8)" }}>
                {scene.scene.narration}
              </p>
            </div>

            {scene.scene.onScreenText.length > 0 ? (
              <div style={{ padding: "10px 12px", borderRadius: "6px", backgroundColor: "rgba(0,0,0,0.2)", border: "1px solid var(--color-border, #3A3046)" }}>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
                  <strong style={{ color: "var(--color-text, #F4F1F8)" }}>On screen:</strong> {scene.scene.onScreenText.join(" · ")}
                </p>
              </div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
              <p style={{ margin: 0 }}>Transition: <span style={{ color: "var(--color-text, #F4F1F8)" }}>{scene.scene.transition}</span></p>
              <p style={{ margin: 0 }}>Visual: <span style={{ color: "var(--color-text, #F4F1F8)" }}>{visualSummary(detail)}</span></p>
            </div>

            {scene.assetRequirements.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <h4 style={{ margin: 0, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--color-text-muted, #BDB5C7)" }}>
                  Planned Assets
                </h4>
                <ul aria-label="Planned assets" style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--color-text, #F4F1F8)" }}>
                  {scene.assetRequirements.map((requirement, index) => (
                    <li key={`${requirement.slot}-${index}`} style={{ marginBottom: "2px" }}>
                      <strong>{requirement.slot}</strong>: {requirement.purpose}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Regeneration Scope Section */}
            <div
              style={{
                marginTop: "8px",
                padding: "12px",
                borderRadius: "8px",
                backgroundColor: "var(--color-surface-subtle, #292035)",
                border: "1px solid var(--color-border, #3A3046)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
                Regenerate this scene
              </h4>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--color-text-muted, #BDB5C7)" }}>
                AI rewrite is scoped strictly to this scene. Unrelated scenes and teacher edits are preserved.
              </p>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <label htmlFor={`scene-mode-${sceneId}`} style={{ display: "none" }}>
                  Regenerate this scene
                </label>
                <select
                  id={`scene-mode-${sceneId}`}
                  value={sceneForm}
                  onChange={(event) =>
                    setSceneForm(event.target.value as SceneRegenerationMode)
                  }
                  disabled={pending || generating}
                  style={{
                    flex: 1,
                    backgroundColor: "var(--color-surface, #211A2B)",
                    border: "1px solid var(--color-border, #3A3046)",
                    borderRadius: "6px",
                    color: "var(--color-text, #F4F1F8)",
                    padding: "6px 10px",
                    fontSize: "12px",
                  }}
                >
                  {sceneRegenerationModeValues.map((mode) => (
                    <option key={mode} value={mode}>
                      {sceneRegenerationModeLabel(mode)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  data-testid={`storyboard-scene-regenerate-${sceneId}`}
                  onClick={() => void regenerateScene()}
                  disabled={pending || generating}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    backgroundColor: "var(--color-brand, #A883FF)",
                    color: "var(--color-on-brand, #1B1027)",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: pending || generating ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pending ? "Regenerating…" : "Regenerate scene"}
                </button>
              </div>

              {actionMessage !== null ? (
                <p role="alert" style={{ margin: 0, fontSize: "12px", color: "#FCA5A5" }}>
                  {actionMessage}
                </p>
              ) : null}

              <SceneCandidates
                candidates={candidatesForScene}
                busy={pending}
                onDecide={(candidate, decision) =>
                  void decideCandidate(candidate, decision)
                }
              />
            </div>
          </div>
        )}

        {activeTab === "visual" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <SceneEditorForm
              projectId={projectId}
              detail={detail}
              revision={lessonSpecRevision}
              disabled={pending || generating}
              onPersisted={onChanged}
            />

            <IllustrationCandidatePanel
              projectId={projectId}
              sceneId={sceneId}
              sceneRevision={detail.sceneRevision}
              storyboardRevision={lessonSpecRevision}
              slots={sceneEditorMetadata(scene.template).assetSlots}
              disabled={pending || generating}
              onChanged={onChanged}
            />
          </div>
        )}

        {activeTab === "audio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <SceneAudioPanel
              projectId={projectId}
              sceneId={sceneId}
              disabled={pending || generating}
              onStatusChange={setAudio}
            />
          </div>
        )}

        {activeTab === "sources" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <SceneCitations projectId={projectId} sceneId={sceneId} />
            <SceneGrounding
              projectId={projectId}
              sceneId={sceneId}
              lessonSpecId={lessonSpecId}
              lessonSpecRevision={lessonSpecRevision}
            />
          </div>
        )}

        {activeTab === "checks" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {validation !== undefined && onRunValidation && onAcknowledgeValidation && onNavigateScene && (
              <ValidationPanel
                projectId={projectId}
                run={validation}
                onRun={onRunValidation}
                onAcknowledge={onAcknowledgeValidation}
                onNavigate={onNavigateScene}
                busy={validationBusy}
              />
            )}

            {onSaveVersion && onPreviewVersion && onRestoreVersion && (
              <VersionBrowser
                metadata={versionMetadata}
                preview={versionPreview}
                restoringVersionId={restoringVersionId}
                saving={savingVersion}
                storyboardAvailable={true}
                onSave={onSaveVersion}
                onPreview={onPreviewVersion}
                onRestore={onRestoreVersion}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function SceneCandidates({
  candidates,
  busy,
  onDecide,
}: {
  candidates: readonly SceneCandidate[];
  busy: boolean;
  onDecide: (candidate: SceneCandidate, decision: "apply" | "reject") => void;
}): JSX.Element | null {
  if (candidates.length === 0) return null;
  return (
    <ul
      aria-label="Scene regeneration candidates"
      style={{
        margin: "8px 0 0",
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {candidates.map((candidate) => (
        <li
          key={candidate.id}
          data-testid={`storyboard-candidate-${candidate.id}`}
          style={{
            padding: "8px 10px",
            borderRadius: "6px",
            backgroundColor: "var(--color-surface, #211A2B)",
            border: "1px solid var(--color-border, #3A3046)",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
          }}
        >
          <p style={{ margin: 0, color: "var(--color-text, #F4F1F8)" }}>
            {sceneRegenerationModeLabel(candidate.mode)} —{" "}
            {sceneCandidateStatusLabel(candidate.status)}
          </p>
          {candidate.status === "pending" ? (
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                data-testid={`storyboard-candidate-apply-${candidate.id}`}
                onClick={() => onDecide(candidate, "apply")}
                disabled={busy}
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--color-brand, #A883FF)",
                  color: "var(--color-on-brand, #1B1027)",
                  border: "none",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Apply candidate
              </button>{" "}
              <button
                type="button"
                data-testid={`storyboard-candidate-reject-${candidate.id}`}
                onClick={() => onDecide(candidate, "reject")}
                disabled={busy}
                style={{
                  padding: "4px 8px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(255, 255, 255, 0.08)",
                  color: "var(--color-text-muted, #BDB5C7)",
                  border: "1px solid var(--color-border, #3A3046)",
                  fontSize: "11px",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Discard candidate
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
