import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { DatabaseClient } from "@avlp/database";
import { createId } from "@avlp/config";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import {
  PostgresRenderService,
  renderEnvelopePayloadSchema,
  renderIdempotencyKey,
} from "./renders.js";

function databaseForRenderCommand(input: {
  rows: unknown[][];
  writes: Array<Record<string, unknown>>;
}): DatabaseClient {
  const select = () => {
    const result = input.rows.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      leftJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      for: () => query,
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
    execute: async () => undefined,
    select,
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        input.writes.push(value);
        const operation = {
          returning: async () => [{ id: value.id }],
          then: <TResult1 = unknown, TResult2 = never>(
            onfulfilled?:
              ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?:
              ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ) => Promise.resolve([]).then(onfulfilled, onrejected),
        };
        return operation;
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(database),
  };
  return database as unknown as DatabaseClient;
}

describe("render API authorization and explicit commands", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("hides render history from another tenant and passes the owner correlation context", async () => {
    const fixture = createCrossUserProjectFixture();
    const start = vi
      .fn()
      .mockResolvedValue({ id: fixture.projectId, status: "queued" });
    const list = vi.fn().mockResolvedValue({ renders: [] });
    const detail = vi.fn();
    const retry = vi.fn();
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("not used");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "owner"
          ? {
              id: fixture.ownerUserId,
              email: "owner@example.test",
              displayName: "Owner",
            }
          : token === "other"
            ? {
                id: fixture.otherUserId,
                email: "other@example.test",
                displayName: "Other",
              }
            : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    app = await createApp({
      authGateway: auth,
      trustedOrigin: "https://app.example.test",
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      renderService: { start, list, detail, retry },
    });
    const server = app.getHttpAdapter().getInstance();
    const foreign = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/renders`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(foreign.statusCode).toBe(404);
    expect(list).not.toHaveBeenCalled();
    const owner = await server.inject({
      method: "POST",
      url: `/projects/${fixture.projectId}/renders`,
      cookies: { [sessionCookieName]: "owner" },
      headers: { origin: "https://app.example.test" },
      payload: { lessonVersionId: fixture.projectId },
    });
    expect(owner.statusCode).toBe(202);
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        body: { lessonVersionId: fixture.projectId },
      }),
    );
  });

  it("blocks rendering before a current exact validation exists", async () => {
    const fixture = createCrossUserProjectFixture();
    const database = {
      transaction: vi.fn(),
    } as unknown as DatabaseClient;
    const service = new PostgresRenderService(database, {
      latest: async () => null,
    });

    await expect(
      service.start({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        correlationId: fixture.ownerUserId,
        body: { lessonVersionId: fixture.projectId },
      }),
    ).rejects.toMatchObject({ code: "bad_request", statusCode: 409 });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("uses one server-owned idempotency key for duplicate request tokens", () => {
    const fixture = createCrossUserProjectFixture();
    const first = renderIdempotencyKey({
      projectId: fixture.projectId,
      lessonVersionContentHash: "a".repeat(64),
    });
    const second = renderIdempotencyKey({
      projectId: fixture.projectId,
      lessonVersionContentHash: "a".repeat(64),
    });
    expect(second).toBe(first);
  });

  it("accepts the durable production payload shape and rejects envelope-only fields", () => {
    const fixture = createCrossUserProjectFixture();
    const payload = {
      assetManifest: { assets: [], schemaVersion: 1 },
      compositionSha256: "a".repeat(64),
      lessonVersionId: fixture.projectId,
      lessonSpecSha256: "b".repeat(64),
      manifest: {},
      optionsHash: "c".repeat(64),
      profile: {},
      rendererVersion: "st-024-remotion-4.0.507-scene-library-v1",
    };
    expect(renderEnvelopePayloadSchema.parse(payload)).toEqual(payload);
    expect(
      renderEnvelopePayloadSchema.safeParse({ ...payload, schemaVersion: 1 })
        .success,
    ).toBe(false);
  });

  it("creates one durable render job with a payload accepted by the worker envelope", async () => {
    const fixture = createCrossUserProjectFixture();
    const now = new Date("2026-08-25T08:00:00.000Z");
    const lessonSpecId = createId(now);
    const sceneId = createId(new Date("2026-08-25T08:00:01.000Z"));
    const sourceDocumentId = createId(new Date("2026-08-25T08:00:02.000Z"));
    const blockId = createId(new Date("2026-08-25T08:00:03.000Z"));
    const versionId = createId(new Date("2026-08-25T08:00:04.000Z"));
    const validationId = createId(new Date("2026-08-25T08:00:05.000Z"));
    const audioId = createId(new Date("2026-08-25T08:00:06.000Z"));
    const trackId = createId(new Date("2026-08-25T08:00:07.000Z"));
    const renderId = createId(new Date("2026-08-25T08:00:08.000Z"));
    const correlationId = createId(new Date("2026-08-25T08:00:09.000Z"));
    const lesson = {
      schemaVersion: "1.8",
      lessonId: lessonSpecId,
      projectId: fixture.projectId,
      title: "States of matter",
      subject: "Science",
      audience: {
        ageBand: "11-13",
        difficulty: "introductory",
        priorKnowledge: [],
      },
      targetDurationSeconds: 180,
      tone: "friendly",
      themeId: "mvp-default",
      objectiveIds: [blockId],
      voice: { providerVoiceId: "mvp-default", speakingRate: 1 },
      scenes: [
        {
          id: sceneId,
          order: 1,
          narration: "Water changes state.",
          durationSeconds: 180,
          onScreenText: ["States"],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [
            {
              documentId: sourceDocumentId,
              parsedDocumentVersion: 1,
              pageStart: 1,
              blockIds: [blockId],
            },
          ],
          generatedAdditions: [],
          template: "definition",
          visual: { term: "State", definition: "A form of matter." },
        },
      ],
    };
    const writes: Array<Record<string, unknown>> = [];
    const database = databaseForRenderCommand({
      writes,
      rows: [
        [
          {
            id: versionId,
            contentHash: "a".repeat(64),
            lessonSpecId,
            lessonSpecRevision: 1,
            sceneLibraryVersion: "mvp-v1",
            snapshot: { lessonSpec: lesson },
          },
        ],
        [{ id: validationId, inputHash: "b".repeat(64) }],
        [],
        [
          {
            stableSceneId: sceneId,
            audio: {
              id: audioId,
              storageKey: `users/${fixture.ownerUserId}/projects/${fixture.projectId}/audio/${sceneId}/a.mp3`,
              checksumSha256: "c".repeat(64),
              contentType: "audio/mpeg",
              updatedAt: now,
            },
          },
        ],
        [{ audioId, track: { id: trackId, updatedAt: now } }],
        [{ startMs: 0, endMs: 30_000, text: "Water changes state." }],
        [],
        [],
        [],
        [
          {
            render: {
              id: renderId,
              lessonVersionId: versionId,
              validationRunId: validationId,
              createdAt: now,
              errorCode: null,
            },
            job: {
              state: "queued",
              progress: 0,
              attempts: 0,
              errorMetadata: null,
              errorClassification: null,
              correlationId,
              startedAt: null,
              completedAt: null,
            },
            video: null,
            thumbnail: null,
          },
        ],
      ],
    });
    const service = new PostgresRenderService(
      database,
      undefined,
      undefined,
      () => now,
    );

    await expect(
      service.start({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        correlationId,
        body: { lessonVersionId: versionId },
      }),
    ).resolves.toMatchObject({ id: renderId, status: "queued" });
    const jobWrite = writes.find((value) => value.jobType === "lesson.render");
    expect(jobWrite).toBeDefined();
    expect(
      renderEnvelopePayloadSchema.safeParse(jobWrite?.payload).success,
    ).toBe(true);
  });
  it("renders exactly the reconciled durations the lesson version snapshotted", async () => {
    // Reconciled scenes hold odd, audio-derived lengths that no allocator would
    // have produced. A render must reproduce the timing preflight approved, so
    // every frame boundary has to come from the snapshot and nowhere else.
    const fixture = createCrossUserProjectFixture();
    const now = new Date("2026-08-25T08:00:00.000Z");
    const lessonSpecId = createId(now);
    const sceneA = createId(new Date("2026-08-25T08:00:01.000Z"));
    const sceneB = createId(new Date("2026-08-25T08:00:02.000Z"));
    const sourceDocumentId = createId(new Date("2026-08-25T08:00:03.000Z"));
    const blockId = createId(new Date("2026-08-25T08:00:04.000Z"));
    const versionId = createId(new Date("2026-08-25T08:00:05.000Z"));
    const validationId = createId(new Date("2026-08-25T08:00:06.000Z"));
    const audioA = createId(new Date("2026-08-25T08:00:07.000Z"));
    const audioB = createId(new Date("2026-08-25T08:00:08.000Z"));
    const trackA = createId(new Date("2026-08-25T08:00:09.000Z"));
    const trackB = createId(new Date("2026-08-25T08:00:10.000Z"));
    const renderId = createId(new Date("2026-08-25T08:00:11.000Z"));
    const correlationId = createId(new Date("2026-08-25T08:00:12.000Z"));
    const reconciledDurations = [33, 28] as const;
    const scene = (id: string, order: number, durationSeconds: number) => ({
      id,
      order,
      narration: "Water changes state.",
      durationSeconds,
      onScreenText: ["States"],
      transition: "cut",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: sourceDocumentId,
          parsedDocumentVersion: 1,
          pageStart: 1,
          blockIds: [blockId],
        },
      ],
      generatedAdditions: [],
      template: "definition",
      visual: { term: "State", definition: "A form of matter." },
    });
    const lesson = {
      schemaVersion: "1.8",
      lessonId: lessonSpecId,
      projectId: fixture.projectId,
      title: "States of matter",
      subject: "Science",
      audience: {
        ageBand: "11-13",
        difficulty: "introductory",
        priorKnowledge: [],
      },
      targetDurationSeconds: 180,
      tone: "friendly",
      themeId: "mvp-default",
      objectiveIds: [blockId],
      voice: { providerVoiceId: "mvp-default", speakingRate: 1 },
      scenes: [
        scene(sceneA, 1, reconciledDurations[0]),
        scene(sceneB, 2, reconciledDurations[1]),
      ],
    };
    const audioRow = (id: string, stableSceneId: string) => ({
      stableSceneId,
      audio: {
        id,
        storageKey: `users/${fixture.ownerUserId}/projects/${fixture.projectId}/audio/${stableSceneId}/a.mp3`,
        checksumSha256: "c".repeat(64),
        contentType: "audio/mpeg",
        updatedAt: now,
      },
    });
    const writes: Array<Record<string, unknown>> = [];
    const database = databaseForRenderCommand({
      writes,
      rows: [
        [
          {
            id: versionId,
            contentHash: "a".repeat(64),
            lessonSpecId,
            lessonSpecRevision: 1,
            sceneLibraryVersion: "mvp-v1",
            snapshot: { lessonSpec: lesson },
          },
        ],
        [{ id: validationId, inputHash: "b".repeat(64) }],
        [],
        [audioRow(audioA, sceneA), audioRow(audioB, sceneB)],
        [
          { audioId: audioA, track: { id: trackA, updatedAt: now } },
          { audioId: audioB, track: { id: trackB, updatedAt: now } },
        ],
        [{ startMs: 0, endMs: 32_800, text: "Water changes state." }],
        [{ startMs: 0, endMs: 27_600, text: "Water changes state." }],
        [],
        [],
        [],
        [
          {
            render: {
              id: renderId,
              lessonVersionId: versionId,
              validationRunId: validationId,
              createdAt: now,
              errorCode: null,
            },
            job: {
              state: "queued",
              progress: 0,
              attempts: 0,
              errorMetadata: null,
              errorClassification: null,
              correlationId,
              startedAt: null,
              completedAt: null,
            },
            video: null,
            thumbnail: null,
          },
        ],
      ],
    });
    const service = new PostgresRenderService(
      database,
      undefined,
      undefined,
      () => now,
    );

    await service.start({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      correlationId,
      body: { lessonVersionId: versionId },
    });
    const jobWrite = writes.find((value) => value.jobType === "lesson.render");
    const payload = (jobWrite as { payload: unknown }).payload as {
      manifest: {
        captions: { sceneId: string; startFrame: number }[];
        snapshot: { lessonSpec: { scenes: { durationSeconds: number }[] } };
      };
    };
    expect(
      payload.manifest.snapshot.lessonSpec.scenes.map(
        (item) => item.durationSeconds,
      ),
    ).toEqual([...reconciledDurations]);
    // The second scene starts where the first scene's snapshotted duration
    // ends, not where its 32.8s of audio does.
    const secondSceneCue = payload.manifest.captions.find(
      (cue) => cue.sceneId === sceneB,
    );
    expect(secondSceneCue?.startFrame).toBe(reconciledDurations[0] * 30);
  });
});
