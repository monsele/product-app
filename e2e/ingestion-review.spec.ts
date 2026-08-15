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

test("ingestion review shows document hierarchy and warnings", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/review`);
  await expect(
    page.getByRole("heading", { name: "Review extracted document" }),
  ).toBeVisible();
  await expect(page.getByText("The Water Cycle")).toBeVisible();
  await expect(page.getByText("Pages").locator("+ dd")).toHaveText("5");
  await expect(
    page.getByRole("heading", { name: /Sections \(3\)/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: /Introduction/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("treeitem", { name: /Evaporation/ }),
  ).toBeVisible();
});

test("warning navigation expands the affected section", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/review`);
  await expect(
    page.getByRole("heading", { name: /Warnings \(1\)/ }),
  ).toBeVisible();
  await expect(
    page.getByText("A figure is missing a caption."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Go to section" }).click();

  const section = page.getByRole("treeitem", { name: /Introduction/ });
  await expect(section).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Water moves through the environment in a continuous cycle."),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Extracted figure" }),
  ).toBeVisible();
});

test("figure signed URL is displayed as an image", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/review`);
  await page.getByRole("button", { name: /Introduction/ }).click();
  const figure = page.getByRole("img", { name: "Extracted figure" });
  await expect(figure).toBeVisible();
  await expect(figure).toHaveAttribute(
    "src",
    "http://127.0.0.1:3002/signed-figure/019ffbf1-6114.png",
  );
});

test("section with content displays blocks", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/review`);
  await page.getByRole("button", { name: /Evaporation/ }).click();
  await expect(
    page.getByText("Heat from the sun causes water to evaporate."),
  ).toBeVisible();
});

test("empty section displays a message", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/review`);
  await page.getByRole("button", { name: /References/ }).click();
  await expect(
    page.getByText("This section has no extractable content."),
  ).toBeVisible();
});
