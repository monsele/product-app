/**
 * ST-106 — ST-083 accessibility audit for every prompt-to-video run view:
 * WCAG 2 A/AA rules through axe-core (critical and serious findings fail),
 * the same harness as `cross-screen-quality.playwright.test.tsx`. Phone-width
 * layout with the real stylesheets is covered by the hydrated spec,
 * `e2e/one-shot.spec.ts`.
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import axe from "axe-core";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { OneShotRunView } from "@avlp/schemas/one-shot";
import {
  briefView,
  decisionLog,
  projectId,
  runView,
} from "../../../../lib/one-shot-fixtures";
import { soundBedOptions } from "../../../../lib/one-shot";
import { OneShotWorkspace } from "./one-shot-workspace";
import {
  BriefCard,
  CoverageGapNotice,
  DecisionPanel,
  OneShotUnavailable,
} from "./one-shot-views";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: () => undefined, push: () => undefined }),
  usePathname: () => null,
}));

const views: ReadonlyArray<[string, OneShotRunView | null]> = [
  ["request", null],
  ["progress", runView()],
  [
    "needs attention",
    runView({
      status: "needs_attention",
      needsAttention: {
        stage: "outline",
        errorCode: "STAGE_BLOCKED",
        message: "Blocked.",
      },
    }),
  ],
  [
    "not covered",
    runView({
      status: "needs_attention",
      focusCoverage: { status: "not_covered", reason: "Not in the document." },
      needsAttention: {
        stage: "objectives",
        errorCode: "FOCUS_NOT_COVERED",
        message: "Not covered.",
      },
    }),
  ],
  [
    "awaiting approval",
    runView({
      status: "awaiting_render_approval",
      currentStep: "render",
      focusCoverage: { status: "partial", missing: ["Latent heat"] },
    }),
  ],
  ["rendering", runView({ status: "rendering", currentStep: "render" })],
  // ST-107
  ["brief", runView({ status: "brief_ready", currentStep: null, steps: [] })],
  [
    "budget cap",
    runView({
      status: "needs_attention",
      needsAttention: {
        stage: "storyboard",
        errorCode: "ONE_SHOT_BUDGET_CAP",
        message: "The next step would pass the budget.",
      },
      budget: {
        reservedUsd: 1.84,
        capUsd: 2.3,
        actualUsd: 2.1,
        reservationRevision: 1,
        proposedEstimateUsd: 3.25,
      },
    }),
  ],
  [
    "render review failed",
    runView({
      status: "needs_attention",
      currentStep: "render",
      needsAttention: {
        stage: "render",
        errorCode: "RENDER_REVIEW_FAILED",
        message: "The finished video failed its quality review.",
      },
    }),
  ],
];

describe("ST-106 prompt-to-video accessibility (Playwright + axe)", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    await browser.close();
  });

  async function render(ui: React.ReactElement, width: number): Promise<Page> {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
       <meta name="viewport" content="width=device-width, initial-scale=1.0" />
       <title>Prompt-to-video</title></head>
       <body><main>${renderToStaticMarkup(ui)}</main></body></html>`,
      { waitUntil: "domcontentloaded" },
    );
    return page;
  }

  async function seriousViolations(page: Page): Promise<string[]> {
    await page.evaluate(axe.source);
    const results = await page.evaluate(async () => {
      const scope = globalThis as unknown as {
        document: unknown;
        axe: {
          run: (
            node: unknown,
            options: unknown,
          ) => Promise<{ violations: axe.Result[] }>;
        };
      };
      return scope.axe.run(scope.document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        rules: { "color-contrast": { enabled: false } },
      });
    });
    return results.violations
      .filter(
        (violation) =>
          violation.impact === "critical" || violation.impact === "serious",
      )
      .map((violation) => `${violation.id}: ${violation.help}`);
  }

  for (const [name, run] of views)
    it(`has no serious violations in the ${name} view`, async () => {
      const page = await render(
        <OneShotWorkspace
          projectId={projectId}
          projectTitle="Water cycle"
          initial={{
            eligibility: { visible: true, canStart: true, reasons: [] },
            run,
          }}
          documentReady={run !== null}
        />,
        1280,
      );
      try {
        expect(await seriousViolations(page)).toEqual([]);
        // Every interactive control is reachable by keyboard: nothing has a
        // negative tabindex, and every button has an accessible name.
        expect(
          await page
            .locator("[tabindex='-1']:is(button, a, input, textarea)")
            .count(),
        ).toBe(0);
        const unnamed = await page.$$eval(
          "button",
          (buttons) =>
            buttons.filter(
              (button) =>
                (button.textContent ?? "").trim() === "" &&
                !button.getAttribute("aria-label"),
            ).length,
        );
        expect(unnamed).toBe(0);
      } finally {
        await page.close();
      }
    });

  it("has no serious violations in the video brief, the decision log and the coverage gap, at phone width", async () => {
    const brief = briefView();
    const page = await render(
      <div>
        <BriefCard
          brief={brief}
          revisions={{ used: 1, max: 3 }}
          stylePackIds={["essential", "systems", "field-notes"]}
          stylePackId={brief.stylePackId}
          soundBed={brief.soundBed}
          soundBedOptions={soundBedOptions([{ trackId: "morning-pad", title: "Morning Pad" }], brief.soundBed)}
          onStylePackChange={() => undefined}
          onSoundBedChange={() => undefined}
          onEdit={() => undefined}
          onConfirm={() => undefined}
          onCancel={() => undefined}
          confirming={false}
          confirmError={null}
          blockedReason={null}
        />
        <CoverageGapNotice gaps={["How condensation releases it"]} />
        <DecisionPanel state={{ kind: "ready", log: decisionLog }} onExport={() => undefined} />
      </div>,
      390,
    );
    try {
      expect(await seriousViolations(page)).toEqual([]);
      // Every select has a visible label.
      const unlabelled = await page.$$eval(
        "select",
        (selects) =>
          selects.filter((select) => document.querySelector(`label[for="${select.id}"]`) === null).length,
      );
      expect(unlabelled).toBe(0);
    } finally {
      await page.close();
    }
  });

  it("has no serious violations in the unavailable state", async () => {
    const page = await render(
      <OneShotUnavailable projectId={projectId} />,
      390,
    );
    try {
      expect(await seriousViolations(page)).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
