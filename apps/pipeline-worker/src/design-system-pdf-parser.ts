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
      const extraction =
        typeof message === "object" &&
        message !== null &&
        "extractText" in message &&
        message.extractText === true;
      const bytes = pdfParserRequestSchema.parse(
        extraction && "bytes" in message ? message.bytes : message,
      );
      if (Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-")
        throw new Error("Invalid PDF signature.");
      const pdf = await PDFDocument.load(bytes, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      let text: string | undefined;
      if (extraction) {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const task = getDocument({
          data: new Uint8Array(bytes),
          disableFontFace: true,
          useSystemFonts: false,
          verbosity: 0,
        });
        const document = await task.promise;
        if (document.numPages > 100) throw new Error("Too many pages.");
        text = "";
        try {
          for (let page = 1; page <= document.numPages; page++) {
            const content = await (
              await document.getPage(page)
            ).getTextContent();
            const pageText = content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" ");
            if (pageText.trim()) text += `\nPage ${page}: ${pageText}`;
            if (text.length > 70000)
              throw new Error("Guide text exceeds the interpretation limit.");
          }
        } finally {
          await task.destroy();
        }
      }
      response = {
        ok: true,
        inspection: pdfInspectionSchema.parse({
          kind: "pdf",
          pageCount: pdf.getPageCount(),
          ...(text === undefined ? {} : { text }),
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
