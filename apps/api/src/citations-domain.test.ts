import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  sourceSnapshotSchema,
  type SourceRef,
  type SourceSnapshot,
} from "@avlp/schemas";
import { resolveSourceRefsAgainstSnapshot } from "./source-snapshot.js";

const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000001";
const sectionId: Identifier = "019ffbf1-1111-7000-8000-000000000001";
const blockId: Identifier = "019ffbf1-aaaa-7000-8000-000000000001";
const figureId: Identifier = "019ffbf1-dddd-7000-8000-000000000001";
const tableId: Identifier = "019ffbf1-eeee-7000-8000-000000000001";

function snapshot(overrides: Partial<SourceSnapshot> = {}): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: "019ffbf1-9999-7000-8000-000000000001",
    projectId: "019ffbf1-5555-7000-8000-000000000001",
    sourceDocumentId: "019ffbf1-4444-7000-8000-000000000001",
    parsedDocumentId,
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy: "019ffbf1-6666-7000-8000-000000000001",
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: [
      {
        sectionId,
        order: 1,
        level: 1,
        heading: "Introduction",
        pageStart: 1,
        pageEnd: 2,
        reviewOrder: null,
        blockIds: [blockId],
        figureIds: [figureId],
        tableIds: [tableId],
      },
    ],
    blocks: [
      {
        blockId,
        sectionId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water evaporates when heated.",
        corrected: false,
        revision: 0,
      },
    ],
    figures: [
      {
        figureId,
        sectionId,
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        altText: "Water cycle diagram",
        revision: 0,
      },
    ],
    tables: [
      {
        tableId,
        sectionId,
        order: 1,
        pageStart: 2,
        pageEnd: 2,
        columns: ["State", "Example"],
        rows: [["Gas", "Vapour"]],
      },
    ],
    ...overrides,
  });
}

function ref(overrides: Partial<SourceRef> = {}): SourceRef {
  return {
    documentId: parsedDocumentId,
    parsedDocumentVersion: 1,
    pageStart: 1,
    pageEnd: 2,
    sectionId,
    blockIds: [blockId],
    figureIds: [figureId],
    tableIds: [tableId],
    ...overrides,
  };
}

describe("resolveSourceRefsAgainstSnapshot", () => {
  it("resolves a valid reference to labels and excerpts", () => {
    const citation = resolveSourceRefsAgainstSnapshot(snapshot(), [ref()])[0]!;
    expect(citation.issues).toEqual([]);
    expect(citation.sectionHeading).toBe("Introduction");
    expect(citation.blocks).toEqual([
      {
        blockId,
        sectionId,
        kind: "paragraph",
        page: 1,
        text: "Water evaporates when heated.",
      },
    ]);
    expect(citation.figures).toEqual([
      {
        figureId,
        sectionId,
        page: 1,
        altText: "Water cycle diagram",
      },
    ]);
    expect(citation.tables).toEqual([
      { tableId, sectionId, page: 2, columns: ["State", "Example"] },
    ]);
  });

  it("reports a document mismatch without resolving blocks", () => {
    const citation = resolveSourceRefsAgainstSnapshot(snapshot(), [
      ref({ documentId: "019ffbf1-0000-7000-8000-000000000099" }),
    ])[0]!;
    expect(citation.issues).toContainEqual({
      kind: "document_mismatch",
      id: "019ffbf1-0000-7000-8000-000000000099",
    });
  });

  it("reports a version mismatch", () => {
    const citation = resolveSourceRefsAgainstSnapshot(snapshot(), [
      ref({ parsedDocumentVersion: 2 }),
    ])[0]!;
    expect(citation.issues).toContainEqual({
      kind: "version_mismatch",
      id: parsedDocumentId,
    });
  });

  it("reports missing section, block, figure, and table ids", () => {
    const citation = resolveSourceRefsAgainstSnapshot(snapshot(), [
      ref({
        sectionId: "019ffbf1-1111-7000-8000-000000000099",
        blockIds: ["019ffbf1-aaaa-7000-8000-000000000099"],
        figureIds: ["019ffbf1-dddd-7000-8000-000000000099"],
        tableIds: ["019ffbf1-eeee-7000-8000-000000000099"],
      }),
    ])[0]!;
    expect(citation.issues).toEqual(
      expect.arrayContaining([
        { kind: "missing_section", id: "019ffbf1-1111-7000-8000-000000000099" },
        { kind: "missing_block", id: "019ffbf1-aaaa-7000-8000-000000000099" },
        { kind: "missing_figure", id: "019ffbf1-dddd-7000-8000-000000000099" },
        { kind: "missing_table", id: "019ffbf1-eeee-7000-8000-000000000099" },
      ]),
    );
    expect(citation.blocks).toEqual([]);
    expect(citation.figures).toEqual([]);
    expect(citation.tables).toEqual([]);
  });

  it("resolves a reference without a section id", () => {
    const citation = resolveSourceRefsAgainstSnapshot(snapshot(), [
      ref({ sectionId: undefined }),
    ])[0]!;
    expect(citation.sectionHeading).toBeUndefined();
    expect(citation.issues).toEqual([]);
  });
});
