import { afterEach, describe, expect, it, vi } from "vitest";
import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import {
  HttpMalwareScanner,
  validateDocumentBytes,
} from "./document-validation.js";

const pdfMediaType = "application/pdf" as const;
const docxMediaType =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;
const limits = { maxBytes: 1_000_000, maxPages: 20 };
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
async function validPdf(pages = 1): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  for (let page = 0; page < pages; page += 1) document.addPage();
  return document.save();
}

function validDocx(pages = 1): Uint8Array {
  const name = Buffer.from("word/document.xml");
  const xml = Buffer.from(
    `<w:document>${"<w:lastRenderedPageBreak/>".repeat(pages - 1)}</w:document>`,
  );
  const compressed = deflateRawSync(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  return Buffer.concat([local, name, compressed, central, name, end]);
}

describe("validateDocumentBytes", () => {
  it("accepts a valid PDF at the page-limit boundary", async () => {
    await expect(
      validateDocumentBytes({
        bytes: await validPdf(20),
        mediaType: pdfMediaType,
        ...limits,
      }),
    ).resolves.toEqual({ ok: true, pageCount: 20, warnings: [] });
  });

  it("blocks magic-byte MIME mismatches, empty files, corrupt PDFs, and oversized files", async () => {
    await expect(
      validateDocumentBytes({
        bytes: bytes("not a PDF"),
        mediaType: pdfMediaType,
        ...limits,
      }),
    ).resolves.toMatchObject({ ok: false, code: "MIME_MISMATCH" });
    await expect(
      validateDocumentBytes({
        bytes: new Uint8Array(),
        mediaType: pdfMediaType,
        ...limits,
      }),
    ).resolves.toMatchObject({ ok: false, code: "EMPTY_FILE" });
    await expect(
      validateDocumentBytes({
        bytes: bytes("%PDF-1.7\n/Type /Page"),
        mediaType: pdfMediaType,
        ...limits,
      }),
    ).resolves.toMatchObject({ ok: false, code: "MIME_MISMATCH" });
    await expect(
      validateDocumentBytes({
        bytes: await validPdf(),
        mediaType: pdfMediaType,
        maxBytes: 3,
        maxPages: 20,
      }),
    ).resolves.toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("blocks a document with more than 20 PDF pages", async () => {
    await expect(
      validateDocumentBytes({
        bytes: await validPdf(21),
        mediaType: pdfMediaType,
        ...limits,
      }),
    ).resolves.toMatchObject({ ok: false, code: "PAGE_LIMIT_EXCEEDED" });
  });

  it("validates DOCX packages, their page limit, and corrupt input", async () => {
    await expect(
      validateDocumentBytes({
        bytes: validDocx(20),
        mediaType: docxMediaType,
        ...limits,
      }),
    ).resolves.toEqual({
      ok: true,
      pageCount: 20,
      warnings: ["DOCX page count is a structural estimate."],
    });
    await expect(
      validateDocumentBytes({
        bytes: validDocx(21),
        mediaType: docxMediaType,
        ...limits,
      }),
    ).resolves.toMatchObject({ ok: false, code: "PAGE_LIMIT_EXCEEDED" });
    await expect(
      validateDocumentBytes({
        bytes: new Uint8Array([0x50, 0x4b]),
        mediaType: docxMediaType,
        ...limits,
      }),
    ).resolves.toMatchObject({ ok: false, code: "CORRUPT_DOCUMENT" });
  });

  it("rejects DOCX archives whose document XML exceeds the decompression limit", async () => {
    const archive = validDocx(1);
    const oversizedXml = Buffer.from(
      `<w:document>${"x".repeat(10 * 1024 * 1024)}</w:document>`,
    );
    const compressed = deflateRawSync(oversizedXml);
    const name = Buffer.from("word/document.xml");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(oversizedXml.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(oversizedXml.length, 24);
    central.writeUInt16LE(name.length, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(local.length + name.length + compressed.length, 16);
    const bomb = Buffer.concat([local, name, compressed, central, name, end]);
    expect(archive.byteLength).toBeGreaterThan(0);
    await expect(
      validateDocumentBytes({ bytes: bomb, mediaType: docxMediaType, ...limits }),
    ).resolves.toMatchObject({ ok: false, code: "CORRUPT_DOCUMENT" });
  });
});

describe("HttpMalwareScanner", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns only the normalized safe or unsafe result", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "unsafe" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new HttpMalwareScanner("https://scanner.example.test", "token").scan({
        bytes: await validPdf(),
        sha256: "a".repeat(64),
      }),
    ).resolves.toEqual({ status: "unsafe" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://scanner.example.test",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("fails closed for scanner errors or invalid results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );
    await expect(
      new HttpMalwareScanner("https://scanner.example.test", undefined).scan({
        bytes: await validPdf(),
        sha256: "a".repeat(64),
      }),
    ).rejects.toThrow("Malware scanner request failed.");
    await expect(
      new HttpMalwareScanner(undefined, undefined).scan({
        bytes: await validPdf(),
        sha256: "a".repeat(64),
      }),
    ).rejects.toThrow("Malware scanner is not configured.");
  });
});
