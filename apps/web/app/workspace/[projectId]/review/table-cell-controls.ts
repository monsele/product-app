import type { ReviewTable, ReviewTableCellCorrection } from "@avlp/schemas";

export type TableCellAction =
  | {
      kind: "edit";
      rowIndex: number;
      columnIndex: number;
      correctedText: string;
    }
  | { kind: "restore"; rowIndex: number; columnIndex: number };

/** The overlay at a cell, active or restored; undefined when never corrected. */
export function tableCellOverlay(
  table: Pick<ReviewTable, "cellCorrections">,
  rowIndex: number,
  columnIndex: number,
): ReviewTableCellCorrection | undefined {
  return table.cellCorrections?.find(
    (overlay) =>
      overlay.rowIndex === rowIndex && overlay.columnIndex === columnIndex,
  );
}

/** Expected revision for the next command on a cell (0 when never corrected). */
export function tableCellRevision(
  table: Pick<ReviewTable, "cellCorrections">,
  rowIndex: number,
  columnIndex: number,
): number {
  return tableCellOverlay(table, rowIndex, columnIndex)?.revision ?? 0;
}

/** The teacher's text when the cell is corrected, otherwise null. */
export function correctedCellText(
  table: Pick<ReviewTable, "cellCorrections">,
  rowIndex: number,
  columnIndex: number,
): string | null {
  return tableCellOverlay(table, rowIndex, columnIndex)?.correctedText ?? null;
}

/** Effective display text: the correction when active, otherwise the original. */
export function effectiveCellText(
  table: Pick<ReviewTable, "rows" | "cellCorrections">,
  rowIndex: number,
  columnIndex: number,
): string {
  return (
    correctedCellText(table, rowIndex, columnIndex) ??
    table.rows[rowIndex]?.[columnIndex] ??
    ""
  );
}

/**
 * Positions covered by a merged cell that starts elsewhere. They cannot be
 * corrected on their own: the merged cell is corrected where it starts.
 */
export function coveredCellKeys(
  table: Pick<ReviewTable, "cells">,
): ReadonlySet<string> {
  const covered = new Set<string>();
  for (const cell of table.cells ?? [])
    for (let row = cell.rowIndex; row < cell.rowIndex + cell.rowSpan; row += 1)
      for (
        let column = cell.columnIndex;
        column < cell.columnIndex + cell.columnSpan;
        column += 1
      )
        if (row !== cell.rowIndex || column !== cell.columnIndex)
          covered.add(cellKey(row, column));
  return covered;
}

export function cellKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`;
}

/**
 * Maps a teacher action onto the cell command: the path suffix, the method
 * and a body carrying the cell's current revision for optimistic concurrency.
 */
export function buildTableCellRequest(
  table: Pick<ReviewTable, "id" | "cellCorrections">,
  action: TableCellAction,
): {
  path: string;
  method: "PATCH" | "POST";
  body: Record<string, unknown>;
} {
  const base = `/source-tables/${encodeURIComponent(table.id)}/cells`;
  const position = {
    rowIndex: action.rowIndex,
    columnIndex: action.columnIndex,
    revision: tableCellRevision(table, action.rowIndex, action.columnIndex),
  };
  return action.kind === "restore"
    ? { path: `${base}/restore`, method: "POST", body: position }
    : {
        path: base,
        method: "PATCH",
        body: { ...position, correctedText: action.correctedText.trim() },
      };
}
