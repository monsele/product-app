"use client";

import { useCallback, useMemo, useState, type JSX } from "react";
import { ScenePreviewPlayer } from "@avlp/scene-library";
import {
  sceneRegenerationModeValues,
  type SceneCandidate,
  type SceneRegenerationMode,
  type StoryboardSceneDetailResponse,
} from "@avlp/schemas";
import {
  sceneCandidateStatusLabel,
  sceneRegenerationModeLabel,
} from "./storyboard-input";
import { buildScenePreviewInput, canPreviewScene } from "./scene-preview-input";
import { SceneCitations } from "./citation-panel";
import { SceneGrounding } from "./grounding-panel";
import { SceneEditorForm } from "./scene-editor-form";

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
}): JSX.Element {
  const scene = detail.scene;
  const sceneId = scene.stableSceneId;
  const [sceneForm, setSceneForm] =
    useState<SceneRegenerationMode>("regenerate");
  const [pending, setPending] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

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

  const previewInput = useMemo(() => buildScenePreviewInput(detail), [detail]);

  return (
    <section
      aria-label={`Scene ${scene.order} detail`}
      data-testid="storyboard-scene-detail"
    >
      <h3>Scene {scene.order}</h3>

      <p data-testid={`storyboard-scene-detail-${sceneId}`}>
        {scene.template} — {scene.durationSeconds}s ·{" "}
        {scene.narrationBlockIds.length} narration block
        {scene.narrationBlockIds.length === 1 ? "" : "s"}
        {scene.scene.title !== undefined ? ` · ${scene.scene.title}` : ""}
      </p>

      <p>{scene.scene.narration}</p>

      {scene.scene.onScreenText.length > 0 ? (
        <p>On screen: {scene.scene.onScreenText.join(" · ")}</p>
      ) : null}

      <p>Transition: {scene.scene.transition}</p>
      <p>Visual: {visualSummary(detail)}</p>

      <SceneEditorForm
        projectId={projectId}
        detail={detail}
        revision={lessonSpecRevision}
        disabled={pending || generating}
        onPersisted={onChanged}
      />

      {scene.assetRequirements.length > 0 ? (
        <ul aria-label="Planned assets">
          {scene.assetRequirements.map((requirement, index) => (
            <li key={`${requirement.slot}-${index}`}>
              {requirement.slot}: {requirement.purpose}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-label="Selected scene preview">
        {canPreviewScene(detail) ? (
          <ScenePreviewPlayer input={previewInput} />
        ) : (
          <section
            aria-label="Scene preview unavailable"
            data-testid="scene-preview-unavailable"
            role="status"
          >
            <h4>Preview unavailable</h4>
            <p>
              This scene references media that is not available yet. A preview
              will appear once scene media is generated.
            </p>
          </section>
        )}
      </section>

      {actionMessage !== null ? <p role="alert">{actionMessage}</p> : null}

      <div>
        <label htmlFor={`scene-mode-${sceneId}`}>Regenerate this scene</label>{" "}
        <select
          id={`scene-mode-${sceneId}`}
          value={sceneForm}
          onChange={(event) =>
            setSceneForm(event.target.value as SceneRegenerationMode)
          }
          disabled={pending || generating}
        >
          {sceneRegenerationModeValues.map((mode) => (
            <option key={mode} value={mode}>
              {sceneRegenerationModeLabel(mode)}
            </option>
          ))}
        </select>{" "}
        <button
          type="button"
          data-testid={`storyboard-scene-regenerate-${sceneId}`}
          onClick={() => void regenerateScene()}
          disabled={pending || generating}
        >
          {pending ? "Regenerating…" : "Regenerate scene"}
        </button>
      </div>

      <SceneCandidates
        candidates={candidatesForScene}
        busy={pending}
        onDecide={(candidate, decision) =>
          void decideCandidate(candidate, decision)
        }
      />

      <SceneCitations projectId={projectId} sceneId={sceneId} />
      <SceneGrounding
        projectId={projectId}
        sceneId={sceneId}
        lessonSpecId={lessonSpecId}
        lessonSpecRevision={lessonSpecRevision}
      />
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
    <ul aria-label="Scene regeneration candidates">
      {candidates.map((candidate) => (
        <li
          key={candidate.id}
          data-testid={`storyboard-candidate-${candidate.id}`}
        >
          <p>
            {sceneRegenerationModeLabel(candidate.mode)} —{" "}
            {sceneCandidateStatusLabel(candidate.status)}
          </p>
          {candidate.status === "pending" ? (
            <div>
              <button
                type="button"
                data-testid={`storyboard-candidate-apply-${candidate.id}`}
                onClick={() => onDecide(candidate, "apply")}
                disabled={busy}
              >
                Apply candidate
              </button>{" "}
              <button
                type="button"
                data-testid={`storyboard-candidate-reject-${candidate.id}`}
                onClick={() => onDecide(candidate, "reject")}
                disabled={busy}
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
