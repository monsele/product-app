import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  illustrationGenerationCandidates,
  migrateDatabase,
  projectAssets,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { JobMetadata, RegisteredJobHandler } from "@avlp/jobs";
import {
  MockIllustrationProvider,
  ProviderCallError,
  type IllustrationProvider,
  type IllustrationRequest,
} from "@avlp/provider-adapters";
import {
  cinemaHeroSlot,
  cinemaIllustrationKey,
  cinemaIllustrationPromptVersion,
  creativeDesignHash,
  type CinemaIllustrationBrief,
} from "@avlp/schemas";
import type { ObjectStorage } from "@avlp/storage";
import { eq } from "drizzle-orm";
import {
  authoredDesign,
  definitionScene,
  draftId,
  now,
  otherOwnerId,
  otherProjectId,
  ownerUserId,
  projectId,
  readDraft,
  sceneA,
  sceneB,
  seedDatabase,
} from "./cinema-lesson.fixture.js";
import { createCinemaIllustrationJobHandler } from "./illustration-generation-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const candidateId: Identifier = "019ffbf1-9191-7000-8000-000000000110";
const puddle: CinemaIllustrationBrief = {
  concept: "warm puddle",
  description: "Sunlight warming a puddle while vapour drifts upward.",
  subject: "place",
};
const key = cinemaIllustrationKey(puddle.concept, "flat");

/** A valid 1×1 PNG, as the local mock provider returns. */
const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
  0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5,
  0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function approvedProvider(): MockIllustrationProvider {
  return new MockIllustrationProvider({
    providerCallId: "cinema-hero-1",
    mediaType: "image/png",
    bytes: png,
    width: 1,
    height: 1,
    units: 1,
    costUsd: 0.004,
    moderation: { status: "approved", code: "mock_safe" },
  });
}

/** Both scenes planned the same concept; the definition's art direction is flat. */
async function seedBriefs(client: DatabaseClient, briefB: CinemaIllustrationBrief = puddle) {
  const base = authoredDesign();
  const manifest = {
    ...base,
    artDirection: { ...base.artDirection, treatment: "flat" as const },
    scenes: {
      ...base.scenes,
      [sceneA]: { ...base.scenes[sceneA]!, imagery: { ...base.scenes[sceneA]!.imagery, brief: puddle } },
      [sceneB]: { ...base.scenes[sceneB]!, imagery: { ...base.scenes[sceneB]!.imagery, brief: briefB } },
    },
  };
  await client
    .update(creativeDesignDrafts)
    .set({ manifest, manifestHash: creativeDesignHash(manifest) })
    .where(eq(creativeDesignDrafts.id, draftId));
  await client.insert(illustrationGenerationCandidates).values({
    id: candidateId,
    ownerUserId,
    projectId,
    sceneId: sceneA,
    slot: cinemaHeroSlot,
    status: "queued",
    promptVersion: cinemaIllustrationPromptVersion,
    provider: "mock-illustration",
    moderationStatus: "pending",
    idempotencyKey: `cinema-hero:${key}`,
  });
  return manifest;
}

/** Private storage stand-in; the job only needs the write to succeed. */
function stubPutBytes() {
  return vi.fn(async () => ({}) as Awaited<ReturnType<ObjectStorage["putBytes"]>>);
}

async function run(
  handler: RegisteredJobHandler,
  options: { attempt?: number; ownerUserId?: Identifier; projectId?: Identifier } = {},
): Promise<JobMetadata> {
  return handler.handler(
    {
      schemaVersion: 2,
      candidateId,
      draftId,
      sceneIds: [sceneA, sceneB],
      key,
      brief: puddle,
      artDirection: {
        treatment: "flat",
        line: "bold",
        subjects: "people-and-objects",
        background: "soft-vignette",
        humanFigures: true,
      },
      palette: { accent: "#aa3300", diagramEmphasis: "#225588", surface: "#fff8ee" },
    },
    {
      jobId: createId(),
      projectId: options.projectId ?? projectId,
      ownerUserId: options.ownerUserId ?? ownerUserId,
      correlationId: createId(),
      idempotencyKey: "illustration:cinema:1",
      attempt: options.attempt ?? 1,
      heartbeat: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
    },
  );
}

async function candidateRow(client: DatabaseClient) {
  const [row] = await client
    .select()
    .from(illustrationGenerationCandidates)
    .where(eq(illustrationGenerationCandidates.id, candidateId));
  return row!;
}

async function imageUsage(client: DatabaseClient) {
  return client
    .select({ status: usageRecords.status })
    .from(usageRecords)
    .where(eq(usageRecords.operationType, "image.generation"));
}

describeWithPostgres("illustration.generate v2 — presentation heroes (ST-110, Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seedDatabase(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("generates one picture from the brief and pins it on every scene that planned it", async () => {
    const client = database!.client;
    await seedBriefs(client);
    const provider = approvedProvider();
    const putBytes = stubPutBytes();
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider,
      storage: { putBytes },
      now: () => now,
    });

    const result = await run(handler);
    expect(result).toMatchObject({ status: "accepted", bound: [sceneA, sceneB], draftRevision: 2 });

    const request = provider.requests[0] as IllustrationRequest;
    expect(request.style).toBe("cinema-flat");
    expect(request.prompt).toContain("Sunlight warming a puddle while vapour drifts upward.");
    expect(request.prompt).toContain("friendly, diverse people may appear");
    // Never lesson or source text.
    expect(request.prompt).not.toContain(definitionScene.narration);

    const draft = await readDraft(client);
    expect(draft.revision).toBe(2);
    expect(draft.manifestHash).toBe(creativeDesignHash(draft.manifest));
    for (const sceneId of [sceneA, sceneB])
      expect(draft.manifest.scenes[sceneId]!.imagery.hero).toEqual({
        assetId: result.assetId,
        origin: "generated",
        altText: puddle.description,
      });
    const [asset] = await client
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.id, result.assetId as Identifier));
    expect(asset).toMatchObject({ status: "active", provenance: "ai_generated" });
    expect(await candidateRow(client)).toMatchObject({ status: "accepted", assetId: result.assetId });
    expect(putBytes).toHaveBeenCalledTimes(1);
    expect(await imageUsage(client)).toEqual([{ status: "succeeded" }]);
  });

  it("is idempotent: a redelivered job neither generates nor meters again", async () => {
    const client = database!.client;
    await seedBriefs(client);
    const provider = approvedProvider();
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider,
      storage: { putBytes: stubPutBytes() },
      now: () => now,
    });
    await run(handler);
    await expect(run(handler, { attempt: 2 })).resolves.toEqual({ status: "accepted" });
    expect(provider.requests).toHaveLength(1);
    expect((await readDraft(client)).revision).toBe(2);
    expect(await imageUsage(client)).toHaveLength(1);
  });

  it("binds only scenes that still want this concept and have no picture", async () => {
    const client = database!.client;
    await seedBriefs(client, { ...puddle, concept: "rain cloud" });
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider: approvedProvider(),
      storage: { putBytes: stubPutBytes() },
      now: () => now,
    });
    await expect(run(handler)).resolves.toMatchObject({ bound: [sceneA] });
    const draft = await readDraft(client);
    expect(draft.manifest.scenes[sceneB]!.imagery.hero).toBeNull();
  });

  it("keeps the authored motif when moderation rejects the picture, without stopping the video (AC3)", async () => {
    const client = database!.client;
    const before = await seedBriefs(client);
    const putBytes = stubPutBytes();
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider: new MockIllustrationProvider({
        providerCallId: "blocked",
        mediaType: "image/png",
        bytes: png,
        width: 1,
        height: 1,
        units: 1,
        costUsd: 0.004,
        moderation: { status: "rejected", code: "CONTENT_FILTER" },
      }),
      storage: { putBytes },
      now: () => now,
    });
    await expect(run(handler)).resolves.toEqual({
      status: "rejected",
      code: "CONTENT_FILTER",
      fallback: "motif",
    });
    expect(putBytes).not.toHaveBeenCalled();
    const draft = await readDraft(client);
    expect(draft.revision).toBe(1);
    expect(draft.manifestHash).toBe(creativeDesignHash(before));
    expect(await candidateRow(client)).toMatchObject({ status: "failed", moderationStatus: "rejected" });
    expect(await imageUsage(client)).toEqual([{ status: "failed" }]);
  });

  it("retries a retryable provider failure and keeps the motif on the final attempt", async () => {
    const client = database!.client;
    await seedBriefs(client);
    const generate = vi.fn(async () => {
      throw new ProviderCallError({ code: "PROVIDER_UNAVAILABLE", message: "down", retryable: true });
    });
    const provider: IllustrationProvider = { providerId: "flaky", generate };
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider,
      storage: { putBytes: stubPutBytes() },
      now: () => now,
    });
    await expect(run(handler, { attempt: 1 })).rejects.toMatchObject({
      classification: "retryable",
      code: "PROVIDER_UNAVAILABLE",
    });
    await expect(run(handler, { attempt: 3 })).resolves.toEqual({
      status: "failed",
      code: "PROVIDER_UNAVAILABLE",
      fallback: "motif",
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect((await readDraft(client)).revision).toBe(1);
  });

  it("cannot generate for another tenant's candidate", async () => {
    const client = database!.client;
    await seedBriefs(client);
    const provider = approvedProvider();
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider,
      storage: { putBytes: stubPutBytes() },
      now: () => now,
    });
    await expect(
      run(handler, { ownerUserId: otherOwnerId, projectId: otherProjectId }),
    ).rejects.toMatchObject({ code: "ILLUSTRATION_CANDIDATE_NOT_FOUND" });
    expect(provider.requests).toHaveLength(0);
  });
});
