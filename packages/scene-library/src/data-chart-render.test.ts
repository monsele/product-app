import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createDefaultCreativeDesignManifest,
  planCinemaDesign,
} from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import {
  barDataChartFixture,
  dataChartFixtureAssets,
  lineDataChartFixture,
} from "./data-chart-scene.fixtures.js";
import {
  calculateLessonTimeline,
  fullLessonCompositionPropsSchema,
  type FullLessonCompositionProps,
} from "./full-lesson.js";
import { fullLessonRuntimeCompositionId } from "./scene-preview-composition.js";

// ST-114: a two-chart lesson through the real Remotion composition, in the
// legacy theme, a v1 pack and a v2 pack. Frame N must be identical across
// renders, and the final-beat frame must render without blocking.
const lesson = {
  scenes: [
    barDataChartFixture,
    { ...lineDataChartFixture, id: "019ffbf1-eeee-7000-8000-0000000007b1", order: 2 },
  ],
};
const timeline = calculateLessonTimeline(lesson as never);
const base = {
  assets: dataChartFixtureAssets,
  captions: timeline.map((segment, index) => ({
    endFrame: segment.endFrameExclusive,
    sceneId: segment.sceneId,
    startFrame: segment.startFrame,
    text: lesson.scenes[index]!.narration,
  })),
  lesson,
  narrationTracks: timeline.map((segment) => ({
    kind: "deterministic-silence" as const,
    sceneId: segment.sceneId,
  })),
};
const scenes = lesson.scenes.map((scene) => ({
  id: scene.id,
  template: scene.template,
  durationSeconds: scene.durationSeconds,
}));

const variants: Readonly<Record<string, FullLessonCompositionProps>> = {
  "mvp-default": fullLessonCompositionPropsSchema.parse(base),
  "v1 everyday": fullLessonCompositionPropsSchema.parse({
    ...base,
    creativeDesign: createDefaultCreativeDesignManifest({ packId: "everyday", scenes }),
  }),
  "v2 systems": fullLessonCompositionPropsSchema.parse({
    ...base,
    creativeDesign: planCinemaDesign({
      packId: "systems",
      scenes: lesson.scenes,
      seed: "0123456789abcdef",
    }),
  }),
};

describe("ST-114 data-chart lesson through Remotion at 1080p", () => {
  it("renders every variant deterministically, including the final-beat frame", async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(new URL("../dist/remotion-root.js", import.meta.url)),
    });
    const browserExecutable = chromium.executablePath();
    const still = async (props: FullLessonCompositionProps, frame: number) => {
      const composition = await selectComposition({
        browserExecutable,
        id: fullLessonRuntimeCompositionId,
        inputProps: props,
        serveUrl,
      });
      expect([composition.width, composition.height]).toEqual([1920, 1080]);
      const rendered = await renderStill({
        browserExecutable,
        composition,
        frame,
        imageFormat: "png",
        inputProps: props,
        serveUrl,
      });
      return createHash("sha256").update(rendered.buffer!).digest("hex");
    };
    const finalFrame = timeline[0]!.endFrameExclusive - 1;
    const hashes = new Set<string>();
    for (const props of Object.values(variants)) {
      const first = await still(props, finalFrame);
      expect(await still(props, finalFrame)).toBe(first);
      hashes.add(first);
      hashes.add(await still(props, timeline[1]!.endFrameExclusive - 1));
    }
    // Each variant and scene draws a distinct frame.
    expect(hashes.size).toBe(Object.keys(variants).length * 2);
  }, 900_000);
});
