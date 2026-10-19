import { identifierSchema, sha256 } from "@avlp/config";
import { z } from "zod";

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
export const designSystemDefinitionSchema = z
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
