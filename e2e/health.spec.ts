import { expect, test } from "@playwright/test";

test.skip(
  true,
  "The web server is started by the dedicated browser-preview story.",
);
test("web health page placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("AI Visual Learning Platform")).toBeVisible();
});
