import { describe, expect, it } from "vitest";
import {
  buildSourcePackage,
  sourceSnapshotSchema,
  storyboardTemplateCatalogFor,
  type SourceRef,
} from "@avlp/schemas";
import {
  chartPromptMaxCharacters,
  chartPromptMaxTables,
  chartSceneGrounding,
  chartSceneProblem,
  chartTablesFromSnapshot,
  chartTablesPromptVariable,
  promptOffersDataCharts,
  withChartCitation,
} from "./chart-tables.js";

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000501";
const sectionA = "019ffbf1-2222-7000-8000-000000000501";
const sectionB = "019ffbf1-2222-7000-8000-000000000502";
const blockA = "019ffbf1-3333-7000-8000-000000000501";
const blockB = "019ffbf1-3333-7000-8000-000000000502";
const caption = "019ffbf1-3333-7000-8000-000000000503";
const fitTable = "019ffbf1-4444-7000-8000-000000000501";
const textTable = "019ffbf1-4444-7000-8000-000000000502";
const wideTable = "019ffbf1-4444-7000-8000-000000000503";

function snapshot(tables: { tableId: string; sectionId: string }[]) {
  const tableIdsOf = (sectionId: string) =>
    tables.filter((table) => table.sectionId === sectionId).map((table) => table.tableId);
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: "019ffbf1-eeee-7000-8000-000000000501",
    projectId: "019ffbf1-ffff-7000-8000-000000000501",
    sourceDocumentId: "019ffbf1-5555-7000-8000-000000000501",
    parsedDocumentId: "019ffbf1-6666-7000-8000-000000000501",
    parsedDocumentVersion: 2,
    contentHash: "a".repeat(64),
    approvedBy: ownerUserId,
    approvedAt: "2026-10-14T10:00:00.000Z",
    sections: [
      { sectionId: sectionA, order: 1, level: 1, heading: "Metals", pageStart: 1, pageEnd: 2, reviewOrder: null, blockIds: [blockA, caption], figureIds: [], tableIds: tableIdsOf(sectionA) },
      { sectionId: sectionB, order: 2, level: 1, heading: "People", pageStart: 3, pageEnd: 3, reviewOrder: null, blockIds: [blockB], figureIds: [], tableIds: tableIdsOf(sectionB) },
    ],
    blocks: [
      { blockId: blockA, sectionId: sectionA, kind: "paragraph", order: 1, pageStart: 1, pageEnd: 1, text: "Metals differ in density.", corrected: false, revision: 0 },
      { blockId: caption, sectionId: sectionA, kind: "caption", order: 2, pageStart: 2, pageEnd: 2, text: "Table 1: Densities.", corrected: false, revision: 0 },
      { blockId: blockB, sectionId: sectionB, kind: "paragraph", order: 3, pageStart: 3, pageEnd: 3, text: "Scientists named the metals.", corrected: false, revision: 0 },
    ],
    figures: [],
    tables,
  });
}

const fit = {
  tableId: fitTable,
  sectionId: sectionA,
  order: 1,
  pageStart: 2,
  pageEnd: 2,
  captionBlockId: caption,
  columns: ["Metal", "Density", "Notes"],
  rows: [
    ["Lithium", "0.53", "light"],
    ["Sodium", "0.97", "soft"],
  ],
};
const nonFit = {
  tableId: textTable,
  sectionId: sectionB,
  order: 2,
  pageStart: 3,
  pageEnd: 3,
  columns: ["Metal", "Discovered by"],
  rows: [
    ["Lithium", "Arfwedson"],
    ["Sodium", "Davy"],
  ],
};

describe("promptOffersDataCharts", () => {
  it("offers charts only to the chart-aware prompt versions", () => {
    expect(promptOffersDataCharts("storyboard", "v4")).toBe(true);
    expect(promptOffersDataCharts("storyboard", "v3")).toBe(false);
    expect(promptOffersDataCharts("scene-regeneration", "v3")).toBe(true);
    expect(promptOffersDataCharts("scene-regeneration", "v2")).toBe(false);
    expect(promptOffersDataCharts("narration", "v9")).toBe(false);
    expect(promptOffersDataCharts("storyboard", "latest")).toBe(false);
  });
});

describe("storyboard-v4-chart-fit-table", () => {
  const source = snapshot([fit]);
  const tables = chartTablesFromSnapshot(source, buildSourcePackage(source));

  it("lists a table with a numeric column and puts data-chart in the catalogue", () => {
    expect(tables.map((entry) => entry.table.tableId)).toEqual([fitTable]);
    expect(storyboardTemplateCatalogFor({ dataCharts: tables.length > 0 }).map((entry) => entry.template)).toContain(
      "data-chart",
    );
    const variable = JSON.parse(chartTablesPromptVariable(tables)) as Array<{
      tableId: string;
      caption?: string;
      columns: { index: number; name: string; numeric: boolean }[];
      rows: { index: number; cells: string[] }[];
    }>;
    expect(variable[0]).toEqual({
      tableId: fitTable,
      page: 2,
      caption: "Table 1: Densities.",
      columns: [
        { index: 0, name: "Metal", numeric: false },
        { index: 1, name: "Density", numeric: true },
        { index: 2, name: "Notes", numeric: false },
      ],
      rows: [
        { index: 0, cells: ["Lithium", "0.53", "light"] },
        { index: 1, cells: ["Sodium", "0.97", "soft"] },
      ],
    });
  });

  it("cites the table at its own page through its caption", () => {
    expect(tables[0]!.sourceRef).toEqual({
      documentId: "019ffbf1-6666-7000-8000-000000000501",
      parsedDocumentVersion: 2,
      pageStart: 2,
      pageEnd: 2,
      sectionId: sectionA,
      blockIds: [caption],
      tableIds: [fitTable],
    });
    const visual = {
      tableId: fitTable,
      chartKind: "bar" as const,
      categoryColumn: 0,
      valueColumns: [1],
      rowIndexes: [0, 1],
    };
    expect(chartSceneGrounding(visual, tables).binding).toMatchObject({
      assetId: fitTable,
      slot: "chart-table",
      provenance: "source_table",
      visualRole: "grounding_critical",
      sourceRef: tables[0]!.sourceRef,
      // The lesson stores a text equivalent of the chart.
      altText: "Bar chart of Density: Lithium 0.53, Sodium 0.97.",
    });
  });

  it("accepts a numeric selection and names the cell of a non-numeric one", () => {
    const scene = (valueColumns: number[]) => ({
      template: "data-chart",
      visual: { tableId: fitTable, chartKind: "bar", categoryColumn: 0, valueColumns, rowIndexes: [0, 1] },
    });
    expect(chartSceneProblem(scene([1]), tables)).toBeUndefined();
    const problem = chartSceneProblem(scene([2]), tables);
    expect(problem).toContain(
      "visual.rowIndexes.0: the cell at row index 0 and column index 2 is not a number.",
    );
    // The message becomes job error metadata: it never quotes source text.
    expect(problem).not.toContain("light");
    expect(problem).not.toContain("Notes");
    expect(chartSceneProblem({ template: "hook", visual: {} }, tables)).toBeUndefined();
  });
});

describe("storyboard-v4-chart-non-fit-table", () => {
  const source = snapshot([nonFit]);
  const tables = chartTablesFromSnapshot(source, buildSourcePackage(source));

  it("lists no table and keeps the ten-template catalogue when no column is numeric", () => {
    expect(tables).toEqual([]);
    expect(chartTablesPromptVariable(tables)).toBe("[]");
    expect(storyboardTemplateCatalogFor({ dataCharts: tables.length > 0 }).map((entry) => entry.template)).not.toContain(
      "data-chart",
    );
  });

  it("refuses a chart of a table that was not offered", () => {
    expect(
      chartSceneProblem(
        {
          template: "data-chart",
          visual: { tableId: textTable, chartKind: "bar", categoryColumn: 0, valueColumns: [1], rowIndexes: [0, 1] },
        },
        tables,
      ),
    ).toContain("is not one of the tables listed");
  });
});

describe("chartTablesFromSnapshot bounds", () => {
  it("offers the same bounded grid the preview manifest carries", () => {
    const wide = {
      tableId: wideTable,
      sectionId: sectionA,
      order: 3,
      pageStart: 2,
      columns: Array.from({ length: 10 }, (_, index) => `C${index}`),
      rows: Array.from({ length: 14 }, (_, row) =>
        Array.from({ length: 10 }, (_, column) => (column === 0 ? `R${row}` : `${row + column}`)),
      ),
    };
    const source = snapshot([wide]);
    const [entry] = chartTablesFromSnapshot(source, buildSourcePackage(source));
    expect(entry!.table.columns).toHaveLength(8);
    expect(entry!.table.rows).toHaveLength(12);
    // No caption: the first block of the table's section is cited.
    expect(entry!.sourceRef.blockIds).toEqual([blockA]);
  });
});

describe("chartTablesFromSnapshot prompt budget", () => {
  const numericTable = (index: number, sectionId = sectionA, filler = "") => ({
    tableId: `019ffbf1-4444-7000-8000-0000000007${String(index).padStart(2, "0")}`,
    sectionId,
    order: index + 10,
    pageStart: 2,
    columns: ["Item", "Value", ...Array.from({ length: filler === "" ? 0 : 6 }, (_, column) => `Note ${column}`)],
    rows: Array.from({ length: filler === "" ? 2 : 12 }, (_, row) => [
      `Row ${row}`,
      `${row + 1}`,
      ...Array.from({ length: filler === "" ? 0 : 6 }, () => filler),
    ]),
  });

  it(`offers at most ${chartPromptMaxTables} tables, in reading order`, () => {
    const source = snapshot(Array.from({ length: 12 }, (_, index) => numericTable(index)));
    const offered = chartTablesFromSnapshot(source, buildSourcePackage(source));
    expect(offered).toHaveLength(chartPromptMaxTables);
    expect(offered.map((entry) => entry.table.tableId)).toEqual(
      Array.from({ length: chartPromptMaxTables }, (_, index) => numericTable(index).tableId),
    );
  });

  it("skips a table that would take the grids past the character budget", () => {
    const filler = "x".repeat(150);
    // Each large grid is about 11,000 characters.
    const large = [0, 1, 2].map((index) => numericTable(index, sectionA, filler));
    const small = numericTable(3);
    const source = snapshot([...large, small]);
    const offered = chartTablesFromSnapshot(source, buildSourcePackage(source));
    // Two large grids fit; the third would exceed the budget; the small one
    // after it still fits.
    expect(offered.map((entry) => entry.table.tableId)).toEqual([
      large[0]!.tableId,
      large[1]!.tableId,
      small.tableId,
    ]);
    const characters = JSON.stringify(offered.map((entry) => entry.table)).length;
    expect(characters).toBeLessThan(chartPromptMaxCharacters * 1.2);
  });

  it("offers only tables in the source package's sections", () => {
    const inScope = numericTable(0, sectionA);
    const outOfScope = numericTable(1, sectionB);
    const source = snapshot([inScope, outOfScope]);
    const full = buildSourcePackage(source);
    const narrowed = { ...full, sections: full.sections.filter((section) => section.sectionId === sectionA) };
    expect(chartTablesFromSnapshot(source, narrowed).map((entry) => entry.table.tableId)).toEqual([
      inScope.tableId,
    ]);
  });
});

describe("withChartCitation", () => {
  const tableRef: SourceRef = {
    documentId: "019ffbf1-6666-7000-8000-000000000501",
    parsedDocumentVersion: 2,
    pageStart: 2,
    pageEnd: 2,
    sectionId: sectionA,
    blockIds: [caption],
    tableIds: [fitTable],
  };
  const sectionRef: SourceRef = { ...tableRef, pageStart: 1, pageEnd: 1, blockIds: [blockA], tableIds: undefined };
  delete (sectionRef as { tableIds?: unknown }).tableIds;

  it("joins the citation of the table's own section, idempotently", () => {
    const once = withChartCitation([sectionRef], tableRef);
    expect(once).toEqual([{ ...sectionRef, pageStart: 1, pageEnd: 2, blockIds: [blockA, caption], tableIds: [fitTable] }]);
    expect(withChartCitation(once, tableRef)).toEqual(once);
  });

  it("appends to other sections and keeps the scene within the grounding limit", () => {
    const others = Array.from({ length: 20 }, (_, index) => ({
      ...sectionRef,
      sectionId: `019ffbf1-2222-7000-8000-0000000006${String(index).padStart(2, "0")}`,
    }));
    const cited = withChartCitation(others, tableRef);
    expect(cited).toHaveLength(20);
    expect(cited.at(-1)).toEqual(tableRef);
  });
});
