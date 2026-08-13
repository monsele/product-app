import { createHash } from "node:crypto";
import { identifierSchema } from "@avlp/config";
import { hashJobOptions } from "@avlp/jobs";
import { fullLessonCompositionPropsSchema } from "@avlp/scene-library";
import { sha256ChecksumSchema, storageKeySchema } from "@avlp/storage";
import { z } from "zod";

export const renderJobType = "lesson.render" as const;
export const renderPayloadVersion = 1 as const;
export const manualLessonFixtureId = "photosynthesis-three-minute-v1" as const;
export const renderImplementationVersion =
  "st-024-remotion-4.0.507-scene-library-v1" as const;

export const renderProfileSchema = z
  .object({
    audioCodec: z.literal("aac"),
    fps: z.literal(30),
    height: z.literal(1080),
    pixelFormat: z.literal("yuv420p"),
    videoCodec: z.literal("h264"),
    width: z.literal(1920),
  })
  .strict();
export type RenderProfile = z.infer<typeof renderProfileSchema>;

export const hdRenderProfile = Object.freeze({
  audioCodec: "aac",
  fps: 30,
  height: 1080,
  pixelFormat: "yuv420p",
  videoCodec: "h264",
  width: 1920,
} satisfies RenderProfile);

export const renderAssetSchema = z
  .object({
    checksumSha256: sha256ChecksumSchema,
    contentType: z.enum([
      "audio/mpeg",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    sceneId: identifierSchema,
    storageKey: storageKeySchema,
  })
  .strict();

export const renderAssetManifestSchema = z
  .object({
    assets: z.array(renderAssetSchema).max(100),
    schemaVersion: z.literal(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const keys = new Set<string>();
    for (const [index, asset] of manifest.assets.entries()) {
      if (keys.has(asset.storageKey))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Render asset storage keys must be unique.",
          path: ["assets", index, "storageKey"],
        });
      keys.add(asset.storageKey);
    }
  });
export type RenderAssetManifest = z.infer<typeof renderAssetManifestSchema>;

const mutableEmptyFixtureAssetManifest = renderAssetManifestSchema.parse({
  assets: [],
  schemaVersion: 1,
});
Object.freeze(mutableEmptyFixtureAssetManifest.assets);
export const emptyFixtureAssetManifest = Object.freeze(
  mutableEmptyFixtureAssetManifest,
);

export const renderJobPayloadSchema = z
  .object({
    assetManifest: renderAssetManifestSchema,
    compositionSha256: sha256ChecksumSchema,
    fixtureId: z.literal(manualLessonFixtureId),
    lessonSpecSha256: sha256ChecksumSchema,
    optionsHash: sha256ChecksumSchema,
    profile: renderProfileSchema,
    rendererVersion: z.literal(renderImplementationVersion),
  })
  .strict();
export type RenderJobPayload = z.infer<typeof renderJobPayloadSchema>;

export const renderedVideoMetadataSchema = z
  .object({
    audioCodec: z.literal("aac"),
    checksumSha256: sha256ChecksumSchema,
    durationMs: z.number().int().positive(),
    fps: z.literal(30),
    height: z.literal(1080),
    sizeBytes: z.number().int().positive(),
    storageKey: storageKeySchema,
    videoCodec: z.literal("h264"),
    width: z.literal(1920),
  })
  .strict();
export type RenderedVideoMetadata = z.infer<typeof renderedVideoMetadataSchema>;

const thumbnailMetadataSchema = z
  .object({
    checksumSha256: sha256ChecksumSchema,
    height: z.number().int().positive(),
    sizeBytes: z.number().int().positive(),
    storageKey: storageKeySchema,
    timestampMs: z.number().int().nonnegative(),
    width: z.number().int().positive(),
  })
  .strict();

export const thumbnailResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      metadata: thumbnailMetadataSchema,
      status: z.literal("succeeded"),
    })
    .strict(),
  z
    .object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      status: z.literal("failed"),
    })
    .strict(),
]);
export type ThumbnailResult = z.infer<typeof thumbnailResultSchema>;

export const renderJobResultSchema = z
  .object({
    compositionSha256: sha256ChecksumSchema,
    optionsHash: sha256ChecksumSchema,
    rendererVersion: z.literal(renderImplementationVersion),
    reused: z.boolean(),
    thumbnail: thumbnailResultSchema,
    video: renderedVideoMetadataSchema,
  })
  .strict();
export type RenderJobResult = z.infer<typeof renderJobResultSchema>;

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createFixtureRenderPayload(input: unknown): RenderJobPayload {
  const composition = fullLessonCompositionPropsSchema.parse(input);
  const lessonSpecSha256 = sha256Json(composition.lesson);
  const compositionSha256 = sha256Json(composition);
  const optionsHash = hashJobOptions({
    assetManifest: emptyFixtureAssetManifest,
    compositionSha256,
    lessonSpecSha256,
    profile: hdRenderProfile,
    rendererVersion: renderImplementationVersion,
  });
  return renderJobPayloadSchema.parse({
    assetManifest: emptyFixtureAssetManifest,
    compositionSha256,
    fixtureId: manualLessonFixtureId,
    lessonSpecSha256,
    optionsHash,
    profile: hdRenderProfile,
    rendererVersion: renderImplementationVersion,
  });
}

export function assertFixtureIntegrity(
  payload: RenderJobPayload,
  composition: unknown,
): void {
  const parsed = fullLessonCompositionPropsSchema.parse(composition);
  if (sha256Json(parsed.lesson) !== payload.lessonSpecSha256)
    throw new Error(
      "The immutable LessonSpec fixture checksum does not match.",
    );
  if (sha256Json(parsed) !== payload.compositionSha256)
    throw new Error(
      "The immutable render composition checksum does not match.",
    );
  const expectedOptionsHash = hashJobOptions({
    assetManifest: payload.assetManifest,
    compositionSha256: payload.compositionSha256,
    lessonSpecSha256: payload.lessonSpecSha256,
    profile: payload.profile,
    rendererVersion: payload.rendererVersion,
  });
  if (expectedOptionsHash !== payload.optionsHash)
    throw new Error("The render options hash does not match its inputs.");
}
