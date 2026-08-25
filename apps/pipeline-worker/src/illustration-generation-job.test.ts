import type { DatabaseClient } from "@avlp/database";
import type { JobMetadata } from "@avlp/jobs";
import { illustrationGenerationJobPayloadSchema } from "@avlp/schemas";
import { describe, expect, it, vi } from "vitest";
import { createIllustrationGenerationJobHandler } from "./illustration-generation-job.js";

const ownerUserId = "01989a3d-8e00-7000-8000-000000000001";
const projectId = "01989a3d-8e00-7000-8000-000000000002";
const candidateId = "01989a3d-8e00-7000-8000-000000000003";

async function execute(handler: ReturnType<typeof createIllustrationGenerationJobHandler>): Promise<JobMetadata> {
  return (handler as unknown as { handler: (payload: unknown, context: unknown) => Promise<JobMetadata> }).handler(
    illustrationGenerationJobPayloadSchema.parse({ schemaVersion: 1, candidateId }),
    { attempt: 1, correlationId: "01989a3d-8e00-7000-8000-000000000004", idempotencyKey: "illustration:test", jobId: "01989a3d-8e00-7000-8000-000000000005", ownerUserId, projectId },
  );
}

describe("illustration generation job", () => {
  it("rejects moderated output before private storage or asset activation", async () => {
    const updates: Array<Record<string, unknown>> = [];
    let selectCount = 0;
    const database = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => {
        selectCount += 1;
        return selectCount === 1 ? [{ id: candidateId, status: "queued", sceneId: candidateId }] : [{ sceneJson: { title: "Water", narration: "Water changes state." } }];
      } }) }) }),
      update: () => ({
        set: (value: Record<string, unknown>) => ({
          where: () => {
            updates.push(value);
            return {
              returning: async () => [{ id: candidateId }],
              then: (resolve: (value: undefined) => unknown) =>
                Promise.resolve(undefined).then(resolve),
            };
          },
        }),
      }),
      insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
      transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback(database),
    } as unknown as DatabaseClient;
    const putBytes = vi.fn();
    const handler = createIllustrationGenerationJobHandler({
      database,
      storage: { putBytes },
      provider: { providerId: "test", generate: async () => ({ providerId: "test", providerCallId: "blocked", mediaType: "image/png" as const, bytes: new Uint8Array(), width: 1, height: 1, units: 1, costUsd: 0, moderation: { status: "rejected" as const, code: "CONTENT_FILTER" } }) },
    });
    await expect(execute(handler)).resolves.toEqual({ status: "rejected", code: "CONTENT_FILTER" });
    expect(putBytes).not.toHaveBeenCalled();
    expect(updates).toContainEqual(expect.objectContaining({ moderationStatus: "rejected", status: "failed" }));
  });
});
