import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

test("workspace requires a teacher session", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("workspace displays projects and redirects a newly created project to upload", async ({
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
  await expect(
    page.getByRole("link", { name: "Existing water-cycle lesson" }),
  ).toBeVisible();
  await expect(page.getByText("Status: draft. Last modified")).toBeVisible();

  await page.getByLabel("Project title").fill("Plant cells");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(
    /\/workspace\/019ffbf1-610f-738a-b087-6775ff97568c\/upload$/,
  );
  await expect(
    page.getByRole("heading", { name: "Upload a source document" }),
  ).toBeVisible();
  await expect(page.getByText("Plant cells")).toBeVisible();
});

test("workspace rejects malformed project-list responses", async ({ page }) => {
  await page.context().addCookies([
    {
      name: "avlp_session",
      value: "teacher-session",
      url: "http://127.0.0.1:3000",
    },
  ]);
  const response = await page.goto("/workspace?cursor=malformed-response");
  expect(response?.status()).toBe(500);
});

test("source upload shows progress and completion", async ({ page }) => {
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
  await page.goto("/workspace/019ffbf1-610e-738a-b087-6775ff97568c/upload");
  await page.getByLabel("PDF or DOCX file").setInputFiles({
    name: "water-cycle.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("fixture PDF content"),
  });
  await page.getByRole("button", { name: "Upload document" }).click();
  await expect(page.getByRole("status")).toHaveText(
    /Uploading: \d+%|Checking your document|Your document passed validation/,
  );
  await expect(
    page.getByText(/Your document passed validation and is being prepared\./),
  ).toBeVisible({ timeout: 10000 });
});

test("create-project proxy rejects malformed project responses", async ({
  page,
}) => {
  await page.context().addCookies([
    {
      name: "avlp_session",
      value: "teacher-session",
      url: "http://127.0.0.1:3000",
    },
  ]);
  const response = await page.request.post("/api/projects", {
    form: { title: "Malformed project response" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(response.headers().location).toBe(
    "http://localhost:3000/workspace?error=title",
  );
});
