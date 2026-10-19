import { createHash } from "node:crypto";
import { designSystemAssets, type DatabaseClient } from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { designSystemAssetValidationPayloadSchema } from "@avlp/schemas";
import {
  storageKeys,
  StorageObjectNotFoundError,
  type ObjectStorage,
} from "@avlp/storage";
import { resolveJobAdapter } from "@avlp/provider-adapters";
import { and, eq } from "drizzle-orm";
import type { MalwareScanner } from "./document-validation.js";
import { inspectDesignSystemAsset } from "./design-system-validation.js";

export function createDesignSystemValidationJobHandler(options: {
  database: DatabaseClient;
  storage: ObjectStorage;
  scanner: MalwareScanner;
}): RegisteredJobHandler {
  return defineJobHandler(
    "design-system.validation",
    1,
    designSystemAssetValidationPayloadSchema,
    async (payload, context) => {
      const predicate = and(
        eq(designSystemAssets.id, payload.assetId),
        eq(designSystemAssets.systemId, payload.systemId),
        eq(designSystemAssets.ownerUserId, context.ownerUserId),
        eq(designSystemAssets.projectId, context.projectId),
      );
      const [asset] = await options.database
        .select()
        .from(designSystemAssets)
        .where(predicate)
        .limit(1);
      if (!asset || asset.jobId !== context.jobId)
        throw new JobExecutionError(
          "terminal",
          "DESIGN_IMPORT_NOT_FOUND",
          "The design import is unavailable.",
        );
      if (asset.status === "active" || asset.status === "rejected")
        return { validation: asset.status };
      if (asset.status !== "pending_validation")
        throw new JobExecutionError(
          "terminal",
          "DESIGN_IMPORT_STATE",
          "The import is not queued for validation.",
        );
      const reject = async (code: string) => {
        await options.database
          .update(designSystemAssets)
          .set({
            status: "rejected",
            rejectionCode: code,
            updatedAt: new Date(),
          })
          .where(
            and(predicate, eq(designSystemAssets.status, "pending_validation")),
          );
        return { validation: "rejected", code };
      };
      const uploadKey = storageKeys.designSystemAsset({
        userId: context.ownerUserId,
        systemId: payload.systemId,
        assetId: payload.assetId,
        stage: "upload",
      });
      if (asset.uploadKey !== uploadKey) return reject("IMPORT_KEY_MISMATCH");
      let object;
      try {
        object = await options.storage.getBytes(uploadKey, 10 * 1024 * 1024);
      } catch (error) {
        if (error instanceof StorageObjectNotFoundError)
          return reject("IMPORT_MISSING");
        throw new JobExecutionError(
          "retryable",
          "IMPORT_STORAGE_UNAVAILABLE",
          "The import could not be read.",
        );
      }
      if (
        object.body.length !== asset.sizeBytes ||
        createHash("sha256").update(object.body).digest("hex") !== asset.sha256
      )
        return reject("IMPORT_CHECKSUM_MISMATCH");
      await context.heartbeat();
      let scan;
      try {
        const adapter = {
          providerId: options.scanner.providerId ?? "",
          scan: options.scanner.scan.bind(options.scanner),
        };
        scan = await resolveJobAdapter({
          jobType: "design-system.validation",
          adapterFamily: "malware-scanning",
          adapter,
        }).adapter.scan({ bytes: object.body, sha256: asset.sha256 });
      } catch {
        throw new JobExecutionError(
          "retryable",
          "IMPORT_SCAN_UNAVAILABLE",
          "The import safety check is temporarily unavailable.",
        );
      }
      if (scan.status !== "safe") return reject("IMPORT_UNSAFE");
      let inspected;
      try {
        inspected = await inspectDesignSystemAsset(
          object.body,
          asset.mediaType,
        );
      } catch {
        return reject("IMPORT_FORMAT_INVALID");
      }
      const validatedSha256 = createHash("sha256")
        .update(inspected.bytes)
        .digest("hex");
      const key = storageKeys.designSystemAsset({
        userId: context.ownerUserId,
        systemId: payload.systemId,
        assetId: payload.assetId,
        stage: "validated",
        contentHash: validatedSha256,
      });
      await context.heartbeat();
      await options.storage.putBytes({
        key,
        body: new Uint8Array(inspected.bytes),
        contentType: asset.mediaType,
      });
      // The hash of sanitized bytes, not upload metadata, is pinned into versions.
      await options.database
        .update(designSystemAssets)
        .set({
          status: "active",
          storageKey: key,
          validatedSha256,
          inspection: inspected.inspection,
          updatedAt: new Date(),
        })
        .where(
          and(predicate, eq(designSystemAssets.status, "pending_validation")),
        );
      return { validation: "active" };
    },
  );
}
