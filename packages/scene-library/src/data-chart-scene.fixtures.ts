import {
  dataChartTableSlot,
  type PreviewAsset,
  type SceneSpec,
} from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

type DataChartScene = Extract<SceneSpec, { template: "data-chart" }>;

export const dataChartFixtureTableId = "019ffbf1-eeee-7000-8000-0000000007a0";
const documentId = "019ffbf1-eeee-7000-8000-0000000007a1";
const blockId = "019ffbf1-eeee-7000-8000-0000000007a2";

const tableSourceRef = Object.freeze({
  documentId,
  parsedDocumentVersion: 1,
  pageStart: 3,
  blockIds: [blockId],
  tableIds: [dataChartFixtureTableId],
});

/** The approved source table the fixtures chart, as a preview asset. */
export const dataChartFixtureTable = Object.freeze({
  tableId: dataChartFixtureTableId,
  columns: ["Element", "Density (g/cm³)", "Melting point (°C)", "Reactivity rank", "Notes"],
  rows: [
    ["Lithium", "0.53", "180.5", "4", "lightest metal"],
    ["Sodium", "0.97", "97.8", "3", "stored in oil"],
    ["Potassium", "0.86", "63.5", "2", "lilac flame"],
    ["Rubidium", "1.53", "39.3", "1", "very soft"],
    ["Caesium", "1.93", "28.5", "1", "golden"],
    ["Francium (predicted from periodic trends)", "1.87", "27", "1", "radioactive"],
    ["Hydrogen under extreme pressure in planetary cores", "0.6", "-259", "5", "not a metal"],
    ["Beryllium", "1.85", "1,287", "6", "group 2"],
  ],
});

export const dataChartFixtureAssets: Readonly<Record<string, PreviewAsset>> = Object.freeze({
  [dataChartFixtureTableId]: {
    assetId: dataChartFixtureTableId,
    altText: "Table: alkali metal properties",
    provenance: "source_table",
    source: "source_table",
    table: {
      ...dataChartFixtureTable,
      columns: [...dataChartFixtureTable.columns],
      rows: dataChartFixtureTable.rows.map((row) => [...row]),
      rowCount: dataChartFixtureTable.rows.length,
      truncated: false,
    },
  },
});

const base = createDefaultScene("data-chart");

function chartScene(visual: Partial<DataChartScene["visual"]>, title: string): DataChartScene {
  return Object.freeze({
    ...base,
    title,
    narration:
      "Lithium is the least dense of these metals. Sodium is denser. Potassium is a little lighter than sodium. Caesium is the densest of all.",
    durationSeconds: 14,
    assetBindings: [
      {
        assetId: dataChartFixtureTableId,
        role: "diagram",
        slot: dataChartTableSlot,
        provenance: "source_table",
        visualRole: "grounding_critical",
        sourceRef: tableSourceRef,
      },
    ],
    sourceRefs: [tableSourceRef],
    visual: {
      tableId: dataChartFixtureTableId,
      chartKind: "bar",
      categoryColumn: 0,
      valueColumns: [1],
      rowIndexes: [0, 1, 2, 4],
      ...visual,
    },
  }) as DataChartScene;
}

/** A single-series bar chart with a highlighted category. */
export const barDataChartFixture = chartScene(
  { highlightCategory: 4, unitLabel: "grams per cm³" },
  "Density rises down the group",
);

/** A single-series line chart. */
export const lineDataChartFixture = chartScene(
  { chartKind: "line", valueColumns: [2], rowIndexes: [0, 1, 2, 3, 4] },
  "Melting points fall down the group",
);

/** The maximum: 8 categories × 3 series, including two very long labels. */
export const maximumDataChartFixture = chartScene(
  {
    valueColumns: [1, 2, 3],
    rowIndexes: [0, 1, 2, 3, 4, 5, 6, 7],
    highlightCategory: 1,
  },
  "Alkali metals compared",
);

/** A chart that selects a non-numeric column: blocked in validation. */
export const nonNumericDataChartFixture = chartScene(
  { valueColumns: [4] },
  "Notes are not numbers",
);
