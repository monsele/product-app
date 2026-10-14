import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  illustrationGenerationCandidates,
  illustrationLibraryEntries,
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
} from "@avlp/provider-adapters";
import {
  cinemaHeroSlot,
  cinemaIllustrationKey,
  cinemaIllustrationPromptVersion,
  creativeDesignHash,
  illustrationLibraryPromptVersion,
  type CinemaArtDirection,
  type CinemaIllustrationBrief,
} from "@avlp/schemas";
import type { ObjectStorage } from "@avlp/storage";
import { eq } from "drizzle-orm";
import {
  authoredDesign,
  draftId,
  now,
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

const candidateId: Identifier = "019ffbf1-9191-7000-8000-000000000213";
const entryId: Identifier = "019ffbf1-9191-7000-8000-000000000113";
const puddle: CinemaIllustrationBrief = {
  concept: "warm puddle",
  description: "Sunlight warming a puddle while vapour drifts upward.",
  subject: "place",
};
const key = cinemaIllustrationKey(puddle.concept, "flat");
const withPeople: CinemaArtDirection = {
  treatment: "flat",
  line: "bold",
  subjects: "people-and-objects",
  background: "soft-vignette",
  humanFigures: true,
};

/** A valid 1×1 PNG. */
const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
  0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5,
  0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
const checksum = createHash("sha256").update(png).digest("hex");
const libraryKey = `catalog/illustrations/flat/light/${checksum}.png`;

function rejecting(): MockIllustrationProvider {
  return new MockIllustrationProvider({
    providerCallId: "blocked",
    mediaType: "image/png",
    bytes: png,
    width: 1,
    height: 1,
    units: 1,
    costUsd: 0.004,
    moderation: { status: "rejected", code: "CONTENT_FILTER" },
  });
}

/** Library storage stand-in, confined in production to `catalog/illustrations`. */
function catalog(bytes: Uint8Array = png) {
  return {
    getBytes: vi.fn(async () => ({
      body: bytes,
      metadata: {} as Awaited<ReturnType<ObjectStorage["getBytes"]>>["metadata"],
    })),
  };
}

function stubPutBytes() {
  return vi.fn<ObjectStorage["putBytes"]>(async () => ({}) as Awaited<ReturnType<ObjectStorage["putBytes"]>>);
}

/** Both scenes planned the puddle in a flat treatment on a light surface. */
async function seedBriefs(client: DatabaseClient) {
  const base = authoredDesign();
  const manifest = {
    ...base,
    artDirection: { ...base.artDirection, treatment: "flat" as const },
    scenes: {
      ...base.scenes,
      [sceneA]: { ...base.scenes[sceneA]!, imagery: { ...base.scenes[sceneA]!.imagery, brief: puddle } },
      [sceneB]: { ...base.scenes[sceneB]!, imagery: { ...base.scenes[sceneB]!.imagery, brief: puddle } },
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
}

async function seedEntry(
  client: DatabaseClient,
  overrides: Partial<typeof illustrationLibraryEntries.$inferInsert> = {},
) {
  await client.insert(illustrationLibraryEntries).values({
    id: entryId,
    illustrationKey: key,
    treatment: "flat",
    surface: "light",
    concept: puddle.concept,
    description: "A puddle drying in the sun.",
    subject: "place",
    depictsPeople: false,
    altText: "A puddle drying in the sun.",
    status: "active",
    storageKey: libraryKey,
    checksumSha256: checksum,
    contentType: "image/png",
    width: 1,
    height: 1,
    prompt: "A puddle drying in the sun.",
    promptVersion: illustrationLibraryPromptVersion,
    provider: "mock-illustration",
    ...overrides,
  });
}

async function run(
  handler: RegisteredJobHandler,
  options: { attempt?: number; artDirection?: CinemaArtDirection } = {},
): Promise<JobMetadata> {
  return handler.handler(
    {
      schemaVersion: 2,
      candidateId,
      draftId,
      sceneIds: [sceneA, sceneB],
      key,
      brief: puddle,
      artDirection: options.artDirection ?? withPeople,
      // A light surface colour: only `light` library entries are eligible.
      palette: { accent: "#aa3300", diagramEmphasis: "#225588", surface: "#fff8ee" },
    },
    {
      jobId: createId(),
      projectId,
      ownerUserId,
      correlationId: createId(),
      idempotencyKey: "illustration:cinema:library",
      attempt: options.attempt ?? 1,
      heartbeat: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
    },
  );
}

describeWithPostgres("illustration.generate v2 — library fallback (ST-113, Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(illustrationLibraryEntries);
    await seedDatabase(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  const imageUsage = (client: DatabaseClient) =>
    client
      .select({ status: usageRecords.status })
      .from(usageRecords)
      .where(eq(usageRecords.operationType, "image.generation"));
  const libraryRows = (client: DatabaseClient) =>
    client.select().from(illustrationLibraryEntries);

  it("pins a matching library picture when moderation rejects the generated one, metered once (AC3, AC6)", async () => {
    const client = database!.client;
    await seedBriefs(client);
    await seedEntry(client);
    const before = await libraryRows(client);
    const putBytes = stubPutBytes();
    const reader = catalog();
    const provider = rejecting();
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider,
      storage: { putBytes },
      library: { catalog: reader },
      now: () => now,
    });

    const result = await run(handler);
    expect(result).toMatchObject({
      status: "rejected",
      code: "CONTENT_FILTER",
      fallback: "library",
      libraryEntryId: entryId,
      libraryMatch: "exact",
      bound: [sceneA, sceneB],
    });
    expect(provider.requests).toHaveLength(1);
    expect(reader.getBytes).toHaveBeenCalledWith(libraryKey, expect.any(Number));
    expect(putBytes).toHaveBeenCalledTimes(1);
    expect(putBytes.mock.calls[0]![0]).toMatchObject({
      key: expect.stringMatching(new RegExp(`^users/${ownerUserId}/projects/${projectId}/`)),
      contentType: "image/png",
    });

    const draft = await readDraft(client);
    expect(draft.revision).toBe(2);
    expect(draft.manifestHash).toBe(creativeDesignHash(draft.manifest));
    for (const sceneId of [sceneA, sceneB])
      expect(draft.manifest.scenes[sceneId]!.imagery.hero).toEqual({
        assetId: result.assetId,
        origin: "library",
        altText: "A puddle drying in the sun.",
      });
    const [asset] = await client
      .select()
      .from(projectAssets)
      .where(eq(projectAssets.id, result.assetId as Identifier));
    expect(asset).toMatchObject({
      ownerUserId,
      projectId,
      status: "active",
      provenance: "ai_generated",
      sha256: checksum,
      originalName: "library-illustration.png",
    });
    // The one paid call is metered once; the library copy costs nothing.
    expect(await imageUsage(client)).toEqual([{ status: "failed" }]);
    // Tenant work never writes the library.
    expect(await libraryRows(client)).toEqual(before);
  });

  it("pins a library picture after a final-attempt failure and reuses the project copy", async () => {
    const client = database!.client;
    await seedBriefs(client);
    await seedEntry(client);
    const reader = catalog();
    const generate = vi.fn(async () => {
      throw new ProviderCallError({ code: "PROVIDER_UNAVAILABLE", message: "down", retryable: true });
    });
    const provider: IllustrationProvider = { providerId: "flaky", generate };
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider,
      storage: { putBytes: stubPutBytes() },
      library: { catalog: reader },
      now: () => now,
    });
    // An attempt that will be retried takes no fallback yet.
    await expect(run(handler, { attempt: 1 })).rejects.toMatchObject({ classification: "retryable" });
    expect(reader.getBytes).not.toHaveBeenCalled();
    const result = await run(handler, { attempt: 3 });
    expect(result).toMatchObject({ status: "failed", fallback: "library", bound: [sceneA, sceneB] });
    expect((await readDraft(client)).manifest.scenes[sceneA]!.imagery.hero?.origin).toBe("library");

    // A later fallback in the same project reuses the copy instead of storing it again.
    const again = await run(handler, { attempt: 3 });
    expect(again).toMatchObject({ fallback: "library", assetId: result.assetId, bound: [] });
    expect(reader.getBytes).toHaveBeenCalledTimes(1);
  });

  it("keeps the motif when no active entry fits: retired, another surface, or people excluded (AC4)", async () => {
    const client = database!.client;
    const cases: {
      entry: Partial<typeof illustrationLibraryEntries.$inferInsert>;
      artDirection?: CinemaArtDirection;
    }[] = [
      { entry: { status: "retired" } },
      { entry: { surface: "dark", storageKey: `catalog/illustrations/flat/dark/${checksum}.png` } },
      {
        entry: { depictsPeople: true, subject: "person" },
        artDirection: { ...withPeople, subjects: "objects", humanFigures: false },
      },
    ];
    for (const entry of cases) {
      await client.delete(illustrationLibraryEntries);
      await seedDatabase(client);
      await seedBriefs(client);
      await seedEntry(client, entry.entry);
      const reader = catalog();
      const handler = createCinemaIllustrationJobHandler({
        database: client,
        provider: rejecting(),
        storage: { putBytes: stubPutBytes() },
        library: { catalog: reader },
        now: () => now,
      });
      await expect(
        run(handler, entry.artDirection === undefined ? {} : { artDirection: entry.artDirection }),
      ).resolves.toEqual({ status: "rejected", code: "CONTENT_FILTER", fallback: "motif" });
      expect(reader.getBytes).not.toHaveBeenCalled();
      expect((await readDraft(client)).revision).toBe(1);
    }
  });

  it("still succeeds on the motif when the library bytes do not match their checksum", async () => {
    const client = database!.client;
    await seedBriefs(client);
    await seedEntry(client);
    const putBytes = stubPutBytes();
    const handler = createCinemaIllustrationJobHandler({
      database: client,
      provider: rejecting(),
      storage: { putBytes },
      library: { catalog: catalog(new Uint8Array([1, 2, 3])) },
      now: () => now,
    });
    await expect(run(handler)).resolves.toMatchObject({
      status: "rejected",
      fallback: "motif",
      libraryError: "ILLUSTRATION_LIBRARY_CHECKSUM_MISMATCH",
    });
    expect(putBytes).not.toHaveBeenCalled();
    expect((await readDraft(client)).revision).toBe(1);
  });
});
