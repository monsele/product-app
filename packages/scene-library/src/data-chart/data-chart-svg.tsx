/**
 * ST-114 — the native chart drawing shared by the v1 `DataChartScene` and the
 * v2 chart compositions. It paints on its own panel surface with the pack's
 * chart palette, so its contrast guarantees hold on any lesson background.
 * Series differ by fill pattern (bars) or dash and marker (lines) as well as
 * colour. Values shown are the table cells' own text.
 */
import {
  dataChartSeriesDashes,
  dataChartSeriesMarkers,
  dataChartSummary,
  type DataChartPalette,
  type ResolvedDataChart,
} from "@avlp/schemas";
import type { JSX } from "react";
import {
  dataChartTextWidth,
  defaultDataChartTypography,
  fitChartLabel,
  type DataChartLayout,
} from "./chart-layout.js";

export type DataChartSvgProps = Readonly<{
  chart: ResolvedDataChart;
  layout: DataChartLayout;
  palette: DataChartPalette;
  fontFamily: string;
  /** Unique within the page; prefixes pattern ids. */
  idPrefix: string;
  /** 0 → 1 growth of each category's marks. */
  progress: readonly number[];
  /** 0 → 1 emphasis of the highlighted category. */
  highlight: number;
  /** Category whose values the active readout shows, or -1. */
  activeCategory: number;
}>;

function patternFill(prefix: string, seriesIndex: number, color: string): string {
  return seriesIndex === 0 ? color : `url(#${prefix}-series-${seriesIndex})`;
}

function SeriesPattern({
  id,
  seriesIndex,
  color,
  surface,
}: Readonly<{ id: string; seriesIndex: number; color: string; surface: string }>): JSX.Element | null {
  if (seriesIndex === 1)
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={16} height={16} patternTransform="rotate(45)">
        <rect width={16} height={16} fill={color} />
        <rect width={5} height={16} fill={surface} opacity={0.55} />
      </pattern>
    );
  if (seriesIndex === 2)
    return (
      <pattern id={id} patternUnits="userSpaceOnUse" width={14} height={14}>
        <rect width={14} height={14} fill={color} />
        <circle cx={7} cy={7} r={2.6} fill={surface} opacity={0.6} />
      </pattern>
    );
  return null;
}

function Marker({
  kind,
  x,
  y,
  size,
  fill,
  stroke,
}: Readonly<{ kind: string; x: number; y: number; size: number; fill: string; stroke: string }>): JSX.Element {
  if (kind === "square")
    return (
      <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={fill} stroke={stroke} strokeWidth={3} />
    );
  if (kind === "triangle")
    return (
      <polygon
        points={`${x},${y - size * 1.2} ${x + size * 1.15},${y + size * 0.85} ${x - size * 1.15},${y + size * 0.85}`}
        fill={fill}
        stroke={stroke}
        strokeWidth={3}
      />
    );
  return <circle cx={x} cy={y} r={size} fill={fill} stroke={stroke} strokeWidth={3} />;
}

function LegendSwatch({
  chart,
  seriesIndex,
  x,
  y,
  palette,
  prefix,
}: Readonly<{
  chart: ResolvedDataChart;
  seriesIndex: number;
  x: number;
  y: number;
  palette: DataChartPalette;
  prefix: string;
}>): JSX.Element {
  const color = palette.series[seriesIndex]!;
  if (chart.chartKind === "bar")
    return (
      <rect x={x} y={y - 14} width={36} height={28} rx={4} fill={patternFill(prefix, seriesIndex, color)} />
    );
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x + 40}
        y2={y}
        stroke={color}
        strokeWidth={6}
        strokeDasharray={dataChartSeriesDashes[seriesIndex] === "none" ? undefined : dataChartSeriesDashes[seriesIndex]}
      />
      <Marker kind={dataChartSeriesMarkers[seriesIndex]!} x={x + 20} y={y} size={8} fill={color} stroke={palette.surface} />
    </g>
  );
}

export function DataChartSvg({
  chart,
  layout,
  palette,
  fontFamily,
  idPrefix,
  progress,
  highlight,
  activeCategory,
}: DataChartSvgProps): JSX.Element {
  const { plot } = layout;
  const summary = dataChartSummary(chart);
  const prefix = idPrefix.replace(/[^a-zA-Z0-9_-]/gu, "-");
  const highlightIndex = chart.highlightIndex;
  const at = (index: number) => Math.min(1, Math.max(0, progress[index] ?? 1));
  const labelLine = (fontSize: number) => fontSize * 1.18;
  return (
    <svg
      aria-label={summary}
      data-data-chart={chart.chartKind}
      height={layout.box.height}
      role="img"
      style={{ display: "block", fontFamily, overflow: "visible" }}
      viewBox={`0 0 ${layout.box.width} ${layout.box.height}`}
      width={layout.box.width}
    >
      <title>{summary}</title>
      <defs>
        {chart.series.map((_, index) => (
          <SeriesPattern
            key={index}
            id={`${prefix}-series-${index}`}
            seriesIndex={index}
            color={palette.series[index]!}
            surface={palette.surface}
          />
        ))}
      </defs>
      <rect width={layout.box.width} height={layout.box.height} rx={18} fill={palette.surface} />
      {layout.unitLabel === undefined ? null : (
        <text
          data-data-chart-unit
          x={plot.left}
          y={layout.legendTop + 24}
          fill={palette.text}
          fontSize={24}
          fontWeight={700}
        >
          {layout.unitLabel}
        </text>
      )}
      {layout.legend.map((entry, index) => (
        <g data-data-chart-legend={index + 1} key={index}>
          <LegendSwatch
            chart={chart}
            seriesIndex={index}
            x={entry.x}
            y={layout.legendTop + 16}
            palette={palette}
            prefix={prefix}
          />
          <text x={entry.x + 52} y={layout.legendTop + 24} fill={palette.text} fontSize={entry.fontSize}>
            {entry.lines[0]}
          </text>
        </g>
      ))}
      {layout.ticks.map((tick) => (
        <g key={tick.value}>
          <line x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke={palette.grid} strokeWidth={2} />
          <text
            x={plot.left - 14}
            y={tick.y + 8}
            fill={palette.text}
            fontSize={22}
            textAnchor="end"
          >
            {tick.label}
          </text>
        </g>
      ))}
      {highlightIndex === undefined ? null : (
        <rect
          data-data-chart-highlight={highlightIndex + 1}
          x={plot.left + layout.slotWidth * highlightIndex + 4}
          y={layout.highlightTop}
          width={layout.slotWidth - 8}
          height={plot.bottom - layout.highlightTop}
          rx={12}
          fill={palette.highlight}
          fillOpacity={0.12 * highlight}
          stroke={palette.highlight}
          strokeOpacity={highlight}
          strokeWidth={4}
        />
      )}
      {layout.bars.map((bar) => {
        const grown = at(bar.categoryIndex);
        const end = bar.baseY + (bar.valueY - bar.baseY) * grown;
        const y = Math.min(bar.baseY, end);
        const height = Math.abs(end - bar.baseY);
        return (
          <rect
            data-data-chart-bar={`${bar.seriesIndex + 1}-${bar.categoryIndex + 1}`}
            data-progress={grown.toFixed(3)}
            key={`${bar.seriesIndex}-${bar.categoryIndex}`}
            x={bar.x}
            y={y}
            width={bar.width}
            height={height}
            rx={Math.min(6, bar.width / 4)}
            fill={patternFill(prefix, bar.seriesIndex, palette.series[bar.seriesIndex]!)}
          />
        );
      })}
      {layout.points.map((line, seriesIndex) => {
        const color = palette.series[seriesIndex]!;
        const dash = dataChartSeriesDashes[seriesIndex];
        return (
          <g data-data-chart-line={seriesIndex + 1} key={seriesIndex}>
            {line.slice(1).map((point, index) => {
              const from = line[index]!;
              const grown = at(point.categoryIndex);
              return (
                <line
                  data-data-chart-segment={`${seriesIndex + 1}-${point.categoryIndex + 1}`}
                  data-progress={grown.toFixed(3)}
                  key={point.categoryIndex}
                  x1={from.x}
                  y1={from.y}
                  x2={from.x + (point.x - from.x) * grown}
                  y2={from.y + (point.y - from.y) * grown}
                  stroke={color}
                  strokeLinecap="round"
                  strokeWidth={6}
                  strokeDasharray={dash === "none" ? undefined : dash}
                />
              );
            })}
            {line.map((point) => {
              const grown = at(point.categoryIndex);
              return grown <= 0 ? null : (
                <g
                  data-data-chart-point={`${seriesIndex + 1}-${point.categoryIndex + 1}`}
                  data-progress={grown.toFixed(3)}
                  key={point.categoryIndex}
                  opacity={grown}
                >
                  <Marker
                    kind={dataChartSeriesMarkers[seriesIndex]!}
                    x={point.x}
                    y={point.y}
                    size={10 * (0.5 + grown / 2)}
                    fill={color}
                    stroke={palette.surface}
                  />
                </g>
              );
            })}
          </g>
        );
      })}
      <line
        x1={plot.left}
        x2={plot.right}
        y1={layout.baselineY}
        y2={layout.baselineY}
        stroke={palette.text}
        strokeWidth={3}
      />
      {layout.valueLabels === "all"
        ? chart.series.flatMap((series, seriesIndex) =>
            series.values.map((value, categoryIndex) => {
              const bar = layout.bars.find(
                (entry) => entry.seriesIndex === seriesIndex && entry.categoryIndex === categoryIndex,
              );
              const point = layout.points[seriesIndex]?.[categoryIndex];
              const x = bar === undefined ? (point?.x ?? 0) : bar.x + bar.width / 2;
              const markY = bar === undefined ? (point?.y ?? 0) : bar.valueY;
              const below = bar !== undefined && bar.valueY > bar.baseY;
              const y = below ? markY + layout.valueFontSize + 8 : markY - (bar === undefined ? 18 : 10);
              return (
                <text
                  data-data-chart-value={`${seriesIndex + 1}-${categoryIndex + 1}`}
                  key={`${seriesIndex}-${categoryIndex}`}
                  x={x}
                  y={y}
                  fill={palette.text}
                  fontSize={layout.valueFontSize}
                  fontWeight={700}
                  opacity={at(categoryIndex) >= 1 ? 1 : at(categoryIndex) * 0.6}
                  textAnchor="middle"
                >
                  {value.text}
                </text>
              );
            }),
          )
        : null}
      {layout.valueLabels === "active" && activeCategory >= 0 ? (
        <ActiveReadout
          chart={chart}
          layout={layout}
          palette={palette}
          category={activeCategory}
          opacity={at(activeCategory)}
        />
      ) : null}
      {layout.categories.map((label, index) => (
        <text
          data-data-chart-category={index + 1}
          data-abbreviated={label.abbreviated ? "true" : undefined}
          key={index}
          x={label.centerX}
          y={label.top + label.fontSize}
          fill={palette.text}
          fontSize={label.fontSize}
          fontWeight={index === highlightIndex && highlight > 0.5 ? 700 : 500}
          textAnchor="middle"
        >
          {label.abbreviated ? <title>{label.full}</title> : null}
          {label.lines.map((line, lineIndex) => (
            <tspan key={lineIndex} x={label.centerX} dy={lineIndex === 0 ? 0 : labelLine(label.fontSize)}>
              {line}
            </tspan>
          ))}
        </text>
      ))}
    </svg>
  );
}

/** The narrated category's values, when they cannot all sit above marks. */
function ActiveReadout({
  chart,
  layout,
  palette,
  category,
  opacity,
}: Readonly<{
  chart: ResolvedDataChart;
  layout: DataChartLayout;
  palette: DataChartPalette;
  category: number;
  opacity: number;
}>): JSX.Element {
  const label = layout.categories[category];
  const parts = chart.series.map(
    (series) =>
      `${chart.series.length > 1 ? `${series.name} ` : ""}${series.values[category]?.text ?? ""}`,
  );
  const maxWidth = layout.plot.right - layout.plot.left;
  const fitted = fitChartLabel(
    `${label?.full ?? ""}: ${parts.join(" · ")}`,
    maxWidth - 40,
    [layout.valueFontSize, 18],
    defaultDataChartTypography.glyphWidth,
    1,
  );
  const text = fitted.lines[0] ?? "";
  const fontSize = fitted.fontSize;
  const width = Math.min(maxWidth, dataChartTextWidth(text, fontSize) + 40);
  const x = layout.plot.right - width;
  return (
    <g data-data-chart-readout={category + 1} opacity={opacity}>
      <rect
        x={x}
        y={layout.readoutTop}
        width={width}
        height={fontSize * 1.18 + 16}
        rx={10}
        fill={palette.surface}
        stroke={palette.text}
        strokeWidth={2}
      />
      <text x={x + 20} y={layout.readoutTop + fontSize + 4} fill={palette.text} fontSize={fontSize} fontWeight={700}>
        {text}
      </text>
    </g>
  );
}
