"use client";

import React, { useState } from "react";
import { tableCellCorrectionMaxLength, type ReviewTable } from "@avlp/schemas";
import {
  cellKey,
  correctedCellText,
  coveredCellKeys,
  type TableCellAction,
} from "./table-cell-controls";

/**
 * ST-117. An extracted table whose cells can be corrected inline. A
 * corrected cell shows the teacher's text, a "Corrected" marker, the parser's
 * original text and a restore action, so the immutable original is always
 * visible. Column headings and merged-over positions are not editable.
 */
export function EditableSourceTable({
  table,
  onCorrect,
  initialEditing,
}: {
  table: ReviewTable;
  onCorrect: (table: ReviewTable, action: TableCellAction) => void;
  /** Opens one cell's editor on first render (used by static tests). */
  initialEditing?: { rowIndex: number; columnIndex: number };
}) {
  const [editing, setEditing] = useState<string | null>(
    initialEditing === undefined
      ? null
      : cellKey(initialEditing.rowIndex, initialEditing.columnIndex),
  );
  const covered = coveredCellKeys(table);
  const correctedCount = (table.cellCorrections ?? []).filter(
    (overlay) => overlay.correctedText !== null,
  ).length;

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={`Table with ${table.columns.length} columns`}
      data-corrected-cells={correctedCount}
      style={{
        overflowX: "auto",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-control)",
      }}
    >
      <table
        data-table-id={table.id}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "13px",
          textAlign: "left",
        }}
      >
        <caption
          style={{
            captionSide: "bottom",
            textAlign: "left",
            padding: "8px 14px",
            fontSize: "12px",
            color: "var(--color-text-muted)",
          }}
        >
          Page {table.pageStart}. Select a cell to correct its text.
          {correctedCount > 0
            ? ` ${correctedCount} ${correctedCount === 1 ? "cell" : "cells"} corrected.`
            : ""}
        </caption>
        <thead>
          <tr style={{ backgroundColor: "var(--color-surface-subtle)" }}>
            {table.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                style={{
                  padding: "10px 14px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              style={{
                borderBottom:
                  rowIndex === table.rows.length - 1
                    ? "none"
                    : "1px solid var(--color-border)",
              }}
            >
              {row.map((original, columnIndex) => {
                const key = cellKey(rowIndex, columnIndex);
                const corrected = correctedCellText(
                  table,
                  rowIndex,
                  columnIndex,
                );
                const position = `row ${rowIndex + 1}, column ${columnIndex + 1}`;
                if (covered.has(key))
                  return (
                    <td
                      key={columnIndex}
                      style={{ padding: "8px 14px", color: "var(--color-text)" }}
                    >
                      {original}
                    </td>
                  );
                return (
                  <td
                    key={columnIndex}
                    data-cell={key}
                    data-corrected={corrected !== null}
                    style={{
                      padding: "6px 10px",
                      verticalAlign: "top",
                      color: "var(--color-text)",
                      backgroundColor:
                        corrected !== null
                          ? "var(--color-surface-brand)"
                          : undefined,
                      boxShadow:
                        corrected !== null
                          ? "inset 2px 0 0 var(--color-brand)"
                          : undefined,
                    }}
                  >
                    {editing === key ? (
                      <CellEditor
                        position={position}
                        initial={corrected ?? original}
                        onCancel={() => setEditing(null)}
                        onSave={(correctedText) => {
                          setEditing(null);
                          onCorrect(table, {
                            kind: "edit",
                            rowIndex,
                            columnIndex,
                            correctedText,
                          });
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Correct ${position}: ${corrected ?? original}`}
                          onClick={() => setEditing(key)}
                          style={{
                            all: "unset",
                            cursor: "text",
                            padding: "2px 4px",
                            borderRadius: "4px",
                            minHeight: "18px",
                            minWidth: "24px",
                          }}
                        >
                          {corrected ?? original}
                        </button>
                        {corrected !== null ? (
                          <span
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "center",
                              gap: "6px",
                              fontSize: "11px",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: 600,
                                color: "var(--color-brand)",
                              }}
                            >
                              Corrected
                            </span>
                            <span>
                              Original:{" "}
                              <span style={{ textDecoration: "line-through" }}>
                                {original === "" ? "(empty)" : original}
                              </span>
                            </span>
                            <button
                              type="button"
                              aria-label={`Restore the original text of ${position}`}
                              onClick={() =>
                                onCorrect(table, {
                                  kind: "restore",
                                  rowIndex,
                                  columnIndex,
                                })
                              }
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "var(--color-brand)",
                                cursor: "pointer",
                              }}
                            >
                              Restore original
                            </button>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CellEditor({
  position,
  initial,
  onSave,
  onCancel,
}: {
  position: string;
  initial: string;
  onSave: (correctedText: string) => void;
  onCancel: () => void;
}) {
  const inputId = `cell-editor-${position.replace(/\W+/g, "-")}`;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSave(String(data.get("correctedText") ?? ""));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
      style={{ display: "flex", flexDirection: "column", gap: "6px" }}
    >
      <label
        htmlFor={inputId}
        style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text)" }}
      >
        Corrected text for {position}
      </label>
      <input
        id={inputId}
        name="correctedText"
        defaultValue={initial}
        maxLength={tableCellCorrectionMaxLength}
        autoFocus
        style={{
          minWidth: "120px",
          padding: "4px 8px",
          fontSize: "13px",
          borderRadius: "var(--radius-control)",
          border: "1px solid var(--color-border)",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
        }}
      />
      <span style={{ display: "inline-flex", gap: "6px" }}>
        <button
          type="submit"
          style={{
            padding: "3px 10px",
            fontSize: "12px",
            fontWeight: 600,
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-brand)",
            backgroundColor: "var(--color-brand)",
            color: "var(--color-on-brand)",
            cursor: "pointer",
          }}
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: "3px 10px",
            fontSize: "12px",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            color: "var(--color-text)",
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </span>
    </form>
  );
}
