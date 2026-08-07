import { expect, test } from "@playwright/test";

test("web health page placeholder", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("AI Visual Learning Platform")).toBeVisible();
});
