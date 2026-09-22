// Verifies the labelled-diagram / source-table preview fix against the real
// project from the bug report. Run from the repo root:
//   node .runtime-logs/verify-labelled-diagram.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = ".runtime-logs";
mkdirSync(OUT, { recursive: true });

const PROJECT_ID = "01a0c303-c31b-7e9c-81c5-de42894e15c0";
const SESSION_TOKEN = "5FwMQHYojk9BoDVfU2q0tjsEX115cGXaRpDmySP0pdU";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addCookies([
  {
    name: "avlp_session",
    value: SESSION_TOKEN,
    domain: "localhost",
    path: "/",
    httpOnly: true,
  },
]);
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

console.log("navigating to storyboard…");
await page.goto(`http://localhost:3000/workspace/${PROJECT_ID}/storyboard`, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/verify-1-storyboard.png`, fullPage: true });

// Find scene 3 (the labelled-diagram scene) and check for the error card.
const sceneErrorCards = await page.locator('[data-testid="scene-preview-error"]').count();
console.log(`scene-preview-error cards visible: ${sceneErrorCards}`);

if (sceneErrorCards > 0) {
  const texts = await page.locator('[data-testid="scene-preview-error"]').allTextContents();
  console.log("ERROR CARD TEXT:", JSON.stringify(texts, null, 2));
}

// Click scene 3 (labelled-diagram) specifically to open its detail/preview panel.
const sceneListItem = page.locator("text=labelled-diagram >> visible=true").first();
if (await sceneListItem.count() > 0) {
  await sceneListItem.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/verify-2-scene3.png`, fullPage: true });
  const errorAfterClick = await page.locator('[data-testid="scene-preview-error"]').count();
  console.log(`scene-preview-error cards after selecting labelled-diagram scene: ${errorAfterClick}`);
  if (errorAfterClick > 0) {
    console.log("ERROR TEXT:", JSON.stringify(await page.locator('[data-testid="scene-preview-error"]').allTextContents()));
  }
  // Scrub the player timeline forward so the diagram's entrance animation has settled.
  const slider = page.locator('input[type="range"]').first();
  if (await slider.count() > 0) {
    await slider.evaluate((el) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      nativeSetter.call(el, "150");
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/verify-3-scene3-frame.png`, fullPage: true });
    const player = page.locator('[data-testid="scene-preview-frame"]').first();
    if (await player.count() > 0) {
      await player.screenshot({ path: `${OUT}/verify-4-player-closeup.png` });
      const frames = page.frames();
      console.log(`iframe count: ${frames.length}`);
      for (const f of frames) {
        const main = await f.locator('main[aria-label="Labelled diagram"]').count().catch(() => -1);
        if (main > 0) {
          console.log("found main in frame", f.url());
          console.log("outerHTML length:", (await f.locator('main[aria-label="Labelled diagram"]').innerHTML()).length);
          console.log((await f.locator('main[aria-label="Labelled diagram"]').innerHTML()).slice(0, 3000));
        }
      }
    } else {
      console.log("scene-preview-frame testid not found; dumping player iframe/canvas html");
      const html = await page.locator("section.sp-player, [class*='sp-player']").first().innerHTML().catch(() => "N/A");
      console.log(html.slice(0, 2000));
    }
  }
} else {
  console.log("Could not find labelled-diagram scene in the list");
}

console.log("console/page errors:", errors.length ? errors : "none");
console.log(sceneErrorCards === 0 ? "RESULT: PASS (no preview error cards)" : "RESULT: FAIL (preview error card present)");

await browser.close();
