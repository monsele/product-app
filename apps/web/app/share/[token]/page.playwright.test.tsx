import { chromium } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SharedLessonPage from "./page.js";

describe("SharedLessonPage", () => {
  it("renders only a title, optional thumbnail, and view-only video playback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "States of matter",
        thumbnailUrl: "https://media.example.test/thumbnail",
        playbackUrl: "https://media.example.test/playback",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = await chromium.launch({ headless: true });
    try {
      const markup = renderToStaticMarkup(
        await SharedLessonPage({
          params: Promise.resolve({ token: "A".repeat(43) }),
        }),
      );
      const page = await browser.newPage();
      await page.setContent(markup);
      expect(await page.getByRole("heading").textContent()).toBe(
        "States of matter",
      );
      expect(
        await page.getByLabel("Shared lesson video").getAttribute("src"),
      ).toBe("https://media.example.test/playback");
      expect(
        await page.getByLabel("Shared lesson video").getAttribute("poster"),
      ).toBe("https://media.example.test/thumbnail");
      expect(await page.locator("video").count()).toBe(1);
      expect(await page.locator("input, textarea, button").count()).toBe(0);
      expect(await page.locator("text=source").count()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      await browser.close();
    }
  });
});
