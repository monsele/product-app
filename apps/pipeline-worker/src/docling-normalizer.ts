import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Identifier } from "@avlp/config";
import {
  normalizedDocumentSchema,
  normalizedDocumentVersion,
  type ContentBlock,
  type ExtractedFigure,
  type IngestionWarning,
  type NormalizedDocument,
} from "@avlp/schemas";
import { z } from "zod";

/** Increment when a change can affect application-owned normalized output. */
export const doclingNormalizerVersion = "1.0.0" as const;

type CanonicalRecord = Record<string, unknown>;
type Candidate = {
  readonly kind: string;
  readonly page: number;
  readonly order: number;
  readonly text: string | undefined;
  readonly raw: CanonicalRecord;
  readonly level: number | undefined;
};

export type ExtractedFigureAsset = {
  readonly figureId: Identifier;
  readonly body: Uint8Array;
  readonly checksumSha256: string;
  readonly contentType: "image/gif" | "image/jpeg" | "image/png" | "image/webp";
  readonly width: number | undefined;
  readonly height: number | undefined;
};

const canonicalSchema = z.record(z.unknown());
const headingKinds = new Set([
  "title",
  "heading",
  "section_header",
  "section-header",
]);
const ignoredKinds = new Set([
  "page_header",
  "page_footer",
  "header",
  "footer",
  "running_header",
  "running_footer",
]);
const supportedKinds = new Set([
  "text",
  "paragraph",
  "list_item",
  "list-item",
  "formula",
  "equation",
  "caption",
]);

function deterministicId(seed: string): Identifier {
  const hex = createHash("sha256").update(seed).digest("hex");
  // UUIDv7-shaped deterministic identifiers keep overlays attachable across reruns.
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-${((Number.parseInt(hex[16]!, 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}` as Identifier;
}

function record(value: unknown): CanonicalRecord | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as CanonicalRecord)
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function textOf(value: CanonicalRecord): string | undefined {
  return (
    string(value.text) ??
    string(value.content) ??
    string(value.labelText) ??
    (record(value.caption) === undefined
      ? undefined
      : string(record(value.caption)!.text))
  );
}

function pageOf(value: CanonicalRecord): number {
  const direct =
    number(value.page_no) ?? number(value.page) ?? number(value.pageNumber);
  if (direct !== undefined && Number.isInteger(direct) && direct > 0)
    return direct;
  const provenance = Array.isArray(value.prov)
    ? value.prov
    : Array.isArray(value.provenance)
      ? value.provenance
      : [];
  for (const entry of provenance) {
    const candidate = record(entry);
    const page =
      candidate === undefined
        ? undefined
        : (number(candidate.page_no) ??
          number(candidate.page) ??
          number(candidate.pageNumber));
    if (page !== undefined && Number.isInteger(page) && page > 0) return page;
  }
  return 1;
}

function kindOf(value: CanonicalRecord): string {
  return (
    string(value.label) ??
    string(value.type) ??
    string(value.kind) ??
    "unknown"
  )
    .toLocaleLowerCase()
    .replaceAll(" ", "_");
}

function levelOf(value: CanonicalRecord, kind: string): number | undefined {
  if (!headingKinds.has(kind)) return undefined;
  const explicit = number(value.level) ?? number(value.heading_level);
  if (explicit !== undefined && Number.isInteger(explicit) && explicit > 0)
    return Math.min(explicit, 10);
  return kind === "title" ? 1 : 2;
}

function flattenCanonical(canonical: CanonicalRecord): Candidate[] {
  const candidates: Candidate[] = [];
  const collections = [
    "texts",
    "body",
    "groups",
    "tables",
    "pictures",
    "figures",
    "equations",
    "captions",
  ];
  const visited = new WeakSet<object>();
  const resolveReference = (reference: string): unknown => {
    if (!reference.startsWith("#/")) return undefined;
    return reference
      .slice(2)
      .split("/")
      .reduce<unknown>(
        (current, segment) =>
          record(current)?.[segment] ??
          (Array.isArray(current) ? current[Number(segment)] : undefined),
        canonical,
      );
  };
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      visit(resolveReference(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = record(value);
    if (item === undefined) return;
    if (visited.has(item)) return;
    visited.add(item);
    const kind = kindOf(item);
    if (
      textOf(item) !== undefined ||
      "label" in item ||
      "type" in item ||
      "kind" in item ||
      ["table", "picture", "figure", "image"].includes(kind)
    )
      candidates.push({
        kind,
        page: pageOf(item),
        order: candidates.length + 1,
        text: textOf(item),
        raw: item,
        level: levelOf(item, kind),
      });
    const children = item.children;
    if (Array.isArray(children)) children.forEach(visit);
  };
  // Docling's body child references are the authoritative reading-order stream.
  visit(canonical.body);
  for (const name of collections) visit(canonical[name]);
  return candidates;
}

function nestedString(
  value: CanonicalRecord,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const direct = string(value[name]);
    if (direct !== undefined) return direct;
  }
  for (const name of ["data", "image", "image_data", "payload"]) {
    const nested = record(value[name]);
    if (nested === undefined) continue;
    for (const nestedName of names) {
      const direct = string(nested[nestedName]);
      if (direct !== undefined) return direct;
    }
  }
  return undefined;
}

function imageContentType(
  body: Uint8Array,
  declared: string | undefined,
): ExtractedFigureAsset["contentType"] | undefined {
  const inferred =
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47
      ? "image/png"
      : body.length >= 3 &&
          body[0] === 0xff &&
          body[1] === 0xd8 &&
          body[2] === 0xff
        ? "image/jpeg"
        : body.length >= 6 &&
            new TextDecoder().decode(body.slice(0, 6)).startsWith("GIF")
          ? "image/gif"
          : body.length >= 12 &&
              new TextDecoder().decode(body.slice(0, 4)) === "RIFF" &&
              new TextDecoder().decode(body.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : undefined;
  if (declared === undefined) return inferred;
  const normalized = declared.toLocaleLowerCase().split(";")[0]?.trim();
  return normalized === inferred ? inferred : undefined;
}

function imageDimensions(
  body: Uint8Array,
  contentType: ExtractedFigureAsset["contentType"],
): Pick<ExtractedFigureAsset, "width" | "height"> {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  if (contentType === "image/png" && body.length >= 24)
    return { width: view.getUint32(16), height: view.getUint32(20) };
  if (contentType === "image/gif" && body.length >= 10)
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (
    contentType === "image/webp" &&
    body.length >= 30 &&
    new TextDecoder().decode(body.slice(12, 16)) === "VP8X"
  )
    return {
      width: 1 + body[24]! + (body[25]! << 8) + (body[26]! << 16),
      height: 1 + body[27]! + (body[28]! << 8) + (body[29]! << 16),
    };
  return { width: undefined, height: undefined };
}

/** Extract only inline image bytes; external paths are never fetched by the worker. */
export function extractDoclingFigureAssets(input: {
  artifactId: Identifier;
  canonicalJson: unknown;
}): {
  assets: readonly ExtractedFigureAsset[];
  warnings: readonly { figureId: Identifier; page: number; message: string }[];
} {
  const canonical = canonicalSchema.parse(input.canonicalJson);
  const assets: ExtractedFigureAsset[] = [];
  const warnings: { figureId: Identifier; page: number; message: string }[] =
    [];
  for (const candidate of flattenCanonical(canonical)) {
    if (!["picture", "figure", "image"].includes(candidate.kind)) continue;
    const figureId = deterministicId(
      `${input.artifactId}:figure:${candidate.page}:${candidate.order}`,
    );
    const encoded = nestedString(candidate.raw, [
      "base64",
      "image_base64",
      "data_uri",
      "dataUrl",
      "content",
      "image",
    ]);
    if (encoded === undefined) {
      warnings.push({
        figureId,
        page: candidate.page,
        message: "Figure media was unavailable from the parser output.",
      });
      continue;
    }
    const parts = encoded.match(/^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i);
    const base64 = parts?.[2] ?? encoded;
    let body: Uint8Array;
    try {
      body = Buffer.from(base64.replaceAll(/\s+/g, ""), "base64");
    } catch {
      warnings.push({
        figureId,
        page: candidate.page,
        message: "Figure media was malformed and could not be decoded.",
      });
      continue;
    }
    const contentType = imageContentType(
      body,
      parts?.[1] ??
        nestedString(candidate.raw, [
          "mime_type",
          "mimeType",
          "content_type",
          "contentType",
        ]),
    );
    if (body.length === 0 || contentType === undefined) {
      warnings.push({
        figureId,
        page: candidate.page,
        message:
          "Figure media was missing or used an unsupported image format.",
      });
      continue;
    }
    const dimensions = imageDimensions(body, contentType);
    assets.push({
      figureId,
      body,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
      contentType,
      ...dimensions,
    });
  }
  return { assets, warnings };
}

function repeatedMarginCandidates(
  candidates: readonly Candidate[],
): ReadonlySet<number> {
  const pagesByText = new Map<string, Set<number>>();
  for (const candidate of candidates) {
    if (candidate.text === undefined) continue;
    const key = candidate.text.replaceAll(/\s+/g, " ").toLocaleLowerCase();
    const pages = pagesByText.get(key) ?? new Set<number>();
    pages.add(candidate.page);
    pagesByText.set(key, pages);
  }
  const pageEdges = new Map<number, { first: number; last: number }>();
  for (const candidate of candidates) {
    const edge = pageEdges.get(candidate.page);
    pageEdges.set(candidate.page, {
      first:
        edge === undefined
          ? candidate.order
          : Math.min(edge.first, candidate.order),
      last:
        edge === undefined
          ? candidate.order
          : Math.max(edge.last, candidate.order),
    });
  }
  return new Set(
    candidates
      .filter((candidate) => {
        if (candidate.text === undefined) return false;
        const key = candidate.text.replaceAll(/\s+/g, " ").toLocaleLowerCase();
        const edge = pageEdges.get(candidate.page);
        return (
          (pagesByText.get(key)?.size ?? 0) > 1 &&
          (candidate.order === edge?.first || candidate.order === edge?.last)
        );
      })
      .map((candidate) => candidate.order),
  );
}

export function normalizeDoclingOutput(input: {
  artifactId: Identifier;
  sourceDocumentId: Identifier;
  pageCount: number;
  canonicalJson: unknown;
}): NormalizedDocument {
  const canonical = canonicalSchema.parse(input.canonicalJson);
  const candidates = flattenCanonical(canonical).sort(
    (left, right) => left.page - right.page || left.order - right.order,
  );
  const repeatedMargins = repeatedMarginCandidates(candidates);
  const warnings: IngestionWarning[] = [];
  const sections: NormalizedDocument["sections"] = [];
  const blocks: ContentBlock[] = [];
  const figures: NormalizedDocument["figures"] = [];
  const tables: NormalizedDocument["tables"] = [];
  const sectionStack: { id: Identifier; level: number }[] = [];
  let root: Identifier | undefined;
  const ensureRoot = (page: number): Identifier => {
    if (root !== undefined) return root;
    root = deterministicId(`${input.artifactId}:section:root`);
    sections.push({
      id: root,
      order: 1,
      level: 1,
      heading: "Document",
      pageStart: page,
      pageEnd: page,
      blockIds: [],
      figureIds: [],
      tableIds: [],
    });
    sectionStack.push({ id: root, level: 1 });
    return root;
  };
  const currentSection = (page: number): Identifier =>
    sectionStack.at(-1)?.id ?? ensureRoot(page);

  for (const candidate of candidates) {
    for (const entry of sectionStack) {
      const openSection = sections.find((section) => section.id === entry.id)!;
      openSection.pageEnd = Math.max(
        openSection.pageEnd ?? openSection.pageStart,
        candidate.page,
      );
    }
    if (
      ignoredKinds.has(candidate.kind) ||
      repeatedMargins.has(candidate.order)
    )
      continue;
    if (candidate.level !== undefined && candidate.text !== undefined) {
      while (
        sectionStack.at(-1)?.level !== undefined &&
        sectionStack.at(-1)!.level >= candidate.level
      )
        sectionStack.pop();
      const id = deterministicId(
        `${input.artifactId}:section:${candidate.page}:${candidate.order}:${candidate.text}`,
      );
      const siblings = sections.filter(
        (section) => section.parentSectionId === sectionStack.at(-1)?.id,
      );
      sections.push({
        id,
        ...(sectionStack.at(-1) === undefined
          ? {}
          : { parentSectionId: sectionStack.at(-1)!.id }),
        order: siblings.length + 1,
        level: candidate.level,
        heading: candidate.text,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        blockIds: [],
        figureIds: [],
        tableIds: [],
      });
      sectionStack.push({ id, level: candidate.level });
      continue;
    }
    const sectionId = currentSection(candidate.page);
    const section = sections.find((entry) => entry.id === sectionId)!;
    section.pageEnd = Math.max(
      section.pageEnd ?? section.pageStart,
      candidate.page,
    );
    if (["picture", "figure", "image"].includes(candidate.kind)) {
      const id = deterministicId(
        `${input.artifactId}:figure:${candidate.page}:${candidate.order}`,
      );
      const captionBlockId =
        candidate.text === undefined
          ? undefined
          : deterministicId(
              `${input.artifactId}:caption:${candidate.page}:${candidate.order}`,
            );
      if (captionBlockId !== undefined) {
        blocks.push({
          id: captionBlockId,
          sectionId,
          order: section.blockIds.length + 1,
          pageStart: candidate.page,
          pageEnd: candidate.page,
          kind: "caption",
          text: candidate.text!,
        });
        section.blockIds.push(captionBlockId);
      }
      figures.push({
        id,
        sectionId,
        order: figures.length + 1,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        ...(captionBlockId === undefined ? {} : { captionBlockId }),
        ...(candidate.text === undefined ? {} : { altText: candidate.text }),
        ...(nestedString(candidate.raw, [
          "self_ref",
          "source_locator",
          "sourceLocator",
          "uri",
          "path",
        ]) === undefined
          ? {}
          : {
              sourceLocator: nestedString(candidate.raw, [
                "self_ref",
                "source_locator",
                "sourceLocator",
                "uri",
                "path",
              ]),
            }),
      });
      section.figureIds.push(id);
      continue;
    }
    if (candidate.kind === "table") {
      const id = deterministicId(
        `${input.artifactId}:table:${candidate.page}:${candidate.order}`,
      );
      const data = record(candidate.raw.data);
      const rawRows = Array.isArray(data?.table_cells)
        ? data!.table_cells.filter(Array.isArray)
        : [];
      const rawCells = Array.isArray(data?.table_cells)
        ? data!.table_cells
            .map(record)
            .filter((cell): cell is CanonicalRecord => cell !== undefined)
        : [];
      const flattenedCells = rawRows.flatMap((row, rowIndex) =>
        row.map((cell, column) => ({
          row: rowIndex,
          column,
          text: String(cell),
          rowSpan: 1,
          columnSpan: 1,
        })),
      );
      const cells =
        rawCells.length > 0
          ? rawCells.map((cell, index) => {
              const row =
                number(cell.start_row_offset_idx) ?? number(cell.row) ?? index;
              const column =
                number(cell.start_col_offset_idx) ?? number(cell.column) ?? 0;
              const rowEnd = number(cell.end_row_offset_idx);
              const columnEnd = number(cell.end_col_offset_idx);
              return {
                row: Math.max(0, Math.trunc(row)),
                column: Math.max(0, Math.trunc(column)),
                text: textOf(cell) ?? "",
                rowSpan: Math.max(1, Math.trunc((rowEnd ?? row + 1) - row)),
                columnSpan: Math.max(
                  1,
                  Math.trunc((columnEnd ?? column + 1) - column),
                ),
              };
            })
          : flattenedCells;
      const width = Math.max(
        1,
        ...cells.map((cell) => cell.column + cell.columnSpan),
      );
      const height = Math.max(
        1,
        ...cells.map((cell) => cell.row + cell.rowSpan),
      );
      const rows = Array.from({ length: height }, (_, row) =>
        Array.from(
          { length: width },
          (_, column) =>
            cells.find((cell) => cell.row === row && cell.column === column)
              ?.text ?? "",
        ),
      );
      const columns = rows[0]?.map((_, index) => `Column ${index + 1}`) ?? [
        "Column 1",
      ];
      const normalizedRows = rows;
      const captionBlockId =
        candidate.text === undefined
          ? undefined
          : deterministicId(
              `${input.artifactId}:table-caption:${candidate.page}:${candidate.order}`,
            );
      if (captionBlockId !== undefined) {
        blocks.push({
          id: captionBlockId,
          sectionId,
          order: section.blockIds.length + 1,
          pageStart: candidate.page,
          pageEnd: candidate.page,
          kind: "caption",
          text: candidate.text!,
        });
        section.blockIds.push(captionBlockId);
      }
      tables.push({
        id,
        sectionId,
        order: tables.length + 1,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        ...(captionBlockId === undefined ? {} : { captionBlockId }),
        columns,
        rows: normalizedRows,
        cells,
        rawRepresentation: candidate.raw,
      });
      section.tableIds.push(id);
      if (
        (rawRows.length === 0 && rawCells.length === 0) ||
        rawRows.some((row) => row.length !== columns.length)
      )
        warnings.push({
          code: "malformed_table",
          severity: "warning",
          message:
            "Table structure was incomplete; missing cells were preserved as empty values.",
          pageStart: candidate.page,
          pageEnd: candidate.page,
          sectionId,
          tableId: id,
        });
      continue;
    }
    const id = deterministicId(
      `${input.artifactId}:block:${candidate.page}:${candidate.order}:${candidate.kind}:${candidate.text ?? ""}`,
    );
    const base = {
      id,
      sectionId,
      order: section.blockIds.length + 1,
      pageStart: candidate.page,
      pageEnd: candidate.page,
    } as const;
    let block: ContentBlock;
    if (candidate.kind === "list_item" || candidate.kind === "list-item")
      block = { ...base, kind: "list", items: [candidate.text ?? "Item"] };
    else if (candidate.kind === "formula" || candidate.kind === "equation")
      block = {
        ...base,
        kind: "equation",
        latex: candidate.text ?? "\\text{Unparsed equation}",
      };
    else if (candidate.kind === "caption")
      block = { ...base, kind: "caption", text: candidate.text ?? "Caption" };
    else if (supportedKinds.has(candidate.kind))
      block = { ...base, kind: "paragraph", text: candidate.text ?? "" };
    else {
      block = {
        ...base,
        kind: "unsupported",
        parserKind: candidate.kind,
        rawRepresentation: candidate.raw,
      };
      warnings.push({
        code: "unknown_block",
        severity: "warning",
        message: `Unsupported parser block kind: ${candidate.kind}.`,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        sectionId,
        blockId: id,
      });
    }
    // Empty known text is still traceable rather than silently discarded.
    if (block.kind === "paragraph" && block.text.length === 0) {
      block = {
        ...base,
        kind: "unsupported",
        parserKind: candidate.kind,
        rawRepresentation: candidate.raw,
      };
      warnings.push({
        code: "unknown_block",
        severity: "warning",
        message: `Parser block ${candidate.kind} had no usable text.`,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        sectionId,
        blockId: id,
      });
    }
    blocks.push(block);
    section.blockIds.push(id);
    if (block.kind === "caption") {
      const figure = [...figures]
        .reverse()
        .find(
          (entry) =>
            entry.sectionId === sectionId &&
            entry.pageStart === candidate.page &&
            entry.captionBlockId === undefined,
        );
      if (figure !== undefined) figure.captionBlockId = block.id;
      else {
        const table = [...tables]
          .reverse()
          .find(
            (entry) =>
              entry.sectionId === sectionId &&
              entry.pageStart === candidate.page &&
              entry.captionBlockId === undefined,
          );
        if (table !== undefined) table.captionBlockId = block.id;
      }
    }
  }
  if (sections.length === 0) ensureRoot(1);
  const media = extractDoclingFigureAssets({
    artifactId: input.artifactId,
    canonicalJson: input.canonicalJson,
  });
  const assetsByFigureId = new Map(
    media.assets.map((asset) => [asset.figureId, asset]),
  );
  for (const figure of figures) {
    const asset = assetsByFigureId.get(figure.id);
    if (asset !== undefined)
      Object.assign(figure, {
        asset: {
          checksumSha256: asset.checksumSha256,
          contentType: asset.contentType,
          byteLength: asset.body.byteLength,
          ...(asset.width === undefined ? {} : { width: asset.width }),
          ...(asset.height === undefined ? {} : { height: asset.height }),
        },
      } satisfies Pick<ExtractedFigure, "asset">);
  }
  for (const warning of media.warnings) {
    const figure = figures.find((entry) => entry.id === warning.figureId);
    if (figure === undefined) continue;
    warnings.push({
      code: "malformed_media",
      severity: "warning",
      message: warning.message,
      pageStart: warning.page,
      pageEnd: warning.page,
      sectionId: figure.sectionId,
      figureId: figure.id,
    });
  }
  for (const figure of figures)
    if (figure.captionBlockId === undefined)
      warnings.push({
        code: "missing_caption",
        severity: "warning",
        message: "Figure did not include a usable caption.",
        pageStart: figure.pageStart,
        pageEnd: figure.pageEnd,
        sectionId: figure.sectionId,
        figureId: figure.id,
      });
  for (const table of tables)
    if (table.captionBlockId === undefined)
      warnings.push({
        code: "missing_caption",
        severity: "warning",
        message: "Table did not include a usable caption.",
        pageStart: table.pageStart,
        pageEnd: table.pageEnd,
        sectionId: table.sectionId,
        tableId: table.id,
      });
  const document = {
    schemaVersion: normalizedDocumentVersion,
    id: deterministicId(`${input.artifactId}:normalized-document`),
    sourceDocumentId: input.sourceDocumentId,
    parsedDocumentVersion: 1,
    language: "en" as const,
    pageCount: Math.max(1, input.pageCount),
    title: sections[0]?.heading,
    sections,
    blocks,
    figures,
    tables,
    warnings,
  };
  return normalizedDocumentSchema.parse(document);
}
