import { Buffer } from "node:buffer";
import { create } from "fontkit";
import { z } from "zod";
import {
  designSystemFontInspectionSchema,
  fontParserRequestSchema,
  maximumFontCharacters,
  type DesignSystemFontInspection,
  type FontParserResponse,
} from "./design-system-font-contract.js";

const unicode = z.number().int().min(0).max(0x10ffff);
const collectionLength = (value: unknown) =>
  z
    .object({
      length: z.number().int().nonnegative().max(maximumFontCharacters),
    })
    .parse(value).length;
function collectionItem(value: unknown, index: number): unknown {
  if (Array.isArray(value)) return value[index];
  const collection = z
    .object({
      get: z.custom<(this: unknown, index: number) => unknown>(
        (value) => typeof value === "function",
      ),
    })
    .parse(value);
  return collection.get.call(value, index);
}

/** fontkit.characterSet expands ranges before checking their size. Never call it. */
function readBoundedCharacterSet(font: unknown): number[] {
  // This adapter uses the selected cmap in the pinned fontkit 2.0.4 decoder.
  // Lazy collections are counted before reading entries or allocating coverage.
  const cmap = z
    .object({
      _cmapProcessor: z.object({
        cmap: z.object({ version: z.number().int() }).passthrough(),
      }),
    })
    .parse(font)._cmapProcessor.cmap;
  const characters: number[] = [];
  const addRange = (first: unknown, last: unknown) => {
    const start = unicode.parse(first),
      end = unicode.parse(last);
    if (
      end < start ||
      end - start + 1 > maximumFontCharacters - characters.length
    )
      throw new Error("Font character coverage exceeds the limit.");
    for (let code = start; code <= end; code++) characters.push(code);
  };
  switch (cmap.version) {
    case 0:
      addRange(0, collectionLength(cmap.codeMap) - 1);
      break;
    case 4: {
      const count = collectionLength(cmap.startCode);
      if (count !== collectionLength(cmap.endCode))
        throw new Error("Invalid font character segments.");
      for (let i = 0; i < count; i++)
        addRange(
          collectionItem(cmap.startCode, i),
          collectionItem(cmap.endCode, i),
        );
      break;
    }
    case 6:
    case 10: {
      const first = unicode.parse(cmap.firstCode);
      addRange(first, first + collectionLength(cmap.glyphIndices) - 1);
      break;
    }
    case 12:
    case 13: {
      const count = collectionLength(cmap.groups);
      for (let i = 0; i < count; i++) {
        const group = z
          .object({ startCharCode: unicode, endCharCode: unicode })
          .parse(collectionItem(cmap.groups, i));
        addRange(group.startCharCode, group.endCharCode);
      }
      break;
    }
    default:
      throw new Error("Unsupported font character mapping.");
  }
  return characters;
}

function inspectFont(
  bytes: Uint8Array,
  mediaType: string,
): DesignSystemFontInspection {
  const buffer = Buffer.from(bytes);
  if (buffer.length > 5 * 1024 * 1024 || buffer.length < 12)
    throw new Error("Invalid font size.");
  const magic = buffer.toString("ascii", 0, 4);
  if (
    (mediaType === "font/ttf" && buffer.readUInt32BE(0) !== 0x00010000) ||
    (mediaType === "font/otf" && magic !== "OTTO") ||
    (mediaType === "font/woff2" && magic !== "wOF2")
  )
    throw new Error("Font signature mismatch.");
  if (mediaType === "font/woff2") {
    if (
      buffer.length < 48 ||
      buffer.readUInt32BE(8) !== buffer.length ||
      buffer.readUInt16BE(12) < 1 ||
      buffer.readUInt16BE(12) > 256 ||
      buffer.readUInt32BE(16) > 32 * 1024 * 1024 ||
      buffer.readUInt32BE(4) === 0x74746366
    )
      throw new Error("Unsupported or oversized decoded font.");
  } else {
    const tableCount = buffer.readUInt16BE(4);
    if (
      tableCount < 1 ||
      tableCount > 256 ||
      12 + tableCount * 16 > buffer.length
    )
      throw new Error("Invalid font directory.");
    for (let i = 0; i < tableCount; i++) {
      const entry = 12 + i * 16;
      if (
        buffer.readUInt32BE(entry + 8) + buffer.readUInt32BE(entry + 12) >
        buffer.length
      )
        throw new Error("Invalid font table.");
    }
  }
  const font = create(buffer);
  if ("fonts" in font) throw new Error("Font collections are unsupported.");
  // fontkit sizes WOFF2 decompression from the directory, not totalSfntSize.
  // Validate that actual allocation before touching lazy font tables.
  const directory = z
    .object({
      directory: z.object({
        tables: z.record(
          z.object({
            length: z
              .number()
              .int()
              .nonnegative()
              .max(32 * 1024 * 1024),
            transformLength: z
              .number()
              .int()
              .nonnegative()
              .max(32 * 1024 * 1024)
              .optional(),
          }),
        ),
      }),
    })
    .parse(font).directory;
  if (
    Object.values(directory.tables).reduce(
      (total, table) => total + (table.transformLength ?? table.length),
      0,
    ) >
    32 * 1024 * 1024
  )
    throw new Error("The decoded font tables exceed the size limit.");
  if (font["OS/2"]?.fsType?.noEmbedding || font["OS/2"]?.fsType?.bitmapOnly)
    throw new Error("This font does not permit outline embedding.");
  const inspection = designSystemFontInspectionSchema.parse({
    kind: "font",
    family: font.familyName,
    subfamily: font.subfamilyName ?? "",
    postscriptName: font.postscriptName,
    unitsPerEm: font.unitsPerEm,
    glyphCount: font.numGlyphs,
    characterSet: readBoundedCharacterSet(font),
  });
  // Resolve real glyph metrics; a signature alone does not establish a usable font.
  const run = font.layout("Aa0");
  if (run.positions.some((position) => !Number.isFinite(position.xAdvance)))
    throw new Error("Invalid glyph metrics.");
  return inspection;
}

// Only the isolated child receives IPC input. No byte-derived error text or
// parser stderr is forwarded to the job host or operational logs.
process.once("message", (message: unknown) => {
  let response: FontParserResponse;
  try {
    const input = fontParserRequestSchema.parse(message);
    response = {
      ok: true,
      inspection: inspectFont(input.bytes, input.mediaType),
    };
  } catch {
    response = { ok: false };
  }
  process.send?.(response, () => {
    if (process.connected) process.disconnect();
  });
});
