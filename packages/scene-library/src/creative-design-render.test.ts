import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  creativeDesignManifestSchema,
  defaultCreativeDesignSettings,
  lessonSpecSchema,
  planCreativeDesign,
  type CreativeDesignSceneType,
} from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import { calculateLessonTimeline, type FullLessonCompositionProps } from "./full-lesson.js";
import { photosynthesisThreeMinuteLesson } from "./full-lesson.fixture.js";
import { fullLessonRuntimeCompositionId } from "./scene-preview-composition.js";

const comparisonScene = {
  ...photosynthesisThreeMinuteLesson.scenes[0]!,
  id: "00000000-0000-7000-8000-000000000299",
  order: 5,
  template: "comparison" as const,
  title: "Leaf and root jobs",
  visual: {
    leftSubject: { label: "Leaves" },
    rightSubject: { label: "Roots" },
    similarities: ["Both help the plant grow"],
    differences: ["Leaves collect light; roots collect water"],
  },
};

const labelledDiagramScene = {
  ...photosynthesisThreeMinuteLesson.scenes[0]!,
  id: "00000000-0000-7000-8000-000000000297",
  order: 7,
  template: "labelled-diagram" as const,
  title: "Leaf Diagram",
  visual: {
    kind: "shapes" as const,
    shape: "plant" as const,
    labels: [
      { anchor: "top" as const, id: "sunlight", text: "Sunlight" },
      { anchor: "bottom" as const, id: "roots", text: "Roots" },
    ],
  },
};

const analogyScene = {
  ...photosynthesisThreeMinuteLesson.scenes[0]!,
  id: "00000000-0000-7000-8000-000000000298",
  order: 8,
  template: "analogy" as const,
  title: "Solar Factory Analogy",
  visual: {
    familiarSystem: "A solar kitchen",
    sourceConcept: "Photosynthesis",
    mappings: [
      { analogy: "Sunlight", concept: "Solar power" },
      { analogy: "Recipe", concept: "Chloroplast reaction" },
    ],
  },
};

const workedExampleScene = {
  ...photosynthesisThreeMinuteLesson.scenes[0]!,
  id: "00000000-0000-7000-8000-000000000296",
  order: 9,
  template: "worked-example" as const,
  title: "Sugar calculation",
  visual: {
    problem: "How much glucose is made from 6 carbon dioxide molecules?",
    steps: [
      "Count 6 carbon dioxide molecules entering",
      "Process with 6 water molecules",
      "Combine carbons into 1 glucose molecule",
    ],
    answer: "1 glucose molecule and 6 oxygen molecules are released",
  },
};

const supportedLesson = lessonSpecSchema.parse({
  ...photosynthesisThreeMinuteLesson,
  scenes: [
    photosynthesisThreeMinuteLesson.scenes[0]!,
    photosynthesisThreeMinuteLesson.scenes[1]!,
    photosynthesisThreeMinuteLesson.scenes[2]!,
    { ...photosynthesisThreeMinuteLesson.scenes[3]!, order: 4 },
    comparisonScene,
    { ...photosynthesisThreeMinuteLesson.scenes[4]!, order: 6 },
    labelledDiagramScene,
    analogyScene,
    workedExampleScene,
    { ...photosynthesisThreeMinuteLesson.scenes[5]!, order: 10 },
  ],
  targetDurationSeconds: 300,
});
const timeline = calculateLessonTimeline(supportedLesson);

function propsFor(packId: "essential" | "editorial" | "everyday", variant: "primary" | "alternate"): FullLessonCompositionProps {
  const selections = planCreativeDesign({
    packId,
    scenes: supportedLesson.scenes.map((scene) => ({
      id: scene.id,
      template: scene.template as CreativeDesignSceneType,
      durationSeconds: scene.durationSeconds,
    })),
  });
  return {
    assets: {},
    captions: timeline.map((segment, index) => ({ endFrame: segment.endFrameExclusive, sceneId: segment.sceneId, startFrame: segment.startFrame, text: supportedLesson.scenes[index]!.narration })),
    creativeDesign: creativeDesignManifestSchema.parse({
      manifestVersion: "1.0",
      plannerVersion: "st-097-planner-v1",
      pack: { id: packId, version: "1.0.0" },
      approach: "standard",
      settings: defaultCreativeDesignSettings,
      selections: Object.fromEntries(Object.entries(selections).map(([sceneId, selection]) => [sceneId, { ...selection, treatmentId: `${packId}.${supportedLesson.scenes.find((scene) => scene.id === sceneId)!.template}.${variant}` }])),
      presetVersionId: null,
    }),
    lesson: supportedLesson,
    narrationTracks: timeline.map((segment) => ({ kind: "deterministic-silence" as const, sceneId: segment.sceneId })),
  };
}

describe("ST-100 creative design production rendering", () => {
  it("renders every registered treatment as a deterministic, visually distinct real frame", async () => {
    const serveUrl = await bundle({ entryPoint: fileURLToPath(new URL("../dist/remotion-root.js", import.meta.url)) });
    const browserExecutable = chromium.executablePath();
    const hashes = new Set<string>();
    for (const packId of ["essential", "editorial", "everyday"] as const)
      for (const variant of ["primary", "alternate"] as const) {
        const props = propsFor(packId, variant);
        const composition = await selectComposition({ browserExecutable, id: fullLessonRuntimeCompositionId, inputProps: props, serveUrl });
        for (const segment of timeline) {
          const rendered = await renderStill({ browserExecutable, composition, frame: segment.startFrame + 90, imageFormat: "png", inputProps: props, serveUrl });
          expect(rendered.buffer?.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
          hashes.add(createHash("sha256").update(rendered.buffer!).digest("hex"));
        }
      }
    expect(hashes.size).toBe(60);
  }, 600_000);
});
