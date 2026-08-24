"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FullLessonPreviewPlayer } from "@avlp/scene-library";
import { previewManifestSchema, type PreviewManifest } from "@avlp/schemas";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export function FullLessonPreview({
  projectId,
  initialManifest,
}: {
  projectId: string;
  initialManifest: unknown;
}) {
  const [quality, setQuality] = useState<"standard" | "low">("standard");
  const [manifest, setManifest] = useState(initialManifest as PreviewManifest);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
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
  }, [refreshSignedUrls]);
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
  return (
    <section data-quality={quality}>
      <label>
        Preview quality{" "}
        <select
          value={quality}
          onChange={(event) =>
            setQuality(event.target.value as "standard" | "low")
          }
        >
          <option value="standard">Standard</option>
          <option value="low">Lower quality</option>
        </select>
      </label>
      <button
        disabled={refreshing}
        onClick={() => void refreshSignedUrls()}
        type="button"
      >
        {refreshing ? "Refreshing preview media…" : "Refresh preview media"}
      </button>
      {refreshError !== null ? <p role="alert">{refreshError}</p> : null}
      {stale.length > 0 ? (
        <section role="alert">
          <p>
            {stale.length} scene{stale.length === 1 ? " is" : "s are"} outdated
            or missing media. Preview timing is shown, but this is not render-ready.
          </p>
          <ul>
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
              return <li key={entry.sceneId}>Scene {index + 1}: missing or outdated {issues.join(", ") || "artifacts"}.</li>;
            })}
          </ul>
        </section>
      ) : null}
      <div style={{ maxWidth: quality === "low" ? 960 : 1920 }}>
        <FullLessonPreviewPlayer
          input={input}
          onMediaError={() => void refreshSignedUrls()}
          quality={quality}
        />
      </div>
      <nav aria-label="Edit preview scene">
        {manifest.storyboard.scenes.map((scene, index) => (
          <a
            key={scene.stableSceneId}
            href={`/workspace/${encodeURIComponent(projectId)}/storyboard#scene=${encodeURIComponent(scene.stableSceneId)}`}
          >
            Edit scene {index + 1}
          </a>
        ))}
      </nav>
    </section>
  );
}
