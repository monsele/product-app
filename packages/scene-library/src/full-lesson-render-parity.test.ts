import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  fullLessonPreviewCompositionId,
  fullLessonRuntimeCompositionId,
} from "./scene-preview-composition.js";

describe("full lesson preview/render parity", () => {
  it(
    "renders the same fixture frame through preview and render runtimes",
    async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    const browserExecutable = chromium.executablePath();
    const compositions = await Promise.all(
      [fullLessonPreviewCompositionId, fullLessonRuntimeCompositionId].map(
        async (id) =>
          selectComposition({
            browserExecutable,
            id,
            inputProps: {},
            serveUrl,
          }),
      ),
    );
    const preview = compositions[0];
    const render = compositions[1];
    if (preview === undefined || render === undefined)
      throw new Error("Expected preview and render compositions.");
    const frames = await Promise.all(
      [preview, render].map((composition) =>
        renderStill({
          browserExecutable,
          composition,
          frame: 0,
          imageFormat: "png",
          serveUrl,
        }),
      ),
    );
    const previewFrame = frames[0];
    const renderFrame = frames[1];
    if (previewFrame === undefined || renderFrame === undefined)
      throw new Error("Expected preview and render frames.");

    expect(previewFrame.contentType).toBe("image/png");
    expect(renderFrame.contentType).toBe("image/png");
      expect(previewFrame.buffer).toEqual(renderFrame.buffer);
    },
    60_000,
  );
});
