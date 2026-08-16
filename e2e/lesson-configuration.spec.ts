import { expect, test } from "@playwright/test";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";

async function setSessionCookie(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    {
      name: "avlp_session",
      value: "teacher-session",
      url: "http://127.0.0.1:3000",
    },
  ]);
}

test("lesson configuration form requires every field before saving", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/configuration`);
  await expect(
    page.getByRole("heading", { name: "Configure the lesson" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save configuration" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Complete every required field and confirm the source content to proceed."),
  ).toBeVisible();
});

test("saving a complete configuration shows the narration target", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/configuration`);
  await page.getByLabel("11-13").check();
  await page.getByLabel("introductory").check();
  await page.getByLabel("Subject").fill("Biology");
  await page.getByLabel("Lesson title").fill("The Water Cycle");
  await page.getByLabel("5 minutes").check();
  await page.getByLabel("friendly").check();
  await page.getByLabel("Include a recall question at the end of the lesson").check();

  await expect(
    page.getByText(/Narration target: \d+–\d+ words/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save configuration" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText("Lesson configuration saved.")).toBeVisible();
  await expect(
    page.getByText("This configuration is ready — generation can proceed."),
  ).toBeVisible();
});
