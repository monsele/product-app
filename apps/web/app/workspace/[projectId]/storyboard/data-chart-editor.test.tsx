import {
  createDefaultStoryboardSceneSpec,
  sceneSpecSchema,
  type SceneSpec,
  type SourceVisualPickerEntry,
} from "@avlp/schemas";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  chartTableEntries,
  DataChartEditorView,
  dataChartCellPreview,
  writeDataChartVisual,
} from "./data-chart-editor";
import { editorFieldsForScene } from "./scene-editor-form";

type ChartScene = Extract<SceneSpec, { template: "data-chart" }>;

const tableId = "019ffbf1-4444-7000-8000-000000000901";
const grid = {
  columns: ["Metal", "Density", "Notes"],
  rows: [
    ["Lithium", "0.53", "light"],
    ["Sodium", "0.97", "soft"],
    ["Potassium", "0.86", "lilac"],
  ],
  numericColumns: [1],
};
const entries: SourceVisualPickerEntry[] = [
  {
    kind: "table",
    tableId,
    sectionId: "019ffbf1-2222-7000-8000-000000000901",
    sectionHeading: "Metals",
    pageStart: 2,
    columns: grid.columns,
    rowCount: 3,
    chartGrid: grid,
  },
  {
    kind: "table",
    tableId: "019ffbf1-4444-7000-8000-000000000902",
    sectionId: "019ffbf1-2222-7000-8000-000000000901",
    pageStart: 3,
    columns: ["Name", "Role"],
    rowCount: 2,
  },
];

const blank = createDefaultStoryboardSceneSpec("data-chart", {
  id: "019ffbf1-7777-7000-8000-000000000901",
  order: 1,
  durationSeconds: 20,
}) as ChartScene;

describe("ST-114 data-chart editor", () => {
  it("lists only tables that can back a chart", () => {
    expect(chartTableEntries(entries).map((entry) => entry.tableId)).toEqual([tableId]);
  });

  it("choosing a table picks label and numeric columns, binds the table and stays valid", () => {
    const next = writeDataChartVisual(blank, { tableId }, grid);
    expect(next.visual).toMatchObject({ tableId, categoryColumn: 0, valueColumns: [1], rowIndexes: [0, 1, 2] });
    expect(next.assetBindings).toEqual([{ assetId: tableId, role: "diagram", slot: "chart-table" }]);
    expect(sceneSpecSchema.safeParse(next).success).toBe(true);
  });

  it("drops a highlight whose row is no longer charted", () => {
    const chosen = writeDataChartVisual(blank, { tableId }, grid);
    const highlighted = writeDataChartVisual(chosen, { highlightCategory: 2 });
    expect(highlighted.visual.highlightCategory).toBe(2);
    const fewer = writeDataChartVisual(highlighted, { rowIndexes: [0, 1] });
    expect(fewer.visual.highlightCategory).toBeUndefined();
  });

  it("never leaves a selection the schema refuses", () => {
    const chosen = writeDataChartVisual(blank, { tableId }, grid);
    // Clearing the last value column or dropping below two rows is ignored.
    expect(writeDataChartVisual(chosen, { valueColumns: [] }, grid).visual.valueColumns).toEqual([1]);
    expect(writeDataChartVisual(chosen, { rowIndexes: [0] }, grid).visual.rowIndexes).toEqual([0, 1, 2]);
    // Making the only value column the category moves the value to another
    // numeric column, or keeps the old category when there is none.
    const twoNumeric = { ...grid, numericColumns: [1, 2] };
    const moved = writeDataChartVisual(chosen, { categoryColumn: 1 }, twoNumeric);
    expect(moved.visual).toMatchObject({ categoryColumn: 1, valueColumns: [2] });
    const kept = writeDataChartVisual(chosen, { categoryColumn: 1 }, grid);
    expect(kept.visual).toMatchObject({ categoryColumn: 0, valueColumns: [1] });
    for (const scene of [moved, kept]) expect(sceneSpecSchema.safeParse(scene).success).toBe(true);
  });

  it("disables the controls that would clear the last value column or row", () => {
    // Choosing a table resets the rows, so pick two rows afterwards.
    const scene = writeDataChartVisual(
      writeDataChartVisual(blank, { tableId }, grid),
      { rowIndexes: [0, 1] },
      grid,
    );
    const markup = renderToStaticMarkup(
      <DataChartEditorView
        disabled={false}
        entries={entries}
        inputStyle={{}}
        onChange={() => undefined}
        scene={scene}
        status="loaded"
      />,
    );
    const inputs = markup.match(/<input[^>]*>/gu) ?? [];
    const locked = inputs.filter((input) => input.includes('checked=""') && input.includes('disabled=""'));
    // The single value column and both chosen rows are checked and disabled;
    // the unchosen third row can still be added.
    expect(locked).toHaveLength(3);
    expect(inputs.filter((input) => input.includes('checked=""'))).toHaveLength(3);
  });

  it("flags a non-numeric cell before the teacher saves", () => {
    const preview = dataChartCellPreview(grid, { ...blank.visual, tableId, valueColumns: [2], rowIndexes: [0] });
    expect(preview).toEqual([
      { row: 0, label: "Lithium", cells: [{ column: 2, text: "light", numeric: false }] },
    ]);
  });

  it("edits chart references only through table pickers, never a number field", () => {
    const paths = editorFieldsForScene(blank).map((field) => field.path);
    expect(paths).toContain("visual.chartKind");
    expect(paths).toContain("visual.unitLabel");
    for (const picker of ["visual.tableId", "visual.categoryColumn", "visual.valueColumns", "visual.rowIndexes", "visual.highlightCategory"])
      expect(paths).not.toContain(picker);
    const scene = writeDataChartVisual(blank, { tableId, valueColumns: [1, 2] }, grid);
    const markup = renderToStaticMarkup(
      <DataChartEditorView
        disabled={false}
        entries={entries}
        inputStyle={{}}
        onChange={() => undefined}
        scene={{ ...scene, visual: { ...scene.visual, valueColumns: [2] } }}
        status="loaded"
      />,
    );
    expect(markup).not.toMatch(/type="number"/u);
    expect(markup).toContain("Source table");
    expect(markup).toContain("(not numeric)");
    expect(markup).toContain('Row 1, column &quot;Notes&quot; contains &quot;light&quot;, which is not a number.');
  });
});
