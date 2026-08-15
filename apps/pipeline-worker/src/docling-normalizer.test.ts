import { createId } from "@avlp/config";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeDoclingOutput } from "./docling-normalizer.js";

const artifactId = createId(new Date("2026-08-15T09:00:00.000Z"));
const sourceDocumentId = createId(new Date("2026-08-15T09:00:01.000Z"));

describe("Docling normalized-document adapter", () => {
  it("matches the recorded Docling golden fixture", async () => {
    const fixture = JSON.parse(
      await readFile(
        new URL("./fixtures/docling-normalizer-golden.json", import.meta.url),
        "utf8",
      ),
    ) as {
      canonicalJson: unknown;
      expected: { headings: string[]; blockKinds: string[]; pages: number[] };
    };
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 2,
      canonicalJson: fixture.canonicalJson,
    });
    expect(normalized.sections.map((section) => section.heading)).toEqual(
      fixture.expected.headings,
    );
    expect(normalized.blocks.map((block) => block.kind)).toEqual(
      fixture.expected.blockKinds,
    );
    expect(normalized.blocks.map((block) => block.pageStart)).toEqual(
      fixture.expected.pages,
    );
  });

  it("creates deterministic hierarchy, reading order, provenance, and IDs", () => {
    const canonical = {
      texts: [
        { label: "title", text: "Water cycle", prov: [{ page_no: 1 }] },
        { label: "text", text: "Water evaporates.", prov: [{ page_no: 1 }] },
        {
          label: "section_header",
          level: 2,
          text: "Condensation",
          prov: [{ page_no: 2 }],
        },
        { label: "list_item", text: "Clouds form", prov: [{ page_no: 2 }] },
      ],
    };
    const first = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 2,
      canonicalJson: canonical,
    });
    const second = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 2,
      canonicalJson: canonical,
    });

    expect(second).toEqual(first);
    expect(first.sections).toMatchObject([
      { heading: "Water cycle", level: 1, pageStart: 1 },
      {
        heading: "Condensation",
        parentSectionId: first.sections[0]!.id,
        level: 2,
        pageStart: 2,
      },
    ]);
    expect(first.blocks).toMatchObject([
      { kind: "paragraph", pageStart: 1, text: "Water evaporates." },
      { kind: "list", pageStart: 2, items: ["Clouds form"] },
    ]);
  });

  it("removes repeated page-margin text while retaining repeated body content", () => {
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 2,
      canonicalJson: {
        texts: [
          { label: "text", text: "Textbook header", page: 1 },
          { label: "text", text: "Same body sentence", page: 1 },
          { label: "text", text: "End one", page: 1 },
          { label: "text", text: "Textbook header", page: 2 },
          { label: "text", text: "Same body sentence", page: 2 },
          { label: "text", text: "End two", page: 2 },
        ],
      },
    });
    const text = normalized.blocks.flatMap((block) =>
      block.kind === "list" ? block.items : "text" in block ? [block.text] : [],
    );
    expect(text).not.toContain("Textbook header");
    expect(text).toContain("Same body sentence");
  });

  it("retains unsupported parser blocks with a traceable warning", () => {
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 1,
      canonicalJson: {
        texts: [{ label: "barcode", text: "QR payload", page: 1 }],
      },
    });
    const block = normalized.blocks[0]!;
    expect(block).toMatchObject({ kind: "unsupported", parserKind: "barcode" });
    expect(normalized.warnings).toMatchObject([
      { code: "unknown_block", blockId: block.id },
    ]);
  });
});
