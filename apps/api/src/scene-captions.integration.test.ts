import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  captionCues,
  captionTracks,
  migrateDatabase,
  sceneAudio,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  blockA,
  definitionScene,
  lessonSpecId,
  now,
  ownerUserId,
  processScene,
  projectId,
  sceneA,
  sceneB,
  seed,
} from "./cinema-lesson.fixture.js";
import { loadSceneCaptionsMs } from "./scene-captions.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
let sequence = 0;
const nextId = () => {
  sequence += 1;
  return `019ffbf1-5a5a-7000-8000-${String(sequence).padStart(12, "0")}` as Identifier;
};

async function seedScenes(client: DatabaseClient) {
  await client.insert(scenes).values(
    [definitionScene, processScene].map((scene) => ({
      id: scene.id,
      projectId,
      ownerUserId,
      lessonSpecId,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: [blockA],
      assetRequirements: [],
      sceneJson: scene,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/** One audio take with one caption track, both at the given status and time. */
async function take(
  client: DatabaseClient,
  sceneId: Identifier,
  options: { audioStatus?: "ready" | "stale"; trackStatus?: "ready" | "stale"; minute: number; text: string },
) {
  const audioId = nextId();
  await client.insert(sceneAudio).values({
    id: audioId,
    ownerUserId,
    projectId,
    sceneId,
    status: options.audioStatus ?? "ready",
    voiceConfigurationVersion: 1,
    contentHash: `audio-${audioId}`,
    createdAt: at(options.minute),
    updatedAt: at(options.minute),
  });
  const trackId = nextId();
  await client.insert(captionTracks).values({
    id: trackId,
    ownerUserId,
    projectId,
    sceneAudioId: audioId,
    status: options.trackStatus ?? "ready",
    contentHash: `track-${trackId}`,
    createdAt: at(options.minute),
    updatedAt: at(options.minute),
  });
  await client.insert(captionCues).values([
    { id: nextId(), ownerUserId, projectId, trackId, position: 1, startMs: 400, endMs: 2_050, text: `${options.text} one`, createdAt: now },
    { id: nextId(), ownerUserId, projectId, trackId, position: 0, startMs: 0, endMs: 400, text: `${options.text} zero`, createdAt: now },
  ]);
}

describeWithPostgres("loadSceneCaptionsMs (ST-111, Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seed(database!.client);
    await seedScenes(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("reads each scene's latest ready audio and its latest ready track, in cue order", async () => {
    const client = database!.client;
    await take(client, sceneA, { minute: 1, text: "old" });
    await take(client, sceneA, { minute: 2, text: "current" });
    await take(client, sceneA, { minute: 3, audioStatus: "stale", text: "stale audio" });
    await take(client, sceneB, { minute: 1, trackStatus: "stale", text: "stale track" });

    const captions = await loadSceneCaptionsMs(client, { ownerUserId, projectId }, lessonSpecId);
    expect(captions.get(sceneA)).toEqual([
      { startMs: 0, endMs: 400, text: "current zero" },
      { startMs: 400, endMs: 2_050, text: "current one" },
    ]);
    // A scene whose only track is not ready has no captions yet.
    expect(captions.has(sceneB)).toBe(false);
  });

  it("reads nothing for another tenant", async () => {
    const client = database!.client;
    await take(client, sceneA, { minute: 1, text: "mine" });
    const captions = await loadSceneCaptionsMs(
      client,
      { ownerUserId: "019ffbf1-aaab-7000-8000-000000000108", projectId },
      lessonSpecId,
    );
    expect(captions.size).toBe(0);
  });
});
