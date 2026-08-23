import { projectAssets, type DatabaseClient } from "@avlp/database";
import {
  JobExecutionError,
  defineJobHandler,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  projectAssetCleanupJobPayloadSchema,
} from "@avlp/schemas";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, eq, isNull } from "drizzle-orm";

export const projectAssetCleanupJobType = "project-asset.cleanup";
export const projectAssetCleanupPayloadVersion = 1;

/**
 * Removes the original and every derived rendition of one retained teacher
 * upload. The tombstone and its completion timestamp remain for auditability.
 */
export function createProjectAssetCleanupJobHandler(options: {
  database: DatabaseClient;
  now?: () => Date;
  storage: Pick<ObjectStorage, "deletePrefix">;
}): RegisteredJobHandler {
  const now = options.now ?? (() => new Date());
  return defineJobHandler(
    projectAssetCleanupJobType,
    projectAssetCleanupPayloadVersion,
    projectAssetCleanupJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      const cleanupAfter = new Date(payload.cleanupAfter);
      const completedAt = now();
      if (completedAt < cleanupAfter)
        throw new JobExecutionError(
          "terminal",
          "PROJECT_ASSET_CLEANUP_NOT_DUE",
          "The image retention period has not elapsed.",
        );
      const [asset] = await options.database
        .select({
          cleanupAfter: projectAssets.cleanupAfter,
          cleanupCompletedAt: projectAssets.cleanupCompletedAt,
          deletedAt: projectAssets.deletedAt,
        })
        .from(projectAssets)
        .where(
          and(
            eq(projectAssets.id, payload.assetId),
            eq(projectAssets.ownerUserId, context.ownerUserId),
            eq(projectAssets.projectId, context.projectId),
          ),
        )
        .limit(1);
      if (asset === undefined)
        return { cleanup: "asset_missing", deletedObjectCount: 0 };
      if (asset.deletedAt === null || asset.cleanupAfter === null)
        throw new JobExecutionError(
          "terminal",
          "PROJECT_ASSET_CLEANUP_NOT_DELETED",
          "Only retained deleted images can be cleaned up.",
        );
      if (
        asset.deletedAt.toISOString() !== payload.deletedAt ||
        asset.cleanupAfter.toISOString() !== payload.cleanupAfter
      )
        throw new JobExecutionError(
          "terminal",
          "PROJECT_ASSET_CLEANUP_RETENTION_MISMATCH",
          "The cleanup payload does not match the retained image state.",
        );
      if (asset.cleanupCompletedAt !== null)
        return { cleanup: "already_completed", deletedObjectCount: 0 };

      const prefix = storageKeys.assetPrefix({
        assetId: payload.assetId,
        projectId: context.projectId,
        userId: context.ownerUserId,
      });
      const deletedObjectCount = await options.storage.deletePrefix(prefix);
      await options.database
        .update(projectAssets)
        .set({ cleanupCompletedAt: completedAt, updatedAt: completedAt })
        .where(
          and(
            eq(projectAssets.id, payload.assetId),
            eq(projectAssets.ownerUserId, context.ownerUserId),
            eq(projectAssets.projectId, context.projectId),
            isNull(projectAssets.cleanupCompletedAt),
          ),
        );
      return { cleanup: "completed", deletedObjectCount };
    },
    { leaseDurationMs: 60_000, maxAttempts: 5, retryDelayMs: 30_000 },
  );
}
