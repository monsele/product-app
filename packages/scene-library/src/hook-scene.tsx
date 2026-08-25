import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type HookSceneFrameState = Readonly<{
  contentOpacity: number;
  contentTranslateY: number;
  emphasisScale: number;
}>;

export function getHookSceneFrameState(
  frame: number,
  durationSeconds: number,
): HookSceneFrameState {
  const timing = getSceneFrameTiming(durationSeconds);
  const clampedFrame = Math.max(0, Math.floor(frame));
  const enter = interpolate(
    clampedFrame,
    [0, videoTheme.motion.enter.durationInFrames],
    [0, 1],
    {
      easing: Easing.bezier(...videoTheme.motion.enter.easing),
      extrapolateRight: "clamp",
    },
  );
  const exit = interpolate(
    clampedFrame,
    [timing.exitStartFrame, timing.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...videoTheme.motion.exit.easing),
      extrapolateLeft: "clamp",
    },
  );
  const emphasis = interpolate(
    clampedFrame,
    [
      videoTheme.motion.enter.durationInFrames,
      videoTheme.motion.enter.durationInFrames +
        videoTheme.motion.emphasize.durationInFrames,
    ],
    [1, 1.035],
    {
      easing: Easing.bezier(...videoTheme.motion.emphasize.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return Object.freeze({
    contentOpacity: enter * exit,
    contentTranslateY: (1 - enter) * 36,
    emphasisScale: emphasis,
  });
}

function firstSubjectAsset(scene: SceneComponentProps["scene"]) {
  return scene.assetBindings.find((binding) =>
    ["icon", "illustration", "photo"].includes(binding.role),
  );
}

export function HookSceneFrame({
  scene,
  frame,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "hook")
    throw new Error("HookScene requires a hook scene.");
  const state = getHookSceneFrameState(frame, scene.durationSeconds);
  const asset = firstSubjectAsset(scene);
  const contentStyle: CSSProperties = {
    boxSizing: "border-box",
    display: "grid",
    gap: videoTheme.spacing.lg,
    gridTemplateColumns: asset === undefined ? "1fr" : "minmax(0, 1fr) 390px",
    height: "100%",
    opacity: state.contentOpacity,
    padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px`,
    transform: `translateY(${state.contentTranslateY}px)`,
  };
  const elements = scene.visual.supportingElements ?? [];
  return (
    <main
      aria-label="Lesson hook"
      style={{
        background: videoTheme.colors.background,
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        height: "100%",
        width: "100%",
      }}
    >
      <section style={contentStyle}>
        <div style={{ alignSelf: "center", maxWidth: 1100 }}>
          <p
            style={{
              color: videoTheme.colors.primary,
              fontSize: videoTheme.typography.bodySize,
              fontWeight: 700,
              letterSpacing: 2,
              margin: 0,
            }}
          >
            THINK ABOUT THIS
          </p>
          <h1
            style={{
              fontSize: videoTheme.typography.titleSize,
              lineHeight: videoTheme.typography.lineHeight,
              margin: `${videoTheme.spacing.sm}px 0`,
              overflowWrap: "anywhere",
              transform: `scale(${state.emphasisScale})`,
              transformOrigin: "left center",
            }}
          >
            {scene.visual.question}
          </h1>
          {scene.visual.prompt === undefined ? null : (
            <p
              style={{
                color: videoTheme.colors.mutedText,
                fontSize: videoTheme.typography.bodySize,
                lineHeight: videoTheme.typography.lineHeight,
                margin: 0,
                overflowWrap: "anywhere",
              }}
            >
              {scene.visual.prompt}
            </p>
          )}
          {elements.length === 0 ? null : (
            <ul
              aria-label="Supporting ideas"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: videoTheme.spacing.sm,
                listStyle: "none",
                margin: `${videoTheme.spacing.md}px 0 0`,
                padding: 0,
              }}
            >
              {elements.map((element) => (
                <li
                  key={element}
                  style={{
                    background: videoTheme.colors.surface,
                    borderRadius: videoTheme.radii.md,
                    color: videoTheme.colors.text,
                    fontSize: 30,
                    overflowWrap: "anywhere",
                    padding: `${videoTheme.spacing.xs}px ${videoTheme.spacing.sm}px`,
                  }}
                >
                  {element}
                </li>
              ))}
            </ul>
          )}
        </div>
        {asset === undefined ? null : (
          <aside
            aria-label={asset.altText ?? "Supporting lesson illustration"}
            data-hook-subject-asset={asset.assetId}
            style={{
              alignSelf: "center",
              background: videoTheme.colors.surface,
              border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.accent}`,
              borderRadius: "50%",
              display: "grid",
              height: 360,
              placeItems: "center",
              width: 360,
            }}
          >
            <svg
              aria-hidden="true"
              height="180"
              viewBox="0 0 180 180"
              width="180"
            >
              <circle cx="90" cy="90" fill={videoTheme.colors.primary} r="72" />
              <path
                d="M90 38v104M38 90h104"
                stroke={videoTheme.colors.background}
                strokeWidth="14"
              />
            </svg>
          </aside>
        )}
      </section>
    </main>
  );
}

export function HookScene({ scene }: SceneComponentProps): JSX.Element {
  return <HookSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
