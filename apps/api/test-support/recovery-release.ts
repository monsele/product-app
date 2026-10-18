/** Local release gate. Real API, Redis/outbox worker, PostgreSQL, MinIO and Next;
 * deterministic providers only. Never runs against the application's database. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import {
  createId,
  parseEnvironment,
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
  computeLessonStoryboardContentHash,
  computeLessonStoryboardSceneContentHash,
} from "@avlp/config";
import { hashSessionToken } from "@avlp/auth";
import { createTestDatabase } from "@avlp/database/testing";
import {
  migrateDatabase,
  sessions,
  parsedSections,
  contentBlocks,
  narrationSets,
  lessonOutlineSets,
  learningObjectiveSets,
  outlineObjectiveLinks,
  lessonSpecs,
  scenes,
  jobs,
  sceneAudio,
  lessonRecoveryTasks,
  lessonRecoveryRuns,
  voiceConfigurations,
  narrationBlocks,
  lessonOutlineItems,
  eq,
} from "@avlp/database";
import { createS3CompatibleObjectStorage } from "@avlp/storage";
import {
  seed,
  scope,
  storyboardPayload,
  parsedDocumentId,
  sourceDocumentId,
  blockA,
  objectiveId,
  outlineItemA,
} from "../src/cinema-lesson.fixture.js";
import { PostgresSourceSnapshotService } from "../src/source-snapshot.js";
import { SceneAudioService } from "../src/scene-audio.js";
import {
  createSceneAudioGenerationJobHandler,
  synthesizeFixtureAudio,
} from "../../pipeline-worker/dist/scene-audio-job.js";

assert.equal(process.env.NODE_ENV, "test");
assert.ok(
  !process.env.TOGETHER_API_KEY?.trim(),
  "Release checks require deterministic providers",
);
const root = resolve(import.meta.dirname, "../../..");
const logs = resolve(root, ".runtime-logs/recovery/live");
await mkdir(logs, { recursive: true });
const env = parseEnvironment(process.env);
const database = await createTestDatabase(env.DATABASE_URL);
const databaseUrl = new URL(env.DATABASE_URL);
databaseUrl.pathname = `/${database.databaseName}`;
const redisUrl = new URL(env.REDIS_URL);
assert.ok(
  redisUrl.pathname !== "/15",
  "Release checks require a Redis database separate from the app",
);
redisUrl.pathname = "/15";
const secret = "recovery-release-local-session-secret-0000000000000000000000";
const token = "local-recovery-release-session";
const children: ChildProcess[] = [];
const childEnv = {
  ...process.env,
  DATABASE_URL: databaseUrl.toString(),
  REDIS_URL: redisUrl.toString(),
  NODE_ENV: "development",
  AUTH_SESSION_SECRET: secret,
  TOGETHER_API_KEY: " ",
  STORYBOARD_RECOVERY_ENABLED: "true",
  WEB_ORIGIN: "http://localhost:3100",
  NEXT_PUBLIC_API_URL: "http://localhost:3101",
};
function launch(
  name: string,
  cwd: string,
  args: string[],
  extra: Record<string, string> = {},
) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...childEnv, ...extra },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.pipe(createWriteStream(resolve(logs, `${name}.out.log`)));
  child.stderr!.pipe(createWriteStream(resolve(logs, `${name}.err.log`)));
  children.push(child);
  return child;
}
async function waitFor(
  check: () => Promise<boolean>,
  label: string,
  timeoutMs = 180000,
) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await delay(1000);
  }
  throw new Error(`Timed out: ${label}`);
}
function narrationFor(seconds: number, index: number) {
  const words =
    "Water evaporates when heated and rises as water vapour into the sky".split(
      " ",
    );
  for (let count = 30; count < 130; count++) {
    const text = `${Array.from({ length: count }, (_, i) => words[(i + index) % words.length]).join(" ")}.`;
    if (
      Math.ceil(synthesizeFixtureAudio(text, 1).durationMs / 1000) === seconds
    )
      return text;
  }
  throw new Error("Unable to construct measured-audio fixture");
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await migrateDatabase(database.client);
  await seed(database.client);
  await database.client
    .insert(voiceConfigurations)
    .values({
      id: createId(),
      ...scope,
      voiceId: "english-aria",
      speakingRate: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  const sectionId = createId();
  const payload = storyboardPayload();
  payload.generatedAt = new Date().toISOString();
  const template = payload.scenes[0]!;
  payload.scenes = Array.from({ length: 6 }, (_, index) => {
    const id = createId();
    const seconds = index === 5 ? 38 : 40;
    return {
      ...template,
      id,
      stableSceneId: id,
      order: index + 1,
      durationSeconds: seconds,
      scene: {
        ...template.scene,
        id,
        order: index + 1,
        durationSeconds: seconds,
        narration: narrationFor(seconds, index),
        sourceRefs: [
          {
            documentId: parsedDocumentId,
            parsedDocumentVersion: 1,
            pageStart: 1,
            pageEnd: 1,
            sectionId,
            blockIds: [blockA],
          },
        ],
      },
    };
  });
  payload.totalDurationSeconds = 238;
  const [narrationSet] = await database.client.select().from(narrationSets);
  const narrationRows = await database.client
    .select()
    .from(narrationBlocks)
    .orderBy(narrationBlocks.order);
  payload.narrationSetContentHash = computeNarrationSetContentHash(
    narrationRows.map((block) => ({
      contentHash: computeNarrationBlockContentHash({
        text: block.text,
        sourceRefs: block.sourceRefs as unknown[],
        generatedAdditions: block.generatedAdditions as unknown[],
        generated: block.generated,
      }),
    })),
    narrationSet!.totalEstimatedSeconds,
  );
  const outlineRows = await database.client
    .select()
    .from(lessonOutlineItems)
    .orderBy(lessonOutlineItems.order);
  payload.outlineSetContentHash = createHash("sha256")
    .update(
      JSON.stringify(
        outlineRows.map((item) => ({
          id: item.id,
          order: item.order,
          kind: item.kind,
          title: item.title,
          description: item.description,
          estimatedSeconds: item.estimatedSeconds,
        })),
      ),
    )
    .digest("hex");
  payload.contentHash = computeLessonStoryboardContentHash({
    ...payload,
    scenes: payload.scenes.map((entry) => ({
      ...entry,
      contentHash: computeLessonStoryboardSceneContentHash({
        ...entry.scene,
        title: undefined,
      }),
    })),
  });
  await database.client.insert(parsedSections).values({
    id: sectionId,
    parsedDocumentId,
    order: 1,
    level: 1,
    heading: "Water cycle",
    pageStart: 1,
    pageEnd: 1,
  });
  await database.client.insert(contentBlocks).values({
    id: blockA,
    parsedDocumentId,
    sectionId,
    kind: "paragraph",
    order: 1,
    pageStart: 1,
    pageEnd: 1,
    content: {
      text: payload.scenes.map((scene) => scene.scene.narration).join(" "),
    },
  });
  const approval = await new PostgresSourceSnapshotService(
    database.client,
  ).approve({ ...scope, correlationId: createId() });
  // The seed's approved planning stages point to the approved snapshot created here.
  for (const table of [narrationSets, lessonOutlineSets, learningObjectiveSets])
    await database.client.update(table).set({
      sourceSnapshotId: approval.snapshot.id,
      sourceSnapshotContentHash: approval.snapshot.contentHash,
    });
  await database.client.insert(outlineObjectiveLinks).values({
    id: createId(),
    ...scope,
    outlineItemId: outlineItemA,
    objectiveId,
  });
  await database.client
    .update(lessonSpecs)
    .set({
      payload,
      generatedAt: new Date(payload.generatedAt),
      totalDurationSeconds: 238,
      contentHash: payload.contentHash,
      narrationSetContentHash: payload.narrationSetContentHash,
      outlineSetContentHash: payload.outlineSetContentHash,
    });
  await database.client.insert(scenes).values(
    payload.scenes.map((entry) => ({
      id: entry.id,
      ...scope,
      lessonSpecId: payload.id,
      stableSceneId: entry.stableSceneId,
      order: entry.order,
      template: entry.template,
      durationSeconds: entry.durationSeconds,
      narrationBlockIds: entry.narrationBlockIds,
      assetRequirements: [],
      sceneJson: entry.scene,
    })),
  );
  await database.client.insert(sessions).values({
    id: createId(),
    userId: scope.ownerUserId,
    tokenHash: hashSessionToken(token, secret),
    expiresAt: new Date(Date.now() + 3600000),
  });
  const storage = await createS3CompatibleObjectStorage({
    bucket: env.OBJECT_STORAGE_BUCKET!,
    allowedPrefix: "users",
    allowedUploadContentTypes: ["audio/wav"],
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    region: env.OBJECT_STORAGE_REGION,
    forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
    allowInsecureEndpoint: env.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
    runtimeEnvironment: "test",
    credentials: {
      accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY!,
      secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY!,
    },
    ...(env.OBJECT_STORAGE_ENDPOINT
      ? { endpoint: env.OBJECT_STORAGE_ENDPOINT }
      : {}),
  });
  const audio = new SceneAudioService(database.client);
  await audio.generateAll({
    ...scope,
    correlationId: createId(),
    body: { idempotencyKey: "reported-six-scene-generation" },
  });
  const audioJobs = await database.client
    .select()
    .from(jobs)
    .where(eq(jobs.jobType, "tts.generate"));
  const audioRows = await database.client.select().from(sceneAudio);
  const failed = audioRows.find(
    (row) => row.sceneId === payload.scenes[5]!.id,
  )!;
  const handler = createSceneAudioGenerationJobHandler({
    database: database.client,
    storage,
  });
  for (const job of audioJobs.filter((job) => job.id !== failed.jobId)) {
    await handler.handler(job.payload, {
      ...scope,
      jobId: job.id,
      correlationId: job.correlationId,
      idempotencyKey: job.idempotencyKey,
      attempt: 1,
      heartbeat: async () => {},
      reportProgress: async () => {},
    });
    await database.client
      .update(jobs)
      .set({ state: "succeeded", attempts: 1 })
      .where(eq(jobs.id, job.id));
  }
  await database.client
    .update(sceneAudio)
    .set({ status: "failed", failureCode: "PROVIDER_UNAVAILABLE" })
    .where(eq(sceneAudio.id, failed.id));
  await database.client
    .update(jobs)
    .set({ state: "failed", attempts: 1, errorClassification: "retryable" })
    .where(eq(jobs.id, failed.jobId!));
  launch(
    "api",
    resolve(root, "apps/api"),
    ["--env-file=../../.env", "dist/main.js"],
    { PORT: "3101" },
  );
  await waitFor(
    async () => (await fetch("http://localhost:3101/health")).ok,
    "API",
  );
  launch("web", resolve(root, "apps/web"), [
    "node_modules/next/dist/bin/next",
    "dev",
    "-p",
    "3100",
  ]);
  await waitFor(
    async () => (await fetch("http://localhost:3100/sign-in")).ok,
    "web",
  );
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addCookies([
    { name: "avlp_session", value: token, url: "http://localhost:3100" },
  ]);
  const page = await context.newPage();
  await page.goto(
    `http://localhost:3100/workspace/${scope.projectId}/storyboard`,
    { waitUntil: "networkidle", timeout: 120000 },
  );
  const summary = page.getByRole("region", { name: "Lesson preparation" });
  await summary.waitFor({ timeout: 60000 });
  assert.equal(
    (await page
      .getByRole("link", { name: "Preview lesson", exact: true })
      .count()) > 0,
    true,
  );
  assert.equal(
    (await database.client.select().from(lessonRecoveryRuns)).length,
    0,
    "Opening the editor granted no paid authority",
  );
  await page.screenshot({
    path: resolve(logs, "storyboard-incomplete.png"),
    fullPage: true,
  });
  const partial = await context.newPage();
  await partial.goto(
    `http://localhost:3100/workspace/${scope.projectId}/preview`,
    { waitUntil: "networkidle", timeout: 120000 },
  );
  await partial
    .getByRole("region", { name: "Full lesson preview player" })
    .waitFor();
  await partial.screenshot({
    path: resolve(logs, "lesson-partial-preview.png"),
    fullPage: true,
  });
  await partial.close();
  await summary
    .getByRole("button", { name: "Finish preparing lesson", exact: true })
    .first()
    .click();
  await summary
    .getByRole("button", { name: "Approve and prepare", exact: true })
    .click();
  const narration = page.getByRole("textbox", {
    name: "Narration script",
    exact: true,
  });
  await narration.fill("Unsaved teacher explanation remains here.");
  await narration.focus();
  launch("worker", resolve(root, "apps/pipeline-worker"), [
    "--env-file=../../.env",
    "dist/main.js",
  ]);
  await waitFor(async () => {
    const response = await fetch(
      `http://localhost:3101/projects/${scope.projectId}/readiness`,
      { headers: { cookie: `avlp_session=${token}` } },
    );
    const state = await response.json();
    const work = await database.client.select().from(lessonRecoveryTasks);
    return (
      state.state === "ready" &&
      work.some(
        (task) => task.operation === "audio" && task.state === "succeeded",
      ) &&
      work.some(
        (task) => task.operation === "grounding" && task.state === "succeeded",
      )
    );
  }, "automatic recovery and current-revision readiness");
  await page.getByText(/Ready to render.*3:58/).waitFor({ timeout: 30000 });
  await page.getByText(/Audio failed/).first().waitFor({ state: "hidden", timeout: 30000 });
  assert.equal(
    await narration.inputValue(),
    "Unsaved teacher explanation remains here.",
  );
  assert.equal(
    await narration.evaluate((element) => element === document.activeElement),
    true,
  );
  await page.screenshot({
    path: resolve(logs, "storyboard-ready.png"),
    fullPage: true,
  });
  const tasks = await database.client.select().from(lessonRecoveryTasks);
  assert.equal(tasks.filter((task) => task.operation === "audio").length, 1);
  assert.equal(
    tasks.find((task) => task.operation === "audio")!.sceneId,
    payload.scenes[5]!.id,
  );
  assert.equal(
    (
      await database.client
        .select()
        .from(jobs)
        .where(eq(jobs.jobType, "tts.generate"))
    ).length,
    7,
  );
  const readinessResponse = await context.request.get(
    `http://localhost:3101/projects/${scope.projectId}/readiness`,
  );
  const ready = await readinessResponse.json();
  assert.equal(ready.actualDurationSeconds, 238);
  assert.equal(ready.targetDurationSeconds, 180);
  assert.equal(ready.capabilities.render, true);
  assert.ok(
    ready.activity.some(
      (entry: { state: string }) => entry.state === "succeeded",
    ),
  );
  await page.goto(
    `http://localhost:3100/workspace/${scope.projectId}/preview`,
    { waitUntil: "networkidle", timeout: 120000 },
  );
  await page.screenshot({
    path: resolve(logs, "lesson-preview.png"),
    fullPage: true,
  });
  await writeFile(
    resolve(logs, "result.json"),
    JSON.stringify(
      {
        passed: true,
        actualDurationSeconds: 238,
        targetDurationSeconds: 180,
        audioJobs: 7,
        repairedScenes: 1,
        groundingTasks: tasks.filter((task) => task.operation === "grounding")
          .length,
        metrics: ready.metrics,
      },
      null,
      2,
    ),
  );
  console.log(
    "RECOVERY RELEASE PASS: real API/outbox/worker/storage/web, Scene 6 only, 3:58 ready.",
  );
} catch (error) {
  console.error(error);
  if (browser)
    await browser
      .contexts()[0]
      ?.pages()[0]
      ?.screenshot({ path: resolve(logs, "failure.png"), fullPage: true })
      .catch(() => undefined);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of children.reverse()) {
    if (process.platform === "win32" && child.pid)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else child.kill();
  }
  await delay(2000);
  await database.destroy();
}
