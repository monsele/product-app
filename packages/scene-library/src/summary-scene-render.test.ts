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
      `"508acb6ab0c70a7e550e0b85b6f95e24fb692cdd5d98a05a7561fe55372c4615"`,
    );
    await expect(hashAt(90)).resolves.toMatchInlineSnapshot(
      `"f3c31a79831147af93b775c1c80c75658a8d69246738c0c938b6ae7e86a8e0b7"`,
    );
    await expect(hashAt(270)).resolves.toMatchInlineSnapshot(
      `"80b61c05e75a00de59695d1920e5d791fea891e7ad4caeb26216d94e28ea4c65"`,
    );
  }, 120_000);
});
