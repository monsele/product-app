import { describe, expect, it } from "vitest";
import {
  reviewTableSchema,
  tableCellCorrectionInputSchema,
  tableCellCorrectionMaxLength,
  tableCellRestoreInputSchema,
} from "./index.js";

const tableId = "019ffbf1-dddd-7000-8000-000000000117";

describe("ST-117 table-cell correction contracts", () => {
  it("accepts a bounded one-line correction and trims it", () => {
    const parsed = tableCellCorrectionInputSchema.parse({
      rowIndex: 1,
      columnIndex: 2,
      revision: 0,
      correctedText: "  0.534 ",
    });
    expect(parsed.correctedText).toBe("0.534");
  });

  it("keeps the text as text: it is not parsed or validated as a number", () => {
    expect(
      tableCellCorrectionInputSchema.safeParse({
        rowIndex: 0,
        columnIndex: 0,
        revision: 3,
        correctedText: "about half",
      }).success,
    ).toBe(true);
  });

  it("allows an empty cell, which is real table structure", () => {
    expect(
      tableCellCorrectionInputSchema.parse({
        rowIndex: 0,
        columnIndex: 0,
        revision: 1,
        correctedText: "   ",
      }).correctedText,
    ).toBe("");
  });

  it("rejects text longer than the preview bound", () => {
    expect(tableCellCorrectionMaxLength).toBe(160);
    expect(
      tableCellCorrectionInputSchema.safeParse({
        rowIndex: 0,
        columnIndex: 0,
        revision: 0,
        correctedText: "x".repeat(161),
      }).success,
    ).toBe(false);
  });

  it("rejects line breaks and other control characters", () => {
    for (const correctedText of ["0.5\n3", "0.5\t3", "0.5\u00003"])
      expect(
        tableCellCorrectionInputSchema.safeParse({
          rowIndex: 0,
          columnIndex: 0,
          revision: 0,
          correctedText,
        }).success,
      ).toBe(false);
  });

  it("rejects negative positions, negative revisions and unknown fields", () => {
    const base = { rowIndex: 0, columnIndex: 0, revision: 0, correctedText: "1" };
    for (const body of [
      { ...base, rowIndex: -1 },
      { ...base, columnIndex: -1 },
      { ...base, revision: -1 },
      { ...base, rowIndex: 1.5 },
      { ...base, rowSpan: 2 },
    ])
      expect(tableCellCorrectionInputSchema.safeParse(body).success).toBe(false);
  });

  it("requires a position and revision to restore, and nothing else", () => {
    expect(
      tableCellRestoreInputSchema.safeParse({
        rowIndex: 0,
        columnIndex: 1,
        revision: 2,
      }).success,
    ).toBe(true);
    expect(
      tableCellRestoreInputSchema.safeParse({ rowIndex: 0, revision: 2 })
        .success,
    ).toBe(false);
    expect(
      tableCellRestoreInputSchema.safeParse({
        rowIndex: 0,
        columnIndex: 1,
        revision: 2,
        correctedText: "x",
      }).success,
    ).toBe(false);
  });

  it("carries active and restored overlays on a review table", () => {
    const table = reviewTableSchema.parse({
      id: tableId,
      order: 1,
      pageStart: 2,
      pageEnd: 2,
      columns: ["Metal", "Density"],
      rows: [["Lithium", "0.53"]],
      cellCorrections: [
        { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
        { rowIndex: 0, columnIndex: 0, revision: 2, correctedText: null },
      ],
    });
    expect(table.cellCorrections).toHaveLength(2);
    expect(
      reviewTableSchema.safeParse({
        ...table,
        cellCorrections: [
          { rowIndex: 0, columnIndex: 1, revision: 0, correctedText: "x" },
        ],
      }).success,
    ).toBe(false);
  });
});
