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
import type { RenderReviewReport } from "@avlp/schemas";
import {
  storageKeySchema,
  type ObjectStorage,
  type SignedStorageRequest,
  type SignedUploadRequest,
  type StorageKey,
  type StorageObjectBytes,
  type StorageObjectMetadata,
  type WriteObjectRequest,
} from "@avlp/storage";
import { describe, expect, it, vi } from "vitest";
import {
  createFixtureRenderPayload,
  renderJobResultSchema,
} from "./contracts.js";
import { RenderMediaError, type RenderEngine } from "./media.js";
import type {
  RenderInspection,
  RenderInspector,
  RenderMeasurements,
} from "./render-review.js";
import {
  createRenderJobHandler,
  temporaryDirectoryIsAbsent,
  uploadArtifactThroughStorage,
  type DownloadArtifact,
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

  public async getBytes(
    key: StorageKey,
    maxBytes: number,
  ): Promise<StorageObjectBytes> {
    void key;
    void maxBytes;
    throw new Error("Object-body reads are outside renderer tests.");
  }

  public async putBytes(
    input: WriteObjectRequest,
  ): Promise<StorageObjectMetadata> {
    this.put({
      key: input.key,
      bytes: input.body,
      contentType: input.contentType,
      metadata: input.metadata ?? {},
    });
    return this.getMetadata(input.key);
  }

  public async copy(
    input: Parameters<ObjectStorage["copy"]>[0],
  ): Promise<StorageObjectMetadata> {
    const source = await this.getMetadata(input.sourceKey);
    this.objects.set(input.destinationKey, {
      ...source,
      object: { ...source.object, key: input.destinationKey },
    });
    return this.getMetadata(input.destinationKey);
  }

  public async exists(key: StorageKey): Promise<boolean> {
    return this.objects.has(key);
  }

  public async delete(key: StorageKey): Promise<void> {
    this.objects.delete(key);
  }

  public async deletePrefix(prefix: StorageKey): Promise<number> {
    const objectPrefix = `${prefix}/`;
    const matching = [...this.objects.keys()].filter((key) =>
      key.startsWith(objectPrefix),
    );
    for (const key of matching) this.objects.delete(key);
    return matching.length;
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

/** ST-103. Reports a clean review for the fake engine's output, and writes
 * four real (tiny) contact-sheet files for the worker to store. */
class PassingInspector implements RenderInspector {
  public calls = 0;
  public constructor(
    private readonly overrides: Partial<RenderMeasurements> = {},
  ) {}
  public async inspect(
    input: Parameters<RenderInspector["inspect"]>[0],
  ): Promise<RenderInspection> {
    this.calls += 1;
    const contactSheet = await Promise.all(
      [0.05, 0.35, 0.65, 0.95].map(async (position, index) => {
        const path = join(input.workingDirectory, `contact-${index + 1}.png`);
        await writeFile(path, Uint8Array.from([137, 80, 78, 71, index]));
        return {
          atMs: Math.round(position * 180_000),
          height: 270,
          path,
          position,
          width: 480,
        };
      }),
    );
    return {
      checksumSha256: createHash("sha256")
        .update(await readFile(input.videoPath))
        .digest("hex"),
      contactSheet,
      measurements: {
        blackSpans: [],
        durationMs: 180_000,
        integratedLufs: -16,
        peakDbfs: -3,
        silenceSpans: [],
        streams: {
          audioCodec: "aac",
          audioCount: 1,
          fps: 30,
          height: 1080,
          videoCodec: "h264",
          videoCount: 1,
          width: 1920,
        },
        ...this.overrides,
      },
    };
  }
}

/** The fake engine's bytes, as a stored render would return them. */
const downloader: DownloadArtifact = async (input) => {
  await writeFile(input.localPath, "verified-fake-mp4");
};

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
  it("returns a specific terminal recovery result for an unavailable historical release without rendering", async () => {
    const engine = new FakeRenderEngine();
    const handler = createRenderJobHandler({
      engine,
      storage: new MemoryStorage(),
      uploadArtifact: uploader(new MemoryStorage()),
      usageMeter: new MemoryUsageMeter(),
    });

    await expect(
      handler.handler(
        { ...payload, rendererVersion: "st-024-remotion-4.0.507" },
        context([]),
      ),
    ).rejects.toMatchObject({ code: "RENDER_IMPLEMENTATION_UNAVAILABLE" });
    expect(engine.renderCalls).toBe(0);
  });

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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
    // ST-103: the four private review frames are stored before the video,
    // because the review runs before upload.
    expect([...storage.objects.keys()]).toEqual([
      expect.stringMatching(/\/review\/contact-1\.png$/),
      expect.stringMatching(/\/review\/contact-2\.png$/),
      expect.stringMatching(/\/review\/contact-3\.png$/),
      expect.stringMatching(/\/review\/contact-4\.png$/),
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
    expect(progress).toEqual([0.45, 0.9, 0.92, 0.95]);
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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
    // Video, thumbnail and the review's four frames; the duplicate delivery
    // re-reviewed and overwrote the same frame keys rather than adding more.
    expect(storage.objects.size).toBe(6);
    expect(usageMeter.measurements.size).toBe(1);
  });

  it("deletes promoted output when cancellation wins the lifecycle race", async () => {
    const storage = new MemoryStorage();
    const usageMeter = new MemoryUsageMeter();
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      lifecycle: { complete: async () => false },
      storage,
      uploadArtifact: uploader(storage),
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
      usageMeter,
    });

    let failure: unknown;
    try {
      await handler.handler(payload, context([]));
    } catch (error) {
      failure = error;
    }
    expect(classifyJobError(failure)).toMatchObject({
      classification: "cancelled",
      code: "RENDER_CANCELLED",
    });
    // The promoted video and thumbnail are removed. The review frames stay:
    // they belong to the persisted review report for this render.
    expect(
      [...storage.objects.keys()].every((key) =>
        /\/review\/contact-\d\.png$/.test(key),
      ),
    ).toBe(true);
    expect(storage.objects.size).toBe(4);
    expect([...usageMeter.measurements.values()]).toEqual([
      expect.objectContaining({ status: "succeeded", unit: "render_seconds" }),
    ]);
  });

  it("does not persist completed output when successful-render metering fails", async () => {
    const storage = new MemoryStorage();
    const complete = vi.fn(async () => true);
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      lifecycle: { complete },
      storage,
      uploadArtifact: uploader(storage),
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
      usageMeter: {
        record: async () => {
          throw new Error("Usage database is unavailable.");
        },
      },
    });

    let failure: unknown;
    try {
      await handler.handler(payload, context([]));
    } catch (error) {
      failure = error;
    }

    expect(classifyJobError(failure)).toMatchObject({
      classification: "retryable",
      code: "RENDER_USAGE_FAILED",
    });
    expect(complete).not.toHaveBeenCalled();
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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
      inspector: new PassingInspector(),
      downloadArtifact: downloader,
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
    // The video plus the review's four frames; no thumbnail.
    expect(storage.objects.size).toBe(5);
  });
});

describe("ST-103 post-render review in the worker", () => {
  function reviewLifecycle() {
    const reports: RenderReviewReport[] = [];
    const complete = vi.fn(async () => true);
    return {
      complete,
      recordReview: vi.fn(
        async (input: { report: RenderReviewReport }) => {
          reports.push(input.report);
          return true;
        },
      ),
      reports,
    };
  }

  it("fails a blocking review with RENDER_REVIEW_FAILED and never uploads the video", async () => {
    const storage = new MemoryStorage();
    const lifecycle = reviewLifecycle();
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      inspector: new PassingInspector({
        blackSpans: [{ startMs: 42_000, endMs: 44_500 }],
      }),
      downloadArtifact: downloader,
      lifecycle,
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: new MemoryUsageMeter(),
    });

    let failure: unknown;
    try {
      await handler.handler(payload, context([]));
    } catch (error) {
      failure = error;
    }

    expect(classifyJobError(failure)).toMatchObject({
      classification: "terminal",
      code: "RENDER_REVIEW_FAILED",
      details: { findingCodes: "BLACK_SEGMENT" },
    });
    // No downloadable or shareable video: nothing was uploaded and the
    // lifecycle never created a rendered_videos row.
    expect(
      [...storage.objects.keys()].some((key) => key.endsWith("lesson.mp4")),
    ).toBe(false);
    expect(lifecycle.complete).not.toHaveBeenCalled();
    // The report is still recorded, with the timestamp and a correction.
    expect(lifecycle.reports).toHaveLength(1);
    expect(lifecycle.reports[0]).toMatchObject({
      findings: [
        expect.objectContaining({
          atMs: 42_000,
          code: "BLACK_SEGMENT",
          severity: "error",
        }),
      ],
      outcome: "failed",
      reviewVersion: "render-review-v2",
    });
    expect(lifecycle.reports[0]!.contactSheet).toHaveLength(4);
  });

  it("records warnings without blocking delivery", async () => {
    const storage = new MemoryStorage();
    const lifecycle = reviewLifecycle();
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      inspector: new PassingInspector({ integratedLufs: -24, peakDbfs: 0 }),
      downloadArtifact: downloader,
      lifecycle,
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: new MemoryUsageMeter(),
    });

    await handler.handler(payload, context([]));

    expect(lifecycle.complete).toHaveBeenCalledTimes(1);
    expect(lifecycle.reports[0]).toMatchObject({
      loudness: { integratedLufs: -24, peakDbfs: 0 },
      outcome: "passed",
    });
    expect(
      lifecycle.reports[0]!.findings.map((finding) => finding.code).sort(),
    ).toEqual(["AUDIO_CLIPPING", "LOUDNESS_OUT_OF_RANGE"]);
  });

  it("re-runs the review for a retried job and upserts the same render's report", async () => {
    const storage = new MemoryStorage();
    const lifecycle = reviewLifecycle();
    const inspector = new PassingInspector();
    let usageAttempts = 0;
    const handler = createRenderJobHandler({
      engine: new FakeRenderEngine(),
      inspector,
      downloadArtifact: downloader,
      lifecycle,
      storage,
      uploadArtifact: uploader(storage),
      usageMeter: {
        record: async (measurement) => {
          if (measurement.status === "succeeded" && usageAttempts++ === 0)
            throw new Error("Usage store briefly unavailable.");
          return { id: createId() };
        },
      },
    });
    const first = context([]);

    await expect(handler.handler(payload, first)).rejects.toMatchObject({
      code: "RENDER_USAGE_FAILED",
    });
    const retried = { ...first, attempt: 2 };
    const result = renderJobResultSchema.parse(
      await handler.handler(payload, retried),
    );

    expect(result.reused).toBe(true);
    expect(inspector.calls).toBe(2);
    expect(lifecycle.recordReview).toHaveBeenCalledTimes(2);
    expect(lifecycle.reports.map((report) => report.jobId)).toEqual([
      first.jobId,
      first.jobId,
    ]);
    expect(lifecycle.reports.map((report) => report.attempt)).toEqual([1, 2]);
    // Re-review wrote the same four frame keys; nothing accumulated.
    expect(
      [...storage.objects.keys()].filter((key) => key.includes("/review/")),
    ).toHaveLength(4);
  });

  describe("a pinned sound bed", () => {
    const soundBed = {
      trackId: "morning-pad",
      checksumSha256: "d".repeat(64),
      storageKey: `catalog/sound-beds/morning-pad/${"d".repeat(64)}.wav`,
      contentType: "audio/wav" as const,
      durationMs: 16_000,
      loops: true,
      integratedLoudnessLufs: -20,
      peakDbfs: -8.4,
      licenseId: "CC0-1.0" as const,
      attributionText: null,
    };

    function productionPayload(
      deliveryContext: JobHandlerContext,
      captions: readonly (typeof photosynthesisThreeMinutePreview.captions)[number][] = photosynthesisThreeMinutePreview.captions,
    ) {
      const lesson = photosynthesisThreeMinutePreview.lesson;
      const prefix = `users/${deliveryContext.ownerUserId}/projects/${deliveryContext.projectId}`;
      const audio = lesson.scenes.map((scene) => ({
        checksumSha256: createHash("sha256").update(scene.id).digest("hex"),
        contentType: "audio/mpeg" as const,
        sceneId: scene.id,
        storageKey: `${prefix}/audio/${scene.id}/a.mp3`,
      }));
      const assetManifest = {
        assets: audio,
        schemaVersion: 1 as const,
        soundBed: {
          checksumSha256: soundBed.checksumSha256,
          contentType: soundBed.contentType,
          storageKey: soundBed.storageKey,
          trackId: soundBed.trackId,
        },
      };
      const manifest = {
        schemaVersion: 2 as const,
        soundBed,
        lessonVersionId: "019ffbf1-eeee-7000-8000-000000000045",
        lessonVersionContentHash: "b".repeat(64),
        identityPolicy: "canonical-json-v1" as const,
        validationRunId: "019ffbf1-eeee-7000-8000-000000000046",
        validationInputHash: "c".repeat(64),
        sceneLibraryVersion: "mvp-v1" as const,
        audio,
        captions,
        visualAssets: [],
        profile: payload.profile,
        snapshot: { lessonSpec: { ...lesson, projectId: deliveryContext.projectId } },
      };
      const compositionSha256 = hashJobOptions(manifest);
      const lessonSpecSha256 = hashJobOptions(manifest.snapshot.lessonSpec);
      const optionsHash = hashJobOptions({
        assetManifest,
        compositionSha256,
        lessonSpecSha256,
        profile: payload.profile,
        rendererVersion: payload.rendererVersion,
      });
      return {
        audio,
        payload: {
          assetManifest,
          compositionSha256,
          lessonSpecSha256,
          lessonVersionId: manifest.lessonVersionId,
          manifest,
          optionsHash,
          profile: payload.profile,
          rendererVersion: payload.rendererVersion,
        },
      };
    }

    class SigningStorage extends MemoryStorage {
      public readonly signedKeys: string[] = [];
      public override async createSignedDownload(
        request?: Parameters<ObjectStorage["createSignedDownload"]>[0],
      ): Promise<SignedStorageRequest> {
        if (request === undefined) throw new Error("A key is required.");
        this.signedKeys.push(request.key);
        return {
          expiresAt: new Date("2026-08-13T01:00:00.000Z"),
          method: "GET",
          object: { bucket: "private-test", key: request.key },
          requiredHeaders: {},
          url: `https://storage.example.test/${request.key}?signature=x`,
        };
      }
    }

    /** Tenant and catalog stores holding exactly the payload's media. */
    function stores(production: ReturnType<typeof productionPayload>) {
      const storage = new SigningStorage();
      const catalog = new SigningStorage();
      catalog.objects.set(storageKeySchema.parse(soundBed.storageKey), {
        checksumSha256: soundBed.checksumSha256,
        contentType: "audio/wav",
        etag: "bed",
        lastModified: new Date("2026-08-13T00:00:00.000Z"),
        metadata: {},
        object: { bucket: "private-test", key: soundBed.storageKey },
        sizeBytes: 768_044,
      });
      for (const entry of production.audio)
        storage.put({
          bytes: Buffer.from(entry.sceneId),
          contentType: entry.contentType,
          key: storageKeySchema.parse(entry.storageKey),
          metadata: {},
        });
      return { catalog, storage };
    }

    async function attempt(catalog: MemoryStorage | undefined) {
      const storage = new MemoryStorage();
      const engine = new FakeRenderEngine();
      const deliveryContext = context([]);
      const production = productionPayload(deliveryContext);
      for (const entry of production.audio)
        storage.put({
          bytes: Buffer.from(entry.sceneId),
          contentType: entry.contentType,
          key: storageKeySchema.parse(entry.storageKey),
          metadata: {},
        });
      const handler = createRenderJobHandler({
        ...(catalog === undefined ? {} : { catalogStorage: catalog }),
        engine,
        inspector: new PassingInspector(),
        downloadArtifact: downloader,
        storage,
        uploadArtifact: uploader(storage),
        usageMeter: new MemoryUsageMeter(),
      });
      let failure: unknown;
      try {
        await handler.handler(production.payload, deliveryContext);
      } catch (error) {
        failure = error;
      }
      return { engine, failure };
    }

    it("uploads and completes a production video with narration pauses, including on retry", async () => {
      const deliveryContext = context([]);
      const production = productionPayload(deliveryContext);
      const { catalog, storage } = stores(production);
      const lifecycle = reviewLifecycle();
      const engine = new FakeRenderEngine();
      const handler = createRenderJobHandler({
        catalogStorage: catalog,
        engine,
        inspector: new PassingInspector({
          silenceSpans: [{ startMs: 5_000, endMs: 8_000 }],
          integratedLufs: -27.53,
        }),
        downloadArtifact: downloader,
        lifecycle,
        storage,
        uploadArtifact: uploader(storage),
        usageMeter: new MemoryUsageMeter(),
      });
      await handler.handler(production.payload, deliveryContext);
      await handler.handler(production.payload, deliveryContext);
      expect(lifecycle.complete).toHaveBeenCalledTimes(2);
      expect(lifecycle.reports).toHaveLength(2);
      for (const report of lifecycle.reports) {
        expect(report.outcome).toBe("passed");
        expect(report.reviewVersion).toBe("render-review-v2");
        expect(report.findings).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: "NARRATION_SILENT", severity: "warning", atMs: 5_000 }),
        ]));
        expect(report.findings.some((item) => item.severity === "error")).toBe(false);
      }
      expect([...storage.objects.keys()].filter((key) => key.endsWith("lesson.mp4"))).toHaveLength(1);
    });

    it.each([
      {
        name: "a black gap",
        code: "BLACK_SEGMENT",
        overrides: { blackSpans: [{ startMs: 40_000, endMs: 41_500 }] },
        dropSceneCaptions: false,
      },
      {
        name: "a missing caption track",
        code: "CAPTION_TRACK_MISSING",
        overrides: {},
        dropSceneCaptions: true,
      },
    ])(
      "fails $name with RENDER_REVIEW_FAILED and leaves no downloadable video",
      async ({ code, overrides, dropSceneCaptions }) => {
        const deliveryContext = context([]);
        const firstSceneId = photosynthesisThreeMinutePreview.lesson.scenes[0]!.id;
        const production = productionPayload(
          deliveryContext,
          dropSceneCaptions
            ? photosynthesisThreeMinutePreview.captions.filter(
                (cue) => cue.sceneId !== firstSceneId,
              )
            : photosynthesisThreeMinutePreview.captions,
        );
        const { catalog, storage } = stores(production);
        const reports: RenderReviewReport[] = [];
        const complete = vi.fn(async () => true);
        const handler = createRenderJobHandler({
          catalogStorage: catalog,
          engine: new FakeRenderEngine(),
          inspector: new PassingInspector(overrides),
          downloadArtifact: downloader,
          lifecycle: {
            complete,
            recordReview: async (input) => {
              reports.push(input.report);
              return true;
            },
          },
          storage,
          uploadArtifact: uploader(storage),
          usageMeter: new MemoryUsageMeter(),
        });
        let failure: unknown;
        try {
          await handler.handler(production.payload, deliveryContext);
        } catch (error) {
          failure = error;
        }
        expect(classifyJobError(failure)).toMatchObject({
          classification: "terminal",
          code: "RENDER_REVIEW_FAILED",
        });
        expect(
          String(
            (classifyJobError(failure) as { details?: { findingCodes?: string } })
              .details?.findingCodes,
          ).split(","),
        ).toContain(code);
        expect(complete).not.toHaveBeenCalled();
        expect(
          [...storage.objects.keys()].some((key) => key.endsWith("lesson.mp4")),
        ).toBe(false);
        expect(reports).toHaveLength(1);
        expect(reports[0]!.outcome).toBe("failed");
        expect(
          reports[0]!.findings.find((finding) => finding.code === code),
        ).toMatchObject({ severity: "error" });
      },
    );

    it("renders a verified pinned bed from a catalog-signed URL with frame-accurate looping", async () => {
      const deliveryContext = context([]);
      const production = productionPayload(deliveryContext);
      const { catalog, storage } = stores(production);
      const engine = new FakeRenderEngine();
      const rendered: Array<Parameters<RenderEngine["renderVideo"]>[0]> = [];
      const renderVideo = engine.renderVideo.bind(engine);
      engine.renderVideo = async (request) => {
        rendered.push(request);
        return renderVideo(request);
      };
      const handler = createRenderJobHandler({
        catalogStorage: catalog,
        engine,
        inspector: new PassingInspector(),
        downloadArtifact: downloader,
        storage,
        uploadArtifact: uploader(storage),
        usageMeter: new MemoryUsageMeter(),
      });

      await handler.handler(production.payload, deliveryContext);

      expect(rendered).toHaveLength(1);
      expect(rendered[0]!.composition.soundBed).toEqual({
        durationInFrames: 480,
        loops: true,
        src: `https://storage.example.test/${soundBed.storageKey}?signature=x`,
        trackId: "morning-pad",
      });
      // The bed was signed by the catalog store only; tenant storage never
      // saw a catalog key.
      expect(catalog.signedKeys).toEqual([soundBed.storageKey]);
      expect(
        storage.signedKeys.some((key) => key.startsWith("catalog/")),
      ).toBe(false);
    });

    it("fails explicitly when the track is missing from the catalog store", async () => {
      const { engine, failure } = await attempt(new MemoryStorage());
      expect(classifyJobError(failure)).toMatchObject({
        classification: "terminal",
        code: "SOUND_BED_UNAVAILABLE",
      });
      expect(engine.renderCalls).toBe(0);
    });

    it("fails explicitly when no catalog store is configured", async () => {
      const { engine, failure } = await attempt(undefined);
      expect(classifyJobError(failure)).toMatchObject({
        code: "SOUND_BED_UNAVAILABLE",
      });
      expect(engine.renderCalls).toBe(0);
    });

    it("fails explicitly when the stored track's checksum does not match", async () => {
      const catalog = new MemoryStorage();
      catalog.put({
        bytes: Buffer.from("different bytes"),
        contentType: "audio/wav",
        key: storageKeySchema.parse(soundBed.storageKey),
        metadata: {},
      });
      const { engine, failure } = await attempt(catalog);
      expect(classifyJobError(failure)).toMatchObject({
        classification: "terminal",
        code: "SOUND_BED_CHECKSUM_MISMATCH",
      });
      expect(engine.renderCalls).toBe(0);
    });
  });
});
