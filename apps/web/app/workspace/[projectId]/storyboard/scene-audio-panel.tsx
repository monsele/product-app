"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
import type { SceneAudioStatusResponse } from "@avlp/schemas";

const apiUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

export function sceneAudioStatusLabel(
  status: SceneAudioStatusResponse["status"],
): string {
  switch (status) {
    case "queued":
      return "Audio generation is queued.";
    case "generating":
      return "Generating narration audio…";
    case "ready":
      return "Narration audio is ready.";
    case "stale":
      return "Narration audio needs regeneration.";
    case "failed":
      return "Narration audio generation failed.";
  }
}

export function shouldPollSceneAudio(
  status: SceneAudioStatusResponse["status"] | undefined,
): boolean {
  return status === "queued" || status === "generating";
}

export function isSceneAudioGenerationDisabled(input: {
  disabled: boolean;
  busy: boolean;
  status: SceneAudioStatusResponse["status"] | undefined;
}): boolean {
  return input.disabled || input.busy || shouldPollSceneAudio(input.status);
}

function errorMessage(value: unknown): string {
  return typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "object" &&
    value.error !== null &&
    "message" in value.error &&
    typeof value.error.message === "string"
    ? value.error.message
    : "Unable to update narration audio.";
}

export function SceneAudioPanel({
  projectId,
  sceneId,
  disabled,
}: {
  projectId: string;
  sceneId: string;
  disabled: boolean;
}): JSX.Element {
  const [audio, setAudio] = useState<SceneAudioStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const base = `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`;
  const refresh = useCallback(async () => {
    const response = await fetch(apiUrl(`${base}/audio-status`), {
      credentials: "include",
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(payload));
    setAudio(payload as SceneAudioStatusResponse);
  }, [base]);
  useEffect(() => {
    void refresh().catch((error: unknown) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load narration audio status.",
      ),
    );
  }, [refresh]);
  useEffect(() => {
    if (!shouldPollSceneAudio(audio?.status)) return;
    const interval = window.setInterval(
      () => void refresh().catch(() => undefined),
      3_000,
    );
    return () => window.clearInterval(interval);
  }, [audio?.status, refresh]);
  const generate = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl(`${base}/audio/generate`), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: globalThis.crypto.randomUUID(),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload));
      setAudio(payload as SceneAudioStatusResponse);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start narration audio generation.",
      );
    } finally {
      setBusy(false);
    }
  }, [base]);
  const retry = audio?.retryable === true;
  return (
    <section
      aria-label="Scene narration audio"
      data-testid={`scene-audio-${sceneId}`}
    >
      <h4>Narration audio</h4>
      <p role="status">
        {audio === null
          ? "Loading audio status…"
          : sceneAudioStatusLabel(audio.status)}
      </p>
      {audio?.durationMs !== null && audio?.durationMs !== undefined ? (
        <p>Duration: {(audio.durationMs / 1000).toFixed(1)} seconds.</p>
      ) : null}
      {audio?.fitWarning !== null && audio?.fitWarning !== undefined ? (
        <p role="alert">{audio.fitWarning}</p>
      ) : null}
      {message !== null ? <p role="alert">{message}</p> : null}
      <button
        type="button"
        data-testid={`scene-audio-generate-${sceneId}`}
        disabled={isSceneAudioGenerationDisabled({
          disabled,
          busy,
          status: audio?.status,
        })}
        onClick={() => void generate()}
      >
        {busy ? "Starting…" : retry ? "Retry audio" : "Generate audio"}
      </button>
    </section>
  );
}
