import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { StoryboardSceneListEntry } from "@avlp/schemas";
import { expect, it } from "vitest";
import { SceneList } from "./scene-list";
import styles from "./storyboard.module.css";

it("scrolls all seven scenes into the visible panel below its toolbar", async () => {
  const tokens = (await readFile(resolve("app/globals.css"), "utf8")).replace(
    /@import[^;]+;/g,
    "",
  );
  const css = (
    await readFile(
      resolve("app/workspace/[projectId]/storyboard/storyboard.module.css"),
      "utf8",
    )
  ).replace(/\.([a-zA-Z][\w-]*)/g, (selector, name: string) =>
    styles[name] ? `.${styles[name]}` : selector,
  );
  const scenes: StoryboardSceneListEntry[] = Array.from(
    { length: 7 },
    (_, index) => ({
      sceneId: `019ffbf1-a000-7000-8000-${String(index + 1).padStart(12, "0")}`,
      order: index + 1,
      template: "definition",
      title: `Scene ${index + 1}`,
      narrationSummary: "A short explanation of the topic.",
      narrationBlockCount: 1,
      durationSeconds: 30,
      status: {
        assets: "none",
        audio: "not_generated",
        captions: "not_generated",
        validation: "ok",
        stale: false,
      },
    }),
  );
  const list = renderToStaticMarkup(
    createElement(SceneList, {
      scenes,
      selectedSceneId: null,
      stale: false,
      onSelect: () => undefined,
      onReorder: () => undefined,
    }),
  );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 375, height: 667 },
    ]) {
      await page.setViewportSize(viewport);
      await page.setContent(`<style>:root { --font-geist-sans: Arial; --font-geist-mono: monospace; } ${tokens}\n${css}</style>
        <main class="theme-focus-studio" style="padding:16px;background:var(--color-canvas)">
          <aside class="${styles.leftPanel}" style="width:268px">
            <div class="${styles.panelHead}">
              <div class="${styles.panelHeadRow}"><h2 class="${styles.panelTitle}">Scene list</h2><span>7 scenes</span></div>
              <div class="${styles.toolbar}"><label class="${styles.fieldLabel}">Template <select class="${styles.select}"><option>definition</option></select></label>
                <button class="${styles.buttonCompact}">Add</button><button class="${styles.buttonCompact}">Duplicate</button><button class="${styles.buttonCompact}">Delete</button></div>
            </div>
            <div class="${styles.scroller}">${list}</div>
          </aside>
        </main>`);
      const scroller = page.getByRole("listbox", { name: "Storyboard scenes" });
      const panel = page.locator(`.${styles.leftPanel}`);
      const panelBounds = (await panel.boundingBox())!;
      const listBounds = (await scroller.boundingBox())!;
      expect(listBounds.y + listBounds.height).toBeLessThanOrEqual(
        panelBounds.y + panelBounds.height,
      );
      for (const scene of scenes) {
        await scroller.evaluate((element, order) => {
          element.scrollTop = (order - 1) * 88;
        }, scene.order);
        const row = page.getByTestId(`storyboard-scene-${scene.sceneId}`);
        await row.click({ position: { x: 80, y: 40 }, timeout: 2_000 });
        const rowBounds = (await row.boundingBox())!;
        expect(rowBounds.y).toBeGreaterThanOrEqual(listBounds.y);
        expect(rowBounds.y + rowBounds.height).toBeLessThanOrEqual(
          listBounds.y + listBounds.height,
        );
      }
      await mkdir(resolve("../../.runtime-logs/scene-list"), {
        recursive: true,
      });
      await page.screenshot({
        path: resolve(
          `../../.runtime-logs/scene-list/scroll-${viewport.width}.png`,
        ),
      });
    }
  } finally {
    await browser.close();
  }
}, 60_000);
