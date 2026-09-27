import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const cohort = JSON.parse(readFileSync(".runtime-logs/st105-state.json", "utf8"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.setDefaultTimeout(120_000);
await page.goto("http://localhost:3000/sign-in", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', cohort.email);
await page.fill('input[type="password"]', "CorrectHorse!9batt");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL("**/workspace");
for (const route of ["storyboard", "outline"]) {
  await page.goto(`http://localhost:3000/workspace/01a0e3e2-50b2-7bb2-9f78-2463cc3ef883/${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  const link = page.getByTestId("one-shot-run-link");
  const box = await link.boundingBox().catch(() => null);
  console.log(route, "count", await link.count(), "box", JSON.stringify(box));
  await page.screenshot({ path: `.runtime-logs/st106-history-21-${route}-header.png`, clip: { x: 0, y: 0, width: 1440, height: 90 } });
}
await browser.close();
