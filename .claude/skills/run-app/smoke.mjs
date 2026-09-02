// End-to-end smoke driver for the AI Visual Learning Platform.
// Run from the repo root, with the full stack up:  node .claude/skills/run-app/smoke.mjs
// Screenshots land in .runtime-logs/. See SKILL.md in this directory.
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const OUT = ".runtime-logs";
const PDF = `${OUT}/smoke-source.pdf`;
const email = `smoke+${Date.now()}@example.com`;
const password = "CorrectHorse!9batt";

mkdirSync(OUT, { recursive: true });

// pdf-lib lives in the pipeline-worker's node_modules, not the root.
if (!existsSync(PDF)) {
  const require_ = createRequire(new URL("../../../apps/pipeline-worker/index.js", import.meta.url));
  const { PDFDocument, StandardFonts } = require_("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const lines = [
    ["Cell Biology Basics", 24, bold],
    ["", 12, font],
    ["1. What is a cell?", 16, bold],
    ["A cell is the smallest unit of life. Every living organism is made", 12, font],
    ["of one or more cells. Cells carry out the chemical reactions that", 12, font],
    ["keep an organism alive, and they can copy themselves by dividing.", 12, font],
    ["", 12, font],
    ["2. Parts of a cell", 16, bold],
    ["The cell membrane surrounds the cell and controls what enters and", 12, font],
    ["leaves it. The nucleus stores the genetic instructions called DNA.", 12, font],
    ["Mitochondria release energy from food in a process called", 12, font],
    ["respiration. The cytoplasm is the jelly-like fluid that fills the cell.", 12, font],
    ["", 12, font],
    ["3. Plant cells and animal cells", 16, bold],
    ["Plant cells have three parts animal cells lack: a rigid cell wall of", 12, font],
    ["cellulose, a large central vacuole filled with sap, and chloroplasts", 12, font],
    ["that capture light for photosynthesis.", 12, font],
  ];
  let y = 780;
  for (const [text, size, f] of lines) {
    if (text) page.drawText(text, { x: 60, y, size, font: f });
    y -= size + 8;
  }
  writeFileSync(PDF, await doc.save());
  console.log(`generated ${PDF}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
// Known-benign noise, documented in SKILL.md; everything else fails the run.
const BENIGN = [/content-length/i, /hydrated but some attributes/i, /hydration-mismatch/i];
const errors = [];
const warnings = [];
const record = (text) => (BENIGN.some((r) => r.test(text)) ? warnings : errors).push(text);
page.on("pageerror", (e) => record(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") record(m.text());
});

const step = async (name) => {
  await page.screenshot({ path: `${OUT}/smoke-${name}.png` });
  console.log(`  [${name}] ${page.url()}`);
};

console.log("register…");
await page.goto("http://localhost:3000/register", { waitUntil: "networkidle" });
await page.fill('input[type="email"]', email);
await page.fill('input[type="password"]', password);
await page.locator('button[type="submit"]').first().click();
await page.waitForURL("**/workspace", { timeout: 30000 });
await step("1-workspace");

console.log("create lesson…");
await page.fill('input[placeholder*="Photosynthesis" i]', "Cell Biology Basics");
await page.locator('button:has-text("Create lesson")').first().click();
await page.waitForURL("**/upload", { timeout: 30000 });
const projectId = page.url().match(/workspace\/([^/]+)/)[1];
await step("2-upload");

console.log(`upload document… (project ${projectId})`);
await page.setInputFiles('input[type="file"]', PDF);
await page.locator('button:has-text("Upload document")').first().click();

// Poll the ingestion panel's own copy (ingestion-status-panel.tsx). Match the
// panel sentence, NOT "…ready for review" — the upload toast says that instantly.
let ingested = false;
for (let i = 0; i < 36; i++) {
  await page.waitForTimeout(5000);
  const body = await page.locator("body").innerText();
  if (/Your document is ready for review/i.test(body)) { ingested = true; break; }
  if (/could not finish reading your document|Extraction failed/i.test(body)) {
    console.log("  ingestion FAILED");
    break;
  }
  console.log(`  …${(i + 1) * 5}s`);
}
await step("3-ingested");

console.log("review…");
await page.goto(`http://localhost:3000/workspace/${projectId}/review`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await step("4-review");

const review = await page.locator("body").innerText();
const sections = review.match(/Sections \((\d+)\)/);
const quality = review.match(/Quality score: \d+\/100[^\n]*/);
console.log(`\nsections parsed: ${sections ? sections[1] : "NONE"}`);
console.log(`quality: ${quality ? quality[0] : "not reported"}`);
console.log(`ingestion: ${ingested ? "ready for review" : "DID NOT COMPLETE"}`);
console.log(`errors: ${errors.length ? JSON.stringify(errors.slice(0, 3)) : "none"}`);
if (warnings.length) console.log(`benign warnings ignored: ${warnings.length}`);

await browser.close();
const ok = ingested && sections && Number(sections[1]) > 0 && errors.length === 0;
console.log(ok ? "\nSMOKE PASS" : "\nSMOKE FAIL");
process.exit(ok ? 0 : 1);
