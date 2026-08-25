import type { DatabaseClient } from "@avlp/database";
import { describe, expect, it } from "vitest";
import { SceneAudioService, sceneAudioRequestAction } from "./scene-audio.js";

const ownerUserId = "01989a3d-8e00-7000-8000-000000000001";
const projectId = "01989a3d-8e00-7000-8000-000000000002";
const sceneA = "01989a3d-8e00-7000-8000-000000000003";
const sceneB = "01989a3d-8e00-7000-8000-000000000004";
const now = () => new Date("2026-08-24T10:00:00.000Z");

function databaseFor(
  rows: unknown[][],
  inserts: Array<Record<string, unknown>>,
  updates: Array<Record<string, unknown>>,
): DatabaseClient {
  const select = () => {
    const result = rows.shift() ?? [];
    const query = {
      from: () => query,
      where: () => query,
      limit: () => query,
      for: () => query,
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(result).then(onfulfilled, onrejected),
    };
    return query;
  };
  const database = {
    execute: async () => undefined,
    select,
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          updates.push(value);
          return { then: (resolve: (value: undefined) => unknown) => Promise.resolve(undefined).then(resolve) };
        },
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        inserts.push(value);
        return { returning: async () => [{ id: sceneA }] };
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(database),
  };
  return database as unknown as DatabaseClient;
}

function generationRows(
  stableSceneId: string,
  matchingAudio: unknown[] = [],
  recent: unknown[] = [],
  active: unknown[] = [],
): unknown[][] {
  return [
    [{ id: stableSceneId, stableSceneId, sceneJson: { narration: "Water enters through roots.", durationSeconds: 10 } }],
    [{ id: sceneA, voiceId: "voice-1", speakingRate: "1", version: 1 }],
    [],
    matchingAudio,
    [],
    recent,
    active,
    [{ status: "queued", jobId: sceneB, durationMs: null, fitWarning: null }],
  ];
}

describe("scene audio request lifecycle", () => {
  it("reuses compatible output and leaves another scene's status independent", () => {
    expect(sceneAudioRequestAction("ready")).toBe("reuse");
    expect(sceneAudioRequestAction("failed")).toBe("retry");
    expect(sceneAudioRequestAction("stale")).toBe("retry");
    expect(sceneAudioRequestAction("queued")).toBe("in_flight");
    expect(sceneAudioRequestAction(undefined)).toBe("create");
  });

  it("queues independent scene requests with a durable status record and audit event", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const service = new SceneAudioService(databaseFor(generationRows(sceneA), inserts, updates), now);

    await expect(
      service.generate({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: { idempotencyKey: "scene-a-request" },
        correlationId: sceneB,
      }),
    ).resolves.toMatchObject({ sceneId: sceneA, status: "queued" });
    expect(inserts).toContainEqual(expect.objectContaining({ sceneId: sceneA, status: "queued" }));
    expect(inserts).toContainEqual(expect.objectContaining({ jobType: "tts.generate" }));
    expect(inserts).toContainEqual(expect.objectContaining({ eventType: "audio.generation_requested" }));
    expect(updates).toEqual([]);
  });

  it("requeues only the failed scene rather than reusing its failed audio", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const updates: Array<Record<string, unknown>> = [];
    const failedAudio = {
      id: sceneB,
      status: "failed",
      jobId: sceneA,
      durationMs: null,
      fitWarning: null,
    };
    const service = new SceneAudioService(
      databaseFor(generationRows(sceneB, [failedAudio]), inserts, updates),
      now,
    );

    await expect(
      service.generate({
        ownerUserId,
        projectId,
        sceneId: sceneB,
        body: { idempotencyKey: "scene-b-retry" },
        correlationId: sceneA,
      }),
    ).resolves.toMatchObject({ sceneId: sceneB, status: "queued" });
    expect(updates).toContainEqual(expect.objectContaining({ status: "queued", failureCode: null }));
    expect(inserts).toContainEqual(expect.objectContaining({ jobType: "tts.generate" }));
  });

  it("enforces project-scoped generation and in-flight job limits before enqueueing", async () => {
    const rowsAtQuota = Array.from({ length: 30 }, (_, index) => ({ id: `job-${index}` }));
    const rateLimitedService = new SceneAudioService(
      databaseFor(generationRows(sceneA, [], rowsAtQuota), [], []),
      now,
    );
    await expect(
      rateLimitedService.generate({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: { idempotencyKey: "rate-limited-request" },
        correlationId: sceneB,
      }),
    ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 });

    const activeJobs = Array.from({ length: 5 }, (_, index) => ({ id: `active-${index}` }));
    const concurrencyLimitedService = new SceneAudioService(
      databaseFor(generationRows(sceneA, [], [], activeJobs), [], []),
      now,
    );
    await expect(
      concurrencyLimitedService.generate({
        ownerUserId,
        projectId,
        sceneId: sceneA,
        body: { idempotencyKey: "concurrency-request" },
        correlationId: sceneB,
      }),
    ).rejects.toMatchObject({ code: "rate_limited", statusCode: 429 });
  });
});
