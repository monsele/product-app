/**
 * ST-114 — a data-chart lesson encoded to a real MP4 by the production render
 * engine (AC1, AC3).
 *
 * The scene-library tests prove frame by frame that the chart draws the table
 * cells' own text and lands each bar on its beat. This test closes the last
 * step: the same lesson, with its source-table asset, goes through
 * `RemotionRenderEngine.renderVideo` and the pinned ffmpeg to an H.264 file
 * of the right length and size with no black frames. A chart whose selected
 * cell is not a number never produces a file.
 */
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
  barDataChartFixture,
  calculateLessonTimeline,
  dataChartFixtureAssets,
  fullLessonCompositionPropsSchema,
  nonNumericDataChartFixture,
} from "@avlp/scene-library";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hdRenderProfile } from "./contracts.js";
import { RemotionRenderEngine } from "./media.js";
import {
  classifyRenderReview,
  FfmpegRenderInspector,
  silenceFloorDb,
} from "./render-review.js";

function chartComposition(scene: typeof barDataChartFixture) {
  const lesson = { scenes: [scene] };
  const timeline = calculateLessonTimeline(lesson as never);
  return {
    totalFrames: timeline.reduce((total, segment) => total + segment.durationInFrames, 0),
    composition: fullLessonCompositionPropsSchema.parse({
      assets: dataChartFixtureAssets,
      captions: timeline.map((segment) => ({
        sceneId: segment.sceneId,
        startFrame: segment.startFrame,
        endFrame: segment.endFrameExclusive,
        text: scene.narration,
      })),
      lesson,
      narrationTracks: timeline.map((segment) => ({
        kind: "deterministic-silence" as const,
        sceneId: segment.sceneId,
      })),
    }),
  };
}

describe("ST-114 data-chart lesson to MP4", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "avlp-chart-"));
  });
  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it(
    "encodes a chart drawn from its source table at 1080p with no black frames",
    async () => {
      const { composition, totalFrames } = chartComposition(barDataChartFixture);
      const outputPath = join(directory, "chart.mp4");
      const metadata = await new RemotionRenderEngine().renderVideo({
        browserExecutable: chromium.executablePath(),
        composition,
        onProgress: async () => undefined,
        outputPath,
        profile: hdRenderProfile,
      });
      expect(metadata).toMatchObject({ width: 1920, height: 1080 });
      expect(Math.abs(metadata.durationMs - (totalFrames / 30) * 1_000)).toBeLessThanOrEqual(100);
      expect((await stat(outputPath)).size).toBeGreaterThan(0);

      const inspection = await new FfmpegRenderInspector().inspect({
        silenceFloorDb: silenceFloorDb(null),
        videoPath: outputPath,
        workingDirectory: directory,
      });
      const findings = classifyRenderReview(inspection.measurements, {
        captions: { expectedCueCount: 1, narratedScenesWithoutCaptions: 0, renderedCueCount: 1 },
        expectedDurationMs: metadata.durationMs,
        narrationSpans: [],
        profile: hdRenderProfile,
      });
      expect(findings.filter((item) => item.code === "BLACK_SEGMENT")).toEqual([]);
    },
    300_000,
  );

  it(
    "never produces a file for a chart whose selected cell is not a number",
    async () => {
      // The same lesson as above except that the chart selects a column of
      // words, so the scene's render-mode guard is the only difference.
      const { composition } = chartComposition(nonNumericDataChartFixture);
      const outputPath = join(directory, "blocked.mp4");
      const failure: unknown = await new RemotionRenderEngine()
        .renderVideo({
          browserExecutable: chromium.executablePath(),
          composition,
          onProgress: async () => undefined,
          outputPath,
          profile: hdRenderProfile,
        })
        .then(
          () => undefined,
          (error: unknown) => error,
        );
      expect(failure).toMatchObject({ classification: "terminal", code: "RENDER_FAILED" });
      // The engine's diagnostic never carries the cell text.
      expect(JSON.stringify(failure)).not.toContain("not a number");
      await expect(stat(outputPath)).rejects.toThrow();
    },
    300_000,
  );
});
