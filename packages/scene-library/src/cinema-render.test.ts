import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  creativeDesignPackIds,
  planCinemaDesign,
  createDefaultCreativeDesignManifest,
  type CreativeDesignPackId,
  type CreativeDesignSceneType,
} from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import {
  calculateLessonTimeline,
  fullLessonCompositionPropsSchema,
  type FullLessonCompositionProps,
} from "./full-lesson.js";
import { photosynthesisThreeMinuteLesson } from "./full-lesson.fixture.js";
import { fullLessonRuntimeCompositionId } from "./scene-preview-composition.js";

const lesson = photosynthesisThreeMinuteLesson;
const timeline = calculateLessonTimeline(lesson);
const captions = timeline.map((segment, index) => ({
  endFrame: segment.endFrameExclusive,
  sceneId: segment.sceneId,
  startFrame: segment.startFrame,
  text: lesson.scenes[index]!.narration,
}));
const narrationTracks = timeline.map((segment) => ({
  kind: "deterministic-silence" as const,
  sceneId: segment.sceneId,
}));

function v2Props(packId: CreativeDesignPackId): FullLessonCompositionProps {
  return fullLessonCompositionPropsSchema.parse({
    assets: {},
    captions,
    creativeDesign: planCinemaDesign({ packId, scenes: lesson.scenes, seed: "0123456789abcdef" }),
    lesson,
    narrationTracks,
  });
}

function v1Props(packId: CreativeDesignPackId): FullLessonCompositionProps {
  return fullLessonCompositionPropsSchema.parse({
    assets: {},
    captions,
    creativeDesign: createDefaultCreativeDesignManifest({
      packId,
      scenes: lesson.scenes.map((scene) => ({
        id: scene.id,
        template: scene.template as CreativeDesignSceneType,
        durationSeconds: scene.durationSeconds,
      })),
    }),
    lesson,
    narrationTracks,
  });
}

describe("ST-108/109/111 v2 composition rendering through Remotion", () => {
  it("renders every identity's v2 lesson deterministically and distinctly from v1", async () => {
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
      const rendered = await renderStill({
        browserExecutable,
        composition,
        frame,
        imageFormat: "png",
        inputProps: props,
        serveUrl,
      });
      expect(rendered.buffer?.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      return createHash("sha256").update(rendered.buffer!).digest("hex");
    };
    const v2Hashes = new Set<string>();
    for (const packId of creativeDesignPackIds) {
      const props = v2Props(packId);
      for (const segment of timeline)
        v2Hashes.add(await still(props, segment.startFrame + 600));
      // Reproducible: the same frame renders identically.
      const frame = timeline[2]!.startFrame + 600;
      expect(await still(props, frame)).toBe(await still(props, frame));
      // A v2 snapshot does not reuse the v1 appearance (distinct identity).
      expect(await still(props, frame)).not.toBe(await still(v1Props(packId), frame));
    }
    expect(v2Hashes.size).toBe(creativeDesignPackIds.length * timeline.length);
  }, 1_800_000);
});
