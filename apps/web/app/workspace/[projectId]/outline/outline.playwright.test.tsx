import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OutlinePanel } from "./outline-panel.js";

// The panel calls useRouter() to refresh the server-rendered pipeline rail
// after approval. These tests render it with renderToStaticMarkup, which has
// no app-router context, so the hook needs a stub.
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => undefined,
    push: () => undefined,
    replace: () => undefined,
  }),
}));

describe("OutlinePanel (Playwright)", () => {
  it(
    "renders Studio Daylight outline editor at desktop (1280px)",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 800 },
        });
        await page.setContent(
          renderToStaticMarkup(
            createElement(OutlinePanel, {
              projectId: "019ffbf1-a000-7000-8000-000000000001",
              projectTitle: "Photosynthesis in C3 and C4 Plants",
            }),
          ),
        );

        const heading = page.locator("h1");
        expect(await heading.isVisible()).toBe(true);
        expect(await heading.textContent()).toContain("Lesson outline");

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
            createElement(OutlinePanel, {
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
            createElement(OutlinePanel, {
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
            createElement(OutlinePanel, {
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
