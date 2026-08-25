import { inflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";
import type { SourceDocumentMediaType } from "@avlp/schemas";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";

export type MalwareScanResult = { status: "safe" | "unsafe" };

/** A scanner boundary intentionally exposes no provider-specific payload. */
export interface MalwareScanner {
  scan(input: {
    bytes: Uint8Array;
    sha256: string;
  }): Promise<MalwareScanResult>;
}

const malwareScanResponseSchema = z
  .object({ status: z.enum(["safe", "unsafe"]) })
  .strict();

/** Minimal scanner adapter; scanner response details never leave the worker. */
export class HttpMalwareScanner implements MalwareScanner {
  public constructor(
    private readonly endpoint: string | undefined,
    private readonly token: string | undefined,
  ) {}

  public async scan(input: {
    bytes: Uint8Array;
    sha256: string;
  }): Promise<MalwareScanResult> {
    if (this.endpoint === undefined)
      throw new Error("Malware scanner is not configured.");
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-content-sha256": input.sha256,
        ...(this.token === undefined
          ? {}
          : { authorization: `Bearer ${this.token}` }),
      },
      body: Buffer.from(input.bytes),
    });
    if (!response.ok) throw new Error("Malware scanner request failed.");
    return malwareScanResponseSchema.parse(await response.json());
  }
}

export type DocumentValidationResult =
  | { ok: true; pageCount: number; warnings: string[] }
  | {
      ok: false;
      code:
        | "EMPTY_FILE"
        | "FILE_TOO_LARGE"
        | "UNSUPPORTED_FILE_TYPE"
        | "MIME_MISMATCH"
        | "CORRUPT_DOCUMENT"
        | "PAGE_LIMIT_EXCEEDED"
        | "MALWARE_DETECTED";
      message: string;
    };

const pdfMediaType = "application/pdf" as const;
const docxMediaType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
/** Bound decompression before malware scanning to protect the worker from ZIP bombs. */
const maxDocxDocumentXmlBytes = 10 * 1024 * 1024;

function text(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function countMatches(value: string, expression: RegExp): number {
  return [...value.matchAll(expression)].length;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function documentXmlFromDocx(bytes: Uint8Array): string | undefined {
  const eocd = [0x50, 0x4b, 0x05, 0x06];
  let eocdOffset = -1;
  for (
    let index = Math.max(0, bytes.length - 65_557);
    index <= bytes.length - 4;
    index += 1
  )
    if (eocd.every((value, offset) => bytes[index + offset] === value))
      eocdOffset = index;
  if (eocdOffset === -1 || eocdOffset + 22 > bytes.length) return undefined;
  const entryCount = readUint16(bytes, eocdOffset + 10);
  const centralDirectorySize = readUint32(bytes, eocdOffset + 12);
  let offset = readUint32(bytes, eocdOffset + 16);
  const centralDirectoryEnd = offset + centralDirectorySize;
  if (
    centralDirectoryEnd > bytes.length ||
    centralDirectoryEnd < offset ||
    centralDirectoryEnd > eocdOffset
  )
    return undefined;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (
      readUint32(bytes, offset) !== 0x02014b50 ||
      offset + 46 > centralDirectoryEnd
    )
      return undefined;
    const method = readUint16(bytes, offset + 10);
    const compressedSize = readUint32(bytes, offset + 20);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localOffset = readUint32(bytes, offset + 42);
    const name = text(bytes.slice(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > centralDirectoryEnd) return undefined;
    if (name !== "word/document.xml") continue;
    if (uncompressedSize > maxDocxDocumentXmlBytes) return undefined;
    if (
      readUint32(bytes, localOffset) !== 0x04034b50 ||
      localOffset + 30 > bytes.length
    )
      return undefined;
    const localNameLength = readUint16(bytes, localOffset + 26);
    const localExtraLength = readUint16(bytes, localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const end = start + compressedSize;
    if (start > bytes.length || end > bytes.length || end < start)
      return undefined;
    const compressed = bytes.slice(start, start + compressedSize);
    try {
      return text(
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, {
                maxOutputLength: maxDocxDocumentXmlBytes,
              })
            : new Uint8Array(),
      );
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function validateDocumentBytes(input: {
  bytes: Uint8Array;
  mediaType: SourceDocumentMediaType;
  maxBytes: number;
  maxPages: number;
}): Promise<DocumentValidationResult> {
  if (input.bytes.byteLength === 0)
    return {
      ok: false,
      code: "EMPTY_FILE",
      message: "The uploaded file is empty.",
    };
  if (input.bytes.byteLength > input.maxBytes)
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: "The uploaded file exceeds the allowed size.",
    };
  if (input.mediaType !== pdfMediaType && input.mediaType !== docxMediaType)
    return {
      ok: false,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Only PDF and DOCX files are supported.",
    };

  let pageCount: number;
  let warnings: string[] = [];
  if (input.mediaType === pdfMediaType) {
    const content = text(input.bytes);
    if (!content.startsWith("%PDF-") || !content.includes("%%EOF"))
      return {
        ok: false,
        code: "MIME_MISMATCH",
        message: "The uploaded file is not a valid PDF.",
      };
    try {
      pageCount = (
        await PDFDocument.load(input.bytes, {
          ignoreEncryption: false,
          updateMetadata: false,
        })
      ).getPageCount();
    } catch {
      return {
        ok: false,
        code: "CORRUPT_DOCUMENT",
        message: "The PDF could not be read.",
      };
    }
    if (pageCount < 1)
      return {
        ok: false,
        code: "CORRUPT_DOCUMENT",
        message: "The PDF could not be read.",
      };
  } else {
    if (input.bytes[0] !== 0x50 || input.bytes[1] !== 0x4b)
      return {
        ok: false,
        code: "MIME_MISMATCH",
        message: "The uploaded file is not a valid DOCX document.",
      };
    const documentXml = documentXmlFromDocx(input.bytes);
    if (documentXml === undefined || !documentXml.includes("<w:document"))
      return {
        ok: false,
        code: "CORRUPT_DOCUMENT",
        message: "The DOCX document could not be read.",
      };
    pageCount = Math.max(
      1,
      countMatches(
        documentXml,
        /<w:lastRenderedPageBreak\b|<w:br\b[^>]*w:type=["']page["']/g,
      ) + 1,
    );
    warnings = ["DOCX page count is a structural estimate."];
  }
  if (pageCount > input.maxPages)
    return {
      ok: false,
      code: "PAGE_LIMIT_EXCEEDED",
      message: `Documents are limited to ${input.maxPages} pages.`,
    };
  return { ok: true, pageCount, warnings };
}
