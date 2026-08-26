import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

test.describe("Teacher Workspace Project Board", () => {
  test("workspace requires a teacher session", async ({ page }) => {
    await page.goto("/workspace");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("workspace displays Studio Daylight project board and creates a new lesson", async ({
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

    // Check Studio Daylight Header & Page Title
    await expect(
      page.getByRole("heading", { name: "Your lessons" }),
    ).toBeVisible();

    // Contextual Information Rail
    await expect(
      page.getByRole("complementary", { name: "Workspace Contextual Guidance" }),
    ).toBeVisible();
    await expect(page.getByText("Supported Sources")).toBeVisible();

    // Featured Lesson Card
    await expect(
      page.getByRole("link", { name: "Existing water-cycle lesson" }),
    ).toBeVisible();
    await expect(page.getByText("Draft")).toBeVisible();
    await expect(page.getByText(/Last modified/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Upload Source" }),
    ).toBeVisible();

    // Create Lesson form with dominant action
    await page.getByLabel("Project title").fill("Plant cells");
    await page.getByRole("button", { name: "Create lesson" }).click();
    await expect(page).toHaveURL(
      /\/workspace\/019ffbf1-610f-738a-b087-6775ff97568c\/upload$/,
    );
    await expect(
      page.getByRole("heading", { name: "Upload a source document" }),
    ).toBeVisible();
    await expect(page.getByRole("banner").getByText("Plant cells")).toBeVisible();
  });

  test("workspace overflow menu and delete dialog are keyboard accessible with named confirmation", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "avlp_session",
        value: "teacher-session",
        url: "http://127.0.0.1:3000",
      },
    ]);
    await page.goto("/workspace");

    // Open Featured project actions menu
    const menuBtn = page.getByRole("button", {
      name: "Featured project actions",
    });
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    // Trigger Delete Dialog
    const deleteMenuItem = page.getByRole("menuitem", {
      name: "Delete lesson",
    });
    await expect(deleteMenuItem).toBeVisible();
    await deleteMenuItem.click();

    // Dialog appears
    const dialog = page.getByRole("dialog", { name: "Delete lesson" });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText(/Permanently remove Existing water-cycle lesson/i),
    ).toBeVisible();

    // Confirm button is initially disabled
    const confirmBtn = dialog.getByRole("button", { name: "Delete lesson" });
    await expect(confirmBtn).toBeDisabled();

    // Typing title enables confirm button
    await page
      .getByLabel("To confirm deletion, enter the lesson title:")
      .fill("Existing water-cycle lesson");
    await expect(confirmBtn).toBeEnabled();

    // Escape closes dialog
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("workspace rejects malformed project-list responses", async ({
    page,
  }) => {
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

  test("source upload shows progress, requirements rail, and review transition", async ({
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
    await page.goto("/workspace/019ffbf1-610e-738a-b087-6775ff97568c/upload");

    // Check Studio Daylight project shell & pipeline rail
    await expect(
      page.getByRole("heading", { name: "Upload a source document" }),
    ).toBeVisible();
    await expect(page.getByRole("banner").getByText("Existing water-cycle lesson")).toBeVisible();
    await expect(
      page.getByRole("complementary", { name: "Source Document Requirements" }),
    ).toBeVisible();
    await expect(page.getByText("Supported Formats")).toBeVisible();
    await expect(page.getByText("Maximum 20 pages")).toBeVisible();

    // Check Drop Target
    await expect(
      page.getByLabel("Drop source document here or browse files"),
    ).toBeVisible();

    // Select a file
    await page.getByLabel("PDF or DOCX file").setInputFiles({
      name: "water-cycle.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("fixture PDF content"),
    });

    // Verify File Preview Card
    await expect(page.getByText("water-cycle.pdf")).toBeVisible();
    await expect(page.getByLabel("Remove selected file")).toBeVisible();

    // Click Upload
    await page.getByRole("button", { name: "Upload document" }).click();

    // Check live status announcement & validation
    await expect(
      page.getByText(/Your document passed validation|Ready for Review/),
    ).toBeVisible({ timeout: 10000 });

    // Check Ingestion Status Panel & Review Source action
    await expect(
      page.getByRole("heading", { name: "Document ingestion" }),
    ).toBeVisible();
    await expect(page.getByText("Extraction Quality Score")).toBeVisible();
    await expect(page.getByText("95/100")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review source" }),
    ).toBeVisible();
  });

  test("source upload route renders cleanly across viewports and reduced motion", async ({
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

    // Desktop viewport (1280px)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/workspace/019ffbf1-610e-738a-b087-6775ff97568c/upload");
    await expect(
      page.getByRole("heading", { name: "Upload a source document" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/source-upload-desktop.png",
      fullPage: true,
    });

    // Tablet viewport (768px)
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(
      page.getByRole("heading", { name: "Upload a source document" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/source-upload-tablet.png",
      fullPage: true,
    });

    // Mobile viewport (375px)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(
      page.getByRole("heading", { name: "Upload a source document" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/source-upload-mobile.png",
      fullPage: true,
    });

    // Reduced motion emulation
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/workspace/019ffbf1-610e-738a-b087-6775ff97568c/upload");
    await expect(
      page.getByRole("heading", { name: "Upload a source document" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/source-upload-reduced-motion.png",
      fullPage: true,
    });
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

  test("workspace responsive layout renders cleanly across viewports", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "avlp_session",
        value: "teacher-session",
        url: "http://127.0.0.1:3000",
      },
    ]);

    // Desktop viewport (1280px)
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/workspace");
    await expect(page.getByRole("heading", { name: "Your lessons" })).toBeVisible();
    await page.screenshot({
      path: "test-results/workspace-desktop.png",
      fullPage: true,
    });

    // Tablet viewport (768px)
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.getByRole("heading", { name: "Your lessons" })).toBeVisible();
    await page.screenshot({
      path: "test-results/workspace-tablet.png",
      fullPage: true,
    });

    // Mobile viewport (375px)
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole("heading", { name: "Your lessons" })).toBeVisible();
    await page.screenshot({
      path: "test-results/workspace-mobile.png",
      fullPage: true,
    });
  });
});
