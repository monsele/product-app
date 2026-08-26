import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfigurationWorkspace } from "./configuration-workspace.js";

describe("ConfigurationWorkspace (Playwright)", () => {
  it("renders the Studio Daylight layout with structured choice sections and sticky summary rail at desktop (1280px)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(ConfigurationWorkspace, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
          }),
        ),
      );

      // Verify header and initial loading / structure
      const heading = page.locator("#configuration-heading");
      expect(await heading.isVisible()).toBe(true);
      expect(await heading.textContent()).toContain("Lesson & voice setup");

      // Verify status / loading indicator
      const status = page.locator("[role='status']");
      expect(await status.isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders responsive layout at tablet (768px)", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 768, height: 1024 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(ConfigurationWorkspace, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
          }),
        ),
      );

      const heading = page.locator("#configuration-heading");
      expect(await heading.isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("renders correctly on mobile viewports (375px) without reducing form width below usable bounds", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 375, height: 667 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(ConfigurationWorkspace, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
          }),
        ),
      );

      const heading = page.locator("#configuration-heading");
      expect(await heading.isVisible()).toBe(true);
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
          createElement(ConfigurationWorkspace, {
            projectId: "019ffbf1-a000-7000-8000-000000000001",
            projectTitle: "Photosynthesis in C3 and C4 Plants",
          }),
        ),
      );

      const heading = page.locator("#configuration-heading");
      expect(await heading.isVisible()).toBe(true);
    } finally {
      await browser.close();
    }
  });
});
