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
      request.method() === "POST" && request.url().includes("/scenes/reorder"),
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

test("edits the selected scene and refreshes preview only after persistence", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  await expect(page.getByTestId("scene-editor")).toBeVisible();
  await page.getByLabel("Narration").fill("Water rises as vapour.");
  const saveRequest = page.waitForRequest(
    (request) =>
      request.method() === "PATCH" &&
      request.url().includes(`/scenes/${firstSceneId}`),
  );
  await page.route(`**/scenes/${firstSceneId}`, async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON() as {
      expectedRevision: number;
      scene: Record<string, unknown>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        revision: body.expectedRevision + 1,
        scene: {
          id: firstSceneId,
          stableSceneId: firstSceneId,
          order: 1,
          template: body.scene.template,
          durationSeconds: body.scene.durationSeconds,
          narrationBlockIds: ["019ffbf1-6111-738a-b087-6775ff97568c"],
          assetRequirements: [],
          scene: body.scene,
        },
        invalidated: ["audio", "captions", "preview", "render", "validation"],
        warning: null,
        requiresConfirmation: false,
        resetFields: [],
      }),
    });
  });
  await page.getByRole("button", { name: "Save scene" }).click();
  const request = await saveRequest;
  expect(request.postDataJSON().scene.narration).toBe("Water rises as vapour.");
  await expect(page.getByText(/Saved\. Invalidated:/)).toBeVisible();
});

test("confirms template migration before resetting incompatible fields", async ({
  page,
}) => {
  await setSessionCookie(page);
  await page.goto(`/workspace/${projectId}/storyboard`);
  const commands: Array<{ confirmReset?: boolean }> = [];
  await page.route(
    `**/scenes/${firstSceneId}/change-template`,
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as { confirmReset?: boolean };
      commands.push(body);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          revision: body.confirmReset ? 1 : 0,
          scene: {
            id: firstSceneId,
            stableSceneId: firstSceneId,
            order: 1,
            template: "summary",
            durationSeconds: 30,
            narrationBlockIds: ["019ffbf1-6111-738a-b087-6775ff97568c"],
            assetRequirements: [],
            scene: {
              id: firstSceneId,
              order: 1,
              narration: "Water moves through the environment.",
              durationSeconds: 30,
              onScreenText: [],
              transition: "cut",
              assetBindings: [],
              sourceRefs: [
                {
                  documentId: projectId,
                  parsedDocumentVersion: 1,
                  pageStart: 1,
                  blockIds: ["019ffbf1-6111-738a-b087-6775ff97568c"],
                },
              ],
              generatedAdditions: [],
              template: "summary",
              visual: { takeaways: [{ text: "The cycle repeats." }] },
            },
          },
          invalidated: ["preview", "render", "validation"],
          warning: null,
          requiresConfirmation: !body.confirmReset,
          resetFields: ["visual.definition"],
        }),
      });
    },
  );
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .getByTestId("scene-editor")
    .getByLabel("Template")
    .selectOption("summary");
  await expect(page.getByText(/Template changed\. Invalidated:/)).toBeVisible();
  expect(commands.map((command) => command.confirmReset)).toEqual([
    false,
    true,
  ]);
});
