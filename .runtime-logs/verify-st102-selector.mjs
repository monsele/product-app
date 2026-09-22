import { chromium } from "@playwright/test";

const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: node verify-st102-selector.mjs <projectId>");
  process.exit(1);
}

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
  const group = page.locator("[role='radiogroup'][aria-label='Visual theme']");
  const count = await group.count();
  console.log("radiogroup count:", count);
  if (count > 0) {
    const radios = page.locator(
      "[role='radiogroup'][aria-label='Visual theme'] [role='radio']",
    );
    console.log("option count:", await radios.count());
    for (let i = 0; i < (await radios.count()); i++) {
      console.log(" -", (await radios.nth(i).textContent())?.trim().slice(0, 60));
    }
  }
  await page.screenshot({
    path: ".runtime-logs/st102-configuration-page.png",
    fullPage: true,
  });
  console.log("screenshot saved");
} finally {
  await browser.close();
}
