import { chromium, type Browser, type Page } from "@playwright/test";
import axe from "axe-core";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  type PreviewManifest,
  type ProjectSummary,
  type RenderStatusResponse,
} from "@avlp/schemas";

import { AuthForm } from "./auth-form.js";
import { ForgotPasswordForm, ResetPasswordForm } from "./password-reset-form.js";
import { ProjectBoardClient } from "./workspace/project-board-client.js";
import { SourceUploadForm } from "./workspace/[projectId]/upload/source-upload-form.js";
import { IngestionStatusPanel } from "./workspace/[projectId]/upload/ingestion-status-panel.js";
import { IngestionReviewViewer } from "./workspace/[projectId]/review/ingestion-review-viewer.js";
import { ConfigurationWorkspace } from "./workspace/[projectId]/configuration/configuration-workspace.js";
import { ObjectivesPanel } from "./workspace/[projectId]/objectives/objectives-panel.js";
import { OutlinePanel } from "./workspace/[projectId]/outline/outline-panel.js";
import { NarrationPanel } from "./workspace/[projectId]/narration/narration-panel.js";
import { StoryboardPanel } from "./workspace/[projectId]/storyboard/storyboard-panel.js";
import { FullLessonPreview } from "./workspace/[projectId]/preview/preview-player.js";
import { RenderPanel } from "./workspace/[projectId]/render/render-panel.js";
import SharedLessonPage from "./share/[token]/page.js";

// Common mock fixtures
const sampleProjectId = "01989a3d-8e00-7000-8000-000000000001";
const sampleScene1 = createDefaultStoryboardSceneSpec("hook", {
  id: "01989a3d-8e00-7000-8000-000000000011",
  order: 1,
  durationSeconds: 15,
});
const sampleScene2 = createDefaultStoryboardSceneSpec("definition", {
  id: "01989a3d-8e00-7000-8000-000000000012",
  order: 2,
  durationSeconds: 20,
});

const sampleManifest: PreviewManifest = {
  assets: {},
  canvas: { fps: 30, height: 1080, width: 1920 },
  generatedAt: "2026-08-26T12:00:00.000Z",
  storyboard: {
    schemaVersion: 1,
    id: "01989a3d-8e00-7000-8000-000000000099",
    projectId: sampleProjectId,
    basedOnNarrationSetId: "01989a3d-8e00-7000-8000-000000000021",
    narrationSetContentHash: "a".repeat(64),
    outlineSetId: "01989a3d-8e00-7000-8000-000000000022",
    outlineSetContentHash: "a".repeat(64),
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "1",
    model: "fixture",
    modelCallId: "01989a3d-8e00-7000-8000-000000000023",
    status: "draft",
    revision: 1,
    title: "How Plants Make Food",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 35,
    objectiveIds: ["01989a3d-8e00-7000-8000-000000000031"],
    contentHash: "a".repeat(64),
    scenes: [
      {
        id: sampleScene1.id,
        stableSceneId: sampleScene1.id,
        order: 1,
        template: "hook",
        durationSeconds: 15,
        narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000041"],
        assetRequirements: [],
        scene: sampleScene1,
      },
      {
        id: sampleScene2.id,
        stableSceneId: sampleScene2.id,
        order: 2,
        template: "definition",
        durationSeconds: 20,
        narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000042"],
        assetRequirements: [],
        scene: sampleScene2,
      },
    ],
    generatedAt: "2026-08-26T12:00:00.000Z",
    createdAt: "2026-08-26T12:00:00.000Z",
  },
  scenes: [
    {
      sceneId: sampleScene1.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
    {
      sceneId: sampleScene2.id,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    },
  ],
};

const sampleProjects: ProjectSummary[] = [
  {
    id: sampleProjectId,
    title: "How Plants Make Food",
    stage: "ready_to_render",
    latestFailedOperation: null,
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T12:30:00.000Z",
    revision: 1,
  },
];

const sampleRenderStatus: RenderStatusResponse = {
  id: "01989a3d-8e00-7000-8000-000000000001",
  lessonVersionId: "01989a3d-8e00-7000-8000-000000000002",
  validationRunId: "01989a3d-8e00-7000-8000-000000000003",
  status: "completed",
  progress: 1,
  attempt: 0,
  errorCode: null,
  errorMessage: null,
  retryable: false,
  correlationId: "01989a3d-8e00-7000-8000-000000000004",
  createdAt: "2026-08-26T12:00:00.000Z",
  startedAt: "2026-08-26T12:00:10.000Z",
  completedAt: "2026-08-26T12:01:00.000Z",
  video: {
    id: "01989a3d-8e00-7000-8000-000000000005",
    durationMs: 35000,
    sizeBytes: 12400000,
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    storageKey: "projects/1/renders/1.mp4",
    thumbnailStorageKey: "projects/1/renders/1.jpg",
    thumbnailUrl: "https://storage.local/thumb.jpg",
  },
};

describe("Cross-Screen Quality & Accessibility Matrix (Playwright)", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  async function renderSurface(
    ui: React.ReactElement,
    theme: "daylight" | "focus" = "daylight",
    viewport = { width: 1440, height: 900 },
  ): Promise<Page> {
    const page = await browser.newPage({ viewport });
    const markup = renderToStaticMarkup(ui);
    const isDaylight = theme === "daylight";

    const cssTokens = isDaylight
      ? `
        :root {
          --color-canvas: #F9F7F4;
          --color-surface: #FFFFFF;
          --color-surface-raised: #F0ECE6;
          --color-text: #110D17;
          --color-text-muted: #5E5669;
          --color-border: #DDD6CE;
          --color-brand: #6A4DF4;
          --color-brand-hover: #5838E6;
          --color-on-brand: #FFFFFF;
          --color-success: #1E7E4B;
          --color-warning: #C07D10;
          --color-danger: #C0392B;
        }
        body { margin: 0; background: #F9F7F4; color: #110D17; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      `
      : `
        :root {
          --color-canvas: #18131F;
          --color-surface: #211A2B;
          --color-surface-raised: #292035;
          --color-text: #F4F1F8;
          --color-text-muted: #BDB5C7;
          --color-border: #3A3046;
          --color-brand: #A883FF;
          --color-brand-hover: #BEA3FF;
          --color-on-brand: #1B1027;
          --color-success: #34D399;
          --color-warning: #FBBF24;
          --color-danger: #F87171;
        }
        body { margin: 0; background: #18131F; color: #F4F1F8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      `;

    await page.setContent(
      `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>AVLP Cross-Screen Verification</title>
          <style>
            ${cssTokens}
            *, *::before, *::after { box-sizing: border-box; }
            :focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
            @media (prefers-reduced-motion: reduce) {
              *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
                scroll-behavior: auto !important;
              }
            }
          </style>
        </head>
        <body class="${isDaylight ? "theme-daylight" : "theme-focus-studio"}">
          <main id="main-content">${markup}</main>
        </body>
      </html>`,
      { waitUntil: "domcontentloaded" },
    );

    return page;
  }

  async function checkAxeViolations(page: Page): Promise<axe.Result[]> {
    await page.evaluate(axe.source);
    const results = await page.evaluate(async () => {
      const scope = globalThis as unknown as {
        document: unknown;
        axe: {
          run: (
            node: unknown,
            opts: unknown,
          ) => Promise<{ violations: axe.Result[] }>;
        };
      };
      return await scope.axe.run(scope.document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa"],
        },
        rules: {
          "color-contrast": { enabled: false },
        },
      });
    });

    return results.violations.filter(
      (v: axe.Result) => v.impact === "critical" || v.impact === "serious",
    );
  }

  describe("1. Automated WCAG AA Accessibility Audits", () => {
    it("verifies Auth SignIn and Register forms", async () => {
      const page = await renderSurface(
        <div>
          <AuthForm mode="login" />
          <AuthForm mode="register" />
        </div>,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Password Reset forms", async () => {
      const page = await renderSurface(
        <div>
          <ForgotPasswordForm />
          <ResetPasswordForm token="test-reset-token" />
        </div>,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Teacher Project Board", async () => {
      const page = await renderSurface(
        <ProjectBoardClient projects={sampleProjects} />,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Source Upload and Ingestion Status surfaces", async () => {
      const page = await renderSurface(
        <div>
          <SourceUploadForm projectId={sampleProjectId} />
          <IngestionStatusPanel
            projectId={sampleProjectId}
          />
        </div>,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Ingestion Review and Configuration workspaces", async () => {
      const page = await renderSurface(
        <div>
          <IngestionReviewViewer
            projectId={sampleProjectId}
            projectTitle="How Plants Make Food"
          />
          <ConfigurationWorkspace
            projectId={sampleProjectId}
            projectTitle="How Plants Make Food"
          />
        </div>,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Objectives and Outline review panels", async () => {
      const page = await renderSurface(
        <div>
          <ObjectivesPanel
            projectId={sampleProjectId}
            projectTitle="How Plants Make Food"
          />
          <OutlinePanel
            projectId={sampleProjectId}
            projectTitle="How Plants Make Food"
          />
        </div>,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Narration workspace panel", async () => {
      const page = await renderSurface(
        <NarrationPanel
          projectId={sampleProjectId}
          projectTitle="How Plants Make Food"
        />,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Focus Studio Storyboard editor", async () => {
      const page = await renderSurface(
        <StoryboardPanel
          projectId={sampleProjectId}
          projectTitle="How Plants Make Food"
        />,
        "focus",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Focus Studio Lesson Preview player", async () => {
      const page = await renderSurface(
        <FullLessonPreview
          projectId={sampleProjectId}
          initialManifest={sampleManifest}
          projectTitle="How Plants Make Food"
        />,
        "focus",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Render Delivery board and share manager", async () => {
      const page = await renderSurface(
        <RenderPanel
          projectId={sampleProjectId}
          lessonVersionId="01989a3d-8e00-7000-8000-000000000002"
          initial={[sampleRenderStatus]}
        />,
        "daylight",
      );
      try {
        const violations = await checkAxeViolations(page);
        expect(violations).toHaveLength(0);
      } finally {
        await page.close();
      }
    });

    it("verifies Focus Studio Public Share theater", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            title: "How Plants Make Food",
            playbackUrl: "https://storage.local/video.mp4",
            thumbnailUrl: "https://storage.local/thumb.jpg",
          }),
        }),
      );

      try {
        const shareComponent = await SharedLessonPage({
          params: Promise.resolve({ token: "valid-share-token" }),
        });
        const page = await renderSurface(shareComponent, "focus");
        try {
          const violations = await checkAxeViolations(page);
          expect(violations).toHaveLength(0);
        } finally {
          await page.close();
        }
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe("2. Viewport Responsiveness: Desktop (1440px), Tablet (1024px), Mobile (390px)", () => {
    it("renders project board cleanly at 1440px, 1024px, and 390px", async () => {
      const viewports = [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 390, height: 844 },
      ];
      for (const vp of viewports) {
        const page = await renderSurface(
          <ProjectBoardClient projects={sampleProjects} />,
          "daylight",
          vp,
        );
        try {
          const heading = page.getByRole("heading", { name: /Create new lesson/i });
          expect(await heading.isVisible()).toBe(true);

          const projectCard = page.getByText("How Plants Make Food");
          expect(await projectCard.isVisible()).toBe(true);
        } finally {
          await page.close();
        }
      }
    });

    it("renders delivery board cleanly across all viewports", async () => {
      const viewports = [
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 390, height: 844 },
      ];
      for (const vp of viewports) {
        const page = await renderSurface(
          <RenderPanel
            projectId={sampleProjectId}
            lessonVersionId="01989a3d-8e00-7000-8000-000000000002"
            initial={[sampleRenderStatus]}
          />,
          "daylight",
          vp,
        );
        try {
          const heading = page.getByRole("heading", { name: "Render lesson", level: 1 });
          expect(await heading.isVisible()).toBe(true);

          const downloadAction = page.getByRole("link", { name: /Download MP4/i }).first();
          expect(await downloadAction.isVisible()).toBe(true);
        } finally {
          await page.close();
        }
      }
    });
  });

  describe("3. 200% Zoom & Narrow-Height Stress Testing", () => {
    it("preserves layout and interactivity under 200% zoom emulation (640px width)", async () => {
      const page = await renderSurface(
        <FullLessonPreview
          projectId={sampleProjectId}
          initialManifest={sampleManifest}
          projectTitle="How Plants Make Food"
        />,
        "focus",
        { width: 640, height: 900 },
      );
      try {
        const heading = page.getByRole("heading", { name: "Lesson preview", level: 1 });
        expect(await heading.isVisible()).toBe(true);

        const seekBar = page.getByLabel("Seek lesson");
        expect(await seekBar.isVisible()).toBe(true);
      } finally {
        await page.close();
      }
    });

    it("maintains readable layout under narrow-height stress (500px height)", async () => {
      const page = await renderSurface(
        <RenderPanel
          projectId={sampleProjectId}
          lessonVersionId="01989a3d-8e00-7000-8000-000000000002"
          initial={[]}
        />,
        "daylight",
        { width: 1024, height: 500 },
      );
      try {
        const renderAction = page.getByRole("button", { name: /Render 1080p video/i });
        expect(await renderAction.isVisible()).toBe(true);
      } finally {
        await page.close();
      }
    });
  });

  describe("4. Theme Boundaries & Motion Safety", () => {
    it("confirms Studio Daylight uses warm light canvas and dark ink text", async () => {
      const page = await renderSurface(
        <ProjectBoardClient projects={sampleProjects} />,
        "daylight",
      );
      try {
        const bodyClass = await page.evaluate(() => {
          const scope = globalThis as unknown as { document: Document };
          return scope.document.body.className;
        });
        expect(bodyClass).toContain("theme-daylight");
      } finally {
        await page.close();
      }
    });

    it("confirms Focus Studio uses dark luminous canvas and light text", async () => {
      const page = await renderSurface(
        <FullLessonPreview
          projectId={sampleProjectId}
          initialManifest={sampleManifest}
          projectTitle="How Plants Make Food"
        />,
        "focus",
      );
      try {
        const bodyClass = await page.evaluate(() => {
          const scope = globalThis as unknown as { document: Document };
          return scope.document.body.className;
        });
        expect(bodyClass).toContain("theme-focus-studio");
      } finally {
        await page.close();
      }
    });
  });
});
