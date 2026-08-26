"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScenePreviewPlayer } from "@avlp/scene-library";
import {
  sceneTemplateValues,
  storyboardResponseSchema,
  lessonVersionsResponseSchema,
  lessonVersionDetailSchema,
  lessonValidationRunSchema,
  type LessonValidationRun,
  type ProjectAsset,
  type SceneTemplate,
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
  addStoryboardScene,
  cachedStoryboardSceneList,
  deleteStoryboardScene,
  duplicateStoryboardScene,
  fetchStoryboardSceneDetail,
  fetchStoryboardSceneList,
  fetchTeacherAssets,
  invalidateStoryboardSceneList,
  reorderStoryboardScenes,
} from "./storyboard-scene-query";
import { buildScenePreviewInput, canPreviewScene } from "./scene-preview-input";
import { SceneList } from "./scene-list";
import {
  SceneDetailPanel,
  teacherReplacementPreviewForScene,
} from "./scene-detail-panel";
import { type VersionBrowserMetadata } from "./version-browser";

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

type MobileViewTab = "scenes" | "preview" | "details";

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

export function StoryboardPanel({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle?: string;
}) {
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [editorMessage, setEditorMessage] = useState<string | null>(null);
  const [pendingScenes, setPendingScenes] = useState<Set<string>>(new Set());
  const [sceneList, setSceneList] = useState<SceneListViewState>({
    kind: "loading",
  });
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SceneDetailState>({ kind: "loading" });
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [addTemplate, setAddTemplate] = useState<SceneTemplate>("definition");
  const [versionMetadata, setVersionMetadata] =
    useState<VersionBrowserMetadata | null>(null);
  const [versionPreview, setVersionPreview] = useState<{
    id: string;
    durationSeconds: number;
    sceneCount: number;
    schemaVersion: string;
  } | null>(null);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(
    null,
  );
  const [savingVersion, setSavingVersion] = useState(false);
  const [validation, setValidation] = useState<LessonValidationRun | null>(
    null,
  );
  const [validationBusy, setValidationBusy] = useState(false);
  const [teacherAssets, setTeacherAssets] = useState<readonly ProjectAsset[]>([]);
  const [mobileTab, setMobileTab] = useState<MobileViewTab>("preview");

  useEffect(() => {
    let cancelled = false;
    void fetchTeacherAssets(projectId)
      .then((res) => {
        if (!cancelled) setTeacherAssets(res.assets);
      })
      .catch(() => {
        if (!cancelled) setTeacherAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const loadValidation = useCallback(async () => {
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
    )
      throw new Error("validation");
    setValidation(
      candidate === null ? null : lessonValidationRunSchema.parse(candidate),
    );
  }, [projectId]);

  const runValidation = useCallback(async () => {
    setValidationBusy(true);
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
      if (!response.ok || !parsed.success)
        throw new Error("Unable to run lesson checks.");
      setValidation(parsed.data);
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : "Unable to run lesson checks.",
      );
    } finally {
      setValidationBusy(false);
    }
  }, [projectId]);

  const acknowledgeValidation = useCallback(
    async (issueId: string, inputHash: string) => {
      setValidationBusy(true);
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
        if (!response.ok || !parsed.success)
          throw new Error(
            extractErrorMessage(payload, "Unable to acknowledge this warning."),
          );
        setValidation(parsed.data);
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : "Unable to acknowledge this warning.",
        );
      } finally {
        setValidationBusy(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    void loadValidation().catch(() => undefined);
  }, [loadValidation]);

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

  const refreshVersions = useCallback(async () => {
    const response = await fetch(
      apiUrl(`/projects/${encodeURIComponent(projectId)}/versions`),
      { credentials: "include", cache: "no-store" },
    );
    const payload: unknown = await response.json().catch(() => null);
    const parsed = lessonVersionsResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success) throw new Error("versions");
    setVersionMetadata({
      count: parsed.data.versions.length,
      latestModifiedAt: parsed.data.latestModifiedAt,
      currentVersionId: parsed.data.currentVersionId,
      versions: parsed.data.versions.map((version) => ({
        id: version.id,
        versionNumber: version.versionNumber,
        reason: version.reason,
        createdAt: version.createdAt,
      })),
    });
  }, [projectId]);

  useEffect(() => {
    void refreshVersions().catch(() => undefined);
  }, [refreshVersions]);

  const saveVersion = useCallback(async () => {
    setSavingVersion(true);
    setActionMessage(null);
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/versions`),
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: "explicit_save" }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          extractErrorMessage(payload, "Unable to save this lesson version."),
        );
      await refreshVersions();
      setActionMessage("Lesson version saved.");
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Unable to save this lesson version.",
      );
    } finally {
      setSavingVersion(false);
    }
  }, [projectId, refreshVersions]);

  const previewVersion = useCallback(
    async (versionId: string) => {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = lessonVersionDetailSchema.safeParse(payload);
      if (!response.ok || !parsed.success)
        throw new Error(
          extractErrorMessage(payload, "Unable to load this version."),
        );
      setVersionPreview({
        id: parsed.data.id,
        durationSeconds: parsed.data.durationSeconds,
        sceneCount: parsed.data.sceneCount,
        schemaVersion: parsed.data.schemaVersion,
      });
    },
    [projectId],
  );

  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (
        !window.confirm(
          "Restore this saved version? Your current version will be replaced by a new restored version.",
        )
      )
        return;
      setRestoringVersionId(versionId);
      setActionMessage(null);
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/restore`,
          ),
          {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              expectedCurrentVersionId:
                versionMetadata?.currentVersionId ?? null,
              confirmReplace: true,
            }),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            extractErrorMessage(
              payload,
              "Unable to restore this lesson version.",
            ),
          );
        await refreshVersions();
        await refresh();
        setActionMessage(
          "A new current version was restored; earlier history and renders were preserved.",
        );
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : "Unable to restore this lesson version.",
        );
      } finally {
        setRestoringVersionId(null);
      }
    },
    [projectId, refresh, refreshVersions, versionMetadata?.currentVersionId],
  );

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

  // Load scene list keyed by project and revision
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
      .then((val) => {
        if (!cancelled) setSceneList({ kind: "ready", value: val });
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

  // Keep selection synced with URL hash / fallback to scene 0
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

  useEffect(() => {
    if (selectedSceneId === null) {
      setDetail({ kind: "loading" });
      return;
    }
    setDetail({ kind: "loading" });
    let cancelled = false;
    void fetchStoryboardSceneDetail(projectId, selectedSceneId)
      .then((val) => {
        if (!cancelled) setDetail({ kind: "ready", value: val });
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

  const onStoryboardChanged = useCallback(
    (message?: string) => {
      if (message !== undefined) setEditorMessage(message);
      invalidateStoryboardSceneList(projectId);
      setDetailAttempt((current) => current + 1);
      void refresh().catch(() => undefined);
      void loadValidation().catch(() => undefined);
      void runValidation();
    },
    [projectId, refresh, loadValidation, runValidation],
  );

  const runSceneMutation = useCallback(
    async (
      operation: () => Promise<StoryboardSceneListResponse>,
    ): Promise<void> => {
      setActionMessage(null);
      setEditing(true);
      try {
        const result = await operation();
        setSceneList({ kind: "ready", value: result });
        await refresh().catch(() => undefined);
      } catch (error) {
        setActionMessage(
          error instanceof Error
            ? error.message
            : "The storyboard could not be updated.",
        );
      } finally {
        setEditing(false);
      }
    },
    [refresh],
  );

  const handleAddScene = useCallback(() => {
    if (revision === null) return;
    void runSceneMutation(() =>
      addStoryboardScene(projectId, addTemplate, revision),
    );
  }, [addTemplate, projectId, revision, runSceneMutation]);

  const handleDuplicateScene = useCallback(
    (sceneId: string) => {
      if (revision === null) return;
      void runSceneMutation(() =>
        duplicateStoryboardScene(projectId, sceneId, revision),
      );
    },
    [projectId, revision, runSceneMutation],
  );

  const handleDeleteScene = useCallback(
    (sceneId: string) => {
      if (revision === null) return;
      if (!window.confirm("Delete this scene?")) return;
      void runSceneMutation(() =>
        deleteStoryboardScene(projectId, sceneId, revision),
      );
    },
    [projectId, revision, runSceneMutation],
  );

  const handleReorder = useCallback(
    (sceneIds: string[]) => {
      if (revision === null) return;
      void runSceneMutation(() =>
        reorderStoryboardScenes(projectId, sceneIds, revision),
      );
    },
    [projectId, revision, runSceneMutation],
  );

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

  const selectedDetail = detail.kind === "ready" ? detail.value : null;
  const teacherReplacement = selectedDetail
    ? teacherReplacementPreviewForScene(selectedDetail, teacherAssets)
    : undefined;
  const previewInput = selectedDetail
    ? buildScenePreviewInput(selectedDetail, undefined)
    : null;

  const totalDuration = listScenes.reduce((acc, s) => acc + s.durationSeconds, 0);

  if (view.kind === "loading")
    return (
      <section
        aria-labelledby="storyboard-heading"
        style={{
          padding: "40px 24px",
          textAlign: "center",
          color: "var(--color-text-muted, #BDB5C7)",
        }}
      >
        <h2 id="storyboard-heading" style={{ color: "var(--color-text, #F4F1F8)" }}>
          Storyboard
        </h2>
        <p role="status">Loading the storyboard…</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section
        aria-labelledby="storyboard-heading"
        style={{
          padding: "40px 24px",
          textAlign: "center",
          maxWidth: "500px",
          margin: "0 auto",
        }}
      >
        <h2 id="storyboard-heading" style={{ color: "var(--color-text, #F4F1F8)" }}>
          Storyboard
        </h2>
        <p role="alert" style={{ color: "var(--color-error-fg, #B42318)" }}>
          {view.message}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          style={{
            padding: "8px 16px",
            borderRadius: "6px",
            backgroundColor: "var(--color-brand, #A883FF)",
            color: "var(--color-on-brand, #1B1027)",
            border: "none",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </section>
    );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px 20px",
        minHeight: "calc(100vh - 80px)",
      }}
    >
      {/* Top Header & Overview Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
          paddingBottom: "12px",
          borderBottom: "1px solid var(--color-border, #3A3046)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1
              id="storyboard-heading"
              style={{
                margin: 0,
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--color-text, #F4F1F8)",
              }}
            >
              Storyboard
            </h1>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "9999px",
                backgroundColor: "rgba(168, 131, 255, 0.15)",
                color: "var(--color-brand, #A883FF)",
              }}
            >
              Focus Studio
            </span>
          </div>
          {projectTitle ? (
            <p style={{ margin: "2px 0 0", fontSize: "14px", color: "var(--color-text-muted, #BDB5C7)" }}>
              {projectTitle}
            </p>
          ) : null}

          <p
            role="status"
            style={{
              margin: "4px 0 0",
              fontSize: "13px",
              color: "var(--color-text-muted, #BDB5C7)",
            }}
          >
            {storyboardGenerationStateLabel(view.value.state)}
            {listScenes.length > 0 ? (
              <span>
                {" "}
                · <strong className="tabular-nums">{listScenes.length}</strong> scenes ·{" "}
                <strong className="tabular-nums">{totalDuration}s</strong> total duration
              </span>
            ) : null}
          </p>
        </div>

        {/* Global Header Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {view.value.canGenerate ? (
            <button
              type="button"
              onClick={() => void generate()}
              disabled={submitting || generating}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: "1px solid var(--color-border, #3A3046)",
                color: "var(--color-text, #F4F1F8)",
                fontSize: "13px",
                fontWeight: 500,
                cursor: submitting || generating ? "not-allowed" : "pointer",
              }}
            >
              {submitting || generating
                ? "Starting generation…"
                : storyboard === null
                  ? "Generate storyboard"
                  : "Regenerate storyboard"}
            </button>
          ) : null}

          <a
            href={`/workspace/${encodeURIComponent(projectId)}/preview`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 18px",
              borderRadius: "6px",
              backgroundColor: "var(--color-brand, #A883FF)",
              color: "var(--color-on-brand, #1B1027)",
              fontSize: "13px",
              fontWeight: 600,
              textDecoration: "none",
              boxShadow: "0 2px 8px rgba(168, 131, 255, 0.25)",
            }}
          >
            Preview lesson →
          </a>
        </div>
      </header>

      {/* Global Alerts & Warnings */}
      {view.value.stale ? (
        <div
          role="status"
          style={{
            padding: "10px 14px",
            borderRadius: "6px",
            backgroundColor: "rgba(138, 75, 8, 0.15)",
            border: "1px solid rgba(138, 75, 8, 0.3)",
            color: "var(--color-warning-fg, #FBBF24)",
            fontSize: "13px",
          }}
        >
          {view.value.staleReason ??
            "This storyboard is out of date. Review the narration, outline, source, or configuration before continuing."}
        </div>
      ) : null}

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert" style={{ margin: 0, padding: "10px 14px", borderRadius: "6px", backgroundColor: "rgba(180, 35, 24, 0.15)", border: "1px solid rgba(180, 35, 24, 0.3)", color: "#FCA5A5", fontSize: "13px" }}>
          {storyboardFailureMessage(view.value.latestJob.errorCode)}
        </p>
      ) : null}

      {view.value.latestSceneRegenerationJob?.state === "failed" ? (
        <p role="alert" style={{ margin: 0, padding: "10px 14px", borderRadius: "6px", backgroundColor: "rgba(180, 35, 24, 0.15)", border: "1px solid rgba(180, 35, 24, 0.3)", color: "#FCA5A5", fontSize: "13px" }}>
          {sceneRegenerationFailureMessage(
            view.value.latestSceneRegenerationJob.errorCode,
          )}
        </p>
      ) : null}

      {actionMessage !== null ? (
        <p role="alert" style={{ margin: 0, padding: "10px 14px", borderRadius: "6px", backgroundColor: "rgba(168, 131, 255, 0.15)", border: "1px solid rgba(168, 131, 255, 0.3)", color: "var(--color-text, #F4F1F8)", fontSize: "13px" }}>
          {actionMessage}
        </p>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} role="alert" style={{ margin: 0, padding: "8px 12px", borderRadius: "6px", backgroundColor: "rgba(180, 35, 24, 0.1)", color: "#FCA5A5", fontSize: "12px" }}>
          {warning}
        </p>
      ))}

      {view.value.approved !== null &&
      view.value.approved.id !== storyboard?.id ? (
        <p role="status" style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
          An approved storyboard still guides production until you review this draft.
        </p>
      ) : null}

      {storyboard === null ? (
        <div
          role="status"
          style={{
            padding: "48px 24px",
            textAlign: "center",
            backgroundColor: "var(--color-surface, #211A2B)",
            borderRadius: "12px",
            border: "1px solid var(--color-border, #3A3046)",
          }}
        >
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "var(--color-text-muted, #BDB5C7)" }}>
            Confirm the reviewed source, save the lesson configuration, approve the lesson outline, and generate narration before generating a storyboard.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile View Tabs Switcher (Visible on small screens) */}
          <div
            className="mobile-view-tabs"
            style={{
              display: "none",
              borderBottom: "1px solid var(--color-border, #3A3046)",
              marginBottom: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => setMobileTab("scenes")}
              style={{
                flex: 1,
                padding: "10px",
                fontSize: "13px",
                fontWeight: mobileTab === "scenes" ? 600 : 500,
                color: mobileTab === "scenes" ? "var(--color-brand, #A883FF)" : "var(--color-text-muted, #BDB5C7)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: mobileTab === "scenes" ? "2px solid var(--color-brand, #A883FF)" : "none",
              }}
            >
              Scenes ({listScenes.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("preview")}
              style={{
                flex: 1,
                padding: "10px",
                fontSize: "13px",
                fontWeight: mobileTab === "preview" ? 600 : 500,
                color: mobileTab === "preview" ? "var(--color-brand, #A883FF)" : "var(--color-text-muted, #BDB5C7)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: mobileTab === "preview" ? "2px solid var(--color-brand, #A883FF)" : "none",
              }}
            >
              Preview Canvas
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("details")}
              style={{
                flex: 1,
                padding: "10px",
                fontSize: "13px",
                fontWeight: mobileTab === "details" ? 600 : 500,
                color: mobileTab === "details" ? "var(--color-brand, #A883FF)" : "var(--color-text-muted, #BDB5C7)",
                backgroundColor: "transparent",
                border: "none",
                borderBottom: mobileTab === "details" ? "2px solid var(--color-brand, #A883FF)" : "none",
              }}
            >
              Scene Details
            </button>
          </div>

          {/* Three-Region Main Studio Workspace Layout */}
          <div
            className="storyboard-workspace-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "300px minmax(460px, 1fr) 420px",
              gap: "16px",
              alignItems: "start",
              minHeight: "680px",
            }}
          >
            {/* 1. Left Region: Scene Navigation */}
            <aside
              className="storyboard-left-panel"
              style={{
                display: "flex",
                flexDirection: "column",
                height: "680px",
                backgroundColor: "var(--color-surface, #211A2B)",
                borderRadius: "12px",
                border: "1px solid var(--color-border, #3A3046)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--color-border, #3A3046)",
                  backgroundColor: "var(--color-surface-subtle, #292035)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 id="scenes" style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text, #F4F1F8)" }}>
                    Scene list
                  </h3>
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }} className="tabular-nums">
                    {listScenes.length} scenes
                  </span>
                </div>

                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    marginTop: "10px",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--color-text-muted, #BDB5C7)" }}>
                    Template{" "}
                    <select
                      aria-label="New scene template"
                      onChange={(event) =>
                        setAddTemplate(event.target.value as SceneTemplate)
                      }
                      value={addTemplate}
                      style={{
                        backgroundColor: "var(--color-surface, #211A2B)",
                        color: "var(--color-text, #F4F1F8)",
                        border: "1px solid var(--color-border, #3A3046)",
                        borderRadius: "4px",
                        padding: "3px 6px",
                        fontSize: "11px",
                      }}
                    >
                      {sceneTemplateValues.map((template) => (
                        <option key={template} value={template}>
                          {template}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddScene}
                    disabled={editing || revision === null}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      backgroundColor: "var(--color-brand, #A883FF)",
                      color: "var(--color-on-brand, #1B1027)",
                      border: "none",
                      fontSize: "11px",
                      fontWeight: 600,
                      cursor: editing || revision === null ? "not-allowed" : "pointer",
                    }}
                  >
                    + Add
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSceneId !== null)
                        handleDuplicateScene(selectedSceneId);
                    }}
                    disabled={editing || selectedSceneId === null}
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid var(--color-border, #3A3046)",
                      color: "var(--color-text, #F4F1F8)",
                      fontSize: "11px",
                      cursor: editing || selectedSceneId === null ? "not-allowed" : "pointer",
                    }}
                  >
                    Duplicate
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSceneId !== null)
                        handleDeleteScene(selectedSceneId);
                    }}
                    disabled={
                      editing || selectedSceneId === null || listScenes.length <= 1
                    }
                    style={{
                      padding: "3px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(180, 35, 24, 0.15)",
                      border: "1px solid rgba(180, 35, 24, 0.3)",
                      color: "#FCA5A5",
                      fontSize: "11px",
                      cursor:
                        editing || selectedSceneId === null || listScenes.length <= 1
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {sceneList.kind === "loading" ? (
                  <p role="status" style={{ padding: "16px", margin: 0, fontSize: "13px", color: "var(--color-text-muted, #BDB5C7)" }}>
                    Loading the scene list…
                  </p>
                ) : sceneList.kind === "failed" ? (
                  <p role="alert" style={{ padding: "16px", margin: 0, fontSize: "13px", color: "var(--color-error-fg, #B42318)" }}>
                    {sceneList.message}
                  </p>
                ) : (
                  <SceneList
                    scenes={listScenes}
                    selectedSceneId={selectedSceneId}
                    stale={view.value.stale}
                    onSelect={selectScene}
                    onReorder={handleReorder}
                  />
                )}
              </div>
            </aside>

            {/* 2. Center Region: Dominant Real 16:9 Selected Scene Stage */}
            <main
              className="storyboard-center-canvas"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                minWidth: 0,
              }}
            >
              {editorMessage !== null ? (
                <p role="status" style={{ margin: 0, padding: "8px 12px", borderRadius: "6px", backgroundColor: "rgba(168, 131, 255, 0.15)", color: "var(--color-text, #F4F1F8)", fontSize: "12px" }}>
                  {editorMessage}
                </p>
              ) : null}

              {/* Dominant 16:9 Scene Preview Stage */}
              <div
                style={{
                  backgroundColor: "#0F0B14",
                  borderRadius: "12px",
                  border: "1px solid var(--color-border, #3A3046)",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Stage Header */}
                <div
                  style={{
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    fontSize: "12px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontWeight: 700, color: "var(--color-brand, #A883FF)" }}>
                      {selectedDetail ? `Scene ${selectedDetail.scene.order}` : "No Scene"}
                    </span>
                    <span style={{ color: "var(--color-text-muted, #BDB5C7)" }}>
                      {selectedDetail?.scene.template ?? ""}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="tabular-nums" style={{ color: "var(--color-text-muted, #BDB5C7)" }}>
                      {selectedDetail ? `${selectedDetail.scene.durationSeconds}s` : ""}
                    </span>
                  </div>
                </div>

                {/* Dominant Canvas 16:9 */}
                <section
                  aria-label="Selected scene preview"
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16 / 9",
                    backgroundColor: "#000",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {selectedSceneId === null ? (
                    <p role="status" style={{ color: "var(--color-text-muted, #BDB5C7)", fontSize: "14px" }}>
                      Select a scene to see its detail.
                    </p>
                  ) : detail.kind === "loading" ? (
                    <p role="status" style={{ color: "var(--color-text-muted, #BDB5C7)", fontSize: "14px" }}>
                      Loading scene preview…
                    </p>
                  ) : detail.kind === "failed" ? (
                    <div style={{ padding: "20px", textAlign: "center" }}>
                      <p role="alert" style={{ color: "#FCA5A5", margin: "0 0 10px", fontSize: "13px" }}>
                        {detail.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDetailAttempt((c) => c + 1)}
                        style={{
                          padding: "6px 12px",
                          borderRadius: "4px",
                          backgroundColor: "var(--color-brand, #A883FF)",
                          color: "var(--color-on-brand, #1B1027)",
                          border: "none",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        Try again
                      </button>
                    </div>
                  ) : teacherReplacement !== undefined ? (
                    <figure style={{ margin: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <img
                        alt="Selected teacher replacement in scene preview"
                        src={teacherReplacement.previewUrl}
                        style={{ display: "block", maxHeight: "85%", maxWidth: "90%", objectFit: "contain" }}
                      />
                      <figcaption style={{ fontSize: "11px", color: "var(--color-text-muted, #BDB5C7)", marginTop: "4px" }}>
                        Teacher replacement preview
                      </figcaption>
                    </figure>
                  ) : canPreviewScene(detail.value) && previewInput !== null ? (
                    <div style={{ width: "100%", height: "100%" }}>
                      <ScenePreviewPlayer input={previewInput} />
                    </div>
                  ) : (
                    <section
                      aria-label="Scene preview unavailable"
                      data-testid="scene-preview-unavailable"
                      role="status"
                      style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted, #BDB5C7)" }}
                    >
                      <h4 style={{ margin: "0 0 6px", color: "var(--color-text, #F4F1F8)", fontSize: "15px" }}>
                        Preview unavailable
                      </h4>
                      <p style={{ margin: 0, fontSize: "13px", maxWidth: "340px" }}>
                        This scene references media that is not available yet. A preview will appear once scene media is generated.
                      </p>
                    </section>
                  )}
                </section>
              </div>

              {/* Bottom Quick Context Dock */}
              {selectedDetail ? (
                <div
                  style={{
                    padding: "12px 16px",
                    backgroundColor: "var(--color-surface, #211A2B)",
                    borderRadius: "10px",
                    border: "1px solid var(--color-border, #3A3046)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <p style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
                      {selectedDetail.scene.scene.title ?? `Scene ${selectedDetail.scene.order}`}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedDetail.scene.scene.narration}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedSceneId !== null)
                          handleDuplicateScene(selectedSceneId);
                      }}
                      disabled={editing}
                      style={{
                        padding: "6px 10px",
                        fontSize: "12px",
                        borderRadius: "5px",
                        backgroundColor: "rgba(255, 255, 255, 0.06)",
                        border: "1px solid var(--color-border, #3A3046)",
                        color: "var(--color-text, #F4F1F8)",
                        cursor: "pointer",
                      }}
                    >
                      Duplicate scene
                    </button>
                  </div>
                </div>
              ) : null}
            </main>

            {/* 3. Right Region: Contextual Inspector */}
            <aside
              className="storyboard-right-panel"
              style={{
                height: "680px",
                minWidth: 0,
              }}
            >
              {selectedSceneId === null ? (
                <div
                  role="status"
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    backgroundColor: "var(--color-surface, #211A2B)",
                    borderRadius: "12px",
                    border: "1px solid var(--color-border, #3A3046)",
                    color: "var(--color-text-muted, #BDB5C7)",
                  }}
                >
                  <p>Select a scene to see its detail.</p>
                </div>
              ) : detail.kind === "loading" ? (
                <div
                  role="status"
                  style={{
                    padding: "24px",
                    textAlign: "center",
                    backgroundColor: "var(--color-surface, #211A2B)",
                    borderRadius: "12px",
                    border: "1px solid var(--color-border, #3A3046)",
                    color: "var(--color-text-muted, #BDB5C7)",
                  }}
                >
                  <p>Loading the selected scene…</p>
                </div>
              ) : detail.kind === "failed" ? (
                <section
                  aria-label="Selected scene detail"
                  style={{
                    padding: "24px",
                    backgroundColor: "var(--color-surface, #211A2B)",
                    borderRadius: "12px",
                    border: "1px solid var(--color-border, #3A3046)",
                  }}
                >
                  <p role="alert" style={{ color: "#FCA5A5" }}>{detail.message}</p>
                  <button
                    type="button"
                    onClick={() => setDetailAttempt((c) => c + 1)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "4px",
                      backgroundColor: "var(--color-brand, #A883FF)",
                      color: "var(--color-on-brand, #1B1027)",
                      border: "none",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
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
                  validation={validation}
                  validationBusy={validationBusy}
                  onRunValidation={() => void runValidation()}
                  onAcknowledgeValidation={(id, hash) =>
                    void acknowledgeValidation(id, hash)
                  }
                  onNavigateScene={(sId) => {
                    if (sId !== null) selectScene(sId);
                  }}
                  versionMetadata={versionMetadata}
                  versionPreview={versionPreview}
                  restoringVersionId={restoringVersionId}
                  savingVersion={savingVersion}
                  onSaveVersion={() => void saveVersion()}
                  onPreviewVersion={(vId) => void previewVersion(vId)}
                  onRestoreVersion={(vId) => void restoreVersion(vId)}
                />
              )}
            </aside>
          </div>

          <style jsx>{`
            @media (max-width: 1024px) {
              .storyboard-workspace-grid {
                grid-template-columns: 240px 1fr !important;
              }
              .storyboard-right-panel {
                grid-column: span 2;
                height: auto !important;
              }
            }
            @media (max-width: 768px) {
              .mobile-view-tabs {
                display: flex !important;
              }
              .storyboard-workspace-grid {
                display: block !important;
              }
              .storyboard-left-panel {
                display: ${mobileTab === "scenes" ? "flex" : "none"} !important;
                height: 500px !important;
                margin-bottom: 16px;
              }
              .storyboard-center-canvas {
                display: ${mobileTab === "preview" ? "flex" : "none"} !important;
                margin-bottom: 16px;
              }
              .storyboard-right-panel {
                display: ${mobileTab === "details" ? "block" : "none"} !important;
                height: auto !important;
              }
            }
          `}</style>
        </>
      )}
    </div>
  );
}
