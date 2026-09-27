// ST-106 live evidence driver (untracked). Drives the prompt-to-video screens
// in a real browser against the full local stack (mock providers):
//   1. a user outside the cohort: no entry on /workspace, "unavailable" route;
//   2. the cohort user, three different-subject PDFs in parallel:
//      workspace entry -> upload -> prompt -> estimate -> Create video ->
//      progress (+ reload, + phone width) -> preview approval -> Render -> download.
//      Subject 1 first asks for something the PDF does not cover, to show
//      not_covered -> Edit prompt -> a new run.
// Screenshots: .runtime-logs/st106-<subject>-<n>-<state>.png
// Run from the repo root:  node .runtime-logs/st106-drive.mjs
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

const APP = "http://localhost:3000";
const OUT = ".runtime-logs";
const cohort = JSON.parse(readFileSync(`${OUT}/st105-state.json`, "utf8"));
const password = "CorrectHorse!9batt";
const results = [];

const require_ = createRequire(new URL("../apps/pipeline-worker/index.js", import.meta.url));
const { PDFDocument, StandardFonts } = require_("pdf-lib");

async function makePdf(path, title, sections) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  let y = 780;
  page.drawText(title, { x: 60, y, size: 24, font: bold });
  y -= 44;
  for (const [heading, lines] of sections) {
    page.drawText(heading, { x: 60, y, size: 16, font: bold });
    y -= 26;
    for (const line of lines) {
      page.drawText(line, { x: 60, y, size: 12, font });
      y -= 20;
    }
    y -= 12;
  }
  writeFileSync(path, await doc.save());
}

const subjects = [
  {
    key: "biology",
    title: "Cell Biology Basics",
    pdf: `${OUT}/smoke-source.pdf`,
    offTopic: "Explain how volcanoes erupt and why lava cools into basalt.",
    focus: "How do mitochondria and chloroplasts supply energy to a cell?",
    audience: /Myself \(adult learner\)/,
  },
  {
    key: "history",
    title: "The Roman Republic",
    pdf: `${OUT}/st106-history.pdf`,
    make: () =>
      makePdf(`${OUT}/st106-history.pdf`, "The Roman Republic", [
        ["1. Founding of the Republic", [
          "In 509 BC the Romans expelled their last king and founded a republic.",
          "Power was shared so that no single ruler could become a tyrant again.",
        ]],
        ["2. Consuls and the Senate", [
          "Two consuls were elected each year to lead the government and army.",
          "The Senate, made of former magistrates, advised the consuls on law,",
          "finance and foreign policy. Its advice carried great authority.",
        ]],
        ["3. The Assemblies and the Tribunes", [
          "Citizens voted in assemblies that elected magistrates and passed laws.",
          "Tribunes of the plebs could veto actions that harmed ordinary citizens.",
        ]],
      ]),
    focus: "Explain how consuls, the Senate and the tribunes shared power in the Roman Republic.",
    audience: /Students/,
    ageBand: "Ages 11–13",
  },
  {
    key: "finance",
    title: "Compound Interest",
    pdf: `${OUT}/st106-finance.pdf`,
    make: () =>
      makePdf(`${OUT}/st106-finance.pdf`, "Compound Interest", [
        ["1. Simple and compound interest", [
          "Simple interest is paid only on the original principal.",
          "Compound interest is paid on the principal plus interest already earned.",
        ]],
        ["2. The compound interest formula", [
          "The balance after t years is A = P(1 + r/n)^(nt), where P is the principal,",
          "r the annual rate and n the number of compounding periods per year.",
        ]],
        ["3. Compounding frequency and time", [
          "More frequent compounding and longer time horizons both increase growth.",
          "Doubling time is roughly 72 divided by the annual interest rate in percent.",
        ]],
      ]),
    focus: "Explain the compound interest formula and how compounding frequency and time affect growth.",
    audience: /Professional/,
  },
];

async function shot(page, subject, n, state) {
  const path = `${OUT}/st106-${subject}-${n}-${state}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  [${subject}] ${n}-${state}  ${page.url()}`);
}

async function signIn(page, email) {
  await page.goto(`${APP}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/workspace", { timeout: 60_000 });
}

async function waitView(page, views, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const view = await page
      .getByTestId("one-shot-page")
      .getAttribute("data-view", { timeout: 5_000 })
      .catch(() => null);
    if (views.includes(view)) return view;
    await page.waitForTimeout(3_000);
  }
  throw new Error(`timed out waiting for ${views.join("/")}`);
}

async function fillAndCreate(page, subject, focus) {
  await page.getByLabel("What should the video explain?").fill(focus);
  await page.getByRole("radio", { name: subject.audience }).check();
  if (subject.ageBand) await page.getByRole("radio", { name: subject.ageBand }).check();
  await page.getByRole("radio", { name: "3 minutes" }).check();
  await page.getByTestId("one-shot-estimate-total").waitFor({ timeout: 30_000 });
}

async function finishRun(page, subject, n, requests) {
    const stop = await waitView(page, ["approval", "attention", "not_covered"], 20 * 60_000);
    if (stop !== "approval") {
      await shot(page, subject.key, n++, stop);
      throw new Error(`run stopped at ${stop}`);
    }
    await page.waitForTimeout(4_000);
    await shot(page, subject.key, n++, "approval");
    await page.getByTestId("one-shot-render").dblclick();
    await waitView(page, ["delivery"], 60_000);
    await shot(page, subject.key, n++, "rendering");
    const deadline = Date.now() + 15 * 60_000;
    let status = null;
    while (Date.now() < deadline) {
      status = await page.getByTestId("one-shot-delivery").getAttribute("data-status");
      if (status === "completed" || status === "failed") break;
      await page.waitForTimeout(5_000);
    }
    await page.waitForTimeout(8_000);
    await shot(page, subject.key, n++, `delivery-${status}`);
    let downloaded = null;
    if (status === "completed") {
      const latest = page.getByLabel("Latest production render");
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 60_000 }),
        latest.getByRole("button", { name: "Download MP4" }).click(),
      ]);
      downloaded = download.suggestedFilename();
    }
    const cost = await page.getByTestId("one-shot-cost").textContent();
    const promptInUrl = requests.some((url) =>
      subject.focus.split(" ").filter((w) => w.length > 8).some((w) => url.toLowerCase().includes(w.toLowerCase())),
    );
  return { n, status, downloaded, cost, promptInUrl };
}

async function resumeFlow(browser, subject, projectId) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(180_000);
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  const t0 = Date.now();
  try {
    await signIn(page, cohort.email);
    await page.goto(`${APP}/workspace/${projectId}/one-shot`, { waitUntil: "networkidle" });
    await waitView(page, ["attention"], 60_000);
    let n = 10;
    await shot(page, subject.key, n++, "attention-card");
    const link = page.getByTestId("one-shot-attention-link");
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(`**${href}`);
    await page.getByTestId("one-shot-run-link").waitFor();
    await page.waitForTimeout(3_000);
    await shot(page, subject.key, n++, "wizard-with-run-link");
    // The fix the attention card asks for: regenerate the failed scene audio,
    // as the wizard's audio panel does (same endpoint, same session).
    const retried = await page.evaluate(async (id) => {
      const response = await fetch(`http://localhost:3001/projects/${id}/audio/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey: `st106-retry-${Date.now()}` }),
      });
      return response.status;
    }, projectId);
    console.log(`  [${subject.key}] audio retry -> ${retried}`);
    await page.waitForTimeout(20_000);
    await page.getByTestId("one-shot-run-link").click();
    await page.waitForURL("**/one-shot");
    await waitView(page, ["attention"], 60_000);
    await page.getByTestId("one-shot-resume").dblclick();
    await waitView(page, ["progress", "approval"], 60_000);
    await shot(page, subject.key, n++, "resumed-progress");
    const done = await finishRun(page, subject, n, requests);
    results.push({
      subject: `${subject.key} (resumed)`,
      projectId,
      wizardLink: href,
      status: done.status,
      downloaded: done.downloaded,
      cost: done.cost,
      promptInUrl: done.promptInUrl,
      minutes: ((Date.now() - t0) / 60_000).toFixed(1),
    });
  } catch (error) {
    await shot(page, subject.key, 98, "resume-error").catch(() => undefined);
    results.push({ subject: `${subject.key} (resumed)`, error: String(error) });
  } finally {
    await context.close();
  }
}

async function drive(browser, subject) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(180_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  const t0 = Date.now();
  try {
    await signIn(page, cohort.email);
    await page.getByRole("radio", { name: /Quick video from a PDF/ }).waitFor({ timeout: 30_000 });
    await page.getByLabel("Project title").fill(`${subject.title} (quick video)`);
    await page.getByRole("radio", { name: /Quick video from a PDF/ }).check();
    await shot(page, subject.key, 1, "workspace-entry");
    await page.getByLabel("Create new lesson").getByRole("button", { name: "Create lesson" }).click();
    await page.waitForURL("**/one-shot", { timeout: 60_000 });
    const projectId = page.url().match(/workspace\/([^/]+)/)[1];

    await page.setInputFiles("#source-document", subject.pdf);
    await page.getByRole("button", { name: /Upload document/ }).click();
    await page.getByTestId("one-shot-document-ready").waitFor({ timeout: 90_000 });

    let n = 2;
    if (subject.offTopic) {
      await fillAndCreate(page, subject, subject.offTopic);
      await page.getByTestId("one-shot-create").dblclick();
      await waitView(page, ["not_covered", "approval", "attention"], 15 * 60_000);
      await shot(page, subject.key, n++, `offtopic-${await page.getByTestId("one-shot-page").getAttribute("data-view")}`);
      if ((await page.getByTestId("one-shot-page").getAttribute("data-view")) === "not_covered") {
        await page.getByTestId("one-shot-edit-prompt").click();
        await waitView(page, ["request"], 30_000);
      }
    }

    await fillAndCreate(page, subject, subject.focus);
    await shot(page, subject.key, n++, "request-estimate");
    await page.getByTestId("one-shot-create").dblclick();
    await waitView(page, ["progress"], 60_000);
    await page.waitForTimeout(20_000);
    await shot(page, subject.key, n++, "progress");
    await page.reload({ waitUntil: "networkidle" });
    await waitView(page, ["progress", "approval", "attention"], 60_000);
    await shot(page, subject.key, n++, "progress-after-reload");
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    await shot(page, subject.key, n++, "progress-phone");
    await page.setViewportSize({ width: 1440, height: 950 });

    const done = await finishRun(page, subject, n, requests);
    n = done.n;
    const { status, downloaded, cost, promptInUrl } = done;
    results.push({
      subject: subject.key,
      projectId,
      status,
      downloaded,
      cost,
      phoneOverflowPx: overflow,
      promptInUrl,
      minutes: ((Date.now() - t0) / 60_000).toFixed(1),
      pageErrors: errors.filter((e) => !/hydrat/i.test(e)).slice(0, 3),
    });
  } catch (error) {
    await shot(page, subject.key, 99, "error").catch(() => undefined);
    results.push({ subject: subject.key, error: String(error), pageErrors: errors.slice(0, 3) });
  } finally {
    await context.close();
  }
}

async function outsideCohort(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(180_000);
  const email = `st106-outsider+${Date.now()}@example.com`;
  await page.goto(`${APP}/register`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/workspace", { timeout: 60_000 });
  await page.getByLabel("Project title").fill("Outsider lesson");
  await page.getByLabel("Create new lesson").getByRole("button", { name: "Create lesson" }).click();
  await page.waitForURL("**/upload", { timeout: 60_000 });
  const projectId = page.url().match(/workspace\/([^/]+)/)[1];
  await page.goto(`${APP}/workspace`, { waitUntil: "networkidle" });
  const entry = await page.getByText("Quick video from a PDF").count();
  await shot(page, "outsider", 1, "workspace-no-entry");
  await page.goto(`${APP}/workspace/${projectId}/one-shot`, { waitUntil: "networkidle" });
  const unavailable = await page.getByTestId("one-shot-unavailable").isVisible();
  await shot(page, "outsider", 2, "route-unavailable");
  results.push({ subject: "outsider", entryVisible: entry > 0, unavailable });
  await context.close();
}

for (const subject of subjects) if (subject.make) await subject.make();
const browser = await chromium.launch();
// argv: "resume" <historyProjectId> <financeProjectId>  -> biology fresh + two resumes.
if (process.argv[2] === "resume") {
  await Promise.all([
    drive(browser, subjects[0]),
    resumeFlow(browser, subjects[1], process.argv[3]),
    resumeFlow(browser, subjects[2], process.argv[4]),
  ]);
} else {
  await outsideCohort(browser);
  await Promise.all(subjects.map((subject) => drive(browser, subject)));
}
await browser.close();
writeFileSync(`${OUT}/st106-results.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
