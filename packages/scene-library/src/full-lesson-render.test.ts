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
    expect(first.buffer?.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(transition.buffer).toEqual(repeated.buffer);
    expect(
      createHash("sha256")
        .update(first.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(`"3c51a993d6ff7b674f379b2cd0cba54b448b9246a9c94cf342e851dc4b480d51"`);
    expect(
      createHash("sha256")
        .update(transition.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toMatchInlineSnapshot(`"f1ddbd37ed9d9f42a1155cd73a788214cad42688848418efa8a8061d57270206"`);
  }, 120_000);
});
