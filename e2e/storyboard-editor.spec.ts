import { expect, test } from "@playwright/test";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const firstSceneId = "019ffbf1-6151-738a-b087-6775ff97568c";

async function setSessionCookie(page: import("@playwright/test").Page) {
  await page.context().addCookies([
    {
      name: "avlp_session",
      value: "teacher-session",
      url: "http://127.0.0.1:3000",
    },
  ]);
}

test("mounts a preview only for the selected scene at maximum scene count", async ({
  page,
}) => {
  await setSessionCookie(page);
  const scenes = Array.from({ length: 100 }, (_, index) => {
    const suffix = (index + 1).toString(16).padStart(2, "0");
    const sceneId =
      index === 0
        ? firstSceneId
        : `019ffbf1-6151-738a-b087-6775ff9756${suffix}`;
    return {
      sceneId,
      order: index + 1,
      template: "definition",
      title: null,
      narrationSummary: `Scene ${index + 1} narration summary for the water cycle lesson.`,
      narrationBlockCount: 1,
      durationSeconds: 30,
      status: {
        assets: "none",
        audio: "not_generated",
        validation: "ok",
        stale: false,
      },
    };
  });
  await page.route("**/storyboard/scenes", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        revision: 0,
        stale: false,
        staleReason: null,
        totalDurationSeconds: 3000,
        targetDurationSeconds: 180,
        scenes,
      }),
    }),
  );
  await page.goto(`/workspace/${projectId}/storyboard`);
  await expect(page.getByTestId("storyboard-scene-detail")).toBeVisible();
  await expect(page.locator('[data-testid="scene-preview-frame"]')).toHaveCount(
    1,
  );
  await expect(
    page.getByTestId(`storyboard-scene-${firstSceneId}`),
  ).toBeVisible();

  const list = page.getByRole("listbox", { name: "Storyboard scenes" });
  await expect(list).toBeVisible();
  const renderedRows = await page
    .locator('[data-testid^="storyboard-scene-"]')
    .count();
  expect(renderedRows).toBeGreaterThan(0);
  expect(renderedRows).toBeLessThan(30);

  const totalContentHeight = await list.evaluate(
    (element) => element.scrollHeight,
  );
  expect(totalContentHeight).toBeGreaterThan(100 * 60);
});

const secondSceneId = "019ffbf1-6154-738a-b087-6775ff97568c";

test("reorders scenes by dragging one above another", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  const sourceSelector = `[data-testid="storyboard-scene-${secondSceneId}"]`;
  const targetSelector = `[data-testid="storyboard-scene-${firstSceneId}"]`;
  await expect(page.locator(sourceSelector)).toBeVisible();
  await expect(page.locator(targetSelector)).toBeVisible();

  const reorderRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().includes("/scenes/reorder"),
  );
  await page.dragAndDrop(sourceSelector, targetSelector);
  const request = await reorderRequest;
  const body = request.postDataJSON();
  expect(body.sceneIds).toEqual([secondSceneId, firstSceneId]);
});

test("adds and then deletes a storyboard scene", async ({ page }) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  const list = page.getByRole("listbox", { name: "Storyboard scenes" });
  const rows = list.locator("li[role='option']");
  await expect(list).toBeVisible();
  const before = await rows.count();
  await page.getByRole("button", { name: "Add scene" }).click();
  await expect(rows).toHaveCount(before + 1);

  await rows.last().click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(rows).toHaveCount(before);
});
