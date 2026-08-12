import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type DefinitionSceneFrameState = Readonly<{
  definitionOpacity: number;
  exampleOpacity: number;
  termOpacity: number;
  termTranslateY: number;
}>;

export function getDefinitionSceneFrameState(
  frame: number,
  durationSeconds: number,
): DefinitionSceneFrameState {
  const timing = getSceneFrameTiming(durationSeconds);
  const current = Math.max(0, Math.floor(frame));
  const reveal = (start: number) =>
    interpolate(
      current,
      [start, start + videoTheme.motion.reveal.durationInFrames],
      [0, 1],
      {
        easing: Easing.bezier(...videoTheme.motion.reveal.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );
  const exit = interpolate(
    current,
    [timing.exitStartFrame, timing.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...videoTheme.motion.exit.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const termOpacity = reveal(0) * exit;
  return Object.freeze({
    definitionOpacity: reveal(videoTheme.motion.enter.durationInFrames) * exit,
    exampleOpacity:
      reveal(
        videoTheme.motion.enter.durationInFrames +
          videoTheme.motion.reveal.durationInFrames,
      ) * exit,
    termOpacity,
    termTranslateY: (1 - termOpacity) * 28,
  });
}

function exampleAsset(scene: SceneComponentProps["scene"]) {
  return scene.assetBindings.find((binding) =>
    ["diagram", "icon", "illustration", "photo"].includes(binding.role),
  );
}

export function DefinitionSceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "definition")
    throw new Error("DefinitionScene requires a definition scene.");
  const state = getDefinitionSceneFrameState(frame, scene.durationSeconds);
  const asset = exampleAsset(scene);
  const hasExample =
    scene.visual.exampleLabel !== undefined &&
    scene.visual.exampleText !== undefined;
  const contentStyle: CSSProperties = {
    boxSizing: "border-box",
    display: "grid",
    gap: videoTheme.spacing.lg,
    gridTemplateColumns:
      asset === undefined ? "minmax(0, 1fr)" : "minmax(0, 1fr) 400px",
    height: "100%",
    padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px ${videoTheme.safeAreas.title.left}px`,
  };
  return (
    <main
      aria-label="Lesson definition"
      style={{
        background: videoTheme.colors.background,
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        height: "100%",
        width: "100%",
      }}
    >
      <section style={contentStyle}>
        <div
          style={{
            alignSelf: "center",
            maxWidth: asset === undefined ? 1200 : 1020,
          }}
        >
          <p
            style={{
              color: videoTheme.colors.primary,
              fontSize: videoTheme.typography.bodySize,
              fontWeight: 700,
              letterSpacing: 2,
              margin: 0,
            }}
          >
            KEY TERM
          </p>
          <h1
            style={{
              fontSize: videoTheme.typography.titleSize,
              lineHeight: videoTheme.typography.lineHeight,
              margin: `${videoTheme.spacing.xs}px 0 ${videoTheme.spacing.md}px`,
              opacity: state.termOpacity,
              overflowWrap: "anywhere",
              transform: `translateY(${state.termTranslateY}px)`,
            }}
          >
            {scene.visual.term}
          </h1>
          <p
            style={{
              fontSize: videoTheme.typography.bodySize,
              lineHeight: videoTheme.typography.lineHeight,
              margin: 0,
              maxWidth: 1040,
              opacity: state.definitionOpacity,
              overflowWrap: "anywhere",
            }}
          >
            {scene.visual.definition}
          </p>
          {!hasExample ? null : (
            <aside
              aria-label={scene.visual.exampleLabel}
              style={{
                borderLeft: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.accent}`,
                color: videoTheme.colors.mutedText,
                marginTop: videoTheme.spacing.lg,
                opacity: state.exampleOpacity,
                paddingLeft: videoTheme.spacing.md,
              }}
            >
              <strong
                style={{
                  color: videoTheme.colors.accent,
                  fontSize: 28,
                  letterSpacing: 1,
                }}
              >
                {scene.visual.exampleLabel}
              </strong>
              <p
                style={{
                  fontSize: 32,
                  lineHeight: videoTheme.typography.lineHeight,
                  margin: `${videoTheme.spacing.xs}px 0 0`,
                  overflowWrap: "anywhere",
                }}
              >
                {scene.visual.exampleText}
              </p>
            </aside>
          )}
        </div>
        {asset === undefined ? null : (
          <aside
            aria-label={asset.altText ?? "Definition visual example"}
            data-definition-visual-asset={asset.assetId}
            style={{
              alignSelf: "center",
              background: videoTheme.colors.surface,
              border: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
              borderRadius: videoTheme.radii.md,
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
              <circle cx="90" cy="90" fill={videoTheme.colors.primary} r="68" />
              <path
                d="M58 90h64M90 58v64"
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

export function DefinitionScene({ scene }: SceneComponentProps): JSX.Element {
  return <DefinitionSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
