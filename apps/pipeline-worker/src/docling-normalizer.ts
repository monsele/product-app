import { createHash } from "node:crypto";
import type { Identifier } from "@avlp/config";
import {
  normalizedDocumentSchema,
  normalizedDocumentVersion,
  type ContentBlock,
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
      figures.push({
        id,
        sectionId,
        order: figures.length + 1,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        ...(candidate.text === undefined ? {} : { altText: candidate.text }),
      });
      section.figureIds.push(id);
      continue;
    }
    if (candidate.kind === "table") {
      const id = deterministicId(
        `${input.artifactId}:table:${candidate.page}:${candidate.order}`,
      );
      const data = record(candidate.raw.data);
      const rows = Array.isArray(data?.table_cells)
        ? data!.table_cells
            .filter(Array.isArray)
            .map((row) => row.map((cell) => String(cell)))
        : [[candidate.text ?? "Table"]];
      const columns = rows[0]?.map((_, index) => `Column ${index + 1}`) ?? [
        "Column 1",
      ];
      tables.push({
        id,
        sectionId,
        order: tables.length + 1,
        pageStart: candidate.page,
        pageEnd: candidate.page,
        columns,
        rows,
      });
      section.tableIds.push(id);
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
  }
  if (sections.length === 0) ensureRoot(1);
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
