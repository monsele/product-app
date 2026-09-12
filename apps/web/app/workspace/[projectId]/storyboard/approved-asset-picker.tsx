import React, { type JSX } from "react";
import type { AssetCatalogEntry } from "@avlp/schemas";
import styles from "./storyboard.module.css";

export function ApprovedAssetPicker({
  assets,
  disabled,
  onChange,
  onTagFilterChange,
  selectedId,
  slot,
  tagFilter,
}: {
  assets: readonly AssetCatalogEntry[];
  disabled: boolean;
  onChange: (assetId: string) => void;
  onTagFilterChange: (value: string) => void;
  selectedId: string;
  slot: string;
  tagFilter: string;
}): JSX.Element {
  const selected = assets.find((asset) => asset.id === selectedId);
  return (
    <label className={styles.assetPicker}>
      <span className={styles.assetPickerTitle}>Approved asset: {slot}</span>
      <span className={styles.assetPickerLabel}>Filter by tags</span>
      <input
        aria-label={`Filter approved assets by tags: ${slot}`}
        className={styles.assetPickerInput}
        data-testid={`asset-tag-filter-${slot}`}
        disabled={disabled}
        onChange={(event) => onTagFilterChange(event.target.value)}
        placeholder="e.g. water, science"
        value={tagFilter}
      />
      <select
        aria-label={`Approved asset: ${slot}`}
        className={styles.assetPickerInput}
        data-testid={`asset-picker-${slot}`}
        value={selectedId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No asset selected</option>
        {selected === undefined && selectedId !== "" ? (
          <option value={selectedId}>Current source figure</option>
        ) : null}
        {assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.tags.join(", ")} ({asset.kind})
          </option>
        ))}
      </select>
      {selected === undefined ? (
        <small className={styles.assetPickerHint}>Choose an approved compatible asset, then save the scene.</small>
      ) : (
        <small className={styles.assetPickerProvenance} data-testid={`asset-provenance-${slot}`}>
          {selected.source} · {selected.license} ·{" "}
          {selected.usageConstraints.join(" ")}
        </small>
      )}
    </label>
  );
}
