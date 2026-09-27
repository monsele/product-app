// ST-105 live evidence driver (untracked). Phase "setup": register, create a
// project, upload a PDF, wait for ingestion. Phase "run": estimate, start a
// prompt-to-video run, poll to awaiting_render_approval, approve the render,
// poll to completed. Only public API routes are used.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const API = "http://localhost:3001";
const ORIGIN = "http://localhost:3000";
const STATE = ".runtime-logs/st105-state.json";
const PDF = ".runtime-logs/smoke-source.pdf";
const phase = process.argv[2];
let cookie = "";

async function call(method, path, body, headers = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 400)}`);
  return json;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (phase === "setup") {
  if (!existsSync(PDF)) throw new Error("Run smoke.mjs once to generate the PDF.");
  const email = `st105+${Date.now()}@example.com`;
  const password = "CorrectHorse!9batt";
  await call("POST", "/auth/register", { email, password });
  const session = await call("GET", "/auth/session");
  const { project } = await call("POST", "/projects", { title: "ST-105 live run" });
  const bytes = readFileSync(PDF);
  const upload = await call("POST", `/projects/${project.id}/source-upload`, {
    fileName: "cells.pdf",
    mediaType: "application/pdf",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const put = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.requiredHeaders, body: bytes });
  if (!put.ok) throw new Error(`upload PUT ${put.status}`);
  await call("POST", `/projects/${project.id}/source-upload/${upload.sessionId}/complete`, {});
  const userId = session.user?.id ?? session.id;
  writeFileSync(STATE, JSON.stringify({ email, password, userId, projectId: project.id }, null, 2));
  console.log(JSON.stringify({ userId, projectId: project.id }));
} else if (phase === "project") {
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  await call("POST", "/auth/login", { email: state.email, password: state.password });
  const { project } = await call("POST", "/projects", { title: "ST-105 audit check" });
  const bytes = readFileSync(PDF);
  const upload = await call("POST", `/projects/${project.id}/source-upload`, {
    fileName: "cells.pdf",
    mediaType: "application/pdf",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const put = await fetch(upload.uploadUrl, { method: "PUT", headers: upload.requiredHeaders, body: bytes });
  if (!put.ok) throw new Error(`upload PUT ${put.status}`);
  await call("POST", `/projects/${project.id}/source-upload/${upload.sessionId}/complete`, {});
  writeFileSync(STATE, JSON.stringify({ ...state, projectId: project.id }, null, 2));
  console.log(JSON.stringify({ projectId: project.id }));
} else if (phase === "run") {
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  await call("POST", "/auth/login", { email: state.email, password: state.password });
  const p = `/projects/${state.projectId}/one-shot`;
  console.log("eligibility", JSON.stringify(await call("GET", `${p}/eligibility`)));
  const estimate = await call("POST", `${p}/estimate`, { targetDurationSeconds: 180 });
  console.log("estimate total", estimate.totalUsd, estimate.items.length, "items");
  const body = {
    focusPrompt: "How do mitochondria and chloroplasts supply energy to a cell?",
    audience: { ageBand: "adult-beginner", difficulty: "introductory", tone: "friendly" },
    targetDurationSeconds: 180,
    acceptedEstimateUsd: estimate.totalUsd,
  };
  const key = `st105-live-${Date.now()}`;
  const started = await call("POST", p, body, { "idempotency-key": key });
  const replay = await call("POST", p, body, { "idempotency-key": key });
  console.log("started", started.run.id, started.run.status, "replay same id:", replay.run.id === started.run.id);
  try {
    await call("POST", p, body, { "idempotency-key": `${key}-second` });
    console.log("SECOND RUN UNEXPECTEDLY ACCEPTED");
  } catch (error) { console.log("second concurrent run rejected:", String(error.message).slice(0, 60)); }
  try {
    await call("POST", `${p}/render`);
    console.log("EARLY RENDER UNEXPECTEDLY ACCEPTED");
  } catch (error) { console.log("early render rejected:", String(error.message).slice(0, 60)); }

  let run;
  let lastStep = "";
  const deadline = Date.now() + 30 * 60_000;
  while (Date.now() < deadline) {
    ({ run } = await call("GET", p));
    const marker = `${run.status}/${run.currentStep}`;
    if (marker !== lastStep) { console.log(new Date().toISOString(), marker, "cost", run.actualCostUsd); lastStep = marker; }
    if (!["queued", "running"].includes(run.status)) break;
    await sleep(3_000);
  }
  console.log("stopped at", run.status, JSON.stringify(run.needsAttention), JSON.stringify(run.focusCoverage));
  console.log("steps", run.steps.map((s) => `${s.step}:${s.state}`).join(" "));
  if (run.status !== "awaiting_render_approval") process.exit(1);

  ({ run } = await call("POST", `${p}/render`));
  console.log("render approved", run.status, run.renderJobId, run.lessonVersionId);
  while (Date.now() < deadline) {
    ({ run } = await call("GET", p));
    const marker = `${run.status}/${JSON.stringify(run.steps.find((s) => s.step === "render")?.detail ?? {})}`;
    if (marker !== lastStep) { console.log(new Date().toISOString(), marker); lastStep = marker; }
    if (run.status !== "rendering") break;
    await sleep(5_000);
  }
  console.log("final", run.status, JSON.stringify(run.needsAttention), "cost", run.actualCostUsd);
  writeFileSync(".runtime-logs/st105-final-run.json", JSON.stringify(run, null, 2));
  process.exit(run.status === "completed" ? 0 : 1);
}
