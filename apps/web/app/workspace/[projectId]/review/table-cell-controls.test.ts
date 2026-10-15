import { describe, expect, it } from "vitest";
import type { ReviewTable } from "@avlp/schemas";
import {
  buildTableCellRequest,
  correctedCellText,
  coveredCellKeys,
  effectiveCellText,
  tableCellRevision,
} from "./table-cell-controls";

const table: ReviewTable = {
  id: "019ffbf1-4444-7000-8000-000000000117",
  order: 1,
  pageStart: 2,
  pageEnd: 2,
  columns: ["Metal", "Density"],
  rows: [
    ["Lithium", "0.53"],
    ["Sodium", "0.97"],
  ],
  cellCorrections: [
    { rowIndex: 0, columnIndex: 1, revision: 2, correctedText: "0.534" },
    { rowIndex: 1, columnIndex: 1, revision: 3, correctedText: null },
  ],
};

describe("table cell controls", () => {
  it("shows the correction when active and the original otherwise", () => {
    expect(effectiveCellText(table, 0, 1)).toBe("0.534");
    expect(effectiveCellText(table, 1, 1)).toBe("0.97");
    expect(effectiveCellText(table, 0, 0)).toBe("Lithium");
    expect(correctedCellText(table, 1, 1)).toBeNull();
  });

  it("carries the cell's revision, including a restored cell's, and 0 when never corrected", () => {
    expect(tableCellRevision(table, 0, 1)).toBe(2);
    expect(tableCellRevision(table, 1, 1)).toBe(3);
    expect(tableCellRevision(table, 0, 0)).toBe(0);
  });

  it("builds the correction command with the trimmed text and current revision", () => {
    expect(
      buildTableCellRequest(table, {
        kind: "edit",
        rowIndex: 1,
        columnIndex: 1,
        correctedText: " 0.968 ",
      }),
    ).toEqual({
      path: `/source-tables/${table.id}/cells`,
      method: "PATCH",
      body: { rowIndex: 1, columnIndex: 1, revision: 3, correctedText: "0.968" },
    });
  });

  it("builds the restore command for a corrected cell", () => {
    expect(
      buildTableCellRequest(table, { kind: "restore", rowIndex: 0, columnIndex: 1 }),
    ).toEqual({
      path: `/source-tables/${table.id}/cells/restore`,
      method: "POST",
      body: { rowIndex: 0, columnIndex: 1, revision: 2 },
    });
  });

  it("finds positions covered by a merged cell, but not where it starts", () => {
    const covered = coveredCellKeys({
      cells: [
        { rowIndex: 0, columnIndex: 0, text: "Lithium", rowSpan: 2, columnSpan: 2 },
        { rowIndex: 2, columnIndex: 0, text: "Sodium", rowSpan: 1, columnSpan: 1 },
      ],
    });
    expect([...covered].sort()).toEqual(["0:1", "1:0", "1:1"]);
    expect(coveredCellKeys({}).size).toBe(0);
  });
});
