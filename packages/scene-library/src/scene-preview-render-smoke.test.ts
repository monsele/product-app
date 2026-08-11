import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  sceneRuntimeComposition,
  sceneRuntimeCompositionId,
} from "./scene-preview-composition.js";

describe("scene runtime Remotion smoke", () => {
  it("renders the same shared runtime used by the scene preview composition", async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    const browserExecutable = chromium.executablePath();
    const composition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {},
      serveUrl,
    });
    const rendered = await renderStill({
      browserExecutable,
      composition,
      frame: 0,
      imageFormat: "png",
      serveUrl,
    });

    expect(composition).toMatchObject(sceneRuntimeComposition);
    expect(rendered.contentType).toBe("image/png");
    expect(rendered.buffer?.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  }, 120_000);
});
