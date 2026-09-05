import type { DatabaseClient } from "@avlp/database";
import { JobExecutionError, type JobMetadata } from "@avlp/jobs";
import { projectAssetValidationJobPayloadSchema } from "@avlp/schemas";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { createProjectAssetValidationJobHandler } from "./project-asset-validation-job.js";

const ownerUserId = "01989a3d-8e00-7000-8000-000000000001";
const projectId = "01989a3d-8e00-7000-8000-000000000002";
const assetId = "01989a3d-8e00-7000-8000-000000000003";

function databaseFor(
  status: "pending_validation" | "active" | "rejected" | undefined,
) {
  const updates: Array<Record<string, unknown>> = [];
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            ...(status === undefined
              ? []
              : [
                  {
                    id: assetId,
                    ownerUserId,
                    projectId,
                    status,
                    mediaType: "image/png",
                    sha256: "a".repeat(64),
                    storageKey: `users/${ownerUserId}/projects/${projectId}/assets/${assetId}/original.png`,
                  },
                ]),
          ],
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          updates.push(values);
        },
      }),
    }),
  } as unknown as DatabaseClient;
  return { database, updates };
}

async function execute(
  handler: ReturnType<typeof createProjectAssetValidationJobHandler>,
): Promise<JobMetadata> {
  return (
    handler as unknown as {
      handler: (payload: unknown, context: unknown) => Promise<JobMetadata>;
    }
  ).handler(
    projectAssetValidationJobPayloadSchema.parse({ schemaVersion: 1, assetId }),
    {
      attempt: 1,
      correlationId: "01989a3d-8e00-7000-8000-000000000004",
      idempotencyKey: "asset-validation:test",
      jobId: "01989a3d-8e00-7000-8000-000000000005",
      ownerUserId,
      projectId,
    },
  );
}

describe("project asset validation job", () => {
  it("does not inspect an asset deleted before validation begins", async () => {
    const { database } = databaseFor(undefined);
    const getBytes = vi.fn();
    const handler = createProjectAssetValidationJobHandler({
      database,
      storage: { getBytes, putBytes: vi.fn() },
      scanner: {
        providerId: "fixture-scanner",
        scan: async () => ({ status: "safe" }),
      },
    });

    await expect(execute(handler)).rejects.toMatchObject({
      classification: "terminal",
      code: "PROJECT_ASSET_NOT_FOUND",
    } satisfies Partial<JobExecutionError>);
    expect(getBytes).not.toHaveBeenCalled();
  });

  it("activates a safe, valid image and writes a WebP thumbnail", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#4477aa" },
    })
      .png()
      .toBuffer();
    const { database, updates } = databaseFor("pending_validation");
    const putBytes = vi.fn(async () => ({}) as never);
    const handler = createProjectAssetValidationJobHandler({
      database,
      storage: {
        getBytes: async () => ({
          body: new Uint8Array(bytes),
          metadata: {} as never,
        }),
        putBytes,
      },
      scanner: {
        providerId: "fixture-scanner",
        scan: async () => ({ status: "safe" }),
      },
    });

    await expect(execute(handler)).resolves.toMatchObject({
      validation: "active",
      width: 40,
      height: 20,
    });
    expect(putBytes).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/webp" }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "active", width: 40, height: 20 }),
    );
  });

  it("rejects unsafe images without producing a preview", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#4477aa" },
    })
      .png()
      .toBuffer();
    const { database, updates } = databaseFor("pending_validation");
    const putBytes = vi.fn(async () => ({}) as never);
    const handler = createProjectAssetValidationJobHandler({
      database,
      storage: {
        getBytes: async () => ({
          body: new Uint8Array(bytes),
          metadata: {} as never,
        }),
        putBytes,
      },
      scanner: {
        providerId: "fixture-scanner",
        scan: async () => ({ status: "unsafe" }),
      },
    });

    await expect(execute(handler)).resolves.toEqual({
      validation: "rejected",
      code: "MALWARE_DETECTED",
    });
    expect(putBytes).not.toHaveBeenCalled();
    expect(updates).toContainEqual(
      expect.objectContaining({
        status: "rejected",
        validationCode: "MALWARE_DETECTED",
      }),
    );
  });

  it("retries when the malware scanner is unavailable", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#4477aa" },
    })
      .png()
      .toBuffer();
    const { database } = databaseFor("pending_validation");
    const handler = createProjectAssetValidationJobHandler({
      database,
      storage: {
        getBytes: async () => ({
          body: new Uint8Array(bytes),
          metadata: {} as never,
        }),
        putBytes: async () => ({}) as never,
      },
      scanner: {
        providerId: "fixture-scanner",
        scan: async () => {
          throw new Error("not available");
        },
      },
    });

    await expect(execute(handler)).rejects.toMatchObject({
      classification: "retryable",
      code: "MALWARE_SCAN_UNAVAILABLE",
    } satisfies Partial<JobExecutionError>);
  });
});
