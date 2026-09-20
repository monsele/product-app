import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  videoDesignPreviewComposition,
  videoDesignPreviewId,
} from "./video-preview-composition.js";

describe("video design preview render smoke", () => {
  it("renders the same registered composition used by preview", async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    const browserExecutable = chromium.executablePath();
    const composition = await selectComposition({
      browserExecutable,
      serveUrl,
      id: videoDesignPreviewId,
      inputProps: {},
    });
    const rendered = await renderStill({
      browserExecutable,
      composition,
      frame: 18,
      imageFormat: "png",
      serveUrl,
    });

    expect(composition).toMatchObject(videoDesignPreviewComposition);
    expect(rendered.contentType).toBe("image/png");
    expect(rendered.buffer?.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(
      createHash("sha256")
        .update(rendered.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toBe("25fc1cb627547fbf99a05bf7c5139ed9129e4a6e834ebf7906dd01f84ae2b9ed");
    expect(
      createHash("sha256")
        .update(PNG.sync.read(rendered.buffer ?? Buffer.alloc(0)).data)
        .digest("hex"),
    ).toBe("302ece7e0488826bb0aa8d907181d3777afb46373627ad2cc9ba3984e4692ee0");

    const transitionFrame = await renderStill({
      browserExecutable,
      composition,
      frame: 96,
      imageFormat: "png",
      serveUrl,
    });
    expect(
      createHash("sha256")
        .update(transitionFrame.buffer ?? Buffer.alloc(0))
        .digest("hex"),
    ).toBe("ad52c66b514dae8c85bf53589805fa295b0d66a4635288b7feb62f86c29978a9");
  }, 120_000);
});
