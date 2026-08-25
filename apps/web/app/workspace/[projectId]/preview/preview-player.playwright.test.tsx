import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createDefaultStoryboardSceneSpec } from "@avlp/schemas";
import { FullLessonPreview } from "./preview-player.js";

const scene = createDefaultStoryboardSceneSpec("hook", {
  id: "01989a3d-8e00-7000-8000-000000000001",
  order: 1,
  durationSeconds: 10,
});

const manifest = {
  assets: {},
  canvas: { fps: 30, height: 1080, width: 1920 },
  generatedAt: "2026-08-24T10:00:00.000Z",
  storyboard: { scenes: [{ stableSceneId: scene.id, scene }] },
  scenes: [
    {
      sceneId: scene.id,
      audio: { status: "stale", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: true,
    },
  ],
};

describe("FullLessonPreview", () => {
  it("exposes seek, scene navigation, stale state, and edit navigation", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        renderToStaticMarkup(
          createElement(FullLessonPreview, {
            initialManifest: manifest,
            projectId: "01989a3d-8e00-7000-8000-000000000002",
          }),
        ),
      );
      expect(await page.getByLabel("Seek lesson").getAttribute("type")).toBe(
        "range",
      );
      expect(await page.getByRole("button", { name: "Scene 1" }).count()).toBe(
        1,
      );
      await page.getByLabel("Seek lesson").press("End");
      expect(await page.getByLabel("Seek lesson").inputValue()).toBe("299");
      await page.getByRole("button", { name: "Scene 1" }).click();
      expect(await page.getByRole("alert").textContent()).toContain(
        "outdated or missing media",
      );
      expect(
        await page
          .getByRole("link", { name: "Edit scene 1" })
          .getAttribute("href"),
      ).toContain("#scene=");
    } finally {
      await browser.close();
    }
  });
});
