import { expect, test } from "@playwright/test";

/**
 * ST-094 — the development style-proof gallery.
 *
 * Covers what the story's "browser interaction test" asks for: style selection,
 * scene navigation and seeking, and visible validation errors. It also asserts
 * the route stays development-only and that the three styles resolve to
 * different treatments over the same content.
 */

test("selects each style and reports its resolved treatment", async ({
  page,
}) => {
  await page.goto("/style-proof-preview");
  await expect(page.getByTestId("style-proof-gallery")).toBeVisible();
  await expect(page.getByTestId("style-proof-status")).toHaveText("Renderable");

  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "essential.hook.isolated-question",
  );
  await expect(page.getByTestId("style-proof-signature")).toContainText(
    "masked-reveal",
  );

  await page.getByRole("button", { name: "Editorial", exact: true }).click();
  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "editorial.hook.headline-beside-frame",
  );
  await expect(page.getByTestId("style-proof-signature")).toContainText(
    "image-push-annotation",
  );

  await page.getByRole("button", { name: "Everyday", exact: true }).click();
  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "everyday.hook.illustrated-situation",
  );
  await expect(page.getByTestId("style-proof-signature")).toContainText(
    "object-settle",
  );
});

test("navigates scenes and seeks within the proof clip", async ({ page }) => {
  await page.goto("/style-proof-preview");
  await expect(page.getByTestId("style-proof-frame")).toContainText(
    "Proof frame: 0 of 840",
  );

  // Scene 2 starts at 7s * 30fps = frame 210.
  await page.getByRole("button", { name: "Scene 2", exact: true }).click();
  await expect(page.getByTestId("style-proof-frame")).toContainText(
    "Proof frame: 210",
  );
  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "essential.definition.central-subject",
  );

  await page.getByRole("button", { name: "Scene 3", exact: true }).click();
  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "essential.comparison.sequential-emphasis",
  );

  await page.getByLabel("Seek proof").fill("120");
  await expect(page.getByTestId("style-proof-frame")).toContainText(
    "Proof frame: 120",
  );
  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "essential.hook.isolated-question",
  );
});

test("presents the second subject through the same treatments", async ({
  page,
}) => {
  await page.goto("/style-proof-preview");
  await page
    .getByRole("button", { name: "Leaf adaptation (second subject)" })
    .click();
  await expect(page.getByTestId("style-proof-status")).toHaveText("Renderable");
  await expect(page.getByTestId("style-proof-resolution")).toContainText(
    "essential.hook.isolated-question",
  );
  await expect(page.getByTestId("style-proof-frame")).toContainText(
    "Proof frame: 0 of 720",
  );
});

test("shows actionable validation failures for blocked fixtures", async ({
  page,
}) => {
  await page.goto("/style-proof-preview");

  await page
    .getByRole("button", { name: "Missing required evidence (must block)" })
    .click();
  await expect(page.getByTestId("style-proof-errors")).toContainText(
    "missing_required_asset",
  );
  await expect(page.getByTestId("style-proof-errors")).toContainText(
    "assetBySlot.evidence",
  );

  await page
    .getByRole("button", { name: "Media below minimum resolution (must block)" })
    .click();
  await expect(page.getByTestId("style-proof-errors")).toContainText(
    "asset_resolution_too_low",
  );

  await page
    .getByRole("button", { name: "Scene too short to hold (must block)" })
    .click();
  await expect(page.getByTestId("style-proof-errors")).toContainText(
    "invalid_motion_interval",
  );
  await expect(page.getByTestId("style-proof-errors")).toContainText(
    "Narration is never accelerated",
  );

  await page
    .getByRole("button", { name: "Treatment/scene-type mismatch (must block)" })
    .click();
  await expect(page.getByTestId("style-proof-errors")).toContainText(
    "treatment_scene_type_mismatch",
  );
});

test("renders the boundary fixtures that must stay renderable", async ({
  page,
}) => {
  await page.goto("/style-proof-preview");
  for (const label of [
    "Heading at the schema ceiling",
    "Densest valid comparison",
    "Portrait media in a cover-fit slot",
    "Extended scene duration",
  ]) {
    await page.getByRole("button", { name: label }).click();
    await expect(
      page.getByTestId("style-proof-status"),
      label,
    ).toHaveText("Renderable");
  }
});

test("lists all nine registered treatments with their slot contracts", async ({
  page,
}) => {
  await page.goto("/style-proof-preview");
  const list = page.getByRole("region", { name: "Registered treatments" });
  await expect(list.getByRole("listitem")).toHaveCount(9);
  await expect(list).toContainText("editorial.comparison.evidence-panels");
  await expect(list).toContainText("raster, cover, min 600x400, required");
  await expect(list).toContainText("vector, contain, min 300x300, required");
});
