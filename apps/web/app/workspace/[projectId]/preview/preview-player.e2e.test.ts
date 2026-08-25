import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { describe, it } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  previewManifestSchema,
} from "@avlp/schemas";

const projectId = "01989a3d-8e00-7000-8000-000000000002";
const firstScene = createDefaultStoryboardSceneSpec("hook", {
  id: "01989a3d-8e00-7000-8000-000000000001",
  order: 1,
  durationSeconds: 10,
});
const secondScene = createDefaultStoryboardSceneSpec("definition", {
  id: "01989a3d-8e00-7000-8000-000000000003",
  order: 2,
  durationSeconds: 10,
});
const hash = "a".repeat(64);
const manifest = previewManifestSchema.parse({
  assets: {},
  canvas: { fps: 30, height: 1080, width: 1920 },
  generatedAt: "2026-08-24T10:00:00.000Z",
  storyboard: {
    schemaVersion: 1,
    id: "01989a3d-8e00-7000-8000-000000000009",
    projectId,
    basedOnNarrationSetId: "01989a3d-8e00-7000-8000-000000000011",
    narrationSetContentHash: hash,
    outlineSetId: "01989a3d-8e00-7000-8000-000000000012",
    outlineSetContentHash: hash,
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "1",
    model: "fixture",
    modelCallId: "01989a3d-8e00-7000-8000-000000000013",
    status: "draft",
    revision: 1,
    title: "Preview fixture",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 20,
    objectiveIds: ["01989a3d-8e00-7000-8000-000000000019"],
    contentHash: hash,
    scenes: [firstScene, secondScene].map((scene) => ({
      id: scene.id,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000014"],
      assetRequirements: [],
      scene,
    })),
    generatedAt: "2026-08-24T10:00:00.000Z",
    createdAt: "2026-08-24T10:00:00.000Z",
  },
  scenes: [firstScene, secondScene].map((scene) => ({
    sceneId: scene.id,
    audio: { status: "ready", url: null, expiresAt: null },
    captions: [],
    missingAssetIds: [],
    stale: true,
  })),
});

async function unusedPort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Could not allocate a test port.");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return address.port;
}

async function waitForPage(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      await fetch(url);
      return;
    } catch {
      // The Next server is still starting.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the Next test server.");
}

describe("full lesson preview route", () => {
  it(
    "hydrates seek and scene navigation against the real preview route",
    async () => {
      const apiServer = createServer((_request, response) => {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(manifest));
      });
      await new Promise<void>((resolve) =>
        apiServer.listen(0, "127.0.0.1", resolve),
      );
      const apiAddress = apiServer.address();
      if (apiAddress === null || typeof apiAddress === "string")
        throw new Error("Could not start the manifest test server.");
      const webPort = await unusedPort();
      const next: ChildProcess = spawn(
        process.execPath,
        [
          join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
          "dev",
          "--port",
          String(webPort),
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiAddress.port}`,
          },
          stdio: "ignore",
        },
      );
      try {
        const origin = `http://127.0.0.1:${webPort}`;
        await waitForPage(origin);
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.context().addCookies([
            {
              name: "avlp_session",
              value: "test-session",
              domain: "127.0.0.1",
              path: "/",
            },
          ]);
          await page.goto(`${origin}/workspace/${projectId}/preview`, {
            timeout: 60_000,
            waitUntil: "load",
          });
          await playwrightExpect(
            page.getByRole("button", { name: "Scene 2" }),
          ).toBeVisible();
          await page.getByRole("button", { name: "Scene 2" }).click();
          await playwrightExpect(page.getByLabel("Seek lesson")).toHaveValue(
            "300",
          );
          await playwrightExpect(page.getByRole("status")).toContainText(
            secondScene.id,
          );
        } finally {
          await browser.close();
        }
      } finally {
        next.kill();
        await new Promise<void>((resolve, reject) =>
          apiServer.close((error) =>
            error === undefined ? resolve() : reject(error),
          ),
        );
      }
    },
    90_000,
  );
});
