import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

export type WorkedExampleSceneFrameState = Readonly<{
  activeStep: number;
  resultOpacity: number;
  stepOpacities: readonly number[];
}>;

function fadeAt(
  frame: number,
  start: number,
  exitStart: number,
  end: number,
): number {
  return (
    interpolate(
      frame,
      [start, start + videoTheme.motion.reveal.durationInFrames],
      [0, 1],
      {
        easing: Easing.bezier(...videoTheme.motion.reveal.easing),
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ) *
    interpolate(frame, [exitStart, end], [1, 0], {
      easing: Easing.bezier(...videoTheme.motion.exit.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
}

export function getWorkedExampleSceneFrameState(
  frame: number,
  durationSeconds: number,
  stepCount: number,
): WorkedExampleSceneFrameState {
  const timing = getSceneFrameTiming(durationSeconds);
  const current = Math.max(0, Math.floor(frame));
  const safeStepCount = Math.max(1, stepCount);
  const revealStart = timing.enterEndFrame;
  const revealWindow = Math.max(1, timing.exitStartFrame - revealStart);
  const stageDuration = Math.max(
    1,
    Math.floor(revealWindow / (safeStepCount + 1)),
  );
  const stepOpacities = Array.from({ length: safeStepCount }, (_, index) =>
    fadeAt(
      current,
      revealStart + index * stageDuration,
      timing.exitStartFrame,
      timing.durationInFrames,
    ),
  );
  const resultOpacity = fadeAt(
    current,
    revealStart + safeStepCount * stageDuration,
    timing.exitStartFrame,
    timing.durationInFrames,
  );
  const activeStep = stepOpacities.reduce(
    (latest, opacity, index) => (opacity > 0 ? index : latest),
    -1,
  );
  return Object.freeze({
    activeStep,
    resultOpacity,
    stepOpacities: Object.freeze(stepOpacities),
  });
}

function isEquationLike(value: string): boolean {
  return /[=÷×+\-*/^]|\d/.test(value);
}

export function WorkedExampleSceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "worked-example")
    throw new Error("WorkedExampleScene requires a worked-example scene.");
  const state = getWorkedExampleSceneFrameState(
    frame,
    scene.durationSeconds,
    scene.visual.steps.length,
  );
  const equationStyle: CSSProperties = {
    fontFamily: '"Atkinson Hyperlegible Mono", ui-monospace, monospace',
  };
  const denseSteps = scene.visual.steps.length > 4;
  return (
    <main
      aria-label="Worked example"
      style={{
        background: videoTheme.colors.background,
        boxSizing: "border-box",
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        height: "100%",
        padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px ${videoTheme.safeAreas.title.left}px`,
        width: "100%",
      }}
    >
      <header style={{ marginBottom: videoTheme.spacing.md }}>
        <p
          style={{
            color: videoTheme.colors.primary,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            margin: 0,
          }}
        >
          WORKED EXAMPLE
        </p>
        <h1
          style={{
            fontSize: 44,
            lineHeight: 1.1,
            margin: `${videoTheme.spacing.xs}px 0 0`,
            overflowWrap: "anywhere",
          }}
        >
          {scene.title ?? "Solve it step by step"}
        </h1>
      </header>
      <section
        aria-label="Problem statement"
        data-worked-example-problem
        style={{
          background: videoTheme.colors.surface,
          borderLeft: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.primary}`,
          borderRadius: videoTheme.radii.md,
          fontSize: 26,
          lineHeight: videoTheme.typography.lineHeight,
          marginBottom: videoTheme.spacing.md,
          padding: `${videoTheme.spacing.xs}px ${videoTheme.spacing.md}px`,
          overflowWrap: "anywhere",
        }}
      >
        {scene.visual.problem}
      </section>
      <ol
        aria-label="Worked solution steps"
        style={{
          display: "grid",
          gap: videoTheme.spacing.xs,
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {scene.visual.steps.map((step, index) => {
          const opacity = state.stepOpacities[index] ?? 0;
          const active = state.activeStep === index;
          return (
            <li
              data-worked-example-step={index + 1}
              key={`${index}-${step}`}
              style={{
                alignItems: "center",
                background: active ? videoTheme.colors.surface : "transparent",
                border: `${videoTheme.lineWidths.emphasis}px solid ${active ? videoTheme.colors.accent : videoTheme.colors.primary}`,
                borderRadius: videoTheme.radii.md,
                boxSizing: "border-box",
                display: denseSteps && !active ? "none" : "grid",
                fontSize: denseSteps ? 14 : 24,
                gap: videoTheme.spacing.md,
                gridTemplateColumns: "48px minmax(0, 1fr)",
                minHeight: denseSteps ? 28 : 54,
                opacity,
                padding: denseSteps
                  ? "2px 12px"
                  : `${videoTheme.spacing.xs}px ${videoTheme.spacing.md}px`,
                transform: `translateY(${(1 - opacity) * 14}px)`,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  background: videoTheme.colors.primary,
                  borderRadius: "50%",
                  color: videoTheme.colors.background,
                  display: "grid",
                  fontSize: denseSteps ? 14 : 24,
                  fontWeight: 700,
                  height: denseSteps ? 24 : 40,
                  placeItems: "center",
                  width: denseSteps ? 24 : 40,
                }}
              >
                {index + 1}
              </span>
              <span
                style={{
                  ...(isEquationLike(step) ? equationStyle : {}),
                  fontWeight: active ? 700 : 500,
                  lineHeight: videoTheme.typography.lineHeight,
                  overflowWrap: "anywhere",
                }}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
      <section
        aria-label="Final result"
        data-worked-example-result
        style={{
          background: videoTheme.colors.accent,
          borderRadius: videoTheme.radii.md,
          boxSizing: "border-box",
          color: videoTheme.colors.background,
          fontSize: 28,
          fontWeight: 700,
          marginTop: videoTheme.spacing.md,
          opacity: state.resultOpacity,
          overflowWrap: "anywhere",
          padding: `${videoTheme.spacing.md}px ${videoTheme.spacing.md}px`,
          ...(isEquationLike(scene.visual.answer) ? equationStyle : {}),
        }}
      >
        {scene.visual.answer}
      </section>
    </main>
  );
}

export function WorkedExampleScene({
  scene,
}: SceneComponentProps): JSX.Element {
  return <WorkedExampleSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
