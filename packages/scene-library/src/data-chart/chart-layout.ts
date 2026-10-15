/**
 * ST-114 — deterministic geometry for a data chart.
 *
 * Pure in the resolved chart and its box, so preview, render and the
 * validation preflight place every bar, point and label identically. Labels
 * are never clipped: a category label wraps to two lines, steps down in size,
 * and only then is abbreviated with an ellipsis — its full text stays in the
 * chart's accessible summary. Value labels show the table cell's own text;
 * when they cannot all fit above their marks, the chart shows the values of
 * the category being narrated instead (`valueLabels: "active"`).
 */
import type { ResolvedDataChart } from "@avlp/schemas";
import { estimateLineWidth } from "../cinema/text-fit.js";

export type DataChartBox = Readonly<{ width: number; height: number }>;

export type DataChartTypography = Readonly<{
  /** Average glyph width of the face, as a fraction of the font size. */
  glyphWidth: number;
  labelSizes: readonly number[];
  valueSizes: readonly number[];
  tickSize: number;
  legendSize: number;
}>;

export const defaultDataChartTypography: DataChartTypography = Object.freeze({
  glyphWidth: 0.52,
  labelSizes: Object.freeze([26, 22, 20]),
  valueSizes: Object.freeze([24, 20, 18]),
  tickSize: 22,
  legendSize: 24,
});

export const dataChartLabelMaxLines = 2;
const lineHeight = 1.18;
const ellipsis = "…";

export type FittedLabel = Readonly<{
  lines: readonly string[];
  fontSize: number;
  abbreviated: boolean;
}>;

const widthOf = (text: string, size: number, glyph: number) =>
  estimateLineWidth(text, size, glyph);

/** Splits a word wider than `width` into pieces that each fit. */
function breakWord(word: string, size: number, width: number, glyph: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const character of word) {
    if (current.length > 0 && widthOf(current + character, size, glyph) > width) {
      pieces.push(current);
      current = character;
    } else current += character;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
}

/** Greedy word wrap; every returned line fits `width`. */
export function wrapChartText(
  text: string,
  size: number,
  width: number,
  glyph: number,
): string[] {
  const words = text
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0)
    .flatMap((word) =>
      widthOf(word, size, glyph) > width ? breakWord(word, size, width, glyph) : [word],
    );
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (current.length > 0 && widthOf(candidate, size, glyph) > width) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current.length > 0) lines.push(current);
  return lines.length === 0 ? [""] : lines;
}

/** Shortens `line` until it fits `width` with a trailing ellipsis. */
function withEllipsis(line: string, size: number, width: number, glyph: number): string {
  let kept = line.trimEnd();
  while (kept.length > 0 && widthOf(kept + ellipsis, size, glyph) > width)
    kept = kept.slice(0, -1).trimEnd();
  return kept + ellipsis;
}

const wordsFit = (text: string, size: number, width: number, glyph: number) =>
  text
    .trim()
    .split(/\s+/u)
    .every((word) => widthOf(word, size, glyph) <= width);

/**
 * Wrap at the largest size that keeps every word whole, then at the largest
 * size that fits even if a long word must break, then abbreviate. Never wider
 * than `width`.
 */
export function fitChartLabel(
  text: string,
  width: number,
  sizes: readonly number[],
  glyph: number,
  maxLines = dataChartLabelMaxLines,
): FittedLabel {
  for (const wholeWords of [true, false])
    for (const size of sizes) {
      if (wholeWords && !wordsFit(text, size, width, glyph)) continue;
      const lines = wrapChartText(text, size, width, glyph);
      if (lines.length <= maxLines)
        return Object.freeze({ lines: Object.freeze(lines), fontSize: size, abbreviated: false });
    }
  const size = sizes.at(-1) ?? 20;
  const lines = wrapChartText(text, size, width, glyph).slice(0, maxLines);
  lines[lines.length - 1] = withEllipsis(lines[lines.length - 1]!, size, width, glyph);
  return Object.freeze({ lines: Object.freeze(lines), fontSize: size, abbreviated: true });
}

/** Tick label for an axis value, at the precision of the axis step. */
export function formatDataChartTick(value: number, ticks: readonly number[]): string {
  const step = ticks.length > 1 ? Math.abs(ticks[1]! - ticks[0]!) : 1;
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  // Formatted by hand, not `toLocaleString`, so the output never depends on
  // the runtime's ICU data.
  const [whole = "0", fraction] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  const sign = value < 0 && Number(whole + (fraction ?? "")) !== 0 ? "-" : "";
  return `${sign}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

export type DataChartCategoryLabel = FittedLabel &
  Readonly<{ full: string; centerX: number; top: number }>;
export type DataChartBarMark = Readonly<{
  seriesIndex: number;
  categoryIndex: number;
  x: number;
  width: number;
  /** y of the zero baseline (or the axis floor). */
  baseY: number;
  /** y the bar's value end reaches when fully grown. */
  valueY: number;
}>;
export type DataChartPoint = Readonly<{
  seriesIndex: number;
  categoryIndex: number;
  x: number;
  y: number;
}>;
export type DataChartTick = Readonly<{ value: number; label: string; y: number }>;
export type DataChartLegendEntry = FittedLabel & Readonly<{ x: number; width: number }>;

export type DataChartLayout = Readonly<{
  box: DataChartBox;
  plot: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  baselineY: number;
  slotWidth: number;
  ticks: readonly DataChartTick[];
  categories: readonly DataChartCategoryLabel[];
  bars: readonly DataChartBarMark[];
  /** One polyline per series (line charts). */
  points: readonly (readonly DataChartPoint[])[];
  valueLabels: "all" | "active";
  valueFontSize: number;
  legend: readonly DataChartLegendEntry[];
  legendTop: number;
  /** Top of the highlight band: above the value-label headroom, so a
   * highlighted bar's label sits inside the band, never on its edge. In
   * "active" mode the band starts below the readout. */
  highlightTop: number;
  /** Top of the active-category readout (valueLabels "active"). */
  readoutTop: number;
  unitLabel: string | undefined;
}>;

/**
 * Lays a resolved chart out inside `box` (chart-panel coordinates). Space is
 * reserved top-down for the legend/unit row and value-label headroom, and
 * bottom-up for two lines of category labels; the plot fills the rest.
 */
export function layoutDataChart(
  chart: ResolvedDataChart,
  box: DataChartBox,
  typography: DataChartTypography = defaultDataChartTypography,
): DataChartLayout {
  const glyph = typography.glyphWidth;
  const padding = 28;
  const count = chart.categories.length;
  const seriesCount = chart.series.length;
  const tickLabels = chart.ticks.map((tick) => formatDataChartTick(tick, chart.ticks));
  const gutter =
    Math.max(...tickLabels.map((label) => widthOf(label, typography.tickSize, glyph))) + 24;
  const hasLegendRow = seriesCount > 1 || chart.unitLabel !== undefined;
  const legendTop = padding;
  const legendHeight = hasLegendRow ? typography.legendSize * lineHeight + 20 : 0;
  const left = padding + gutter;
  const right = box.width - padding;
  const slotWidth = (right - left) / count;
  const largestLabel = typography.labelSizes[0] ?? 26;
  const labelBand = dataChartLabelMaxLines * largestLabel * lineHeight + 20;

  // Value labels: the largest size at which every label fits its mark's
  // share of the slot. A multi-series line stacks labels at shared x, so it
  // always uses the active-category readout.
  const markShare = slotWidth / seriesCount - 6;
  const texts = chart.series.flatMap((series) => series.values.map((value) => value.text));
  const valueSize = typography.valueSizes.find((size) =>
    texts.every((text) => widthOf(text, size, glyph) <= markShare),
  );
  const valueLabels =
    valueSize === undefined || (chart.chartKind === "line" && seriesCount > 1)
      ? ("active" as const)
      : ("all" as const);
  const valueFontSize = valueSize ?? typography.valueSizes.at(-1) ?? 18;
  // "all": room for a label above the tallest mark. "active": room for the
  // one-line readout of the narrated category.
  const headroom =
    valueLabels === "all" ? valueFontSize * lineHeight + 12 : valueFontSize * lineHeight + 30;
  const top = padding + legendHeight + headroom;
  const bottom = box.height - padding - labelBand;
  const span = chart.max - chart.min || 1;
  const yOf = (value: number) => bottom - ((value - chart.min) / span) * (bottom - top);
  const baselineY = yOf(Math.min(chart.max, Math.max(chart.min, 0)));

  const categories = chart.categories.map((category, index) => {
    const fitted = fitChartLabel(category.label, slotWidth - 12, typography.labelSizes, glyph);
    return Object.freeze({
      ...fitted,
      full: category.label,
      centerX: left + slotWidth * (index + 0.5),
      top: bottom + 14,
    });
  });

  const groupWidth = slotWidth * 0.72;
  const barGap = seriesCount > 1 ? Math.min(8, groupWidth * 0.06) : 0;
  const barWidth = (groupWidth - barGap * (seriesCount - 1)) / seriesCount;
  const bars: DataChartBarMark[] = [];
  const points: DataChartPoint[][] = chart.series.map(() => []);
  chart.series.forEach((series, seriesIndex) => {
    series.values.forEach((value, categoryIndex) => {
      const slotLeft = left + slotWidth * categoryIndex;
      if (chart.chartKind === "bar")
        bars.push(
          Object.freeze({
            seriesIndex,
            categoryIndex,
            x: slotLeft + (slotWidth - groupWidth) / 2 + seriesIndex * (barWidth + barGap),
            width: barWidth,
            baseY: baselineY,
            valueY: yOf(value.value),
          }),
        );
      else
        points[seriesIndex]!.push(
          Object.freeze({
            seriesIndex,
            categoryIndex,
            x: slotLeft + slotWidth / 2,
            y: yOf(value.value),
          }),
        );
    });
  });

  const legendEntries = chart.series.length > 1 ? chart.series : [];
  const unitWidth =
    chart.unitLabel === undefined ? 0 : widthOf(chart.unitLabel, typography.legendSize, glyph) + 40;
  const legendSpace = right - left - unitWidth;
  const legendWidth = legendEntries.length === 0 ? 0 : legendSpace / legendEntries.length;
  const legend = legendEntries.map((series, index) =>
    Object.freeze({
      ...fitChartLabel(series.name, legendWidth - 64, [typography.legendSize, 20], glyph, 1),
      x: left + unitWidth + legendWidth * index,
      width: legendWidth,
    }),
  );

  return Object.freeze({
    box,
    plot: Object.freeze({ left, top, right, bottom }),
    baselineY,
    slotWidth,
    ticks: Object.freeze(
      chart.ticks.map((value, index) =>
        Object.freeze({ value, label: tickLabels[index]!, y: yOf(value) }),
      ),
    ),
    categories: Object.freeze(categories),
    bars: Object.freeze(bars),
    points: Object.freeze(points.map((line) => Object.freeze(line))),
    valueLabels,
    valueFontSize,
    legend: Object.freeze(legend),
    legendTop,
    highlightTop: valueLabels === "all" ? top - headroom + 2 : top - 10,
    readoutTop: padding + legendHeight,
    unitLabel: chart.unitLabel,
  });
}

/** Estimated width of a label line, for tests and overflow checks. */
export function dataChartTextWidth(
  text: string,
  fontSize: number,
  typography: DataChartTypography = defaultDataChartTypography,
): number {
  return widthOf(text, fontSize, typography.glyphWidth);
}
