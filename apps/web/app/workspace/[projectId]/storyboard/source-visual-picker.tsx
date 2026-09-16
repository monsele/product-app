"use client";

import React, { useEffect, useMemo, useState, type JSX } from "react";
import type { SourceVisualPickerEntry } from "@avlp/schemas";
import { fetchSourceVisuals } from "./storyboard-scene-query";
import styles from "./storyboard.module.css";

/**
 * ST-093: the presentational half of the picker. Split out from
 * `SourceVisualPicker` so its "loaded, with a visual selected" appearance can
 * be rendered from concrete props (as `ApprovedAssetPicker` already is) for
 * static-markup Playwright screenshots — `SourceVisualPicker`'s own fetch
 * only resolves after hydration, which this test harness never runs.
 */
export function SourceVisualPickerView({
  disabled,
  entries,
  onChange,
  selectedId,
  slot,
  status,
}: {
  disabled: boolean;
  entries: readonly SourceVisualPickerEntry[];
  onChange: (assetId: string) => void;
  selectedId: string;
  slot: string;
  status: "loading" | "loaded" | "error";
}): JSX.Element {
  const selected = entries.find((entry) =>
    entry.kind === "figure"
      ? entry.figureId === selectedId
      : entry.tableId === selectedId,
  );

  // Open the picker on whichever tab already holds the bound visual. The
  // lazy initializer also makes this correct on first (static) render, when
  // `entries` already carries a bound selection instead of arriving later.
  const [view, setView] = useState<"figure" | "table">(
    () => selected?.kind ?? "figure",
  );
  const [query, setQuery] = useState("");

  const selectedKind = selected?.kind;
  useEffect(() => {
    if (selectedKind !== undefined) setView(selectedKind);
  }, [selectedKind]);

  const filtered = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    return entries
      .filter((entry) => entry.kind === view)
      .filter((entry) => {
        if (trimmedQuery === "") return true;
        const haystack =
          entry.kind === "figure"
            ? `${entry.caption ?? ""} ${entry.sectionHeading ?? ""}`
            : `${entry.columns.join(" ")} ${entry.sectionHeading ?? ""}`;
        return haystack.toLowerCase().includes(trimmedQuery);
      });
  }, [entries, query, view]);

  const selectedInView = filtered.find((entry) =>
    entry.kind === "figure"
      ? entry.figureId === selectedId
      : entry.tableId === selectedId,
  );

  return (
    <fieldset
      className={styles.assetPicker}
      disabled={disabled}
      aria-label={`Source visuals: ${slot}`}
    >
      <legend className={styles.assetPickerTitle}>
        Source visuals: {slot}
      </legend>
      <div
        role="tablist"
        aria-label="Source visual kind"
        style={{ display: "flex", gap: "8px", marginBottom: "8px" }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "figure"}
          data-testid={`source-visual-view-figures-${slot}`}
          onClick={() => setView("figure")}
        >
          Figures
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "table"}
          data-testid={`source-visual-view-tables-${slot}`}
          onClick={() => setView("table")}
        >
          Tables
        </button>
      </div>
      <input
        aria-label={`Search source visuals: ${slot}`}
        className={styles.assetPickerInput}
        data-testid={`source-visual-search-${slot}`}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by caption or heading"
        value={query}
      />
      {status === "loading" ? (
        <p role="status" className={styles.assetPickerStatus}>
          Loading source visuals…
        </p>
      ) : status === "error" ? (
        <p role="alert" className={styles.assetPickerStatus}>
          Source visuals could not be loaded. Try again.
        </p>
      ) : filtered.length === 0 ? (
        <p role="status" className={styles.assetPickerStatus}>
          {entries.filter((entry) => entry.kind === view).length === 0
            ? `No approved ${view === "figure" ? "figures" : "tables"} are available from the current approved source.`
            : "No source visuals match this search."}
        </p>
      ) : (
        <select
          aria-label={`Source visual: ${slot}`}
          className={styles.assetPickerInput}
          data-testid={`source-visual-picker-${slot}`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          value={selectedInView !== undefined ? selectedId : ""}
        >
          <option value="">No source visual selected</option>
          {filtered.map((entry) =>
            entry.kind === "figure" ? (
              <option key={entry.figureId} value={entry.figureId}>
                {entry.caption ?? "Untitled figure"} (page {entry.pageStart})
              </option>
            ) : (
              <option key={entry.tableId} value={entry.tableId}>
                {entry.sectionHeading ?? "Untitled table"} — {entry.rowCount}{" "}
                rows (page {entry.pageStart})
              </option>
            ),
          )}
        </select>
      )}
      {selected !== undefined ? (
        <>
          {selected.kind === "figure" && selected.thumbnailUrl !== undefined ? (
            <img
              alt={selected.caption ?? selected.altText ?? "Source figure"}
              src={selected.thumbnailUrl}
              className={styles.teacherAssetPreview}
            />
          ) : null}
          <small
            className={styles.assetPickerProvenance}
            data-testid={`source-visual-provenance-${slot}`}
          >
            Source-derived · page {selected.pageStart}
            {selected.pageEnd !== undefined && selected.pageEnd !== selected.pageStart
              ? `–${selected.pageEnd}`
              : ""}
            {selected.sectionHeading !== undefined
              ? ` · ${selected.sectionHeading}`
              : ""}
          </small>
        </>
      ) : (
        <small className={styles.assetPickerHint}>
          Choose an approved source figure or table, then save the scene.
        </small>
      )}
    </fieldset>
  );
}

/**
 * ST-093: lets a teacher bind an approved source figure or table to a
 * compatible scene slot. Only visuals in the project's current approved
 * source snapshot are listed. Tables render deterministically at preview and
 * render time — this picker never turns a table into a chart or paraphrases
 * its values.
 */
export function SourceVisualPicker({
  disabled,
  onChange,
  projectId,
  selectedId,
  slot,
}: {
  disabled: boolean;
  onChange: (assetId: string) => void;
  projectId: string;
  selectedId: string;
  slot: string;
}): JSX.Element {
  const [entries, setEntries] = useState<readonly SourceVisualPickerEntry[]>(
    [],
  );
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    "loading",
  );

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
    <SourceVisualPickerView
      disabled={disabled}
      entries={entries}
      onChange={onChange}
      selectedId={selectedId}
      slot={slot}
      status={status}
    />
  );
}
