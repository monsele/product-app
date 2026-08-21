"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sceneRegenerationModeValues,
  storyboardResponseSchema,
  type LessonStoryboard,
  type LessonStoryboardScene,
  type SceneCandidate,
  type SceneRegenerationMode,
  type StoryboardResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  sceneCandidateStatusLabel,
  sceneRegenerationFailureMessage,
  sceneRegenerationModeLabel,
  storyboardFailureMessage,
  storyboardGenerationStateLabel,
  storyboardValidationWarnings,
} from "./storyboard-input";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: StoryboardResponse }
  | { kind: "failed"; message: string };

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

function visualSummary(scene: LessonStoryboardScene): string {
  return JSON.stringify(scene.scene.visual).slice(0, 200);
}

export function StoryboardPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [sceneForms, setSceneForms] = useState<Record<string, SceneRegenerationMode>>(
    {},
  );
  const [pendingScenes, setPendingScenes] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    const response = await fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/storyboard`),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error("storyboard");
    const parsed = storyboardResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error("storyboard");
    setView({ kind: "ready", value: parsed.data });
    setPendingScenes((current) => {
      if (current.size === 0) return current;
      const next = new Set(current);
      for (const sceneId of next) {
        if (
          parsed.data.sceneCandidates.some(
            (candidate) =>
              candidate.sceneId === sceneId && candidate.status === "pending",
          )
        )
          next.delete(sceneId);
      }
      if (parsed.data.latestSceneRegenerationJob?.state === "failed")
        next.clear();
      return next;
    });
    return parsed.data;
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    void refresh()
      .catch(() => {
        if (!cancelled)
          setView({
            kind: "failed",
            message: "We could not load the storyboard. Please try again.",
          });
      })
      .then(() => {
        cancelled = true;
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const value = view.kind === "ready" ? view.value : null;
  const generating = value !== null && isGenerating(value.state);

  useEffect(() => {
    if (!pending && !generating && pendingScenes.size === 0) return;
    const timer = window.setInterval(() => {
      void refresh()
        .then(() => setPending(false))
        .catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [pending, generating, pendingScenes, refresh]);

  const generate = useCallback(async () => {
    setActionMessage(null);
    setSubmitting(true);
    setPending(true);
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/storyboard/generate`),
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "idempotency-key": globalThis.crypto.randomUUID() },
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          extractErrorMessage(
            payload,
            "Unable to start storyboard generation.",
          ),
        );
      await refresh().catch(() => undefined);
    } catch (error) {
      setPending(false);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to start storyboard generation.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [projectId, refresh]);

  if (view.kind === "loading")
    return (
      <section aria-labelledby="storyboard-heading">
        <h2 id="storyboard-heading">Storyboard</h2>
        <p role="status">Loading the storyboard.</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section aria-labelledby="storyboard-heading">
        <h2 id="storyboard-heading">Storyboard</h2>
        <p role="alert">{view.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const storyboard = view.value.storyboard;
  const approved = view.value.approved;
  const warnings = storyboardValidationWarnings(view.value.validation);

  return (
    <section aria-labelledby="storyboard-heading">
      <h2 id="storyboard-heading">Storyboard</h2>

      <p role="status">{storyboardGenerationStateLabel(view.value.state)}</p>

      {view.value.stale ? (
        <p role="status">
          {view.value.staleReason ??
            "This storyboard is out of date. Review the narration, outline, source, or configuration before continuing."}
        </p>
      ) : null}

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert">
          {storyboardFailureMessage(view.value.latestJob.errorCode)}
        </p>
      ) : null}

      {view.value.latestSceneRegenerationJob?.state === "failed" ? (
        <p role="alert">
          {sceneRegenerationFailureMessage(
            view.value.latestSceneRegenerationJob.errorCode,
          )}
        </p>
      ) : null}

      {actionMessage !== null ? <p role="alert">{actionMessage}</p> : null}

      {view.value.canGenerate ? (
        <button
          type="button"
          onClick={() => void generate()}
          disabled={submitting || generating}
        >
          {submitting || generating
            ? "Starting generation…"
            : storyboard === null
              ? "Generate storyboard"
              : "Regenerate storyboard"}
        </button>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} role="alert">
          {warning}
        </p>
      ))}

      {approved !== null && approved.id !== storyboard?.id ? (
        <p role="status">
          An approved storyboard still guides production until you review this
          draft.
        </p>
      ) : null}

      {storyboard === null ? (
        <p role="status">
          Confirm the reviewed source, save the lesson configuration, approve
          the lesson outline, and generate narration before generating a
          storyboard.
        </p>
      ) : (
        <StoryboardDraft
          storyboard={storyboard}
          approved={approved}
          projectId={projectId}
          generating={generating}
          sceneForms={sceneForms}
          setSceneForm={setSceneForms}
          pendingScenes={pendingScenes}
          setPendingScenes={setPendingScenes}
          sceneCandidates={view.value.sceneCandidates}
          setActionMessage={setActionMessage}
        />
      )}
    </section>
  );
}

function StoryboardDraft({
  storyboard,
  approved,
  projectId,
  generating,
  sceneForms,
  setSceneForm,
  pendingScenes,
  setPendingScenes,
  sceneCandidates,
  setActionMessage,
}: {
  storyboard: LessonStoryboard;
  approved: LessonStoryboard | null;
  projectId: string;
  generating: boolean;
  sceneForms: Record<string, SceneRegenerationMode>;
  setSceneForm: (value: Record<string, SceneRegenerationMode>) => void;
  pendingScenes: Set<string>;
  setPendingScenes: (value: Set<string>) => void;
  sceneCandidates: readonly SceneCandidate[];
  setActionMessage: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);

  const regenerateScene = useCallback(
    async (sceneId: string, mode: SceneRegenerationMode) => {
      setActionMessage(null);
      setBusy(true);
      setPendingScenes(new Set(pendingScenes).add(sceneId));
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
            body: JSON.stringify({ mode, expectedRevision: storyboard.revision }),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            extractErrorMessage(
              payload,
              "Unable to start scene regeneration.",
            ),
          );
      } catch (error) {
        setPendingScenes(new Set());
        setActionMessage(
          error instanceof Error
            ? error.message
            : "Unable to start scene regeneration.",
        );
      } finally {
        setBusy(false);
      }
    },
    [projectId, setPendingScenes, setActionMessage, storyboard.revision],
  );

  const decideCandidate = useCallback(
    async (
      sceneId: string,
      candidate: SceneCandidate,
      decision: "apply" | "reject",
    ) => {
      setActionMessage(null);
      setBusy(true);
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
              expectedRevision: storyboard.revision,
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
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : decision === "apply"
              ? "Unable to apply the regenerated scene."
              : "Unable to discard the regenerated scene.",
        );
      } finally {
        setBusy(false);
      }
    },
    [projectId, setActionMessage, storyboard.revision],
  );

  const candidatesByScene = new Map<string, SceneCandidate[]>();
  for (const candidate of sceneCandidates)
    candidatesByScene.set(candidate.sceneId, [
      ...(candidatesByScene.get(candidate.sceneId) ?? []),
      candidate,
    ]);

  return (
    <div>
      <p>
        {storyboard.status === "approved" ? "Approved" : "Draft"} storyboard{" "}
        {storyboard.id.slice(0, 8)} — prompt {storyboard.promptId}@
        {storyboard.promptVersion}, configuration v
        {storyboard.configurationVersion}. Total duration:{" "}
        {storyboard.totalDurationSeconds} seconds (target{" "}
        {storyboard.targetDurationSeconds}).
      </p>

      <ol aria-label="Storyboard scenes" data-testid="storyboard-scenes">
        {storyboard.scenes.map((scene) => (
          <li key={scene.id} data-testid={`storyboard-scene-${scene.id}`}>
            <p>
              {scene.order}. {scene.template} — {scene.durationSeconds}s ·{" "}
              {scene.narrationBlockIds.length} narration block
              {scene.narrationBlockIds.length === 1 ? "" : "s"}
              {scene.scene.title !== undefined
                ? ` · ${scene.scene.title}`
                : ""}
            </p>
            <p>{scene.scene.narration}</p>
            {scene.scene.onScreenText.length > 0 ? (
              <p>On screen: {scene.scene.onScreenText.join(" · ")}</p>
            ) : null}
            <p>Visual: {visualSummary(scene)}</p>
            {scene.assetRequirements.length > 0 ? (
              <ul aria-label="Planned assets">
                {scene.assetRequirements.map((requirement, index) => (
                  <li key={`${requirement.slot}-${index}`}>
                    {requirement.slot}: {requirement.purpose}
                  </li>
                ))}
              </ul>
            ) : null}

            <div>
              <label htmlFor={`scene-mode-${scene.stableSceneId}`}>
                Regenerate this scene
              </label>{" "}
              <select
                id={`scene-mode-${scene.stableSceneId}`}
                value={sceneForms[scene.stableSceneId] ?? "regenerate"}
                onChange={(event) =>
                  setSceneForm({
                    ...sceneForms,
                    [scene.stableSceneId]: event.target
                      .value as SceneRegenerationMode,
                  })
                }
                disabled={busy || pendingScenes.has(scene.stableSceneId)}
              >
                {sceneRegenerationModeValues.map((mode) => (
                  <option key={mode} value={mode}>
                    {sceneRegenerationModeLabel(mode)}
                  </option>
                ))}
              </select>{" "}
              <button
                type="button"
                data-testid={`storyboard-scene-regenerate-${scene.stableSceneId}`}
                onClick={() =>
                  void regenerateScene(
                    scene.stableSceneId,
                    sceneForms[scene.stableSceneId] ?? "regenerate",
                  )
                }
                disabled={
                  busy ||
                  pendingScenes.has(scene.stableSceneId) ||
                  generating
                }
              >
                {pendingScenes.has(scene.stableSceneId)
                  ? "Regenerating…"
                  : "Regenerate scene"}
              </button>
            </div>

            <SceneCandidates
              candidates={candidatesByScene.get(scene.stableSceneId) ?? []}
              busy={busy}
              onDecide={(candidate, decision) =>
                void decideCandidate(scene.stableSceneId, candidate, decision)
              }
            />
          </li>
        ))}
      </ol>

      {approved !== null ? (
        <section aria-label="Approved storyboard">
          <h3>Approved storyboard</h3>
          <ol>
            {approved.scenes.map((scene) => (
              <li key={scene.id}>
                {scene.order}. {scene.template} · {scene.durationSeconds}s
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p role="status">
        <a href={`/workspace/${encodeURIComponent(projectId)}/narration`}>
          Review the narration
        </a>{" "}
        if the storyboard does not match your plan.
      </p>
    </div>
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
}) {
  if (candidates.length === 0) return null;
  return (
    <ul aria-label="Scene regeneration candidates">
      {candidates.map((candidate) => (
        <li key={candidate.id} data-testid={`storyboard-candidate-${candidate.id}`}>
          <p>
            {sceneRegenerationModeLabel(candidate.mode)} —{" "}
            {sceneCandidateStatusLabel(candidate.status)}
          </p>
          <section aria-label="Before">
            <h4>Before</h4>
            <p>
              {candidate.before.template} · {candidate.before.durationSeconds}s
            </p>
            <p>{candidate.before.scene.narration}</p>
            <p>Visual: {visualSummary(candidate.before)}</p>
          </section>
          <section aria-label="After">
            <h4>After</h4>
            <p>
              {candidate.after.template} · {candidate.after.durationSeconds}s
            </p>
            <p>{candidate.after.scene.narration}</p>
            <p>Visual: {visualSummary(candidate.after)}</p>
          </section>
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
