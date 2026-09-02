"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
import type { SceneAudioStatusResponse } from "@avlp/schemas";
import { toast } from "../../../../components/ui/toast-provider";
import { useTaskStatusNotification } from "../../../../lib/use-task-notification";

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

export function sceneAudioFailureMessage(code: string | null): string | null {
  if (code === null) return null;
  switch (code) {
    case "PROVIDER_REQUEST_REJECTED":
      return "The audio provider rejected this request. Check the configured model and voice, then retry.";
    case "TTS_PROVIDER_MISMATCH":
      return "The queued audio request no longer matches the configured provider. Retry this scene.";
    case "FORCED_ALIGNMENT_UNAVAILABLE":
    case "FORCED_ALIGNMENT_INVALID":
      return "Audio was created, but caption timing could not be produced. Retry after checking the alignment provider.";
    case "READY_AUDIO_CAPTIONS_UNRECOVERABLE":
      return "This older audio file has no usable caption timing. Regenerate the scene audio.";
    default:
      return `Audio generation failed (${code}). Retry this scene.`;
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
  onStatusChange,
}: {
  projectId: string;
  sceneId: string;
  disabled: boolean;
  onStatusChange?: (audio: SceneAudioStatusResponse) => void;
}): JSX.Element {
  const [audio, setAudio] = useState<SceneAudioStatusResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Signed playback URLs are short-lived, so fetch one only when the teacher
  // asks to listen rather than on every status poll.
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [loadingPlayback, setLoadingPlayback] = useState(false);
  const base = `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`;
  const refresh = useCallback(async () => {
    const response = await fetch(apiUrl(`${base}/audio-status`), {
      credentials: "include",
      cache: "no-store",
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(payload));
    setAudio(payload as SceneAudioStatusResponse);
    onStatusChange?.(payload as SceneAudioStatusResponse);
  }, [base, onStatusChange]);
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
  useTaskStatusNotification({
    taskName: "Scene audio generation",
    status: audio?.status,
    successMessage: "Narration audio for this scene generated successfully.",
    errorMessage:
      audio?.fitWarning ||
      sceneAudioFailureMessage(audio?.failureCode ?? null) ||
      "Narration audio generation failed.",
  });

  const generate = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      toast.info("Generating narration audio for scene...");
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
      onStatusChange?.(payload as SceneAudioStatusResponse);
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : "Unable to start narration audio generation.";
      setMessage(errorMsg);
      toast.error(errorMsg);
    } finally {
      setBusy(false);
    }
  }, [base, onStatusChange]);
  // A regenerated take invalidates any URL we already minted.
  useEffect(() => {
    if (audio?.status !== "ready") setPlaybackUrl(null);
  }, [audio?.status, audio?.durationMs]);

  const loadPlayback = useCallback(async () => {
    setLoadingPlayback(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl(`${base}/audio`), {
        credentials: "include",
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(payload));
      setPlaybackUrl((payload as { url: string }).url);
    } catch (error: unknown) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load narration audio for playback.",
      );
    } finally {
      setLoadingPlayback(false);
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
      {audio?.status === "failed" && audio.failureCode !== null ? (
        <p role="alert">{sceneAudioFailureMessage(audio.failureCode)}</p>
      ) : null}
      {message !== null ? <p role="alert">{message}</p> : null}
      {audio?.status === "ready" ? (
        playbackUrl === null ? (
          <button
            type="button"
            data-testid={`scene-audio-listen-${sceneId}`}
            disabled={loadingPlayback}
            onClick={() => void loadPlayback()}
          >
            {loadingPlayback ? "Loading…" : "Listen"}
          </button>
        ) : (
          <audio
            controls
            autoPlay
            preload="none"
            src={playbackUrl}
            aria-label="Scene narration audio playback"
            data-testid={`scene-audio-player-${sceneId}`}
            onError={() =>
              setMessage(
                "Narration audio could not be played. Reload and try again.",
              )
            }
          />
        )
      ) : null}
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
