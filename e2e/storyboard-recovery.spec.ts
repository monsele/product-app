import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";
test("preparation preserves editing and preview, including background refresh and narrow layouts", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page
    .context()
    .addCookies([
      {
        name: "avlp_session",
        value: "teacher-session",
        url: "http://127.0.0.1:3000",
      },
    ]);
  let finished = false;
  let paidCommands = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/recovery(?:\/|$)/.test(new URL(request.url()).pathname)
    )
      paidCommands++;
  });
  await page.route("**/readiness", (route) =>
    route.fulfill({
      json: {
        enabled: true,
        revision: finished ? 1 : 0,
        capabilities: { edit: true, preview: true, render: finished },
        state: finished ? "ready" : "preparing",
        actualDurationSeconds: 238,
        targetDurationSeconds: 180,
        validationRunId: null,
        runId: projectId,
        allowanceUsd: 0.1,
        reservedUsd: 0.02,
        completedTasks: finished ? 1 : 0,
        tasks: finished
          ? []
          : [
              {
                id: "scene-preparation",
                sceneId,
                operation: "audio",
                issueCodes: [
                  "audio_not_ready",
                  "captions_not_ready",
                  "narration_duration_mismatch",
                ],
                state: "running",
                attempts: 1,
                failureCode: null,
                action: null,
                message:
                  "Preparing audio, captions and timing. You can keep editing.",
              },
            ],
      },
    }),
  );
  await page.route(`**/storyboard/scenes/${sceneId}`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (finished) {
      body.scene.durationSeconds = 42;
      body.scene.scene.durationSeconds = 42;
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto(`/workspace/${projectId}/storyboard`);
  await expect(
    page.getByRole("region", { name: "Lesson preparation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Preview lesson", exact: true }),
  ).toBeVisible();
  await mkdir(".runtime-logs/recovery", { recursive: true });
  await page.screenshot({
    path: ".runtime-logs/recovery/storyboard-preparing.png",
    fullPage: true,
  });
  const narration = page.getByRole("textbox", {
    name: "Narration script",
    exact: true,
  });
  await narration.fill("Unsaved teacher explanation remains here.");
  await narration.focus();
  finished = true;
  await expect(
    page.getByText("Ready to render · 3:58", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(narration).toHaveValue(
    "Unsaved teacher explanation remains here.",
  );
  await expect(narration).toBeFocused();
  expect(paidCommands).toBe(0);
  const require = createRequire(resolve("apps/web/package.json"));
  await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (selector: string) => Promise<{ violations: { id: string }[] }>;
        };
      }
    ).axe;
    return (await axe.run('[aria-label="Lesson preparation"]')).violations.map(
      (violation) => violation.id,
    );
  });
  expect(violations).toEqual([]);
  const output = ".runtime-logs/recovery";
  await mkdir(output, { recursive: true });
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 375, height: 812 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.getByRole("region", { name: "Lesson preparation" }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/storyboard-${viewport.width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  const progress = page.getByText("View progress · 1 task completed", {
    exact: true,
  });
  await progress.focus();
  await progress.press("Enter");
  await expect(
    page.getByRole("button", { name: "Stop further preparation" }),
  ).toBeVisible();
  await page.screenshot({
    path: `${output}/storyboard-200-percent.png`,
    fullPage: true,
  });
  finished = false;
  await page.goto(`/workspace/${projectId}/preview`);
  await expect(page.getByRole("region", { name: "Full lesson preview player" })).toBeVisible();
  await expect(page.getByText("Audio preparing · Visual preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Scene 2", exact: true }).click();
  await expect(page.getByText("Scene 2 of 2", { exact: true })).toBeVisible();
  expect(paidCommands).toBe(0);
});
