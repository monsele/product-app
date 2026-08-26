import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NarrationPanel } from "./narration-panel.js";

describe("NarrationPanel (Playwright)", () => {
  it(
    "renders Studio Daylight narration editor at desktop (1280px)",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 800 },
        });
        await page.setContent(
          renderToStaticMarkup(
            createElement(NarrationPanel, {
              projectId: "019ffbf1-a000-7000-8000-000000000001",
              projectTitle: "Photosynthesis in C3 and C4 Plants",
            }),
          ),
        );

        const heading = page.locator("h1");
        expect(await heading.isVisible()).toBe(true);
        expect(await heading.textContent()).toContain("Narration script");

        const status = page.locator("[role='status']");
        expect(await status.isVisible()).toBe(true);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it(
    "renders properly on tablet viewports (768px)",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 768, height: 1024 },
        });
        await page.setContent(
          renderToStaticMarkup(
            createElement(NarrationPanel, {
              projectId: "019ffbf1-a000-7000-8000-000000000001",
              projectTitle: "Photosynthesis in C3 and C4 Plants",
            }),
          ),
        );

        const heading = page.locator("h1");
        expect(await heading.isVisible()).toBe(true);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it(
    "renders properly on mobile viewports (375px)",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 375, height: 667 },
        });
        await page.setContent(
          renderToStaticMarkup(
            createElement(NarrationPanel, {
              projectId: "019ffbf1-a000-7000-8000-000000000001",
              projectTitle: "Photosynthesis in C3 and C4 Plants",
            }),
          ),
        );

        const heading = page.locator("h1");
        expect(await heading.isVisible()).toBe(true);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it(
    "renders properly under 200% zoom emulation (640px)",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 640, height: 960 },
        });
        await page.setContent(
          renderToStaticMarkup(
            createElement(NarrationPanel, {
              projectId: "019ffbf1-a000-7000-8000-000000000001",
              projectTitle: "Photosynthesis in C3 and C4 Plants",
            }),
          ),
        );

        const heading = page.locator("h1");
        expect(await heading.isVisible()).toBe(true);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
