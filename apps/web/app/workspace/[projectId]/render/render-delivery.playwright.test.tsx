import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RenderStatusResponse } from "@avlp/schemas";
import { RenderPanel } from "./render-panel.js";

const mockCompletedRender: RenderStatusResponse = {
  id: "019ffbf1-a000-7000-8000-000000000001",
  lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
  validationRunId: "019ffbf1-c000-7000-8000-000000000003",
  status: "completed",
  progress: 1,
  attempt: 0,
  errorCode: null,
  errorMessage: null,
  retryable: false,
  correlationId: "019ffbf1-d000-7000-8000-000000000004",
  createdAt: "2026-08-26T18:00:00.000Z",
  startedAt: "2026-08-26T18:00:05.000Z",
  completedAt: "2026-08-26T18:01:20.000Z",
  video: {
    id: "019ffbf1-e000-7000-8000-000000000005",
    durationMs: 75_000,
    sizeBytes: 24_500_000,
    width: 1920,
    height: 1080,
    fps: 30,
    videoCodec: "h264",
    audioCodec: "aac",
    storageKey: "projects/p1/renders/r1.mp4",
    thumbnailStorageKey: "projects/p1/renders/r1-thumb.jpg",
    thumbnailUrl: "https://media.example.test/thumbnail.jpg",
  },
};

const mockRenderingRender: RenderStatusResponse = {
  id: "019ffbf1-a000-7000-8000-000000000011",
  lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
  validationRunId: "019ffbf1-c000-7000-8000-000000000003",
  status: "rendering",
  progress: 0.65,
  attempt: 0,
  errorCode: null,
  errorMessage: null,
  retryable: false,
  correlationId: "019ffbf1-d000-7000-8000-000000000004",
  createdAt: "2026-08-26T18:10:00.000Z",
  startedAt: "2026-08-26T18:10:05.000Z",
  completedAt: null,
  video: null,
};

const mockFailedRender: RenderStatusResponse = {
  id: "019ffbf1-a000-7000-8000-000000000021",
  lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
  validationRunId: "019ffbf1-c000-7000-8000-000000000003",
  status: "failed",
  progress: 0.3,
  attempt: 1,
  errorCode: "RENDER_TIMEOUT",
  errorMessage: "Voice audio synthesis timed out after 30 seconds.",
  retryable: true,
  correlationId: "019ffbf1-d000-7000-8000-000000000004",
  createdAt: "2026-08-26T18:15:00.000Z",
  startedAt: "2026-08-26T18:15:05.000Z",
  completedAt: "2026-08-26T18:15:35.000Z",
  video: null,
};

describe("RenderDelivery (Playwright)", () => {
  it("renders Studio Daylight delivery board with dominant completed render at desktop (1280px)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(RenderPanel, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
            lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
            initial: [mockCompletedRender],
          }),
        ),
      );

      // Verify main heading
      const heading = page.locator("#render-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await heading.textContent()).toContain("Render lesson");

      // Verify dominant latest render card
      const latestCard = page.locator("#latest-render-heading");
      expect(await latestCard.isVisible()).toBe(true);

      // Verify specs displayed
      expect(await page.locator("text=1920×1080 (1080p)").isVisible()).toBe(true);
      expect(await page.locator("text=H264 / AAC").isVisible()).toBe(true);

      // Verify Downloads section and exports
      const downloadsHeading = page.locator("#downloads-heading");
      expect(await downloadsHeading.isVisible()).toBe(true);
      expect(
        await page.getByRole("heading", { name: "Production Video (1080p)" }).isVisible(),
      ).toBe(true);
      expect(
        await page.getByRole("heading", { name: "Subtitles (SRT)" }).isVisible(),
      ).toBe(true);
      expect(
        await page.getByRole("heading", { name: "Web Captions (VTT)" }).isVisible(),
      ).toBe(true);
      expect(
        await page.getByRole("heading", { name: "Narration Script" }).isVisible(),
      ).toBe(true);
      expect(
        await page.getByRole("heading", { name: "Storyboard Outline" }).isVisible(),
      ).toBe(true);

      // Verify Share section
      const shareHeading = page.locator("#share-heading");
      expect(await shareHeading.isVisible()).toBe(true);
      expect(
        await page.getByRole("button", { name: "Create and copy share link" }).isVisible(),
      ).toBe(true);

      // Verify delivery context information rail
      expect(await page.locator("text=Delivery Context").isVisible()).toBe(true);
      expect(await page.locator("text=Output Standard").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders in-progress render state with actual progress percentage", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(RenderPanel, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
            lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
            initial: [mockRenderingRender],
          }),
        ),
      );

      expect(await page.locator("text=Rendering (65%)").first().isVisible()).toBe(true);
      expect(await page.getByText("65%", { exact: true }).isVisible()).toBe(true);
      expect(await page.locator("text=Rendering video frames…").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders retryable failed render state with retry action", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(RenderPanel, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
            lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
            initial: [mockFailedRender],
          }),
        ),
      );

      expect(await page.locator("text=Failed").first().isVisible()).toBe(true);
      expect(
        await page
          .locator("text=Voice audio synthesis timed out after 30 seconds.")
          .first()
          .isVisible(),
      ).toBe(true);
      expect(
        await page.getByRole("button", { name: "Retry render" }).first().isVisible(),
      ).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders properly on tablet viewports (768px)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 768, height: 1024 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(RenderPanel, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
            lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
            initial: [mockCompletedRender],
          }),
        ),
      );

      const heading = page.locator("#render-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await page.locator("#latest-render-heading").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders properly on mobile viewports (375px)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 375, height: 667 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(RenderPanel, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
            lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
            initial: [mockCompletedRender],
          }),
        ),
      );

      const heading = page.locator("#render-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await page.locator("#latest-render-heading").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders properly under 200% zoom emulation (640px)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 640, height: 960 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(RenderPanel, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
            lessonVersionId: "019ffbf1-b000-7000-8000-000000000002",
            initial: [mockCompletedRender],
          }),
        ),
      );

      const heading = page.locator("#render-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await page.locator("#latest-render-heading").isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
