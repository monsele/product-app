/**
 * ST-103 — hydrated browser coverage for the sound bed picker and the render
 * review panel, on the real Next app.
 *
 * The configuration page loads its data in the browser, so this spec answers
 * those calls itself (including a stateful configuration store, which is what
 * makes "persists on reload" a real round trip). The render page loads on the
 * server, so its reviewed render comes from `workspace-mock-api.mjs`.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

const projectId = "019ffbf1-610e-738a-b087-6775ff97568c";
const api = "http://127.0.0.1:3002";

function wavTone(seconds: number): Buffer {
  const rate = 8_000;
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index += 1)
    data.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * 440 * index) / rate) * 8_000),
      index * 2,
    );
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const tracks = [
  { trackId: "morning-pad", title: "Morning Pad", moodTags: ["calm", "warm"] },
  { trackId: "quiet-pulse", title: "Quiet Pulse", moodTags: ["focused", "calm"] },
].map((track) => ({
  ...track,
  durationMs: 16_000,
  loops: true,
  integratedLoudnessLufs: -20,
  licenseId: "CC0-1.0",
  sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionText: null,
  auditionUrl: `${api}/audition/${track.trackId}.wav`,
  auditionExpiresAt: "2026-09-26T08:05:00.000Z",
}));

async function withConfigurationApi(page: Page) {
  const saves: Array<Record<string, unknown>> = [];
  const auditions: string[] = [];
  let configuration: Record<string, unknown> = {
    version: 1,
    ageBand: "11-13",
    difficulty: "introductory",
    subject: "Biology",
    lessonTitle: "The Water Cycle",
    targetDurationSeconds: 300,
    tone: "friendly",
    visualTheme: "mvp-default",
    videoApproach: "standard",
    creativeStylePack: null,
    soundBed: "none",
    includeRecallQuestions: false,
    sourceParsedDocumentVersion: 1,
    updatedAt: "2026-09-26T08:00:00.000Z",
  };
  const json = (route: Route, body: unknown) =>
    route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      headers: {
        "access-control-allow-credentials": "true",
        "access-control-allow-origin": "http://127.0.0.1:3000",
      },
    });
  const response = () => ({
    configuration,
    source: { parsedDocumentVersion: 1, sourceReviewComplete: true },
    narrationTarget: { min: 504, target: 560, max: 644 },
    canProceed: true,
  });
  await page.route(`${api}/projects/${projectId}/configuration`, async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({
      status: 204,
      headers: {
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "content-type",
        "access-control-allow-methods": "GET, PUT, OPTIONS",
        "access-control-allow-origin": "http://127.0.0.1:3000",
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
    return json(route, response());
  });
  await page.route(`${api}/projects/${projectId}/voice-configuration`, (route) =>
    json(route, { configuration: null }),
  );
  await page.route(`${api}/projects/${projectId}/demonstration-eligibility`, (route) =>
    route.fulfill({ status: 404, body: "{}" }),
  );
  await page.route(`${api}/sound-beds`, (route) => json(route, { tracks }));
  await page.route(`${api}/audition/*.wav`, (route) => {
    auditions.push(route.request().url());
    return route.fulfill({
      body: wavTone(2),
      contentType: "audio/wav",
      headers: { "access-control-allow-origin": "*" },
    });
  });
  return { auditions, saves };
}

async function signIn(page: Page) {
  await page.context().addCookies([
    { name: "avlp_session", value: "teacher-session", url: "http://127.0.0.1:3000" },
  ]);
}

test("the sound bed picker auditions, saves, and persists across a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { auditions, saves } = await withConfigurationApi(page);
  await page.goto(`/workspace/${projectId}/configuration`);

  const group = page.getByRole("radiogroup", { name: "Background sound" });
  await expect(group).toBeVisible();
  await expect(
    group.getByRole("radio", { name: /No background music/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(group.getByRole("radio")).toHaveCount(3);

  // Audition plays the signed preview, and stops on a second press.
  const play = page.getByRole("button", { name: "Play a preview of Quiet Pulse" });
  await play.click();
  await expect(
    page.getByRole("button", { name: "Stop a preview of Quiet Pulse" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => auditions.length).toBeGreaterThan(0);
  expect(auditions[0]).toContain("/audition/quiet-pulse.wav");
  await expect
    .poll(() =>
      page
        .getByTestId("sound-bed-audition")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop a preview of Quiet Pulse" }).click();
  await expect(play).toHaveAttribute("aria-pressed", "false");

  // Choosing a track updates the summary and is sent on save.
  await group.getByRole("radio", { name: /Quiet Pulse/ }).click();
  await expect(
    group.getByRole("radio", { name: /Quiet Pulse/ }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: /Save/ }).first().click();
  await expect.poll(() => saves.at(-1)?.soundBed).toBe("quiet-pulse");

  // A reload reads the saved value back from the API.
  await page.reload();
  await expect(
    page
      .getByRole("radiogroup", { name: "Background sound" })
      .getByRole("radio", { name: /Quiet Pulse/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("Background Sound:")).toBeVisible();
});

test("the render page shows the blocking review with timestamps, corrections, loudness and the contact sheet", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.goto(`/workspace/${projectId}/render`);

  const panel = page.getByTestId("render-review-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("render-review-outcome")).toHaveText(
    "Not delivered: fix the issues below",
  );
  const findings = panel.getByTestId("render-review-finding");
  await expect(findings).toHaveCount(2);
  await expect(findings.first()).toHaveAttribute("data-severity", "error");
  await expect(findings.first()).toContainText("Blocking at 0:12.0");
  await expect(findings.first()).toContainText(
    "Regenerate the narration audio for the scene at this time",
  );
  await expect(findings.nth(1)).toHaveAttribute("data-severity", "warning");
  await expect(page.getByTestId("render-review-loudness")).toHaveText(
    "-22.4 LUFS",
  );
  await expect(
    page.getByTestId("render-review-contact-sheet").getByRole("img"),
  ).toHaveCount(4);
  await expect(
    page.getByRole("img", { name: "Video frame at 0:57.0" }),
  ).toBeVisible();
  // A blocked video offers no download.
  await expect(page.getByRole("link", { name: /Download MP4/i })).toHaveCount(0);
});
