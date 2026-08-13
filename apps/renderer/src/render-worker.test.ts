import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createId } from "@avlp/config";
import {
  classifyJobError,
  hashJobOptions,
  type JobHandlerContext,
} from "@avlp/jobs";
import type { UsageMeasurement, UsageMeter } from "@avlp/observability";
import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import {
  storageKeySchema,
  type ObjectStorage,
  type SignedStorageRequest,
  type SignedUploadRequest,
  type StorageKey,
  type StorageObjectMetadata,
} from "@avlp/storage";
import { describe, expect, it, vi } from "vitest";
import {
  createFixtureRenderPayload,
  renderJobResultSchema,
} from "./contracts.js";
import { RenderMediaError, type RenderEngine } from "./media.js";
import {
  createRenderJobHandler,
  temporaryDirectoryIsAbsent,
  uploadArtifactThroughStorage,
  type UploadArtifact,
} from "./render-worker.js";

class MemoryStorage implements ObjectStorage {
  public readonly objects = new Map<StorageKey, StorageObjectMetadata>();
  public privacyChecks = 0;

  public async assertPrivateBucket(): Promise<void> {
    this.privacyChecks += 1;
  }

  public async createSignedUpload(
    request?: SignedUploadRequest,
  ): Promise<SignedStorageRequest> {
    void request;
    throw new Error("Tests inject an upload transport.");
  }

  public async createSignedDownload(): Promise<SignedStorageRequest> {
    throw new Error("Downloads are outside this story.");
  }

  public async getMetadata(key: StorageKey): Promise<StorageObjectMetadata> {
    const stored = this.objects.get(key);
    if (stored === undefined) throw new Error("Object is missing.");
    return stored;
  }

  public async exists(key: StorageKey): Promise<boolean> {
    return this.objects.has(key);
  }

  public async delete(key: StorageKey): Promise<void> {
    this.objects.delete(key);
  }

  public async replaceLifecycleConfiguration(): Promise<void> {}

  public put(input: {
    bytes: Uint8Array;
    contentType: string;
    key: StorageKey;
    metadata: Readonly<Record<string, string>>;
  }): { checksumSha256: string; sizeBytes: number } {
    const checksumSha256 = createHash("sha256")
      .update(input.bytes)
      .digest("hex");
    this.objects.set(input.key, {
      checksumSha256,
      contentType: input.contentType,
      etag: checksumSha256,
      lastModified: new Date("2026-08-13T00:00:00.000Z"),
      metadata: { ...input.metadata, sha256: checksumSha256 },
      object: { bucket: "private-test", key: input.key },
      sizeBytes: input.bytes.byteLength,
    });
    return { checksumSha256, sizeBytes: input.bytes.byteLength };
  }
}

class FakeRenderEngine implements RenderEngine {
  public renderCalls = 0;
  public thumbnailCalls = 0;
  public temporaryDirectory: string | undefined;
  public renderFailure: RenderMediaError | undefined;
  public thumbnailFailure = false;

  public async renderVideo(
    request: Parameters<RenderEngine["renderVideo"]>[0],
  ): ReturnType<RenderEngine["renderVideo"]> {
    this.renderCalls += 1;
    this.temporaryDirectory = request.outputPath.replace(
      /[\\/]lesson\.mp4$/,
      "",
    );
    if (this.renderFailure !== undefined) throw this.renderFailure;
    await request.onProgress(0.5);
    await request.onProgress(1);
    await writeFile(request.outputPath, "verified-fake-mp4");
    return {
      audioCodec: "aac",
      durationMs: 180_000,
      fps: 30,
      height: 1080,
      sizeBytes: 17,
      videoCodec: "h264",
      width: 1920,
    };
  }

  public async renderThumbnail(
    request: Parameters<RenderEngine["renderThumbnail"]>[0],
  ): ReturnType<RenderEngine["renderThumbnail"]> {
    this.thumbnailCalls += 1;
    if (this.thumbnailFailure)
      throw new RenderMediaError(
        "retryable",
        "THUMBNAIL_FAILED",
        "Thumbnail failed.",
      );
    await writeFile(request.outputPath, Uint8Array.from([137, 80, 78, 71]));
    return { height: 1080, timestampMs: 60_000, width: 1920 };
  }
}

class SignedUploadMemoryStorage extends MemoryStorage {
  public pendingUpload: SignedUploadRequest | undefined;

  public constructor(private readonly uploadUrl: string) {
    super();
  }

  public async createSignedUpload(
    request?: SignedUploadRequest,
  ): Promise<SignedStorageRequest> {
    if (request === undefined) throw new Error("Upload request is required.");
    this.pendingUpload = request;
    return {
      expiresAt: new Date("2026-08-13T00:05:00.000Z"),
      method: "PUT",
      object: { bucket: "private-test", key: request.key },
      requiredHeaders: {
        "content-length": String(request.contentLength),
        "content-type": request.contentType,
      },
      url: this.uploadUrl,
    };
  }
}

class MemoryUsageMeter implements UsageMeter {
  public readonly measurements = new Map<string, UsageMeasurement>();

  public async record(measurement: UsageMeasurement): Promise<{ id: string }> {
    this.measurements.set(measurement.idempotencyKey, measurement);
    return { id: createId() };
  }
}

const payload = createFixtureRenderPayload(photosynthesisThreeMinutePreview);

function context(progress: number[]): JobHandlerContext {
  const now = new Date("2026-08-13T00:00:00.000Z");
  return {
    attempt: 1,
    correlationId: createId(now),
    heartbeat: () => Promise.resolve(),
    idempotencyKey: `lesson.render:${payload.optionsHash}`,
    jobId: createId(now),
    ownerUserId: createId(now),
    projectId: photosynthesisThreeMinutePreview.lesson.projectId,
    reportProgress: (value) => {
      progress.push(value);
      return Promise.resolve();
    },
  };
}

function uploader(storage: MemoryStorage): UploadArtifact {
  return async (input) => {
    const bytes = await readFile(input.localPath);
    return storage.put({
      bytes,
      contentType: input.contentType,
      key: storageKeySchema.parse(input.storageKey),
      metadata: input.metadata,
    });
  };
}

describe("initial render worker", () => {
  it("streams a checksummed artifact through a signed private upload", async () => {
    let storage: SignedUploadMemoryStorage | undefined;
    let received = Buffer.alloc(0);
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        received = Buffer.concat(chunks);
        if (storage === undefined)
          throw new Error("Test storage is unavailable.");
        const pending = storage.pendingUpload!;
        storage.put({
          bytes: received,
          contentType: pending.contentType,
          key: pending.key,
          metadata: pending.metadata ?? {},
        });
        response.statusCode = 200;
        response.end();
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string")
      throw new Error("Test HTTP server did not expose a TCP port.");
    storage = new SignedUploadMemoryStorage(
      `http://127.0.0.1:${address.port}/upload`,
    );
    const directory = await mkdtemp(join(tmpdir(), "avlp-upload-test-"));
    const localPath = join(directory, "artifact.bin");
    const expected = Buffer.alloc(256 * 1024, 7);
    await writeFile(localPath, expected);
    try {
      const result = await uploadArtifactThroughStorage({
        contentType: "video/mp4",
        localPath,
        metadata: { kind: "render" },
        storage,
        storageKey: storageKeySchema.parse("users/test/artifact.mp4"),
      });
      expect(received).toEqual(expected);
      expect(result).toEqual({
        checksumSha256: createHash("sha256").update(expected).digest("hex"),
        sizeBytes: expected.byteLength,
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
      await new Promise<void>((resolve, reject) =>
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        ),
      );
    }
  });

  it("uploads verified video and thumbnail metadata and reports progress", async () => {
    const storage = new MemoryStorage();
    const engine = new FakeRenderEngine();
    const progress: number[] = [];
    const usageMeter = new MemoryUsageMeter();
    const handler = createRenderJobHandler({
      engine,
      storage,
      uploadArtifact: uploader(storage),
      usageMeter,
    });
    const handlerContext = {
      ...context(progress),
      idempotencyKey: "x".repeat(500),
    };

    const result = renderJobResultSchema.parse(
      await handler.handler(payload, handlerContext),
    );

    expect(result).toMatchObject({
      compositionSha256: payload.compositionSha256,
      optionsHash: payload.optionsHash,
      rendererVersion: payload.rendererVersion,
    });
    expect(result.video).toMatchObject({
      audioCodec: "aac",
      durationMs: 180_000,
      fps: 30,
      height: 1080,
      videoCodec: "h264",
      width: 1920,
    });
    expect(result.thumbnail.status).toBe("succeeded");
    expect([...storage.objects.keys()]).toEqual([
      expect.stringMatching(/\/lesson\.mp4$/),
      expect.stringMatching(/\/thumbnail\.png$/),
    ]);
    expect(
      [...storage.objects.values()].every(
        (object) =>
          object.metadata["composition-sha256"] === payload.compositionSha256 &&
          object.metadata["render-options-hash"] === payload.optionsHash &&
          object.metadata["renderer-version"] === payload.rendererVersion,
      ),
    ).toBe(true);
    expect(progress).toEqual([0.45, 0.9, 0.95]);
    expect(storage.privacyChecks).toBe(1);
    expect([...usageMeter.measurements.values()]).toEqual([
      expect.objectContaining({
        operationType: "video.render",
        quantity: 180,
        status: "succeeded",
        unit: "render_seconds",
      }),
    ]);
    expect([...usageMeter.measurements.keys()][0]!.length).toBeLessThanOrEqual(
      300,
    );
    expect(await temporaryDirectoryIsAbsent(engine.temporaryDirectory!)).toBe(
      true,
    );
  });

  it("reuses deterministic authoritative objects on duplicate delivery", async () => {
    const storage = new MemoryStorage();
    const engine = new FakeRenderEngine();
    const usageMeter = new MemoryUsageMeter();
    const handler = createRenderJobHandler({
      engine,
      storage,
      uploadArtifact: uploader(storage),
      usageMeter,
    });
    const deliveryContext = context([]);
    await handler.handler(payload, deliveryContext);
    const duplicate = renderJobResultSchema.parse(
      await handler.handler(payload, deliveryContext),
    );

    expect(duplicate.reused).toBe(true);
    expect(engine.renderCalls).toBe(1);
    expect(engine.thumbnailCalls).toBe(1);
    expect(storage.objects.size).toBe(2);
    expect(usageMeter.measurements.size).toBe(1);
  });

  it("records a forced deterministic render failure as terminal and cleans up", async () => {
    const storage = new MemoryStorage();
    const engine = new FakeRenderEngine();
    engine.renderFailure = new RenderMediaError(
      "terminal",
      "RENDER_FAILED",
      "The fixture contains an invalid deterministic scene.",
    );
    const usageMeter = new MemoryUsageMeter();
    const warn = vi.fn();
    const handler = createRenderJobHandler({
      engine,
      logger: { info: vi.fn(), warn },
      storage,
      uploadArtifact: uploader(storage),
      usageMeter,
    });

    let failure: unknown;
    try {
      await handler.handler(payload, context([]));
    } catch (error) {
      failure = error;
    }
    expect(classifyJobError(failure)).toMatchObject({
      classification: "terminal",
      code: "RENDER_FAILED",
    });
    expect([...usageMeter.measurements.values()]).toEqual([
      expect.objectContaining({
        metadata: expect.objectContaining({ code: "RENDER_FAILED" }),
        status: "failed",
        unit: "render_attempts",
      }),
    ]);
    expect(warn).toHaveBeenCalledWith(
      "render.failed",
      expect.objectContaining({
        classification: "terminal",
        code: "RENDER_FAILED",
        errorName: "RenderMediaError",
      }),
    );
    expect(await temporaryDirectoryIsAbsent(engine.temporaryDirectory!)).toBe(
      true,
    );
  });

  it("rejects manifest assets outside the immutable lesson scenes", async () => {
    const storage = new MemoryStorage();
    const deliveryContext = context([]);
    const assetManifest = {
      assets: [
        {
          checksumSha256: "a".repeat(64),
          contentType: "image/png" as const,
          sceneId: createId(),
          storageKey: storageKeySchema.parse(
            `users/${deliveryContext.ownerUserId}/projects/${deliveryContext.projectId}/assets/${createId()}/original.png`,
          ),
        },
      ],
      schemaVersion: 1 as const,
    };
    const invalidPayload = {
      ...payload,
      assetManifest,
      optionsHash: hashJobOptions({
        assetManifest,
        compositionSha256: payload.compositionSha256,
        lessonSpecSha256: payload.lessonSpecSha256,
        profile: payload.profile,
        rendererVersion: payload.rendererVersion,
      }),
    };
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: new MemoryUsageMeter(),
    });

    let failure: unknown;
    try {
      await handler.handler(invalidPayload, deliveryContext);
    } catch (error) {
      failure = error;
    }
    expect(classifyJobError(failure)).toMatchObject({
      classification: "terminal",
      code: "ASSET_SCENE_MISMATCH",
    });
  });

  it("records a missing manifest asset as a terminal failure", async () => {
    const storage = new MemoryStorage();
    const deliveryContext = context([]);
    const assetManifest = {
      assets: [
        {
          checksumSha256: "a".repeat(64),
          contentType: "image/png" as const,
          sceneId: photosynthesisThreeMinutePreview.lesson.scenes[0]!.id,
          storageKey: storageKeySchema.parse(
            `users/${deliveryContext.ownerUserId}/projects/${deliveryContext.projectId}/assets/${createId()}/original.png`,
          ),
        },
      ],
      schemaVersion: 1 as const,
    };
    const missingAssetPayload = {
      ...payload,
      assetManifest,
      optionsHash: hashJobOptions({
        assetManifest,
        compositionSha256: payload.compositionSha256,
        lessonSpecSha256: payload.lessonSpecSha256,
        profile: payload.profile,
        rendererVersion: payload.rendererVersion,
      }),
    };
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: new MemoryUsageMeter(),
    });

    let failure: unknown;
    try {
      await handler.handler(missingAssetPayload, deliveryContext);
    } catch (error) {
      failure = error;
    }
    expect(classifyJobError(failure)).toMatchObject({
      classification: "terminal",
      code: "ASSET_MISSING",
    });
  });

  it("rejects a lesson from another project before rendering or storage access", async () => {
    const storage = new MemoryStorage();
    const engine = new FakeRenderEngine();
    const warn = vi.fn();
    const handler = createRenderJobHandler({
      engine,
      logger: { info: vi.fn(), warn },
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: new MemoryUsageMeter(),
    });
    const mismatchedContext = {
      ...context([]),
      projectId: createId(new Date("2026-08-14T00:00:00.000Z")),
    };

    let failure: unknown;
    try {
      await handler.handler(payload, mismatchedContext);
    } catch (error) {
      failure = error;
    }

    expect(classifyJobError(failure)).toMatchObject({
      classification: "terminal",
      code: "LESSON_PROJECT_MISMATCH",
    });
    expect(engine.renderCalls).toBe(0);
    expect(storage.privacyChecks).toBe(0);
    expect(storage.objects.size).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      "render.failed",
      expect.objectContaining({
        code: "LESSON_PROJECT_MISMATCH",
        stage: "tenant_validation",
      }),
    );
  });

  it("classifies and safely logs temporary-directory creation failures", async () => {
    const temporaryRoot = join(tmpdir(), `missing-${createId()}`);
    const warn = vi.fn();
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      logger: { info: vi.fn(), warn },
      storage: new MemoryStorage(),
      temporaryRoot,
      uploadArtifact: async () => {
        throw new Error("Upload must not run.");
      },
      usageMeter: new MemoryUsageMeter(),
    });

    let failure: unknown;
    try {
      await handler.handler(payload, context([]));
    } catch (error) {
      failure = error;
    }

    expect(classifyJobError(failure)).toMatchObject({
      classification: "retryable",
      code: "RENDER_TEMPORARY_DIRECTORY_FAILED",
    });
    expect(warn).toHaveBeenCalledWith(
      "render.failed",
      expect.objectContaining({
        stage: "temporary_directory",
        systemCode: expect.any(String),
      }),
    );
  });

  it("keeps a verified video successful when thumbnail generation fails", async () => {
    const storage = new MemoryStorage();
    const engine = new FakeRenderEngine();
    engine.thumbnailFailure = true;
    const handler = createRenderJobHandler({
      engine,
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: new MemoryUsageMeter(),
    });

    const result = renderJobResultSchema.parse(
      await handler.handler(payload, context([])),
    );
    expect(result.thumbnail).toEqual({
      code: "THUMBNAIL_FAILED",
      status: "failed",
    });
    expect(result.video.sizeBytes).toBeGreaterThan(0);
    expect(storage.objects.size).toBe(1);
  });
});
