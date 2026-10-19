import { Buffer } from "node:buffer";
import { PDFDocument } from "pdf-lib";
import {
  pdfParserRequestSchema,
  pdfInspectionSchema,
  type PdfParserResponse,
} from "./design-system-pdf-contract.js";

// Parsing runs only in the resource-limited child. Never forward parser diagnostics.
process.once("message", (message: unknown) => {
  void (async () => {
    let response: PdfParserResponse;
    try {
      const bytes = pdfParserRequestSchema.parse(message);
      if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-")
        throw new Error("Invalid PDF signature.");
      const pdf = await PDFDocument.load(bytes, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      response = {
        ok: true,
        inspection: pdfInspectionSchema.parse({
          kind: "pdf",
          pageCount: pdf.getPageCount(),
        }),
      };
    } catch {
      response = { ok: false };
    }
    process.send?.(response, () => {
      if (process.connected) process.disconnect();
    });
  })();
});
