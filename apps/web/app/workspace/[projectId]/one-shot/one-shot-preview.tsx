"use client";

/**
 * ST-106 — the awaiting-render-approval preview: the existing full-lesson
 * player fed from the preview manifest, plus the latest validation run's
 * warnings, read-only. Acknowledging or fixing them is editor work.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FullLessonPreviewPlayer } from "@avlp/scene-library";
import {
  lessonValidationRunSchema,
  previewManifestSchema,
  type PreviewManifest,
  type ValidationIssue,
} from "@avlp/schemas";
import { Button } from "../../../../components/ui/button";
import { apiUrl } from "../../../../lib/one-shot";
import { previewPlayerInput } from "../preview/preview-player";
import { ValidationWarnings } from "./one-shot-views";
import styles from "./one-shot.module.css";

type ManifestState =
  | { kind: "loading" }
  | { kind: "ready"; manifest: PreviewManifest }
  | { kind: "error" };

export function OneShotPreview({ projectId }: Readonly<{ projectId: string }>) {
  const [manifest, setManifest] = useState<ManifestState>({ kind: "loading" });
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);

  const loadManifest = useCallback(async () => {
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/preview-manifest`),
        { credentials: "include", cache: "no-store" },
      );
      const parsed = response.ok
        ? previewManifestSchema.safeParse(await response.json())
        : null;
      setManifest(
        parsed?.success === true
          ? { kind: "ready", manifest: parsed.data }
          : { kind: "error" },
      );
    } catch {
      setManifest({ kind: "error" });
    }
  }, [projectId]);

  useEffect(() => {
    void loadManifest();
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/validation`),
          { credentials: "include", cache: "no-store" },
        );
        const payload: unknown = response.ok ? await response.json() : null;
        const run =
          typeof payload === "object" && payload !== null && "run" in payload
            ? lessonValidationRunSchema.safeParse(payload.run)
            : null;
        if (!cancelled && run?.success === true) setIssues(run.data.issues);
      } catch {
        // Warnings are advisory; a failed read leaves the list empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadManifest, projectId]);

  const input = useMemo(
    () =>
      manifest.kind === "ready" ? previewPlayerInput(manifest.manifest) : null,
    [manifest],
  );

  return (
    <>
      <section
        aria-label="Lesson preview"
        className={`${styles.player} ${input === null ? styles.playerPlaceholder : ""}`}
        data-testid="one-shot-player"
      >
        {input !== null ? (
          <FullLessonPreviewPlayer
            input={input}
            onMediaError={() => void loadManifest()}
            quality="standard"
          />
        ) : manifest.kind === "loading" ? (
          <p role="status">Loading the preview…</p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
            }}
          >
            <p role="alert" style={{ margin: 0 }}>
              The preview could not be loaded.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="compact"
              onClick={() => void loadManifest()}
            >
              Try again
            </Button>
          </div>
        )}
      </section>
      <ValidationWarnings issues={issues} />
    </>
  );
}
