import { createId } from "@avlp/config";
import { type DatabaseClient } from "@avlp/database";
import { projectAssetCleanupJobPayloadSchema } from "@avlp/schemas";
import { storageKeys } from "@avlp/storage";
import { describe, expect, it, vi } from "vitest";
import { createProjectAssetCleanupJobHandler } from "./project-asset-cleanup-job.js";

const ownerUserId = createId(new Date("2026-08-16T10:00:00.000Z"));
const projectId = createId(new Date("2026-08-16T10:00:01.000Z"));
const assetId = createId(new Date("2026-08-16T10:00:02.000Z"));
const deletedAt = new Date("2026-07-01T10:00:00.000Z");
const cleanupAfter = new Date("2026-07-31T10:00:00.000Z");
const completedAt = new Date("2026-08-01T10:00:00.000Z");

describe("project asset cleanup job", () => {
  it("deletes only the retained asset prefix and records an idempotent tombstone", async () => {
    let cleanupCompletedAt: Date | null = null;
    const updates: Array<Record<string, unknown>> = [];
    const database = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { deletedAt, cleanupAfter, cleanupCompletedAt },
            ],
          }),
        }),
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async () => {
            updates.push(values);
            cleanupCompletedAt = completedAt;
          },
        }),
      }),
    } as unknown as DatabaseClient;
    const deletePrefix = vi.fn(async () => 2);
    const handler = createProjectAssetCleanupJobHandler({
      database,
      now: () => completedAt,
      storage: { deletePrefix },
    });
    const payload = projectAssetCleanupJobPayloadSchema.parse({
      schemaVersion: 1,
      assetId,
      deletedAt: deletedAt.toISOString(),
      cleanupAfter: cleanupAfter.toISOString(),
    });
    const context = {
      ownerUserId,
      projectId,
    };

    await expect(handler.handler(payload, context as never)).resolves.toEqual({
      cleanup: "completed",
      deletedObjectCount: 2,
    });
    expect(deletePrefix).toHaveBeenCalledWith(
      storageKeys.assetPrefix({ assetId, projectId, userId: ownerUserId }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ cleanupCompletedAt: completedAt }),
    );
    await expect(handler.handler(payload, context as never)).resolves.toEqual({
      cleanup: "already_completed",
      deletedObjectCount: 0,
    });
  });
});
