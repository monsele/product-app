import { describe, expect, it, vi } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import type { DatabaseClient } from "@avlp/database";
import type { ObjectStorage } from "@avlp/storage";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import {
  generateShareToken,
  hashShareToken,
  InMemoryPublicShareRateLimiter,
  PostgresShareLinkService,
} from "./share-links.js";

describe("share links", () => {
  it("creates opaque high-entropy tokens and stores a non-reversible hash", () => {
    const first = generateShareToken();
    const second = generateShareToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
    expect(hashShareToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashShareToken(first)).not.toContain(first);
  });

  it("rate limits public resolution by network without using a raw token key", () => {
    const at = new Date("2026-08-25T08:00:00.000Z");
    const limiter = new InMemoryPublicShareRateLimiter(() => at, 2);
    expect(limiter.check("203.0.113.9")).toBe(true);
    expect(limiter.check("203.0.113.9")).toBe(true);
    expect(limiter.check("203.0.113.9")).toBe(false);
    expect(limiter.check("198.51.100.3")).toBe(true);
  });

  it("persists only a token hash for a selected verified render and audits create/revoke", async () => {
    const at = new Date("2026-08-25T08:00:00.000Z");
    const ownerUserId = createId(at) as Identifier;
    const projectId = createId(new Date(at.getTime() + 1)) as Identifier;
    const renderId = createId(new Date(at.getTime() + 2)) as Identifier;
    const lessonVersionId = createId(new Date(at.getTime() + 3)) as Identifier;
    const videoId = createId(new Date(at.getTime() + 4)) as Identifier;
    const shareLinkId = createId(new Date(at.getTime() + 5)) as Identifier;
    const writes: unknown[] = [];
    let selectCount = 0;
    const database = fakeShareDatabase({
      onSelect: () => {
        selectCount += 1;
        return selectCount === 1
          ? []
          : [
              {
                render: { id: renderId, lessonVersionId },
                video: { id: videoId },
              },
            ];
      },
      onInsert: (value) => {
        writes.push(value);
        return value && typeof value === "object" && "tokenHash" in value
          ? { ...value, id: shareLinkId, revokedAt: null }
          : { id: shareLinkId };
      },
    });
    const service = new PostgresShareLinkService(
      database,
      { createSignedDownload: vi.fn() } as Pick<
        ObjectStorage,
        "createSignedDownload"
      >,
      new InMemoryPublicShareRateLimiter(() => at),
      () => at,
    );
    const created = await service.create({
      ownerUserId,
      projectId,
      body: { renderId },
      correlationId: ownerUserId,
    });
    expect(created.shareLink).toMatchObject({
      id: shareLinkId,
      renderedVideoId: videoId,
      lessonVersionId,
      status: "active",
    });
    const shareWrite = writes.find(
      (value) => value && typeof value === "object" && "tokenHash" in value,
    ) as { tokenHash: string };
    expect(shareWrite.tokenHash).toBe(hashShareToken(created.token));
    expect(JSON.stringify(writes)).not.toContain(created.token);
    await service.revoke({
      ownerUserId,
      projectId,
      shareLinkId,
      correlationId: ownerUserId,
    });
    expect(JSON.stringify(writes)).toContain("share.created");
    expect(JSON.stringify(writes)).toContain("share.revoked");
  });

  it("returns only signed media and generic unavailability for public resolution", async () => {
    const at = new Date("2026-08-25T08:00:00.000Z");
    const token = generateShareToken();
    const signed = vi
      .fn()
      .mockResolvedValueOnce({ url: "https://media.example.test/video" })
      .mockResolvedValueOnce({ url: "https://media.example.test/thumbnail" });
    const service = new PostgresShareLinkService(
      fakeShareDatabase({
        onSelect: () => [
          {
            title: "States of matter",
            video: { storageKey: "users/u/projects/p/renders/r/lesson.mp4" },
            thumbnail: {
              storageKey: "users/u/projects/p/renders/r/thumbnail.png",
            },
          },
        ],
      }),
      { createSignedDownload: signed } as Pick<
        ObjectStorage,
        "createSignedDownload"
      >,
      new InMemoryPublicShareRateLimiter(() => at),
      () => at,
    );
    await expect(
      service.resolve({ token, network: "203.0.113.9" }),
    ).resolves.toEqual({
      title: "States of matter",
      playbackUrl: "https://media.example.test/video",
      thumbnailUrl: "https://media.example.test/thumbnail",
    });
    expect(signed).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInSeconds: 300 }),
    );
    const unavailable = new PostgresShareLinkService(
      fakeShareDatabase({ onSelect: () => [] }),
      { createSignedDownload: vi.fn() } as Pick<
        ObjectStorage,
        "createSignedDownload"
      >,
      new InMemoryPublicShareRateLimiter(() => at),
      () => at,
    );
    for (const state of ["expired", "revoked", "deleted"])
      await expect(
        unavailable.resolve({ token, network: `${state}.example` }),
      ).rejects.toMatchObject({
        code: "not_found",
        statusCode: 404,
      });
  });

  it("makes create and revoke owner-only while exposing a minimal public DTO", async () => {
    const project = createCrossUserProjectFixture();
    const now = new Date("2026-08-25T08:00:00.000Z");
    const shareLinkId = createId(now) as Identifier;
    const create = vi.fn().mockResolvedValue({
      token: "A".repeat(43),
      shareLink: {
        id: shareLinkId,
        lessonVersionId: createId(new Date(now.getTime() + 1)),
        renderedVideoId: createId(new Date(now.getTime() + 2)),
        status: "active",
        expiresAt: null,
        revokedAt: null,
        createdAt: now.toISOString(),
      },
    });
    const revoke = vi.fn().mockResolvedValue(undefined);
    const resolve = vi.fn().mockResolvedValue({
      title: "States of matter",
      thumbnailUrl: "https://media.example.test/thumbnail",
      playbackUrl: "https://media.example.test/playback",
    });
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("not used");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "owner"
          ? {
              id: project.ownerUserId,
              email: "owner@example.test",
              displayName: "Owner",
            }
          : token === "other"
            ? {
                id: project.otherUserId,
                email: "other@example.test",
                displayName: "Other",
              }
            : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([project.project]),
      ),
      shareLinkService: {
        create,
        list: vi.fn().mockResolvedValue({ shareLinks: [] }),
        revoke,
        resolve,
      },
    });
    try {
      const server = app.getHttpAdapter().getInstance();
      const foreign = await server.inject({
        method: "POST",
        url: `/projects/${project.projectId}/share-links`,
        cookies: { [sessionCookieName]: "other" },
        payload: {},
      });
      expect(foreign.statusCode).toBe(404);
      expect(create).not.toHaveBeenCalled();
      const created = await server.inject({
        method: "POST",
        url: `/projects/${project.projectId}/share-links`,
        cookies: { [sessionCookieName]: "owner" },
        payload: {},
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ token: "A".repeat(43) });
      const revoked = await server.inject({
        method: "DELETE",
        url: `/projects/${project.projectId}/share-links/${shareLinkId}`,
        cookies: { [sessionCookieName]: "owner" },
      });
      expect(revoked.statusCode).toBe(204);
      expect(revoke).toHaveBeenCalledWith(
        expect.objectContaining({ shareLinkId }),
      );
      const publicResponse = await server.inject({
        method: "GET",
        url: `/${"share"}/${"A".repeat(43)}`,
      });
      expect(publicResponse.statusCode).toBe(200);
      expect(publicResponse.headers["cache-control"]).toBe("no-store");
      expect(publicResponse.json()).toEqual({
        title: "States of matter",
        thumbnailUrl: "https://media.example.test/thumbnail",
        playbackUrl: "https://media.example.test/playback",
      });
      expect(publicResponse.body).not.toMatch(
        /project|source|citation|storage/i,
      );
    } finally {
      await app.close();
    }
  });

  it("returns the same unavailable response for malformed public tokens", async () => {
    const app = await createApp();
    try {
      const response = await app
        .getHttpAdapter()
        .getInstance()
        .inject({ method: "GET", url: "/share/not-a-token" });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: { code: "not_found" } });
      expect(response.body).not.toContain("project");
    } finally {
      await app.close();
    }
  });
});

function fakeShareDatabase(input: {
  onSelect: () => unknown[];
  onInsert?: (value: unknown) => Record<string, unknown>;
}): DatabaseClient {
  const query = (result: unknown[]) => ({
    from: () => query(result),
    innerJoin: () => query(result),
    leftJoin: () => query(result),
    where: () => query(result),
    orderBy: () => query(result),
    limit: () => query(result),
    then: <T1 = unknown, T2 = never>(
      resolve?: ((value: unknown[]) => T1 | PromiseLike<T1>) | null,
      reject?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ) => Promise.resolve(result).then(resolve, reject),
  });
  const insert = () => ({
    values: (value: unknown) => ({
      returning: async () => [input.onInsert?.(value) ?? { id: createId() }],
    }),
  });
  return {
    execute: async () => [],
    select: () => query(input.onSelect()),
    insert,
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [
            { id: createId(), lessonVersionId: createId() },
          ],
        }),
      }),
    }),
    transaction: async (
      callback: (transaction: DatabaseClient) => Promise<unknown>,
    ) =>
      callback({
        execute: async () => [],
        select: () => query(input.onSelect()),
        insert,
      } as unknown as DatabaseClient),
  } as unknown as DatabaseClient;
}
