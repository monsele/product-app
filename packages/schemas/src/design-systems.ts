import { identifierSchema, sha256 } from "@avlp/config";
import { z } from "zod";
import {
  customPresentationSchema,
  customDesignManifestSchema,
  customDesignRuleReport,
  resolveCustomScenes,
} from "./custom-design.js";
import type { SceneSpec } from "./index.js";
import {
  resolveCinemaBeatFrames,
  type CinemaCaptionCue,
} from "./creative-design-v2.js";

const text = (max: number) => z.string().trim().min(1).max(max);
export const designSystemHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const designSystemAssetKindSchema = z.enum([
  "font",
  "guide",
  "tokens",
  "reference",
  "logo",
]);
export const designSystemMediaTypes = [
  "font/ttf",
  "font/otf",
  "font/woff2",
  "application/pdf",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
] as const;
export const designSystemMediaTypeSchema = z.enum(designSystemMediaTypes);
export const designSystemAssetStatusSchema = z.enum([
  "uploading",
  "pending_validation",
  "active",
  "rejected",
]);
export const designSystemRuleSchema = z
  .object({
    id: text(80),
    category: z.enum([
      "typography",
      "colour",
      "composition",
      "imagery",
      "diagrams",
      "motion",
    ]),
    instruction: text(1000),
    enforcement: z.enum(["locked", "guidance"]),
    origin: z.enum(["supplied", "inferred"]),
  })
  .strict();
const legacyDesignSystemDefinitionSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    philosophy: z.string().trim().max(10000),
    rules: z.array(designSystemRuleSchema).max(100),
    assetIds: z.array(identifierSchema).max(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.assetIds).size !== value.assetIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["assetIds"],
        message: "Asset references must be unique.",
      });
    if (new Set(value.rules.map((rule) => rule.id)).size !== value.rules.length)
      ctx.addIssue({
        code: "custom",
        path: ["rules"],
        message: "Rule IDs must be unique.",
      });
  });
export const designSystemDefinitionSchema = z.union([
  legacyDesignSystemDefinitionSchema,
  z
    .object({
      schemaVersion: z.literal("1.1"),
      philosophy: z.string().trim().max(10000),
      rules: z.array(designSystemRuleSchema).max(100),
      assetIds: z.array(identifierSchema).max(100),
      presentation: customPresentationSchema,
    })
    .strict()
    .superRefine((value, ctx) => {
      if (new Set(value.rules.map((r) => r.id)).size !== value.rules.length)
        ctx.addIssue({
          code: "custom",
          path: ["rules"],
          message: "Rule IDs must be unique.",
        });
      if (new Set(value.assetIds).size !== value.assetIds.length)
        ctx.addIssue({
          code: "custom",
          path: ["assetIds"],
          message: "Asset references must be unique.",
        });
      for (const role of ["heading", "body"] as const)
        if (!value.assetIds.includes(value.presentation.fonts[role]))
          ctx.addIssue({
            code: "custom",
            path: ["presentation", "fonts", role],
            message: "Include the selected font in this system's imports.",
          });
      if (
        value.presentation.logoAssetId !== null &&
        !value.assetIds.includes(value.presentation.logoAssetId)
      )
        ctx.addIssue({
          code: "custom",
          path: ["presentation", "logoAssetId"],
          message: "Include the selected logo in this system's imports.",
        });
    }),
]);
export type DesignSystemDefinition = z.infer<
  typeof designSystemDefinitionSchema
>;
export const emptyDesignSystemDefinition: DesignSystemDefinition = {
  schemaVersion: "1.0",
  philosophy: "",
  rules: [],
  assetIds: [],
};
/** Published data pins bytes, not transient URLs or mutable asset names. */
export const designSystemVersionSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    name: text(100),
    definition: designSystemDefinitionSchema,
    assets: z
      .array(
        z
          .object({
            id: identifierSchema,
            kind: designSystemAssetKindSchema,
            mediaType: designSystemMediaTypeSchema,
            sha256: designSystemHashSchema,
            inspection: z.record(z.unknown()),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type DesignSystemVersionSnapshot = z.infer<
  typeof designSystemVersionSnapshotSchema
>;

/** Pure compiler for consumers; publishing a system never applies it to a project. */
export function compileCustomDesign(input: {
  systemId: string;
  versionId: string;
  contentHash: string;
  snapshot: unknown;
  scenes: readonly SceneSpec[];
  captionsBySceneId?: Readonly<Record<string, readonly CinemaCaptionCue[]>>;
}) {
  const snapshot = designSystemVersionSnapshotSchema.parse(input.snapshot);
  const definition = snapshot.definition;
  if (definition.schemaVersion !== "1.1")
    throw new Error(
      "Choose exact fonts and presentation controls before using this system.",
    );
  if (designSystemContentHash(snapshot) !== input.contentHash)
    throw new Error(
      "The saved design-system checksum does not match. Reload the version.",
    );
  const unsupported = customDesignRuleReport(definition.rules).filter(
    (r) => r.status === "unsupported",
  );
  if (unsupported.length)
    throw new Error(unsupported.map((r) => r.message).join(" "));
  const fontIds = [...new Set(Object.values(definition.presentation.fonts))];
  const logoId = definition.presentation.logoAssetId;
  if (
    logoId !== null &&
    !snapshot.assets.some((a) => a.id === logoId && a.kind === "logo")
  )
    throw new Error(
      "The selected logo is missing. Import and validate a logo, then publish a new revision.",
    );
  const scenes = resolveCustomScenes(definition.presentation, input.scenes);
  return customDesignManifestSchema.parse({
    manifestVersion: "3.0",
    rendererVersion: "custom-1.0.0",
    systemId: input.systemId,
    systemVersionId: input.versionId,
    systemContentHash: input.contentHash,
    presentation: definition.presentation,
    fonts: fontIds.map((assetId) => {
      const asset = snapshot.assets.find(
        (a) => a.id === assetId && a.kind === "font",
      );
      if (!asset)
        throw new Error(
          "A selected font is missing. Import and validate it, then publish a new revision.",
        );
      return {
        assetId,
        sha256: asset.sha256,
        characterSet: asset.inspection.characterSet,
      };
    }),
    assets: snapshot.assets
      .filter((a) => a.id === logoId)
      .map((a) => ({ assetId: a.id, sha256: a.sha256 })),
    scenes,
    scenePins: Object.fromEntries(
      input.scenes.map((scene) => [
        scene.id,
        {
          contentHash: designSystemContentHash(scene),
          beatFrames: resolveCinemaBeatFrames({
            beats: scenes[scene.id]!.beats,
            narration: scene.narration,
            cues: input.captionsBySceneId?.[scene.id] ?? [],
            durationInFrames: Math.round(scene.durationSeconds * 30),
          }),
        },
      ]),
    ),
  });
}
export const createDesignSystemInputSchema = z
  .object({ name: text(100) })
  .strict();
export const updateDesignSystemInputSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    name: text(100),
    definition: designSystemDefinitionSchema,
  })
  .strict();
export const designSystemRevisionInputSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
export const designSystemVersionPageInputSchema = z
  .object({
    beforeRevision: z.coerce
      .number()
      .int()
      .positive()
      .max(2147483647)
      .optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
export const createDesignSystemUploadInputSchema = z
  .object({
    projectId: identifierSchema,
    kind: designSystemAssetKindSchema,
    mediaType: designSystemMediaTypeSchema,
    originalName: text(255).refine(
      (name) =>
        !/[\\/]/.test(name) &&
        [...name].every(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        ),
      "Use a file name without paths or control characters.",
    ),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    sha256: designSystemHashSchema,
    rightsConfirmed: z.literal(true),
  })
  .strict()
  .superRefine((value, ctx) => {
    const permitted: Record<
      z.infer<typeof designSystemAssetKindSchema>,
      readonly string[]
    > = {
      font: ["font/ttf", "font/otf", "font/woff2"],
      guide: ["application/pdf", "text/markdown"],
      tokens: ["application/json"],
      reference: ["image/png", "image/jpeg"],
      logo: ["image/png", "image/jpeg"],
    };
    if (!permitted[value.kind].includes(value.mediaType))
      ctx.addIssue({
        code: "custom",
        path: ["mediaType"],
        message: "The media type is not supported for this import kind.",
      });
    if (value.kind === "font" && value.sizeBytes > 5 * 1024 * 1024)
      ctx.addIssue({
        code: "custom",
        path: ["sizeBytes"],
        message: "Fonts are limited to 5 MB.",
      });
  });
export const designSystemAssetValidationPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: identifierSchema,
    systemId: identifierSchema,
  })
  .strict();

/** Stable hashes ignore object insertion order, not array order or rule content. */
export function canonicalDesignSystemJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalDesignSystemJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalDesignSystemJson(record[key])}`,
      )
      .join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined)
    throw new Error("Design-system hashes require JSON values.");
  return result;
}
export function designSystemContentHash(value: unknown): string {
  return sha256(canonicalDesignSystemJson(value));
}

export const designSystemHeaderSchema = z.object({
  id: identifierSchema,
  name: text(100),
  revision: z.number().int().positive(),
  archivedAt: z.string().nullable(),
});
export const designSystemListSchema = z
  .array(designSystemHeaderSchema)
  .max(200);
export const designSystemDetailSchema = z.object({
  system: designSystemHeaderSchema.extend({
    definition: designSystemDefinitionSchema,
  }),
  assets: z
    .array(
      z.object({
        id: identifierSchema,
        kind: designSystemAssetKindSchema,
        mediaType: designSystemMediaTypeSchema,
        originalName: text(255),
        status: designSystemAssetStatusSchema,
        validatedSha256: designSystemHashSchema.nullable(),
        rejectionCode: z.string().nullable(),
        inspection: z.record(z.unknown()),
        validationJob: z
          .object({ state: z.string(), attempts: z.number().int() })
          .nullable(),
        recovery: z.literal("upload_again").nullable(),
      }),
    )
    .max(200),
  versions: z
    .array(
      z.object({
        id: identifierSchema,
        sourceRevision: z.number().int().positive(),
        contentHash: designSystemHashSchema,
        snapshot: designSystemVersionSnapshotSchema,
      }),
    )
    .max(200),
  nextBeforeRevision: z.number().int().positive().nullable(),
});
export const designSystemUploadResponseSchema = z.object({
  assetId: identifierSchema,
  upload: z.object({
    url: z.string().url(),
    requiredHeaders: z.record(z.string()),
  }),
});
export type DesignSystemDetail = z.infer<typeof designSystemDetailSchema>;
