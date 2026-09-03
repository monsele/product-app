import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  IllustrationContactSheet,
  type ContactSheetScene,
} from "./illustration-contact-sheet.js";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(
  require.resolve("axe-core/axe.min.js"),
  "utf8",
);

const baseCandidate = {
  jobId: "019ffbf1-eeee-7000-8000-0000000000aa",
  moderationStatus: "approved" as const,
  provenance: "ai_generated" as const,
  provider: "mock-illustration",
  promptVersion: "v1",
  previewUrl: null,
  altText: "AI illustration for the backdrop slot of scene 1 — Photosynthesis",
  costUsd: 0.02,
  failureCode: null as string | null,
};

const scenes: readonly ContactSheetScene[] = [
  {
    sceneId: "019ffbf1-eeee-7000-8000-000000000050",
    order: 1,
    title: "Photosynthesis",
    template: "definition",
    sceneRevision: 4,
    advisories: [
      {
        code: "scene_monotony",
        message: 'Scenes 1–3 all use the "definition" template.',
        source: "deterministic",
        rulesetVersion: "3",
        model: null,
      },
    ],
    slots: [
      {
        slot: "backdrop",
        visualRole: "decorative",
        visualRolePermits: "A generated illustration is a free editorial choice.",
        required: false,
        candidates: [
          {
            ...baseCandidate,
            id: "cand-review",
            status: "pending_review",
            selectable: true,
            blockedReason: null,
            blockedDetail: null,
          },
          {
            ...baseCandidate,
            id: "cand-failed",
            status: "failed",
            moderationStatus: "rejected",
            failureCode: "ILLUSTRATION_GENERATION_FAILED",
            selectable: false,
            blockedReason: "generation_failed",
            blockedDetail: "Generation did not produce a usable image.",
          },
        ],
      },
    ],
  },
];

/** Render the fragment inside the Focus Studio canvas it ships on. */
function focusStudioDocument(markup: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#18131F;color:#F4F1F8">${markup}</body></html>`;
}

async function setup() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(
    focusStudioDocument(
      renderToStaticMarkup(
        createElement(IllustrationContactSheet, {
          scenes,
          rulesetVersion: "3",
          busyCandidateId: null,
          actionError: null,
          onAccept: () => undefined,
          onReject: () => undefined,
        }),
      ),
    ),
  );
  return { browser, page };
}

describe("IllustrationContactSheet accessibility and keyboard operation", () => {
  it("blocks a failed candidate from selection by pointer and by keyboard", async () => {
    const { browser, page } = await setup();
    try {
      const blockedCard = page.locator('[data-testid="candidate-cand-failed"]');
      const useThis = blockedCard.getByRole("button", { name: "Use this" });
      expect(await useThis.isDisabled()).toBe(true);
      // A disabled button cannot take keyboard focus, so it cannot be activated.
      const tookFocus = await useThis.evaluate((node) => {
        (node as HTMLElement).focus();
        return node.ownerDocument.activeElement === node;
      });
      expect(tookFocus).toBe(false);

      const reviewCard = page.locator('[data-testid="candidate-cand-review"]');
      expect(
        await reviewCard.getByRole("button", { name: "Use this" }).isDisabled(),
      ).toBe(false);
    } finally {
      await browser.close();
    }
  });

  it("keeps selection enabled on scenes that carry an advisory", async () => {
    const { browser, page } = await setup();
    try {
      expect(await page.getByRole("note").first().isVisible()).toBe(true);
      expect(
        await page
          .locator('[data-testid="candidate-cand-review"]')
          .getByRole("button", { name: "Use this" })
          .isDisabled(),
      ).toBe(false);
    } finally {
      await browser.close();
    }
  });

  it("exposes alt text on every rendered candidate image target", async () => {
    const { browser, page } = await setup();
    try {
      // The reviewable candidate has a preview image; assert its alt text.
      await page.setContent(
        renderToStaticMarkup(
          createElement(IllustrationContactSheet, {
            scenes: [
              {
                ...scenes[0]!,
                slots: [
                  {
                    ...scenes[0]!.slots[0]!,
                    candidates: [
                      {
                        ...baseCandidate,
                        id: "cand-image",
                        status: "pending_review",
                        selectable: true,
                        blockedReason: null,
                        blockedDetail: null,
                        previewUrl: "https://example.test/x.png",
                      },
                    ],
                  },
                ],
              },
            ],
            rulesetVersion: "3",
            busyCandidateId: null,
            actionError: null,
            onAccept: () => undefined,
            onReject: () => undefined,
          }),
        ),
      );
      expect(
        await page.getByAltText(/AI illustration for the backdrop slot/).count(),
      ).toBe(1);
    } finally {
      await browser.close();
    }
  });

  it("has no serious or critical axe violations", async () => {
    const { browser, page } = await setup();
    try {
      await page.addScriptTag({ content: axeSource });
      const results = (await page.evaluate(async () => {
        const globalWindow = window as unknown as {
          axe: {
            run: (
              context: unknown,
              options: unknown,
            ) => Promise<{
              violations: { id: string; impact: string | null }[];
            }>;
          };
          document: unknown;
        };
        return globalWindow.axe.run(globalWindow.document, {
          runOnly: ["wcag2a", "wcag2aa"],
        });
      })) as { violations: { id: string; impact: string | null }[] };
      // Rules that only fail because `setContent` renders a fragment with no
      // document shell (no <html lang>, <main>, or <h1> owner) rather than
      // anything the component controls.
      const shellRules = new Set([
        "html-has-lang",
        "landmark-one-main",
        "page-has-heading-one",
        "region",
        "document-title",
      ]);
      const blocking = results.violations.filter(
        (violation) =>
          !shellRules.has(violation.id) &&
          (violation.impact === "serious" || violation.impact === "critical"),
      );
      expect(blocking).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});
