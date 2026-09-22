/**
 * ST-102 — the creative style pack selector, measured in a real browser.
 *
 * Same pattern as `video-approach-selector.playwright.test.tsx`: server-rendered
 * markup plus Playwright, verifying the control is a genuine radio group with
 * every option present (unlike the video approach control, this one is
 * generally available and has no server eligibility gate to honor).
 */

import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CreativeStylePackSelector,
  creativeStylePackOptions,
} from "./creative-style-pack-selector.js";

async function withPage(
  markup: string,
  assertions: (page: import("@playwright/test").Page) => Promise<void>,
): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(markup);
    await assertions(page);
  } finally {
    await browser.close();
  }
}

describe("CreativeStylePackSelector (Playwright)", () => {
  it("is an accessible radio group with all seven options, the default selected", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(CreativeStylePackSelector, {
          disabled: false,
          onChange: () => undefined,
          value: null,
        }),
      ),
      async (page) => {
        const group = page.locator("[role='radiogroup'][aria-label='Visual theme']");
        expect(await group.count()).toBe(1);
        const radios = page.locator("[role='radio']");
        expect(await radios.count()).toBe(creativeStylePackOptions.length);
        expect(await radios.nth(0).getAttribute("aria-checked")).toBe("true");
        expect(await radios.nth(0).textContent()).toContain(
          "Warm editorial (Daylight Standard)",
        );
        for (let index = 1; index < creativeStylePackOptions.length; index += 1)
          expect(await radios.nth(index).getAttribute("aria-checked")).toBe(
            "false",
          );
      },
    );
  });

  it("shows a chosen pack as selected", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(CreativeStylePackSelector, {
          disabled: false,
          onChange: () => undefined,
          value: "systems",
        }),
      ),
      async (page) => {
        const radios = page.locator("[role='radio']");
        const systemsIndex = creativeStylePackOptions.findIndex(
          (option) => option.value === "systems",
        );
        expect(
          await radios.nth(systemsIndex).getAttribute("aria-checked"),
        ).toBe("true");
        expect(await radios.nth(0).getAttribute("aria-checked")).toBe("false");
      },
    );
  });

  it("disables every option while a save is in flight", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(CreativeStylePackSelector, {
          disabled: true,
          onChange: () => undefined,
          value: null,
        }),
      ),
      async (page) => {
        const radios = page.locator("[role='radio']");
        for (let index = 0; index < (await radios.count()); index += 1)
          expect(await radios.nth(index).isDisabled()).toBe(true);
      },
    );
  });
});
