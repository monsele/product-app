import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  JobExecutionError,
  defineJobHandler,
  type JobHandlerContext,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import type { StructuredLogger } from "@avlp/observability";
import type { UsageMeter } from "@avlp/observability";
import {
  storageKeySchema,
  storageKeys,
  type ObjectStorage,
  type StorageKey,
  type StorageObjectMetadata,
} from "@avlp/storage";
import {
  renderJobPayloadSchema,
  renderJobResultSchema,
  renderedVideoMetadataSchema,
  renderJobType,
  renderPayloadVersion,
  assertProductionManifestIntegrity,
  isSupportedRenderImplementation,
  type RenderJobPayload,
  type RenderJobResult,
  type RenderedVideoMetadata,
  type ThumbnailResult,
} from "./contracts.js";
import {
  hydrateDemonstrationComposition,
  hydrateProductionComposition,
  loadImmutableFixture,
} from "./fixture.js";
import {
  readVideoApproach,
  renderReviewReportSchema,
  soundBedCatalogPrefix,
  type RenderReviewReport,
} from "@avlp/schemas";
import { demonstrationVariantPlanSchema } from "@avlp/schemas/demonstration-pilot";
import { getLessonDurationInFrames } from "@avlp/scene-library";
import { demonstrationDurationInFrames } from "@avlp/scene-library/demonstration-proof";
import {
  classifyRenderReview,
  FfmpegRenderInspector,
  narrationSpansFromCaptions,
  silenceFloorDb,
  type RenderInspector,
  type RenderReviewExpectations,
} from "./render-review.js";
import { renderReviewVersion } from "./render-review-thresholds.js";
import {
  RemotionRenderEngine,
  RenderMediaError,
  type RenderEngine,
} from "./media.js";

export type UploadedArtifact = {
  checksumSha256: string;
  sizeBytes: number;
};

export type UploadArtifact = (input: {
  contentType: string;
  localPath: string;
  metadata: Readonly<Record<string, string>>;
  storage: ObjectStorage;
  storageKey: StorageKey;
}) => Promise<UploadedArtifact>;

export async function uploadArtifactThroughStorage(
  input: Parameters<UploadArtifact>[0],
): Promise<UploadedArtifact> {
  const file = await stat(input.localPath);
  if (file.size === 0)
    throw new JobExecutionError(
      "terminal",
      "OUTPUT_EMPTY",
      "The rendered artifact was empty.",
    );
  const hash = createHash("sha256");
  const handle = await open(input.localPath, "r");
  try {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    while (position < file.size) {
      const { bytesRead } = await handle.read(
        buffer,
        0,
        Math.min(buffer.byteLength, file.size - position),
        position,
      );
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    if (position !== file.size)
      throw new Error("The rendered artifact changed while being hashed.");
  } finally {
    await handle.close();
  }
  const checksumSha256 = hash.digest("hex");
  const signed = await input.storage.createSignedUpload({
    checksumSha256,
    contentLength: file.size,
    contentType: input.contentType,
    key: input.storageKey,
    metadata: input.metadata,
  });
  const request: RequestInit & { duplex: "half" } = {
    body: Readable.toWeb(
      createReadStream(input.localPath),
    ) as unknown as BodyInit,
    duplex: "half",
    headers: signed.requiredHeaders,
    method: signed.method,
  };
  const response = await fetch(signed.url, request);
  if (!response.ok)
    throw new Error(`Private storage rejected upload with ${response.status}.`);
  const stored = await input.storage.getMetadata(input.storageKey);
  if (
    stored.sizeBytes !== file.size ||
    stored.checksumSha256 !== checksumSha256
  )
    throw new Error("Private storage did not verify the uploaded artifact.");
  return { checksumSha256, sizeBytes: file.size };
}

/** ST-103. Fetches a stored render back to local disk for re-review. */
export type DownloadArtifact = (input: {
  checksumSha256: string;
  localPath: string;
  storage: ObjectStorage;
  storageKey: StorageKey;
}) => Promise<void>;

export async function downloadArtifactThroughStorage(
  input: Parameters<DownloadArtifact>[0],
): Promise<void> {
  const signed = await input.storage.createSignedDownload({
    key: input.storageKey,
    expiresInSeconds: 900,
  });
  const response = await fetch(signed.url);
  if (!response.ok || response.body === null)
    throw new Error(`Private storage rejected download with ${response.status}.`);
  const hash = createHash("sha256");
  const body = Readable.fromWeb(
    response.body as Parameters<typeof Readable.fromWeb>[0],
  );
  body.on("data", (chunk: Buffer) => hash.update(chunk));
  await pipeline(body, createWriteStream(input.localPath));
  if (hash.digest("hex") !== input.checksumSha256)
    throw new Error("The stored render failed integrity verification.");
}

function numberMetadata(metadata: StorageObjectMetadata, key: string): number {
  return Number(metadata.metadata[key]);
}

async function reusableVideo(
  storage: ObjectStorage,
  storageKey: StorageKey,
  payload: RenderJobPayload,
): Promise<RenderedVideoMetadata | undefined> {
  if (!(await storage.exists(storageKey))) return undefined;
  const stored = await storage.getMetadata(storageKey);
  if (!artifactIdentityMatches(stored, payload)) return undefined;
  return renderedVideoMetadataSchema.safeParse({
    audioCodec: stored.metadata["audio-codec"],
    checksumSha256: stored.checksumSha256,
    durationMs: numberMetadata(stored, "duration-ms"),
    fps: numberMetadata(stored, "fps"),
    height: numberMetadata(stored, "height"),
    sizeBytes: stored.sizeBytes,
    storageKey,
    videoCodec: stored.metadata["video-codec"],
    width: numberMetadata(stored, "width"),
  }).data;
}

async function reusableThumbnail(
  storage: ObjectStorage,
  storageKey: StorageKey,
  payload: RenderJobPayload,
): Promise<ThumbnailResult | undefined> {
  if (!(await storage.exists(storageKey))) return undefined;
  const stored = await storage.getMetadata(storageKey);
  if (!artifactIdentityMatches(stored, payload)) return undefined;
  const parsed = renderJobResultSchema.shape.thumbnail.safeParse({
    metadata: {
      checksumSha256: stored.checksumSha256,
      height: numberMetadata(stored, "height"),
      sizeBytes: stored.sizeBytes,
      storageKey,
      timestampMs: numberMetadata(stored, "timestamp-ms"),
      width: numberMetadata(stored, "width"),
    },
    status: "succeeded",
  });
  return parsed.success ? parsed.data : undefined;
}

function artifactIdentityMetadata(
  payload: RenderJobPayload,
): Readonly<Record<string, string>> {
  return {
    "composition-sha256": payload.compositionSha256,
    "render-options-hash": payload.optionsHash,
    "renderer-version": payload.rendererVersion,
  };
}

function artifactIdentityMatches(
  stored: StorageObjectMetadata,
  payload: RenderJobPayload,
): boolean {
  return Object.entries(artifactIdentityMetadata(payload)).every(
    ([key, value]) => stored.metadata[key] === value,
  );
}

async function verifyManifest(
  payload: RenderJobPayload,
  context: JobHandlerContext,
  storage: ObjectStorage,
  composition: ReturnType<typeof loadImmutableFixture>,
): Promise<void> {
  const tenantPrefix = storageKeys.projectPrefix({
    projectId: context.projectId,
    userId: context.ownerUserId,
  });
  const sceneIds = new Set(composition.lesson.scenes.map((scene) => scene.id));
  for (const asset of payload.assetManifest.assets) {
    if (!sceneIds.has(asset.sceneId))
      throw new JobExecutionError(
        "terminal",
        "ASSET_SCENE_MISMATCH",
        "A render asset does not belong to the immutable lesson.",
      );
    if (!asset.storageKey.startsWith(`${tenantPrefix}/`))
      throw new JobExecutionError(
        "terminal",
        "ASSET_TENANT_MISMATCH",
        "A render asset is outside the job tenant.",
      );
    if (!(await storage.exists(asset.storageKey)))
      throw new JobExecutionError(
        "terminal",
        "ASSET_MISSING",
        "A required render asset is missing.",
      );
    const metadata = await storage.getMetadata(asset.storageKey);
    if (metadata.checksumSha256 !== asset.checksumSha256)
      throw new JobExecutionError(
        "terminal",
        "ASSET_CHECKSUM_MISMATCH",
        "A required render asset failed integrity verification.",
      );
  }
}

/**
 * ST-096 — the same ownership and integrity checks, for a variant's own media.
 *
 * A demonstration variant's artwork is not bound to the lesson spec, so it does
 * not appear in the shared asset manifest and would otherwise reach the browser
 * unverified. This applies the identical three checks the standard path
 * applies — inside the job's tenant prefix, present, and matching its recorded
 * checksum — because a manifest checksum is not permission to read media
 * (CR-02), and a swapped asset must fail the render rather than change the
 * picture.
 */
async function verifyDemonstrationAssets(
  payload: RenderJobPayload,
  context: JobHandlerContext,
  storage: ObjectStorage,
): Promise<void> {
  const plan = payload.manifest?.demonstration;
  if (plan === undefined) return;
  const parsed = demonstrationVariantPlanSchema.parse(plan);
  const tenantPrefix = storageKeys.projectPrefix({
    projectId: context.projectId,
    userId: context.ownerUserId,
  });
  for (const asset of parsed.assets) {
    const key = storageKeySchema.parse(asset.storageKey);
    if (!key.startsWith(`${tenantPrefix}/`))
      throw new JobExecutionError(
        "terminal",
        "ASSET_TENANT_MISMATCH",
        "A demonstration asset is outside the job tenant.",
      );
    if (!(await storage.exists(key)))
      throw new JobExecutionError(
        "terminal",
        "ASSET_MISSING",
        "A required demonstration asset is missing.",
      );
    const metadata = await storage.getMetadata(key);
    if (metadata.checksumSha256 !== asset.checksumSha256)
      throw new JobExecutionError(
        "terminal",
        "ASSET_CHECKSUM_MISMATCH",
        "A required demonstration asset failed integrity verification.",
      );
  }
}

/**
 * ST-103 - the pinned background track must exist in the catalog store with
 * its pinned checksum. There is no fallback to "no bed": a missing or changed
 * track fails the render explicitly.
 */
async function verifySoundBed(
  payload: RenderJobPayload,
  catalogStorage: RenderHandlerOptions["catalogStorage"],
): Promise<void> {
  const bed = payload.manifest?.soundBed ?? null;
  if (bed === null) return;
  if (!bed.storageKey.startsWith(`${soundBedCatalogPrefix}/${bed.trackId}/`))
    throw new JobExecutionError(
      "terminal",
      "SOUND_BED_UNAVAILABLE",
      "The pinned sound bed is not a catalog track.",
    );
  const key = storageKeySchema.parse(bed.storageKey);
  if (catalogStorage === undefined || !(await catalogStorage.exists(key)))
    throw new JobExecutionError(
      "terminal",
      "SOUND_BED_UNAVAILABLE",
      "The pinned sound bed is missing from the catalog store.",
    );
  const metadata = await catalogStorage.getMetadata(key);
  if (metadata.checksumSha256 !== bed.checksumSha256)
    throw new JobExecutionError(
      "terminal",
      "SOUND_BED_CHECKSUM_MISMATCH",
      "The pinned sound bed failed integrity verification.",
    );
}

export type RenderHandlerOptions = {
  browserExecutable?: string;
  /** ST-103. Read-only access to the platform sound-bed catalog prefix. */
  catalogStorage?: Pick<
    ObjectStorage,
    "createSignedDownload" | "exists" | "getMetadata"
  >;
  downloadArtifact?: DownloadArtifact;
  engine?: RenderEngine;
  /** ST-103. Post-render review measurements (ffprobe/ffmpeg by default). */
  inspector?: RenderInspector;
  logger?: Pick<StructuredLogger, "info" | "warn">;
  storage: ObjectStorage;
  temporaryRoot?: string;
  timeoutMs?: number;
  uploadArtifact?: UploadArtifact;
  usageMeter: UsageMeter;
  lifecycle?: {
    complete(input: {
      context: JobHandlerContext;
      result: RenderJobResult;
    }): Promise<boolean>;
    /** ST-103. Upserts the render's single review report; `false` means the
     * job no longer holds its lease (for example, it was cancelled). */
    recordReview?(input: {
      context: JobHandlerContext;
      report: RenderReviewReport;
    }): Promise<boolean>;
  };
};

function renderUsageIdempotencyKey(
  status: "failed" | "succeeded",
  context: JobHandlerContext,
): string {
  const sourceHash = createHash("sha256")
    .update(context.idempotencyKey)
    .digest("hex");
  return `video.render.${status}:${context.jobId}:${sourceHash}`;
}

function describeRenderFailure(
  error: unknown,
  fallbackStage: string,
): {
  classification: "cancelled" | "retryable" | "terminal";
  code: string;
  errorName: string;
  stage: string;
  systemCode?: string;
} {
  const known =
    error instanceof JobExecutionError || error instanceof RenderMediaError;
  const systemCode =
    !known &&
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
      ? String(error.code).slice(0, 100)
      : undefined;
  return {
    classification: known ? error.classification : "retryable",
    code: known ? error.code : "UNEXPECTED_RENDER_FAILURE",
    errorName:
      error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
    stage: fallbackStage,
    ...(systemCode === undefined ? {} : { systemCode }),
    ...(error instanceof RenderMediaError ? error.diagnostic : {}),
  };
}

function logRenderFailure(
  options: RenderHandlerOptions,
  context: JobHandlerContext,
  error: unknown,
  fallbackStage: string,
): ReturnType<typeof describeRenderFailure> {
  const failure = describeRenderFailure(error, fallbackStage);
  options.logger?.warn("render.failed", {
    ...failure,
    correlationId: context.correlationId,
    jobId: context.jobId,
    projectId: context.projectId,
  });
  return failure;
}

async function generateThumbnail(input: {
  browserExecutable?: string;
  composition: ReturnType<typeof loadImmutableFixture>;
  demonstration?: Awaited<ReturnType<typeof hydrateDemonstrationComposition>>;
  engine: RenderEngine;
  identityMetadata: Readonly<Record<string, string>>;
  path: string;
  profile: RenderJobPayload["profile"];
  storage: ObjectStorage;
  storageKey: StorageKey;
  stagingStorageKey: StorageKey;
  upload: UploadArtifact;
}): Promise<ThumbnailResult> {
  const details = await input.engine.renderThumbnail({
    ...(input.browserExecutable === undefined
      ? {}
      : { browserExecutable: input.browserExecutable }),
    composition: input.composition,
    ...(input.demonstration === undefined
      ? {}
      : { demonstration: input.demonstration }),
    outputPath: input.path,
    profile: input.profile,
  });
  const uploaded = await publishVerifiedArtifact({
    contentType: "image/png",
    localPath: input.path,
    metadata: {
      height: String(details.height),
      ...input.identityMetadata,
      "timestamp-ms": String(details.timestampMs),
      width: String(details.width),
    },
    stagingStorageKey: input.stagingStorageKey,
    storage: input.storage,
    storageKey: input.storageKey,
    upload: input.upload,
  });
  return {
    metadata: {
      ...uploaded,
      height: details.height,
      storageKey: input.storageKey,
      timestampMs: details.timestampMs,
      width: details.width,
    },
    status: "succeeded",
  };
}

/** Upload to a private staging key, verify its checksum, then atomically make
 * the immutable public render key visible. Staging bytes are always cleaned. */
async function publishVerifiedArtifact(input: {
  contentType: string;
  localPath: string;
  metadata: Readonly<Record<string, string>>;
  stagingStorageKey: StorageKey;
  storage: ObjectStorage;
  storageKey: StorageKey;
  upload: UploadArtifact;
}): Promise<UploadedArtifact> {
  const uploaded = await input.upload({
    contentType: input.contentType,
    localPath: input.localPath,
    metadata: input.metadata,
    storage: input.storage,
    storageKey: input.stagingStorageKey,
  });
  try {
    const promoted = await input.storage.copy({
      sourceKey: input.stagingStorageKey,
      destinationKey: input.storageKey,
    });
    if (
      promoted.checksumSha256 !== uploaded.checksumSha256 ||
      promoted.sizeBytes !== uploaded.sizeBytes
    )
      throw new JobExecutionError(
        "retryable",
        "OUTPUT_PROMOTION_FAILED",
        "The verified output could not be promoted to its final location.",
      );
    return uploaded;
  } finally {
    await input.storage.delete(input.stagingStorageKey).catch(() => undefined);
  }
}

export function createRenderJobHandler(
  options: RenderHandlerOptions,
): RegisteredJobHandler {
  const engine = options.engine ?? new RemotionRenderEngine();
  const upload = options.uploadArtifact ?? uploadArtifactThroughStorage;
  const download = options.downloadArtifact ?? downloadArtifactThroughStorage;
  const inspector = options.inspector ?? new FfmpegRenderInspector();
  return defineJobHandler(
    renderJobType,
    renderPayloadVersion,
    renderJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      if (!isSupportedRenderImplementation(payload.rendererVersion))
        throw new JobExecutionError(
          "terminal",
          "RENDER_IMPLEMENTATION_UNAVAILABLE",
          "This historical render release is unavailable. The approved video remains available where you are authorised to access it.",
        );
      let composition: ReturnType<typeof loadImmutableFixture>;
      let demonstration:
        | Awaited<ReturnType<typeof hydrateDemonstrationComposition>>
        | undefined;
      let preflightStage = "fixture_validation";
      try {
        try {
          assertProductionManifestIntegrity(payload);
          composition = loadImmutableFixture(payload);
        } catch {
          throw new JobExecutionError(
            "terminal",
            "FIXTURE_INTEGRITY_FAILED",
            "The immutable render fixture failed integrity verification.",
          );
        }
        preflightStage = "tenant_validation";
        if (composition.lesson.projectId !== context.projectId)
          throw new JobExecutionError(
            "terminal",
            "LESSON_PROJECT_MISMATCH",
            "The immutable lesson does not belong to the render job project.",
          );
        preflightStage = "storage_privacy_validation";
        await options.storage.assertPrivateBucket();
        preflightStage = "asset_manifest_validation";
        await verifyManifest(payload, context, options.storage, composition);
        preflightStage = "demonstration_asset_validation";
        await verifyDemonstrationAssets(payload, context, options.storage);
        preflightStage = "sound_bed_validation";
        await verifySoundBed(payload, options.catalogStorage);
        preflightStage = "media_manifest_resolution";
        composition = await hydrateProductionComposition(
          payload,
          composition,
          options.storage,
          options.catalogStorage,
        );
        // ST-096. Resolved after the standard composition, not instead of it:
        // the lesson, its tenant check and its asset verification are the same
        // for both approaches, and only the visual explanation differs.
        if (readVideoApproach(payload.manifest?.approach) === "demonstration") {
          preflightStage = "demonstration_plan_resolution";
          demonstration = await hydrateDemonstrationComposition(
            payload,
            options.storage,
          );
        }
      } catch (error) {
        logRenderFailure(options, context, error, preflightStage);
        throw error;
      }
      const videoKey = storageKeys.renderVideo({
        projectId: context.projectId,
        renderJobId: context.jobId,
        userId: context.ownerUserId,
      });
      const thumbnailKey = storageKeys.renderThumbnail({
        projectId: context.projectId,
        renderJobId: context.jobId,
        userId: context.ownerUserId,
      });
      const stagingVideoKey = storageKeys.renderStagingVideo({
        projectId: context.projectId,
        renderJobId: context.jobId,
        userId: context.ownerUserId,
      });
      const stagingThumbnailKey = storageKeys.renderStagingThumbnail({
        projectId: context.projectId,
        renderJobId: context.jobId,
        userId: context.ownerUserId,
      });
      let temporaryDirectory: string;
      try {
        temporaryDirectory = await mkdtemp(
          join(options.temporaryRoot ?? tmpdir(), "avlp-render-"),
        );
      } catch (error) {
        logRenderFailure(options, context, error, "temporary_directory");
        throw new JobExecutionError(
          "retryable",
          "RENDER_TEMPORARY_DIRECTORY_FAILED",
          "The render worker could not create isolated temporary storage.",
        );
      }
      const videoPath = join(temporaryDirectory, "lesson.mp4");
      const thumbnailPath = join(temporaryDirectory, "thumbnail.png");
      const computeStartedAt = Date.now();
      const reviewExpectations = renderReviewExpectations(
        payload,
        composition,
        demonstration,
      );
      /**
       * ST-103. Reviews the local MP4 before it can become available. Runs
       * ffmpeg with no database transaction open, stores the contact sheet
       * privately, then upserts the one report for this render. Any error
       * finding fails the render terminally; warnings never block.
       */
      const reviewRender = async (): Promise<void> => {
        const inspection = await inspector.inspect({
          silenceFloorDb: silenceFloorDb(payload.manifest?.soundBed ?? null),
          videoPath,
          workingDirectory: temporaryDirectory,
        });
        const findings = classifyRenderReview(
          inspection.measurements,
          reviewExpectations,
        );
        const contactSheet = [];
        for (const [index, frame] of inspection.contactSheet.entries()) {
          const key = storageKeys.renderReviewFrame({
            index: index + 1,
            projectId: context.projectId,
            renderJobId: context.jobId,
            userId: context.ownerUserId,
          });
          const body = await readFile(frame.path);
          const checksumSha256 = createHash("sha256")
            .update(body)
            .digest("hex");
          const stored = await options.storage.putBytes({
            body,
            contentType: "image/png",
            key,
            metadata: {
              ...artifactIdentityMetadata(payload),
              sha256: checksumSha256,
            },
          });
          if (stored.checksumSha256 !== checksumSha256)
            throw new Error("A review frame failed storage verification.");
          contactSheet.push({
            atMs: frame.atMs,
            checksumSha256,
            height: frame.height,
            position: frame.position,
            storageKey: key,
            width: frame.width,
          });
        }
        const report = renderReviewReportSchema.parse({
          attempt: context.attempt,
          contactSheet,
          durationMs: inspection.measurements.durationMs,
          findings,
          jobId: context.jobId,
          loudness: {
            integratedLufs: inspection.measurements.integratedLufs,
            peakDbfs: inspection.measurements.peakDbfs,
          },
          outcome: findings.some((item) => item.severity === "error")
            ? "failed"
            : "passed",
          reviewedAt: new Date().toISOString(),
          reviewVersion: renderReviewVersion,
          videoChecksumSha256: inspection.checksumSha256,
        });
        const recorded = await options.lifecycle?.recordReview?.({
          context,
          report,
        });
        if (recorded === false)
          throw new JobExecutionError(
            "cancelled",
            "RENDER_CANCELLED",
            "The render was cancelled before its review could be saved.",
          );
        const findingCodes = [
          ...new Set(report.findings.map((item) => item.code)),
        ].join(",");
        options.logger?.info("render.reviewed", {
          correlationId: context.correlationId,
          findingCodes,
          jobId: context.jobId,
          outcome: report.outcome,
          projectId: context.projectId,
          reviewVersion: report.reviewVersion,
        });
        if (report.outcome === "failed")
          throw new JobExecutionError(
            "terminal",
            "RENDER_REVIEW_FAILED",
            "The finished video failed its post-render review.",
            { findingCodes, reviewVersion: report.reviewVersion },
          );
        await context.reportProgress(0.92);
      };
      let stage = "artifact_reuse";
      let successfulUsageRecorded = false;
      try {
        let reused = false;
        let video = await reusableVideo(options.storage, videoKey, payload);
        if (video === undefined) {
          stage = "video_render";
          let reportedProgress = 0;
          const rendered = await engine.renderVideo({
            ...(options.browserExecutable === undefined
              ? {}
              : { browserExecutable: options.browserExecutable }),
            composition,
            ...(demonstration === undefined ? {} : { demonstration }),
            onProgress: async (progress) => {
              const nextProgress = Math.min(0.9, progress * 0.9);
              if (nextProgress < 0.9 && nextProgress - reportedProgress < 0.05)
                return;
              reportedProgress = nextProgress;
              await context.reportProgress(nextProgress);
            },
            outputPath: videoPath,
            profile: payload.profile,
          });
          // Review before upload: a failing video never reaches storage.
          stage = "render_review";
          await reviewRender();
          stage = "video_upload";
          const uploaded = await publishVerifiedArtifact({
            contentType: "video/mp4",
            localPath: videoPath,
            metadata: {
              "audio-codec": rendered.audioCodec,
              ...artifactIdentityMetadata(payload),
              "duration-ms": String(rendered.durationMs),
              fps: String(rendered.fps),
              height: String(rendered.height),
              "video-codec": rendered.videoCodec,
              width: String(rendered.width),
            },
            stagingStorageKey: stagingVideoKey,
            storage: options.storage,
            storageKey: videoKey,
            upload,
          });
          video = renderedVideoMetadataSchema.parse({
            ...rendered,
            ...uploaded,
            storageKey: videoKey,
          });
          await context.reportProgress(0.95);
        } else {
          reused = true;
          // A retried job re-runs the review against the stored bytes and
          // upserts the same render's report (ST-103 idempotency).
          stage = "render_review_download";
          await download({
            checksumSha256: video.checksumSha256,
            localPath: videoPath,
            storage: options.storage,
            storageKey: video.storageKey,
          });
          stage = "render_review";
          await reviewRender();
          await context.reportProgress(0.95);
        }

        stage = "thumbnail_reuse";
        let thumbnail = await reusableThumbnail(
          options.storage,
          thumbnailKey,
          payload,
        );
        if (thumbnail === undefined)
          try {
            stage = "thumbnail_generation";
            thumbnail = await generateThumbnail({
              ...(options.browserExecutable === undefined
                ? {}
                : { browserExecutable: options.browserExecutable }),
              composition,
              ...(demonstration === undefined ? {} : { demonstration }),
              engine,
              identityMetadata: artifactIdentityMetadata(payload),
              path: thumbnailPath,
              profile: payload.profile,
              storage: options.storage,
              storageKey: thumbnailKey,
              stagingStorageKey: stagingThumbnailKey,
              upload,
            });
          } catch (error) {
            const failure = describeRenderFailure(error, stage);
            options.logger?.warn("render.thumbnail_failed", {
              ...failure,
              correlationId: context.correlationId,
              jobId: context.jobId,
              projectId: context.projectId,
            });
            thumbnail = { code: "THUMBNAIL_FAILED", status: "failed" };
          }
        const result: RenderJobResult = renderJobResultSchema.parse({
          compositionSha256: payload.compositionSha256,
          optionsHash: payload.optionsHash,
          rendererVersion: payload.rendererVersion,
          reused,
          thumbnail,
          video,
        });
        stage = "usage_recording";
        try {
          await options.usageMeter.record({
            correlationId: context.correlationId,
            estimatedCostUsd: 0,
            idempotencyKey: renderUsageIdempotencyKey("succeeded", context),
            latencyMs: Date.now() - computeStartedAt,
            metadata: { optionsHash: payload.optionsHash },
            operationType: "video.render",
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            quantity: video.durationMs / 1_000,
            retryCount: 0,
            status: "succeeded",
            unit: "render_seconds",
          });
          successfulUsageRecorded = true;
        } catch {
          throw new JobExecutionError(
            "retryable",
            "RENDER_USAGE_FAILED",
            "The render usage record could not be persisted.",
          );
        }
        // The generic job remains the lease authority. Persist completion only
        // after metering succeeds, so a retriable metering failure cannot leave
        // completed render metadata attached to a failed generic job.
        const outputPersisted = await options.lifecycle?.complete({
          context,
          result,
        });
        if (outputPersisted === false) {
          await options.storage
            .delete(result.video.storageKey)
            .catch(() => undefined);
          if (result.thumbnail.status === "succeeded")
            await options.storage
              .delete(result.thumbnail.metadata.storageKey)
              .catch(() => undefined);
          throw new JobExecutionError(
            "cancelled",
            "RENDER_CANCELLED",
            "The render was cancelled before verified output could be saved.",
          );
        }
        options.logger?.info("render.completed", {
          correlationId: context.correlationId,
          jobId: context.jobId,
          projectId: context.projectId,
          reused,
        });
        return result;
      } catch (error) {
        const failure = logRenderFailure(options, context, error, stage);
        if (!successfulUsageRecorded)
          try {
            await options.usageMeter.record({
              correlationId: context.correlationId,
              estimatedCostUsd: 0,
              idempotencyKey: `${renderUsageIdempotencyKey("failed", context)}:${context.attempt}`,
              latencyMs: Date.now() - computeStartedAt,
              metadata: { ...failure, optionsHash: payload.optionsHash },
              operationType: "video.render",
              ownerUserId: context.ownerUserId,
              projectId: context.projectId,
              quantity: 1,
              retryCount: context.attempt - 1,
              status: "failed",
              unit: "render_attempts",
            });
          } catch {
            options.logger?.warn("render.failure_usage_failed", {
              correlationId: context.correlationId,
              jobId: context.jobId,
              projectId: context.projectId,
            });
          }
        if (error instanceof JobExecutionError) throw error;
        if (error instanceof RenderMediaError)
          throw new JobExecutionError(
            error.classification,
            error.code,
            error.message,
            error.diagnostic,
          );
        throw new JobExecutionError(
          "retryable",
          "RENDER_STORAGE_FAILED",
          "The render worker could not persist the verified output.",
        );
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
    {
      leaseDurationMs: options.timeoutMs ?? 300_000,
      maxAttempts: 3,
      retryDelayMs: 30_000,
    },
  );
}

/** ST-103. What the review holds the video to, from the props actually
 * rendered and the manifest's promises. */
export function renderReviewExpectations(
  payload: RenderJobPayload,
  composition: ReturnType<typeof loadImmutableFixture>,
  demonstration:
    | Awaited<ReturnType<typeof hydrateDemonstrationComposition>>
    | undefined,
): RenderReviewExpectations {
  const fps = payload.profile.fps;
  const renderedCaptions = demonstration?.captions ?? composition.captions;
  const narratedSceneIds = new Set(
    demonstration === undefined
      ? composition.narrationTracks
          .filter((track) => track.kind === "browser-audio")
          .map((track) => track.sceneId)
      : demonstration.narrationTracks.map((track) => track.sceneId),
  );
  const captionedSceneIds = new Set(
    renderedCaptions.map((cue) => cue.sceneId),
  );
  const durationInFrames =
    demonstration === undefined
      ? getLessonDurationInFrames(composition.lesson)
      : demonstrationDurationInFrames(demonstration.scenes);
  return {
    captions: {
      expectedCueCount:
        payload.manifest?.captions.length ?? composition.captions.length,
      narratedScenesWithoutCaptions: [...narratedSceneIds].filter(
        (sceneId) => !captionedSceneIds.has(sceneId),
      ).length,
      renderedCueCount: renderedCaptions.length,
    },
    expectedDurationMs: Math.round((durationInFrames * 1_000) / fps),
    narrationSpans: narrationSpansFromCaptions(
      renderedCaptions,
      narratedSceneIds,
      fps,
    ),
    profile: payload.profile,
  };
}

export async function temporaryDirectoryIsAbsent(
  path: string,
): Promise<boolean> {
  try {
    await stat(path);
    return false;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    );
  }
}
