"use client";

import { Player } from "@remotion/player";
import { Composition, Easing, interpolate, useCurrentFrame } from "remotion";
import "@fontsource/atkinson-hyperlegible/400.css";
import type { JSX } from "react";
import { useVideoTheme, VideoThemeProvider } from "./video-theme-provider.js";
import {
  transitionPresets,
  type TransitionPreset,
  videoTheme,
} from "./video-theme.js";

export const videoDesignPreviewId = "VideoDesignPreview";
export const videoDesignPreviewComposition = Object.freeze({
  id: videoDesignPreviewId,
  durationInFrames: 150,
  fps: videoTheme.canvas.fps,
  width: videoTheme.canvas.width,
  height: videoTheme.canvas.height,
});

export const videoDesignPreviewTransition: TransitionPreset =
  transitionPresets[1];

export function getVideoDesignPreviewFrame(
  frame: number,
): Readonly<{ firstOpacity: number; secondOpacity: number }> {
  const clampedFrame = Math.max(0, Math.floor(frame));
  const enter = videoTheme.motion.enter;
  const exit = videoTheme.motion.exit;
  const transitionStartFrame = 90;
  const transitionEndFrame = transitionStartFrame + exit.durationInFrames;
  const transitionProgress = interpolate(
    clampedFrame,
    [transitionStartFrame, transitionEndFrame],
    [0, 1],
    {
      easing: Easing.bezier(...exit.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return Object.freeze({
    firstOpacity:
      interpolate(clampedFrame, [0, enter.durationInFrames], [0, 1], {
        easing: Easing.bezier(...enter.easing),
        extrapolateRight: "clamp",
      }) *
      (1 - transitionProgress),
    secondOpacity: transitionProgress,
  });
}

function PreviewContents(): JSX.Element {
  const theme = useVideoTheme();
  const frame = useCurrentFrame();
  const { firstOpacity, secondOpacity } = getVideoDesignPreviewFrame(frame);
  return (
    <div
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.typography.fontFamily,
        height: "100%",
        padding: theme.safeAreas.action.top,
        boxSizing: "border-box",
        width: "100%",
      }}
    >
      <main
        style={{
          opacity: firstOpacity,
          margin: `${theme.safeAreas.title.top - theme.safeAreas.action.top}px ${theme.safeAreas.title.right}px 0`,
          maxWidth: theme.layout.contentMaxWidth,
        }}
      >
        <p
          style={{
            color: theme.colors.primary,
            fontSize: theme.typography.bodySize,
            margin: 0,
          }}
        >
          SCIENCE LESSON
        </p>
        <h1
          style={{
            fontSize: theme.typography.titleSize,
            lineHeight: theme.typography.lineHeight,
            margin: `${theme.spacing.sm}px 0`,
          }}
        >
          How plants make food
        </h1>
        <div
          style={{
            background: theme.colors.surface,
            borderLeft: `${theme.lineWidths.emphasis}px solid ${theme.colors.accent}`,
            borderRadius: theme.radii.md,
            fontSize: theme.typography.bodySize,
            padding: theme.spacing.md,
          }}
        >
          Sunlight helps plants turn water and carbon dioxide into food.
        </div>
      </main>
      <aside
        aria-label={`${videoDesignPreviewTransition} transition preview`}
        style={{
          color: theme.colors.text,
          fontSize: theme.typography.bodySize,
          left: theme.safeAreas.body.left,
          opacity: secondOpacity,
          position: "absolute",
          right: theme.safeAreas.body.right,
          top: theme.safeAreas.body.top,
        }}
      >
        The lesson moves to its next visual explanation.
      </aside>
      <p
        style={{
          background: theme.colors.captionBackground,
          bottom: theme.safeAreas.caption.bottom,
          fontSize: theme.typography.captionSize,
          left: theme.safeAreas.caption.left,
          margin: 0,
          padding: theme.spacing.sm,
          position: "absolute",
          right: theme.safeAreas.caption.right,
          textAlign: "center",
        }}
      >
        Plants use sunlight to make their own food.
      </p>
    </div>
  );
}

export function VideoDesignPreview(): JSX.Element {
  return (
    <VideoThemeProvider>
      <PreviewContents />
    </VideoThemeProvider>
  );
}

export function VideoDesignPreviewComposition(): JSX.Element {
  return (
    <Composition
      id={videoDesignPreviewComposition.id}
      component={VideoDesignPreview}
      durationInFrames={videoDesignPreviewComposition.durationInFrames}
      fps={videoDesignPreviewComposition.fps}
      width={videoDesignPreviewComposition.width}
      height={videoDesignPreviewComposition.height}
    />
  );
}

export function VideoDesignPreviewPlayer({
  controls = true,
}: Readonly<{ controls?: boolean }>): JSX.Element {
  return (
    <Player
      component={VideoDesignPreview}
      compositionHeight={videoDesignPreviewComposition.height}
      compositionWidth={videoDesignPreviewComposition.width}
      controls={controls}
      durationInFrames={videoDesignPreviewComposition.durationInFrames}
      fps={videoDesignPreviewComposition.fps}
      initialFrame={18}
      style={{ width: "100%" }}
    />
  );
}
