import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SourceVisualPickerEntry } from "@avlp/schemas";
import { SourceVisualPicker, SourceVisualPickerView } from "./source-visual-picker.js";
import styles from "./storyboard.module.css";

/**
 * ST-093: static-markup accessibility and structure checks for the picker,
 * following the existing `ApprovedAssetPicker`/`VersionBrowser` Playwright
 * pattern in this directory. `SourceVisualPicker` itself only reaches its
 * "loaded" appearance after a browser hydrates and its `useEffect` fetch
 * resolves, which `page.setContent` never runs — so these checks exercise
 * its pre-fetch (loading) markup, and the screenshot suite below drives the
 * presentational `SourceVisualPickerView` directly with concrete entries
 * (the same split `ApprovedAssetPicker` already uses) to capture the
 * loaded, selected-table appearance for real.
 */
const viewports = [
  { label: "desktop (1280px)", width: 1280, height: 900 },
  { label: "tablet (768px)", width: 768, height: 1024 },
  { label: "mobile (375px)", width: 375, height: 812 },
  { label: "200% zoom emulation (640px)", width: 640, height: 800 },
] as const;

describe("SourceVisualPicker", () => {
  for (const viewport of viewports) {
    it(`exposes labelled tabs, search, and a live loading status at ${viewport.label}`, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
        });
        await page.setContent(
          renderToStaticMarkup(
            createElement(SourceVisualPicker, {
              disabled: false,
              onChange: () => {},
              projectId: "019ffbf1-610e-738a-b087-6775ff97568c",
              selectedId: "",
              slot: "diagram",
            }),
          ),
        );
        expect(
          await page.getByRole("tab", { name: "Figures" }).isVisible(),
        ).toBe(true);
        expect(
          await page.getByRole("tab", { name: "Tables" }).isVisible(),
        ).toBe(true);
        expect(
          await page.getByLabel("Search source visuals: diagram").isVisible(),
        ).toBe(true);
        expect(await page.getByRole("status").textContent()).toContain(
          "Loading source visuals",
        );
      } finally {
        await browser.close();
      }
    });
  }

  it("disables the picker and keeps it announced as disabled when the slot is not editable", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      await page.setContent(
        renderToStaticMarkup(
          createElement(SourceVisualPicker, {
            disabled: true,
            onChange: () => {},
            projectId: "019ffbf1-610e-738a-b087-6775ff97568c",
            selectedId: "",
            slot: "diagram",
          }),
        ),
      );
      const fieldset = page.locator('fieldset[aria-label="Source visuals: diagram"]');
      expect(await fieldset.getAttribute("disabled")).not.toBeNull();
    } finally {
      await browser.close();
    }
  });
});

const figureId = "019ffbf1-a100-7000-8000-000000000001";
const tableId = "019ffbf1-a100-7000-8000-000000000002";
const loadedEntries: readonly SourceVisualPickerEntry[] = [
  {
    kind: "figure",
    figureId,
    sectionId: "019ffbf1-a100-7000-8000-000000000003",
    sectionHeading: "Group 1: Alkali metals",
    pageStart: 3,
    caption: "Diagram of alkali metal electron shells",
    altText: "Diagram of alkali metal electron shells",
  },
  {
    kind: "table",
    tableId,
    sectionId: "019ffbf1-a100-7000-8000-000000000004",
    sectionHeading: "Group 1: Alkali metals",
    pageStart: 4,
    columns: ["Element", "Symbol", "Atomic number"],
    rowCount: 4,
  },
];

describe("SourceVisualPicker screenshots — loaded, table selected", () => {
  for (const viewport of viewports) {
    it(`renders the loaded picker with a bound table at ${viewport.label}`, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const tokens = (
          await readFile(resolve("app/globals.css"), "utf8")
        ).replace(/@import[^;]+;/g, "");
        const css = (
          await readFile(
            resolve("app/workspace/[projectId]/storyboard/storyboard.module.css"),
            "utf8",
          )
        ).replace(/\.([a-zA-Z][\w-]*)/g, (selector, name: string) =>
          styles[name] ? `.${styles[name]}` : selector,
        );
        const html = renderToStaticMarkup(
          createElement(SourceVisualPickerView, {
            disabled: false,
            entries: loadedEntries,
            onChange: () => {},
            selectedId: tableId,
            slot: "diagram",
            status: "loaded",
          }),
        );
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: "reduce",
        });
        await page.setContent(
          `<style>:root { --font-geist-sans: Arial; --font-geist-mono: monospace; } ${tokens}\n${css}</style><main class="theme-focus-studio" style="min-height:100vh;background:var(--color-canvas);color:var(--color-text);padding:16px"><div style="max-width:380px;padding:16px;background:var(--color-surface);border-radius:16px">${html}</div></main>`,
        );
        expect(
          await page.getByRole("tab", { name: "Tables", exact: true }).getAttribute("aria-selected"),
        ).toBe("true");
        expect(
          await page.getByLabel("Source visual: diagram").inputValue(),
        ).toBe(tableId);
        const provenance = await page
          .getByTestId("source-visual-provenance-diagram")
          .textContent();
        expect(provenance).toContain("Group 1: Alkali metals");
        await mkdir(resolve("../../.runtime-logs/source-visual-picker"), {
          recursive: true,
        });
        await page.screenshot({
          path: resolve(
            `../../.runtime-logs/source-visual-picker/table-selected-${viewport.width}.png`,
          ),
        });
      } finally {
        await browser.close();
      }
    }, 60_000);
  }
});
