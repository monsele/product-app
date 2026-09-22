import { chromium } from "@playwright/test";

const projectId = process.argv[2];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  await context.addCookies([
    {
      name: "avlp_session",
      value: "8Aa2hGT5ALnFz9On-gj2oVN4AMR3YjCRJD2oBiT1TTI",
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
    },
  ]);
  const page = await context.newPage();
  await page.goto(`http://localhost:3000/workspace/${projectId}/configuration`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1500);
  const systems = page.locator(
    "[role='radiogroup'][aria-label='Visual theme'] [role='radio']",
  ).nth(4);
  console.log("clicking:", (await systems.textContent())?.trim().slice(0, 20));
  await systems.click();
  await page.waitForTimeout(300);
  console.log("systems aria-checked:", await systems.getAttribute("aria-checked"));
  const summaryTheme = await page
    .locator("text=Visual Theme:")
    .locator("xpath=..")
    .textContent();
  console.log("sidebar summary row:", summaryTheme?.trim());
  await page.screenshot({
    path: ".runtime-logs/st102-configuration-systems-selected.png",
    clip: { x: 500, y: 220, width: 340, height: 260 },
  });
} finally {
  await browser.close();
}
