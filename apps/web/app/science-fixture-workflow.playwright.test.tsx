import { chromium, type Browser, type Page } from "@playwright/test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalFivePageScienceDocument,
  canonicalScienceLesson,
} from "@avlp/test-fixtures";
import {
  createDefaultStoryboardSceneSpec,
  type PreviewManifest,
  type RenderStatusResponse,
} from "@avlp/schemas";

import { IngestionStatusPanel } from "./workspace/[projectId]/upload/ingestion-status-panel.js";
import { IngestionReviewViewer } from "./workspace/[projectId]/review/ingestion-review-viewer.js";
import { ConfigurationWorkspace } from "./workspace/[projectId]/configuration/configuration-workspace.js";
import { ObjectivesPanel } from "./workspace/[projectId]/objectives/objectives-panel.js";
import { OutlinePanel } from "./workspace/[projectId]/outline/outline-panel.js";
import { NarrationPanel } from "./workspace/[projectId]/narration/narration-panel.js";
import { StoryboardPanel } from "./workspace/[projectId]/storyboard/storyboard-panel.js";
import { FullLessonPreview } from "./workspace/[projectId]/preview/preview-player.js";
import { RenderPanel } from "./workspace/[projectId]/render/render-panel.js";

describe("Science Fixture Complete End-to-End Workflow (Playwright)", () => {
  let browser: Browser;
  const projectId = canonicalScienceLesson.projectId;
  const projectTitle = canonicalScienceLesson.title;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  async function renderSurface(
    ui: React.ReactElement,
    theme: "daylight" | "focus" = "daylight",
  ): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const markup = renderToStaticMarkup(ui);
    const isDaylight = theme === "daylight";

    await page.setContent(
      `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            :root {
              --color-canvas: ${isDaylight ? "#F9F7F4" : "#18131F"};
              --color-surface: ${isDaylight ? "#FFFFFF" : "#211A2B"};
              --color-surface-raised: ${isDaylight ? "#F0ECE6" : "#292035"};
              --color-text: ${isDaylight ? "#110D17" : "#F4F1F8"};
              --color-text-muted: ${isDaylight ? "#5E5669" : "#BDB5C7"};
              --color-border: ${isDaylight ? "#DDD6CE" : "#3A3046"};
              --color-brand: ${isDaylight ? "#6A4DF4" : "#A883FF"};
              --color-on-brand: ${isDaylight ? "#FFFFFF" : "#1B1027"};
            }
            body { margin: 0; background: var(--color-canvas); color: var(--color-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
          </style>
        </head>
        <body class="${isDaylight ? "theme-daylight" : "theme-focus-studio"}">
          <main>${markup}</main>
        </body>
      </html>`,
      { waitUntil: "domcontentloaded" },
    );

    return page;
  }

  it("Stage 1 & 2: Upload Ingestion & Ingestion Review of 5-page science document", async () => {
    const page = await renderSurface(
      <div>
        <IngestionStatusPanel projectId={projectId} />
        <IngestionReviewViewer
          projectId={projectId}
          projectTitle={`${canonicalFivePageScienceDocument.title} (${canonicalFivePageScienceDocument.pageCount} pages)`}
        />
      </div>,
      "daylight",
    );

    try {
      const heading = page.locator("#review-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await heading.textContent()).toContain("Document review");
    } finally {
      await page.close();
    }
  });

  it("Stage 3: Lesson & Voice Configuration with science parameters", async () => {
    const page = await renderSurface(
      <ConfigurationWorkspace
        projectId={projectId}
        projectTitle={projectTitle}
      />,
      "daylight",
    );

    try {
      const heading = page.locator("#configuration-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await heading.textContent()).toContain("Lesson & voice setup");
    } finally {
      await page.close();
    }
  });

  it("Stage 4 & 5: Objectives and Outline grounded in science document", async () => {
    const page = await renderSurface(
      <div>
        <ObjectivesPanel
          projectId={projectId}
          projectTitle={projectTitle}
        />
        <OutlinePanel
          projectId={projectId}
          projectTitle={projectTitle}
        />
      </div>,
      "daylight",
    );

    try {
      const headings = await page.locator("h1").all();
      expect(headings.length).toBeGreaterThanOrEqual(1);
      expect(await page.locator("h1").first().textContent()).toContain("Learning objectives");
    } finally {
      await page.close();
    }
  });

  it("Stage 6 & 7: Narration and Focus Studio Storyboard for science lesson", async () => {
    const page = await renderSurface(
      <div>
        <NarrationPanel
          projectId={projectId}
          projectTitle={projectTitle}
        />
        <StoryboardPanel
          projectId={projectId}
          projectTitle={projectTitle}
        />
      </div>,
      "focus",
    );

    try {
      const narrationHeading = page.getByRole("heading", { name: /Narration script/i });
      expect(await narrationHeading.isVisible()).toBe(true);

      const storyboardHeading = page.locator("#storyboard-heading");
      expect(await storyboardHeading.isVisible()).toBe(true);
      expect(await storyboardHeading.textContent()).toContain("Storyboard");
    } finally {
      await page.close();
    }
  });

  it("Stage 8, 9 & Public Delivery: Preview and Render Delivery", async () => {
    const hookSceneSpec = createDefaultStoryboardSceneSpec("hook", {
      id: canonicalScienceLesson.scenes[0]!.id,
      order: 1,
      durationSeconds: 30,
    });

    const previewManifest: PreviewManifest = {
      assets: {},
      canvas: { fps: 30, height: 1080, width: 1920 },
      generatedAt: "2026-08-26T12:00:00.000Z",
      storyboard: {
        schemaVersion: 1,
        id: "sb-science-001",
        projectId,
        basedOnNarrationSetId: "narr-set-01",
        narrationSetContentHash: "a".repeat(64),
        outlineSetId: "out-set-01",
        outlineSetContentHash: "a".repeat(64),
        configurationVersion: 1,
        promptId: "storyboard",
        promptVersion: "1",
        model: "fixture",
        modelCallId: "call-01",
        status: "draft",
        revision: 1,
        title: canonicalScienceLesson.title,
        subject: canonicalScienceLesson.subject,
        targetDurationSeconds: canonicalScienceLesson.targetDurationSeconds,
        totalDurationSeconds: 30,
        objectiveIds: canonicalScienceLesson.objectiveIds,
        contentHash: "a".repeat(64),
        scenes: [
          {
            id: hookSceneSpec.id,
            stableSceneId: hookSceneSpec.id,
            order: 1,
            template: "hook",
            durationSeconds: 30,
            narrationBlockIds: [],
            assetRequirements: [],
            scene: hookSceneSpec,
          },
        ],
        generatedAt: "2026-08-26T12:00:00.000Z",
        createdAt: "2026-08-26T12:00:00.000Z",
      },
      scenes: [
        {
          sceneId: hookSceneSpec.id,
          audio: { status: "ready", url: null, expiresAt: null },
          captions: [],
          missingAssetIds: [],
          stale: false,
        },
      ],
    };

    const previewPage = await renderSurface(
      <FullLessonPreview
        projectId={projectId}
        initialManifest={previewManifest}
        projectTitle={canonicalScienceLesson.title}
      />,
      "focus",
    );

    try {
      expect(
        await previewPage.getByRole("heading", { name: "Lesson preview", level: 1 }).isVisible(),
      ).toBe(true);
      expect(await previewPage.getByLabel("Seek lesson").isVisible()).toBe(true);
    } finally {
      await previewPage.close();
    }

    const scienceRenderStatus: RenderStatusResponse = {
      id: "01989a3d-8e00-7000-8000-000000000010",
      lessonVersionId: "01989a3d-8e00-7000-8000-000000000011",
      validationRunId: "01989a3d-8e00-7000-8000-000000000012",
      status: "completed",
      progress: 1,
      attempt: 0,
      errorCode: null,
      errorMessage: null,
      retryable: false,
      correlationId: "01989a3d-8e00-7000-8000-000000000013",
      createdAt: "2026-08-26T12:00:00.000Z",
      startedAt: "2026-08-26T12:00:10.000Z",
      completedAt: "2026-08-26T12:01:30.000Z",
      video: {
        id: "01989a3d-8e00-7000-8000-000000000014",
        durationMs: 90000,
        sizeBytes: 24500000,
        width: 1920,
        height: 1080,
        fps: 30,
        videoCodec: "h264",
        audioCodec: "aac",
        storageKey: "projects/science/video.mp4",
        thumbnailStorageKey: "projects/science/thumb.jpg",
        thumbnailUrl: "https://storage.local/science-thumb.jpg",
      },
    };

    const deliveryPage = await renderSurface(
      <RenderPanel
        projectId={projectId}
        lessonVersionId="01989a3d-8e00-7000-8000-000000000011"
        initial={[scienceRenderStatus]}
      />,
      "daylight",
    );

    try {
      expect(
        await deliveryPage.getByRole("heading", { name: "Render lesson", level: 1 }).isVisible(),
      ).toBe(true);
      expect(
        await deliveryPage.getByRole("link", { name: /Download MP4/i }).first().isVisible(),
      ).toBe(true);
      expect(await deliveryPage.getByText(/View-only share links/i).isVisible()).toBe(true);
    } finally {
      await deliveryPage.close();
    }
  });
});
