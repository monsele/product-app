/**
 * ST-106: hydrated browser coverage for the prompt-to-video screens on the
 * real Next app, against the stateful one-shot mock in `one-shot-mock.mjs`.
 *
 * - `pilot-session` is in the cohort; `teacher-session` is not.
 * - Each `GET one-shot` poll advances the mock run by one step, so these runs
 *   take about as long as the client's 2 s poll interval allows.
 * - `/__one-shot/state` reports how many runs and renders the server really
 *   created, which is what the double-click checks assert on.
 */
import { expect, test, type Page } from "@playwright/test";

const api = "http://127.0.0.1:3002";
const app = "http://127.0.0.1:3000";

let seedCounter = 0;
function projectIdFor(label: string): string {
  seedCounter += 1;
  const suffix = `${Date.now().toString(16).slice(-8)}${String(seedCounter).padStart(4, "0")}`;
  return `019ffbf1-6200-7106-8${label.padStart(3, "0").slice(0, 3)}-${suffix}`;
}

async function seed(
  page: Page,
  input: {
    documentUploaded: boolean;
    scenario?: "golden" | "attention" | "not_covered" | "partial";
  },
): Promise<string> {
  const projectId = projectIdFor(
    input.scenario === undefined ? "001" : String(input.scenario.length),
  );
  const response = await page.request.post(`${api}/__one-shot/seed`, {
    data: { projectId, title: "Water cycle quick video", ...input },
  });
  expect(response.ok()).toBe(true);
  return projectId;
}

async function serverState(page: Page, projectId: string) {
  const response = await page.request.get(
    `${api}/__one-shot/state?projectId=${projectId}`,
  );
  return (await response.json()) as {
    runs: number;
    createCalls: number;
    renderCalls: number;
    rendersStarted: number;
    statuses: string[];
  };
}

async function signIn(
  page: Page,
  session: "pilot-session" | "teacher-session",
) {
  // Host-scoped, so the browser also sends it to the mock API on :3002. The
  // dev server's form redirects resolve to `localhost`, so set both hosts.
  await page.context().addCookies([
    { name: "avlp_session", value: session, domain: "127.0.0.1", path: "/" },
    { name: "avlp_session", value: session, domain: "localhost", path: "/" },
  ]);
}

const focusPrompt =
  "Explain how evaporation and condensation drive the water cycle.";

/** Records every URL the browser requests or navigates to. */
function watchUrls(page: Page): { requests: string[]; pages: string[] } {
  const seen = { requests: [] as string[], pages: [] as string[] };
  page.on("request", (request) => seen.requests.push(request.url()));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) seen.pages.push(frame.url());
  });
  return seen;
}

async function fillRequest(page: Page, prompt = focusPrompt) {
  await page.getByLabel("What should the video explain?").fill(prompt);
  await page.getByRole("radio", { name: /Myself \(adult learner\)/ }).check();
  await page.getByRole("radio", { name: "3 minutes" }).check();
  await expect(page.getByTestId("one-shot-estimate-total")).toBeVisible();
}

async function startRun(page: Page, projectId: string) {
  await page.goto(`/workspace/${projectId}/one-shot`);
  await fillRequest(page);
  await page.getByTestId("one-shot-create").click();
  await expect(page.getByTestId("one-shot-progress")).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: "serial" });

test("the workspace entry is shown only to the pilot cohort, and the route is unavailable outside it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, "teacher-session");
  await page.goto("/workspace");
  await expect(
    page.getByRole("heading", { name: "Your lessons" }),
  ).toBeVisible();
  await expect(page.getByText("Quick video from a PDF")).toHaveCount(0);

  const projectId = await seed(page, { documentUploaded: true });
  await page.goto(`/workspace/${projectId}/one-shot`);
  await expect(page.getByTestId("one-shot-unavailable")).toBeVisible();
  await expect(page.getByTestId("one-shot-create")).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page, "pilot-session");
  await page.goto("/workspace");
  const option = page.getByRole("radio", { name: /Quick video from a PDF/ });
  await expect(option).toBeVisible();
  await page.getByLabel("Project title").fill("Quick video from the entry");
  await option.check();
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page).toHaveURL(/\/workspace\/[^/]+\/one-shot$/);
  await expect(
    page.getByRole("heading", { name: "Quick video from a PDF" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Describe the video" }),
  ).toBeVisible();
});

test("golden path: upload, prompt, estimate, create, progress, preview, render and download without the wizard", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await signIn(page, "pilot-session");
  const projectId = await seed(page, {
    documentUploaded: false,
    scenario: "partial",
  });
  const seen = watchUrls(page);
  await page.goto(`/workspace/${projectId}/one-shot`);

  // Upload through the existing upload panel.
  await expect(
    page.getByRole("heading", { name: "Source document" }),
  ).toBeVisible();
  await page.locator("#source-document").setInputFiles({
    name: "water-cycle.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% mock water cycle\n"),
  });
  await page.getByRole("button", { name: /Upload document/ }).click();
  // Once it passes validation the upload panel gives way to a ready summary.
  await expect(page.getByTestId("one-shot-document-ready")).toBeVisible({
    timeout: 30_000,
  });

  // Inline validation before anything is sent.
  await page.getByTestId("one-shot-create").click();
  await expect(
    page.getByText("Describe what the video should explain."),
  ).toBeVisible();
  await expect(page.getByText("Choose who the video is for.")).toBeVisible();
  expect((await serverState(page, projectId)).createCalls).toBe(0);

  await fillRequest(page);
  await expect(page.getByTestId("one-shot-focus-count")).toHaveText(
    `${focusPrompt.length} / 1,000 characters`,
  );
  await expect(page.getByTestId("one-shot-estimate-item")).toHaveCount(3);

  // A double click creates one run.
  await page.getByTestId("one-shot-create").dblclick();
  await expect(page.getByTestId("one-shot-progress")).toBeVisible();
  await expect(page.getByTestId("one-shot-live")).toContainText(
    "Building your video",
  );
  await expect(page.getByTestId("one-shot-cost")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Preview approval.
  await expect(page.getByTestId("one-shot-approval")).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByTestId("one-shot-player")).toBeVisible();
  await expect(page.getByTestId("one-shot-coverage")).toContainText(
    "How clouds form",
  );
  await expect(page.getByTestId("one-shot-warnings")).toContainText(
    "shorter than the 3 minutes requested",
  );
  await expect(page.getByTestId("one-shot-refine")).toHaveAttribute(
    "href",
    `/workspace/${projectId}/storyboard`,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // A double click starts one render.
  await page.getByTestId("one-shot-render").dblclick();
  await expect(page.getByTestId("one-shot-delivery")).toBeVisible();
  await expect(page.getByTestId("one-shot-delivery")).toHaveAttribute(
    "data-status",
    "completed",
    {
      timeout: 60_000,
    },
  );
  await expect(page.getByText("Video ready")).toBeVisible();
  const latest = page.getByLabel("Latest production render");
  await expect(
    latest.getByRole("button", { name: "Download MP4" }),
  ).toBeVisible({ timeout: 30_000 });
  const download = page.waitForEvent("download");
  await latest.getByRole("button", { name: "Download MP4" }).click();
  expect((await download).suggestedFilename()).toBe("lesson.mp4");

  const state = await serverState(page, projectId);
  expect(state.runs).toBe(1);
  expect(state.rendersStarted).toBe(1);
  expect(state.statuses).toEqual(["completed"]);

  // Never through a wizard page, and the prompt never in a URL.
  expect(
    seen.pages.filter(
      (url) => url.startsWith(app) && !url.endsWith("/one-shot"),
    ),
  ).toEqual([]);
  const promptWords = ["evaporation", "condensation"];
  for (const url of seen.requests)
    for (const word of promptWords)
      expect(url.toLowerCase()).not.toContain(word);
});

test("reloading mid-run restores the current step and polling resumes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, "pilot-session");
  const projectId = await seed(page, { documentUploaded: true });
  await startRun(page, projectId);
  await expect(
    page.locator('[data-step="planning"][data-state="done"]'),
  ).toBeVisible({
    timeout: 30_000,
  });

  await page.reload();
  await expect(page.getByTestId("one-shot-progress")).toBeVisible();
  await expect(
    page.locator('[data-step="reading"][data-state="done"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-step="planning"][data-state="done"]'),
  ).toBeVisible();
  await expect(page.getByTestId("one-shot-approval")).toBeVisible({
    timeout: 90_000,
  });
  expect((await serverState(page, projectId)).runs).toBe(1);
});

test("cancel asks for confirmation, stops the run and returns to the request", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page, "pilot-session");
  const projectId = await seed(page, { documentUploaded: true });
  await startRun(page, projectId);

  await page.getByTestId("one-shot-cancel").click();
  const dialog = page.getByRole("dialog", { name: "Cancel this video?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Keep building" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await serverState(page, projectId)).statuses).not.toContain(
    "cancelled",
  );

  await page.getByTestId("one-shot-cancel").click();
  await page.getByTestId("one-shot-cancel-confirm").click();
  await expect(
    page.getByRole("heading", { name: "Describe the video" }),
  ).toBeVisible();
  // The cancelled request is kept so it can be adjusted and started again.
  await expect(page.getByLabel("What should the video explain?")).toHaveValue(
    focusPrompt,
  );
  expect((await serverState(page, projectId)).statuses).toEqual(["cancelled"]);
});

test("needs attention deep-links the wizard stage, the wizard links back, and Resume continues", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, "pilot-session");
  const projectId = await seed(page, {
    documentUploaded: true,
    scenario: "attention",
  });
  await startRun(page, projectId);

  const card = page.getByTestId("one-shot-attention");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText(
    "The outline draft cannot be approved as generated.",
  );
  await expect(
    page.locator('[data-step="outline"][data-state="attention"]'),
  ).toBeVisible();
  const link = page.getByTestId("one-shot-attention-link");
  await expect(link).toHaveAttribute("href", `/workspace/${projectId}/outline`);

  await link.click();
  // A cold `next dev` compiles the wizard page on first visit.
  await expect(page).toHaveURL(new RegExp(`/workspace/${projectId}/outline$`), {
    timeout: 60_000,
  });
  const back = page.getByTestId("one-shot-run-link");
  await expect(back).toBeVisible({ timeout: 30_000 });
  await back.click();
  await expect(page).toHaveURL(
    new RegExp(`/workspace/${projectId}/one-shot$`),
    {
      timeout: 60_000,
    },
  );

  await page.getByTestId("one-shot-resume").dblclick();
  await expect(page.getByTestId("one-shot-progress")).toBeVisible();
  await expect(page.getByTestId("one-shot-approval")).toBeVisible({
    timeout: 90_000,
  });
  expect((await serverState(page, projectId)).runs).toBe(1);
});

test("not covered shows the reason and Edit prompt starts a new run", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page, "pilot-session");
  // The document is uploaded on this page, so Edit prompt must not forget it
  // when the request form comes back (a regression found in the live run).
  const projectId = await seed(page, {
    documentUploaded: false,
    scenario: "not_covered",
  });
  await page.goto(`/workspace/${projectId}/one-shot`);
  await page.locator("#source-document").setInputFiles({
    name: "water-cycle.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% mock water cycle\n"),
  });
  await page.getByRole("button", { name: /Upload document/ }).click();
  await expect(page.getByTestId("one-shot-document-ready")).toBeVisible({
    timeout: 30_000,
  });
  await fillRequest(page);
  await page.getByTestId("one-shot-create").click();
  await expect(page.getByTestId("one-shot-progress")).toBeVisible();

  const card = page.getByTestId("one-shot-not-covered");
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(card).toContainText(
    "The document describes the water cycle, not volcanoes.",
  );
  await page.getByTestId("one-shot-edit-prompt").click();

  const field = page.getByLabel("What should the video explain?");
  await expect(field).toHaveValue(focusPrompt);
  await expect(page.getByTestId("one-shot-document-ready")).toBeVisible();
  await field.fill("Explain the stages of the water cycle in order.");
  await expect(page.getByTestId("one-shot-estimate-total")).toBeVisible();
  await page.getByTestId("one-shot-create").click();
  await expect(page.getByTestId("one-shot-progress")).toBeVisible();
  await expect(page.getByTestId("one-shot-approval")).toBeVisible({
    timeout: 90_000,
  });

  const state = await serverState(page, projectId);
  expect(state.runs).toBe(2);
  expect(state.statuses).toEqual(["cancelled", "awaiting_render_approval"]);
});
