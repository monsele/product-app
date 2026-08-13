import { expect, test } from "@playwright/test";

test("plays one selected scene fixture with browser controls", async ({
  page,
}) => {
  await page.goto("/video-design-preview");
  await expect(page.getByTestId("scene-preview-gallery")).toBeVisible();
  await expect(page.getByRole("heading", { name: "hook scene" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play video" })).toBeVisible();
  await expect(page.getByTestId("scene-preview-caption")).toContainText(
    "Preview fixture for the hook",
  );
  await expect(page.getByText(/Preview frame: 0; muted/)).toBeVisible();
  await page.getByRole("button", { name: "Play scene", exact: true }).click();
  await page.getByRole("button", { name: "Pause scene", exact: true }).click();
  await page.getByLabel("Seek scene").fill("30");
  await expect(page.getByText(/Preview frame: 30/)).toBeVisible();
  await page.getByRole("button", { name: "Replay scene" }).click();
  await expect(page.getByText(/Preview frame: 0/)).toBeVisible();
  await page.getByRole("button", { name: "Unmute scene", exact: true }).click();
  await expect(page.getByText(/unmuted/)).toBeVisible();
  await page.getByRole("button", { name: "Mute scene", exact: true }).click();
  await expect(page.getByText(/muted/)).toBeVisible();

  for (const template of [
    "definition",
    "process",
    "input-process-output",
    "comparison",
    "cause-effect",
    "labelled-diagram",
    "analogy",
    "worked-example",
    "summary",
  ]) {
    await page.getByRole("button", { name: template, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `${template} scene` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play scene", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Preview frame: 0; muted/)).toBeVisible();
  }
});

test("shows actionable invalid input and missing media errors", async ({
  page,
}) => {
  await page.goto("/video-design-preview");
  await page.getByRole("button", { name: "invalid input" }).click();
  await expect(page.getByTestId("scene-preview-error")).toContainText(
    "Preview unavailable",
  );
  await expect(page.getByTestId("scene-preview-error")).toContainText(
    "refresh its authorized media",
  );

  await page.getByRole("button", { name: "missing asset" }).click();
  await expect(page.getByTestId("scene-preview-error")).toContainText(
    "Missing preview asset",
  );

  await page.getByRole("button", { name: "missing audio" }).click();
  await expect(
    page.getByRole("button", { name: "Play scene", exact: true }),
  ).toBeVisible();
});

test("navigates the full three-minute fixture preview", async ({ page }) => {
  await page.goto("/video-design-preview");
  await page.getByRole("button", { name: "full lesson" }).click();
  await expect(
    page.getByRole("heading", { name: "three-minute lesson" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Play lesson" })).toBeVisible();
  await page.getByRole("button", { name: "Scene 4" }).click();
  await expect(page.getByText(/Full lesson frame: 2700/)).toBeVisible();
});
