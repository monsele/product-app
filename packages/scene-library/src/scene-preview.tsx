"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Audio, useCurrentFrame } from "remotion";
import { useEffect, useRef, useState, type JSX } from "react";
import { z } from "zod";
import { sceneSpecSchema, type SceneSpec } from "@avlp/schemas";
import {
  ScenePreviewRuntime,
  validateScene,
  type ResolvedSceneAsset,
} from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";
import { videoTheme } from "@avlp/design-system/video-theme";

const fixtureOrSignedUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      /^https:\/\/[^\s]+$/i.test(value) ||
      /^\/assets\/[a-z0-9/_-]+\.(png|jpe?g|webp|mp3|wav|m4a)$/i.test(value) ||
      /^data:(image\/(png|jpeg|webp)|audio\/(mpeg|wav|mp4));base64,[a-z0-9+/=]+$/i.test(
        value,
      ),
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
  useEffect(() => {
    setPlaybackError(undefined);
    setPreviewFrame(0);
    setIsMuted(muted);
  }, [input, muted]);
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
    <section aria-label="Scene preview player">
      <div role="status">
        Preview frame: {previewFrame}; {isMuted ? "muted" : "unmuted"}
      </div>
      <div aria-label="Scene preview controls">
        <button onClick={() => playerRef.current?.play()} type="button">
          Play scene
        </button>
        <button onClick={() => playerRef.current?.pause()} type="button">
          Pause scene
        </button>
        <button
          onClick={() => {
            seekTo(0);
            playerRef.current?.play();
          }}
          type="button"
        >
          Replay scene
        </button>
        <label>
          Seek scene
          <input
            aria-label="Seek scene"
            max={durationInFrames - 1}
            min={0}
            onChange={(event) => seekTo(Number(event.currentTarget.value))}
            type="range"
            value={previewFrame}
          />
        </label>
        <button
          onClick={() => {
            playerRef.current?.mute();
            setIsMuted(true);
          }}
          type="button"
        >
          Mute scene
        </button>
        <button
          onClick={() => {
            playerRef.current?.unmute();
            setIsMuted(false);
          }}
          type="button"
        >
          Unmute scene
        </button>
      </div>
      <Player
        acknowledgeRemotionLicense
        component={ScenePreviewComposition}
        compositionHeight={videoTheme.canvas.height}
        compositionWidth={videoTheme.canvas.width}
        controls
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
        showVolumeControls
        style={{ width: "100%" }}
      />
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
