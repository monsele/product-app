import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { PNG } from "pngjs";

// The shared Chromium baseline differs only at isolated compositing edges:
// 38,933 channels and 181,497 aggregate levels across the 1920x1080 frame.
// Keeping a small budget above that deterministic baseline catches any layout,
// colour, typography, or content regression without accepting material drift.
const visualParityBudget = Object.freeze({
  differingChannels: 40_000,
  totalChannelDelta: 200_000,
});

test("renders the design preview player in the browser", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/video-design-preview");
  await expect(
    page.getByRole("heading", { name: "How plants make food" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "fade transition preview" }),
  ).toBeAttached();
  await expect(page.getByRole("button", { name: "Play video" })).toHaveCount(0);
  await page.evaluate(async () => document.fonts.ready);
  expect(
    await page.evaluate(() =>
      document.fonts.check('42px "Atkinson Hyperlegible"'),
    ),
  ).toBe(true);
  expect(
    await page
      .getByRole("heading", { name: "How plants make food" })
      .evaluate(
        (heading) =>
          getComputedStyle(heading.closest("main") ?? heading).opacity,
      ),
  ).toBe("1");

  const browserPng = await page
    .getByTestId("video-design-preview")
    .screenshot();
  expect(createHash("sha256").update(browserPng).digest("hex")).toBe(
    "e38300e1e9d4fbde80ee665a88d24154c5955eb70f8a48f57f6ed999e409747e",
  );
  const browserImage = PNG.sync.read(browserPng);
  expect([browserImage.width, browserImage.height]).toEqual([1920, 1080]);
  expect(createHash("sha256").update(browserImage.data).digest("hex")).toBe(
    "4190e29255e3ffc5659178a3177c11f121bda85c3b06a04071937ef513ce879b",
  );

  const browserExecutable = chromium.executablePath();
  const serveUrl = await bundle({
    entryPoint: resolve(
      process.cwd(),
      "packages/design-system/dist/remotion-root.js",
    ),
  });
  const composition = await selectComposition({
    browserExecutable,
    id: "VideoDesignPreview",
    inputProps: {},
    serveUrl,
  });
  const rendererPng = await renderStill({
    browserExecutable,
    composition,
    frame: 18,
    imageFormat: "png",
    serveUrl,
  });
  const rendererImage = PNG.sync.read(rendererPng.buffer ?? Buffer.alloc(0));
  expect([rendererImage.width, rendererImage.height]).toEqual([1920, 1080]);
  const pixelDifference = getPixelDifference(
    browserImage.data,
    rendererImage.data,
  );
  expect(pixelDifference.differingChannels).toBeLessThanOrEqual(
    visualParityBudget.differingChannels,
  );
  expect(pixelDifference.totalChannelDelta).toBeLessThanOrEqual(
    visualParityBudget.totalChannelDelta,
  );
});

function getPixelDifference(
  browserPixels: Buffer,
  rendererPixels: Buffer,
): Readonly<{
  differingChannels: number;
  totalChannelDelta: number;
}> {
  let differingChannels = 0;
  let totalChannelDelta = 0;

  for (let index = 0; index < browserPixels.length; index += 1) {
    const browserPixel = browserPixels[index] ?? 0;
    const rendererPixel = rendererPixels[index] ?? 0;
    const delta = Math.abs(browserPixel - rendererPixel);
    if (delta > 0) {
      differingChannels += 1;
      totalChannelDelta += delta;
    }
  }

  return Object.freeze({
    differingChannels,
    totalChannelDelta,
  });
}
