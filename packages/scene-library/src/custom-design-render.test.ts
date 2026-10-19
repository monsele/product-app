import { Buffer } from "node:buffer";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { chromium, type Browser } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  customFixtureManifest,
  customFixtureScenes,
  customFixtureFontId,
} from "./custom-design.fixture.js";
import {
  startHarnessServer,
  type HarnessServer,
} from "./style-proof/harness-server.js";
import type { CustomFixtureProps } from "./custom-design.fixture-composition.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourceTableVisualSchema } from "@avlp/schemas";
import { customFontFamily, resolveCustomIdentity } from "./custom-design.js";
import { SourceTable } from "./cinema/primitives.js";

const output = fileURLToPath(
  new URL("../../../output/st123/", import.meta.url),
);
let serveUrl: string;
let browser: Browser;
let harness: HarnessServer;
let font: Buffer;
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
/** Box averages retain geometry while excluding per-platform glyph-edge noise. */
function visualSignature(frame: PNG): PNG {
  const result = new PNG({ width: 160, height: 90 });
  for (let y = 0; y < 90; y++)
    for (let x = 0; x < 160; x++) {
      const offset = (y * 160 + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = 0; dy < 12; dy++)
          for (let dx = 0; dx < 12; dx++)
            sum += frame.data[((y * 12 + dy) * 1920 + x * 12 + dx) * 4 + c]!;
        result.data[offset + c] = Math.round(sum / 144);
      }
      result.data[offset + 3] = 255;
    }
  return result;
}
function props(style: "journal" | "signal"): CustomFixtureProps {
  return {
    manifest: customFixtureManifest(style, hash(font)),
    media: {
      [customFixtureFontId]: {
        url: `data:font/otf;base64,${font.toString("base64")}`,
      },
    },
    scenes: customFixtureScenes,
  };
}
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  font = await readFile(
    fileURLToPath(
      new URL(
        "../../../apps/pipeline-worker/src/fixtures/design-system-fonts/SourceSans3-Regular.otf",
        import.meta.url,
      ),
    ),
  );
  serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../dist/custom-design.test-entry.js", import.meta.url),
    ),
  });
  const directory = await bundle({
    entryPoint: fileURLToPath(
      new URL("../dist/custom-design.browser-harness.js", import.meta.url),
    ),
    ignoreRegisterRootWarning: true,
    webpackOverride: (config) => ({
      ...config,
      output: { ...config.output, filename: "harness.js" },
    }),
  });
  harness = await startHarnessServer(directory);
  browser = await chromium.launch();
}, 600000);
afterAll(async () => {
  await browser?.close();
  await harness?.close();
});

describe("ST-123 custom rendering with final pinned fonts", () => {
  it("checks CSS-transformed characters with browser word/language context and restores selection", async () => {
    const inputProps = props("journal");
    const family = customFontFamily(inputProps.manifest.fonts[0]!.sha256);
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    try {
      await page.goto(harness.origin);
      await page.evaluate(() => {
        const saved = document.createElement("p");
        saved.textContent = "Preserved selection";
        document.body.append(saved);
        const selection = window.getSelection()!;
        selection.setBaseAndExtent(
          saved.firstChild!,
          saved.textContent.length,
          saved.firstChild!,
          0,
        );
      });
      const check = (
        text: string,
        transform: string,
        coverage: string,
        lang = "en",
      ) => {
        const next = globalThis.structuredClone(inputProps);
        next.manifest.fonts[0]!.characterSet = [
          ...new Set([...coverage].map((char) => char.codePointAt(0)!)),
        ];
        return page.evaluate(
          ({ props, markup }) => window.customHarness.preflight(props, markup),
          {
            props: next,
            markup: `<div lang="${lang}" style="position:absolute;left:120px;top:100px;font-family:${family};text-transform:${transform};user-select:none"><p>${text}</p></div>`,
          },
        );
      };
      expect((await check("abc", "uppercase", "abc")).glyphError).toMatch(
        /U\+41/,
      );
      expect((await check("abc", "uppercase", "ABC")).glyphError).toBeNull();
      expect((await check("ABC", "lowercase", "abc")).glyphError).toBeNull();
      expect(
        (await check("abc def", "capitalize", "abc def")).glyphError,
      ).toMatch(/U\+41/);
      expect(
        (await check("abc def", "capitalize", "Abc Def")).glyphError,
      ).toBeNull();
      expect(
        (await check("he<span>ll</span>o world", "capitalize", "Hello World"))
          .glyphError,
      ).toBeNull();
      expect((await check("i", "uppercase", "i", "tr")).glyphError).toMatch(
        /U\+130/,
      );
      expect((await check("i", "uppercase", "İ", "tr")).glyphError).toBeNull();
      expect(
        await page.evaluate(() => {
          const selection = window.getSelection()!;
          return {
            text: selection.toString(),
            anchor: selection.anchorOffset,
            focus: selection.focusOffset,
          };
        }),
      ).toEqual({ text: "Preserved selection", anchor: 19, focus: 0 });
    } finally {
      await page.close();
    }
  });
  it("measures final-font table cells, including overflow inside the canvas", async () => {
    const inputProps = props("journal");
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    try {
      await page.goto(harness.origin);
      const markup = (long: boolean, top: number) => {
        const table = sourceTableVisualSchema.parse({
          tableId: customFixtureFontId,
          columns: ["Column A", "Column B"],
          rows: Array.from({ length: long ? 6 : 2 }, () =>
            long
              ? ["Long text ".repeat(10), "More text ".repeat(10)]
              : ["Short", "Readable"],
          ),
          rowCount: long ? 6 : 2,
          truncated: false,
        });
        return `<div style="position:absolute;left:120px;top:${top}px">${renderToStaticMarkup(createElement(SourceTable, { identity: resolveCustomIdentity(inputProps.manifest), table, width: 600, height: 300 }))}</div>`;
      };
      const check = (html: string) =>
        page.evaluate(
          ({ props, html }) => window.customHarness.preflight(props, html),
          { props: inputProps, html },
        );
      expect(await check(markup(false, 100))).toEqual({
        layoutError: null,
        glyphError: null,
      });
      // At top=0 the text still fits the canvas, but exceeds its 300px table.
      expect((await check(markup(true, 0))).layoutError).toMatch(
        /table or content area/,
      );
      expect((await check(markup(true, 400))).layoutError).toMatch(
        /does not fit/,
      );
    } finally {
      await page.close();
    }
  });
  it("checks mixed-font and nested text runs against their assigned pinned font", async () => {
    const inputProps = props("journal");
    const headingBytes = await readFile(
      fileURLToPath(
        new URL(
          "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
          import.meta.url,
        ),
      ),
    );
    const headingId = "00000000-0000-7000-8000-000000000999";
    const headingHash = hash(headingBytes);
    inputProps.manifest.presentation.fonts.heading = headingId;
    inputProps.manifest.fonts.push({
      assetId: headingId,
      sha256: headingHash,
      characterSet: [..."Heading"].map((char) => char.codePointAt(0)!),
    });
    inputProps.media = {
      ...inputProps.media,
      [headingId]: {
        url: `data:font/woff2;base64,${headingBytes.toString("base64")}`,
      },
    };
    const headingFamily = customFontFamily(headingHash);
    const bodyFamily = customFontFamily(inputProps.manifest.fonts[0]!.sha256);
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
    });
    try {
      await page.goto(harness.origin);
      const check = (heading: string, body: string, family = bodyFamily) =>
        page.evaluate(
          ({ props, markup }) => window.customHarness.preflight(props, markup),
          {
            props: inputProps,
            markup: `<div style="position:absolute;left:120px;top:100px"><h1 style="font-family:${headingFamily}">${heading}</h1><p style="font-family:${family}"><span>${body}</span></p></div>`,
          },
        );
      expect(await check("Heading", "Body only 123")).toEqual({
        layoutError: null,
        glyphError: null,
      });
      expect((await check("Heading 123", "Body only 123")).glyphError).toMatch(
        /U\+31/,
      );
      expect((await check("Heading", "漢")).glyphError).toMatch(/U\+6F22/);
      expect((await check("Heading", "Body", "serif")).glyphError).toMatch(
        /unpinned font/,
      );
    } finally {
      await page.close();
    }
  });
  it.each(["journal", "signal"] as const)(
    "%s: Player/export parity, seek determinism, phone readability and MP4",
    async (style) => {
      const inputProps = props(style);
      const browserExecutable = chromium.executablePath();
      const composition = await selectComposition({
        serveUrl,
        id: "CustomManualSystems",
        inputProps,
        browserExecutable,
      });
      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
      });
      try {
        await page.goto(harness.origin);
        for (const frame of [90, 450, 780]) {
          await page.evaluate(
            ({ inputProps, frame }) =>
              window.customHarness.mount(inputProps, frame),
            { inputProps, frame },
          );
          await page
            .locator(`[data-custom-frame="${frame}"] [data-custom-scene] p`)
            .first()
            .waitFor();
          await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            );
          });
          const screenshot = await page.screenshot();
          const rendered = await renderStill({
            serveUrl,
            composition,
            inputProps,
            browserExecutable,
            frame,
            imageFormat: "png",
          });
          const a = PNG.sync.read(screenshot),
            b = PNG.sync.read(rendered.buffer!);
          let difference = 0;
          for (let i = 0; i < a.data.length; i += 4)
            for (let c = 0; c < 3; c++)
              difference += Math.abs(a.data[i + c]! - b.data[i + c]!);
          expect(difference / (1920 * 1080 * 3)).toBeLessThan(3.5);
          const signature = visualSignature(b);
          const baselinePath = fileURLToPath(
            new URL(
              `./custom-design-snapshots/${style}-${frame}.png`,
              import.meta.url,
            ),
          );
          if (process.env.ST123_UPDATE_BASELINES === "true") {
            await mkdir(
              fileURLToPath(
                new URL("./custom-design-snapshots/", import.meta.url),
              ),
              { recursive: true },
            );
            await writeFile(baselinePath, PNG.sync.write(signature));
          } else {
            const baseline = PNG.sync.read(await readFile(baselinePath));
            let greatest = 0;
            for (let i = 0; i < signature.data.length; i++)
              greatest = Math.max(
                greatest,
                Math.abs(signature.data[i]! - baseline.data[i]!),
              );
            expect(
              greatest,
              `${style} frame ${frame} differs from the reviewed visual baseline`,
            ).toBeLessThanOrEqual(2);
          }
          await writeFile(`${output}/${style}-${frame}.png`, rendered.buffer!);
          if (frame === 450) {
            const repeat = await renderStill({
              serveUrl,
              composition,
              inputProps,
              browserExecutable,
              frame,
              imageFormat: "png",
            });
            await writeFile(
              `${output}/${style}-${frame}-repeat.png`,
              repeat.buffer!,
            );
            // Chromium can round a handful of antialiased channels by one LSB.
            // A shifted glyph, changed font or moved element exceeds this bound.
            const repeated = PNG.sync.read(repeat.buffer!).data;
            const original = PNG.sync.read(rendered.buffer!).data;
            let changed = 0,
              maximum = 0;
            for (let i = 0; i < repeated.length; i += 4) {
              let different = false;
              for (let c = 0; c < 3; c++) {
                const delta = Math.abs(repeated[i + c]! - original[i + c]!);
                maximum = Math.max(maximum, delta);
                different ||= delta > 0;
              }
              if (different) changed++;
            }
            expect(maximum).toBeLessThanOrEqual(1);
            expect(changed / (1920 * 1080)).toBeLessThan(0.0001);
          }
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
          const root = document.getElementById("root")!;
          root.style.transform = "scale(0.203125)";
          root.style.transformOrigin = "top left";
        });
        await page.screenshot({ path: `${output}/${style}-phone.png` });
        await page.setViewportSize({ width: 844, height: 390 });
        await page.evaluate(() => {
          const root = document.getElementById("root")!;
          root.style.transform = "scale(0.3611111111)";
          root.style.marginLeft = "75px";
        });
        await page.screenshot({
          path: `${output}/${style}-phone-landscape.png`,
        });
        if (process.env.ST123_RENDER_MP4 === "true")
          await renderMedia({
            serveUrl,
            composition,
            inputProps,
            browserExecutable,
            codec: "h264",
            outputLocation: `${output}/${style}.mp4`,
            concurrency: 2,
            crf: 23,
            pixelFormat: "yuv420p",
          });
        await writeFile(
          `${output}/${style}-manifest.json`,
          JSON.stringify(inputProps.manifest, null, 2),
        );
      } finally {
        await page.close();
      }
    },
    600000,
  );
  it("blocks changed font bytes and changed lesson content", async () => {
    const inputProps = props("journal");
    const composition = await selectComposition({
      serveUrl,
      id: "CustomManualSystems",
      inputProps,
      browserExecutable: chromium.executablePath(),
    });
    const broken = {
      ...inputProps,
      media: { [customFixtureFontId]: { url: "data:font/otf;base64,AAAA" } },
    };
    const failure = async (value: typeof inputProps) => {
      try {
        await renderStill({
          serveUrl,
          composition: { ...composition, props: value },
          inputProps: value,
          browserExecutable: chromium.executablePath(),
          frame: 90,
        });
        return "render unexpectedly succeeded";
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    };
    expect(await failure(broken)).toMatch(/different bytes/);
    const changed = {
      ...inputProps,
      scenes: inputProps.scenes.map((scene) => ({
        ...scene,
        narration: `${scene.narration} More text.`,
      })),
    };
    expect(await failure(changed)).toMatch(/scene changed/);
  }, 120000);
});
