import { chromium } from "@playwright/test";
import {
  narrationSentences,
  planCinemaDesign,
  resolveCinemaBeatFrames,
  resolveDataChart,
  type CinemaCaptionCue,
  type SceneSpec,
} from "@avlp/schemas";
import { createElement, type JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinemaBeatProvider, createBeatTimeline } from "./cinema/beats.js";
import { cinemaCompositionComponents } from "./cinema/cinema-scene.js";
import {
  resolveCinemaHero,
  resolveCinemaItemIcons,
  resolveCinemaSubjectImages,
} from "./cinema/content.js";
import { resolveCinemaIdentity } from "./cinema/identity.js";
import {
  dataChartTextWidth,
  fitChartLabel,
  layoutDataChart,
} from "./data-chart/chart-layout.js";
import {
  authoredDataChartBeatFrames,
  dataChartGrowFrames,
  dataChartMarkProgress,
} from "./data-chart/chart-motion.js";
import { resolveSceneChart } from "./data-chart/resolve.js";
import { DataChartSceneFrame, dataChartScenePanel } from "./data-chart-scene.js";
import {
  barDataChartFixture,
  dataChartFixtureAssets,
  dataChartFixtureTable,
  lineDataChartFixture,
  maximumDataChartFixture,
  nonNumericDataChartFixture,
} from "./data-chart-scene.fixtures.js";
import { validateScene } from "./scene-registry.js";
import { secondsToFrames } from "./timing.js";

type ChartScene = Extract<SceneSpec, { template: "data-chart" }>;

function chartOf(scene: ChartScene) {
  const resolution = resolveSceneChart(scene, dataChartFixtureAssets);
  if (!resolution.ok) throw new Error(resolution.failure.message);
  return resolution.chart;
}

describe("ST-114 chart layout", () => {
  it("lays out the maximum 8 × 3 chart with every mark inside the plot", () => {
    const chart = chartOf(maximumDataChartFixture);
    const layout = layoutDataChart(chart, dataChartScenePanel);
    expect(layout.bars).toHaveLength(24);
    for (const bar of layout.bars) {
      expect(bar.x).toBeGreaterThanOrEqual(layout.plot.left);
      expect(bar.x + bar.width).toBeLessThanOrEqual(layout.plot.right + 0.001);
      expect(Math.min(bar.valueY, bar.baseY)).toBeGreaterThanOrEqual(layout.plot.top - 0.001);
      expect(Math.max(bar.valueY, bar.baseY)).toBeLessThanOrEqual(layout.plot.bottom + 0.001);
      expect(bar.width).toBeGreaterThanOrEqual(12);
    }
    // Bars never overlap one another.
    const spans = [...layout.bars].sort((left, right) => left.x - right.x);
    for (let index = 1; index < spans.length; index += 1)
      expect(spans[index]!.x).toBeGreaterThanOrEqual(spans[index - 1]!.x + spans[index - 1]!.width - 0.001);
  });

  it("wraps, shrinks and then abbreviates long category labels without clipping", () => {
    const chart = chartOf(maximumDataChartFixture);
    const layout = layoutDataChart(chart, dataChartScenePanel);
    const available = layout.slotWidth - 12;
    for (const label of layout.categories) {
      expect(label.lines.length).toBeLessThanOrEqual(2);
      for (const line of label.lines)
        expect(dataChartTextWidth(line, label.fontSize)).toBeLessThanOrEqual(available + 0.001);
    }
    const long = layout.categories.find((label) => label.full.startsWith("Hydrogen"));
    expect(long?.abbreviated).toBe(true);
    expect(long?.lines.at(-1)).toMatch(/…$/u);
    expect(long?.full).toBe(dataChartFixtureTable.rows[6]![0]);
    // A short label is left alone at the largest size.
    expect(layout.categories[0]).toMatchObject({ lines: ["Lithium"], fontSize: 26, abbreviated: false });
  });

  it("prefers a smaller size over breaking a word that would fit whole", () => {
    const fitted = fitChartLabel("Potassium", 120, [26, 22, 20], 0.52);
    expect(fitted.lines).toEqual(["Potassium"]);
    expect(fitted.fontSize).toBeLessThan(26);
  });

  it("breaks a single word wider than its slot instead of overflowing", () => {
    const fitted = fitChartLabel("Pneumonoultramicroscopicsilicovolcanoconiosis", 120, [26, 20], 0.52);
    for (const line of fitted.lines)
      expect(dataChartTextWidth(line, fitted.fontSize)).toBeLessThanOrEqual(120);
  });

  it("falls back to an active readout when value labels cannot fit their marks", () => {
    expect(layoutDataChart(chartOf(barDataChartFixture), dataChartScenePanel).valueLabels).toBe("all");
    expect(layoutDataChart(chartOf(maximumDataChartFixture), { width: 700, height: 500 }).valueLabels).toBe(
      "active",
    );
  });
});

describe("ST-114 chart motion (AC5)", () => {
  it("completes a mark exactly on its beat frame", () => {
    for (const beat of [6, 40, 133]) {
      expect(dataChartMarkProgress(beat, beat)).toBe(1);
      expect(dataChartMarkProgress(beat - 1, beat)).toBeLessThan(1);
      expect(dataChartMarkProgress(beat + 50, beat)).toBe(1);
      expect(dataChartMarkProgress(Math.max(0, beat - dataChartGrowFrames), beat)).toBe(
        beat <= dataChartGrowFrames ? dataChartMarkProgress(0, beat) : 0,
      );
    }
  });

  it("grows each v1 bar to its value on that category's narration beat", () => {
    const scene = barDataChartFixture;
    const durationInFrames = secondsToFrames(scene.durationSeconds);
    const chart = chartOf(scene);
    const beats = authoredDataChartBeatFrames(scene, durationInFrames, chart.highlightIndex);
    expect(beats.items).toHaveLength(scene.visual.rowIndexes.length);
    for (let index = 1; index < beats.items.length; index += 1)
      expect(beats.items[index]!).toBeGreaterThanOrEqual(beats.items[index - 1]!);
    beats.items.forEach((complete, index) => {
      const at = (frame: number) =>
        renderToStaticMarkup(
          createElement(DataChartSceneFrame, {
            frame,
            resolvedAssets: dataChartFixtureAssets,
            runtimeMode: "render",
            scene,
          }),
        );
      expect(at(complete)).toContain(`data-data-chart-bar="1-${index + 1}" data-progress="1.000"`);
      expect(at(complete - 2)).not.toContain(`data-data-chart-bar="1-${index + 1}" data-progress="1.000"`);
    });
    // The highlight never lands before its own category.
    expect(beats.highlight).toBeGreaterThanOrEqual(beats.items[scene.visual.rowIndexes.indexOf(4)]!);
  });

  it("keys v1 bars to the measured caption cues when the lesson has audio", () => {
    const scene = barDataChartFixture;
    const durationInFrames = secondsToFrames(scene.durationSeconds);
    const chart = chartOf(scene);
    // The narration is spoken in the first 40% of the scene, faster than the
    // estimate assumes; the bars must follow the speech, not the estimate.
    const spokenFrames = Math.floor(durationInFrames * 0.4);
    const cues = sentenceCues(scene.narration, spokenFrames + 40);
    const estimated = authoredDataChartBeatFrames(scene, durationInFrames, chart.highlightIndex);
    const spoken = authoredDataChartBeatFrames(scene, durationInFrames, chart.highlightIndex, cues);
    expect(spoken.items).not.toEqual(estimated.items);
    for (const frame of spoken.items) expect(frame).toBeLessThanOrEqual(spokenFrames + 10);
    expect(Math.max(...estimated.items)).toBeGreaterThan(spokenFrames + 10);
    spoken.items.forEach((complete, index) => {
      const at = (frame: number) =>
        renderToStaticMarkup(
          createElement(DataChartSceneFrame, {
            frame,
            resolvedAssets: dataChartFixtureAssets,
            runtimeMode: "render",
            scene,
            sceneCaptions: cues,
          }),
        );
      expect(at(complete)).toContain(`data-data-chart-bar="1-${index + 1}" data-progress="1.000"`);
      if (complete >= 2)
        expect(at(complete - 2)).not.toContain(`data-data-chart-bar="1-${index + 1}" data-progress="1.000"`);
    });
  });
});

describe("ST-114 DataChartScene", () => {
  it("validates against the resolved table and shows the cells' own text", () => {
    expect(
      validateScene(barDataChartFixture, {
        requireResolvedAssets: true,
        resolvedAssets: dataChartFixtureAssets,
      }),
    ).toEqual([]);
    const final = secondsToFrames(barDataChartFixture.durationSeconds) - 1;
    const markup = renderToStaticMarkup(
      createElement(DataChartSceneFrame, {
        frame: final,
        resolvedAssets: dataChartFixtureAssets,
        runtimeMode: "render",
        scene: barDataChartFixture,
      }),
    );
    for (const row of barDataChartFixture.visual.rowIndexes) {
      expect(markup).toContain(`>${dataChartFixtureTable.rows[row]![0]}<`);
      expect(markup).toContain(`>${dataChartFixtureTable.rows[row]![1]}<`);
    }
    expect(markup).toContain("Bar chart of Density (g/cm³) (grams per cm³): Lithium 0.53");
    expect(markup).toContain('data-data-chart-highlight="4"');
  });

  it("blocks a non-numeric selection in validation and in render, naming the cell (AC3)", () => {
    const issues = validateScene(nonNumericDataChartFixture, {
      requireResolvedAssets: true,
      resolvedAssets: dataChartFixtureAssets,
    });
    expect(issues).toEqual([
      expect.objectContaining({
        code: "chart_data_invalid",
        severity: "error",
        message: 'Row 1, column "Notes" contains "lightest metal", which is not a number.',
      }),
    ]);
    const render = () =>
      renderToStaticMarkup(
        createElement(DataChartSceneFrame, {
          frame: 10,
          resolvedAssets: dataChartFixtureAssets,
          runtimeMode: "render",
          scene: nonNumericDataChartFixture,
        }),
      );
    expect(render).toThrow(/Scene render blocked.*not a number/u);
    const preview = renderToStaticMarkup(
      createElement(DataChartSceneFrame, {
        frame: 10,
        resolvedAssets: dataChartFixtureAssets,
        runtimeMode: "preview",
        scene: nonNumericDataChartFixture,
      }),
    );
    expect(preview).toContain('data-data-chart-error="non_numeric_cell"');
  });

  it("refuses a missing or foreign table (AC8)", () => {
    const unbound = { ...barDataChartFixture, assetBindings: [] };
    expect(validateScene(unbound)[0]).toMatchObject({
      code: "missing_asset",
      fieldPath: "assetBindings.chart-table",
    });
    // A table from another project is never in this project's manifest.
    expect(validateScene(barDataChartFixture, { requireResolvedAssets: true, resolvedAssets: {} })[0]).toMatchObject({
      code: "missing_asset",
      fieldPath: "resolvedAssets.chart-table",
    });
    const wrongTable = {
      [barDataChartFixture.visual.tableId]: {
        ...dataChartFixtureAssets[barDataChartFixture.visual.tableId]!,
        table: { ...dataChartFixtureAssets[barDataChartFixture.visual.tableId]!.table!, tableId: "019ffbf1-eeee-7000-8000-0000000007ff" },
      },
    };
    expect(validateScene(barDataChartFixture, { requireResolvedAssets: true, resolvedAssets: wrongTable })[0]).toMatchObject({
      code: "chart_data_invalid",
    });
  });

  it("refuses a title too long to sit above the chart", () => {
    const issues = validateScene(
      { ...barDataChartFixture, title: "Density ".repeat(19).trim() },
      { requireResolvedAssets: true, resolvedAssets: dataChartFixtureAssets },
    );
    expect(issues[0]).toMatchObject({ code: "text_overflow", fieldPath: "title" });
  });

  it("keeps the maximum chart inside its panel and above the captions at 1080p", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      for (const scene of [maximumDataChartFixture, lineDataChartFixture]) {
        await page.setContent(
          `<style>html,body{height:100%;margin:0}</style>${renderToStaticMarkup(
            createElement(DataChartSceneFrame, {
              frame: secondsToFrames(scene.durationSeconds) - 1,
              resolvedAssets: dataChartFixtureAssets,
              runtimeMode: "render",
              scene,
            }),
          )}`,
        );
        const outside = await page.locator("[data-data-chart-panel]").evaluate((panel) => {
          const box = panel.getBoundingClientRect();
          return Array.from(panel.querySelectorAll("svg > text, svg > rect, svg > line, svg > g text, svg > g rect, svg > g line, svg g[data-data-chart-point]")).flatMap(
            (element) => {
              const bounds = element.getBoundingClientRect();
              return bounds.left >= box.left - 1 &&
                bounds.right <= box.right + 1 &&
                bounds.top >= box.top - 1 &&
                bounds.bottom <= Math.min(box.bottom, 876) + 1
                ? []
                : [{ tag: element.tagName, bounds: bounds.toJSON() }];
            },
          );
        });
        expect(outside, scene.visual.chartKind).toEqual([]);
      }
    } finally {
      await browser.close();
    }
  });
});

function sentenceCues(narration: string, durationInFrames: number): CinemaCaptionCue[] {
  const sentences = narrationSentences(narration);
  const share = Math.floor((durationInFrames - 40) / sentences.length);
  return sentences.map((text, index) => ({
    startFrame: 10 + index * share,
    endFrame: 10 + (index + 1) * share,
    text,
  }));
}

describe("ST-114 hero-chart compositions", () => {
  for (const compositionId of ["hero-chart", "hero-chart-keyed"] as const)
    it(`${compositionId} draws the table's values and lands each bar on its beat`, () => {
      const scene = barDataChartFixture;
      const manifest = planCinemaDesign({
        packId: "everyday",
        scenes: [scene],
        seed: "0123456789abcdef",
        locks: { [scene.id]: compositionId },
      });
      const design = manifest.scenes[scene.id]!;
      expect(design).toMatchObject({ compositionId, compositionVersion: "1.1.0" });
      const durationInFrames = scene.durationSeconds * 30;
      const frames = resolveCinemaBeatFrames({
        beats: design.beats,
        narration: scene.narration,
        cues: sentenceCues(scene.narration, durationInFrames),
        durationInFrames,
      });
      const identity = resolveCinemaIdentity("everyday", manifest.settings);
      const props = {
        scene,
        design,
        identity,
        hero: resolveCinemaHero({ scene, design, assets: dataChartFixtureAssets, mode: "render" }),
        itemIcons: resolveCinemaItemIcons({ scene, assets: dataChartFixtureAssets, mode: "render" }),
        sequenceIcons: resolveCinemaItemIcons({ scene, assets: dataChartFixtureAssets, mode: "render", forSequence: true }),
        subjects: resolveCinemaSubjectImages({ scene, assets: dataChartFixtureAssets, mode: "render" }),
        chart: resolveSceneChart(scene, dataChartFixtureAssets),
      };
      const Composition = cinemaCompositionComponents[compositionId] as (p: typeof props) => JSX.Element;
      const render = (frame: number) =>
        renderToStaticMarkup(
          <CinemaBeatProvider
            timeline={createBeatTimeline({ beats: design.beats, frames, frame, durationInFrames, energy: "balanced" })}
          >
            <Composition {...props} />
          </CinemaBeatProvider>,
        );
      scene.visual.rowIndexes.forEach((row, index) => {
        const beatIndex = design.beats.findIndex((beat) => beat.target === `item-${index + 1}`);
        expect(beatIndex, `item-${index + 1}`).toBeGreaterThanOrEqual(0);
        const beatFrame = frames[beatIndex]!;
        expect(render(beatFrame)).toContain(`data-data-chart-bar="1-${index + 1}" data-progress="1.000"`);
        expect(render(beatFrame - 2)).not.toContain(`data-data-chart-bar="1-${index + 1}" data-progress="1.000"`);
        expect(render(durationInFrames - 1)).toContain(`>${dataChartFixtureTable.rows[row]![1]}<`);
      });
    });

  it("is refused for a scene whose table cell is not numeric", () => {
    const resolution = resolveDataChart(dataChartFixtureTable, nonNumericDataChartFixture.visual);
    expect(resolution.ok).toBe(false);
  });
});
