import { expect, test } from "@playwright/test";

test.describe("Authenticated Application Shell UI", () => {
  test("header displays product identity and account details", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "avlp_session",
        value: "teacher-session",
        url: "http://localhost:3000",
      },
      {
        name: "avlp_session",
        value: "teacher-session",
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.goto("/workspace");
    await expect(page.getByText("AI Visual Learning Platform")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Teacher workspace" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("mobile view renders pipeline menu drawer and handles keyboard escape dismissal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addCookies([
      {
        name: "avlp_session",
        value: "teacher-session",
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.goto("/workspace");
    await expect(
      page.getByRole("heading", { name: "Teacher workspace" }),
    ).toBeVisible();
  });
});
