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
  updates?: Array<Record<string, unknown>>;
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
    update: () => ({
      set: (value: Record<string, unknown>) => {
        input.updates?.push(value);
        return { where: () => Promise.resolve([]) };
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

  it("ST-103: rejects another tenant's request for a render's review detail", async () => {
    const fixture = createCrossUserProjectFixture();
    const detail = vi.fn().mockResolvedValue({ id: fixture.projectId });
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("not used");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "other"
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
      renderService: {
        start: vi.fn(),
        list: vi.fn(),
        detail,
        retry: vi.fn(),
      },
    });
    const foreign = await app.getHttpAdapter().getInstance().inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/renders/${createId()}`,
      cookies: { [sessionCookieName]: "other" },
    });
    expect(foreign.statusCode).toBe(404);
    expect(detail).not.toHaveBeenCalled();
  }, 30_000);

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
      rendererVersion: "st-096-remotion-4.0.507-scene-library-v1",
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
        [], // existing (idempotency key) render lookup
        [], // existing (manifest hash) render lookup
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

  it("supersedes a terminally failed render instead of colliding on its manifest hash", async () => {
    // Regression test: `render_jobs_tenant_manifest_unique` is keyed on
    // (owner, project, manifestHash), which doesn't include `rendererVersion`.
    // A prior attempt for identical content that failed terminally (e.g. the
    // renderer was upgraded mid-flight) must not permanently block every
    // future request for that same content — this reused to surface as an
    // unhandled 23505 and a generic 500 to the caller.
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
    const staleRenderId = createId(new Date("2026-08-25T08:00:08.000Z"));
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
    const updates: Array<Record<string, unknown>> = [];
    const database = databaseForRenderCommand({
      writes,
      updates,
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
        [], // existing (idempotency key) render lookup: no match
        [
          // existing (manifest hash) render lookup: a dead attempt for the
          // same content, left behind by a renderer upgrade
          {
            render: { id: staleRenderId },
            job: { state: "failed" },
          },
        ],
        [],
        [],
        [
          {
            render: {
              id: staleRenderId,
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
    ).resolves.toMatchObject({ id: staleRenderId, status: "queued" });

    // No second render_jobs row was inserted for the same manifest hash —
    // the existing row was updated in place instead.
    expect(writes.some((value) => "manifestHash" in value)).toBe(false);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      manifestHash: expect.any(String),
      status: "queued",
      errorCode: null,
    });
    const jobWrite = writes.find((value) => value.jobType === "lesson.render");
    expect(jobWrite).toBeDefined();
    expect(updates[0]?.jobId).toBe(jobWrite?.id);
  });

  it("includes a bound source_table visual in the render manifest with no media fetch", async () => {
    const fixture = createCrossUserProjectFixture();
    const now = new Date("2026-08-25T08:00:00.000Z");
    const lessonSpecId = createId(now);
    const sceneId = createId(new Date("2026-08-25T08:00:01.000Z"));
    const tableAssetId = createId(new Date("2026-08-25T08:00:02.000Z"));
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
      title: "Group 1 elements",
      subject: "Chemistry",
      audience: {
        ageBand: "11-13",
        difficulty: "introductory",
        priorKnowledge: [],
      },
      targetDurationSeconds: 180,
      tone: "friendly",
      themeId: "mvp-default",
      objectiveIds: [sceneId],
      voice: { providerVoiceId: "mvp-default", speakingRate: 1 },
      scenes: [
        {
          id: sceneId,
          order: 1,
          narration: "Alkali metals share one outer electron.",
          durationSeconds: 180,
          onScreenText: [],
          transition: "cut",
          assetBindings: [
            { assetId: tableAssetId, role: "diagram", slot: "diagram" },
          ],
          sourceRefs: [
            {
              documentId: createId(new Date("2026-08-25T08:00:03.000Z")),
              parsedDocumentVersion: 1,
              pageStart: 3,
              blockIds: [sceneId],
            },
          ],
          generatedAdditions: [],
          template: "labelled-diagram",
          visual: {
            baseAssetSlot: "diagram",
            kind: "asset",
            labels: [{ anchor: "top", id: "note", text: "Alkali metals" }],
          },
        },
      ],
    };
    const writes: Array<Record<string, unknown>> = [];
    const latestApprovedVisuals = vi.fn().mockResolvedValue({
      snapshotId: createId(new Date("2026-08-25T08:00:10.000Z")),
      parsedDocumentId: createId(new Date("2026-08-25T08:00:11.000Z")),
      figures: [],
      tables: [
        {
          tableId: tableAssetId,
          sectionId: createId(new Date("2026-08-25T08:00:12.000Z")),
          order: 1,
          pageStart: 3,
          columns: ["Element", "Symbol"],
          rows: [
            ["Lithium", "Li"],
            ["Sodium", "Na"],
          ],
        },
      ],
    });
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
        [], // blocking validation issues
        [{ id: createId(new Date("2026-08-25T08:00:13.000Z")) }], // document (direct)
        [], // projectAssetRows
        [], // sourceFigureRows
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
        [{ startMs: 0, endMs: 30_000, text: "Alkali metals." }],
        [], // existing render lookup
        [], // existing (manifest hash) render lookup
        [], // activeRenders
        [], // recentRenders
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
      undefined,
      { latestApprovedVisuals },
    );

    await expect(
      service.start({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        correlationId,
        body: { lessonVersionId: versionId },
      }),
    ).resolves.toMatchObject({ id: renderId, status: "queued" });

    expect(latestApprovedVisuals).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
    });
    const jobWrite = writes.find((value) => value.jobType === "lesson.render");
    const payload = jobWrite?.payload as {
      manifest?: { visualAssets?: unknown[] };
      assetManifest?: { assets?: unknown[] };
    };
    expect(payload.manifest?.visualAssets).toEqual([
      {
        assetId: tableAssetId,
        altText: "Table: Element, Symbol",
        source: "source_table",
        table: {
          tableId: tableAssetId,
          columns: ["Element", "Symbol"],
          rows: [
            ["Lithium", "Li"],
            ["Sodium", "Na"],
          ],
          rowCount: 2,
          truncated: false,
        },
      },
    ]);
    // The table has no binary media — only the audio track is fetched.
    expect(payload.assetManifest?.assets).toHaveLength(1);
  });

  it("marks a source_table visual truncated in the render manifest when the source table has more columns than the display bound", async () => {
    const fixture = createCrossUserProjectFixture();
    const now = new Date("2026-08-25T09:00:00.000Z");
    const lessonSpecId = createId(now);
    const sceneId = createId(new Date("2026-08-25T09:00:01.000Z"));
    const tableAssetId = createId(new Date("2026-08-25T09:00:02.000Z"));
    const versionId = createId(new Date("2026-08-25T09:00:04.000Z"));
    const validationId = createId(new Date("2026-08-25T09:00:05.000Z"));
    const audioId = createId(new Date("2026-08-25T09:00:06.000Z"));
    const trackId = createId(new Date("2026-08-25T09:00:07.000Z"));
    const renderId = createId(new Date("2026-08-25T09:00:08.000Z"));
    const correlationId = createId(new Date("2026-08-25T09:00:09.000Z"));
    const wideColumns = Array.from({ length: 9 }, (_, index) => `Column ${index}`);
    const lesson = {
      schemaVersion: "1.8",
      lessonId: lessonSpecId,
      projectId: fixture.projectId,
      title: "Group 1 elements",
      subject: "Chemistry",
      audience: {
        ageBand: "11-13",
        difficulty: "introductory",
        priorKnowledge: [],
      },
      targetDurationSeconds: 180,
      tone: "friendly",
      themeId: "mvp-default",
      objectiveIds: [sceneId],
      voice: { providerVoiceId: "mvp-default", speakingRate: 1 },
      scenes: [
        {
          id: sceneId,
          order: 1,
          narration: "Alkali metals share one outer electron.",
          durationSeconds: 180,
          onScreenText: [],
          transition: "cut",
          assetBindings: [
            { assetId: tableAssetId, role: "diagram", slot: "diagram" },
          ],
          sourceRefs: [
            {
              documentId: createId(new Date("2026-08-25T09:00:03.000Z")),
              parsedDocumentVersion: 1,
              pageStart: 3,
              blockIds: [sceneId],
            },
          ],
          generatedAdditions: [],
          template: "labelled-diagram",
          visual: {
            baseAssetSlot: "diagram",
            kind: "asset",
            labels: [{ anchor: "top", id: "note", text: "Alkali metals" }],
          },
        },
      ],
    };
    const writes: Array<Record<string, unknown>> = [];
    const latestApprovedVisuals = vi.fn().mockResolvedValue({
      snapshotId: createId(new Date("2026-08-25T09:00:10.000Z")),
      parsedDocumentId: createId(new Date("2026-08-25T09:00:11.000Z")),
      figures: [],
      tables: [
        {
          tableId: tableAssetId,
          sectionId: createId(new Date("2026-08-25T09:00:12.000Z")),
          order: 1,
          pageStart: 3,
          columns: wideColumns,
          rows: [wideColumns.map((_, index) => `Cell ${index}`)],
        },
      ],
    });
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
        [], // blocking validation issues
        [{ id: createId(new Date("2026-08-25T09:00:13.000Z")) }], // document (direct)
        [], // projectAssetRows
        [], // sourceFigureRows
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
        [{ startMs: 0, endMs: 30_000, text: "Alkali metals." }],
        [], // existing render lookup
        [], // existing (manifest hash) render lookup
        [], // activeRenders
        [], // recentRenders
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
      undefined,
      { latestApprovedVisuals },
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
    const payload = jobWrite?.payload as {
      manifest?: { visualAssets?: Array<{ table?: { columns: unknown[]; truncated: boolean; rowCount: number } }> };
    };
    const table = payload.manifest?.visualAssets?.[0]?.table;
    expect(table?.columns).toHaveLength(8);
    expect(table?.rowCount).toBe(1);
    expect(table?.truncated).toBe(true);
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
        [], // existing (idempotency key) render lookup
        [], // existing (manifest hash) render lookup
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

describe("ST-103 sound bed and review in the render service", () => {
  const soundBed = {
    trackId: "quiet-pulse",
    checksumSha256: "d".repeat(64),
    storageKey: `catalog/sound-beds/quiet-pulse/${"d".repeat(64)}.wav`,
    contentType: "audio/wav",
    durationMs: 16_000,
    loops: true,
    integratedLoudnessLufs: -20,
    peakDbfs: -6.2,
    licenseId: "CC0-1.0",
    attributionText: null,
  };

  async function startRender(input: {
    snapshotExtras: Record<string, unknown>;
    variant?: boolean;
  }) {
    const fixture = createCrossUserProjectFixture();
    const now = new Date("2026-09-26T08:00:00.000Z");
    const ids = Array.from({ length: 10 }, (_, index) =>
      createId(new Date(now.getTime() + index * 1_000)),
    );
    const [lessonSpecId, sceneId, sourceDocumentId, blockId, versionId, validationId, audioId, trackId, renderId, correlationId] =
      ids as [string, string, string, string, string, string, string, string, string, string];
    const lesson = {
      schemaVersion: "1.8",
      lessonId: lessonSpecId,
      projectId: fixture.projectId,
      title: "States of matter",
      subject: "Science",
      audience: { ageBand: "11-13", difficulty: "introductory", priorKnowledge: [] },
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
            { documentId: sourceDocumentId, parsedDocumentVersion: 1, pageStart: 1, blockIds: [blockId] },
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
            snapshot: { lessonSpec: lesson, ...input.snapshotExtras },
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
        [],
        [
          {
            render: { id: renderId, lessonVersionId: versionId, validationRunId: validationId, createdAt: now, errorCode: null },
            job: { state: "queued", progress: 0, attempts: 0, errorMetadata: null, errorClassification: null, correlationId, startedAt: null, completedAt: null },
            video: null,
            thumbnail: null,
          },
        ],
      ],
    });
    const service = new PostgresRenderService(database, undefined, undefined, () => now);
    await service.start({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      correlationId: correlationId as never,
      body: { lessonVersionId: versionId },
      ...(input.variant === true
        ? {
            variant: {
              approach: "standard" as const,
              comparisonId: createId(now) as never,
              plan: null,
              planSha256: null,
            },
          }
        : {}),
    });
    const job = writes.find((value) => value.jobType === "lesson.render");
    return job?.payload as {
      assetManifest: { soundBed?: unknown };
      manifest: { schemaVersion: number; soundBed: unknown };
    };
  }

  it("pins the version snapshot's bed into manifest v2 and the asset manifest", async () => {
    const payload = await startRender({ snapshotExtras: { soundBed } });
    expect(payload.manifest.schemaVersion).toBe(2);
    expect(payload.manifest.soundBed).toEqual(soundBed);
    expect(payload.assetManifest.soundBed).toEqual({
      checksumSha256: soundBed.checksumSha256,
      contentType: "audio/wav",
      storageKey: soundBed.storageKey,
      trackId: "quiet-pulse",
    });
  });

  it("renders a pre-ST-103 snapshot, and an explicit none, with no bed", async () => {
    for (const snapshotExtras of [{}, { soundBed: null }]) {
      const payload = await startRender({ snapshotExtras });
      expect(payload.manifest.schemaVersion).toBe(2);
      expect(payload.manifest.soundBed).toBeNull();
      expect("soundBed" in payload.assetManifest).toBe(false);
    }
  });

  it("keeps comparison variants narration-only", async () => {
    const payload = await startRender({
      snapshotExtras: { soundBed },
      variant: true,
    });
    expect(payload.manifest.soundBed).toBeNull();
    expect("soundBed" in payload.assetManifest).toBe(false);
  });

  function reviewRows(
    scope: { ownerUserId: string; projectId: string },
    frameKey: string,
    reportJobId?: string,
    stylePackId: string | null = null,
  ) {
    const now = new Date("2026-09-26T08:00:00.000Z");
    const renderId = createId(now);
    const jobId = createId(new Date(now.getTime() + 1));
    return {
      renderId,
      rows: [
        [
          {
            render: { id: renderId, lessonVersionId: createId(now), validationRunId: createId(now), createdAt: now, errorCode: null },
            job: {
              id: jobId,
              state: "failed",
              progress: 0.9,
              attempts: 1,
              errorMetadata: { code: "RENDER_REVIEW_FAILED" },
              errorClassification: "terminal",
              correlationId: createId(now),
              startedAt: now,
              completedAt: now,
            },
            video: null,
            thumbnail: null,
            stylePackId,
          },
        ],
        [
          {
            report: {
              attempt: 1,
              contactSheet: [
                {
                  atMs: 3_000,
                  checksumSha256: "e".repeat(64),
                  height: 270,
                  position: 0.05,
                  storageKey: frameKey,
                  width: 480,
                },
              ],
              durationMs: 60_000,
              findings: [
                {
                  atMs: 12_000,
                  code: "NARRATION_SILENT",
                  correction: "Regenerate the narration audio for the scene at this time, then validate and render again.",
                  detail: "Narration is silent for 3.00 s from 12.00 s.",
                  severity: "error",
                },
              ],
              jobId: reportJobId ?? jobId,
              loudness: { integratedLufs: -17.2, peakDbfs: -2.1 },
              outcome: "failed",
              reviewVersion: "render-review-v1",
              reviewedAt: now.toISOString(),
              videoChecksumSha256: "f".repeat(64),
            },
          },
        ],
      ],
      scope,
    };
  }

  it("returns the review with signed in-tenant contact frames and a public reason", async () => {
    const fixture = createCrossUserProjectFixture();
    const frameKey = `users/${fixture.ownerUserId}/projects/${fixture.projectId}/renders/${createId()}/review/contact-1.png`;
    const { renderId, rows } = reviewRows(
      { ownerUserId: fixture.ownerUserId, projectId: fixture.projectId },
      frameKey,
    );
    const signed: string[] = [];
    const service = new PostgresRenderService(
      databaseForRenderCommand({ rows, writes: [] }),
      undefined,
      undefined,
      undefined,
      {
        createSignedDownload: async ({ key }) => {
          signed.push(key);
          return {
            expiresAt: new Date("2026-09-26T08:05:00.000Z"),
            method: "GET",
            object: { bucket: "private", key },
            requiredHeaders: {},
            url: "https://storage.example.test/signed-frame",
          };
        },
      },
    );
    const response = await service.detail({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      renderId: renderId as never,
    });
    expect(response.errorCode).toBe("RENDER_REVIEW_FAILED");
    expect(response.errorMessage).toMatch(/quality review/);
    expect(response.video).toBeNull();
    expect(response.review).toMatchObject({
      outcome: "failed",
      loudness: { integratedLufs: -17.2, peakDbfs: -2.1 },
      findings: [expect.objectContaining({ atMs: 12_000, code: "NARRATION_SILENT" })],
      contactSheet: [
        { atMs: 3_000, position: 0.05, url: "https://storage.example.test/signed-frame" },
      ],
    });
    expect(signed).toEqual([frameKey]);
    expect(JSON.stringify(response.review)).not.toContain("users/");
    // A version with no creative-design manifest is the only legacy style.
    expect(response.styleLabel).toBe("Legacy default theme");
  });

  it("names the rendered version's visual style (ST-108)", async () => {
    const fixture = createCrossUserProjectFixture();
    const scope = { ownerUserId: fixture.ownerUserId, projectId: fixture.projectId };
    const styleOf = async (stylePackId: string) => {
      const { renderId, rows } = reviewRows(scope, `users/${fixture.ownerUserId}/projects/${fixture.projectId}/renders/x/review/contact-1.png`, undefined, stylePackId);
      const service = new PostgresRenderService(databaseForRenderCommand({ rows, writes: [] }));
      return (await service.detail({ ...scope, renderId: renderId as never })).styleLabel;
    };
    expect(await styleOf("field-notes")).toBe("Field Notes");
    expect(await styleOf("prism")).toBe("Prism");
    // An unrecognised id in a stored snapshot never leaks as a raw label.
    expect(await styleOf("mvp-default")).toBe("Legacy default theme");
  });

  it("does not show a superseded attempt's review on the current job", async () => {
    const fixture = createCrossUserProjectFixture();
    const { renderId, rows } = reviewRows(
      { ownerUserId: fixture.ownerUserId, projectId: fixture.projectId },
      `users/${fixture.ownerUserId}/projects/${fixture.projectId}/renders/x/review/contact-1.png`,
      createId(new Date("2026-09-25T00:00:00.000Z")),
    );
    const createSignedDownload = vi.fn();
    const response = await new PostgresRenderService(
      databaseForRenderCommand({ rows, writes: [] }),
      undefined,
      undefined,
      undefined,
      { createSignedDownload },
    ).detail({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      renderId: renderId as never,
    });
    expect(response.review).toBeNull();
    expect(createSignedDownload).not.toHaveBeenCalled();
  });

  it("refuses to sign a contact frame outside the render's tenant", async () => {
    const fixture = createCrossUserProjectFixture();
    const { renderId, rows } = reviewRows(
      { ownerUserId: fixture.ownerUserId, projectId: fixture.projectId },
      `users/${fixture.otherUserId}/projects/${fixture.projectId}/renders/x/review/contact-1.png`,
    );
    const createSignedDownload = vi.fn();
    const service = new PostgresRenderService(
      databaseForRenderCommand({ rows, writes: [] }),
      undefined,
      undefined,
      undefined,
      { createSignedDownload },
    );
    await expect(
      service.detail({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
        renderId: renderId as never,
      }),
    ).rejects.toThrow("outside the render tenant");
    expect(createSignedDownload).not.toHaveBeenCalled();
  });
});
