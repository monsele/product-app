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

/** Chainable fake that resolves a queued result array per awaited statement. */
function contactSheetDatabase(results: unknown[][]): DatabaseClient {
  let index = 0;
  const makeQuery = () => {
    const query: Record<string, unknown> = {};
    for (const method of [
      "from",
      "where",
      "orderBy",
      "leftJoin",
      "innerJoin",
      "limit",
      "groupBy",
    ])
      query[method] = () => query;
    query.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(results[index++] ?? []).then(resolve);
    return query;
  };
  return { select: () => makeQuery() } as unknown as DatabaseClient;
}

describe("IllustrationGenerationService.contactSheet", () => {
  const sceneRowId = "019ffbf1-eeee-7000-8000-0000000000d0";
  const stableSceneId = "019ffbf1-eeee-7000-8000-0000000000d1" as Identifier;

  const sceneRows = [
    {
      id: sceneRowId,
      stableSceneId,
      order: 1,
      revision: 4,
      sceneJson: createDefaultStoryboardSceneSpec("hook", {
        id: stableSceneId,
        order: 1,
        durationSeconds: 20,
      }),
    },
  ];

  function candidateRow(
    overrides: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      id: "019ffbf1-eeee-7000-8000-0000000000e0",
      sceneId: sceneRowId,
      slot: "subject",
      assetId: null,
      status: "pending_review",
      moderationStatus: "approved",
      provider: "mock-illustration",
      promptVersion: "v1",
      failureCode: null,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      jobId: null,
      assetStatus: null,
      assetWidth: null,
      assetHeight: null,
      assetMediaType: null,
      assetDeletedAt: null,
      estimatedCostUsd: "0.020000",
      ...overrides,
    };
  }

  it("groups candidates by scene and slot with the slot's role guidance", async () => {
    const database = contactSheetDatabase([
      sceneRows,
      [
        candidateRow({
          id: "cand-ready",
          assetId: "asset-1",
          assetStatus: "pending_review",
          assetWidth: 1024,
          assetHeight: 576,
          assetMediaType: "image/png",
        }),
        candidateRow({
          id: "cand-failed",
          status: "failed",
          moderationStatus: "rejected",
          failureCode: "ILLUSTRATION_GENERATION_FAILED",
          estimatedCostUsd: null,
        }),
        candidateRow({ id: "cand-orphan", sceneId: "no-such-scene" }),
      ],
    ]);
    const service = new IllustrationGenerationService(database);

    const result = await service.contactSheet({ ownerUserId, projectId });

    expect(result.scenes).toHaveLength(1);
    const scene = result.scenes[0]!;
    expect(scene.sceneId).toBe(stableSceneId);
    expect(scene.sceneRevision).toBe(4);
    expect(scene.slots).toHaveLength(1);
    const slot = scene.slots[0]!;
    expect(slot.slot).toBe("subject");
    expect(slot.visualRole).toBe("decorative");
    expect(slot.visualRolePermits).toContain("free editorial choice");
    expect(slot.candidates.map((candidate) => candidate.id)).toEqual([
      "cand-ready",
      "cand-failed",
    ]);
  });

  it("marks a reviewable, well-formed candidate selectable and a failed one blocked", async () => {
    const database = contactSheetDatabase([
      sceneRows,
      [
        candidateRow({
          id: "cand-ready",
          assetId: "asset-1",
          assetStatus: "active",
          assetWidth: 1024,
          assetHeight: 576,
          assetMediaType: "image/png",
        }),
        candidateRow({
          id: "cand-failed",
          status: "failed",
          moderationStatus: "rejected",
          failureCode: "ILLUSTRATION_GENERATION_FAILED",
        }),
        candidateRow({
          id: "cand-corrupt",
          assetId: "asset-2",
          assetStatus: "pending_review",
          assetWidth: 0,
          assetHeight: 0,
          assetMediaType: "image/png",
        }),
        candidateRow({
          id: "cand-moderating",
          moderationStatus: "pending",
          assetId: "asset-3",
          assetStatus: "pending_review",
          assetWidth: 1024,
          assetHeight: 576,
          assetMediaType: "image/png",
        }),
      ],
    ]);
    const service = new IllustrationGenerationService(database);

    const [ready, failed, corrupt, moderating] = (
      await service.contactSheet({ ownerUserId, projectId })
    ).scenes[0]!.slots[0]!.candidates;

    expect(ready).toMatchObject({ selectable: true, blockedReason: null });
    expect(ready?.costUsd).toBe(0.02);
    expect(failed).toMatchObject({
      selectable: false,
      blockedReason: "generation_failed",
    });
    expect(corrupt).toMatchObject({
      selectable: false,
      blockedReason: "media_check_failed",
    });
    // Moderation still running is a transient wait, not an integrity failure.
    expect(moderating).toMatchObject({
      selectable: false,
      blockedReason: "not_reviewable",
    });
  });
});
