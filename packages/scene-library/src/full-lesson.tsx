"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { Audio, interpolate, Sequence, useCurrentFrame } from "remotion";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { z } from "zod";
import {
  creativeDesignManifestSchema,
  previewAssetSchema,
  sceneSpecSchema,
  treatmentFor,
  type LessonSpec,
} from "@avlp/schemas";
import { videoTheme } from "@avlp/design-system/video-theme";
import {
  ScenePreviewRuntime,
  SceneRenderRuntime,
  type ResolvedSceneAsset,
} from "./scene-registry.js";
import { secondsToFrames } from "./timing.js";

/** Object storage in local dev is signed against a plain-HTTP loopback
 * endpoint (see OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT), mirroring the
 * isLocalEndpoint allowance in @avlp/storage. Any non-loopback host still
 * must be HTTPS. */
const LOOPBACK_HTTP_URL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/[^\s]*$/i;

const fullLessonPreviewAssetSchema = previewAssetSchema.superRefine(
  (value, context) => {
    // ST-093: a source-table visual carries structured data, not a media
    // URL, so it is exempt from this HTTPS/catalog `src` allowlist.
    if (value.source === "source_table" || value.src === undefined) return;
    if (!(
      /^https:\/\/[^\s]+$/i.test(value.src) ||
      /^\/catalog\/[a-z0-9/_-]+\.svg$/i.test(value.src) ||
      LOOPBACK_HTTP_URL_PATTERN.test(value.src)
    ))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["src"],
        message: "Assets must be signed HTTPS URLs or approved catalog paths.",
      });
  },
);

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
    assets: z.record(fullLessonPreviewAssetSchema).default({}),
    captions: z.array(fullLessonCaptionCueSchema),
    creativeDesign: creativeDesignManifestSchema.optional(),
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
  creativeDesign,
}: Readonly<{
  captions: readonly FullLessonCaptionCue[];
  creativeDesign?: z.infer<typeof creativeDesignManifestSchema>;
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
        fontSize:
          creativeDesign?.settings.captionPreset === "large"
            ? videoTheme.typography.captionSize + 8
            : videoTheme.typography.captionSize,
        left: videoTheme.safeAreas.caption.left,
        margin: 0,
        padding: creativeDesign?.settings.captionPreset === "large" ? videoTheme.spacing.md : videoTheme.spacing.sm,
        position: "absolute",
        right: videoTheme.safeAreas.caption.right,
        textAlign: "center",
        ...(creativeDesign === undefined
          ? {}
          : {
              background:
                creativeDesign.settings.captionPreset === "high_contrast"
                  ? "#000000"
                  : creativeDesign.settings.colors.surface,
              color:
                creativeDesign.settings.captionPreset === "high_contrast"
                  ? "#ffffff"
                  : creativeDesign.settings.colors.text,
              fontFamily:
                creativeDesign.settings.fontPair === "source-serif-inter"
                  ? '"Source Serif 4", serif'
                  : creativeDesign.settings.fontPair === "nunito-inter"
                    ? "Nunito, sans-serif"
                    : '"Atkinson Hyperlegible", sans-serif',
            }),
      }}
    >
      {cue.text}
    </p>
  );
}

function CreativeLogoOverlay({
  asset,
}: Readonly<{ asset: ResolvedSceneAsset | undefined }>): JSX.Element | null {
  if (asset === undefined || !("src" in asset) || asset.src === undefined)
    return null;
  return (
    <img
      alt="Lesson logo"
      data-testid="creative-design-logo"
      src={asset.src}
      style={{
        height: 72,
        objectFit: "contain",
        position: "absolute",
        right: 56,
        top: 44,
        width: 180,
        zIndex: 2,
      }}
    />
  );
}

function TransitionedScene({
  creativeDesign,
  resolvedAssets,
  runtimeMode,
  scene,
  durationInFrames,
}: Readonly<{
  creativeDesign?: z.infer<typeof creativeDesignManifestSchema>;
  resolvedAssets: Readonly<Record<string, ResolvedSceneAsset>>;
  runtimeMode: "preview" | "render";
  scene: LessonSpec["scenes"][number];
  durationInFrames: number;
}>): JSX.Element {
  const frame = useCurrentFrame();
  const transitionFrames =
    creativeDesign?.settings.motionEnergy === "calm"
      ? 16
      : creativeDesign?.settings.motionEnergy === "lively"
        ? 8
        : 12;
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
      ? interpolate(
          frame,
          [0, transitionFrames],
          [
            creativeDesign?.settings.motionEnergy === "calm"
              ? 40
              : creativeDesign?.settings.motionEnergy === "lively"
                ? 120
                : 80,
            0,
          ],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          },
        )
      : 0;
  if (creativeDesign === undefined)
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
  const treatmentId = creativeDesign.selections[scene.id]?.treatmentId;
  // A resolved manifest is required to contain every scene; this defensive
  // fallback preserves historic snapshots even if a malformed one escaped an
  // older reader.
  if (treatmentId === undefined)
    return (
      <div data-testid={`full-lesson-scene-${scene.order}`} style={{ height: "100%", opacity, width: "100%" }}>
        {runtimeMode === "render" ? <SceneRenderRuntime resolvedAssets={resolvedAssets} scene={scene} /> : <ScenePreviewRuntime resolvedAssets={resolvedAssets} scene={scene} />}
      </div>
    );
  const treatment = treatmentFor(treatmentId);
  const pack = creativeDesign.pack.id;
  const content = runtimeMode === "render" ? (
    <SceneRenderRuntime resolvedAssets={resolvedAssets} scene={scene} />
  ) : (
    <ScenePreviewRuntime resolvedAssets={resolvedAssets} scene={scene} />
  );
  const accent = creativeDesign.settings.colors.accent;
  const surface = creativeDesign.settings.colors.surface;
  const imagery = creativeDesign.settings.imageryPreference;
  const fontFamily =
    creativeDesign.settings.fontPair === "source-serif-inter"
      ? '"Source Serif 4", serif'
      : creativeDesign.settings.fontPair === "nunito-inter"
        ? "Nunito, sans-serif"
        : '"Atkinson Hyperlegible", sans-serif';
  const decorationStyle = {
    background: accent,
    opacity: pack === "essential" ? 0.14 : pack === "editorial" ? 0.23 : 0.3,
    pointerEvents: "none" as const,
    position: "absolute" as const,
  };
  const contentStyle = {
    border: `${pack === "editorial" ? 24 : pack === "everyday" ? 18 : 12}px solid ${surface}`,
    borderRadius: pack === "everyday" ? 40 : treatment.variant === "alternate" ? 28 : 0,
    boxSizing: "border-box" as const,
    height: treatment.variant === "alternate" ? "84%" : "100%",
    left: treatment.variant === "alternate" ? "8%" : 0,
    overflow: "hidden" as const,
    position: "absolute" as const,
    top: treatment.variant === "alternate" ? "8%" : 0,
    width: treatment.variant === "alternate" ? "84%" : "100%",
    color: creativeDesign.settings.colors.text,
    fontFamily,
  };
  const imageryDecoration =
    imagery === "photography"
      ? { background: "linear-gradient(135deg, rgba(255,255,255,.28), transparent 55%)" }
      : imagery === "illustration"
        ? { backgroundImage: `radial-gradient(${accent}44 2px, transparent 2px)`, backgroundSize: "20px 20px" }
        : imagery === "diagrams"
          ? { backgroundImage: `linear-gradient(${creativeDesign.settings.colors.diagramEmphasis}33 1px, transparent 1px), linear-gradient(90deg, ${creativeDesign.settings.colors.diagramEmphasis}33 1px, transparent 1px)`, backgroundSize: "42px 42px" }
          : { background: `linear-gradient(150deg, ${accent}22, transparent 45%)` };
  return (
    <div
      data-testid={`full-lesson-scene-${scene.order}`}
      data-treatment-family={treatment.family}
      style={{
        background: creativeDesign.settings.colors.background,
        height: "100%",
        opacity,
        transform: `translateX(${translateX}px)`,
        width: "100%",
      }}
    >
      {treatment.family === "question" ? <div aria-hidden style={{ ...decorationStyle, height: 160, left: 0, top: 0, width: "100%" }} /> : null}
      {treatment.family === "subject" ? <div aria-hidden style={{ ...decorationStyle, borderRadius: "50%", height: 460, right: -140, top: -100, width: 460 }} /> : null}
      {treatment.family === "split" ? <div aria-hidden style={{ ...decorationStyle, height: "100%", left: 0, top: 0, width: "33%" }} /> : null}
      {treatment.family === "path" ? <div aria-hidden style={{ ...decorationStyle, height: 32, left: "8%", top: "50%", transform: "rotate(-8deg)", width: "84%" }} /> : null}
      {treatment.family === "panels" ? <div aria-hidden style={{ ...decorationStyle, height: "100%", left: "49%", top: 0, width: 24 }} /> : null}
      {treatment.family === "rows" ? <div aria-hidden style={{ ...decorationStyle, height: 16, left: "10%", top: "30%", width: "80%", boxShadow: `0 150px 0 ${accent}, 0 300px 0 ${accent}` }} /> : null}
      {treatment.family === "flow" ? <div aria-hidden style={{ ...decorationStyle, height: 20, left: "5%", top: "48%", width: "90%", borderRadius: 10 }} /> : null}
      {treatment.family === "staged" ? <div aria-hidden style={{ ...decorationStyle, height: "70%", left: "12%", top: "15%", width: "76%", borderRadius: 24 }} /> : null}
      {treatment.family === "chain" ? <div aria-hidden style={{ ...decorationStyle, height: 12, left: "10%", top: "52%", width: "80%", boxShadow: `0 -120px 0 ${accent}` }} /> : null}
      {treatment.family === "divergent" ? <div aria-hidden style={{ ...decorationStyle, borderRadius: "50%", height: 360, left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 360 }} /> : null}
      {treatment.family === "annotated" ? <div aria-hidden style={{ ...decorationStyle, border: `3px dashed ${accent}`, borderRadius: 16, height: "80%", left: "10%", top: "10%", width: "80%", background: "transparent" }} /> : null}
      {treatment.family === "focused" ? <div aria-hidden style={{ ...decorationStyle, height: "100%", left: "60%", top: 0, width: "40%" }} /> : null}
      {treatment.family === "parallel" ? <div aria-hidden style={{ ...decorationStyle, height: "100%", left: "49.5%", top: 0, width: 6 }} /> : null}
      {treatment.family === "metaphor" ? <div aria-hidden style={{ ...decorationStyle, borderRadius: "50%", height: 280, left: -60, bottom: -60, width: 280 }} /> : null}
      {treatment.family === "stepwise" ? <div aria-hidden style={{ ...decorationStyle, height: "80%", left: 40, top: "10%", width: 14, borderRadius: 7 }} /> : null}
      {treatment.family === "walkthrough" ? <div aria-hidden style={{ ...decorationStyle, height: 180, left: 0, bottom: 0, width: "100%" }} /> : null}
      {treatment.family === "recap-cards" ? <div aria-hidden style={{ ...decorationStyle, height: 120, left: 0, bottom: 0, width: "100%" }} /> : null}
      {treatment.family === "central-takeaway" ? <div aria-hidden style={{ ...decorationStyle, borderRadius: "50%", height: 500, left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 500 }} /> : null}
      <div
        aria-hidden
        data-imagery-preference={imagery}
        style={{
          ...imageryDecoration,
          height: "100%",
          left: 0,
          opacity: 0.45,
          pointerEvents: "none",
          position: "absolute",
          top: 0,
          width: "100%",
        }}
      />
      <div data-treatment={treatment.id} style={contentStyle}>
        {content}
      </div>
    </div>
  );
}

export function FullLessonComposition({
  assets,
  captions,
  creativeDesign,
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
              {...(creativeDesign === undefined ? {} : { creativeDesign })}
              durationInFrames={segment.durationInFrames}
              resolvedAssets={assets}
              runtimeMode={runtimeMode}
              scene={scene}
            />
            {narration?.kind === "browser-audio" ? (
              <Audio
                pauseWhenBuffering
                onError={onAudioError}
                src={narration.src}
              />
            ) : null}
          </Sequence>
        );
      })}
      <FullLessonCaptionOverlay
        captions={captions}
        {...(creativeDesign === undefined ? {} : { creativeDesign })}
      />
      {creativeDesign?.settings.logoAssetId === null ||
      creativeDesign?.settings.logoAssetId === undefined ? null : (
        <CreativeLogoOverlay
          asset={assets[creativeDesign.settings.logoAssetId]}
        />
      )}
    </main>
  );
}

/** Frame index rendered as m:ss for the transport's elapsed/total readout. */
function formatFrameAsTime(frameIndex: number, fps: number): string {
  const totalSeconds = Math.max(0, Math.floor(frameIndex / fps));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const parsed = useMemo(
    () => fullLessonCompositionPropsSchema.safeParse(input),
    [input],
  );
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [playbackError, setPlaybackError] = useState<string>();
  const onAudioError = useCallback(() => {
    setPlaybackError(
      "Preview audio could not be played. Renewing preview media.",
    );
    onMediaError?.();
  }, [onMediaError]);
  const previewSettings = getPreviewCompositionSettings(quality);
  // Remotion includes inputProps in its playback-clock dependencies. Recreating
  // them on frameupdate restarts that clock and makes audio seek backward.
  const playerInput = useMemo(
    () =>
      parsed.success
        ? {
            ...parsed.data,
            onAudioError,
            viewportScale: previewSettings.scale,
          }
        : undefined,
    [parsed, onAudioError, previewSettings.scale],
  );
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
  const active = getTimelineSegmentAtFrame(timeline, frame);
  const seek = (nextFrame: number): void => {
    const safeFrame = Math.min(
      Math.max(0, Math.floor(nextFrame)),
      durationInFrames - 1,
    );
    playerRef.current?.seekTo(safeFrame);
    setFrame(safeFrame);
  };
  const activeIndex = timeline.findIndex(
    (segment) => segment.sceneId === active?.sceneId,
  );
  const fps = videoTheme.canvas.fps;
  const progress =
    durationInFrames > 1 ? (frame / (durationInFrames - 1)) * 100 : 0;
  return (
    <section aria-label="Full lesson preview player" className="sp-player">
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
        inputProps={playerInput!}
        ref={playerRef}
        style={{ width: "100%" }}
      />

      {playbackError === undefined ? null : (
        <p className="sp-alert" role="alert">
          {playbackError}
        </p>
      )}

      <div className="sp-transport-stack">
        <div aria-label="Full lesson controls" className="sp-transport">
          <button
            className="sp-button sp-button-primary"
            onClick={() => playerRef.current?.play()}
            title="Play lesson"
            type="button"
          >
            Play lesson
          </button>
          <button
            className="sp-button"
            onClick={() => playerRef.current?.pause()}
            title="Pause lesson"
            type="button"
          >
            Pause lesson
          </button>

          <input
            aria-label="Seek lesson"
            className="sp-seek"
            max={durationInFrames - 1}
            min={0}
            onChange={(event) => seek(Number(event.currentTarget.value))}
            style={{ "--sp-progress": `${progress}%` } as React.CSSProperties}
            type="range"
            value={frame}
          />

          <span aria-hidden className="sp-time">
            {formatFrameAsTime(frame, fps)} /{" "}
            {formatFrameAsTime(durationInFrames, fps)}
          </span>
        </div>

        <nav aria-label="Lesson scenes" className="sp-scenes">
          {timeline.map((segment, index) => (
            <button
              aria-current={index === activeIndex}
              className="sp-scene"
              key={segment.sceneId}
              onClick={() => seek(segment.startFrame)}
              type="button"
            >
              Scene {index + 1}
            </button>
          ))}
        </nav>

        <p className="sp-meta" role="status">
          <span className="sp-meta-scene">
            {active === undefined
              ? "Lesson complete"
              : `Scene ${activeIndex + 1} of ${timeline.length}`}
          </span>
          <span aria-hidden className="sp-meta-separator">
            ·
          </span>
          <span className="sp-meta-frame">Full lesson frame: {frame}</span>
        </p>
      </div>
    </section>
  );
}
