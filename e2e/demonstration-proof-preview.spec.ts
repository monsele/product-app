/**
 * ST-095 — browser checks for the development demonstration gallery.
 *
 * These are interaction tests, not visual ones: the frame-level layout
 * measurements live in the render script's preflight and in the media suite's
 * parity comparison, which both run at the real 1920x1080 canvas.
 */

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/demonstration-proof-preview");
  await expect(page.getByTestId("demonstration-proof-gallery")).toBeVisible({
    timeout: 120_000,
  });
});

test("renders the demonstration preview with no blocking validation issues", async ({
  page,
}) => {
  await expect(page.getByTestId("demonstration-preview")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("demonstration-validation")).toContainText(
    "No blocking issues",
  );
});

test("states that both approaches share narration, captions and boundaries", async ({
  page,
}) => {
  await expect(page.getByTestId("demonstration-approach-note")).toContainText(
    "same narration recording",
  );
});

test("switches to the standard equivalent of the same subject", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Standard" }).click();
  // `FullLessonPreviewPlayer` labels its own region rather than carrying a
  // testid, so the standard side is asserted by that label: the point of the
  // check is that the real production player is what renders it.
  await expect(
    page.getByRole("region", { name: "Full lesson preview player" }),
  ).toBeVisible({ timeout: 120_000 });
});

test("switches subject and keeps the gallery renderable", async ({ page }) => {
  await page.getByRole("button", { name: "Evaporation" }).click();
  await expect(page.getByTestId("demonstration-validation")).toContainText(
    "No blocking issues",
  );
  await expect(page.getByTestId("demonstration-facts")).toContainText(
    "Evaporation does not require boiling.",
  );
});

test("lists both registered recipes with their versions and timing floors", async ({
  page,
}) => {
  const recipes = page.getByTestId("demonstration-recipes");
  await expect(recipes).toContainText("savings.transfer-accumulate@1.0.0");
  await expect(recipes).toContainText("evaporation.surface-to-vapour@1.0.0");
  await expect(recipes).toContainText("settled frames per change");
});

test("shows the evaluated ledger, with in-transit money counted separately", async ({
  page,
}) => {
  await expect(page.getByTestId("demonstration-state-ledger")).toContainText(
    "in transit",
  );
  await expect(page.getByTestId("demonstration-state-ledger")).toContainText(
    "total",
  );
});
