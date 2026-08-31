import { createId } from "@avlp/config";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  extractDoclingFigureAssets,
  normalizeDoclingOutput,
} from "./docling-normalizer.js";

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

  it("extracts inline figure metadata, captions, and nearby section associations", () => {
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 1,
      canonicalJson: {
        texts: [
          { label: "heading", text: "Plant cells", page: 1 },
          {
            label: "picture",
            caption: { text: "Figure 1: A plant cell" },
            image:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1nAAAAABJRU5ErkJggg==",
            self_ref: "#/pictures/0",
            page: 1,
          },
        ],
      },
    });
    const figure = normalized.figures[0]!;
    expect(figure).toMatchObject({
      sectionId: normalized.sections[0]!.id,
      altText: "Figure 1: A plant cell",
      sourceLocator: "#/pictures/0",
      asset: { contentType: "image/png", byteLength: 70, width: 1, height: 1 },
    });
    expect(figure.captionBlockId).toBeDefined();
    expect(normalized.blocks).toContainEqual(
      expect.objectContaining({ id: figure.captionBlockId, kind: "caption" }),
    );
    expect(normalized.sections[0]!.figureIds).toEqual([figure.id]);
    expect(normalized.warnings).not.toContainEqual(
      expect.objectContaining({ code: "malformed_media" }),
    );
  });

  it("preserves table order, raw representation, and reports malformed media", () => {
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 1,
      canonicalJson: {
        texts: [
          { label: "heading", text: "Results", page: 1 },
          {
            label: "table",
            text: "Table 1: Results",
            data: { table_cells: [["Name", "Value"], ["Leaf"]] },
            page: 1,
          },
          { label: "picture", image: "not-a-valid-image", page: 1 },
        ],
      },
    });
    const table = normalized.tables[0]!;
    expect(table.rows).toEqual([
      ["Name", "Value"],
      ["Leaf", ""],
    ]);
    expect(table.cells).toEqual([
      { row: 0, column: 0, text: "Name", rowSpan: 1, columnSpan: 1 },
      { row: 0, column: 1, text: "Value", rowSpan: 1, columnSpan: 1 },
      { row: 1, column: 0, text: "Leaf", rowSpan: 1, columnSpan: 1 },
    ]);
    expect(table.rawRepresentation).toMatchObject({
      data: { table_cells: [["Name", "Value"], ["Leaf"]] },
    });
    expect(normalized.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "malformed_table", tableId: table.id }),
        expect.objectContaining({
          code: "malformed_media",
          figureId: normalized.figures[0]!.id,
        }),
      ]),
    );
  });
  it("follows Docling body references and ignores container groups", () => {
    // Real Docling output links children as `{ "$ref": ... }` and wraps them in
    // groups whose labels are container labels, not content labels.
    const canonical = {
      body: {
        self_ref: "#/body",
        label: "unspecified",
        name: "_root_",
        children: [{ $ref: "#/texts/0" }, { $ref: "#/groups/0" }],
      },
      groups: [
        {
          self_ref: "#/groups/0",
          label: "list",
          name: "list",
          children: [{ $ref: "#/texts/1" }, { $ref: "#/texts/2" }],
        },
      ],
      texts: [
        {
          self_ref: "#/texts/0",
          label: "section_header",
          level: 1,
          text: "Water cycle",
          prov: [{ page_no: 1 }],
        },
        {
          self_ref: "#/texts/1",
          label: "list_item",
          text: "Evaporation",
          prov: [{ page_no: 1 }],
        },
        {
          self_ref: "#/texts/2",
          label: "list_item",
          text: "Condensation",
          prov: [{ page_no: 1 }],
        },
      ],
    };
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 1,
      canonicalJson: canonical,
    });
    expect(normalized.sections.map((section) => section.heading)).toEqual([
      "Water cycle",
    ]);
    expect(normalized.blocks.map((block) => block.kind)).toEqual([
      "list",
      "list",
    ]);
    expect(normalized.warnings).toEqual([]);
  });

  it("reads embedded figure bytes and owner captions from Docling floating items", () => {
    // A 1x1 PNG, the smallest byte sequence that still carries a real header.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const canonical = {
      body: {
        self_ref: "#/body",
        label: "unspecified",
        children: [{ $ref: "#/pictures/0" }, { $ref: "#/texts/0" }],
      },
      texts: [
        {
          self_ref: "#/texts/0",
          label: "caption",
          text: "Figure 1: The water cycle.",
          prov: [{ page_no: 1 }],
        },
      ],
      pictures: [
        {
          self_ref: "#/pictures/0",
          label: "picture",
          prov: [{ page_no: 1 }],
          captions: [{ $ref: "#/texts/0" }],
          image: {
            mimetype: "image/png",
            dpi: 72,
            size: { width: 1, height: 1 },
            uri: `data:image/png;base64,${png}`,
          },
        },
      ],
    };
    const normalized = normalizeDoclingOutput({
      artifactId,
      sourceDocumentId,
      pageCount: 1,
      canonicalJson: canonical,
    });
    const figure = normalized.figures[0]!;
    expect(figure.altText).toBe("Figure 1: The water cycle.");
    expect(figure.asset).toMatchObject({
      contentType: "image/png",
      width: 1,
      height: 1,
    });
    // The caption belongs to the figure, so it is not also a standalone block.
    expect(normalized.blocks.filter((block) => block.kind === "caption")).toHaveLength(1);
    expect(normalized.warnings).toEqual([]);
    const assets = extractDoclingFigureAssets({
      artifactId,
      canonicalJson: canonical,
    }).assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]!.contentType).toBe("image/png");
  });
});
