import { type Identifier } from "@avlp/config";
import { projectAssets, type DatabaseClient } from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  projectAssetMediaTypeSchema,
  projectAssetValidationJobPayloadSchema,
} from "@avlp/schemas";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  ApprovedProviderUnavailableError,
  ProviderEnvelopeViolationError,
  resolveJobAdapter,
} from "@avlp/provider-adapters";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { type MalwareScanner } from "./document-validation.js";

export const projectAssetValidationJobType = "project-asset.validation";
export const projectAssetValidationPayloadVersion = 1;
const maxBytes = 10 * 1024 * 1024;
const maxPixels = 20_000_000;
const maxDimension = 8_000;
const maxAspectRatio = 8;

export function createProjectAssetValidationJobHandler(options: {
  database: DatabaseClient;
  storage: Pick<ObjectStorage, "getBytes" | "putBytes">;
  scanner: MalwareScanner;
  now?: () => Date;
}): RegisteredJobHandler {
  const now = options.now ?? (() => new Date());
  return defineJobHandler(
    projectAssetValidationJobType,
    projectAssetValidationPayloadVersion,
    projectAssetValidationJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      const [asset] = await options.database
        .select()
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.id, payload.assetId),
            eq(projectAssets.ownerUserId, context.ownerUserId),
            eq(projectAssets.projectId, context.projectId),
            isNull(projectAssets.deletedAt),
          ),
        )
        .limit(1);
      if (asset === undefined)
        throw new JobExecutionError(
          "terminal",
          "PROJECT_ASSET_NOT_FOUND",
          "The image upload was not found.",
        );
      if (asset.status === "active") return { validation: "already_valid" };
      if (asset.status === "rejected")
        return { validation: "already_rejected" };
      let object;
      try {
        object = await options.storage.getBytes(asset.storageKey, maxBytes + 1);
      } catch (error) {
        if (
          error instanceof ProviderEnvelopeViolationError ||
          error instanceof ApprovedProviderUnavailableError
        )
          await new PostgresAuditWriter(options.database).write({
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            actor: { type: "system" },
            eventType: "ai.generated",
            target: { type: "job", id: context.jobId },
            correlationId: context.correlationId,
            metadata: {
              event: "provider.envelope_violation",
              jobType: projectAssetValidationJobType,
              requestedAdapter: "malware-scanning",
              code: error.code,
            },
            occurredAt: now(),
          });
        throw new JobExecutionError(
          "retryable",
          "PROJECT_ASSET_READ_FAILED",
          "The uploaded image could not be inspected.",
        );
      }
      let metadata: { format?: string; width?: number; height?: number };
      try {
        const mediaType = projectAssetMediaTypeSchema.parse(asset.mediaType);
        metadata = await sharp(object.body, {
          limitInputPixels: maxPixels,
          animated: false,
        }).metadata();
        const format = mediaType === "image/jpeg" ? "jpeg" : mediaType.slice(6);
        if (
          metadata.format !== format ||
          metadata.width === undefined ||
          metadata.height === undefined ||
          object.body.byteLength > maxBytes ||
          metadata.width > maxDimension ||
          metadata.height > maxDimension ||
          metadata.width * metadata.height > maxPixels ||
          Math.max(
            metadata.width / metadata.height,
            metadata.height / metadata.width,
          ) > maxAspectRatio
        )
          throw new Error("IMAGE_VALIDATION_FAILED");
      } catch {
        try {
          await options.database
            .update(projectAssets)
            .set({
              status: "rejected",
              validationCode: "IMAGE_VALIDATION_FAILED",
              updatedAt: now(),
            })
            .where(
              and(
                eq(projectAssets.id, asset.id),
                eq(projectAssets.ownerUserId, context.ownerUserId),
                eq(projectAssets.projectId, context.projectId),
                isNull(projectAssets.deletedAt),
              ),
            );
        } catch {
          throw new JobExecutionError(
            "retryable",
            "PROJECT_ASSET_REJECTION_WRITE_FAILED",
            "The image validation result could not be saved.",
          );
        }
        return { validation: "rejected", code: "IMAGE_VALIDATION_FAILED" };
      }
      let scan;
      try {
        scan = await resolveJobAdapter({
          jobType: projectAssetValidationJobType,
          adapterFamily: "malware-scanning",
          adapter: options.scanner as MalwareScanner & { providerId: string },
        }).adapter.scan({
          bytes: object.body,
          sha256: asset.sha256,
        });
      } catch {
        throw new JobExecutionError(
          "retryable",
          "MALWARE_SCAN_UNAVAILABLE",
          "The image safety check is temporarily unavailable.",
        );
      }
      if (scan.status !== "safe") {
        try {
          await options.database
            .update(projectAssets)
            .set({
              status: "rejected",
              validationCode: "MALWARE_DETECTED",
              updatedAt: now(),
            })
            .where(
              and(
                eq(projectAssets.id, asset.id),
                eq(projectAssets.ownerUserId, context.ownerUserId),
                eq(projectAssets.projectId, context.projectId),
                isNull(projectAssets.deletedAt),
              ),
            );
        } catch {
          throw new JobExecutionError(
            "retryable",
            "PROJECT_ASSET_REJECTION_WRITE_FAILED",
            "The image validation result could not be saved.",
          );
        }
        return { validation: "rejected", code: "MALWARE_DETECTED" };
      }
      let thumbnail: Uint8Array;
      try {
        thumbnail = await sharp(object.body, {
          limitInputPixels: maxPixels,
          animated: false,
        })
          .rotate()
          .resize({
            width: 512,
            height: 512,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        throw new JobExecutionError(
          "retryable",
          "PROJECT_ASSET_THUMBNAIL_FAILED",
          "The image preview could not be generated.",
        );
      }
      const thumbnailKey = storageKeys.assetThumbnail({
        userId: context.ownerUserId as Identifier,
        projectId: context.projectId as Identifier,
        assetId: asset.id as Identifier,
        extension: "webp",
      });
      try {
        await options.storage.putBytes({
          key: thumbnailKey,
          body: new Uint8Array(thumbnail),
          contentType: "image/webp",
          metadata: {
            "derived-from": asset.id,
            "thumbnail-version": "1",
          },
        });
        await options.database
          .update(projectAssets)
          .set({
            status: "active",
            validationCode: null,
            width: metadata.width,
            height: metadata.height,
            thumbnailStorageKey: thumbnailKey,
            updatedAt: now(),
          })
          .where(
            and(
              eq(projectAssets.id, asset.id),
              eq(projectAssets.ownerUserId, context.ownerUserId),
              eq(projectAssets.projectId, context.projectId),
              isNull(projectAssets.deletedAt),
            ),
          );
      } catch {
        throw new JobExecutionError(
          "retryable",
          "PROJECT_ASSET_ACTIVATION_FAILED",
          "The validated image could not be activated.",
        );
      }
      return {
        validation: "active",
        width: metadata.width,
        height: metadata.height,
      };
    },
  );
}
