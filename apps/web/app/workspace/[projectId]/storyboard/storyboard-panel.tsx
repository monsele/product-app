"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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
import {
  ArrowRight as ArrowRightIcon,
  Copy as CopyIcon,
  Plus as PlusIcon,
} from "@phosphor-icons/react";
import styles from "./storyboard.module.css";

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
  const reduceMotion = useReducedMotion();

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
      value === null || storyboard === null
        ? []
        : storyboardValidationWarnings(value.validation),
    [value, storyboard],
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
      <section aria-labelledby="storyboard-heading" className={styles.stateShell}>
        <h2 id="storyboard-heading">Storyboard</h2>
        <p role="status">Loading the storyboard…</p>
      </section>
    );

  if (view.kind === "failed")
    return (
      <section aria-labelledby="storyboard-heading" className={styles.stateShell}>
        <h2 id="storyboard-heading">Storyboard</h2>
        <p role="alert" className={styles.stateError}>
          {view.message}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className={`${styles.button} ${styles.buttonPrimary}`}
        >
          Try again
        </button>
      </section>
    );

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className={styles.headingRow}>
            <h1 id="storyboard-heading" className={styles.title}>
              Storyboard
            </h1>
            <span className={styles.badge}>Focus Studio</span>
          </div>

          {projectTitle ? (
            <p className={styles.projectTitle}>{projectTitle}</p>
          ) : null}

          <p role="status" className={styles.headerStatus}>
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

        <div className={styles.headerActions}>
          {view.value.canGenerate ? (
            <button
              type="button"
              onClick={() => void generate()}
              disabled={submitting || generating}
              className={`${styles.button} ${styles.buttonSecondary}`}
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
            className={`${styles.button} ${styles.buttonPrimary}`}
          >
            Preview lesson
            <ArrowRightIcon size={16} weight="bold" aria-hidden />
          </a>
        </div>
      </header>

      {view.value.stale ? (
        <div role="status" className={`${styles.alert} ${styles.alertWarning}`}>
          {view.value.staleReason ??
            "This storyboard is out of date. Review the narration, outline, source, or configuration before continuing."}
        </div>
      ) : null}

      {view.value.latestJob?.state === "failed" ? (
        <p role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {storyboardFailureMessage(view.value.latestJob.errorCode)}
        </p>
      ) : null}

      {view.value.latestSceneRegenerationJob?.state === "failed" ? (
        <p role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {sceneRegenerationFailureMessage(
            view.value.latestSceneRegenerationJob.errorCode,
          )}
        </p>
      ) : null}

      {actionMessage !== null ? (
        <p role="alert" className={`${styles.alert} ${styles.alertInfo}`}>
          {actionMessage}
        </p>
      ) : null}

      {warnings.map((warning) => (
        <p key={warning} role="alert" className={`${styles.alert} ${styles.alertError}`}>
          {warning}
        </p>
      ))}

      {view.value.approved !== null &&
      view.value.approved.id !== storyboard?.id ? (
        <p role="status" className={styles.noteMuted}>
          An approved storyboard still guides production until you review this draft.
        </p>
      ) : null}

      {storyboard === null ? (
        <div role="status" className={styles.emptyState}>
          <p>
            Confirm the reviewed source, save the lesson configuration, approve the
            lesson outline, and generate narration before generating a storyboard.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.tabs}>
            <button
              type="button"
              onClick={() => setMobileTab("scenes")}
              className={`${styles.tab} ${mobileTab === "scenes" ? styles.tabActive : ""}`}
            >
              Scenes ({listScenes.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("preview")}
              className={`${styles.tab} ${mobileTab === "preview" ? styles.tabActive : ""}`}
            >
              Preview canvas
            </button>
            <button
              type="button"
              onClick={() => setMobileTab("details")}
              className={`${styles.tab} ${mobileTab === "details" ? styles.tabActive : ""}`}
            >
              Scene details
            </button>
          </div>

          <div className={styles.grid}>
            {/* Left region: ordered scene navigation */}
            <aside
              className={`${styles.leftPanel} ${mobileTab === "scenes" ? "" : styles.regionHidden}`}
            >
              <div className={styles.panelHead}>
                <div className={styles.panelHeadRow}>
                  <h3 id="scenes" className={styles.panelTitle}>
                    Scene list
                  </h3>
                  <span className={`${styles.panelCount} tabular-nums`}>
                    {listScenes.length} scenes
                  </span>
                </div>

                <div className={styles.toolbar}>
                  <label className={styles.fieldLabel}>
                    Template
                    <select
                      aria-label="New scene template"
                      onChange={(event) =>
                        setAddTemplate(event.target.value as SceneTemplate)
                      }
                      value={addTemplate}
                      className={styles.select}
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
                    className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonCompact}`}
                  >
                    <PlusIcon size={14} weight="bold" aria-hidden />
                    Add
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSceneId !== null)
                        handleDuplicateScene(selectedSceneId);
                    }}
                    disabled={editing || selectedSceneId === null}
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
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
                    className={`${styles.button} ${styles.buttonDanger} ${styles.buttonCompact}`}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className={styles.scroller}>
                {sceneList.kind === "loading" ? (
                  <div role="status" aria-label="Loading the scene list">
                    {[0, 1, 2, 3, 4, 5].map((row) => (
                      <div key={row} className={styles.skeletonRow}>
                        <span className={styles.skeletonLineWide} />
                        <span className={styles.skeletonLine} />
                      </div>
                    ))}
                  </div>
                ) : sceneList.kind === "failed" ? (
                  <p role="alert" className={`${styles.scrollerNote} ${styles.stateError}`}>
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

            {/* Center region: the dominant 16:9 scene stage */}
            <main
              className={`${styles.centerCanvas} ${mobileTab === "preview" ? "" : styles.regionHidden}`}
            >
              {editorMessage !== null ? (
                <p role="status" className={`${styles.alert} ${styles.alertInfo}`}>
                  {editorMessage}
                </p>
              ) : null}

              <div className={styles.stage}>
                <div className={styles.stageHeader}>
                  <div className={styles.stageHeaderGroup}>
                    <span className={styles.stageSceneName}>
                      {selectedDetail
                        ? `Scene ${selectedDetail.scene.order}`
                        : "No scene selected"}
                    </span>
                    <span className={styles.stageMeta}>
                      {selectedDetail?.scene.template ?? ""}
                    </span>
                  </div>

                  <span className={`${styles.stageMeta} tabular-nums`}>
                    {selectedDetail ? `${selectedDetail.scene.durationSeconds}s` : ""}
                  </span>
                </div>

                <section aria-label="Selected scene preview" className={styles.canvas}>
                  {selectedSceneId === null ? (
                    <p role="status" className={styles.canvasNote}>
                      Select a scene to see its detail.
                    </p>
                  ) : detail.kind === "loading" ? (
                    <p role="status" className={styles.canvasNote}>
                      Loading scene preview…
                    </p>
                  ) : detail.kind === "failed" ? (
                    <div className={styles.canvasFallback}>
                      <p role="alert" className={styles.stateError}>
                        {detail.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => setDetailAttempt((c) => c + 1)}
                        className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonCompact}`}
                      >
                        Try again
                      </button>
                    </div>
                  ) : teacherReplacement !== undefined ? (
                    <figure className={styles.replacementFigure}>
                      <img
                        alt="Selected teacher replacement in scene preview"
                        src={teacherReplacement.previewUrl}
                      />
                      <figcaption>Teacher replacement preview</figcaption>
                    </figure>
                  ) : canPreviewScene(detail.value) && previewInput !== null ? (
                    <div className={styles.canvasFill}>
                      <ScenePreviewPlayer input={previewInput} />
                    </div>
                  ) : (
                    <section
                      aria-label="Scene preview unavailable"
                      data-testid="scene-preview-unavailable"
                      role="status"
                      className={styles.canvasFallback}
                    >
                      <h4>Preview unavailable</h4>
                      <p>
                        This scene references media that is not available yet. A
                        preview will appear once scene media is generated.
                      </p>
                    </section>
                  )}
                </section>
              </div>

              {selectedDetail ? (
                <div className={styles.dock}>
                  <div className={styles.dockText}>
                    <p className={styles.dockTitle}>
                      {selectedDetail.scene.scene.title ??
                        `Scene ${selectedDetail.scene.order}`}
                    </p>
                    <p className={styles.dockNarration}>
                      {selectedDetail.scene.scene.narration}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (selectedSceneId !== null)
                        handleDuplicateScene(selectedSceneId);
                    }}
                    disabled={editing}
                    className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonCompact}`}
                  >
                    <CopyIcon size={14} aria-hidden />
                    Duplicate scene
                  </button>
                </div>
              ) : null}
            </main>

            {/* Right region: contextual inspector */}
            <aside
              className={`${styles.rightPanel} ${mobileTab === "details" ? "" : styles.regionHidden}`}
            >
              {selectedSceneId === null ? (
                <div role="status" className={styles.inspectorState}>
                  <p>Select a scene to see its detail.</p>
                </div>
              ) : detail.kind === "loading" ? (
                <div role="status" className={styles.inspectorState}>
                  <p>Loading the selected scene…</p>
                </div>
              ) : detail.kind === "failed" ? (
                <section aria-label="Selected scene detail" className={styles.inspectorState}>
                  <p role="alert" className={styles.stateError}>
                    {detail.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDetailAttempt((c) => c + 1)}
                    className={`${styles.button} ${styles.buttonPrimary} ${styles.buttonCompact}`}
                  >
                    Try again
                  </button>
                </section>
              ) : (
                <motion.div
                  key={selectedSceneId}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                >
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
                </motion.div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
