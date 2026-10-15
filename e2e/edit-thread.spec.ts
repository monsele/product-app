import { expect, test, type Page } from "@playwright/test";

// ST-115: one conversational edit through to the scene preview, with the
// planning provider mocked (e2e/edit-thread-mock.mjs). Each test seeds its
// own project so the shared mock server's state never leaks between specs.

const firstSceneId = "019ffbf1-6151-738a-b087-6775ff97568c";

async function openStoryboard(page: Page, projectId: string): Promise<void> {
  const seeded = await page.request.post("http://127.0.0.1:3002/__edit-thread/seed", {
    data: { projectId },
  });
  expect(seeded.ok()).toBe(true);
  await page.context().addCookies([
    { name: "avlp_session", value: "teacher-session", url: "http://127.0.0.1:3000" },
  ]);
  await page.goto(`/workspace/${projectId}/storyboard#scene=${firstSceneId}`);
  await expect(page.getByRole("region", { name: "Ask for changes" })).toBeVisible();
}

test("plans, applies and reviews a request by keyboard, then previews the change", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStoryboard(page, "019ffbf1-61aa-738a-b087-6775ff975115");
  const panel = page.getByRole("region", { name: "Ask for changes" });

  // Keyboard only: type into the scoped field and send with Ctrl+Enter.
  const field = panel.getByLabel("Describe how to revise scene 1");
  await field.focus();
  await page.keyboard.type("Make this scene simpler");
  const sent = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/edit-thread/messages"),
  );
  await page.keyboard.press("Control+Enter");
  const request = await sent;
  // Sending keeps the keyboard user in the field.
  await expect(field).toBeFocused();
  expect(request.headers()["idempotency-key"]).toBeTruthy();
  expect(request.postDataJSON()).toMatchObject({
    text: "Make this scene simpler",
    scope: { kind: "scene", sceneIds: [firstSceneId] },
  });

  // With reduced motion, new thread items appear without an entrance offset.
  const requestItem = panel.locator("li").filter({ hasText: "Make this scene simpler" }).first();
  await expect(requestItem).toBeVisible();
  expect(
    await requestItem.evaluate((element) => getComputedStyle(element).transform),
  ).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/u);

  // Nothing changes until the teacher applies the proposal.
  const preview = page.getByRole("region", { name: "Selected scene preview" });
  await expect(preview).not.toContainText("Puddles, simply");
  await expect(panel.getByText("Proposed — nothing has changed yet")).toBeVisible();
  await expect(panel.getByText("Scene 1 · Simplify")).toBeVisible();
  const apply = panel.getByRole("button", { name: "Apply all" });
  await apply.focus();
  await page.keyboard.press("Enter");

  // The generated version hands off to the existing before/after review.
  await expect(panel.getByText("Ready to review")).toBeVisible({ timeout: 15_000 });
  const candidates = page.getByRole("list", { name: "Scene regeneration candidates" });
  await expect(candidates).toBeVisible({ timeout: 15_000 });
  await candidates.getByRole("button", { name: "Apply candidate" }).click();

  // The selected scene's preview player shows the accepted change.
  await expect(preview).toContainText("Puddles, simply", { timeout: 15_000 });
});

test("applies part of a plan, shows it as partly applied, and undoes it", async ({ page }) => {
  await openStoryboard(page, "019ffbf1-61ab-738a-b087-6775ff975115");
  const panel = page.getByRole("region", { name: "Ask for changes" });
  await panel.getByLabel("Describe how to revise scene 1").fill("Use a gentler transition and a shorter title");
  await panel.getByRole("button", { name: "Ask for changes" }).click();

  await expect(panel.getByText("Scene 1 · Transition")).toBeVisible();
  await expect(panel.getByText("Scene 1 · Title")).toBeVisible();
  // Keep only the transition: uncheck the title edit and apply the selection.
  await panel.getByRole("checkbox", { name: "Scene 1 · Title" }).uncheck();
  const applied = page.waitForRequest((request) => request.url().includes("/apply"));
  await panel.getByRole("button", { name: "Apply selected (1)" }).click();
  expect((await applied).postDataJSON()).toMatchObject({ operationIds: ["op-1"] });

  await expect(panel.getByText("Partly applied")).toBeVisible();
  await expect(panel.getByText("Not applied")).toBeVisible();
  await panel.getByRole("button", { name: "Undo this change" }).click();
  await expect(panel.getByText("Undone")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Undo this change" })).toHaveCount(0);

  // The thread reloads with every turn and its outcome.
  await page.reload();
  await expect(panel.getByText("Use a gentler transition and a shorter title")).toBeVisible();
  await expect(panel.getByText("Undone")).toBeVisible();
});
