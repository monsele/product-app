import { expect, test } from "@playwright/test";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const itemA = "019ffbf1-6121-738a-b087-6775ff97568c";
const itemB = "019ffbf1-6122-738a-b087-6775ff97568c";

async function setSessionCookie(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    {
      name: "avlp_session",
      value: "teacher-session",
      url: "http://127.0.0.1:3000",
    },
  ]);
}

test("outline editor shows the draft outline items", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/outline`);
  await expect(
    page.getByRole("heading", { level: 2, name: "Lesson outline" }),
  ).toBeVisible();
  await expect(page.getByText(/Draft outline/)).toBeVisible();
  await expect(
    page.getByText("Where does the water go?"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve outline" }),
  ).toBeEnabled();
});

test("outline editor adds a teacher-authored item", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/outline`);
  await page.getByLabel("Title").last().fill("Condensation");
  await page
    .getByLabel("Description")
    .last()
    .fill("Explain how vapour cools into clouds.");
  await page.getByLabel(/Estimated duration/).last().fill("40");
  await page
    .getByLabel("Describe how evaporation forms water vapour.", {
      exact: false,
    })
    .check();
  await page.getByRole("button", { name: "Add outline item" }).click();
  await expect(
    page.getByText("3. Condensation", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(/Teacher-added item/),
  ).toBeVisible();
});

test("outline editor reorders items by drag and drop", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/outline`);
  const first = page.getByTestId(`outline-item-${itemA}`);
  const second = page.getByTestId(`outline-item-${itemB}`);
  await expect(first).toContainText("Where does the water go?");
  await first.dragTo(second);
  await expect(
    page.getByText("Outline reordered."),
  ).toBeVisible();
  const items = page.getByTestId("outline-items");
  await expect(items).toContainText("Evaporation");
  await expect(items).toContainText("Where does the water go?");
});

test("outline editor edits an item title", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/outline`);
  const item = page.getByTestId(`outline-item-${itemA}`);
  await item.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Title").first().fill("Where does the rain go?");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(
    page.getByText("Outline item updated."),
  ).toBeVisible();
  await expect(
    page.getByText("Where does the rain go?", { exact: false }),
  ).toBeVisible();
});

test("outline editor rejects stale saves", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/outline`);
  const response = await page.request.patch(
    `http://127.0.0.1:3002/projects/${projectId}/outline/items/${itemA}`,
    { data: { title: "Stale edit.", expectedRevision: 99 } },
  );
  expect(response.status()).toBe(409);
});

test("outline editor approves the draft", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/outline`);
  await page.getByRole("button", { name: "Approve outline" }).click();
  await expect(
    page.getByText("Outline approved."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The lesson outline is approved and will guide narration.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Approved outline (used by narration generation)",
    }),
  ).toBeVisible();
});
