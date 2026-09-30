// Contact sheets of video frames: node .runtime-logs/st112-sheet.mjs <framesDir> <outPrefix> [width=960]
// Each sheet holds six frames (2 x 3), labelled with the frame's file name.
import { chromium } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const [dir, out, widthArg] = process.argv.slice(2);
const width = Number(widthArg ?? 960);
const height = Math.round((width * 9) / 16);
const files = readdirSync(dir).filter((name) => name.endsWith(".png")).sort();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: width * 2, height: height * 3 } });
for (let index = 0; index * 6 < files.length; index += 1) {
  const cells = files
    .slice(index * 6, index * 6 + 6)
    .map(
      (name) =>
        `<div style="position:relative;width:${width}px;height:${height}px"><img src="data:image/png;base64,${readFileSync(resolve(dir, name)).toString("base64")}" style="width:100%;height:100%"><span style="position:absolute;left:6px;top:6px;background:#000;color:#fff;font:14px monospace;padding:2px 6px">${name}</span></div>`,
    )
    .join("");
  await page.setContent(`<body style="margin:0;display:flex;flex-wrap:wrap;background:#222">${cells}</body>`);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}-${index}.png` });
  console.log(`${out}-${index}.png`);
}
await browser.close();
