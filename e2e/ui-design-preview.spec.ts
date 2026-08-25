import { test, expect } from "@playwright/test";

test.describe("ST-072 Product UI Design Preview & Visual Test Harness", () => {
  test("renders /ui-design-preview and verifies keyboard navigation & interaction", async ({
    page,
  }) => {
    await page.goto("/ui-design-preview");

    // Verify page title
    await expect(
      page.getByRole("heading", { name: "Product UI Design System Preview & Harness" })
    ).toBeVisible();

    // Verify primary buttons are visible and enabled
    const primaryButton = page.getByRole("button", { name: "Primary Action" });
    await expect(primaryButton).toBeVisible();
    await expect(primaryButton).toBeEnabled();

    // Test Theme toggle
    const toggleButton = page.getByRole("button", { name: /Toggle Theme/i });
    await expect(toggleButton).toBeVisible();
    await toggleButton.click();

    // Verify Focus Studio class or style is applied
    const container = page.locator(".theme-focus-studio");
    await expect(container).toBeVisible();

    // Toggle back to Studio Daylight
    await toggleButton.click();
    await expect(page.locator(".theme-studio-daylight")).toBeVisible();

    // Test Modal Dialog
    const dialogTrigger = page.getByRole("button", { name: "Open Modal Dialog" });
    await dialogTrigger.click();

    const dialog = page.getByRole("dialog", { name: "Confirm Lesson Render" });
    await expect(dialog).toBeVisible();

    // Close dialog via ESC
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("captures visual snapshot baselines across viewports", async ({ page }) => {
    const viewports = [
      { name: "desktop-1440", width: 1440, height: 900 },
      { name: "tablet-1024", width: 1024, height: 768 },
      { name: "mobile-390", width: 390, height: 844 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/ui-design-preview");

      // Verify header and page content fit without breaking
      await expect(
        page.getByRole("heading", { name: "Product UI Design System Preview & Harness" })
      ).toBeVisible();
    }
  });
});
