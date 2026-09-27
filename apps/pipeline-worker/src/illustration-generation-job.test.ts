import type { DatabaseClient } from "@avlp/database";
import type { JobMetadata } from "@avlp/jobs";
import { illustrationGenerationJobPayloadSchema } from "@avlp/schemas";
import { describe, expect, it, vi } from "vitest";
import { createIllustrationGenerationJobHandler } from "./illustration-generation-job.js";

const ownerUserId = "01989a3d-8e00-7000-8000-000000000001";
const projectId = "01989a3d-8e00-7000-8000-000000000002";
const candidateId = "01989a3d-8e00-7000-8000-000000000003";

async function execute(
  handler: ReturnType<typeof createIllustrationGenerationJobHandler>,
  payloadExtra: Record<string, unknown> = {},
): Promise<JobMetadata> {
  return (handler as unknown as { handler: (payload: unknown, context: unknown) => Promise<JobMetadata> }).handler(
    illustrationGenerationJobPayloadSchema.parse({ schemaVersion: 1, candidateId, ...payloadExtra }),
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

  it("meters a one-shot run's image call under the run's authorisation (ST-105)", async () => {
    const runId = "01989a3d-8e00-7000-8000-000000000105";
    const metered = async (payloadExtra: Record<string, unknown>) => {
      const inserted: Array<Record<string, unknown>> = [];
      let selectCount = 0;
      const database = {
        select: () => ({ from: () => ({ where: () => ({ limit: async () => {
          selectCount += 1;
          return selectCount === 1 ? [{ id: candidateId, status: "queued", sceneId: candidateId }] : [{ sceneJson: { title: "Water", narration: "Water changes state." } }];
        } }) }) }),
        update: () => ({
          set: () => ({
            where: () => ({
              returning: async () => [{ id: candidateId }],
              then: (resolve: (value: undefined) => unknown) => Promise.resolve(undefined).then(resolve),
            }),
          }),
        }),
        insert: () => ({
          values: (value: Record<string, unknown>) => {
            inserted.push(value);
            return { onConflictDoNothing: async () => undefined };
          },
        }),
        transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(database),
      } as unknown as DatabaseClient;
      const handler = createIllustrationGenerationJobHandler({
        database,
        storage: { putBytes: vi.fn() },
        provider: { providerId: "test", generate: async () => ({ providerId: "test", providerCallId: "blocked", mediaType: "image/png" as const, bytes: new Uint8Array(), width: 1, height: 1, units: 1, costUsd: 0.002, moderation: { status: "rejected" as const, code: "CONTENT_FILTER" } }) },
      });
      await execute(handler, payloadExtra);
      const usage = inserted.find((row) => row.operationType === "image.generation");
      return (usage?.metadata as { providerSelection: Record<string, unknown> } | undefined)?.providerSelection;
    };
    expect(await metered({ oneShotRunId: runId })).toMatchObject({
      selectionReason: "one_shot_run",
      oneShotRunId: runId,
    });
    const configured = await metered({});
    expect(configured?.selectionReason).toBe("approved_configuration");
    expect(configured).not.toHaveProperty("oneShotRunId");
  });
});
