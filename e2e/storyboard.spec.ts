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

test("storyboard page shows the generated scene draft", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Storyboard" }),
  ).toBeVisible();
  await expect(
    page.getByText(/A storyboard draft is ready for review/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Regenerate storyboard" }),
  ).toBeEnabled();
  await expect(page.getByTestId("storyboard-scenes")).toBeVisible();
  await expect(
    page.getByText(/definition — 30s · 1 narration block/),
  ).toBeVisible();
});

test("storyboard page queues a regeneration without losing the draft", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  await page.getByRole("button", { name: "Regenerate storyboard" }).click();
  await expect(page.getByTestId("storyboard-scenes")).toBeVisible();
});

test("storyboard page regenerates one scene and compares the candidate", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  await expect(page.getByTestId("storyboard-scenes")).toBeVisible();
  await page
    .getByTestId("storyboard-scene-regenerate-019ffbf1-6151-738a-b087-6775ff97568c")
    .click();
  await expect(page.getByTestId("storyboard-scenes")).toBeVisible();
});

test("storyboard page applies a regenerated scene candidate", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  await page
    .getByTestId("storyboard-scene-regenerate-019ffbf1-6151-738a-b087-6775ff97568c")
    .click();
  const candidate = page.getByTestId(
    "storyboard-candidate-019ffbf1-6152-738a-b087-6775ff97568c",
  );
  await expect(candidate).toBeVisible();
  await page
    .getByTestId("storyboard-candidate-apply-019ffbf1-6152-738a-b087-6775ff97568c")
    .click();
  await expect(
    page.getByText(/A storyboard draft is ready for review/),
  ).toBeVisible();
});
