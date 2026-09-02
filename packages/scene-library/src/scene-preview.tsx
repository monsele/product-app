"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Audio, useCurrentFrame } from "remotion";
import React, { useEffect, useRef, useState, type JSX } from "react";
import { z } from "zod";
import { sceneSpecSchema, type SceneSpec } from "@avlp/schemas";
import {
  ScenePreviewRuntime,
  validateScene,
  type ResolvedSceneAsset,
} from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";
import { videoTheme } from "@avlp/design-system/video-theme";

/** Object storage in local dev is signed against a plain-HTTP loopback
 * endpoint (see OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT), mirroring the
 * isLocalEndpoint allowance in @avlp/storage. Any non-loopback host still
 * must be HTTPS. */
const LOOPBACK_HTTP_URL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/[^\s]*$/i;

const fixtureOrSignedUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      /^https:\/\/[^\s]+$/i.test(value) ||
      /^\/assets\/[a-z0-9/_-]+\.(png|jpe?g|webp|mp3|wav|m4a)$/i.test(value) ||
      /^data:(image\/(png|jpeg|webp)|audio\/(mpeg|wav|mp4));base64,[a-z0-9+/=]+$/i.test(
        value,
      ) ||
      LOOPBACK_HTTP_URL_PATTERN.test(value),
    "Media URLs must be HTTPS signed URLs or approved local fixtures.",
  );

export const captionCueSchema = z
  .object({
    endFrame: z.number().int().nonnegative(),
    startFrame: z.number().int().nonnegative(),
    text: z.string().min(1).max(1_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endFrame <= value.startFrame)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Caption endFrame must be after startFrame.",
        path: ["endFrame"],
      });
  });
export type CaptionCue = z.infer<typeof captionCueSchema>;

export const previewAssetManifestSchema = z
  .object({
    assets: z.record(
      z
        .object({
          altText: z.string().min(1).max(2_000),
          assetId: z.string().uuid(),
          source: z.enum(["library", "source"]),
          src: fixtureOrSignedUrlSchema,
        })
        .strict(),
    ),
    audio: z
      .object({
        assetId: z.string().uuid(),
        src: fixtureOrSignedUrlSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
export type PreviewAssetManifest = z.infer<typeof previewAssetManifestSchema>;

export const scenePreviewInputSchema = z
  .object({
    captions: z.array(captionCueSchema).max(100).default([]),
    manifest: previewAssetManifestSchema,
    scene: sceneSpecSchema,
    transitionContext: z
      .object({
        nextLabel: z.string().min(1).max(160).optional(),
        previousLabel: z.string().min(1).max(160).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ScenePreviewInput = z.infer<typeof scenePreviewInputSchema>;

export type PreviewInputResult =
  | Readonly<{
      input: ScenePreviewInput;
      ok: true;
      resolvedAssets: Readonly<Record<string, ResolvedSceneAsset>>;
    }>
  | Readonly<{ message: string; ok: false }>;

export function getScenePreviewFrame(
  requestedFrame: number,
  durationInFrames: number,
): number {
  return Math.min(
    Math.max(0, Math.floor(requestedFrame)),
    Math.max(0, durationInFrames - 1),
  );
}

export function formatAudioPlaybackError(error: Error): string {
  return `Audio for this scene could not play: ${error.message}. Refresh its authorized media and try again.`;
}

export function parseScenePreviewInput(input: unknown): PreviewInputResult {
  const parsed = scenePreviewInputSchema.safeParse(input);
  if (!parsed.success)
    return Object.freeze({
      message: parsed.error.issues.map((issue) => issue.message).join(" "),
      ok: false as const,
    });
  const resolvedAssets = parsed.data.manifest.assets;
  for (const binding of parsed.data.scene.assetBindings)
    if (resolvedAssets[binding.assetId] === undefined)
      return Object.freeze({
        message: `Missing preview asset for ${binding.slot}. Refresh the preview media and try again.`,
        ok: false as const,
      });
  const issues = validateScene(parsed.data.scene, {
    requireResolvedAssets: true,
    resolvedAssets,
  });
  const blocking = issues.find((issue) => issue.severity === "error");
  if (blocking !== undefined)
    return Object.freeze({
      message: `${blocking.fieldPath}: ${blocking.message} ${blocking.suggestedCorrection}`,
      ok: false as const,
    });
  return Object.freeze({
    input: parsed.data,
    ok: true as const,
    resolvedAssets,
  });
}

function CaptionOverlay({
  cues,
}: Readonly<{ cues: readonly CaptionCue[] }>): JSX.Element | null {
  const frame = useCurrentFrame();
  const cue = cues.find(
    (item) => frame >= item.startFrame && frame < item.endFrame,
  );
  if (cue === undefined) return null;
  return (
    <p
      data-testid="scene-preview-caption"
      style={{
        background: videoTheme.colors.captionBackground,
        bottom: videoTheme.safeAreas.caption.bottom,
        color: videoTheme.colors.text,
        fontSize: videoTheme.typography.captionSize,
        left: videoTheme.safeAreas.caption.left,
        margin: 0,
        padding: videoTheme.spacing.sm,
        position: "absolute",
        right: videoTheme.safeAreas.caption.right,
        textAlign: "center",
      }}
    >
      {cue.text}
    </p>
  );
}

export function ScenePreviewComposition({
  captions,
  manifest,
  scene,
  transitionContext,
  onAudioError,
}: ScenePreviewInput &
  Readonly<{ onAudioError?: (message: string) => void }>): JSX.Element {
  return (
    <div
      data-testid="scene-preview-frame"
      style={{ height: "100%", position: "relative", width: "100%" }}
    >
      <div data-testid="scene-preview-runtime">
        <ScenePreviewRuntime resolvedAssets={manifest.assets} scene={scene} />
      </div>
      {manifest.audio === undefined ? null : (
        <Audio
          onError={(error) => onAudioError?.(formatAudioPlaybackError(error))}
          src={manifest.audio.src}
        />
      )}
      {transitionContext === undefined ? null : (
        <aside
          aria-label="Scene transition context"
          style={{
            color: videoTheme.colors.text,
            fontSize: videoTheme.typography.captionSize,
            left: videoTheme.safeAreas.body.left,
            position: "absolute",
            top: videoTheme.safeAreas.body.top,
          }}
        >
          {transitionContext.previousLabel === undefined ? null : (
            <span>After: {transitionContext.previousLabel}</span>
          )}
          {transitionContext.previousLabel !== undefined &&
          transitionContext.nextLabel !== undefined
            ? " · "
            : null}
          {transitionContext.nextLabel === undefined ? null : (
            <span>Next: {transitionContext.nextLabel}</span>
          )}
        </aside>
      )}
      <CaptionOverlay cues={captions} />
    </div>
  );
}

export function ScenePreviewPlayer({
  input,
  muted = true,
}: Readonly<{ input: unknown; muted?: boolean }>): JSX.Element {
  const playerRef = useRef<PlayerRef>(null);
  const [playbackError, setPlaybackError] = useState<string>();
  const [previewFrame, setPreviewFrame] = useState(0);
  const [isMuted, setIsMuted] = useState(muted);
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    setPlaybackError(undefined);
    setPreviewFrame(0);
    setIsMuted(muted);
    setIsPlaying(false);
  }, [input, muted]);
  useEffect(() => {
    // Keep the seek control in step with playback; the player is the source of
    // truth for the current frame once it is running.
    const player = playerRef.current;
    if (player === null) return;
    const onFrameUpdate = (event: { detail: { frame: number } }): void =>
      setPreviewFrame(event.detail.frame);
    const onPlay = (): void => setIsPlaying(true);
    const onPause = (): void => setIsPlaying(false);
    const onEnded = (): void => setIsPlaying(false);
    player.addEventListener("frameupdate", onFrameUpdate);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("frameupdate", onFrameUpdate);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [input]);
  const result = parseScenePreviewInput(input);
  if (!result.ok)
    return (
      <section data-testid="scene-preview-error" role="alert">
        <h1>Preview unavailable</h1>
        <p>{result.message}</p>
        <p>
          Check the scene content and refresh its authorized media before trying
          again.
        </p>
      </section>
    );
  if (playbackError !== undefined)
    return (
      <section data-testid="scene-preview-error" role="alert">
        <h1>Preview unavailable</h1>
        <p>{playbackError}</p>
      </section>
    );
  const durationInFrames = getSceneFrameTiming(
    result.input.scene.durationSeconds,
  ).durationInFrames;
  const seekTo = (requestedFrame: number): void => {
    const frame = getScenePreviewFrame(requestedFrame, durationInFrames);
    playerRef.current?.seekTo(frame);
    setPreviewFrame(frame);
  };
  return (
    <section aria-label="Scene preview player" className="sp-player">
      <Player
        acknowledgeRemotionLicense
        component={ScenePreviewComposition}
        compositionHeight={videoTheme.canvas.height}
        compositionWidth={videoTheme.canvas.width}
        durationInFrames={durationInFrames}
        errorFallback={({ error }) => (
          <section data-testid="scene-preview-error" role="alert">
            <h1>Preview unavailable</h1>
            <p>{error.message}</p>
            <p>
              Refresh the preview media or correct the selected scene and try
              again.
            </p>
          </section>
        )}
        fps={videoTheme.canvas.fps}
        initiallyMuted={muted}
        inputProps={{ ...result.input, onAudioError: setPlaybackError }}
        ref={playerRef}
        renderLoading={() => <p role="status">Loading scene preview…</p>}
        spaceKeyToPlayOrPause={false}
        style={{ width: "100%" }}
      />

      <div aria-label="Scene preview controls" className="sp-transport">
        <button
          className="sp-button sp-button-primary"
          aria-label={isPlaying ? "Pause scene" : "Play scene"}
          title={isPlaying ? "Pause scene" : "Play scene"}
          onClick={() => {
            const player = playerRef.current;
            if (player === null) return;
            if (isPlaying) player.pause();
            else player.play();
          }}
          type="button"
        >
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button
          className="sp-button"
          aria-label="Replay scene"
          title="Replay scene"
          onClick={() => {
            seekTo(0);
            playerRef.current?.play();
          }}
          type="button"
        >
          Replay
        </button>

        <input
          className="sp-seek"
          aria-label="Seek scene"
          max={durationInFrames - 1}
          min={0}
          onChange={(event) => seekTo(Number(event.currentTarget.value))}
          style={{
            // Drives the played-portion fill; the track itself is CSS.
            "--sp-progress": `${
              durationInFrames > 1
                ? (previewFrame / (durationInFrames - 1)) * 100
                : 0
            }%`,
          } as React.CSSProperties}
          type="range"
          value={previewFrame}
        />

        <span aria-hidden className="sp-time">
          {previewFrame} / {durationInFrames - 1}
        </span>
        <span className="sp-status" role="status">
          Preview frame: {previewFrame}; {isMuted ? "muted" : "unmuted"}
        </span>

        {isMuted ? (
          <button
            className="sp-button"
            aria-label="Unmute scene"
            title="Unmute scene"
            onClick={() => {
              playerRef.current?.unmute();
              setIsMuted(false);
            }}
            type="button"
          >
            Unmute
          </button>
        ) : (
          <button
            className="sp-button"
            aria-label="Mute scene"
            title="Mute scene"
            onClick={() => {
              playerRef.current?.mute();
              setIsMuted(true);
            }}
            type="button"
          >
            Mute
          </button>
        )}
      </div>
    </section>
  );
}

export function createScenePreviewFixture(scene: SceneSpec): ScenePreviewInput {
  return {
    captions: [{ endFrame: 90, startFrame: 0, text: scene.narration }],
    manifest: { assets: {} },
    scene,
    transitionContext: { nextLabel: "The next explanation" },
  };
}
