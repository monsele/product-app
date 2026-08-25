import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VersionBrowser } from "./version-browser.js";

describe("VersionBrowser", () => {
  it("shows metadata and permits restoration only for historic versions", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(renderToStaticMarkup(createElement(VersionBrowser, {
        metadata: { count: 2, latestModifiedAt: "2026-08-23T00:00:00.000Z", currentVersionId: "019ffbf1-eeee-7000-8000-000000000045", versions: [{ id: "019ffbf1-eeee-7000-8000-000000000045", versionNumber: 2, reason: "explicit_save", createdAt: "2026-08-23T00:00:00.000Z" }, { id: "019ffbf1-eeee-7000-8000-000000000044", versionNumber: 1, reason: "approval", createdAt: "2026-08-22T00:00:00.000Z" }] },
        preview: { id: "019ffbf1-eeee-7000-8000-000000000044", durationSeconds: 180, sceneCount: 6, schemaVersion: "lesson-version-v1" }, restoringVersionId: null, saving: false, storyboardAvailable: true, onPreview: () => {}, onRestore: () => {}, onSave: () => {},
      })));
      expect(await page.getByText("Version 1 (approval)").isVisible()).toBe(true);
      expect(await page.getByText("6 scenes, 180 seconds").isVisible()).toBe(true);
      expect(await page.getByRole("button", { name: "Restore" }).first().isDisabled()).toBe(true);
      expect(await page.getByRole("button", { name: "Restore" }).last().isDisabled()).toBe(false);
    } finally {
      await browser.close();
    }
  });
});
