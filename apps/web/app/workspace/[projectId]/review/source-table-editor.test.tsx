import type { ReviewTable } from "@avlp/schemas";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditableSourceTable } from "./source-table-editor";

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
  cells: [
    { rowIndex: 0, columnIndex: 0, text: "Lithium", rowSpan: 1, columnSpan: 1 },
    { rowIndex: 0, columnIndex: 1, text: "0.53", rowSpan: 1, columnSpan: 1 },
    { rowIndex: 1, columnIndex: 0, text: "Sodium", rowSpan: 1, columnSpan: 2 },
  ],
  cellCorrections: [
    { rowIndex: 0, columnIndex: 1, revision: 1, correctedText: "0.534" },
  ],
};

const render = (props: Partial<Parameters<typeof EditableSourceTable>[0]> = {}) =>
  renderToStaticMarkup(
    <EditableSourceTable table={table} onCorrect={() => undefined} {...props} />,
  );

describe("EditableSourceTable", () => {
  it("shows a corrected cell beside its original, with a restore action", () => {
    const html = render();
    expect(html).toContain('data-cell="0:1" data-corrected="true"');
    expect(html).toContain("0.534");
    expect(html).toContain("Corrected");
    expect(html).toContain("Original: ");
    expect(html).toContain(">0.53</span>");
    expect(html).toContain('aria-label="Restore the original text of row 1, column 2"');
    expect(html).toContain("1 cell corrected.");
  });

  it("offers every uncorrected cell for correction without a restore action", () => {
    const html = render();
    expect(html).toContain('data-cell="0:0" data-corrected="false"');
    expect(html).toContain('aria-label="Correct row 1, column 1: Lithium"');
    expect(html).not.toContain("Restore the original text of row 1, column 1");
  });

  it("does not offer a position covered by a merged cell", () => {
    const html = render();
    expect(html).toContain('data-cell="1:0"');
    expect(html).not.toContain('data-cell="1:1"');
    expect(html).not.toContain("Correct row 2, column 2");
  });

  it("opens a labelled, bounded editor prefilled with the current text", () => {
    const html = render({ initialEditing: { rowIndex: 0, columnIndex: 1 } });
    expect(html).toContain("Corrected text for row 1, column 2");
    expect(html).toContain('maxLength="160"');
    expect(html).toContain('value="0.534"');
    expect(html).toContain(">Save</button>");
    expect(html).toContain(">Cancel</button>");
  });

  it("keeps column headings as headings, not editable cells", () => {
    const html = render();
    expect(html).toContain('<th scope="col"');
    expect(html).not.toContain("Correct Metal");
  });
});
