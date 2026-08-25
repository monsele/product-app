import { identifierSchema } from "@avlp/config";
import { hashJobOptions } from "@avlp/jobs";
import { fullLessonCompositionPropsSchema } from "@avlp/scene-library";
import { lessonSpecSchema } from "@avlp/schemas";
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
      "audio/wav",
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

const productionVisualAssetSchema = z.discriminatedUnion("source", [
  z
    .object({
      altText: z.string().min(1).max(2_000),
      assetId: identifierSchema,
      source: z.literal("library"),
      staticLocation: z.string().regex(/^\/catalog\/[a-z0-9/_-]+\.svg$/i),
    })
    .strict(),
  z
    .object({
      altText: z.string().min(1).max(2_000),
      assetId: identifierSchema,
      checksumSha256: sha256ChecksumSchema,
      contentType: z.enum([
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/webp",
      ]),
      source: z.literal("source"),
      storageKey: storageKeySchema,
    })
    .strict(),
]);

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
    fixtureId: z.literal(manualLessonFixtureId).optional(),
    /** Present for production renders so the renderer can load one immutable
     * lesson-version snapshot; ST-024's manual fixture intentionally omits it. */
    lessonVersionId: identifierSchema.optional(),
    /** A versioned production manifest contains only immutable snapshot data. */
    manifest: z
      .object({
        schemaVersion: z.literal(1),
        lessonVersionId: identifierSchema,
        lessonVersionContentHash: sha256ChecksumSchema,
        validationRunId: identifierSchema,
        validationInputHash: sha256ChecksumSchema,
        sceneLibraryVersion: z.literal("mvp-v1"),
        audio: z
          .array(renderAssetSchema)
          .min(1)
          .max(100)
          .superRefine((assets, context) => {
            for (const [index, asset] of assets.entries())
              if (!asset.contentType.startsWith("audio/"))
                context.addIssue({
                  code: z.ZodIssueCode.custom,
                  path: [index, "contentType"],
                  message: "Production narration entries must be audio.",
                });
          }),
        captions: z
          .array(
            z
              .object({
                sceneId: identifierSchema,
                startFrame: z.number().int().nonnegative(),
                endFrame: z.number().int().positive(),
                text: z.string().min(1).max(1_000),
              })
              .strict()
              .refine(
                (cue) => cue.endFrame > cue.startFrame,
                "Caption endFrame must be after startFrame.",
              ),
          )
          .max(10_000),
        visualAssets: z.array(productionVisualAssetSchema).max(200),
        profile: renderProfileSchema,
        snapshot: z.unknown(),
      })
      .strict()
      .optional(),
    lessonSpecSha256: sha256ChecksumSchema,
    optionsHash: sha256ChecksumSchema,
    profile: renderProfileSchema,
    rendererVersion: z.literal(renderImplementationVersion),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fixtureId === undefined && value.manifest === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifest"],
        message: "A production render must provide an immutable manifest.",
      });
    if (value.fixtureId !== undefined && value.manifest !== undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["manifest"],
        message:
          "A render is either a fixture or a production manifest, never both.",
      });
  });
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
  return hashJobOptions(value);
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

/** Production payloads are immutable database records rather than a checked-in
 * fixture. Verify every hashed manifest field before resolving private media. */
export function assertProductionManifestIntegrity(
  payload: RenderJobPayload,
): void {
  if (payload.manifest === undefined) return;
  if (sha256Json(payload.manifest) !== payload.compositionSha256)
    throw new Error(
      "The immutable production manifest checksum does not match.",
    );
  const expectedOptionsHash = hashJobOptions({
    assetManifest: payload.assetManifest,
    compositionSha256: payload.compositionSha256,
    lessonSpecSha256: payload.lessonSpecSha256,
    profile: payload.profile,
    rendererVersion: payload.rendererVersion,
  });
  if (expectedOptionsHash !== payload.optionsHash)
    throw new Error(
      "The production render options hash does not match its inputs.",
    );
  const lesson = lessonSpecSchema.parse(
    (payload.manifest.snapshot as { lessonSpec?: unknown }).lessonSpec,
  );
  if (sha256Json(lesson) !== payload.lessonSpecSha256)
    throw new Error(
      "The production lesson checksum does not match its snapshot.",
    );
  if (
    JSON.stringify(payload.profile) !== JSON.stringify(payload.manifest.profile)
  )
    throw new Error(
      "The production profile does not match its immutable manifest.",
    );
}
