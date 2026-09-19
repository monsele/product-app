/**
 * ST-096 — the approach selector, measured in a real browser.
 *
 * Server-rendered markup plus Playwright, like the other component checks in
 * this directory. What is being verified is the part a unit assertion cannot
 * see: that the control is a real radio group, that the experimental option is
 * genuinely absent rather than merely styled away when the server has not
 * offered it, and that a refusal reaches the page as readable text with a way
 * forward rather than as a disabled button and silence.
 */

import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DemonstrationEligibility } from "@avlp/schemas/demonstration-pilot";
import { VideoApproachSelector } from "./video-approach-selector.js";

const eligible: DemonstrationEligibility = {
  experimentVersion: "st-096-pilot-1",
  reasons: [],
  recipes: [],
  selectable: true,
  supportedTestLesson: null,
  visible: true,
};

const unsupported: DemonstrationEligibility = {
  experimentVersion: "st-096-pilot-1",
  reasons: [
    {
      code: "no_registered_recipe",
      message:
        "No registered demonstration recipe explains this lesson's content.",
      suggestedCorrection:
        "Open one of the supported test lessons to compare the two approaches, or keep this lesson on the standard explanation.",
    },
  ],
  recipes: [],
  selectable: false,
  supportedTestLesson: {
    label: "Saving a little, every week",
    projectId: null,
    subject: "savings",
  },
  visible: true,
};

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

describe("VideoApproachSelector (Playwright)", () => {
  it("is an accessible radio group with the standard option selected by default", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(VideoApproachSelector, {
          disabled: false,
          eligibility: eligible,
          onChange: () => undefined,
          value: "standard" as const,
        }),
      ),
      async (page) => {
        const group = page.locator("[role='radiogroup'][aria-label='Video approach']");
        expect(await group.count()).toBe(1);
        const radios = page.locator("[role='radio']");
        expect(await radios.count()).toBe(2);
        expect(await radios.nth(0).getAttribute("aria-checked")).toBe("true");
        expect(await radios.nth(1).getAttribute("aria-checked")).toBe("false");
        // Each option states what it does, not just what it is called.
        expect(await radios.nth(0).textContent()).toContain(
          "scene templates",
        );
        expect(await radios.nth(1).textContent()).toContain("Experimental");
        expect(await radios.nth(1).textContent()).toContain("changing state");
      },
    );
  });

  it("does not render the experimental option at all when the server has not offered it", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(VideoApproachSelector, {
          disabled: false,
          eligibility: null,
          onChange: () => undefined,
          value: "standard" as const,
        }),
      ),
      async (page) => {
        const radios = page.locator("[role='radio']");
        expect(await radios.count()).toBe(1);
        expect(await page.locator("text=Experimental").count()).toBe(0);
      },
    );
  });

  it("disables the experimental option and explains why, with a way forward", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(VideoApproachSelector, {
          disabled: false,
          eligibility: unsupported,
          onChange: () => undefined,
          onOpenTestLesson: async () => undefined,
          value: "standard" as const,
        }),
      ),
      async (page) => {
        const experimental = page.locator("[role='radio']").nth(1);
        expect(await experimental.getAttribute("aria-disabled")).toBe("true");
        expect(await experimental.isDisabled()).toBe(true);

        const status = page.locator("[role='status']");
        expect(await status.isVisible()).toBe(true);
        const text = (await status.textContent()) ?? "";
        expect(text).toContain("No registered demonstration recipe");
        // A reason without a recovery is the dead end this exists to prevent.
        expect(text).toContain("Open one of the supported test lessons");
        expect(
          await page
            .locator("text=Open supported test lesson: Saving a little, every week")
            .count(),
        ).toBe(1);
      },
    );
  });

  it("shows the experimental option as chosen when it is the saved value", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(VideoApproachSelector, {
          disabled: false,
          eligibility: eligible,
          onChange: () => undefined,
          value: "demonstration" as const,
        }),
      ),
      async (page) => {
        const radios = page.locator("[role='radio']");
        expect(await radios.nth(0).getAttribute("aria-checked")).toBe("false");
        expect(await radios.nth(1).getAttribute("aria-checked")).toBe("true");
      },
    );
  });

  it("disables every option while a save is in flight", async () => {
    await withPage(
      renderToStaticMarkup(
        createElement(VideoApproachSelector, {
          disabled: true,
          eligibility: eligible,
          onChange: () => undefined,
          value: "standard" as const,
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
