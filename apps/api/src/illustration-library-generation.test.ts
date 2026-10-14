import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  illustrationLibraryEntries,
  migrateDatabase,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  MockIllustrationProvider,
  ProviderCallError,
  type IllustrationProvider,
  type IllustrationRequest,
} from "@avlp/provider-adapters";
import {
  cinemaIllustrationKey,
  cinemaIllustrationSurface,
  type IllustrationLibraryConceptList,
} from "@avlp/schemas";
import type { ObjectStorage } from "@avlp/storage";
import { eq } from "drizzle-orm";
import {
  generateIllustrationLibrary,
  illustrationLibraryPalettes,
  loadConceptList,
  parseLibraryArguments,
  planLibraryGeneration,
  type LibraryGenerationOptions,
} from "./illustration-library-generation.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

/** A valid 1×1 PNG. */
const png = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
  0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240, 31, 0, 5,
  0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

const list: IllustrationLibraryConceptList = {
  listVersion: 1,
  concepts: [
    { concept: "savings jar", description: "A glass jar filling with coins.", subject: "object", depictsPeople: false },
    { concept: "kettle", description: "A kettle letting out a curl of steam.", subject: "object", depictsPeople: false },
    { concept: "teacher explaining", description: "A teacher at a board.", subject: "person", depictsPeople: true },
  ],
};
const flatLight: LibraryGenerationOptions = {
  treatments: ["flat"],
  surfaces: ["light"],
  max: 20,
  dryRun: false,
};

describe("illustration library script (ST-113)", () => {
  it("parses its arguments and refuses anything else", () => {
    expect(parseLibraryArguments(["--list", "concepts.json"])).toEqual({
      list: "concepts.json",
      treatments: ["flat", "ink-sketch", "editorial"],
      surfaces: ["light", "dark"],
      max: 20,
      dryRun: false,
    });
    expect(
      parseLibraryArguments(["--list", "c.json", "--treatment", "ink-sketch,flat", "--surface", "dark", "--max", "5", "--dry-run"]),
    ).toEqual({ list: "c.json", treatments: ["ink-sketch", "flat"], surfaces: ["dark"], max: 5, dryRun: true });
    expect(() => parseLibraryArguments([])).toThrow();
    expect(() => parseLibraryArguments(["--list", "c.json", "--treatment", "watercolour"])).toThrow();
    expect(() => parseLibraryArguments(["--list", "c.json", "--max", "0"])).toThrow();
    expect(() => parseLibraryArguments(["--list", "c.json", "--force"])).toThrow();
  });

  it("checks in a reviewed concept list: about forty unique, generic concepts", async () => {
    const concepts = await loadConceptList(
      fileURLToPath(new URL("../illustration-library/concepts.json", import.meta.url)),
    );
    expect(concepts.concepts.length).toBeGreaterThanOrEqual(36);
    expect(concepts.concepts.length).toBeLessThanOrEqual(48);
    // People appear only in concepts flagged as depicting them.
    for (const entry of concepts.concepts)
      expect(entry.depictsPeople).toBe(entry.subject === "person");
  });

  it("gives each surface a palette that resolves to that surface", () => {
    expect(cinemaIllustrationSurface(illustrationLibraryPalettes.light.surface)).toBe("light");
    expect(cinemaIllustrationSurface(illustrationLibraryPalettes.dark.surface)).toBe("dark");
  });

  it("plans in list order, caps at max, skips settled pictures and retries failed ones", () => {
    const options = { ...flatLight, surfaces: ["light", "dark"] as const, max: 3 };
    const jar = cinemaIllustrationKey("savings jar", "flat");
    const kettle = cinemaIllustrationKey("kettle", "flat");
    const plan = planLibraryGeneration(
      list,
      options,
      new Map([
        [`${jar}|light`, "active"],
        [`${jar}|dark`, "failed"],
        [`${kettle}|light`, "generating"],
      ]),
    );
    expect(plan.items.map((item) => [item.key, item.surface, item.retry])).toEqual([
      [jar, "dark", true],
      [kettle, "dark", false],
      [cinemaIllustrationKey("teacher explaining", "flat"), "light", false],
    ]);
    expect(plan.alreadyDone).toBe(2);
    expect(plan.remaining).toBe(1);
  });
});

describeWithPostgres("illustration library script (ST-113, Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(illustrationLibraryEntries);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  const approved = (costUsd = 0.004) =>
    new MockIllustrationProvider({
      providerCallId: "library-1",
      mediaType: "image/png",
      bytes: png,
      width: 1,
      height: 1,
      units: 1,
      costUsd,
      moderation: { status: "approved", code: "mock_safe" },
    });
  const storage = () =>
    ({ putBytes: vi.fn<ObjectStorage["putBytes"]>(async () => ({}) as Awaited<ReturnType<ObjectStorage["putBytes"]>>) });

  it("prices the plan and makes no paid call or write on a dry run (AC5)", async () => {
    const provider = approved();
    const putBytes = storage();
    const lines: string[] = [];
    const summary = await generateIllustrationLibrary({
      database: database!.client,
      list,
      options: { ...flatLight, dryRun: true },
      costPerImageUsd: 0.00225,
      provider,
      storage: putBytes,
      log: (line) => lines.push(line),
    });
    expect(summary).toMatchObject({ planned: 3, estimatedCostUsd: 0.00675, generated: 0, spentUsd: 0, dryRun: true });
    expect(lines[0]).toContain("3 to generate (max 20)");
    expect(lines[0]).toContain("Estimated cost: $");
    expect(provider.requests).toHaveLength(0);
    expect(putBytes.putBytes).not.toHaveBeenCalled();
    expect(await database!.client.select().from(illustrationLibraryEntries)).toEqual([]);
  });

  it("never exceeds --max, and a re-run generates nothing new (AC5)", async () => {
    const provider = approved();
    const putBytes = storage();
    const first = await generateIllustrationLibrary({
      database: database!.client,
      list,
      options: { ...flatLight, max: 2 },
      costPerImageUsd: 0.004,
      provider,
      storage: putBytes,
      log: () => undefined,
    });
    expect(first).toMatchObject({ planned: 2, generated: 2, remaining: 1, spentUsd: 0.008 });
    expect(provider.requests).toHaveLength(2);
    const rows = await database!.client.select().from(illustrationLibraryEntries);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ status: "active", surface: "light", contentType: "image/png", costUsd: "0.004000" });
      expect(row.storageKey).toBe(`catalog/illustrations/flat/light/${row.id}/${row.checksumSha256}.png`);
    }
    // The prompt is built from the concept list alone.
    const prompt = (provider.requests[0] as IllustrationRequest).prompt;
    expect(prompt).toContain("A glass jar filling with coins. Main subject: savings jar.");
    expect(prompt).toContain("no people");

    const second = await generateIllustrationLibrary({
      database: database!.client,
      list,
      options: { ...flatLight, max: 2 },
      costPerImageUsd: 0.004,
      provider,
      storage: putBytes,
      log: () => undefined,
    });
    expect(second).toMatchObject({ planned: 1, generated: 1, alreadyDone: 2 });
    const third = await generateIllustrationLibrary({
      database: database!.client,
      list,
      options: flatLight,
      costPerImageUsd: 0.004,
      provider,
      storage: putBytes,
      log: () => undefined,
    });
    expect(third).toMatchObject({ planned: 0, generated: 0, alreadyDone: 3, spentUsd: 0 });
    expect(provider.requests).toHaveLength(3);
    // People appear only where the concept depicts them.
    expect((provider.requests[2] as IllustrationRequest).prompt).toContain("friendly, diverse people may appear");
  });

  it("records a moderation rejection without activating it or retrying it, and retries a provider failure", async () => {
    const rejecting = new MockIllustrationProvider({
      providerCallId: "blocked",
      mediaType: "image/png",
      bytes: png,
      width: 1,
      height: 1,
      units: 1,
      costUsd: 0.004,
      moderation: { status: "rejected", code: "CONTENT_FILTER" },
    });
    const one = { ...list, concepts: [list.concepts[0]!] };
    const rejected = await generateIllustrationLibrary({
      database: database!.client,
      list: one,
      options: flatLight,
      costPerImageUsd: 0.004,
      provider: rejecting,
      storage: storage(),
      log: () => undefined,
    });
    expect(rejected).toMatchObject({ rejected: 1, generated: 0, spentUsd: 0.004 });
    const [row] = await database!.client.select().from(illustrationLibraryEntries);
    expect(row).toMatchObject({ status: "rejected", failureCode: "CONTENT_FILTER", storageKey: null });
    await expect(
      generateIllustrationLibrary({
        database: database!.client,
        list: one,
        options: flatLight,
        costPerImageUsd: 0.004,
        provider: rejecting,
        storage: storage(),
        log: () => undefined,
      }),
    ).resolves.toMatchObject({ planned: 0 });
    expect(rejecting.requests).toHaveLength(1);

    await database!.client.delete(illustrationLibraryEntries);
    const generate = vi.fn<IllustrationProvider["generate"]>(async () => {
      throw new ProviderCallError({ code: "PROVIDER_UNAVAILABLE", message: "down", retryable: true });
    });
    await expect(
      generateIllustrationLibrary({
        database: database!.client,
        list: one,
        options: flatLight,
        costPerImageUsd: 0.004,
        provider: { providerId: "flaky", generate },
        storage: storage(),
        log: () => undefined,
      }),
    ).resolves.toMatchObject({ failed: 1, spentUsd: 0 });
    const [failed] = await database!.client.select().from(illustrationLibraryEntries);
    expect(failed).toMatchObject({ status: "failed", failureCode: "PROVIDER_UNAVAILABLE" });
    const retried = await generateIllustrationLibrary({
      database: database!.client,
      list: one,
      options: flatLight,
      costPerImageUsd: 0.004,
      provider: approved(),
      storage: storage(),
      log: () => undefined,
    });
    expect(retried).toMatchObject({ planned: 1, generated: 1 });
    const [active] = await database!.client
      .select()
      .from(illustrationLibraryEntries)
      .where(eq(illustrationLibraryEntries.id, failed!.id));
    expect(active).toMatchObject({ status: "active", failureCode: null });
  });

  it("refuses to generate without a provider and storage", async () => {
    await expect(
      generateIllustrationLibrary({
        database: database!.client,
        list,
        options: flatLight,
        costPerImageUsd: 0.004,
        log: () => undefined,
      }),
    ).rejects.toThrow(/provider and library storage are required/u);
    expect(await database!.client.select().from(illustrationLibraryEntries)).toEqual([]);
  });
});
