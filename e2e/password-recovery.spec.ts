import { expect, test } from "@playwright/test";

test("password recovery shows generic progress and success states", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(page.getByText("Studio Daylight")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Find your way back to the studio." }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /plant life-cycle/ }),
  ).toBeVisible();

  await page.getByLabel("Email address").fill("teacher@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("button", { name: "Sending securely..." }),
  ).toBeDisabled();
  await expect(page.getByRole("status")).toContainText(
    "If an account matches that email address",
  );
});

test("password recovery exposes a useful service error", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("outage@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable" }),
  ).toHaveText("Unable to request a password reset. Please try again.");
});

test("new-password recovery is usable on a narrow viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/reset-password?token=${"A".repeat(43)}`);
  await expect(
    page.getByRole("heading", { name: "Choose a new password." }),
  ).toBeVisible();
  await expect(page.getByText("At least 12 characters")).toBeVisible();
  await expect(page.getByText("Unique to this account")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page
    .getByLabel("New password", { exact: true })
    .fill("a secure password");
  await page.getByLabel("Confirm new password").fill("a different password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Passwords do not match." }),
  ).toHaveText("Passwords do not match.");

  await page.getByLabel("Confirm new password").fill("a secure password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(
    page.getByRole("button", { name: "Updating securely..." }),
  ).toBeDisabled();
  await expect(page).toHaveURL(/\/sign-in\?passwordReset=1$/);
});
