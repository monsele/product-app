// ST-106 follow-up (untracked): biology's completed delivery + download, and
// which request URLs contain words of the finance focus prompt.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const APP = "http://localhost:3000";
const cohort = JSON.parse(readFileSync(".runtime-logs/st105-state.json", "utf8"));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
page.setDefaultTimeout(180_000);
const urls = [];
page.on("request", (r) => urls.push(r.url()));
page.on("response", (r) => {
  const location = r.headers()["location"];
  if (location) urls.push(`[redirect] ${location}`);
});

await page.goto(`${APP}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', cohort.email);
await page.fill('input[type="password"]', "CorrectHorse!9batt");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL("**/workspace");

for (const [key, projectId] of [
  ["biology", "01a0e43e-6cc7-7029-b0f8-98a344e9c09e"],
  ["finance", "01a0e3e2-50d3-7ba3-8960-544c14e3ae86"],
]) {
  urls.length = 0;
  await page.goto(`${APP}/workspace/${projectId}/one-shot`, { waitUntil: "networkidle" });
  await page.getByTestId("one-shot-delivery").waitFor();
  await page.waitForTimeout(6_000);
  await page.screenshot({ path: `.runtime-logs/st106-${key}-20-delivery-completed.png`, fullPage: true });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByLabel("Latest production render").getByRole("button", { name: "Download MP4" }).click(),
  ]);
  console.log(`${key}: status=${await page.getByTestId("one-shot-delivery").getAttribute("data-status")} download=${download.suggestedFilename()}`);
  const words = ["compounding", "frequency", "mitochondria", "chloroplasts"];
  for (const url of urls)
    if (words.some((w) => url.toLowerCase().includes(w)))
      console.log(`  prompt word in: ${url.replace(/([?&](X-Amz-[^=]+|Signature|token)=)[^&]+/gi, "$1<redacted>")}`);
}
await browser.close();
