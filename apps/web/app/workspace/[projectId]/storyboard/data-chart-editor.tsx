"use client";

/**
 * ST-114 — the scene editor for a `data-chart` scene. Every chart field is a
 * picker over an approved source table: the table, the category column, the
 * value columns, the rows and the highlighted category. There is no number
 * entry anywhere; the values shown are the table's own cells. The server
 * records the chart's table binding and citation when the scene is saved.
 */
import React, { useEffect, useState, type JSX } from "react";
import {
  dataChartMaxRows,
  dataChartMaxSeries,
  dataChartMinRows,
  dataChartTableSlot,
  dataChartUnselectedTableId,
  parseDataChartNumber,
  type SceneSpec,
  type SourceVisualPickerEntry,
} from "@avlp/schemas";
import { fetchSourceVisuals } from "./storyboard-scene-query";

type ChartScene = Extract<SceneSpec, { template: "data-chart" }>;
type ChartVisual = ChartScene["visual"];
type TableEntry = Extract<SourceVisualPickerEntry, { kind: "table" }>;
export type ChartGrid = NonNullable<TableEntry["chartGrid"]>;

/** The approved tables a chart can use. */
export function chartTableEntries(
  entries: readonly SourceVisualPickerEntry[],
): readonly (TableEntry & { chartGrid: ChartGrid })[] {
  return entries.filter(
    (entry): entry is TableEntry & { chartGrid: ChartGrid } =>
      entry.kind === "table" && entry.chartGrid !== undefined,
  );
}

/**
 * Applies a picker change to the scene. Choosing a new table resets the
 * column and row choices to the table's first numeric column and first rows,
 * and binds the chart-table slot to it (the server adds the citation).
 */
export function writeDataChartVisual(
  scene: ChartScene,
  patch: Partial<ChartVisual>,
  grid?: ChartGrid,
): ChartScene {
  const changesTable = patch.tableId !== undefined && patch.tableId !== scene.visual.tableId;
  let visual: ChartVisual = { ...scene.visual, ...patch };
  // A chart always keeps at least one value column and two rows, so no picker
  // change can leave a selection the schema refuses.
  if (visual.categoryColumn !== scene.visual.categoryColumn) {
    const remaining = visual.valueColumns.filter((column) => column !== visual.categoryColumn);
    const replacement =
      remaining.length > 0
        ? undefined
        : (grid?.numericColumns.find((column) => column !== visual.categoryColumn) ??
          scene.visual.valueColumns.find((column) => column !== visual.categoryColumn));
    visual =
      remaining.length > 0
        ? { ...visual, valueColumns: remaining }
        : replacement === undefined
          ? { ...visual, categoryColumn: scene.visual.categoryColumn }
          : { ...visual, valueColumns: [replacement] };
  }
  if (visual.valueColumns.length === 0) visual = { ...visual, valueColumns: scene.visual.valueColumns };
  if (visual.rowIndexes.length < dataChartMinRows) visual = { ...visual, rowIndexes: scene.visual.rowIndexes };
  if (changesTable && grid !== undefined) {
    // Labels default to the first non-numeric column, values to the first
    // numeric column after it.
    const labels = grid.columns.findIndex((_, index) => !grid.numericColumns.includes(index));
    const category = labels < 0 ? 0 : labels;
    const value = grid.numericColumns.find((index) => index !== category) ?? 1;
    visual = {
      tableId: patch.tableId!,
      chartKind: visual.chartKind,
      categoryColumn: category,
      valueColumns: [value],
      rowIndexes: grid.rows.slice(0, Math.min(dataChartMaxRows, grid.rows.length)).map((_, index) => index),
      ...(visual.unitLabel === undefined ? {} : { unitLabel: visual.unitLabel }),
    };
  }
  if (visual.highlightCategory !== undefined && !visual.rowIndexes.includes(visual.highlightCategory)) {
    const rest: ChartVisual = { ...visual };
    delete rest.highlightCategory;
    visual = rest;
  }
  const others = scene.assetBindings.filter((binding) => binding.slot !== dataChartTableSlot);
  const assetBindings =
    visual.tableId === dataChartUnselectedTableId
      ? others
      : [...others, { assetId: visual.tableId, role: "diagram" as const, slot: dataChartTableSlot }];
  return { ...scene, visual, assetBindings };
}

/** The cells the chart will draw, with any that are not numbers flagged. */
export function dataChartCellPreview(
  grid: ChartGrid,
  visual: ChartVisual,
): readonly { row: number; label: string; cells: readonly { column: number; text: string; numeric: boolean }[] }[] {
  return visual.rowIndexes.map((row) => ({
    row,
    label: grid.rows[row]?.[visual.categoryColumn] ?? "",
    cells: visual.valueColumns.map((column) => {
      const text = grid.rows[row]?.[column] ?? "";
      return { column, text, numeric: parseDataChartNumber(text) !== undefined };
    }),
  }));
}

function toggle(values: readonly number[], value: number, limit: number): number[] {
  if (values.includes(value)) return values.filter((entry) => entry !== value);
  if (values.length >= limit) return [...values];
  return [...values, value].sort((left, right) => left - right);
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--color-text-muted, #BDB5C7)",
};
const helpStyle: React.CSSProperties = {
  display: "block",
  marginTop: "4px",
  fontSize: "11px",
  fontWeight: 400,
  color: "var(--color-text-muted, #BDB5C7)",
};
const errorStyle: React.CSSProperties = {
  display: "block",
  marginTop: "4px",
  color: "#FCA5A5",
  fontSize: "11px",
};

export function DataChartEditorView({
  disabled,
  entries,
  inputStyle,
  onChange,
  scene,
  status,
}: {
  disabled: boolean;
  entries: readonly SourceVisualPickerEntry[];
  inputStyle: React.CSSProperties;
  onChange: (scene: ChartScene) => void;
  scene: ChartScene;
  status: "loading" | "loaded" | "error";
}): JSX.Element {
  const tables = chartTableEntries(entries);
  const selected = tables.find((entry) => entry.tableId === scene.visual.tableId);
  const grid = selected?.chartGrid;
  const preview = grid === undefined ? [] : dataChartCellPreview(grid, scene.visual);
  const problems = preview.flatMap((row) =>
    row.cells
      .filter((cell) => !cell.numeric)
      .map((cell) => `Row ${row.row + 1}, column "${grid?.columns[cell.column] ?? cell.column + 1}" ${cell.text.trim() === "" ? "is blank" : `contains "${cell.text}"`}, which is not a number.`),
  );
  const write = (patch: Partial<ChartVisual>, nextGrid?: ChartGrid) =>
    onChange(writeDataChartVisual(scene, patch, nextGrid ?? grid));
  return (
    <fieldset
      data-testid="data-chart-editor"
      disabled={disabled}
      style={{
        border: "1px solid var(--color-border, #3A3046)",
        borderRadius: "8px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        margin: 0,
        padding: "12px",
      }}
    >
      <legend style={{ ...labelStyle, padding: "0 4px" }}>Chart data</legend>
      <label style={labelStyle}>
        Source table
        <select
          aria-label="Source table"
          value={selected === undefined ? "" : selected.tableId}
          onChange={(event) => {
            const next = tables.find((entry) => entry.tableId === event.target.value);
            if (next !== undefined) write({ tableId: next.tableId }, next.chartGrid);
          }}
          style={inputStyle}
        >
          <option value="">{status === "loading" ? "Loading approved tables…" : "Choose a table"}</option>
          {tables.map((entry) => (
            <option key={entry.tableId} value={entry.tableId}>
              {`Page ${entry.pageStart}${entry.sectionHeading === undefined ? "" : ` · ${entry.sectionHeading}`} · ${entry.columns.slice(0, 3).join(", ")}`}
            </option>
          ))}
        </select>
        <small style={helpStyle}>
          {status === "error"
            ? "Approved tables could not be loaded. Reload the scene to try again."
            : tables.length === 0 && status === "loaded"
              ? "The approved source has no table with a numeric column."
              : "Only tables from the approved source with a numeric column are listed."}
        </small>
      </label>
      {grid === undefined ? null : (
        <>
          <label style={labelStyle}>
            Category column
            <select
              aria-label="Category column"
              value={scene.visual.categoryColumn}
              onChange={(event) => {
                // writeDataChartVisual moves the value column off the new
                // category column, or keeps the old one if none is left.
                write({ categoryColumn: Number(event.target.value) });
              }}
              style={inputStyle}
            >
              {grid.columns.map((column, index) => (
                <option key={index} value={index}>
                  {column}
                </option>
              ))}
            </select>
          </label>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={labelStyle}>Value columns (up to {dataChartMaxSeries})</legend>
            {grid.columns.map((column, index) => {
              const numeric = grid.numericColumns.includes(index);
              const checked = scene.visual.valueColumns.includes(index);
              return index === scene.visual.categoryColumn ? null : (
                <label key={index} style={{ ...labelStyle, fontWeight: checked ? 700 : 500, marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    // The last value column cannot be cleared.
                    disabled={!numeric || (checked && scene.visual.valueColumns.length === 1)}
                    onChange={() =>
                      write({ valueColumns: toggle(scene.visual.valueColumns, index, dataChartMaxSeries) })
                    }
                  />{" "}
                  {column}
                  {numeric ? "" : " (not numeric)"}
                </label>
              );
            })}
          </fieldset>
          <fieldset style={{ border: "none", margin: 0, padding: 0 }}>
            <legend style={labelStyle}>Rows (2 to {dataChartMaxRows}, in table order)</legend>
            {grid.rows.map((row, index) => {
              const checked = scene.visual.rowIndexes.includes(index);
              return (
                <label key={index} style={{ ...labelStyle, fontWeight: checked ? 700 : 500, marginTop: "4px" }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    // A chart needs at least two rows.
                    disabled={checked && scene.visual.rowIndexes.length <= dataChartMinRows}
                    onChange={() =>
                      write({ rowIndexes: toggle(scene.visual.rowIndexes, index, dataChartMaxRows) })
                    }
                  />{" "}
                  {row[scene.visual.categoryColumn] || `Row ${index + 1}`}
                </label>
              );
            })}
          </fieldset>
          <label style={labelStyle}>
            Highlighted category
            <select
              aria-label="Highlighted category"
              value={scene.visual.highlightCategory ?? ""}
              onChange={(event) =>
                write(
                  event.target.value === ""
                    ? { highlightCategory: undefined }
                    : { highlightCategory: Number(event.target.value) },
                )
              }
              style={inputStyle}
            >
              <option value="">None</option>
              {scene.visual.rowIndexes.map((row) => (
                <option key={row} value={row}>
                  {grid.rows[row]?.[scene.visual.categoryColumn] || `Row ${row + 1}`}
                </option>
              ))}
            </select>
          </label>
          <table data-testid="data-chart-cell-preview" style={{ borderCollapse: "collapse", fontSize: "12px", width: "100%" }}>
            <caption style={{ ...labelStyle, textAlign: "left", marginBottom: "4px" }}>Values the chart will show</caption>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{grid.columns[scene.visual.categoryColumn]}</th>
                {scene.visual.valueColumns.map((column) => (
                  <th key={column} style={{ textAlign: "right" }}>
                    {grid.columns[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.row}>
                  <td>{row.label}</td>
                  {row.cells.map((cell) => (
                    <td
                      data-numeric={cell.numeric ? "true" : "false"}
                      key={cell.column}
                      style={{ textAlign: "right", color: cell.numeric ? "inherit" : "#FCA5A5" }}
                    >
                      {cell.text}
                      {cell.numeric ? "" : " ⚠"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {problems.length === 0 ? null : (
            <span role="alert" style={errorStyle}>
              {problems[0]} Choose another row or column; the chart cannot be shown until every value is a number.
            </span>
          )}
        </>
      )}
    </fieldset>
  );
}

export function DataChartEditor({
  disabled,
  inputStyle,
  onChange,
  projectId,
  scene,
}: {
  disabled: boolean;
  inputStyle: React.CSSProperties;
  onChange: (scene: ChartScene) => void;
  projectId: string;
  scene: ChartScene;
}): JSX.Element {
  const [entries, setEntries] = useState<readonly SourceVisualPickerEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  useEffect(() => {
    let active = true;
    setStatus("loading");
    void fetchSourceVisuals(projectId)
      .then((response) => {
        if (active) {
          setEntries(response.entries);
          setStatus("loaded");
        }
      })
      .catch(() => {
        if (active) {
          setEntries([]);
          setStatus("error");
        }
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  return (
    <DataChartEditorView
      disabled={disabled}
      entries={entries}
      inputStyle={inputStyle}
      onChange={onChange}
      scene={scene}
      status={status}
    />
  );
}
