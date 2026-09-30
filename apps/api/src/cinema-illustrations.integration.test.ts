import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  illustrationGenerationCandidates,
  jobs,
  lessonSpecs,
  migrateDatabase,
  outboxEvents,
  projectAssets,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  anyCreativeDesignManifestSchema,
  cinemaHeroSlot,
  cinemaIllustrationJobPayloadSchema,
  cinemaIllustrationKey,
  cinemaIllustrationPromptVersion,
  createDefaultCreativeDesignManifest,
  creativeDesignHash,
  isCreativeDesignManifestV2,
  planCinemaDesign,
  sceneSpecSchema,
  type CinemaIllustrationBrief,
} from "@avlp/schemas";
import { eq } from "drizzle-orm";
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
  sourceRefs,
  storyboardPayload,
} from "./cinema-lesson.fixture.js";
import { IllustrationGenerationService } from "./illustration-generation.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const sceneC: Identifier = "019ffbf1-7779-7000-8000-000000000108";
const sceneD: Identifier = "019ffbf1-777a-7000-8000-000000000108";
const draftId: Identifier = "019ffbf1-8888-7000-8000-000000000108";
const correlationId: Identifier = "019ffbf1-0000-7000-8000-000000000208";

const hookScene = {
  id: sceneC,
  order: 3,
  title: "Where does the puddle go?",
  narration: "Where does a puddle go on a sunny day? It seems to vanish.",
  durationSeconds: 30,
  onScreenText: [],
  transition: "cut",
  assetBindings: [],
  sourceRefs,
  generatedAdditions: [],
  template: "hook",
  visual: { question: "Where does a puddle go on a sunny day?", prompt: "Think about it." },
};
const analogyScene = {
  id: sceneD,
  order: 4,
  title: "Like a kettle",
  narration: "Evaporation is like a kettle. Heat turns the water into steam.",
  durationSeconds: 30,
  onScreenText: [],
  transition: "fade",
  assetBindings: [],
  sourceRefs,
  generatedAdditions: [],
  template: "analogy",
  visual: {
    sourceConcept: "Evaporation",
    familiarSystem: "A kettle boiling",
    mappings: [
      { concept: "Heat", analogy: "Stove" },
      { concept: "Vapour", analogy: "Steam" },
    ],
  },
};
const lesson = [definitionScene, processScene, hookScene, analogyScene];
const sceneSpecs = lesson.map((scene) => sceneSpecSchema.parse(scene));

const puddle: CinemaIllustrationBrief = {
  concept: "warm puddle",
  description: "Sunlight warming a puddle while vapour drifts upward.",
  subject: "place",
};
const kettle: CinemaIllustrationBrief = {
  concept: "kettle",
  description: "A kettle on a stove letting out a curl of steam.",
  subject: "object",
};

/** Picture-led hook and analogy, a chapter inset for the definition. */
function design() {
  const manifest = planCinemaDesign({
    packId: "everyday",
    scenes: sceneSpecs,
    seed: "0123456789abcdef",
    locks: {
      [sceneA]: "chapter",
      [sceneC]: "illustrated-headline",
      [sceneD]: "illustrated-headline",
    },
  });
  const brief = (id: string, value: CinemaIllustrationBrief) => ({
    ...manifest.scenes[id]!,
    imagery: { ...manifest.scenes[id]!.imagery, brief: value },
  });
  return {
    ...manifest,
    scenes: {
      ...manifest.scenes,
      [sceneA]: brief(sceneA, puddle),
      [sceneC]: brief(sceneC, puddle),
      [sceneD]: brief(sceneD, kettle),
    },
  };
}

async function seedLesson(
  client: DatabaseClient,
  options: { manifest?: unknown } = {},
) {
  await seed(client);
  const base = storyboardPayload();
  const payload = {
    ...base,
    totalDurationSeconds: 120,
    scenes: lesson.map((scene) => ({
      id: scene.id,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: [blockA],
      assetRequirements: [],
      scene,
    })),
  };
  await client
    .update(lessonSpecs)
    .set({ payload, totalDurationSeconds: payload.totalDurationSeconds })
    .where(eq(lessonSpecs.id, lessonSpecId));
  await client.insert(scenes).values(
    payload.scenes.map((entry) => ({
      id: entry.id,
      projectId,
      ownerUserId,
      lessonSpecId,
      stableSceneId: entry.stableSceneId,
      order: entry.order,
      template: entry.template,
      durationSeconds: entry.durationSeconds,
      narrationBlockIds: entry.narrationBlockIds,
      assetRequirements: entry.assetRequirements,
      sceneJson: entry.scene,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const manifest = options.manifest ?? design();
  await client.insert(creativeDesignDrafts).values({
    id: draftId,
    projectId,
    ownerUserId,
    lessonSpecId,
    lessonSpecRevision: 0,
    manifest,
    manifestHash: creativeDesignHash(manifest as Parameters<typeof creativeDesignHash>[0]),
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
}

async function readDraft(client: DatabaseClient) {
  const [row] = await client
    .select()
    .from(creativeDesignDrafts)
    .where(eq(creativeDesignDrafts.id, draftId));
  const manifest = anyCreativeDesignManifestSchema.parse(row!.manifest);
  if (!isCreativeDesignManifestV2(manifest)) throw new Error("expected a v2 draft");
  return { revision: row!.revision, manifest };
}

describeWithPostgres("queueCinemaIllustrations (ST-110, Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: IllustrationGenerationService;
  const queue = () => service.queueCinemaIllustrations({ ownerUserId, projectId, correlationId });

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(() => {
    service = new IllustrationGenerationService(database!.client, () => now);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("queues one picture per concept and treatment, for every scene that planned it", async () => {
    const client = database!.client;
    await seedLesson(client);
    const result = await queue();

    expect(result.budget).toBe(5);
    expect(result.reused).toEqual([]);
    expect(result.motif).toEqual([]);
    const treatment = design().artDirection.treatment;
    expect(result.queued.map((entry) => [entry.key, entry.sceneIds])).toEqual([
      [cinemaIllustrationKey("warm puddle", treatment), [sceneA, sceneC]],
      [cinemaIllustrationKey("kettle", treatment), [sceneD]],
    ]);
    const candidates = await client.select().from(illustrationGenerationCandidates);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      slot: cinemaHeroSlot,
      status: "queued",
      promptVersion: cinemaIllustrationPromptVersion,
    });
    const queuedJobs = await client.select().from(jobs);
    expect(queuedJobs.map((job) => [job.jobType, job.payloadVersion])).toEqual([
      ["illustration.generate", 2],
      ["illustration.generate", 2],
    ]);
    const payload = cinemaIllustrationJobPayloadSchema.parse(
      queuedJobs.find((job) => job.id === result.queued[0]!.jobId)!.payload,
    );
    expect(payload).toMatchObject({
      draftId,
      sceneIds: [sceneA, sceneC],
      brief: puddle,
      artDirection: design().artDirection,
    });
    expect(await client.select().from(outboxEvents)).toHaveLength(2);
  });

  it("is idempotent: a replayed request queues and pays for nothing new", async () => {
    const client = database!.client;
    await seedLesson(client);
    await queue();
    const again = await queue();
    expect(again.queued).toEqual([]);
    expect(await client.select().from(jobs)).toHaveLength(2);
    expect(await client.select().from(illustrationGenerationCandidates)).toHaveLength(2);
  });

  it("stays within the budget, serving picture-led scenes first", async () => {
    const client = database!.client;
    await seedLesson(client);
    // Four of this lesson's five pictures were already paid for (one failed).
    await client.insert(illustrationGenerationCandidates).values(
      ["stove", "cloud", "sun", "river"].map((concept, index) => ({
        id: `019ffbf1-9292-7000-8000-00000000020${index}`,
        ownerUserId,
        projectId,
        sceneId: sceneB,
        slot: cinemaHeroSlot,
        status: index === 0 ? "failed" : "queued",
        promptVersion: cinemaIllustrationPromptVersion,
        provider: "mock-illustration",
        moderationStatus: "pending",
        idempotencyKey: `cinema-hero:${cinemaIllustrationKey(concept, "flat")}`,
      })),
    );
    const result = await queue();
    expect(result.budget).toBe(5);
    // Both are picture-led; the earlier scene wins and the rest keep a motif.
    expect(result.queued.map((entry) => entry.sceneIds)).toEqual([[sceneA, sceneC]]);
    expect(result.motif).toEqual([{ sceneId: sceneD, reason: "over_budget" }]);
    expect(await client.select().from(jobs)).toHaveLength(1);
    // A later call cannot exceed the budget either.
    expect((await queue()).queued).toEqual([]);
  });

  it("reuses a picture this project already generated for the same concept", async () => {
    const client = database!.client;
    await seedLesson(client);
    const assetId: Identifier = "019ffbf1-4444-7000-8000-000000000208";
    await client.insert(projectAssets).values({
      id: assetId,
      ownerUserId,
      projectId,
      mediaType: "image/png",
      originalName: "generated-illustration.png",
      sizeBytes: 100,
      sha256: "e".repeat(64),
      width: 1,
      height: 1,
      storageKey: "users/owner/assets/puddle.png",
      provenance: "ai_generated",
      status: "active",
    });
    await client.insert(illustrationGenerationCandidates).values({
      id: "019ffbf1-9191-7000-8000-000000000208",
      ownerUserId,
      projectId,
      sceneId: sceneB,
      slot: cinemaHeroSlot,
      assetId,
      status: "accepted",
      promptVersion: cinemaIllustrationPromptVersion,
      provider: "mock-illustration",
      moderationStatus: "approved",
      idempotencyKey: `cinema-hero:${cinemaIllustrationKey("warm puddle", design().artDirection.treatment)}`,
    });

    const result = await queue();
    expect(result.reused).toEqual([
      { sceneId: sceneA, assetId },
      { sceneId: sceneC, assetId },
    ]);
    expect(result.queued.map((entry) => entry.sceneIds)).toEqual([[sceneD]]);
    const draft = await readDraft(client);
    expect(draft.revision).toBe(2);
    expect(draft.manifest.scenes[sceneA]!.imagery.hero).toEqual({
      assetId,
      origin: "generated",
      altText: puddle.description,
    });
  });

  it("queues nothing for a v1 design", async () => {
    const client = database!.client;
    await seedLesson(client, {
      manifest: createDefaultCreativeDesignManifest({
        packId: "everyday",
        scenes: sceneSpecs.map((scene) => ({
          id: scene.id,
          template: scene.template,
          durationSeconds: scene.durationSeconds,
        })),
      }),
    });
    await expect(queue()).resolves.toMatchObject({ queued: [], skipped: "design_v1" });
    expect(await client.select().from(jobs)).toHaveLength(0);
  });
});
