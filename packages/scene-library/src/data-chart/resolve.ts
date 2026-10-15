/**
 * ST-114 — resolve a data-chart scene against the assets its preview or
 * render manifest carries.
 *
 * The scene's `chart-table` binding is the only route to its table, and the
 * manifest resolves that binding inside the project's own approved snapshot.
 * A table from another project therefore never reaches this function: it is
 * simply missing, and the chart is refused (AC8).
 */
import {
  dataChartTableSlot,
  resolveDataChart,
  type DataChartFailure,
  type PreviewAsset,
  type ResolvedDataChart,
  type SceneSpec,
} from "@avlp/schemas";

export type SceneChartResolution =
  | Readonly<{ ok: true; chart: ResolvedDataChart }>
  | Readonly<{ ok: false; failure: DataChartFailure | MissingChartTable }>;

export type MissingChartTable = Readonly<{
  code: "table_missing";
  message: string;
  fieldPath: string;
}>;

export function resolveSceneChart(
  scene: SceneSpec,
  assets: Readonly<Record<string, Readonly<PreviewAsset>>> | undefined,
): SceneChartResolution {
  if (scene.template !== "data-chart")
    throw new Error("resolveSceneChart requires a data-chart scene.");
  const binding = scene.assetBindings.find(
    (entry) => entry.slot === dataChartTableSlot && entry.assetId === scene.visual.tableId,
  );
  const asset = binding === undefined ? undefined : assets?.[binding.assetId];
  if (
    binding === undefined ||
    asset === undefined ||
    asset.assetId !== binding.assetId ||
    asset.source !== "source_table" ||
    asset.table === undefined
  )
    return {
      ok: false,
      failure: {
        code: "table_missing",
        fieldPath: binding === undefined ? "assetBindings.chart-table" : "resolvedAssets.chart-table",
        message:
          binding === undefined
            ? "Choose an approved source table for this chart."
            : "The chart's source table is not in this project's approved source.",
      },
    };
  return resolveDataChart(asset.table, scene.visual);
}
