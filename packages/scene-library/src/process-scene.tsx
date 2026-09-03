import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import type { SceneComponentProps } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";
import { GraphDiagram } from "./graph-diagram.js";

export type ProcessLayout = "horizontal" | "vertical";

export type ProcessSceneFrameState = Readonly<{
  activeStep: number;
  stepOpacity: number;
}>;

const maximumHorizontalLabelLength = 36;

export function selectProcessLayout(
  steps: readonly string[],
): ProcessLayout {
  return steps.length <= 4 &&
    steps.every((step) => step.length <= maximumHorizontalLabelLength)
    ? "horizontal"
    : "vertical";
}

export function getProcessSceneFrameState(
  frame: number,
  durationSeconds: number,
  stepCount: number,
): ProcessSceneFrameState {
  const timing = getSceneFrameTiming(durationSeconds);
  const current = Math.max(0, Math.floor(frame));
  const revealStart = videoTheme.motion.enter.durationInFrames;
  const revealDuration = videoTheme.motion.reveal.durationInFrames;
  const activeStep = Math.min(
    stepCount - 1,
    Math.max(0, Math.floor((current - revealStart) / revealDuration)),
  );
  const currentStepStart = revealStart + activeStep * revealDuration;
  const enter = interpolate(
    current,
    [currentStepStart, currentStepStart + revealDuration],
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
  return Object.freeze({ activeStep, stepOpacity: enter * exit });
}

function stepIcon(
  scene: SceneComponentProps["scene"],
  index: number,
) {
  return scene.assetBindings.find(
    (binding) => binding.role === "icon" && binding.slot === `step-${index + 1}-icon`,
  );
}

export function ProcessSceneFrame({
  frame,
  scene,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "process")
    throw new Error("ProcessScene requires a process scene.");
  if (scene.visual.nodes !== undefined && scene.visual.edges !== undefined)
    return (
      <GraphDiagram
        durationSeconds={scene.durationSeconds}
        edges={scene.visual.edges}
        eyebrow="PROCESS"
        frame={frame}
        narration={scene.narration}
        nodes={scene.visual.nodes}
        title={scene.title ?? "How it happens"}
      />
    );
  const steps = scene.visual.steps ?? [];
  const layout = selectProcessLayout(steps);
  const state = getProcessSceneFrameState(
    frame,
    scene.durationSeconds,
    steps.length,
  );
  const stepsStyle: CSSProperties = {
    boxSizing: "border-box",
    display: "grid",
    gap: layout === "horizontal" ? videoTheme.spacing.md : videoTheme.spacing.sm,
    gridAutoFlow: layout === "horizontal" ? "column" : "row",
    gridAutoColumns: layout === "horizontal" ? "minmax(0, 1fr)" : undefined,
    minHeight: 0,
  };
  return (
    <main
      aria-label="Lesson process"
      style={{
        background: videoTheme.colors.background,
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        height: "100%",
        width: "100%",
      }}
    >
      <section
        style={{
          boxSizing: "border-box",
          display: "grid",
          gridTemplateRows: "auto minmax(0, 1fr)",
          height: "100%",
          padding: `${videoTheme.safeAreas.title.top}px ${videoTheme.safeAreas.title.right}px ${videoTheme.safeAreas.body.bottom}px ${videoTheme.safeAreas.title.left}px`,
        }}
      >
        <header>
          <p style={{ color: videoTheme.colors.primary, fontSize: videoTheme.typography.bodySize, fontWeight: 700, letterSpacing: 2, margin: 0 }}>
            PROCESS
          </p>
          <h1 style={{ fontSize: videoTheme.typography.titleSize, lineHeight: videoTheme.typography.lineHeight, margin: `${videoTheme.spacing.xs}px 0 ${videoTheme.spacing.md}px`, overflowWrap: "anywhere" }}>
            {scene.title ?? "How it happens"}
          </h1>
        </header>
        <ol
          aria-label="Ordered process steps"
          data-process-layout={layout}
          style={{
            ...stepsStyle,
            alignContent: "center",
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {steps.map((step, index) => {
            const isRevealed = index <= state.activeStep;
            const icon = stepIcon(scene, index);
            return (
              <li
                key={`${index}-${step}`}
                data-process-step={index + 1}
                style={{
                  alignItems: "center",
                  background: index === state.activeStep ? videoTheme.colors.surface : "transparent",
                  border: `${videoTheme.lineWidths.emphasis}px solid ${index === state.activeStep ? videoTheme.colors.accent : videoTheme.colors.primary}`,
                  borderRadius: videoTheme.radii.md,
                  boxSizing: "border-box",
                  display: "grid",
                  gap: videoTheme.spacing.sm,
                  gridTemplateColumns: "auto minmax(0, 1fr)",
                  minHeight: layout === "horizontal" ? 300 : 84,
                  opacity: isRevealed ? (index === state.activeStep ? state.stepOpacity : 1) : 0,
                  padding:
                    layout === "horizontal"
                      ? videoTheme.spacing.md
                      : videoTheme.spacing.xs,
                  transform: `translateY(${isRevealed ? 0 : 20}px)`,
                }}
              >
                <span aria-hidden="true" style={{ background: videoTheme.colors.primary, borderRadius: "50%", color: videoTheme.colors.background, display: "grid", fontSize: 30, fontWeight: 700, height: 56, placeItems: "center", width: 56 }}>
                  {index + 1}
                </span>
                <span style={{ display: "grid", gap: videoTheme.spacing.xs, minWidth: 0 }}>
                  {icon === undefined ? null : (
                    <span aria-label={icon.altText ?? `Icon for step ${index + 1}`} data-process-step-icon={index + 1} style={{ color: videoTheme.colors.accent, fontSize: 24 }}>
                      ●
                    </span>
                  )}
                  <span style={{ fontSize: layout === "horizontal" ? 34 : 30, fontWeight: index === state.activeStep ? 700 : 500, lineHeight: videoTheme.typography.lineHeight, overflowWrap: "anywhere" }}>
                    {step}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

export function ProcessScene({ scene }: SceneComponentProps): JSX.Element {
  return <ProcessSceneFrame frame={useCurrentFrame()} scene={scene} />;
}
