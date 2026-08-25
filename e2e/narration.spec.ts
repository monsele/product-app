import { expect, test } from "@playwright/test";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const blockId = "019ffbf1-6131-738a-b087-6775ff97568c";

async function setSessionCookie(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    {
      name: "avlp_session",
      value: "teacher-session",
      url: "http://127.0.0.1:3000",
    },
  ]);
}

test("narration editor shows the draft blocks with edit and rewrite controls", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/narration`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Narration" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Where does the water go when a puddle dries\?/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Shorten" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Regenerate", exact: true }),
  ).toBeEnabled();
});

test("narration editor saves a teacher edit to one block", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/narration`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Narration text")
    .fill("Where does a drying puddle go?");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Where does a drying puddle go?"),
  ).toBeVisible();
  await expect(page.getByText("Edited 1 time.")).toBeVisible();
});

test("narration editor accepts a generated rewrite candidate", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/narration`);
  await page.getByRole("button", { name: "Shorten" }).click();
  await expect(
    page.getByText(/Shorten candidate/),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: "Accept rewrite" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Accept rewrite" }).click();
  await expect(
    page.getByText("A tighter, clearer rewrite of the opening question."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept rewrite" }),
  ).not.toBeVisible();
});

test("narration editor rejects stale saves", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/narration`);
  const response = await page.request.patch(
    `http://127.0.0.1:3002/projects/${projectId}/narration/blocks/${blockId}`,
    { data: { text: "Stale edit.", expectedRevision: 99 } },
  );
  expect(response.status()).toBe(409);
});

test("narration editor restores a previous version", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/narration`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByLabel("Narration text")
    .fill("A brand-new opening sentence.");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "Show previous versions" }).click();
  await expect(
    page.getByText(/revision 0 \(generated\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await expect(
    page.getByText("Where does the water go when a puddle dries?"),
  ).toBeVisible();
});
