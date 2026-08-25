"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Audio, interpolate, Sequence, useCurrentFrame } from "remotion";
import { useEffect, useRef, useState, type JSX } from "react";
import { z } from "zod";
import { sceneSpecSchema, type LessonSpec } from "@avlp/schemas";
import { videoTheme } from "@avlp/design-system/video-theme";
import {
  ScenePreviewRuntime,
  SceneRenderRuntime,
  type ResolvedSceneAsset,
} from "./scene-registry.js";
import { secondsToFrames } from "./timing.js";

export const narrationTrackSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("deterministic-silence"),
      sceneId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("browser-audio"),
      sceneId: z.string().uuid(),
      src: z.string().url(),
    })
    .strict(),
]);
export type NarrationTrack = z.infer<typeof narrationTrackSchema>;

export const fullLessonCaptionCueSchema = z
  .object({
    endFrame: z.number().int().positive(),
    sceneId: z.string().uuid(),
    startFrame: z.number().int().nonnegative(),
    text: z.string().min(1).max(1_000),
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endFrame <= cue.startFrame)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endFrame"],
        message: "Caption endFrame must be after startFrame.",
      });
  });
export type FullLessonCaptionCue = z.infer<typeof fullLessonCaptionCueSchema>;

export const fullLessonCompositionPropsSchema = z
  .object({
    assets: z
      .record(
        z
          .object({
            altText: z.string().min(1).max(2_000),
            assetId: z.string().uuid(),
            source: z.enum(["library", "source"]),
            src: z
              .string()
              .refine(
                (value) =>
                  /^https:\/\/[^\s]+$/i.test(value) ||
                  /^\/catalog\/[a-z0-9/_-]+\.svg$/i.test(value),
                "Assets must be signed HTTPS URLs or approved catalog paths.",
              ),
          })
          .strict(),
      )
      .default({}),
    captions: z.array(fullLessonCaptionCueSchema),
    lesson: z
      .object({ scenes: z.array(sceneSpecSchema).min(1).max(100) })
      .passthrough(),
    narrationTracks: z.array(narrationTrackSchema).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    const timeline = calculateLessonTimeline(value.lesson);
    const segmentsBySceneId = new Map(
      timeline.map((segment) => [segment.sceneId, segment]),
    );
    const trackedSceneIds = new Set<string>();
    for (const [index, track] of value.narrationTracks.entries())
      if (!segmentsBySceneId.has(track.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks", index, "sceneId"],
          message: "Narration track must belong to a lesson scene.",
        });
      else if (trackedSceneIds.has(track.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks", index, "sceneId"],
          message: "Each lesson scene has exactly one narration track.",
        });
      else trackedSceneIds.add(track.sceneId);
    for (const [index, cue] of value.captions.entries()) {
      const segment = segmentsBySceneId.get(cue.sceneId);
      if (segment === undefined)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["captions", index, "sceneId"],
          message: "Caption cue must belong to a lesson scene.",
        });
      else if (
        cue.startFrame < segment.startFrame ||
        cue.endFrame > segment.endFrameExclusive
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["captions", index],
          message: "Caption timing must remain within its scene timeline.",
        });
    }
    for (const segment of timeline)
      if (!trackedSceneIds.has(segment.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks"],
          message:
            "Every lesson scene requires a deterministic narration track.",
        });
  });
export type FullLessonCompositionProps = z.infer<
  typeof fullLessonCompositionPropsSchema
>;

export type PreviewQuality = "low" | "standard";

export function getPreviewCompositionSettings(
  quality: PreviewQuality,
): Readonly<{ height: number; scale: number; width: number }> {
  const scale = quality === "low" ? 0.5 : 1;
  return Object.freeze({
    height: Math.round(videoTheme.canvas.height * scale),
    scale,
    width: Math.round(videoTheme.canvas.width * scale),
  });
}

export type TimelineSegment = Readonly<{
  durationInFrames: number;
  endFrameExclusive: number;
  sceneId: string;
  startFrame: number;
}>;

export function calculateLessonTimeline(
  lesson: Pick<LessonSpec, "scenes">,
): readonly TimelineSegment[] {
  let startFrame = 0;
  return Object.freeze(
    [...lesson.scenes]
      .sort((left, right) => left.order - right.order)
      .map((scene) => {
        const durationInFrames = secondsToFrames(scene.durationSeconds);
        const segment = Object.freeze({
          durationInFrames,
          endFrameExclusive: startFrame + durationInFrames,
          sceneId: scene.id,
          startFrame,
        });
        startFrame = segment.endFrameExclusive;
        return segment;
      }),
  );
}

export function getLessonDurationInFrames(
  lesson: Pick<LessonSpec, "scenes">,
): number {
  return calculateLessonTimeline(lesson).reduce(
    (total, segment) => total + segment.durationInFrames,
    0,
  );
}

export function getTimelineSegmentAtFrame(
  timeline: readonly TimelineSegment[],
  frame: number,
): TimelineSegment | undefined {
  return timeline.find(
    (segment) =>
      frame >= segment.startFrame && frame < segment.endFrameExclusive,
  );
}

function FullLessonCaptionOverlay({
  captions,
}: Readonly<{
  captions: readonly FullLessonCaptionCue[];
}>): JSX.Element | null {
  const frame = useCurrentFrame();
  const cue = captions.find(
    (item) => frame >= item.startFrame && frame < item.endFrame,
  );
  if (cue === undefined) return null;
  return (
    <p
      data-testid="full-lesson-caption"
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

function TransitionedScene({
  resolvedAssets,
  runtimeMode,
  scene,
  durationInFrames,
}: Readonly<{
  resolvedAssets: Readonly<Record<string, ResolvedSceneAsset>>;
  runtimeMode: "preview" | "render";
  scene: LessonSpec["scenes"][number];
  durationInFrames: number;
}>): JSX.Element {
  const frame = useCurrentFrame();
  const transitionFrames = 12;
  const opacity =
    scene.transition === "fade"
      ? interpolate(
          frame,
          [
            0,
            transitionFrames,
            durationInFrames - transitionFrames,
            durationInFrames,
          ],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        )
      : 1;
  const translateX =
    scene.transition === "slide"
      ? interpolate(frame, [0, transitionFrames], [80, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      : 0;
  return (
    <div
      data-testid={`full-lesson-scene-${scene.order}`}
      style={{
        height: "100%",
        opacity,
        transform: `translateX(${translateX}px)`,
        width: "100%",
      }}
    >
      {runtimeMode === "render" ? (
        <SceneRenderRuntime resolvedAssets={resolvedAssets} scene={scene} />
      ) : (
        <ScenePreviewRuntime resolvedAssets={resolvedAssets} scene={scene} />
      )}
    </div>
  );
}

export function FullLessonComposition({
  assets,
  captions,
  lesson,
  narrationTracks,
  onAudioError,
  runtimeMode = "preview",
  viewportScale = 1,
}: FullLessonCompositionProps &
  Readonly<{
    onAudioError?: () => void;
    runtimeMode?: "preview" | "render";
    viewportScale?: number;
  }>): JSX.Element {
  const timeline = calculateLessonTimeline(lesson);
  const narrationBySceneId = new Map(
    narrationTracks.map((track) => [track.sceneId, track]),
  );
  return (
    <main
      data-testid="full-lesson-composition"
      style={{
        background: videoTheme.colors.background,
        height: `${100 / viewportScale}%`,
        overflow: "hidden",
        position: "relative",
        transform: `scale(${viewportScale})`,
        transformOrigin: "top left",
        width: `${100 / viewportScale}%`,
      }}
    >
      {timeline.map((segment) => {
        const scene = lesson.scenes.find((item) => item.id === segment.sceneId);
        const narration = narrationBySceneId.get(segment.sceneId);
        if (scene === undefined) return null;
        return (
          <Sequence
            durationInFrames={segment.durationInFrames}
            from={segment.startFrame}
            key={segment.sceneId}
          >
            <TransitionedScene
              durationInFrames={segment.durationInFrames}
              resolvedAssets={assets}
              runtimeMode={runtimeMode}
              scene={scene}
            />
            {narration?.kind === "browser-audio" ? (
              <Audio onError={onAudioError} src={narration.src} />
            ) : null}
          </Sequence>
        );
      })}
      <FullLessonCaptionOverlay captions={captions} />
    </main>
  );
}

export function FullLessonPreviewPlayer({
  input,
  onMediaError,
  quality = "standard",
}: Readonly<{
  input: unknown;
  onMediaError?: () => void;
  quality?: PreviewQuality;
}>): JSX.Element {
  const parsed = fullLessonCompositionPropsSchema.safeParse(input);
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [playbackError, setPlaybackError] = useState<string>();
  useEffect(() => {
    setFrame(0);
    setPlaybackError(undefined);
  }, [input]);
  useEffect(() => {
    const player = playerRef.current;
    if (player === null) return;
    const updateFrame = (event: { detail: { frame: number } }): void =>
      setFrame(event.detail.frame);
    player.addEventListener("frameupdate", updateFrame);
    return () => player.removeEventListener("frameupdate", updateFrame);
  }, [parsed.success]);
  if (!parsed.success)
    return (
      <section role="alert">
        <h1>Full lesson preview unavailable</h1>
        <p>{parsed.error.issues.map((issue) => issue.message).join(" ")}</p>
      </section>
    );
  const timeline = calculateLessonTimeline(parsed.data.lesson);
  const durationInFrames = getLessonDurationInFrames(parsed.data.lesson);
  const previewSettings = getPreviewCompositionSettings(quality);
  const active = getTimelineSegmentAtFrame(timeline, frame);
  const seek = (nextFrame: number): void => {
    const safeFrame = Math.min(
      Math.max(0, Math.floor(nextFrame)),
      durationInFrames - 1,
    );
    playerRef.current?.seekTo(safeFrame);
    setFrame(safeFrame);
  };
  return (
    <section aria-label="Full lesson preview player">
      <p role="status">
        Full lesson frame: {frame}; scene:{" "}
        {active === undefined ? "complete" : active.sceneId}
      </p>
      {playbackError === undefined ? null : (
        <p role="alert">{playbackError}</p>
      )}
      <div aria-label="Full lesson controls">
        <button onClick={() => playerRef.current?.play()} type="button">
          Play lesson
        </button>
        <button onClick={() => playerRef.current?.pause()} type="button">
          Pause lesson
        </button>
        <label>
          Seek lesson
          <input
            aria-label="Seek lesson"
            max={durationInFrames - 1}
            min={0}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            type="range"
            value={frame}
          />
        </label>
      </div>
      <nav aria-label="Lesson scenes">
        {timeline.map((segment, index) => (
          <button
            key={segment.sceneId}
            onClick={() => seek(segment.startFrame)}
            type="button"
          >
            Scene {index + 1}
          </button>
        ))}
      </nav>
      <Player
        acknowledgeRemotionLicense
        component={FullLessonComposition}
        compositionHeight={previewSettings.height}
        compositionWidth={previewSettings.width}
        controls
        durationInFrames={durationInFrames}
        errorFallback={({ error }) => (
          <section role="alert">
            <h1>Full lesson preview unavailable</h1>
            <p>{error.message}</p>
            <p>
              Refresh preview media or return to the storyboard to correct the
              affected scene.
            </p>
          </section>
        )}
        fps={videoTheme.canvas.fps}
        inputProps={{
          ...parsed.data,
          onAudioError: () => {
            setPlaybackError(
              "Preview audio could not be played. Renewing preview media.",
            );
            onMediaError?.();
          },
          viewportScale: previewSettings.scale,
        }}
        ref={playerRef}
        style={{ width: "100%" }}
      />
    </section>
  );
}
