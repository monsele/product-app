import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@avlp/database";
import { createDefaultStoryboardSceneSpec } from "@avlp/schemas";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import { PreviewManifestService } from "./preview-manifest.js";

const ownerUserId = "01989a3d-8e00-7000-8000-000000000001";
const projectId = "01989a3d-8e00-7000-8000-000000000002";
const hash = createHash("sha256").update("preview").digest("hex");
const scene = createDefaultStoryboardSceneSpec("hook", {
  id: "01989a3d-8e00-7000-8000-000000000010",
  order: 1,
  durationSeconds: 10,
});

function storyboard(sourceScene = scene) {
  return {
    schemaVersion: 1,
    id: "01989a3d-8e00-7000-8000-000000000009",
    projectId,
    basedOnNarrationSetId: "01989a3d-8e00-7000-8000-000000000011",
    narrationSetContentHash: hash,
    outlineSetId: "01989a3d-8e00-7000-8000-000000000012",
    outlineSetContentHash: hash,
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "1",
    model: "fixture",
    modelCallId: "01989a3d-8e00-7000-8000-000000000013",
    status: "draft",
    revision: 1,
    title: "Preview fixture",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: sourceScene.durationSeconds,
    objectiveIds: ["01989a3d-8e00-7000-8000-000000000019"],
    contentHash: hash,
    scenes: [sourceScene].map((item) => ({
      id: item.id,
      stableSceneId: item.id,
      order: item.order,
      template: item.template,
      durationSeconds: item.durationSeconds,
      narrationBlockIds: ["01989a3d-8e00-7000-8000-000000000014"],
      assetRequirements: [],
      scene: item,
    })),
    generatedAt: "2026-08-24T10:00:00.000Z",
    createdAt: "2026-08-24T10:00:00.000Z",
  };
}

function databaseFor(rows: unknown[][]): DatabaseClient {
  const select = () => {
    const result = rows.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      then: <TResult1 = unknown, TResult2 = never>(
        onfulfilled?:
          ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?:
          ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) => Promise.resolve(result).then(onfulfilled, onrejected),
    };
    return query;
  };
  return { select } as unknown as DatabaseClient;
}

function rows() {
  return [
    [{ id: "01989a3d-8e00-7000-8000-000000000015", payload: storyboard() }],
    [{ id: "01989a3d-8e00-7000-8000-000000000016", stableSceneId: scene.id }],
    [
      {
        id: "01989a3d-8e00-7000-8000-000000000017",
        status: "ready",
        storageKey: `users/${ownerUserId}/projects/${projectId}/audio.wav`,
      },
    ],
    [{ id: "01989a3d-8e00-7000-8000-000000000018", status: "ready" }],
    [{ startMs: 0, endMs: 1000, text: "A caption." }],
  ];
}

describe("preview manifest", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it("renews short-lived signed media URLs on each authorized manifest request", async () => {
    const createSignedDownload = vi
      .fn()
      .mockResolvedValueOnce({
        url: "https://storage.example.test/first",
        expiresAt: new Date("2026-08-24T10:05:00.000Z"),
      })
      .mockResolvedValueOnce({
        url: "https://storage.example.test/second",
        expiresAt: new Date("2026-08-24T10:10:00.000Z"),
      });
    const first = await new PreviewManifestService(databaseFor(rows()), {
      createSignedDownload,
    }).get({ ownerUserId, projectId });
    const second = await new PreviewManifestService(databaseFor(rows()), {
      createSignedDownload,
    }).get({ ownerUserId, projectId });
    expect(first.scenes[0]?.audio.url).toBe(
      "https://storage.example.test/first",
    );
    expect(second.scenes[0]?.audio.url).toBe(
      "https://storage.example.test/second",
    );
    expect(createSignedDownload).toHaveBeenCalledTimes(2);
  });

  it("falls back to the current approved storyboard when a draft does not exist", async () => {
    const manifest = await new PreviewManifestService(
      databaseFor([[], [{ id: "01989a3d-8e00-7000-8000-000000000015", payload: storyboard() }], ...rows().slice(1)]),
      {
        createSignedDownload: vi.fn().mockResolvedValue({
          url: "https://storage.example.test/audio",
          expiresAt: new Date("2026-08-24T10:05:00.000Z"),
        }),
      },
    ).get({ ownerUserId, projectId });
    expect(manifest.scenes[0]?.stale).toBe(false);
  });

  it("marks missing scene records and unresolved assets as stale", async () => {
    const missingAssetId = "01989a3d-8e00-7000-8000-000000000020";
    const manifest = await new PreviewManifestService(
      databaseFor([
        [
          {
            id: "01989a3d-8e00-7000-8000-000000000015",
            payload: storyboard({
              ...scene,
              assetBindings: [
                { assetId: missingAssetId, role: "illustration" },
              ],
            }),
          },
        ],
        [],
        [],
        [],
      ]),
      { createSignedDownload: vi.fn() },
    ).get({ ownerUserId, projectId });
    expect(manifest.scenes).toEqual([
      expect.objectContaining({
        audio: expect.objectContaining({ status: "missing" }),
        missingAssetIds: [missingAssetId],
        sceneId: scene.id,
        stale: true,
      }),
    ]);
  });

  it("marks a ready caption track without cues as stale", async () => {
    const readyWithoutCues = rows();
    readyWithoutCues[4] = [];
    const manifest = await new PreviewManifestService(
      databaseFor(readyWithoutCues),
      {
        createSignedDownload: vi.fn().mockResolvedValue({
          url: "https://storage.example.test/audio",
          expiresAt: new Date("2026-08-24T10:05:00.000Z"),
        }),
      },
    ).get({ ownerUserId, projectId });
    expect(manifest.scenes[0]).toMatchObject({ captions: [], stale: true });
  });

  it("authorizes the manifest route before invoking the resolver", async () => {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner-session",
        {
          id: fixture.ownerUserId,
          email: "owner@example.test",
          displayName: "Owner",
        },
      ],
      [
        "other-session",
        {
          id: fixture.otherUserId,
          email: "other@example.test",
          displayName: "Other",
        },
      ],
    ]);
    const authGateway: AuthGateway = {
      register: async () => {
        throw new Error("Not used by this test.");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const get = vi.fn().mockResolvedValue({ preview: "authorized" });
    app = await createApp({
      authGateway,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      previewManifestService: { get },
    });
    const server = app.getHttpAdapter().getInstance();

    const foreign = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/preview-manifest`,
      cookies: { [sessionCookieName]: "other-session" },
    });
    expect(foreign.statusCode).toBe(404);
    expect(get).not.toHaveBeenCalled();

    const owner = await server.inject({
      method: "GET",
      url: `/projects/${fixture.projectId}/preview-manifest?quality=low`,
      cookies: { [sessionCookieName]: "owner-session" },
    });
    expect(owner.statusCode).toBe(200);
    expect(get).toHaveBeenCalledWith({
      ownerUserId: fixture.ownerUserId,
      projectId: fixture.projectId,
      quality: "low",
    });
  });
});
