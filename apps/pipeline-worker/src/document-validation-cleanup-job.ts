import {
  sourceDocuments,
  type DatabaseClient,
} from "@avlp/database";
import {
  defineJobHandler,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { documentValidationCleanupJobPayloadSchema } from "@avlp/schemas";
import { type ObjectStorage } from "@avlp/storage";
import { and, eq } from "drizzle-orm";

export const documentValidationCleanupJobType = "document.validation.cleanup";
export const documentValidationCleanupPayloadVersion = 1;

export function createDocumentValidationCleanupJobHandler(options: {
  database: DatabaseClient;
  storage: Pick<ObjectStorage, "delete">;
}): RegisteredJobHandler {
  return defineJobHandler(
    documentValidationCleanupJobType,
    documentValidationCleanupPayloadVersion,
    documentValidationCleanupJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      const [document] = await options.database
        .select({ status: sourceDocuments.status, storageKey: sourceDocuments.storageKey })
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.id, payload.sourceDocumentId),
            eq(sourceDocuments.projectId, context.projectId),
            eq(sourceDocuments.ownerUserId, context.ownerUserId),
          ),
        )
        .limit(1);
      if (document === undefined) return { cleanup: "document_missing" };
      if (document.status !== "rejected") return { cleanup: "not_rejected" };

      // S3 DeleteObject is idempotent. A transient error escapes for job retry.
      await options.storage.delete(document.storageKey);
      return { cleanup: "deleted" };
    },
    { leaseDurationMs: 60_000, maxAttempts: 5, retryDelayMs: 30_000 },
  );
}
