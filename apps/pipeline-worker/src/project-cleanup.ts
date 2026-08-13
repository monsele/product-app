import type { Identifier } from "@avlp/config";
import {
  inTransaction,
  jobs,
  projects,
  type DatabaseClient,
} from "@avlp/database";
import {
  JobExecutionError,
  defineJobHandler,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  projectCleanupJobPayloadSchema,
  type ProjectCleanupJobPayload,
} from "@avlp/schemas";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, eq, isNull, ne } from "drizzle-orm";

export const projectCleanupJobType = "project.cleanup";
export const projectCleanupPayloadVersion = 1;

export type ProjectCleanupHandlerOptions = {
  database: DatabaseClient;
  now?: () => Date;
  storage: Pick<ObjectStorage, "deletePrefix">;
};

function assertPayloadMatchesDelivery(
  payload: ProjectCleanupJobPayload,
  context: {
    ownerUserId: Identifier;
    projectId: Identifier;
  },
): void {
  if (
    payload.ownerUserId !== context.ownerUserId ||
    payload.projectId !== context.projectId
  )
    throw new JobExecutionError(
      "terminal",
      "PROJECT_CLEANUP_TENANT_MISMATCH",
      "The cleanup payload does not match its project job identity.",
    );
}

/**
 * Removes project-owned operational records after the retention period while
 * preserving the project tombstone, audit trail, clone idempotency records,
 * and usage records required for traceability and billing.
 *
 * Object storage is cleaned before the database completion marker is written.
 * A worker retry can safely repeat prefix deletion if the process stops between
 * those two steps.
 */
export function createProjectCleanupJobHandler(
  options: ProjectCleanupHandlerOptions,
): RegisteredJobHandler {
  const now = options.now ?? (() => new Date());
  return defineJobHandler(
    projectCleanupJobType,
    projectCleanupPayloadVersion,
    projectCleanupJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      assertPayloadMatchesDelivery(payload, context);
      const cleanupAfter = new Date(payload.cleanupAfter);
      const completedAt = now();
      if (completedAt < cleanupAfter)
        throw new JobExecutionError(
          "terminal",
          "PROJECT_CLEANUP_NOT_DUE",
          "The project retention period has not elapsed.",
        );

      const [pending] = await options.database
        .select({
          cleanupAfter: projects.cleanupAfter,
          cleanupCompletedAt: projects.cleanupCompletedAt,
          deletedAt: projects.deletedAt,
        })
        .from(projects)
        .where(
          and(
            eq(projects.id, context.projectId),
            eq(projects.ownerUserId, context.ownerUserId),
          ),
        )
        .limit(1);
      if (pending === undefined)
        throw new JobExecutionError(
          "terminal",
          "PROJECT_CLEANUP_PROJECT_NOT_FOUND",
          "The cleanup project tombstone could not be found.",
        );
      if (pending.deletedAt === null || pending.cleanupAfter === null)
        throw new JobExecutionError(
          "terminal",
          "PROJECT_CLEANUP_NOT_DELETED",
          "Only retained deleted projects can be cleaned up.",
        );
      if (
        pending.deletedAt.toISOString() !== payload.deletedAt ||
        pending.cleanupAfter.toISOString() !== payload.cleanupAfter
      )
        throw new JobExecutionError(
          "terminal",
          "PROJECT_CLEANUP_RETENTION_MISMATCH",
          "The cleanup payload does not match the retained project state.",
        );
      if (pending.cleanupCompletedAt !== null)
        return {
          cleanup: "already_completed",
          deletedJobCount: 0,
          deletedObjectCount: 0,
        };
      const prefix = storageKeys.projectPrefix({
        projectId: context.projectId,
        userId: context.ownerUserId,
      });
      const deletedObjectCount = await options.storage.deletePrefix(prefix);

      return inTransaction(options.database, async (transaction) => {
        const [project] = await transaction
          .select({
            cleanupAfter: projects.cleanupAfter,
            cleanupCompletedAt: projects.cleanupCompletedAt,
            deletedAt: projects.deletedAt,
          })
          .from(projects)
          .where(
            and(
              eq(projects.id, context.projectId),
              eq(projects.ownerUserId, context.ownerUserId),
            ),
          )
          .for("update")
          .limit(1);
        if (project === undefined)
          throw new JobExecutionError(
            "terminal",
            "PROJECT_CLEANUP_PROJECT_NOT_FOUND",
            "The cleanup project tombstone could not be found.",
          );
        if (project.deletedAt === null || project.cleanupAfter === null)
          throw new JobExecutionError(
            "terminal",
            "PROJECT_CLEANUP_NOT_DELETED",
            "Only retained deleted projects can be cleaned up.",
          );
        if (
          project.deletedAt.toISOString() !== payload.deletedAt ||
          project.cleanupAfter.toISOString() !== payload.cleanupAfter
        )
          throw new JobExecutionError(
            "terminal",
            "PROJECT_CLEANUP_RETENTION_MISMATCH",
            "The cleanup payload does not match the retained project state.",
          );
        if (project.cleanupCompletedAt !== null)
          return {
            cleanup: "already_completed",
            deletedJobCount: 0,
            deletedObjectCount: 0,
          };

        const deletedJobs = await transaction
          .delete(jobs)
          .where(
            and(
              eq(jobs.projectId, context.projectId),
              eq(jobs.ownerUserId, context.ownerUserId),
              ne(jobs.id, context.jobId),
            ),
          )
          .returning({ id: jobs.id });
        await transaction
          .update(projects)
          .set({ cleanupCompletedAt: completedAt, updatedAt: completedAt })
          .where(
            and(
              eq(projects.id, context.projectId),
              eq(projects.ownerUserId, context.ownerUserId),
              isNull(projects.cleanupCompletedAt),
            ),
          );
        return {
          cleanup: "completed",
          deletedJobCount: deletedJobs.length,
          deletedObjectCount,
        };
      });
    },
    { leaseDurationMs: 60_000, maxAttempts: 3, retryDelayMs: 30_000 },
  );
}
