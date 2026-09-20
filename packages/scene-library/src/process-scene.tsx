import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import type { CSSProperties, JSX } from "react";
import {
  resolveSafeDiagramAsset,
  type SceneComponentProps,
} from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";
import { measureTextLayout } from "./layout.js";
import { GraphDiagram } from "./graph-diagram.js";

export type ProcessLayout = "horizontal" | "vertical";

export type ProcessSceneFrameState = Readonly<{
  activeStep: number;
  stepOpacity: number;
}>;

/**
 * Per-step chrome for the vertical layout. The values are chosen at render time
 * rather than fixed, because a six-step list has roughly half the room per row
 * that a five-step list does and a wrapped title takes another line off the top.
 */
export type ProcessStepMetrics = Readonly<{
  badgeSize: number;
  borderWidth: number;
  fontSize: number;
  gap: number;
  paddingY: number;
}>;

const maximumHorizontalLabelLength = 36;
const verticalStepPaddingX = videoTheme.spacing.sm;
const verticalStepColumnGap = videoTheme.spacing.sm;
const maximumStepLines = 2;

const verticalStepCeiling: ProcessStepMetrics = Object.freeze({
  badgeSize: 56,
  borderWidth: videoTheme.lineWidths.emphasis,
  fontSize: 30,
  gap: videoTheme.spacing.sm,
  paddingY: videoTheme.spacing.xs,
});

const verticalStepFloor: ProcessStepMetrics = Object.freeze({
  badgeSize: 40,
  borderWidth: 4,
  fontSize: 22,
  gap: 8,
  paddingY: 6,
});

export function selectProcessLayout(
  steps: readonly string[],
): ProcessLayout {
  return steps.length <= 4 &&
    steps.every((step) => step.length <= maximumHorizontalLabelLength)
    ? "horizontal"
    : "vertical";
}

function contentWidth(): number {
  return (
    videoTheme.canvas.width -
    videoTheme.safeAreas.title.left -
    videoTheme.safeAreas.title.right
  );
}

/** Mirrors the header markup below so the list knows its own budget. */
function measureHeaderHeight(title: string): number {
  const eyebrow =
    videoTheme.typography.bodySize * videoTheme.typography.lineHeight;
  const titleLines = measureTextLayout(title, {
    fontSize: videoTheme.typography.titleSize,
    lineHeight: videoTheme.typography.lineHeight,
    maxLines: 3,
    width: contentWidth(),
  }).lineCount;
  return (
    eyebrow +
    videoTheme.spacing.xs +
    titleLines *
      videoTheme.typography.titleSize *
      videoTheme.typography.lineHeight +
    videoTheme.spacing.md
  );
}

function availableStepsHeight(title: string): number {
  return (
    videoTheme.canvas.height -
    videoTheme.safeAreas.title.top -
    videoTheme.safeAreas.body.bottom -
    measureHeaderHeight(title)
  );
}

function stepLabelWidth(
  metrics: ProcessStepMetrics,
  reserveIconColumn: boolean,
): number {
  return (
    contentWidth() -
    2 * metrics.borderWidth -
    2 * verticalStepPaddingX -
    metrics.badgeSize -
    verticalStepColumnGap -
    (reserveIconColumn ? metrics.badgeSize + verticalStepColumnGap : 0)
  );
}

function stepRowHeight(
  metrics: ProcessStepMetrics,
  step: string,
  reserveIconColumn: boolean,
): number {
  const lines = Math.min(
    maximumStepLines,
    measureTextLayout(step, {
      fontSize: metrics.fontSize,
      lineHeight: videoTheme.typography.lineHeight,
      maxLines: maximumStepLines,
      width: stepLabelWidth(metrics, reserveIconColumn),
    }).lineCount,
  );
  return (
    Math.max(
      metrics.badgeSize,
      lines * metrics.fontSize * videoTheme.typography.lineHeight,
    ) +
    2 * metrics.paddingY +
    2 * metrics.borderWidth
  );
}

function blendMetrics(ratio: number): ProcessStepMetrics {
  const at = (floor: number, ceiling: number): number =>
    Math.round(floor + (ceiling - floor) * ratio);
  return Object.freeze({
    badgeSize: at(verticalStepFloor.badgeSize, verticalStepCeiling.badgeSize),
    borderWidth: at(
      verticalStepFloor.borderWidth,
      verticalStepCeiling.borderWidth,
    ),
    fontSize: at(verticalStepFloor.fontSize, verticalStepCeiling.fontSize),
    gap: at(verticalStepFloor.gap, verticalStepCeiling.gap),
    paddingY: at(verticalStepFloor.paddingY, verticalStepCeiling.paddingY),
  });
}

/**
 * Picks the largest step chrome whose rows still fit between the header and the
 * caption safe area. Without this the rows keep their natural height, the grid
 * track clamps them, and every label spills out under its own border.
 */
export function getProcessStepMetrics(
  steps: readonly string[],
  title: string,
  reserveIconColumn: boolean,
): ProcessStepMetrics {
  const available = availableStepsHeight(title);
  const gradations = 20;
  for (let index = gradations; index >= 0; index -= 1) {
    const metrics = blendMetrics(index / gradations);
    const required =
      steps.reduce(
        (total, step) => total + stepRowHeight(metrics, step, reserveIconColumn),
        0,
      ) +
      Math.max(0, steps.length - 1) * metrics.gap;
    if (required <= available) return metrics;
  }
  return verticalStepFloor;
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
  creativePresentation,
  frame,
  resolvedAssets,
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
  const title = scene.title ?? "How it happens";
  const layout = selectProcessLayout(steps);
  // Reserved for the whole list rather than per row, so every label keeps a
  // common left edge and nothing shifts when one step's image resolves and
  // another's does not.
  const reserveIconColumn = steps.some(
    (_, index) => stepIcon(scene, index) !== undefined,
  );
  const metrics = getProcessStepMetrics(steps, title, reserveIconColumn);
  const state = getProcessSceneFrameState(
    frame,
    scene.durationSeconds,
    steps.length,
  );
  const stepsStyle: CSSProperties = {
    boxSizing: "border-box",
    display: "grid",
    gap: layout === "horizontal" ? videoTheme.spacing.md : metrics.gap,
    gridAutoFlow: layout === "horizontal" ? "column" : "row",
    gridAutoColumns: layout === "horizontal" ? "minmax(0, 1fr)" : undefined,
    minHeight: 0,
  };
  return (
    <main
      aria-label="Lesson process"
      style={{
        background: creativePresentation?.background ?? videoTheme.colors.background,
        color: creativePresentation?.text ?? videoTheme.colors.text,
        fontFamily:
          creativePresentation?.fontFamily ?? videoTheme.typography.fontFamily,
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
            {title}
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
            overflow: "hidden",
            padding: 0,
          }}
        >
          {steps.map((step, index) => {
            const isRevealed = index <= state.activeStep;
            const isActive = index === state.activeStep;
            const icon = stepIcon(scene, index);
            const resolvedIcon = resolveSafeDiagramAsset(
              icon?.assetId,
              resolvedAssets,
            );
            const ornamentSize =
              layout === "horizontal" ? 56 : metrics.badgeSize;
            return (
              <li
                key={`${index}-${step}`}
                data-process-step={index + 1}
                style={{
                  alignItems: "center",
                  background: isActive
                    ? videoTheme.colors.surface
                    : "transparent",
                  border: `${layout === "horizontal" ? videoTheme.lineWidths.emphasis : metrics.borderWidth}px solid ${isActive ? videoTheme.colors.accent : videoTheme.colors.primary}`,
                  borderRadius: videoTheme.radii.md,
                  boxSizing: "border-box",
                  display: "grid",
                  gap:
                    layout === "horizontal"
                      ? videoTheme.spacing.sm
                      : verticalStepColumnGap,
                  gridTemplateColumns:
                    layout === "horizontal"
                      ? "auto minmax(0, 1fr)"
                      : reserveIconColumn
                        ? "auto auto minmax(0, 1fr)"
                        : "auto minmax(0, 1fr)",
                  minHeight: layout === "horizontal" ? 300 : undefined,
                  opacity: isRevealed ? (isActive ? state.stepOpacity : 1) : 0,
                  padding:
                    layout === "horizontal"
                      ? videoTheme.spacing.md
                      : `${metrics.paddingY}px ${verticalStepPaddingX}px`,
                  transform: `translateY(${isRevealed ? 0 : 20}px)`,
                }}
              >
                <span aria-hidden="true" style={{ background: videoTheme.colors.primary, borderRadius: "50%", color: videoTheme.colors.background, display: "grid", flexShrink: 0, fontSize: Math.round(ornamentSize * 0.54), fontWeight: 700, height: ornamentSize, placeItems: "center", width: ornamentSize }}>
                  {index + 1}
                </span>
                {layout === "vertical" ? (
                  reserveIconColumn ? (
                    <ProcessStepIcon
                      altText={icon?.altText ?? `Icon for step ${index + 1}`}
                      hasBinding={icon !== undefined}
                      resolved={resolvedIcon}
                      size={ornamentSize}
                      step={index + 1}
                    />
                  ) : null
                ) : (
                  <span style={{ display: "grid", gap: videoTheme.spacing.xs, minWidth: 0 }}>
                    <ProcessStepIcon
                      altText={icon?.altText ?? `Icon for step ${index + 1}`}
                      hasBinding={icon !== undefined}
                      resolved={resolvedIcon}
                      size={72}
                      step={index + 1}
                    />
                    <span style={{ fontSize: 34, fontWeight: isActive ? 700 : 500, lineHeight: videoTheme.typography.lineHeight, overflowWrap: "anywhere" }}>
                      {step}
                    </span>
                  </span>
                )}
                {layout === "horizontal" ? null : (
                  <span style={{ fontSize: metrics.fontSize, fontWeight: isActive ? 700 : 500, lineHeight: videoTheme.typography.lineHeight, minWidth: 0, overflowWrap: "anywhere" }}>
                    {step}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

/** A step's image, its unresolved placeholder, or an empty reserved cell. */
function ProcessStepIcon({
  altText,
  hasBinding,
  resolved,
  size,
  step,
}: Readonly<{
  altText: string;
  hasBinding: boolean;
  resolved: ReturnType<typeof resolveSafeDiagramAsset>;
  size: number;
  step: number;
}>): JSX.Element | null {
  if (!hasBinding)
    return <span aria-hidden="true" style={{ width: size }} />;
  if (resolved === undefined)
    return (
      <span
        aria-label={altText}
        data-process-step-icon={step}
        style={{
          alignContent: "center",
          color: videoTheme.colors.accent,
          display: "grid",
          fontSize: Math.round(size * 0.4),
          height: size,
          justifyContent: "center",
          width: size,
        }}
      >
        ●
      </span>
    );
  return (
    <img
      alt={resolved.altText}
      data-process-step-image={step}
      data-process-step-image-source={resolved.source}
      src={resolved.src}
      style={{
        borderRadius: videoTheme.radii.md,
        height: size,
        objectFit: "cover",
        width: size,
      }}
    />
  );
}

export function ProcessScene({
  creativePresentation,
  resolvedAssets,
  runtimeMode,
  scene,
}: SceneComponentProps): JSX.Element {
  return (
    <ProcessSceneFrame
      frame={useCurrentFrame()}
      {...(creativePresentation === undefined ? {} : { creativePresentation })}
      {...(resolvedAssets === undefined ? {} : { resolvedAssets })}
      {...(runtimeMode === undefined ? {} : { runtimeMode })}
      scene={scene}
    />
  );
}
