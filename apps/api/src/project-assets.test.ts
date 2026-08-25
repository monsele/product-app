import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "@avlp/database";
import sharp from "sharp";
import {
  createTeacherAssetThumbnail,
  inspectTeacherImage,
  ProjectAssetService,
} from "./project-assets.js";

describe("teacher image validation", () => {
  it("accepts supported image bytes and reports decoded dimensions", async () => {
    const bytes = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#0f0" },
    })
      .png()
      .toBuffer();
    await expect(
      inspectTeacherImage({ bytes, mediaType: "image/png" }),
    ).resolves.toEqual({ width: 40, height: 20, mediaType: "image/png" });
  });

  it("rejects a spoofed media type from decoded image bytes", async () => {
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#00f" },
    })
      .png()
      .toBuffer();
    await expect(
      inspectTeacherImage({ bytes, mediaType: "image/jpeg" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("rejects unsafe SVG and extreme aspect ratios", async () => {
    await expect(
      inspectTeacherImage({
        bytes: new TextEncoder().encode("<svg><script>alert(1)</script></svg>"),
        mediaType: "image/png",
      }),
    ).rejects.toMatchObject({ code: "validation_failed" });
    const bytes = await sharp({
      create: { width: 1600, height: 100, channels: 3, background: "#f00" },
    })
      .webp()
      .toBuffer();
    await expect(
      inspectTeacherImage({ bytes, mediaType: "image/webp" }),
    ).rejects.toMatchObject({ code: "validation_failed" });
  });

  it("writes a bounded WebP thumbnail from the decoded image", async () => {
    const original = await sharp({
      create: { width: 1200, height: 600, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();
    const thumbnail = await createTeacherAssetThumbnail(original);
    await expect(sharp(thumbnail).metadata()).resolves.toMatchObject({
      format: "webp",
      width: 512,
      height: 256,
    });
  });

  it("returns a terminal rejected result when completion is retried", async () => {
    const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
    const projectId = "019ffbf1-ffff-7000-8000-000000000001";
    const assetId = "019ffbf1-a001-7000-8000-000000000001";
    const sessionId = "019ffbf1-a002-7000-8000-000000000001";
    let selectCount = 0;
    const database = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              selectCount += 1;
              if (selectCount === 1)
                return [
                  {
                    assetId,
                    completedAt: new Date("2026-08-20T10:00:00.000Z"),
                    expiresAt: new Date("2026-08-20T10:05:00.000Z"),
                  },
                ];
              return [{ id: assetId, status: "rejected", deletedAt: null }];
            },
          }),
        }),
      }),
    } as unknown as DatabaseClient;
    const service = new ProjectAssetService(database, {} as never);

    await expect(
      service.complete(ownerUserId, projectId, sessionId, {}, sessionId),
    ).resolves.toEqual({ asset: null, status: "rejected" });
  });
});
