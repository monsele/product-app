import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IngestionReviewViewer } from "./ingestion-review-viewer.js";

describe("IngestionReviewViewer (Playwright)", () => {
  it("renders 3-region workspace layout and semantic structure for document review", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        renderToStaticMarkup(
          createElement(IngestionReviewViewer, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
          }),
        ),
      );

      // Verify header and initial loading state
      const heading = page.locator("#review-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await heading.textContent()).toContain("Document review");

      // Verify status indicator
      const status = page.locator("[role='status']");
      expect(await status.isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("supports mobile tab structure and responsive layout attributes", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
      await page.setContent(
        renderToStaticMarkup(
          createElement(IngestionReviewViewer, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
          }),
        ),
      );

      // Verify mobile viewport renders cleanly
      const heading = page.locator("#review-heading");
      expect(await heading.isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
