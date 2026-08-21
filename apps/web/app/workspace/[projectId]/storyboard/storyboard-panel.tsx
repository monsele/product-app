"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  storyboardResponseSchema,
  type StoryboardResponse,
  type StoryboardSceneDetailResponse,
  type StoryboardSceneListResponse,
} from "@avlp/schemas";
import {
  isGenerating,
  sceneRegenerationFailureMessage,
  storyboardFailureMessage,
  storyboardGenerationStateLabel,
  storyboardValidationWarnings,
} from "./storyboard-input";
import {
  cachedStoryboardSceneList,
  fetchStoryboardSceneDetail,
  fetchStoryboardSceneList,
  invalidateStoryboardSceneList,
} from "./storyboard-scene-query";
import { SceneList } from "./scene-list";
import { SceneDetailPanel } from "./scene-detail-panel";

type ViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: StoryboardResponse }
  | { kind: "failed"; message: string };

type SceneListViewState =
  | { kind: "loading" }
  | { kind: "ready"; value: StoryboardSceneListResponse }
  | { kind: "failed"; message: string };

type SceneDetailState =
  | { kind: "loading" }
  | { kind: "ready"; value: StoryboardSceneDetailResponse }
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

/** Reads the deep-linked scene id from the URL hash, e.g. `#scene=<id>`. */
function readHashSceneId(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.startsWith("#scene=")) return null;
  const sceneId = decodeURIComponent(hash.slice("#scene=".length));
  return sceneId.length === 0 ? null : sceneId;
}

export function StoryboardPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pendingScenes, setPendingScenes] = useState<Set<string>>(new Set());
  const [sceneList, setSceneList] = useState<SceneListViewState>({
    kind: "loading",
  });
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SceneDetailState>({ kind: "loading" });
  const [detailAttempt, setDetailAttempt] = useState(0);

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
  const revision = value?.storyboard?.revision ?? null;

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
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/storyboard/generate`,
        ),
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

  // Load the lightweight scene list keyed by project and storyboard revision.
  useEffect(() => {
    if (revision === null) {
      setSceneList({ kind: "loading" });
      return;
    }
    const cached = cachedStoryboardSceneList(projectId, revision);
    setSceneList(
      cached === undefined
        ? { kind: "loading" }
        : { kind: "ready", value: cached },
    );
    let cancelled = false;
    void fetchStoryboardSceneList(projectId)
      .then((value) => {
        if (!cancelled) setSceneList({ kind: "ready", value });
      })
      .catch(() => {
        if (!cancelled)
          setSceneList((current) =>
            current.kind === "ready"
              ? current
              : {
                  kind: "failed",
                  message: "The storyboard scene list could not be loaded.",
                },
          );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, revision]);

  const listScenes = sceneList.kind === "ready" ? sceneList.value.scenes : [];

  // Keep a valid selection: the deep-linked scene from the URL hash when
  // present, otherwise the first scene. The selection survives storyboard saves
  // and refetches because stable scene ids persist across revisions.
  useEffect(() => {
    if (listScenes.length === 0) return;
    setSelectedSceneId((current) => {
      if (
        current !== null &&
        listScenes.some((scene) => scene.sceneId === current)
      )
        return current;
      const hashScene = readHashSceneId();
      const preferred =
        hashScene !== null &&
        listScenes.some((scene) => scene.sceneId === hashScene)
          ? hashScene
          : listScenes[0]!.sceneId;
      return preferred;
    });
  }, [listScenes]);

  // Honor hash changes and back/forward navigation for the deep-linked scene.
  useEffect(() => {
    const onLocationChange = (): void => {
      const scene = readHashSceneId();
      if (scene !== null) setSelectedSceneId(scene);
    };
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, []);

  const selectScene = useCallback((sceneId: string) => {
    setSelectedSceneId(sceneId);
    window.location.hash = `scene=${encodeURIComponent(sceneId)}`;
  }, []);

  // Fetch full scene JSON only for the selected scene, and refresh it whenever
  // the storyboard revision changes so the panel never shows stale persisted
  // state after a save.
  useEffect(() => {
    if (selectedSceneId === null) {
      setDetail({ kind: "loading" });
      return;
    }
    setDetail({ kind: "loading" });
    let cancelled = false;
    void fetchStoryboardSceneDetail(projectId, selectedSceneId)
      .then((value) => {
        if (!cancelled) setDetail({ kind: "ready", value });
      })
      .catch(() => {
        if (!cancelled)
          setDetail({
            kind: "failed",
            message: "The selected scene could not be loaded.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedSceneId, revision, detailAttempt]);

  const onStoryboardChanged = useCallback(() => {
    invalidateStoryboardSceneList(projectId);
    void refresh().catch(() => undefined);
  }, [projectId, refresh]);

  const markScenePending = useCallback((sceneId: string) => {
    setPendingScenes((current) => new Set(current).add(sceneId));
  }, []);

  const markSceneDone = useCallback((sceneId: string) => {
    setPendingScenes((current) => {
      const next = new Set(current);
      next.delete(sceneId);
      return next;
    });
  }, []);

  const storyboard = value?.storyboard ?? null;
  const warnings = useMemo(
    () =>
      value === null ? [] : storyboardValidationWarnings(value.validation),
    [value],
  );

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

      {view.value.approved !== null &&
      view.value.approved.id !== storyboard?.id ? (
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
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ flex: "1 1 45%" }}>
            <h3>Scene list</h3>
            {sceneList.kind === "loading" ? (
              <p role="status">Loading the scene list…</p>
            ) : sceneList.kind === "failed" ? (
              <p role="alert">{sceneList.message}</p>
            ) : (
              <SceneList
                scenes={listScenes}
                selectedSceneId={selectedSceneId}
                stale={view.value.stale}
                onSelect={selectScene}
              />
            )}
          </div>
          <div style={{ flex: "1 1 55%" }}>
            {selectedSceneId === null ? (
              <p role="status">Select a scene to see its detail.</p>
            ) : detail.kind === "loading" ? (
              <p role="status">Loading the selected scene…</p>
            ) : detail.kind === "failed" ? (
              <section aria-label="Selected scene detail">
                <p role="alert">{detail.message}</p>
                <button
                  type="button"
                  onClick={() => setDetailAttempt((current) => current + 1)}
                >
                  Try again
                </button>
              </section>
            ) : (
              <SceneDetailPanel
                projectId={projectId}
                detail={detail.value}
                lessonSpecId={storyboard.id}
                lessonSpecRevision={storyboard.revision}
                sceneCandidates={view.value.sceneCandidates}
                generating={generating}
                onChanged={onStoryboardChanged}
                onScenePending={markScenePending}
                onSceneDone={markSceneDone}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
