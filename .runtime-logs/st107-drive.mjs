// ST-107 live evidence driver (untracked). Drives the prompt-to-video screens in
// a real browser against the full local stack (mock providers), for three
// different-subject PDFs in parallel:
//   workspace entry -> upload -> prompt -> Prepare brief (records brief accuracy)
//   -> [history: Edit request -> brief revision 2, style changed] -> Confirm
//   -> progress (+ reload) -> preview (decision log, ledger, coverage gaps)
//   -> Render -> delivery -> download.
// Screenshots: .runtime-logs/st107-<subject>-<n>-<state>.png
// Results:     .runtime-logs/st107-results.json
// Run from the repo root:  node .runtime-logs/st107-drive.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const APP = "http://localhost:3000";
const API = "http://localhost:3001";
const OUT = ".runtime-logs";
const cohort = JSON.parse(readFileSync(`${OUT}/st105-state.json`, "utf8"));
const password = "CorrectHorse!9batt";
const results = [];

const subjects = [
  {
    key: "biology",
    title: "Cell Biology Basics",
    pdf: `${OUT}/smoke-source.pdf`,
    focus: "How do mitochondria and chloroplasts supply energy to a cell?",
    expectHeadings: [/mitochond/i, /chloroplast|photosynth/i],
    audience: /Myself \(adult learner\)/,
  },
  {
    key: "history",
    title: "The Roman Republic",
    pdf: `${OUT}/st106-history.pdf`,
    focus: "Explain how consuls and the Senate shared power in the Roman Republic.",
    revisedFocus: "Explain how consuls, the Senate and the tribunes shared power in the Roman Republic.",
    expectHeadings: [/consul|senate/i, /tribune|assembl/i],
    audience: /Students/,
    ageBand: "Ages 11–13",
    style: "editorial",
  },
  {
    key: "finance",
    title: "Compound Interest",
    pdf: `${OUT}/st106-finance.pdf`,
    focus: "Explain the compound interest formula and how compounding frequency and time affect growth.",
    expectHeadings: [/formula/i, /frequency|time/i],
    audience: /Professional/,
  },
];

async function shot(page, subject, n, state) {
  const path = `${OUT}/st107-${subject}-${n}-${state}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`  [${subject}] ${n}-${state}`);
}

async function signIn(page, email) {
  await page.goto(`${APP}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL("**/workspace", { timeout: 60_000 });
}

async function view(page) {
  return page
    .getByTestId("one-shot-page")
    .getAttribute("data-view", { timeout: 5_000 })
    .catch(() => null);
}

async function waitView(page, views, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await view(page);
    if (views.includes(current)) return current;
    await page.waitForTimeout(3_000);
  }
  throw new Error(`timed out waiting for ${views.join("/")}`);
}

async function fill(page, subject, focus) {
  await page.getByLabel("What should the video explain?").fill(focus);
  await page.getByRole("radio", { name: subject.audience }).check();
  if (subject.ageBand) await page.getByRole("radio", { name: subject.ageBand }).check();
  await page.getByRole("radio", { name: "3 minutes" }).check();
}

/** Prepare brief, retrying while the document is still being read. */
async function prepareBrief(page, subject, expectedRevision) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.getByTestId("one-shot-prepare-brief").click();
    const outcome = await Promise.race([
      page
        .locator(`[data-testid="one-shot-brief"][data-revision="${expectedRevision}"]`)
        .waitFor({ timeout: 60_000 })
        .then(() => "brief"),
      page
        .getByText("The brief was not prepared")
        .waitFor({ timeout: 60_000 })
        .then(() => "error"),
    ]);
    if (outcome === "brief") return;
    const message = await page.locator("[role=alert], [role=status]").allTextContents();
    if (!message.join(" ").includes("still being read")) throw new Error(`brief failed: ${message.join(" | ")}`);
    console.log(`  [${subject.key}] document still being read; retrying`);
    await page.waitForTimeout(10_000);
  }
  throw new Error("the brief never became available");
}

async function readBrief(page) {
  const points = await page.getByTestId("one-shot-brief-point").evaluateAll((items) =>
    items.map((item) => ({
      point: item.querySelector("span")?.textContent ?? "",
      chips: [...item.querySelectorAll('[data-testid="one-shot-source-chip"]')].map((chip) => chip.textContent),
    })),
  );
  const notCovered = await page
    .getByTestId("one-shot-brief-not-covered")
    .locator("li")
    .allTextContents()
    .catch(() => []);
  return {
    title: await page.getByTestId("one-shot-brief-title").textContent(),
    points,
    notCovered,
    style: await page.getByTestId("one-shot-style").inputValue(),
    sound: await page.getByTestId("one-shot-sound").inputValue(),
    estimateUsd: await page.getByTestId("one-shot-estimate-total").textContent(),
  };
}

async function api(page, path) {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    return response.json();
  }, `${API}${path}`);
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
  let n = 1;
  try {
    await signIn(page, cohort.email);
    await page.getByLabel("Project title").fill(`${subject.title} (ST-107)`);
    await page.getByRole("radio", { name: /Quick video from a PDF/ }).check();
    await page.getByLabel("Create new lesson").getByRole("button", { name: "Create lesson" }).click();
    await page.waitForURL("**/one-shot", { timeout: 60_000 });
    const projectId = page.url().match(/workspace\/([^/]+)/)[1];

    await page.setInputFiles("#source-document", subject.pdf);
    await page.getByRole("button", { name: /Upload document/ }).click();
    await page.getByTestId("one-shot-document-ready").waitFor({ timeout: 90_000 });

    await fill(page, subject, subject.focus);
    await shot(page, subject.key, n++, "request");
    await prepareBrief(page, subject, 1);
    const brief1 = await readBrief(page);
    await shot(page, subject.key, n++, "brief");
    let brief = brief1;
    if (subject.revisedFocus) {
      await page.getByTestId("one-shot-edit-brief").click();
      await page.getByLabel("What should the video explain?").fill(subject.revisedFocus);
      await prepareBrief(page, subject, 2);
      brief = await readBrief(page);
      await shot(page, subject.key, n++, "brief-revision-2");
    }
    if (subject.style) await page.getByTestId("one-shot-style").selectOption(subject.style);
    await page.setViewportSize({ width: 390, height: 844 });
    const briefOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    await shot(page, subject.key, n++, "brief-phone");
    await page.setViewportSize({ width: 1440, height: 950 });
    const usageBeforeConfirm = await api(page, `/projects/${projectId}/one-shot/decisions`);

    await page.getByTestId("one-shot-confirm").dblclick();
    await waitView(page, ["progress"], 60_000);
    await page.waitForTimeout(15_000);
    await page.reload({ waitUntil: "networkidle" });
    await shot(page, subject.key, n++, "progress-after-reload");

    const stop = await waitView(page, ["approval", "attention", "not_covered", "budget"], 25 * 60_000);
    await page.waitForTimeout(5_000);
    await shot(page, subject.key, n++, stop);
    const log = await api(page, `/projects/${projectId}/one-shot/decisions`);
    const runView = (await api(page, `/projects/${projectId}/one-shot`)).run;
    let status = stop;
    let downloaded = null;
    if (stop === "approval") {
      await page.getByTestId("one-shot-render").dblclick();
      await waitView(page, ["delivery"], 60_000);
      const deadline = Date.now() + 15 * 60_000;
      while (Date.now() < deadline) {
        status = await page.getByTestId("one-shot-delivery").getAttribute("data-status");
        if (status === "completed" || status === "failed" || status === "needs_attention") break;
        await page.waitForTimeout(5_000);
      }
      await page.waitForTimeout(8_000);
      await shot(page, subject.key, n++, `delivery-${status}`);
      if (status === "completed") {
        const latest = page.getByLabel("Latest production render");
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 60_000 }),
          latest.getByRole("button", { name: "Download MP4" }).click(),
        ]);
        downloaded = download.suggestedFilename();
      }
    }
    const finalLog = await api(page, `/projects/${projectId}/one-shot/decisions`);
    const repairs = finalLog.decisions.filter((d) => d.kind === "repair");
    const ledgerActual = finalLog.ledger.reduce((sum, line) => sum + line.actualUsd, 0);
    const ledgerEstimate = finalLog.ledger.reduce((sum, line) => sum + line.estimateUsd, 0);
    const chipHeadings = brief.points.flatMap((p) => p.chips);
    results.push({
      subject: subject.key,
      projectId,
      briefRevisions: subject.revisedFocus ? 2 : 1,
      brief: brief,
      briefAccuracy: subject.expectHeadings.map((re) => ({
        expected: String(re),
        citedByAChip: chipHeadings.some((h) => re.test(h ?? "")),
      })),
      nothingPaidBeforeConfirm: usageBeforeConfirm.ledger.length === 0 && usageBeforeConfirm.decisions.every((d) => d.kind === "brief"),
      stop,
      status,
      downloaded,
      coverageGaps: runView?.coverageGaps ?? [],
      stylePack: runView?.stylePackId,
      soundBed: runView?.soundBed,
      repairCount: {
        queued: repairs.filter((d) => d.summary.includes("regenerating")).length,
        applied: repairs.filter((d) => d.summary.includes("applied")).length,
        discardedOrStopped: repairs.filter((d) => !/regenerating|applied/.test(d.summary)).length,
      },
      decisionKinds: finalLog.decisions.map((d) => d.kind),
      estimateUsd: Number(ledgerEstimate.toFixed(4)),
      reservedUsd: finalLog.budget?.reservedUsd,
      capUsd: finalLog.budget?.capUsd,
      actualUsdLedger: Number(ledgerActual.toFixed(6)),
      actualUsdRun: finalLog.budget?.actualUsd,
      ledger: finalLog.ledger.map((l) => ({ step: l.step, estimateUsd: l.estimateUsd, actualUsd: l.actualUsd, records: l.usageRecordIds.length })),
      briefPhoneOverflowPx: briefOverflow,
      promptInUrl: requests.some((url) =>
        subject.focus.split(" ").filter((w) => w.length > 8).some((w) => url.toLowerCase().includes(w.toLowerCase())),
      ),
      minutes: ((Date.now() - t0) / 60_000).toFixed(1),
      pageErrors: errors.filter((e) => !/hydrat/i.test(e)).slice(0, 3),
      log,
    });
  } catch (error) {
    await shot(page, subject.key, 99, "error").catch(() => undefined);
    results.push({ subject: subject.key, error: String(error), pageErrors: errors.slice(0, 3) });
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch();
// argv: optional subject keys to run (default: all three).
const only = process.argv.slice(2);
await Promise.all(
  subjects.filter((s) => only.length === 0 || only.includes(s.key)).map((subject) => drive(browser, subject)),
);
await browser.close();
writeFileSync(`${OUT}/st107-results${only.length === 0 ? "" : `-${only.join("-")}`}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map(({ log, ...rest }) => rest), null, 2));
