import { createHash } from "node:crypto";
import type { DatabaseClient } from "@avlp/database";
import type { JobMetadata } from "@avlp/jobs";
import { ProviderCallError } from "@avlp/provider-adapters";
import { narrationWordCountRange } from "@avlp/schemas";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneAudioGenerationJobHandler,
  isCurrentAudioCompletion,
  synthesizeFixtureAudio,
} from "./scene-audio-job.js";

const ownerUserId = "01989a3d-8e00-7000-8000-000000000001";
const projectId = "01989a3d-8e00-7000-8000-000000000002";
const sceneId = "01989a3d-8e00-7000-8000-000000000003";
const audioId = "01989a3d-8e00-7000-8000-000000000004";
const now = () => new Date("2026-08-24T10:00:00.000Z");

async function execute(
  handler: ReturnType<typeof createSceneAudioGenerationJobHandler>,
): Promise<JobMetadata> {
  return (
    handler as unknown as {
      handler: (payload: unknown, context: unknown) => Promise<JobMetadata>;
    }
  ).handler(
    {
      schemaVersion: 1,
      sceneAudioId: audioId,
      narrationHash: hash("Water enters through roots."),
      voiceConfigurationHash: voiceHash,
      provider: { providerId: "fixture-v1", outputFormat: "wav" },
    },
    {
      attempt: 1,
      correlationId: "01989a3d-8e00-7000-8000-000000000005",
      idempotencyKey: "tts:test",
      jobId: "01989a3d-8e00-7000-8000-000000000006",
      ownerUserId,
      projectId,
    },
  );
}

const hash = (value: unknown) =>
  // This mirrors the versioned content hash used at the worker boundary.
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const voiceHash = hash({
  voiceId: "voice-1",
  speakingRate: "1",
  overrides: [],
});

function databaseFor(
  rows: unknown[][],
  updates: Array<Record<string, unknown>>,
  inserts: Array<Record<string, unknown>>,
): DatabaseClient {
  const select = () => {
    const result = rows.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: () => query,
      orderBy: () => query,
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?:
          ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(result).then(onfulfilled, onrejected),
    };
    return query;
  };
  const database = {
    select,
    update: () => ({
      set: (value: Record<string, unknown>) => ({
        where: () => {
          updates.push(value);
          const result = [{ id: audioId }];
          return {
            returning: async () => result,
            then: <TResult1 = unknown, TResult2 = never>(
              onfulfilled?:
                | ((item: typeof result) => TResult1 | PromiseLike<TResult1>)
                | null,
              onrejected?:
                ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ) => Promise.resolve(result).then(onfulfilled, onrejected),
          };
        },
      }),
    }),
    insert: () => ({
      values: (
        value: Record<string, unknown> | Array<Record<string, unknown>>,
      ) => {
        inserts.push(...(Array.isArray(value) ? value : [value]));
        return { onConflictDoNothing: async () => undefined };
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(database),
  };
  return database as unknown as DatabaseClient;
}

describe("fixture TTS adapter", () => {
  it("produces a valid WAV header and duration metadata", () => {
    const output = synthesizeFixtureAudio("Water enters through roots.", 1);
    expect(new TextDecoder().decode(output.bytes.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(output.bytes.slice(8, 12))).toBe("WAVE");
    expect(output.durationMs).toBeGreaterThanOrEqual(500);
  });
  it("applies rate deterministically to the generated duration", () => {
    const text =
      "One two three four five six seven eight nine ten eleven twelve.";
    expect(synthesizeFixtureAudio(text, 1.25).durationMs).toBeLessThan(
      synthesizeFixtureAudio(text, 0.75).durationMs,
    );
  });
  it("synthesizes on-budget narration to fit its planned scene duration", () => {
    // The audio-fit rule in lesson validation allows 1.5s of drift, so the
    // fixture must realize the same duration model the word budget assumes;
    // otherwise every scene of every project fails preflight.
    for (const plannedSeconds of [15, 30, 45, 60]) {
      const words = narrationWordCountRange(plannedSeconds).target;
      const text = Array.from({ length: words }, () => "word").join(" ");
      const output = synthesizeFixtureAudio(text, 1);
      expect(
        Math.abs(output.durationMs - plannedSeconds * 1_000),
      ).toBeLessThanOrEqual(1_500);
    }
  });
  it("provides monotonic sentence timing that covers the full generated audio", () => {
    const output = synthesizeFixtureAudio(
      "Water enters roots. It then reaches leaves!",
      1,
    );
    expect(output.timing).toHaveLength(2);
    expect(output.timing[0]).toMatchObject({
      startMs: 0,
      text: "Water enters roots.",
    });
    expect(output.timing[0]!.endMs).toBe(output.timing[1]!.startMs);
    expect(output.timing[1]!.endMs).toBe(output.durationMs);
  });
});

describe("TTS stale completion guard", () => {
  it("rejects a completion if either narration or voice hash changed after queueing", () => {
    const current = {
      storedNarrationHash: "a".repeat(64),
      storedVoiceConfigurationHash: "b".repeat(64),
      payloadNarrationHash: "a".repeat(64),
      payloadVoiceConfigurationHash: "b".repeat(64),
    };
    expect(isCurrentAudioCompletion(current)).toBe(true);
    expect(
      isCurrentAudioCompletion({
        ...current,
        payloadNarrationHash: "c".repeat(64),
      }),
    ).toBe(false);
    expect(
      isCurrentAudioCompletion({
        ...current,
        payloadVoiceConfigurationHash: "c".repeat(64),
      }),
    ).toBe(false);
  });
});

describe("scene audio generation job", () => {
  const queuedAudio = {
    id: audioId,
    status: "queued",
    sceneId,
    contentHash: "a".repeat(64),
    plannedDurationMs: 500,
  };
  const voice = { id: sceneId, voiceId: "voice-1", speakingRate: "1" };
  const scene = {
    id: sceneId,
    sceneJson: { narration: "Water enters through roots." },
  };

  it("persists a ready per-scene audio artifact and records metered usage", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const putBytes = vi
      .fn()
      .mockResolvedValue({ checksumSha256: "a".repeat(64) });
    const synthesize = vi.fn(
      ({
        narration,
        speakingRate,
      }: {
        narration: string;
        speakingRate: number;
      }) => synthesizeFixtureAudio(narration, speakingRate),
    );
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [
          [queuedAudio],
          [scene],
          [voice],
          [],
          [{ id: sceneId }],
          [{ status: "ready" }],
          [{ id: "01989a3d-8e00-7000-8000-000000000010" }],
          [{ id: sceneId }],
          [
            {
              id: audioId,
              sceneId,
              status: "ready",
              updatedAt: now(),
            },
          ],
          [{ sceneAudioId: audioId }],
        ],
        updates,
        inserts,
      ),
      storage: { putBytes },
      provider: {
        providerId: "fixture-v1",
        outputFormat: "wav",
        contentType: "audio/wav",
        synthesize,
      },
      now,
    });

    await expect(execute(handler)).resolves.toMatchObject({ status: "ready" });
    expect(synthesize).toHaveBeenCalledWith({
      narration: "Water enters through roots.",
      speakingRate: "1",
      voiceId: "voice-1",
      pronunciationOverrides: [],
    });
    expect(putBytes).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "audio/wav" }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "generating" }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "ready", contentType: "audio/wav" }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ stage: "ready_for_validation" }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        operationType: "tts.generation",
        status: "succeeded",
      }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        sceneAudioId: audioId,
        status: "ready",
        language: "en",
      }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        trackId: sceneId,
        startMs: 0,
        text: "Water enters through roots.",
      }),
    );
  });

  it("uses the forced-alignment boundary when a provider omits timestamps", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const align = vi.fn(() => [
      { startMs: 0, endMs: 1_000, text: "Water enters through roots." },
    ]);
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [
          [queuedAudio],
          [scene],
          [voice],
          [],
          [{ id: sceneId }],
          [{ status: "ready" }],
          [],
          [],
        ],
        updates,
        inserts,
      ),
      storage: {
        putBytes: vi.fn().mockResolvedValue({ checksumSha256: "a".repeat(64) }),
      },
      provider: {
        providerId: "fixture-v1",
        outputFormat: "wav",
        contentType: "audio/wav",
        synthesize: () => ({
          ...synthesizeFixtureAudio("Water enters through roots.", 1),
          timing: [],
        }),
      },
      alignmentProvider: { align },
      now,
    });
    await expect(execute(handler)).resolves.toMatchObject({ status: "ready" });
    expect(align).toHaveBeenCalledWith(
      expect.objectContaining({ narration: "Water enters through roots." }),
    );
  });

  it("marks a provider or storage failure retryable and meters the failed attempt", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [[queuedAudio], [scene], [voice], []],
        updates,
        inserts,
      ),
      storage: {
        putBytes: vi.fn().mockRejectedValue(new Error("storage unavailable")),
      },
      now,
    });

    await expect(execute(handler)).rejects.toMatchObject({
      code: "TTS_GENERATION_FAILED",
      classification: "retryable",
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "failed",
        failureCode: "TTS_GENERATION_FAILED",
      }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        operationType: "tts.generation",
        status: "failed",
        retryCount: 0,
      }),
    );
  });

  it("preserves a provider failure classification instead of losing it behind a generic TTS error", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [[queuedAudio], [scene], [voice], []],
        updates,
        inserts,
      ),
      storage: { putBytes: vi.fn() },
      provider: {
        providerId: "fixture-v1",
        outputFormat: "wav",
        contentType: "audio/wav",
        synthesize: () => {
          throw new ProviderCallError({
            code: "PROVIDER_REQUEST_REJECTED",
            message: "native payload intentionally omitted",
          });
        },
      },
      now,
    });

    await expect(execute(handler)).rejects.toMatchObject({
      code: "PROVIDER_REQUEST_REJECTED",
      classification: "terminal",
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "failed",
        failureCode: "PROVIDER_REQUEST_REJECTED",
      }),
    );
  });

  it("repairs captions from persisted timing when audio was committed by an older interrupted job", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const readyAudio = {
      ...queuedAudio,
      status: "ready",
      durationMs: 1_000,
      narrationHash: hash("Water enters through roots."),
      timing: [
        {
          startMs: 0,
          endMs: 1_000,
          text: "Water enters through roots.",
        },
      ],
    };
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [[readyAudio], [], [{ id: sceneId }], [], []],
        updates,
        inserts,
      ),
      storage: { putBytes: vi.fn() },
      now,
    });

    await expect(execute(handler)).resolves.toMatchObject({
      status: "ready",
      reused: true,
      captionsRepaired: true,
    });
    expect(inserts).toContainEqual(
      expect.objectContaining({
        sceneAudioId: audioId,
        status: "ready",
      }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({
        trackId: sceneId,
        text: "Water enters through roots.",
      }),
    );
  });

  it("repairs queued legacy audio without calling the paid provider again", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const synthesize = vi.fn();
    const recoverableAudio = {
      ...queuedAudio,
      storageKey: "users/u/projects/p/scenes/s/audio/hash.wav",
      durationMs: 1_000,
      narrationHash: hash("Water enters through roots."),
      voiceConfigurationHash: voiceHash,
      timing: [
        {
          startMs: 0,
          endMs: 1_000,
          text: "Water enters through roots.",
        },
      ],
    };
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [
          [recoverableAudio],
          [scene],
          [voice],
          [],
          [{ id: sceneId }],
          [{ id: sceneId }],
          [{ id: sceneId }],
          [{ id: audioId, sceneId, status: "ready", updatedAt: now() }],
          [{ sceneAudioId: audioId }],
        ],
        updates,
        inserts,
      ),
      storage: { putBytes: vi.fn() },
      provider: {
        providerId: "fixture-v1",
        outputFormat: "wav",
        contentType: "audio/wav",
        synthesize,
      },
      now,
    });

    await expect(execute(handler)).resolves.toMatchObject({
      status: "ready",
      reused: true,
      captionsRepaired: true,
    });
    expect(synthesize).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "ready", failureCode: null }),
    );
    expect(inserts).toContainEqual(
      expect.objectContaining({ trackId: sceneId }),
    );
  });

  it("marks an outdated per-scene request stale without synthesizing or overwriting it", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const putBytes = vi.fn();
    const handler = createSceneAudioGenerationJobHandler({
      database: databaseFor(
        [
          [queuedAudio],
          [{ ...scene, sceneJson: { narration: "Changed narration." } }],
          [voice],
          [],
        ],
        updates,
        inserts,
      ),
      storage: { putBytes },
      now,
    });

    await expect(execute(handler)).resolves.toEqual({ status: "stale" });
    expect(putBytes).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "stale" }),
    );
    expect(inserts).toEqual([]);
  });
});
