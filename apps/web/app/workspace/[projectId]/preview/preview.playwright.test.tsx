import { chromium, type Browser, type Page } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  type PreviewManifest,
} from "@avlp/schemas";
import { FullLessonPreview } from "./preview-player.js";

const scene1 = createDefaultStoryboardSceneSpec("hook", {
  id: "01989a3d-8e00-7000-8000-000000000001",
  order: 1,
  durationSeconds: 10,
});

const scene2 = createDefaultStoryboardSceneSpec("definition", {
  id: "01989a3d-8e00-7000-8000-000000000002",
  order: 2,
  durationSeconds: 15,
});

const readyManifest: PreviewManifest = {
  assets: {},
  canvas: { fps: 30, height: 1080, width: 1920 },
  generatedAt: "2026-08-26T10:00:00.000Z",
  storyboard: {
    schemaVersion: 1,
    id: "01989a3d-8e00-7000-8000-000000000099",
    projectId: "01989a3d-8e00-7000-8000-000000000010",
    basedOnNarrationSetId: "01989a3d-8e00-7000-8000-000000000011",
    narrationSetContentHash: "a".repeat(64),
    outlineSetId: "01989a3d-8e00-7000-8000-000000000012",
    outlineSetContentHash: "a".repeat(64),
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
    totalDurationSeconds: 25,
    objectiveIds: ["01989a3d-8e00-7000-8000-000000000019"],
    contentHash: "a".repeat(64),
    scenes: [
      {
        id: scene1.id,
        stableSceneId: scene1.id,
        order: 1,
        template: "hook",
        durationSeconds: 10,
        narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000014"],
        assetRequirements: [],
        scene: scene1,
      },
      {
        id: scene2.id,
        stableSceneId: scene2.id,
        order: 2,
        template: "definition",
        durationSeconds: 15,
        narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000015"],
        assetRequirements: [],
        scene: scene2,
      },
    ],
    generatedAt: "2026-08-26T10:00:00.000Z",
    createdAt: "2026-08-26T10:00:00.000Z",
  },
  scenes: [
    {
      sceneId: scene1.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
    {
      sceneId: scene2.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
  ],
};

const staleManifest: PreviewManifest = {
  ...readyManifest,
  scenes: [
    {
      sceneId: scene1.id,
      audio: { status: "stale", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: ["01989a3d-8e00-7000-8000-000000000088"],
      stale: true,
    },
    {
      sceneId: scene2.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
  ],
};

describe("FullLessonPreview (Playwright)", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  async function renderComponent(
    ui: React.ReactElement,
    viewport = { width: 1280, height: 900 },
  ): Promise<Page> {
    const page = await browser.newPage({ viewport });
    const markup = renderToStaticMarkup(ui);
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
    return page;
  }

  it("renders Focus Studio theater layout at desktop (1280px)", async () => {
    const page = await renderComponent(
      <FullLessonPreview
        projectId="01989a3d-8e00-7000-8000-000000000010"
        initialManifest={readyManifest}
        projectTitle="Focus Studio Preview Fixture"
      />,
      { width: 1280, height: 900 },
    );

    try {
      // Header and title
      const heading = page.getByRole("heading", { name: "Lesson preview", level: 1 });
      expect(await heading.isVisible()).toBe(true);

      // Back to storyboard link
      const backLink = page.getByRole("link", { name: "← Back to storyboard" });
      expect(await backLink.isVisible()).toBe(true);
      expect(await backLink.getAttribute("href")).toContain("/storyboard");

      // Quality selector
      const qualitySelect = page.getByLabel("Preview quality");
      expect(await qualitySelect.isVisible()).toBe(true);
      expect(await qualitySelect.inputValue()).toBe("standard");

      // Player theater and seek bar
      const seekBar = page.getByLabel("Seek lesson");
      expect(await seekBar.isVisible()).toBe(true);
      expect(await seekBar.getAttribute("type")).toBe("range");

      // Scene buttons
      expect(await page.getByRole("button", { name: "Scene 1" }).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "Scene 2" }).isVisible()).toBe(true);

      // Contextual edit links for scenes
      const editScene1 = page.getByRole("link", { name: "Edit scene 1 →" });
      expect(await editScene1.isVisible()).toBe(true);
      expect(await editScene1.getAttribute("href")).toContain("#scene=");

      // Preflight heading
      const preflightHeading = page.getByRole("heading", {
        name: "Preflight check & render readiness",
      });
      expect(await preflightHeading.isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("renders responsive layout at tablet (768px)", async () => {
    const page = await renderComponent(
      <FullLessonPreview
        projectId="01989a3d-8e00-7000-8000-000000000010"
        initialManifest={readyManifest}
      />,
      { width: 768, height: 1024 },
    );

    try {
      expect(await page.getByRole("heading", { name: "Lesson preview" }).isVisible()).toBe(true);
      expect(await page.getByLabel("Seek lesson").isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "Scene 1" }).isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "Scene 2" }).isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("renders correctly on mobile viewports (375px)", async () => {
    const page = await renderComponent(
      <FullLessonPreview
        projectId="01989a3d-8e00-7000-8000-000000000010"
        initialManifest={readyManifest}
      />,
      { width: 375, height: 667 },
    );

    try {
      expect(await page.getByRole("heading", { name: "Lesson preview" }).isVisible()).toBe(true);
      expect(await page.getByLabel("Seek lesson").isVisible()).toBe(true);
      expect(await page.getByRole("link", { name: "Edit scene 1 →" }).isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("renders properly under 200% zoom emulation (640px)", async () => {
    const page = await renderComponent(
      <FullLessonPreview
        projectId="01989a3d-8e00-7000-8000-000000000010"
        initialManifest={readyManifest}
      />,
      { width: 640, height: 480 },
    );

    try {
      expect(await page.getByRole("heading", { name: "Lesson preview" }).isVisible()).toBe(true);
      expect(await page.getByLabel("Seek lesson").isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });

  it("displays explicit stale media alert when scenes require artifact renewal", async () => {
    const page = await renderComponent(
      <FullLessonPreview
        projectId="01989a3d-8e00-7000-8000-000000000010"
        initialManifest={staleManifest}
      />,
    );

    try {
      const alert = page.getByRole("alert");
      expect(await alert.isVisible()).toBe(true);
      expect(await alert.textContent()).toContain("outdated or missing media");
      expect(await alert.textContent()).toContain("Scene 1: missing or outdated");

      // Render button should be disabled when media is stale
      const renderBtn = page.getByRole("button", { name: "Render lesson" });
      expect(await renderBtn.isDisabled()).toBe(true);
    } finally {
      await page.close();
    }
  });
});
