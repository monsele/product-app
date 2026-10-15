/**
 * ST-114 — the two data-chart arrangements of the hero-diagram family.
 *
 * - `hero-chart`: the chart fills the frame beneath the header.
 * - `hero-chart-keyed`: the chart sits left; a key naming each series, the
 *   unit and the highlighted category's values fills the right.
 *
 * Both draw the same native chart from the approved table. Each category's
 * bars (or the line segment arriving at its point) reach their value on the
 * category's narration beat (`item-N`), and the highlight draws on at the
 * `emphasis` beat, never before the highlighted category itself.
 */
import { dataChartPalette, type ResolvedDataChart } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import { layoutDataChart } from "../../data-chart/chart-layout.js";
import {
  dataChartBeatFrames,
  dataChartHighlightProgress,
  dataChartMarkProgress,
} from "../../data-chart/chart-motion.js";
import { DataChartSvg } from "../../data-chart/data-chart-svg.js";
import { fitChartLabel } from "../../data-chart/chart-layout.js";
import {
  absolute,
  cinemaCanvas,
  headerHeight,
  SceneHeader,
  type CinemaCompositionProps,
} from "../frame.js";
import { BodyText, Kicker, Surface } from "../primitives.js";
import type { CinemaIdentity } from "../identity.js";

const headerWidth = 1400;

function useChartMotion(chart: ResolvedDataChart) {
  const beats = useCinemaBeats();
  const frames = dataChartBeatFrames(
    chart.categories.length,
    chart.highlightIndex,
    beats.startOf,
    beats.has,
  );
  const progress = frames.items.map((complete) => dataChartMarkProgress(beats.frame, complete));
  let active = -1;
  frames.items.forEach((complete, index) => {
    if (beats.frame >= complete) active = index;
  });
  const highlight = dataChartHighlightProgress(beats.frame, frames.highlight);
  const showHighlight = chart.highlightIndex !== undefined && beats.frame >= frames.highlight;
  return {
    progress,
    highlight,
    active: showHighlight ? chart.highlightIndex! : active,
  };
}

function ChartUnavailable({
  identity,
  message,
  x,
  y,
  width,
  height,
}: Readonly<{
  identity: CinemaIdentity;
  message: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>): JSX.Element {
  return (
    <Surface
      identity={identity}
      data-data-chart-error="true"
      style={{ ...absolute(x, y, width, height), display: "grid", placeItems: "center", padding: 48 }}
    >
      <BodyText identity={identity} fontSize={30} style={{ textAlign: "center" }}>
        Chart unavailable: {message}
      </BodyText>
    </Surface>
  );
}

function chartTop(props: CinemaCompositionProps): number {
  return (
    cinemaCanvas.top +
    headerHeight(props.identity, props.design.display.headline, headerWidth, { maxSize: 56 }) +
    28
  );
}

export function HeroChartComposition(props: CinemaCompositionProps): JSX.Element {
  const { scene, design, identity, chart } = props;
  if (scene.template !== "data-chart")
    throw new Error("The hero chart presents data-chart scenes.");
  const top = chartTop(props);
  const box = {
    x: cinemaCanvas.left,
    y: top,
    width: cinemaCanvas.right - cinemaCanvas.left,
    height: cinemaCanvas.bottom - top,
  };
  return (
    <>
      <SceneHeader identity={identity} design={design} scene={scene} x={box.x} y={cinemaCanvas.top} width={headerWidth} maxSize={56} />
      {chart === undefined || !chart.ok ? (
        <ChartUnavailable
          identity={identity}
          message={chart?.ok === false ? chart.failure.message : "The chart's table is not available."}
          {...box}
        />
      ) : (
        <ChartPanel chart={chart.chart} identity={identity} sceneId={scene.id} box={box} />
      )}
    </>
  );
}

function ChartPanel({
  chart,
  identity,
  sceneId,
  box,
  readout = true,
}: Readonly<{
  chart: ResolvedDataChart;
  identity: CinemaIdentity;
  sceneId: string;
  box: Readonly<{ x: number; y: number; width: number; height: number }>;
  /** False when a key beside the chart already shows the narrated values. */
  readout?: boolean;
}>): JSX.Element {
  const motion = useChartMotion(chart);
  const layout = layoutDataChart(chart, { width: box.width, height: box.height });
  return (
    <div data-data-chart-panel style={absolute(box.x, box.y, box.width, box.height)}>
      <DataChartSvg
        activeCategory={readout ? motion.active : -1}
        chart={chart}
        fontFamily={identity.fonts.body}
        highlight={motion.highlight}
        idPrefix={`cinema-chart-${sceneId}`}
        layout={layout}
        palette={dataChartPalette(identity.packId)}
        progress={motion.progress}
      />
    </div>
  );
}

const keyWidth = 460;
const keyGutter = 56;

export function HeroChartKeyedComposition(props: CinemaCompositionProps): JSX.Element {
  const { scene, design, identity, chart } = props;
  if (scene.template !== "data-chart")
    throw new Error("The keyed chart presents data-chart scenes.");
  const top = chartTop(props);
  const box = {
    x: cinemaCanvas.left,
    y: top,
    width: cinemaCanvas.right - cinemaCanvas.left - keyWidth - keyGutter,
    height: cinemaCanvas.bottom - top,
  };
  return (
    <>
      <SceneHeader identity={identity} design={design} scene={scene} x={box.x} y={cinemaCanvas.top} width={headerWidth} maxSize={56} />
      {chart === undefined || !chart.ok ? (
        <ChartUnavailable
          identity={identity}
          message={chart?.ok === false ? chart.failure.message : "The chart's table is not available."}
          {...box}
        />
      ) : (
        <>
          <ChartPanel chart={chart.chart} identity={identity} sceneId={scene.id} box={box} readout={false} />
          <ChartKey chart={chart.chart} identity={identity} x={box.x + box.width + keyGutter} y={top} height={box.height} />
        </>
      )}
    </>
  );
}

/** Series names, the unit and the highlighted (or narrated) values. */
function ChartKey({
  chart,
  identity,
  x,
  y,
  height,
}: Readonly<{
  chart: ResolvedDataChart;
  identity: CinemaIdentity;
  x: number;
  y: number;
  height: number;
}>): JSX.Element {
  const beats = useCinemaBeats();
  const motion = useChartMotion(chart);
  const palette = dataChartPalette(identity.packId);
  const focus = motion.active;
  const focusLabel = focus >= 0 ? chart.categories[focus]?.label : undefined;
  const fittedFocus =
    focusLabel === undefined ? undefined : fitChartLabel(focusLabel, keyWidth - 56, [40, 34, 28], 0.55, 2);
  return (
    <Surface
      identity={identity}
      data-data-chart-key="true"
      style={{
        ...absolute(x, y, keyWidth, height),
        ...arrival(beats.reveal("headline"), "left"),
        display: "flex",
        flexDirection: "column",
        gap: 20,
        padding: 28,
      }}
    >
      <Kicker identity={identity}>{chart.categoryName.slice(0, 40)}</Kicker>
      {chart.unitLabel === undefined ? null : (
        <BodyText identity={identity} fontSize={26} muted>
          {chart.unitLabel}
        </BodyText>
      )}
      <ul style={{ display: "grid", gap: 14, listStyle: "none", margin: 0, padding: 0 }}>
        {chart.series.map((series, index) => {
          const name = fitChartLabel(series.name, keyWidth - 120, [28, 24, 20], 0.55, 2);
          return (
            <li data-data-chart-key-series={index + 1} key={index} style={{ alignItems: "center", display: "flex", gap: 16 }}>
              <svg aria-hidden="true" width={44} height={28} viewBox="0 0 44 28">
                <rect width={44} height={28} rx={6} fill={palette.surface} />
                <rect x={6} y={6} width={32} height={16} rx={3} fill={palette.series[index]} />
                {/* The series' own pattern, so the key never relies on colour. */}
                {index === 1
                  ? [10, 18, 26, 34].map((x) => (
                      <line key={x} x1={x} y1={22} x2={x + 6} y2={6} stroke={palette.surface} strokeWidth={2.5} opacity={0.55} />
                    ))
                  : index === 2
                    ? [12, 22, 32].map((x) => <circle key={x} cx={x} cy={14} r={2.4} fill={palette.surface} opacity={0.6} />)
                    : null}
              </svg>
              <BodyText identity={identity} fontSize={name.fontSize}>
                {name.lines.join(" ")}
              </BodyText>
            </li>
          );
        })}
      </ul>
      {fittedFocus === undefined ? null : (
        <div data-data-chart-key-focus={focus + 1} style={{ marginTop: "auto", opacity: motion.progress[focus] ?? 1 }}>
          <BodyText identity={identity} fontSize={fittedFocus.fontSize} style={{ fontWeight: 700 }}>
            {fittedFocus.lines.join(" ")}
          </BodyText>
          {chart.series.map((series, index) => (
            <BodyText identity={identity} fontSize={30} key={index} muted={false}>
              {chart.series.length > 1 ? `${fitChartLabel(series.name, keyWidth - 200, [24], 0.55, 1).lines[0]}: ` : ""}
              <strong>{series.values[focus]?.text}</strong>
            </BodyText>
          ))}
        </div>
      )}
    </Surface>
  );
}
