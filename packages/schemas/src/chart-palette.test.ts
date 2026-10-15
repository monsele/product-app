import { describe, expect, it } from "vitest";
import {
  colourVisionDeficiencies,
  creativeDesignPackIds,
  dataChartLuminance,
  dataChartPalette,
  dataChartPaletteIds,
  dataChartPalettes,
  dataChartSeriesDashes,
  dataChartSeriesMarkers,
  dataChartSeriesPatterns,
  luminanceContrast,
  simulatedDataChartLuminance,
} from "./index.js";

const ratio = (left: string, right: string) =>
  luminanceContrast(dataChartLuminance(left), dataChartLuminance(right));

describe("ST-114 chart palettes (AC6)", () => {
  it("defines a palette for every style pack and the legacy default theme", () => {
    expect([...dataChartPaletteIds].sort()).toEqual(
      ["mvp-default", ...creativeDesignPackIds].sort(),
    );
    expect(dataChartPalette(undefined)).toBe(dataChartPalettes["mvp-default"]);
    for (const id of creativeDesignPackIds)
      expect(dataChartPalette(id)).toBe(dataChartPalettes[id]);
  });

  it.each(dataChartPaletteIds)(
    "%s passes the WCAG contrast checks",
    (id) => {
      const palette = dataChartPalettes[id];
      expect(ratio(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(palette.highlight, palette.surface)).toBeGreaterThanOrEqual(3);
      for (const series of palette.series)
        expect(ratio(series, palette.surface)).toBeGreaterThanOrEqual(3);
      for (let index = 1; index < palette.series.length; index += 1)
        expect(
          ratio(palette.series[index - 1]!, palette.series[index]!),
        ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(dataChartPaletteIds)(
    "%s keeps its series apart under simulated colour-vision deficiencies",
    (id) => {
      const palette = dataChartPalettes[id];
      for (const deficiency of colourVisionDeficiencies) {
        const surface = simulatedDataChartLuminance(palette.surface, deficiency);
        const series = palette.series.map((colour) =>
          simulatedDataChartLuminance(colour, deficiency),
        );
        for (const value of series)
          expect(luminanceContrast(value, surface), deficiency).toBeGreaterThanOrEqual(3);
        for (let index = 1; index < series.length; index += 1)
          expect(
            luminanceContrast(series[index - 1]!, series[index]!),
            deficiency,
          ).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it("simulates a known colour sensibly", () => {
    // Pure red loses most of its luminance to a protanope and keeps it for a
    // tritanope; white stays white for every deficiency.
    expect(simulatedDataChartLuminance("#ff0000", "protanopia")).toBeLessThan(
      dataChartLuminance("#ff0000"),
    );
    for (const deficiency of colourVisionDeficiencies)
      expect(simulatedDataChartLuminance("#ffffff", deficiency)).toBeCloseTo(1, 2);
  });

  it("never distinguishes series by colour alone", () => {
    for (const cues of [
      dataChartSeriesPatterns,
      dataChartSeriesDashes,
      dataChartSeriesMarkers,
    ]) {
      expect(cues).toHaveLength(3);
      expect(new Set(cues).size).toBe(3);
    }
  });
});
