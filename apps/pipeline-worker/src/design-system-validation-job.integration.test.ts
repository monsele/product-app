import { createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  designSystemAssets,
  designSystems,
  migrateDatabase,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { emptyDesignSystemDefinition } from "@avlp/schemas";
import {
  storageKeys,
  StorageObjectNotFoundError,
  type ObjectStorage,
  type WriteObjectRequest,
} from "@avlp/storage";
import { eq } from "drizzle-orm";
import { createDesignSystemValidationJobHandler } from "./design-system-validation-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!serverUrl)("design-system import jobs (PostgreSQL)", () => {
  let db: TestDatabase;
  const ownerUserId = createId(),
    projectId = createId();
  beforeAll(async () => {
    db = await createTestDatabase(serverUrl!);
    await migrateDatabase(db.client);
    await db.client.insert(users).values({
      id: ownerUserId,
      emailNormalized: "import-worker@example.test",
      displayName: "Owner",
    });
  }, 60000);
  afterAll(async () => {
    await db?.destroy();
  });
  async function harness(
    text = "# Our design guide",
    mediaType = "text/markdown",
  ) {
    const assetId = createId(),
      systemId = createId(),
      jobId = createId();
    const source = new TextEncoder().encode(text);
    const sha256 = createHash("sha256").update(source).digest("hex");
    const uploadKey = storageKeys.designSystemAsset({
      userId: ownerUserId,
      systemId,
      assetId,
      stage: "upload",
    });
    const objects = new Map<string, Uint8Array>([[uploadKey, source]]);
    const getBytes = vi.fn<ObjectStorage["getBytes"]>(async (key) => {
      const body = objects.get(key);
      if (!body) throw new StorageObjectNotFoundError(key);
      return {
        body,
        metadata: {
          object: { bucket: "private", key },
          sizeBytes: body.length,
          contentType: mediaType,
          checksumSha256: sha256,
          etag: undefined,
          lastModified: undefined,
          metadata: {},
        },
      };
    });
    const putBytes = vi.fn(async (input: WriteObjectRequest) => {
      objects.set(input.key, input.body);
      return (await getBytes(input.key, 10 * 1024 * 1024)).metadata;
    });
    const scanner = {
      providerId: "fixture-scanner",
      scan: vi.fn(async () => ({ status: "safe" as "safe" | "unsafe" })),
    };
    await db.client.insert(designSystems).values({
      id: systemId,
      ownerUserId,
      name: "Guide system",
      definition: emptyDesignSystemDefinition,
    });
    await db.client.insert(designSystemAssets).values({
      id: assetId,
      ownerUserId,
      projectId,
      systemId,
      jobId,
      kind: "guide",
      mediaType,
      originalName: "guide.md",
      sizeBytes: source.length,
      sha256,
      uploadKey,
      status: "pending_validation",
      expiresAt: new Date(),
    });
    const handler = createDesignSystemValidationJobHandler({
      database: db.client,
      storage: { getBytes, putBytes } as unknown as ObjectStorage,
      scanner,
    });
    const context = {
      ownerUserId,
      projectId,
      jobId,
      correlationId: createId(),
      idempotencyKey: "design-validation-test",
      attempt: 1,
      heartbeat: vi.fn(async () => {}),
      reportProgress: vi.fn(async () => {}),
    };
    const payload = { schemaVersion: 1, systemId, assetId };
    const run = () => handler.handler(payload, context);
    const load = async (database: DatabaseClient = db.client) =>
      (
        await database
          .select()
          .from(designSystemAssets)
          .where(eq(designSystemAssets.id, assetId))
      )[0]!;
    return {
      run,
      load,
      context,
      payload,
      handler,
      scanner,
      getBytes,
      putBytes,
      uploadKey,
      objects,
      source,
      assetId,
    };
  }
  it("pins separate validated bytes; retries never re-read a mutable upload", async () => {
    const h = await harness();
    expect(await h.run()).toEqual({ validation: "active" });
    const asset = await h.load();
    expect(asset.storageKey).not.toBe(h.uploadKey);
    expect(asset.storageKey).not.toContain(`/projects/${projectId}/`);
    expect(asset.validatedSha256).toBe(
      createHash("sha256").update(h.source).digest("hex"),
    );
    h.objects.set(
      h.uploadKey,
      new TextEncoder().encode("Changed after validation"),
    );
    expect(await h.run()).toEqual({ validation: "active" });
    expect(h.scanner.scan).toHaveBeenCalledTimes(1);
    expect(h.putBytes).toHaveBeenCalledTimes(1);
    expect(h.objects.get(asset.storageKey!)).toEqual(h.source);
  });
  it("rejects checksum tampering before scan or persistence", async () => {
    const h = await harness();
    h.objects.set(h.uploadKey, new TextEncoder().encode("different"));
    expect(await h.run()).toMatchObject({ code: "IMPORT_CHECKSUM_MISMATCH" });
    expect(h.scanner.scan).not.toHaveBeenCalled();
    expect(h.putBytes).not.toHaveBeenCalled();
    expect((await h.load()).status).toBe("rejected");
  });
  it("rejects missing, malicious and corrupt imports without publishing bytes", async () => {
    const absent = await harness();
    absent.objects.clear();
    expect(await absent.run()).toMatchObject({ code: "IMPORT_MISSING" });
    const unsafe = await harness();
    unsafe.scanner.scan.mockResolvedValueOnce({ status: "unsafe" });
    expect(await unsafe.run()).toMatchObject({ code: "IMPORT_UNSAFE" });
    const corrupt = await harness("not a font", "font/woff2");
    expect(await corrupt.run()).toMatchObject({
      code: "IMPORT_FORMAT_INVALID",
    });
    const overflowingTokens = await harness(
      '{"size":{"$value":1e400}}',
      "application/json",
    );
    expect(await overflowingTokens.run()).toMatchObject({
      code: "IMPORT_FORMAT_INVALID",
    });
    expect((await overflowingTokens.load()).status).toBe("rejected");
    const invalidPdf = await harness("%PDF-corrupt", "application/pdf");
    expect(await invalidPdf.run()).toMatchObject({
      code: "IMPORT_FORMAT_INVALID",
    });
    expect((await invalidPdf.load()).status).toBe("rejected");
    expect(await invalidPdf.run()).toEqual({ validation: "rejected" });
    for (const h of [absent, unsafe, corrupt, overflowingTokens, invalidPdf])
      expect(h.putBytes).not.toHaveBeenCalled();
  });
  it("keeps pending state on scanner/storage failure and supports retry", async () => {
    const h = await harness();
    h.scanner.scan.mockRejectedValueOnce(new Error("scanner offline"));
    await expect(h.run()).rejects.toMatchObject({
      classification: "retryable",
      code: "IMPORT_SCAN_UNAVAILABLE",
    });
    expect((await h.load()).status).toBe("pending_validation");
    h.putBytes.mockRejectedValueOnce(new Error("storage offline"));
    await expect(h.run()).rejects.toThrow();
    expect((await h.load()).status).toBe("pending_validation");
    expect(await h.run()).toEqual({ validation: "active" });
  });
  it("rejects forged owner, project and job contexts before any storage access", async () => {
    const h = await harness();
    for (const changes of [
      { ownerUserId: createId() },
      { projectId: createId() },
      { jobId: createId() },
    ])
      await expect(
        h.handler.handler(h.payload, { ...h.context, ...changes }),
      ).rejects.toMatchObject({
        classification: "terminal",
        code: "DESIGN_IMPORT_NOT_FOUND",
      });
    expect(h.getBytes).not.toHaveBeenCalled();
  });
});
