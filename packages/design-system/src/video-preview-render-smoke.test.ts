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
    ).toBe("4692761329bf5c6525ffbc053e06671282d19f92f7b260770373fd844666e309");
    expect(
      createHash("sha256")
        .update(PNG.sync.read(rendered.buffer ?? Buffer.alloc(0)).data)
        .digest("hex"),
    ).toBe("706aadf331657fd2af6d140a687628298e460c380991d121ab07bbce1268f596");

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
    ).toBe("954209224161e1e09305bd2bf3b7da7aa6878939c5a16a90898902498a1e6d78");
  }, 120_000);
});
