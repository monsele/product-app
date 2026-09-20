import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sceneRuntimeCompositionId } from "./scene-preview-composition.js";
import {
  assetAssistedSummaryFixture,
  resolvedSummaryAssets,
} from "./summary-scene.fixtures.js";

describe("SummaryScene render frames", () => {
  it("renders deterministic initial, recall, and thumbnail frames", async () => {
    const serveUrl = await bundle({
      entryPoint: fileURLToPath(
        new URL("../dist/remotion-root.js", import.meta.url),
      ),
    });
    const browserExecutable = chromium.executablePath();
    const composition = await selectComposition({
      browserExecutable,
      id: sceneRuntimeCompositionId,
      inputProps: {
        resolvedAssets: resolvedSummaryAssets,
        scene: assetAssistedSummaryFixture,
      },
      serveUrl,
    });
    const hashAt = async (frame: number): Promise<string> => {
      const rendered = await renderStill({
        browserExecutable,
        composition,
        frame,
        imageFormat: "png",
        inputProps: {
          resolvedAssets: resolvedSummaryAssets,
          scene: assetAssistedSummaryFixture,
        },
        serveUrl,
      });
      expect(rendered.contentType).toBe("image/png");
      return createHash("sha256")
        .update(rendered.buffer ?? Buffer.alloc(0))
        .digest("hex");
    };
    await expect(hashAt(0)).resolves.toMatchInlineSnapshot(
      `"ab6869754c90415fbe1f232d34feade652bef5ff4d1d66c0ab95ae38b69cf902"`,
    );
    await expect(hashAt(90)).resolves.toMatchInlineSnapshot(
      `"ace43d35a46f95d2ddb51d3f8a0eb9cd1b68e16cd14eb1a5797653c8da44be9c"`,
    );
    await expect(hashAt(270)).resolves.toMatchInlineSnapshot(
      `"1c421203f48aa8ae14f65464194fe4a3370e048cc84abc744177b7d39ac9402c"`,
    );
  }, 120_000);
});
