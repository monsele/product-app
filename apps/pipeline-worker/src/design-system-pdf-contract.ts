import { z } from "zod";

export const pdfParserRequestSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.length > 0 && bytes.length <= 10 * 1024 * 1024);
export const pdfInspectionSchema = z
  .object({
    kind: z.literal("pdf"),
    pageCount: z.number().int().min(1).max(100),
    text: z.string().max(70000).optional(),
  })
  .strict();
export const pdfParserResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), inspection: pdfInspectionSchema }).strict(),
  z.object({ ok: z.literal(false) }).strict(),
]);
export type PdfInspection = z.infer<typeof pdfInspectionSchema>;
export type PdfParserResponse = z.infer<typeof pdfParserResponseSchema>;
