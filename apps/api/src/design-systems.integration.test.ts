import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  migrateDatabase,
  users,
  projects,
  designSystems,
  designSystemVersions,
  designSystemAssets,
  jobs,
  outboxEvents,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { emptyDesignSystemDefinition } from "@avlp/schemas";
import {
  storageKeys,
  type ObjectStorage,
  StorageObjectNotFoundError,
} from "@avlp/storage";
import { eq, and } from "drizzle-orm";
import { DesignSystemService } from "./design-systems.js";
import { createApp, sessionCookieName } from "./app.js";
import type { AuthGateway } from "@avlp/auth";

const serverUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!serverUrl)(
  "design systems: real PostgreSQL and authenticated HTTP",
  () => {
    let database: TestDatabase;
    const owner = createId(),
      other = createId(),
      projectId = createId(),
      otherProject = createId();
    const correlation = createId();
    const clock = new Date("2026-10-18T12:00:00Z");
    const createSignedUpload = vi.fn(
      async (request: Parameters<ObjectStorage["createSignedUpload"]>[0]) => ({
        object: { bucket: "private", key: request.key },
        url: "https://private.example/upload",
        method: "PUT" as const,
        expiresAt: new Date(clock.getTime() + 300000),
        requiredHeaders: { "content-type": request.contentType },
      }),
    );
    const getMetadata = vi.fn<ObjectStorage["getMetadata"]>();
    const createSignedDownload = vi.fn<ObjectStorage["createSignedDownload"]>(
      async (request) => ({
        object: { bucket: "private", key: request.key },
        url: "https://private.example/download",
        method: "GET",
        expiresAt: clock,
        requiredHeaders: {},
      }),
    );
    let service: DesignSystemService;
    beforeAll(async () => {
      database = await createTestDatabase(serverUrl!);
      await migrateDatabase(database.client);
      await database.client.insert(users).values([
        {
          id: owner,
          emailNormalized: "design-owner@example.test",
          displayName: "Owner",
        },
        {
          id: other,
          emailNormalized: "design-other@example.test",
          displayName: "Other",
        },
      ]);
      await database.client.insert(projects).values([
        { id: projectId, ownerUserId: owner, title: "Origin", stage: "draft" },
        {
          id: otherProject,
          ownerUserId: other,
          title: "Other",
          stage: "draft",
        },
      ]);
      service = new DesignSystemService(
        database.client,
        {
          createSignedUpload,
          getMetadata,
          createSignedDownload,
        } as unknown as ObjectStorage,
        () => clock,
      );
    }, 60000);
    afterAll(async () => {
      await database?.destroy();
    });
    const create = () => service.create(owner, { name: "Field journal" });

    it("retrieves every version beyond 200 through stable pages and direct owner-scoped lookup", async () => {
      const system = await create();
      const versions = Array.from({ length: 201 }, (_, index) => ({
        id: createId(),
        ownerUserId: owner,
        systemId: system.id,
        sourceRevision: index + 1,
        snapshot: {
          schemaVersion: "1.0",
          name: `Version ${index + 1}`,
          definition: emptyDesignSystemDefinition,
          assets: [],
        },
        contentHash: "a".repeat(64),
      }));
      await database.client.insert(designSystemVersions).values(versions);
      const detail = await service.get(owner, system.id);
      expect(detail.versions).toHaveLength(200);
      expect(detail.nextBeforeRevision).toBe(2);
      const tail = await service.listVersions(owner, system.id, {
        beforeRevision: detail.nextBeforeRevision,
        limit: 200,
      });
      expect(tail.versions.map((version) => version.sourceRevision)).toEqual([
        1,
      ]);
      expect(tail.nextBeforeRevision).toBeNull();
      expect(
        new Set(
          [...detail.versions, ...tail.versions].map((version) => version.id),
        ).size,
      ).toBe(201);
      expect(
        (await service.getVersion(owner, system.id, versions[0]!.id))
          .sourceRevision,
      ).toBe(1);
      // New publications cannot shift records across the revision cursor.
      await database.client
        .insert(designSystemVersions)
        .values({ ...versions[0]!, id: createId(), sourceRevision: 202 });
      expect(
        (
          await service.listVersions(owner, system.id, { beforeRevision: 2 })
        ).versions.map((version) => version.sourceRevision),
      ).toEqual([1]);
      expect(
        (await service.listVersions(owner, system.id, { beforeRevision: 1 }))
          .versions,
      ).toEqual([]);
      await service.archive(owner, system.id, { expectedRevision: 1 });
      expect(
        (await service.getVersion(owner, system.id, versions[0]!.id)).id,
      ).toBe(versions[0]!.id);
      await expect(
        service.getVersion(other, system.id, versions[0]!.id),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        service.listVersions(other, system.id, {}),
      ).rejects.toMatchObject({ statusCode: 404 });
      const differentSystem = await create();
      await expect(
        service.getVersion(owner, differentSystem.id, versions[0]!.id),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        service.listVersions(owner, system.id, { beforeRevision: 2147483648 }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("keeps systems private, publishes idempotently and rejects stale concurrent edits", async () => {
      const system = await create();
      await expect(service.get(other, system.id)).rejects.toMatchObject({
        statusCode: 404,
      });
      const results = await Promise.allSettled(
        [1, 2].map((n) =>
          service.update(owner, system.id, {
            expectedRevision: 1,
            name: `Journal ${n}`,
            definition: {
              ...emptyDesignSystemDefinition,
              philosophy: "Diagrams before decoration",
            },
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { statusCode: 409 } });
      const [first, duplicate] = await Promise.all([
        service.publish(owner, system.id, { expectedRevision: 2 }),
        service.publish(owner, system.id, { expectedRevision: 2 }),
      ]);
      expect(first.id).toBe(duplicate.id);
      await service.update(owner, system.id, {
        expectedRevision: 2,
        name: "New name",
        definition: emptyDesignSystemDefinition,
      });
      const loaded = await service.get(owner, system.id);
      expect(loaded.versions[0]!.snapshot).toEqual(first.snapshot);
      await expect(
        database.client
          .update(designSystemVersions)
          .set({ contentHash: "b".repeat(64) })
          .where(eq(designSystemVersions.id, first.id)),
      ).rejects.toThrow();
      await service.archive(owner, system.id, { expectedRevision: 3 });
      await expect(
        service.update(owner, system.id, {
          expectedRevision: 4,
          name: "No",
          definition: emptyDesignSystemDefinition,
        }),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect((await service.get(owner, system.id)).versions[0]!.id).toBe(
        first.id,
      );
    });
    it("rejects foreign project/system/asset references before signing or publishing", async () => {
      const system = await create();
      createSignedUpload.mockClear();
      const input = {
        projectId: otherProject,
        kind: "font",
        mediaType: "font/woff2",
        originalName: "custom.woff2",
        sizeBytes: 100,
        sha256: "a".repeat(64),
        rightsConfirmed: true,
      };
      await expect(
        service.createUpload(owner, system.id, input),
      ).rejects.toMatchObject({ statusCode: 404 });
      await expect(
        service.createUpload(other, system.id, { ...input, projectId }),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(createSignedUpload).not.toHaveBeenCalled();
      await expect(
        service.update(owner, system.id, {
          expectedRevision: 1,
          name: "Bad reference",
          definition: {
            ...emptyDesignSystemDefinition,
            assetIds: [createId()],
          },
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
    it("completes uploads exactly once under concurrency and pins only validated assets", async () => {
      const system = await create();
      const upload = await service.createUpload(owner, system.id, {
        projectId,
        kind: "guide",
        mediaType: "text/markdown",
        originalName: "guide.md",
        sizeBytes: 3,
        sha256: "a".repeat(64),
        rightsConfirmed: true,
      });
      const key = storageKeys.designSystemAsset({
        userId: owner,
        systemId: system.id,
        assetId: upload.assetId,
        stage: "upload",
      });
      getMetadata.mockResolvedValue({
        object: { bucket: "private", key },
        sizeBytes: 3,
        checksumSha256: "a".repeat(64),
        contentType: "text/markdown",
        etag: undefined,
        lastModified: clock,
        metadata: {},
      });
      await Promise.all([
        service.completeUpload(owner, system.id, upload.assetId, correlation),
        service.completeUpload(owner, system.id, upload.assetId, correlation),
      ]);
      const queued = await database.client
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, owner),
            eq(jobs.jobType, "design-system.validation"),
          ),
        );
      expect(queued).toHaveLength(1);
      expect(
        await database.client
          .select()
          .from(outboxEvents)
          .where(eq(outboxEvents.jobId, queued[0]!.id)),
      ).toHaveLength(1);
      await database.client
        .update(jobs)
        .set({ state: "failed" })
        .where(eq(jobs.id, queued[0]!.id));
      expect((await service.get(owner, system.id)).assets[0]).toMatchObject({
        validationJob: { state: "failed" },
        recovery: "upload_again",
      });
      const updated = await service.update(owner, system.id, {
        expectedRevision: 1,
        name: "Journal",
        definition: {
          ...emptyDesignSystemDefinition,
          assetIds: [upload.assetId],
        },
      });
      await expect(
        service.publish(owner, system.id, {
          expectedRevision: updated.revision,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        service.download(owner, system.id, upload.assetId),
      ).rejects.toMatchObject({ statusCode: 400 });
      const validatedKey = storageKeys.designSystemAsset({
        userId: owner,
        systemId: system.id,
        assetId: upload.assetId,
        stage: "validated",
        contentHash: "b".repeat(64),
      });
      await database.client
        .update(designSystemAssets)
        .set({
          status: "active",
          storageKey: validatedKey,
          validatedSha256: "b".repeat(64),
          inspection: { kind: "markdown", characterCount: 3 },
        })
        .where(eq(designSystemAssets.id, upload.assetId));
      const version = await service.publish(owner, system.id, {
        expectedRevision: updated.revision,
      });
      expect(
        (await service.get(owner, system.id)).assets[0]!.recovery,
      ).toBeNull();
      expect(version.snapshot).toMatchObject({
        assets: [{ id: upload.assetId, sha256: "b".repeat(64) }],
      });
      createSignedDownload.mockClear();
      await expect(
        service.download(other, system.id, upload.assetId),
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(createSignedDownload).not.toHaveBeenCalled();
      await service.download(owner, system.id, upload.assetId);
      expect(createSignedDownload).toHaveBeenCalledWith(
        expect.objectContaining({ key: validatedKey }),
      );
      await expect(
        database.client
          .update(designSystemAssets)
          .set({ sha256: "c".repeat(64) })
          .where(eq(designSystemAssets.id, upload.assetId)),
      ).rejects.toThrow();
      // Deleting the origin project must not cascade into reusable design bytes/rows.
      await database.client
        .update(projects)
        .set({ deletedAt: clock })
        .where(eq(projects.id, projectId));
      expect((await service.get(owner, system.id)).assets).toHaveLength(1);
      await database.client
        .update(projects)
        .set({ deletedAt: null })
        .where(eq(projects.id, projectId));
    });
    it("rejects expired, missing and mismatched uploads without scheduling work", async () => {
      const system = await create();
      const input = {
        projectId,
        kind: "tokens",
        mediaType: "application/json",
        originalName: "tokens.json",
        sizeBytes: 2,
        sha256: "a".repeat(64),
        rightsConfirmed: true,
      };
      const first = await service.createUpload(owner, system.id, input);
      getMetadata.mockResolvedValue({
        object: { bucket: "private", key: "unused" },
        sizeBytes: 20,
        contentType: "application/json",
        checksumSha256: "a".repeat(64),
        etag: undefined,
        lastModified: clock,
        metadata: {},
      });
      await expect(
        service.completeUpload(owner, system.id, first.assetId, correlation),
      ).rejects.toMatchObject({ statusCode: 400 });
      getMetadata.mockRejectedValueOnce(
        new StorageObjectNotFoundError("unused"),
      );
      await expect(
        service.completeUpload(owner, system.id, first.assetId, correlation),
      ).rejects.toMatchObject({ statusCode: 400 });
      await database.client
        .update(designSystemAssets)
        .set({ expiresAt: new Date(clock.getTime() - 1) })
        .where(eq(designSystemAssets.id, first.assetId));
      await expect(
        service.completeUpload(owner, system.id, first.assetId, correlation),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(
        (
          await database.client
            .select()
            .from(designSystemAssets)
            .where(eq(designSystemAssets.id, first.assetId))
        )[0]!.jobId,
      ).toBeNull();
    });
    it("enforces HTTP authentication, origin, request validation and no-store reads", async () => {
      const auth = {
        currentSession: async (token: string) =>
          token === "owner"
            ? { id: owner, email: "owner@example.test", displayName: "Owner" }
            : token === "other"
              ? { id: other, email: "other@example.test", displayName: "Other" }
              : null,
      } as AuthGateway;
      const app = await createApp({
        authGateway: auth,
        designSystemService: service,
        trustedOrigin: "http://localhost:3000",
      });
      try {
        const server = app.getHttpAdapter().getInstance();
        expect(
          (await server.inject({ method: "GET", url: "/design-systems" }))
            .statusCode,
        ).toBe(401);
        expect(
          (
            await server.inject({
              method: "POST",
              url: "/design-systems",
              cookies: { [sessionCookieName]: "owner" },
              payload: { name: "Unsafe" },
              headers: { origin: "https://other.test" },
            })
          ).statusCode,
        ).toBe(403);
        const created = await server.inject({
          method: "POST",
          url: "/design-systems",
          cookies: { [sessionCookieName]: "owner" },
          payload: { name: "HTTP system" },
          headers: { origin: "http://localhost:3000" },
        });
        expect(created.statusCode).toBe(201);
        const id = (created.json() as { id: string }).id;
        const response = await server.inject({
          method: "GET",
          url: `/design-systems/${id}`,
          cookies: { [sessionCookieName]: "owner" },
        });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        const published = await server.inject({
          method: "POST",
          url: `/design-systems/${id}/versions`,
          cookies: { [sessionCookieName]: "owner" },
          headers: { origin: "http://localhost:3000" },
          payload: { expectedRevision: 1 },
        });
        expect(published.statusCode).toBe(201);
        const versionId = (published.json() as { id: string }).id;
        const page = await server.inject({
          method: "GET",
          url: `/design-systems/${id}/versions?limit=1`,
          cookies: { [sessionCookieName]: "owner" },
        });
        expect(page.statusCode).toBe(200);
        expect(page.headers["cache-control"]).toBe("private, no-store");
        expect(page.json()).toMatchObject({
          versions: [{ id: versionId }],
          nextBeforeRevision: null,
        });
        const direct = await server.inject({
          method: "GET",
          url: `/design-systems/${id}/versions/${versionId}`,
          cookies: { [sessionCookieName]: "owner" },
        });
        expect(direct.statusCode).toBe(200);
        expect(direct.headers["cache-control"]).toBe("private, no-store");
        expect(
          (
            await server.inject({
              method: "GET",
              url: `/design-systems/${id}/versions?beforeRevision=invalid`,
              cookies: { [sessionCookieName]: "owner" },
            })
          ).statusCode,
        ).toBe(400);
        expect(
          (
            await server.inject({
              method: "GET",
              url: `/design-systems/${id}/versions`,
              cookies: { [sessionCookieName]: "other" },
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await server.inject({
              method: "GET",
              url: `/design-systems/${id}/versions/${versionId}`,
              cookies: { [sessionCookieName]: "other" },
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await server.inject({
              method: "GET",
              url: `/design-systems/${id}`,
              cookies: { [sessionCookieName]: "other" },
            })
          ).statusCode,
        ).toBe(404);
        expect(
          (
            await server.inject({
              method: "PUT",
              url: `/design-systems/${id}`,
              cookies: { [sessionCookieName]: "owner" },
              payload: { css: "unsafe" },
              headers: { origin: "http://localhost:3000" },
            })
          ).statusCode,
        ).toBe(400);
      } finally {
        await app.close();
      }
      expect(
        (
          await database.client
            .select()
            .from(designSystems)
            .where(eq(designSystems.ownerUserId, owner))
        ).length,
      ).toBeGreaterThan(0);
    });
  },
);
