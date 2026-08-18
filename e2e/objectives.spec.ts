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

test("objective editor shows the draft objectives", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/objectives`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Learning objectives" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Draft set/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Objectives", { exact: true }).getByText(
      "Describe how evaporation forms water vapour.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve objectives" }),
  ).toBeEnabled();
});

test("objective editor adds a teacher-authored objective", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/objectives`);
  await page.getByLabel("Statement").fill("Label the water cycle stages.");
  await page.getByLabel("Measurable verb").last().fill("label");
  await page.getByRole("button", { name: "Add objective" }).click();
  await expect(
    page.getByText("Label the water cycle stages."),
  ).toBeVisible();
  await expect(
    page.getByText("Measurable verb: label. Teacher-added objective", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(/Not supported by the reviewed source/),
  ).toBeVisible();
});

test("objective editor rejects stale saves and refreshes", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/objectives`);
  const response = await page.request.patch(
    `http://127.0.0.1:3002/projects/${projectId}/objectives/019ffbf1-6111-738a-b087-6775ff97568c`,
    { data: { statement: "Stale edit.", expectedRevision: 99 } },
  );
  expect(response.status()).toBe(409);
});

test("objective editor approves the draft", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/objectives`);
  await page.getByRole("button", { name: "Approve objectives" }).click();
  await expect(
    page.getByText("Objective approved."),
  ).toBeVisible();
  await expect(
    page.getByText(/Approved set/),
  ).toBeVisible();
  await expect(
    page.getByText("Learning objectives are approved and will guide the lesson."),
  ).toBeVisible();
});
