import { describe, expect, it } from "vitest";
import { type Identifier } from "@avlp/config";
import { type DatabaseClient } from "@avlp/database";
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
});
