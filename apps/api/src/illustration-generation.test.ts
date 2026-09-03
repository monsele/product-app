import { describe, expect, it, vi } from "vitest";
import { PublicError, type Identifier } from "@avlp/config";
import { type DatabaseClient } from "@avlp/database";
import { createDefaultStoryboardSceneSpec } from "@avlp/schemas";
import { IllustrationGenerationService } from "./illustration-generation.js";

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001" as Identifier;
const projectId = "019ffbf1-ffff-7000-8000-000000000001" as Identifier;
const sceneId = "019ffbf1-eeee-7000-8000-000000000050" as Identifier;
const correlationId = "019ffbf1-eeee-7000-8000-000000000099" as Identifier;
const candidateId = "019ffbf1-eeee-7000-8000-000000000060" as Identifier;
const jobId = "019ffbf1-eeee-7000-8000-000000000061" as Identifier;

function fakeDatabase(
  selectResults: unknown[][],
  insertResults: unknown[][],
): { database: DatabaseClient; inserts: unknown[] } {
  const inserts: unknown[] = [];
  const select = () => {
    const query = {
      where: () => query,
      limit: () => query,
      for: () => query,
      orderBy: () => query,
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(selectResults.shift() ?? []).then(resolve),
    };
    return { from: () => query };
  };
  const insert = () => {
    const query = {
      values: (value: unknown) => {
        inserts.push(value);
        return query;
      },
      onConflictDoNothing: () => query,
      returning: async () => insertResults.shift() ?? [],
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(insertResults.shift() ?? []).then(resolve),
    };
    return query;
  };
  const transaction = async (
    callback: (executor: unknown) => Promise<unknown>,
  ) => callback({ select, insert });
  return {
    database: { select, insert, transaction } as unknown as DatabaseClient,
    inserts,
  };
}

const request = {
  ownerUserId,
  projectId,
  sceneId,
  slot: "subject",
  body: {
    useCase: "conceptual-supporting-illustration",
    expectedSceneRevision: 3,
    idempotencyKey: "teacher-click-1",
  },
  correlationId,
};

describe("IllustrationGenerationService.request", () => {
  it("enforces the configured per-project hourly regeneration limit", async () => {
    const { database, inserts } = fakeDatabase(
      [
        [
          {
            id: "019ffbf1-eeee-7000-8000-000000000050",
            stableSceneId: sceneId,
            revision: 3,
            template: "hook",
          },
        ],
        [],
        [{ count: 2 }],
      ],
      [],
    );
    const service = new IllustrationGenerationService(
      database,
      () => new Date("2026-08-23T12:00:00.000Z"),
      2,
    );

    await expect(service.request(request)).rejects.toMatchObject({
      code: "rate_limited",
      statusCode: 429,
    });
    expect(inserts).toEqual([]);
  });

  it("returns the existing candidate and job for a repeated idempotency key", async () => {
    const { database, inserts } = fakeDatabase(
      [
        [
          {
            id: "019ffbf1-eeee-7000-8000-000000000050",
            stableSceneId: sceneId,
            revision: 3,
            template: "hook",
          },
        ],
        [{ id: candidateId }],
        [{ count: 10 }],
        [{ id: candidateId }],
        [{ id: jobId }],
      ],
      [[], []],
    );
    const service = new IllustrationGenerationService(
      database,
      () => new Date("2026-08-23T12:00:00.000Z"),
      1,
    );

    await expect(service.request(request)).resolves.toEqual({
      candidateId,
      jobId,
      status: "queued",
    });
    expect(inserts).toHaveLength(2);
  });

  it("rejects a single-slot request for a non-decorative slot with a typed 400", async () => {
    const { database, inserts } = fakeDatabase(
      [
        [
          {
            id: "019ffbf1-eeee-7000-8000-000000000050",
            stableSceneId: sceneId,
            revision: 3,
            template: "labelled-diagram",
          },
        ],
      ],
      [],
    );
    const service = new IllustrationGenerationService(database);

    await expect(
      service.request({ ...request, slot: "diagram" }),
    ).rejects.toMatchObject({
      code: "validation_failed",
      statusCode: 400,
      message: expect.stringContaining("grounding_critical"),
    });
    expect(inserts).toEqual([]);
  });

  it("queues one illustration per required slot that has no binding", async () => {
    // hook needs 1 slot, comparison needs 2, definition needs none.
    const sceneRows = [
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000101",
        revision: 3,
        order: 1,
        assetRequirements: [{ slot: "subject", purpose: "Anchor image." }],
        sceneJson: createDefaultStoryboardSceneSpec("hook", {
          id: "019ffbf1-eeee-7000-8000-000000000101" as Identifier,
          order: 1,
          durationSeconds: 20,
        }),
      },
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000102",
        revision: 1,
        order: 2,
        assetRequirements: [],
        sceneJson: createDefaultStoryboardSceneSpec("definition", {
          id: "019ffbf1-eeee-7000-8000-000000000102" as Identifier,
          order: 2,
          durationSeconds: 20,
        }),
      },
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000103",
        revision: 7,
        order: 3,
        assetRequirements: [
          { slot: "left-subject-image", purpose: "Left." },
          { slot: "right-subject-image", purpose: "Right." },
        ],
        sceneJson: createDefaultStoryboardSceneSpec("comparison", {
          id: "019ffbf1-eeee-7000-8000-000000000103" as Identifier,
          order: 3,
          durationSeconds: 20,
        }),
      },
    ];
    const { database } = fakeDatabase([sceneRows], []);
    const service = new IllustrationGenerationService(database);
    const request = vi
      .fn()
      .mockResolvedValue({ candidateId, jobId, status: "queued" });
    service.request = request as unknown as typeof service.request;

    const result = await service.generateMissing({
      ownerUserId,
      projectId,
      correlationId,
    });

    expect(result.totalMissing).toBe(3);
    expect(result.queued).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.rateLimited).toBe(false);
    // The scene's own current revision must be used, not a guess.
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      sceneId: "019ffbf1-eeee-7000-8000-000000000101",
      body: expect.objectContaining({ expectedSceneRevision: 3 }),
    });
    expect(
      request.mock.calls.map((call) => (call[0] as { slot: string }).slot),
    ).toEqual(["subject", "left-subject-image", "right-subject-image"]);
  });

  it("reports a partial run instead of failing when the hourly cap is hit", async () => {
    const sceneRows = [
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000104",
        revision: 1,
        order: 1,
        assetRequirements: [
          { slot: "left-subject-image", purpose: "Left." },
          { slot: "right-subject-image", purpose: "Right." },
        ],
        sceneJson: createDefaultStoryboardSceneSpec("comparison", {
          id: "019ffbf1-eeee-7000-8000-000000000104" as Identifier,
          order: 1,
          durationSeconds: 20,
        }),
      },
    ];
    const { database } = fakeDatabase([sceneRows], []);
    const service = new IllustrationGenerationService(database);
    const request = vi
      .fn()
      .mockResolvedValueOnce({ candidateId, jobId, status: "queued" })
      .mockRejectedValueOnce(
        new PublicError(
          "rate_limited",
          "This project has reached its illustration-generation limit.",
          429,
        ),
      );
    service.request = request as unknown as typeof service.request;

    const result = await service.generateMissing({
      ownerUserId,
      projectId,
      correlationId,
    });

    expect(result).toMatchObject({
      totalMissing: 2,
      queued: 1,
      skipped: 1,
      rateLimited: true,
    });
  });

  it("never queues generation for a grounding-critical diagram slot", async () => {
    // A labelled diagram's `diagram` slot carries the scene's factual visual.
    // Bulk generation must skip it and still report it as missing.
    const sceneRows = [
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000105",
        revision: 2,
        order: 1,
        assetRequirements: [{ slot: "subject", purpose: "Anchor image." }],
        sceneJson: createDefaultStoryboardSceneSpec("hook", {
          id: "019ffbf1-eeee-7000-8000-000000000105" as Identifier,
          order: 1,
          durationSeconds: 20,
        }),
      },
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000106",
        revision: 4,
        order: 2,
        assetRequirements: [{ slot: "diagram", purpose: "The diagram." }],
        sceneJson: createDefaultStoryboardSceneSpec("labelled-diagram", {
          id: "019ffbf1-eeee-7000-8000-000000000106" as Identifier,
          order: 2,
          durationSeconds: 20,
        }),
      },
    ];
    const { database } = fakeDatabase([sceneRows], []);
    const service = new IllustrationGenerationService(database);
    const request = vi
      .fn()
      .mockResolvedValue({ candidateId, jobId, status: "queued" });
    service.request = request as unknown as typeof service.request;

    const result = await service.generateMissing({
      ownerUserId,
      projectId,
      correlationId,
    });

    expect(result).toMatchObject({
      totalMissing: 2,
      queued: 1,
      skipped: 1,
      rateLimited: false,
    });
    expect(
      request.mock.calls.map((call) => (call[0] as { slot: string }).slot),
    ).toEqual(["subject"]);
  });

  it("skips a slot the template does not declare instead of aborting the run", async () => {
    // `request` rejects an undeclared slot with a 400. Reaching it would throw
    // out of the whole bulk run, losing the slots that follow.
    const sceneRows = [
      {
        stableSceneId: "019ffbf1-eeee-7000-8000-000000000107",
        revision: 1,
        order: 1,
        assetRequirements: [
          { slot: "not-a-real-slot", purpose: "Planner invented this." },
          { slot: "subject", purpose: "Anchor image." },
        ],
        sceneJson: createDefaultStoryboardSceneSpec("hook", {
          id: "019ffbf1-eeee-7000-8000-000000000107" as Identifier,
          order: 1,
          durationSeconds: 20,
        }),
      },
    ];
    const { database } = fakeDatabase([sceneRows], []);
    const service = new IllustrationGenerationService(database);
    const request = vi
      .fn()
      .mockResolvedValue({ candidateId, jobId, status: "queued" });
    service.request = request as unknown as typeof service.request;

    const result = await service.generateMissing({
      ownerUserId,
      projectId,
      correlationId,
    });

    expect(result).toMatchObject({
      totalMissing: 2,
      queued: 1,
      skipped: 1,
      rateLimited: false,
    });
    expect(
      request.mock.calls.map((call) => (call[0] as { slot: string }).slot),
    ).toEqual(["subject"]);
  });
});
