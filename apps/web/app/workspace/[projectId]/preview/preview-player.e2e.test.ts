import { chromium, type Browser } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  previewManifestSchema,
} from "@avlp/schemas";
import { FullLessonPreview } from "./preview-player.js";

const projectId = "01989a3d-8e00-7000-8000-000000000002";
const firstScene = createDefaultStoryboardSceneSpec("hook", {
  id: "01989a3d-8e00-7000-8000-000000000001",
  order: 1,
  durationSeconds: 10,
});
const secondScene = createDefaultStoryboardSceneSpec("definition", {
  id: "01989a3d-8e00-7000-8000-000000000003",
  order: 2,
  durationSeconds: 10,
});
const hash = "a".repeat(64);
const manifest = previewManifestSchema.parse({
  assets: {},
  canvas: { fps: 30, height: 1080, width: 1920 },
  generatedAt: "2026-08-24T10:00:00.000Z",
  storyboard: {
    schemaVersion: 1,
    id: "01989a3d-8e00-7000-8000-000000000009",
    projectId,
    basedOnNarrationSetId: "01989a3d-8e00-7000-8000-000000000011",
    narrationSetContentHash: hash,
    outlineSetId: "01989a3d-8e00-7000-8000-000000000012",
    outlineSetContentHash: hash,
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "1",
    model: "fixture",
    modelCallId: "01989a3d-8e00-7000-8000-000000000013",
    status: "draft",
    revision: 1,
    title: "Focus Studio Preview Fixture",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 20,
    objectiveIds: ["01989a3d-8e00-7000-8000-000000000019"],
    contentHash: hash,
    scenes: [
      {
        id: firstScene.id,
        stableSceneId: firstScene.id,
        order: 1,
        template: "hook",
        durationSeconds: 10,
        narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000014"],
        assetRequirements: [],
        scene: firstScene,
      },
      {
        id: secondScene.id,
        stableSceneId: secondScene.id,
        order: 2,
        template: "definition",
        durationSeconds: 10,
        narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000015"],
        assetRequirements: [],
        scene: secondScene,
      },
    ],
    generatedAt: "2026-08-24T10:00:00.000Z",
    createdAt: "2026-08-24T10:00:00.000Z",
  },
  scenes: [
    {
      sceneId: firstScene.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
    {
      sceneId: secondScene.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
  ],
});

describe("full lesson preview route", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("renders seek and scene navigation against the preview player", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      const markup = renderToStaticMarkup(
        React.createElement(FullLessonPreview, {
          projectId,
          initialManifest: manifest,
          projectTitle: "Focus Studio Preview Fixture",
        }),
      );
      await page.setContent(
        `<!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              :root {
                --color-canvas: #18131F;
                --color-surface: #211A2B;
                --color-surface-raised: #292035;
                --color-text: #F4F1F8;
                --color-text-muted: #BDB5C7;
                --color-border: #3A3046;
                --color-brand: #A883FF;
                --color-on-brand: #1B1027;
              }
              body { margin: 0; background: #18131F; color: #F4F1F8; font-family: sans-serif; }
            </style>
          </head>
          <body class="theme-focus-studio">${markup}</body>
        </html>`,
        { waitUntil: "domcontentloaded" },
      );

      const scene2Button = page.getByRole("button", { name: "Scene 2" });
      expect(await scene2Button.isVisible()).toBe(true);

      const seekBar = page.getByLabel("Seek lesson");
      expect(await seekBar.isVisible()).toBe(true);

      const scene1Button = page.getByRole("button", { name: "Scene 1" });
      expect(await scene1Button.isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });
});
