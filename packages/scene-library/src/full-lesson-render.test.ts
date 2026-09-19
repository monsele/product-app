import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fullLessonRuntimeCompositionId } from "./scene-preview-composition.js";
import { photosynthesisThreeMinutePreview } from "./full-lesson.fixture.js";

describe("full lesson Remotion composition", () => {
  it("renders deterministic scene and transition frames", async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    const browserExecutable = chromium.executablePath();
    const composition = await selectComposition({
      browserExecutable,
      id: fullLessonRuntimeCompositionId,
      inputProps: photosynthesisThreeMinutePreview,
      serveUrl,
    });
    const differentLengthProps = {
      ...photosynthesisThreeMinutePreview,
      lesson: {
        ...photosynthesisThreeMinutePreview.lesson,
        scenes: photosynthesisThreeMinutePreview.lesson.scenes.map(
          (scene, index) =>
            index === 0
              ? { ...scene, durationSeconds: scene.durationSeconds + 1 }
              : scene,
        ),
      },
    };
    const differentLengthComposition = await selectComposition({
      browserExecutable,
      id: fullLessonRuntimeCompositionId,
      inputProps: differentLengthProps,
      serveUrl,
    });
    const first = await renderStill({
      browserExecutable,
      composition,
      frame: 0,
      imageFormat: "png",
      inputProps: photosynthesisThreeMinutePreview,
      serveUrl,
    });
    const transition = await renderStill({
      browserExecutable,
      composition,
      frame: 900,
      imageFormat: "png",
      inputProps: photosynthesisThreeMinutePreview,
      serveUrl,
    });
    const repeated = await renderStill({
      browserExecutable,
      composition,
      frame: 900,
      imageFormat: "png",
      inputProps: photosynthesisThreeMinutePreview,
      serveUrl,
    });
    expect(composition.durationInFrames).toBe(5400);
    expect(differentLengthComposition.durationInFrames).toBe(5430);
    expect(first.buffer?.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(transition.buffer).toEqual(repeated.buffer);
    expect(
      createHash("sha256")
        .update(first.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"47fbcfd94e01c58ed2beaaf41402ab3d2eb3fc1cb171fda5260f4ab019470cc5"`,
    );
    expect(
      createHash("sha256")
        .update(transition.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(
      `"3fbf63ec7ac772e4e11d32b1e3c01a3e8d7c808d1b91768e676d304e281e16d9"`,
    );
  }, 120_000);
});
