import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SceneAudioPanel } from "./scene-audio-panel";
import styles from "./storyboard.module.css";

it("keeps the styled audio action visible, keyboard accessible and within narrow screens", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
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
    const html = renderToStaticMarkup(
      createElement(SceneAudioPanel, {
        projectId: "019ffbf1-a000-7000-8000-000000000001",
        sceneId: "019ffbf1-a000-7000-8000-000000000002",
        disabled: false,
      }),
    );
    const page = await browser.newPage({ reducedMotion: "reduce" });
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.setContent(
        `<style>:root { --font-geist-sans: Arial; --font-geist-mono: monospace; } ${tokens}\n${css}</style><main class="theme-focus-studio ${styles.panel}" style="min-height:100vh;background:var(--color-canvas);color:var(--color-text)"><div class="${styles.rightPanel}" style="max-width:380px;padding:16px;background:var(--color-surface);border-radius:16px">${html}</div></main>`,
      );
      const button = page.getByRole("button", { name: "Generate audio" });
      expect(await button.isVisible()).toBe(true);
      expect(
        await button.evaluate(
          (element) => globalThis.getComputedStyle(element).backgroundColor,
        ),
      ).not.toBe("rgba(0, 0, 0, 0)");
      const bounds = await button.boundingBox();
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await button.focus();
      expect(
        await button.evaluate(
          (element) => element === globalThis.document.activeElement,
        ),
      ).toBe(true);
      expect(
        await button.evaluate(
          (element) => globalThis.getComputedStyle(element).outlineStyle,
        ),
      ).toBe("solid");
      await mkdir(resolve("../../.runtime-logs/audio-first"), {
        recursive: true,
      });
      await page.screenshot({
        path: resolve(`../../.runtime-logs/audio-first/audio-${width}.png`),
      });
    }
  } finally {
    await browser.close();
  }
}, 60_000);
