/**
 * ST-114 — the v1 `data-chart` scene: an animated bar or line chart drawn
 * from an approved source table. Values are copied from the table cells by
 * `resolveDataChart`; nothing here invents or rounds a number. In render mode
 * a chart that cannot be resolved blocks the render; in preview it shows an
 * editor-safe notice naming the problem so the teacher can fix it.
 */
import { videoTheme } from "@avlp/design-system/video-theme";
import { dataChartPalette, type CreativeDesignPackId } from "@avlp/schemas";
import { useCurrentFrame } from "remotion";
import type { JSX } from "react";
import { layoutDataChart } from "./data-chart/chart-layout.js";
import {
  authoredDataChartBeatFrames,
  dataChartHighlightProgress,
  dataChartMarkProgress,
} from "./data-chart/chart-motion.js";
import { DataChartSvg } from "./data-chart/data-chart-svg.js";
import { resolveSceneChart } from "./data-chart/resolve.js";
import { scenePalette, type SceneComponentProps } from "./scene-registry.js";
import { secondsToFrames } from "./timing.js";

/** The chart panel inside the body safe area (1920×1080 canvas). */
export const dataChartScenePanel = Object.freeze({
  x: videoTheme.safeAreas.body.left,
  y: videoTheme.safeAreas.body.top,
  width:
    videoTheme.canvas.width - videoTheme.safeAreas.body.left - videoTheme.safeAreas.body.right,
  height:
    videoTheme.canvas.height - videoTheme.safeAreas.body.top - videoTheme.safeAreas.body.bottom,
});

export function DataChartSceneFrame({
  creativePresentation,
  frame,
  resolvedAssets,
  runtimeMode,
  scene,
  sceneCaptions,
}: SceneComponentProps & Readonly<{ frame: number }>): JSX.Element {
  if (scene.template !== "data-chart")
    throw new Error("DataChartScene requires a data-chart scene.");
  const colors = scenePalette(creativePresentation);
  const fontFamily = creativePresentation?.fontFamily ?? videoTheme.typography.fontFamily;
  const resolution = resolveSceneChart(scene, resolvedAssets);
  if (!resolution.ok && runtimeMode === "render")
    throw new Error(
      `Scene render blocked for ${resolution.failure.fieldPath}: ${resolution.failure.message}`,
    );
  const kicker = scene.visual.chartKind === "line" ? "WHAT CHANGES" : "COMPARE";
  return (
    <main
      aria-label="Data chart"
      style={{
        background: colors.background,
        boxSizing: "border-box",
        color: colors.text,
        fontFamily,
        height: "100%",
        position: "relative",
        width: "100%",
      }}
    >
      <header
        style={{
          left: videoTheme.safeAreas.title.left,
          position: "absolute",
          right: videoTheme.safeAreas.title.right,
          top: videoTheme.safeAreas.title.top,
        }}
      >
        <p
          style={{
            color: colors.primary,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            margin: 0,
          }}
        >
          {kicker}
        </p>
        <h1
          style={{
            fontSize: 48,
            lineHeight: 1.1,
            margin: `${videoTheme.spacing.xs}px 0 0`,
            overflowWrap: "anywhere",
          }}
        >
          {scene.title ?? "What the numbers show"}
        </h1>
      </header>
      <section
        data-data-chart-panel
        style={{
          height: dataChartScenePanel.height,
          left: dataChartScenePanel.x,
          position: "absolute",
          top: dataChartScenePanel.y,
          width: dataChartScenePanel.width,
        }}
      >
        {resolution.ok ? (
          <AnimatedChart
            chart={resolution.chart}
            frame={frame}
            fontFamily={fontFamily}
            packId={creativePresentation?.packId}
            scene={scene}
            sceneCaptions={sceneCaptions ?? []}
          />
        ) : (
          <div
            data-data-chart-error={resolution.failure.code}
            role="alert"
            style={{
              alignItems: "center",
              background: colors.surface,
              borderRadius: videoTheme.radii.md,
              boxSizing: "border-box",
              display: "flex",
              fontSize: 30,
              height: "100%",
              justifyContent: "center",
              lineHeight: 1.3,
              padding: videoTheme.spacing.lg,
              textAlign: "center",
            }}
          >
            Chart unavailable: {resolution.failure.message}
          </div>
        )}
      </section>
    </main>
  );
}

function AnimatedChart({
  chart,
  frame,
  fontFamily,
  packId,
  scene,
  sceneCaptions,
}: Readonly<{
  chart: Extract<ReturnType<typeof resolveSceneChart>, { ok: true }>["chart"];
  frame: number;
  fontFamily: string;
  packId: CreativeDesignPackId | undefined;
  scene: SceneComponentProps["scene"];
  sceneCaptions: NonNullable<SceneComponentProps["sceneCaptions"]>;
}>): JSX.Element {
  const layout = layoutDataChart(chart, {
    width: dataChartScenePanel.width,
    height: dataChartScenePanel.height,
  });
  // Keyed to the measured captions when the lesson has audio (ST-111).
  const beats = authoredDataChartBeatFrames(
    scene,
    secondsToFrames(scene.durationSeconds),
    chart.highlightIndex,
    sceneCaptions,
  );
  const progress = beats.items.map((complete) => dataChartMarkProgress(frame, complete));
  let active = -1;
  beats.items.forEach((complete, index) => {
    if (frame >= complete) active = index;
  });
  return (
    <DataChartSvg
      activeCategory={chart.highlightIndex !== undefined && frame >= beats.highlight ? chart.highlightIndex : active}
      chart={chart}
      fontFamily={fontFamily}
      highlight={dataChartHighlightProgress(frame, beats.highlight)}
      idPrefix={`chart-${scene.id}`}
      layout={layout}
      palette={dataChartPalette(packId)}
      progress={progress}
    />
  );
}

export function DataChartScene(props: SceneComponentProps): JSX.Element {
  return <DataChartSceneFrame {...props} frame={useCurrentFrame()} />;
}
