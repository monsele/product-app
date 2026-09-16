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
        projectId: "019ffbf1-eeee-7000-8000-000000000001",
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

  it("names a blocked save's exact prerequisite and links directly to its recovery stage", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(renderToStaticMarkup(createElement(VersionBrowser, {
        projectId: "019ffbf1-eeee-7000-8000-000000000001",
        metadata: null,
        preview: null,
        saveBlockers: [
          { code: "narration_unapproved", message: "Narration is still a draft and must be approved.", recoveryStage: "narration" },
          { code: "storyboard_missing", message: "The storyboard has not been generated yet.", recoveryStage: "storyboard" },
        ],
        restoringVersionId: null,
        saving: false,
        storyboardAvailable: true,
        onPreview: () => {},
        onRestore: () => {},
        onSave: () => {},
      })));
      const alert = page.getByRole("alert");
      expect(await alert.getByText("Narration is still a draft and must be approved.").isVisible()).toBe(true);
      expect(await alert.getByText("The storyboard has not been generated yet.").isVisible()).toBe(true);
      const links = await page.getByRole("link").all();
      expect(await links[0]!.getAttribute("href")).toBe("/workspace/019ffbf1-eeee-7000-8000-000000000001/narration");
      expect(await links[1]!.getAttribute("href")).toBe("/workspace/019ffbf1-eeee-7000-8000-000000000001/storyboard");
    } finally {
      await browser.close();
    }
  });

  it("meets the minimum touch/click target size for the recovery link and save button", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
      await page.setContent(renderToStaticMarkup(createElement(VersionBrowser, {
        projectId: "019ffbf1-eeee-7000-8000-000000000001",
        metadata: null,
        preview: null,
        saveBlockers: [
          { code: "narration_unapproved", message: "Narration is still a draft and must be approved.", recoveryStage: "narration" },
        ],
        restoringVersionId: null,
        saving: false,
        storyboardAvailable: true,
        onPreview: () => {},
        onRestore: () => {},
        onSave: () => {},
      })));
      const linkBox = await page.getByRole("link", { name: "Go to narration" }).boundingBox();
      expect(linkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
      const buttonBox = await page.getByRole("button", { name: "Save version" }).boundingBox();
      expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    } finally {
      await browser.close();
    }
  });

  it("keeps the primary recovery link keyboard-reachable", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(renderToStaticMarkup(createElement(VersionBrowser, {
        projectId: "019ffbf1-eeee-7000-8000-000000000001",
        metadata: null,
        preview: null,
        saveBlockers: [
          { code: "narration_unapproved", message: "Narration is still a draft and must be approved.", recoveryStage: "narration" },
        ],
        restoringVersionId: null,
        saving: false,
        storyboardAvailable: true,
        onPreview: () => {},
        onRestore: () => {},
        onSave: () => {},
      })));
      const link = page.getByRole("link", { name: "Go to narration" });
      const tookFocus = await link.evaluate((node) => {
        (node as HTMLElement).focus();
        return node.ownerDocument.activeElement === node;
      });
      expect(tookFocus).toBe(true);
    } finally {
      await browser.close();
    }
  });

  for (const { label, width, height } of [
    { label: "tablet (768px)", width: 768, height: 1024 },
    { label: "mobile (375px)", width: 375, height: 667 },
    { label: "200% zoom emulation (640px)", width: 640, height: 960 },
  ]) {
    it(`keeps the recovery notice and its actions visible at ${label}`, async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.setContent(renderToStaticMarkup(createElement(VersionBrowser, {
          projectId: "019ffbf1-eeee-7000-8000-000000000001",
          metadata: null,
          preview: null,
          saveBlockers: [
            { code: "narration_unapproved", message: "Narration is still a draft and must be approved.", recoveryStage: "narration" },
            { code: "storyboard_missing", message: "The storyboard has not been generated yet.", recoveryStage: "storyboard" },
          ],
          restoringVersionId: null,
          saving: false,
          storyboardAvailable: true,
          onPreview: () => {},
          onRestore: () => {},
          onSave: () => {},
        })));
        const alert = page.getByRole("alert");
        expect(await alert.isVisible()).toBe(true);
        const saveButton = page.getByRole("button", { name: "Save version" });
        expect(await saveButton.isVisible()).toBe(true);
        const links = await page.getByRole("link").all();
        expect(links).toHaveLength(2);
        for (const link of links) expect(await link.isVisible()).toBe(true);
      } finally {
        await browser.close();
      }
    });
  }

  it("shows no recovery notice when the save is not blocked", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(renderToStaticMarkup(createElement(VersionBrowser, {
        projectId: "019ffbf1-eeee-7000-8000-000000000001",
        metadata: null,
        preview: null,
        saveBlockers: [],
        restoringVersionId: null,
        saving: false,
        storyboardAvailable: true,
        onPreview: () => {},
        onRestore: () => {},
        onSave: () => {},
      })));
      expect(await page.getByRole("alert").count()).toBe(0);
    } finally {
      await browser.close();
    }
  });
});
