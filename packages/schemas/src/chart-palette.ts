/**
 * ST-114 — accessible chart palette tokens, one per style pack plus the
 * legacy `mvp-default` theme.
 *
 * A chart paints on its own panel surface, so these guarantees hold even when
 * a teacher customises the lesson's colours. The documented method, asserted
 * in `chart-palette.test.ts` for every palette:
 *
 * 1. WCAG 2 relative-luminance contrast of at least 3:1 between each series
 *    and the panel surface, between adjacent series, and between the highlight
 *    and the surface; at least 4.5:1 between chart text and the surface.
 * 2. The same 3:1 series checks after simulating protanopia, deuteranopia and
 *    tritanopia (Machado, Oliveira & Fernandes 2009, severity 1.0, applied in
 *    linear RGB).
 * 3. Colour is never the only cue: each series also has its own bar fill
 *    pattern and its own line dash and marker shape.
 *
 * Series alternate mid, extreme, mid luminance so adjacent series always
 * differ in lightness, which survives every colour-vision deficiency.
 */
import { creativeDesignPackIds, type CreativeDesignPackId } from "./creative-design.js";

export type DataChartPalette = Readonly<{
  /** The chart panel the plot is drawn on. */
  surface: string;
  /** Axis labels, category labels and value labels. */
  text: string;
  /** Decorative gridlines; carries no information on its own. */
  grid: string;
  /** Ring and label emphasis for the highlighted category. */
  highlight: string;
  /** Exactly three series colours, in series order. */
  series: readonly [string, string, string];
}>;

export const dataChartPaletteIds = ["mvp-default", ...creativeDesignPackIds] as const;
export type DataChartPaletteId = (typeof dataChartPaletteIds)[number];

/** Non-colour series cues, in series order. */
export const dataChartSeriesPatterns = ["solid", "hatch", "dots"] as const;
export const dataChartSeriesDashes = ["none", "14 8", "3 7"] as const;
export const dataChartSeriesMarkers = ["circle", "square", "triangle"] as const;

const palette = (value: DataChartPalette): DataChartPalette =>
  Object.freeze({ ...value, series: Object.freeze([...value.series]) as DataChartPalette["series"] });

export const dataChartPalettes: Readonly<Record<DataChartPaletteId, DataChartPalette>> =
  Object.freeze({
    "mvp-default": palette({
      surface: "#0b1b2b",
      text: "#f0f4f8",
      grid: "#2a4560",
      highlight: "#ffc857",
      series: ["#3a86c8", "#fdf3d0", "#a87d2c"],
    }),
    essential: palette({
      surface: "#ffffff",
      text: "#1a1a1a",
      grid: "#e4e1dc",
      highlight: "#b42318",
      series: ["#b8720a", "#0b1a3a", "#3a7fcf"],
    }),
    editorial: palette({
      surface: "#fffaf0",
      text: "#22201c",
      grid: "#eadfca",
      highlight: "#b45309",
      series: ["#b86a12", "#1f1610", "#4f8a8b"],
    }),
    everyday: palette({
      surface: "#ffffff",
      text: "#13234a",
      grid: "#e2e7f2",
      highlight: "#1d4ed8",
      series: ["#1d76d8", "#0e1a38", "#c77a12"],
    }),
    systems: palette({
      surface: "#0b1222",
      text: "#e2e8f0",
      grid: "#24324a",
      highlight: "#facc15",
      series: ["#2878b8", "#eef8ff", "#977820"],
    }),
    "field-notes": palette({
      surface: "#fbf8f1",
      text: "#2b2b2b",
      grid: "#e7e0d0",
      highlight: "#a8431b",
      series: ["#b5701c", "#1d2612", "#4f8a6b"],
    }),
    prism: palette({
      surface: "#24063f",
      text: "#ffffff",
      grid: "#43206a",
      highlight: "#facc15",
      series: ["#2f7cc0", "#fff6d6", "#9a66bd"],
    }),
  });

export function dataChartPalette(
  packId: CreativeDesignPackId | "mvp-default" | undefined,
): DataChartPalette {
  return dataChartPalettes[packId ?? "mvp-default"];
}

const linearChannel = (value: number): number =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function linearRgb(color: string): readonly [number, number, number] {
  const [red, green, blue] = [1, 3, 5].map((offset) =>
    linearChannel(Number.parseInt(color.slice(offset, offset + 2), 16) / 255),
  );
  return [red!, green!, blue!];
}

const luminanceOf = ([red, green, blue]: readonly [number, number, number]) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue;

/** WCAG 2 contrast ratio between two relative luminances. */
export function luminanceContrast(left: number, right: number): number {
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

export function dataChartLuminance(color: string): number {
  return luminanceOf(linearRgb(color));
}

export const colourVisionDeficiencies = ["protanopia", "deuteranopia", "tritanopia"] as const;
export type ColourVisionDeficiency = (typeof colourVisionDeficiencies)[number];

/** Machado et al. (2009) full-severity simulation matrices, linear RGB. */
const simulationMatrices: Readonly<
  Record<ColourVisionDeficiency, readonly (readonly [number, number, number])[]>
> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** Relative luminance of `color` as seen with the given deficiency. */
export function simulatedDataChartLuminance(
  color: string,
  deficiency: ColourVisionDeficiency,
): number {
  const channels = linearRgb(color);
  const simulated = simulationMatrices[deficiency].map((row) =>
    Math.min(
      1,
      Math.max(0, row[0] * channels[0] + row[1] * channels[1] + row[2] * channels[2]),
    ),
  );
  return luminanceOf([simulated[0]!, simulated[1]!, simulated[2]!]);
}
