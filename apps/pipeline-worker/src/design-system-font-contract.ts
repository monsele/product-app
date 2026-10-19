import { z } from "zod";

export const maximumFontCharacters = 200000;
export const designSystemFontInspectionSchema = z
  .object({
    kind: z.literal("font"),
    family: z.string().min(1).max(255),
    subfamily: z.string().max(255),
    postscriptName: z.string().min(1).max(255),
    unitsPerEm: z.number().int().min(16).max(16384),
    glyphCount: z.number().int().positive().max(65535),
    characterSet: z
      .array(z.number().int().min(0).max(0x10ffff))
      .min(1)
      .max(maximumFontCharacters),
  })
  .strict();
export type DesignSystemFontInspection = z.infer<
  typeof designSystemFontInspectionSchema
>;
export const fontParserRequestSchema = z
  .object({
    bytes: z
      .instanceof(Uint8Array)
      .refine((bytes) => bytes.length >= 12 && bytes.length <= 5 * 1024 * 1024),
    mediaType: z.enum(["font/ttf", "font/otf", "font/woff2"]),
  })
  .strict();
export const fontParserResponseSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      inspection: designSystemFontInspectionSchema,
    })
    .strict(),
  z.object({ ok: z.literal(false) }).strict(),
]);
export type FontParserResponse = z.infer<typeof fontParserResponseSchema>;
