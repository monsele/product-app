/**
 * ST-104: hydrated browser coverage for the optional lesson focus, the adult
 * and advanced audience options, and the objectives focus-coverage notice,
 * on the real Next app.
 *
 * The configuration page loads its data in the browser, so this spec answers
 * those calls itself with a stateful store; "persists on reload" is a real
 * round trip. The objectives response comes from `workspace-mock-api.mjs` with
 * a coverage report added in flight.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const api = "http://127.0.0.1:3002";
const cors = {
  "access-control-allow-credentials": "true",
  "access-control-allow-origin": "http://127.0.0.1:3000",
};

async function withConfigurationApi(page: Page) {
  const saves: Array<Record<string, unknown>> = [];
  let configuration: Record<string, unknown> = {
    version: 1,
    ageBand: "11-13",
    difficulty: "introductory",
    subject: "History",
    lessonTitle: "The printing press",
    targetDurationSeconds: 300,
    tone: "friendly",
    visualTheme: "mvp-default",
    videoApproach: "standard",
    creativeStylePack: null,
    soundBed: "none",
    focusPrompt: null,
    includeRecallQuestions: false,
    sourceParsedDocumentVersion: 1,
    updatedAt: "2026-09-27T08:00:00.000Z",
  };
  const json = (route: Route, body: unknown) =>
    route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      headers: cors,
    });
  await page.route(`${api}/projects/${projectId}/configuration`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          ...cors,
          "access-control-allow-headers": "content-type",
          "access-control-allow-methods": "GET, PUT, OPTIONS",
        },
      });
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as Record<string, unknown>;
      saves.push(body);
      configuration = {
        ...configuration,
        ...Object.fromEntries(
          Object.entries(body).filter(([key]) => key !== "expectedVersion"),
        ),
        version: (configuration.version as number) + 1,
      };
    }
    return json(route, {
      configuration,
      source: { parsedDocumentVersion: 1, sourceReviewComplete: true },
      narrationTarget: { min: 504, target: 560, max: 644 },
      canProceed: true,
    });
  });
  await page.route(`${api}/projects/${projectId}/voice-configuration`, (route) =>
    json(route, { configuration: null }),
  );
  await page.route(`${api}/projects/${projectId}/demonstration-eligibility`, (route) =>
    route.fulfill({ status: 404, body: "{}" }),
  );
  await page.route(`${api}/sound-beds`, (route) => json(route, { tracks: [] }));
  return { saves };
}

async function signIn(page: Page) {
  await page.context().addCookies([
    { name: "avlp_session", value: "teacher-session", url: "http://127.0.0.1:3000" },
  ]);
}

test("the focus field and adult audience options save and persist across a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { saves } = await withConfigurationApi(page);
  await page.goto(`/workspace/${projectId}/configuration`);

  const focus = page.getByLabel(/What should the lesson focus on\?/);
  await expect(focus).toBeVisible();
  await expect(focus).toHaveValue("");

  const ageBands = page.getByRole("radiogroup", { name: "Target age band" });
  await expect(ageBands.getByRole("radio", { name: /Professional/ })).toBeVisible();
  await expect(
    ageBands.getByRole("radio", { name: /Adult, some background/ }),
  ).toBeVisible();
  const difficulty = page.getByRole("radiogroup", { name: "Difficulty level" });
  await expect(difficulty.getByRole("radio", { name: /Advanced/ })).toBeVisible();

  await ageBands.getByRole("radio", { name: /Professional/ }).click();
  await difficulty.getByRole("radio", { name: /Advanced/ }).click();
  const typed = "  How did print change religious authority?  ";
  await focus.fill(typed);
  await expect(page.getByText(`${typed.length} / 1,000`)).toBeVisible();

  await page.getByRole("button", { name: /Save/ }).first().click();
  await expect.poll(() => saves.at(-1)?.focusPrompt).toBe(
    "How did print change religious authority?",
  );
  expect(saves.at(-1)).toMatchObject({
    ageBand: "adult-professional",
    difficulty: "advanced",
  });

  await page.reload();
  await expect(page.getByLabel(/What should the lesson focus on\?/)).toHaveValue(
    "How did print change religious authority?",
  );
  await expect(
    page
      .getByRole("radiogroup", { name: "Target age band" })
      .getByRole("radio", { name: /Professional/ }),
  ).toHaveAttribute("aria-checked", "true");

  // Clearing the field saves no focus at all.
  await page.getByLabel(/What should the lesson focus on\?/).fill("");
  await page.getByRole("button", { name: /Save/ }).first().click();
  await expect.poll(() => saves.length).toBe(2);
  expect(saves.at(-1)?.focusPrompt).toBeNull();
});

test("objectives show an advisory notice when the source cannot answer the focus", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.route(`${api}/projects/${projectId}/objectives`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = (await response.json()) as {
      set: Record<string, unknown> | null;
    };
    if (body.set !== null)
      body.set = {
        ...body.set,
        focusCoverage: {
          status: "not_covered",
          reason: "The source describes the water cycle, not glaciers.",
        },
      };
    return route.fulfill({ response, body: JSON.stringify(body) });
  });
  await page.goto(`/workspace/${projectId}/objectives`);

  await expect(page.getByText("Focus not covered by the source")).toBeVisible();
  await expect(
    page.getByText(/The source describes the water cycle, not glaciers\./),
  ).toBeVisible();
  // Advisory only: the teacher can still approve.
  await expect(
    page.getByRole("button", { name: "Approve objectives" }),
  ).toBeEnabled();
});
