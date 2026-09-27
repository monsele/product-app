import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Identifier } from "@avlp/config";
import type { AuthGateway } from "@avlp/auth";
import {
  lessonConfigurations,
  migrateDatabase,
  projects,
  soundBedTracks,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { soundBedCatalogResponseSchema } from "@avlp/schemas";
import { eq } from "drizzle-orm";
import { createApp, sessionCookieName } from "./app.js";
import { PostgresSoundBedService } from "./sound-beds.js";

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000203" as Identifier;
const otherOwnerUserId = "019ffbf1-bbbb-7000-8000-000000000203" as Identifier;
const projectId = "019ffbf1-cccc-7000-8000-000000000203" as Identifier;

const auth: AuthGateway = {
  register: async () => {
    throw new Error("not used");
  },
  signIn: async () => null,
  currentSession: async (token) =>
    token === "owner"
      ? { id: ownerUserId, email: "owner@example.test", displayName: "Owner" }
      : null,
  signOut: async () => {},
  requestPasswordReset: async () => {},
  confirmPasswordReset: async () => {},
};

function signingStorage() {
  const signed: Array<{ key: string; expiresInSeconds?: number }> = [];
  return {
    signed,
    storage: {
      createSignedDownload: async (request: {
        key: string;
        expiresInSeconds?: number;
      }) => {
        signed.push(request);
        return {
          expiresAt: new Date("2026-09-26T08:05:00.000Z"),
          method: "GET" as const,
          object: { bucket: "private", key: request.key },
          requiredHeaders: {},
          url: `https://storage.example.test/${encodeURIComponent(request.key)}?signature=x`,
        };
      },
    },
  };
}

describe("GET /sound-beds", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("requires an authenticated session and never caches the signed catalog", async () => {
    const list = vi.fn().mockResolvedValue({ tracks: [] });
    app = await createApp({ authGateway: auth, soundBedService: { list } });
    const server = app.getHttpAdapter().getInstance();

    const anonymous = await server.inject({ method: "GET", url: "/sound-beds" });
    expect(anonymous.statusCode).toBe(401);
    const unknown = await server.inject({
      method: "GET",
      url: "/sound-beds",
      cookies: { [sessionCookieName]: "someone-else" },
    });
    expect(unknown.statusCode).toBe(401);
    expect(list).not.toHaveBeenCalled();

    const owner = await server.inject({
      method: "GET",
      url: "/sound-beds",
      cookies: { [sessionCookieName]: "owner" },
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.headers["cache-control"]).toBe("private, no-store");
    expect(list).toHaveBeenCalledTimes(1);
  }, 30_000);
});

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("PostgresSoundBedService (Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
    const now = new Date("2026-09-26T08:00:00.000Z");
    await database.client.insert(users).values([
      { id: ownerUserId, emailNormalized: "bed-owner@example.test", displayName: "Owner", createdAt: now, updatedAt: now },
      { id: otherOwnerUserId, emailNormalized: "bed-other@example.test", displayName: "Other", createdAt: now, updatedAt: now },
    ]);
    await database.client.insert(projects).values({
      id: projectId,
      ownerUserId,
      title: "Bed lesson",
      stage: "lesson_configuration",
      createdAt: now,
      updatedAt: now,
    });
    await database.client.insert(lessonConfigurations).values({
      id: "019ffbf1-9999-7000-8000-000000000203",
      projectId,
      ownerUserId,
      version: 1,
      ageBand: "11-13",
      difficulty: "introductory",
      subject: "Science",
      lessonTitle: "Beds",
      targetDurationSeconds: 180,
      tone: "friendly",
      soundBedTrackId: "soft-plucks",
      includeRecallQuestions: false,
      sourceParsedDocumentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  });
  afterAll(async () => {
    await database?.destroy();
  });

  it("lists the seeded, licensed catalog in order with short-lived audition URLs", async () => {
    const { signed, storage } = signingStorage();
    const response = soundBedCatalogResponseSchema.parse(
      await new PostgresSoundBedService(database!.client, storage).list(),
    );
    expect(response.tracks.map((track) => track.trackId)).toEqual([
      "morning-pad",
      "quiet-pulse",
      "soft-plucks",
      "warm-drift",
      "bright-steps",
      "night-glass",
    ]);
    for (const track of response.tracks) {
      expect(track.licenseId).toBe("CC0-1.0");
      expect(track.auditionUrl).toContain("signature=");
      expect(JSON.stringify(track)).not.toMatch(/"storageKey"|"checksumSha256"/);
    }
    expect(signed.every((request) => request.expiresInSeconds === 300)).toBe(
      true,
    );
    expect(
      signed.every((request) => request.key.startsWith("catalog/sound-beds/")),
    ).toBe(true);
  });

  it("omits a retired track from the catalog", async () => {
    await database!.client
      .update(soundBedTracks)
      .set({ status: "retired" })
      .where(eq(soundBedTracks.trackId, "night-glass"));
    try {
      const response = await new PostgresSoundBedService(
        database!.client,
        signingStorage().storage,
      ).list();
      expect(response.tracks.map((track) => track.trackId)).not.toContain(
        "night-glass",
      );
    } finally {
      await database!.client
        .update(soundBedTracks)
        .set({ status: "active" })
        .where(eq(soundBedTracks.trackId, "night-glass"));
    }
  });

  it("resolves the configured bed for preview only within the owner's project", async () => {
    const service = new PostgresSoundBedService(
      database!.client,
      signingStorage().storage,
    );
    await expect(
      service.previewForProject({ ownerUserId, projectId }),
    ).resolves.toMatchObject({
      durationMs: 16_000,
      loops: true,
      trackId: "soft-plucks",
    });
    await expect(
      service.previewForProject({ ownerUserId: otherOwnerUserId, projectId }),
    ).resolves.toBeUndefined();
  });
});
