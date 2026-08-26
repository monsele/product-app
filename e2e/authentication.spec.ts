import { expect, test } from "@playwright/test";

test.describe("Authentication UI and Studio Daylight flow", () => {
  test("sign-in page renders Studio Daylight split view and preserves security copy", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("Studio Daylight")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();
    await expect(
      page.getByText("Your visual lessons are ready to edit and share"),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Forgot password?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Need an account/ }),
    ).toBeVisible();
  });

  test("sign-in page shows password reset success banner when requested", async ({
    page,
  }) => {
    await page.goto("/sign-in?passwordReset=1");
    await expect(page.getByRole("status")).toHaveText(
      "Your password has been updated. Please sign in with your new password.",
    );
  });

  test("register page renders password complexity rules", async ({ page }) => {
    await page.goto("/register");
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await expect(page.getByText("At least 12 characters")).toBeVisible();
    await expect(page.getByText("Unique to this account")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Already have an account? Sign in" }),
    ).toBeVisible();
  });

  test("responsive mobile layout keeps form accessible without overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/sign-in");
    await expect(
      page.getByRole("heading", { name: "Sign in" }),
    ).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(390);
  });
});
