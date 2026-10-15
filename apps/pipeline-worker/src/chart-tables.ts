/**
 * ST-114 — the approved tables a storyboard or scene-regeneration prompt may
 * chart, and the deterministic rules for the `data-chart` scenes it returns.
 *
 * The model sees each chart-eligible table as an indexed grid (the bounded
 * view the preview manifest carries) and answers with references only. The
 * job then copies nothing from the model: every value is resolved from the
 * approved snapshot table by `resolveDataChart`, and a scene whose selection
 * is not numeric is refused (and offered back to the model to repair) before
 * anything is saved. Application code, not the model, adds the scene's
 * table binding and table citation.
 */
import { promptVersionRank } from "@avlp/provider-adapters";
import {
  boundedDataChartTable,
  dataChartAltText,
  dataChartNumericColumns,
  dataChartTableSlot,
  firstSnapshotBlockIdBySection,
  isDataChartEligibleTable,
  resolveDataChart,
  sourceTableCitation,
  withSourceTableCitation,
  type DataChartTable,
  type DataChartVisual,
  type SceneAssetBinding,
  type SourcePackage,
  type SourceRef,
  type SourceSnapshot,
} from "@avlp/schemas";

function promptVersionRankSafe(version: string): number | undefined {
  try {
    return promptVersionRank(version);
  } catch {
    return undefined;
  }
}

export type ChartTableContext = Readonly<{
  table: DataChartTable;
  sourceRef: SourceRef;
  caption: string | undefined;
}>;

/** Prompt versions written against the chart-aware catalogue. */
export function promptOffersDataCharts(promptId: string, promptVersion: string): boolean {
  const rank = promptVersionRankSafe(promptVersion);
  if (rank === undefined) return false;
  if (promptId === "storyboard") return rank >= 4;
  if (promptId === "scene-regeneration") return rank >= 3;
  return false;
}

/** At most this many tables are offered to one prompt. */
export const chartPromptMaxTables = 8;
/** At most this many characters of headers and cells, across every offered
 * table, go into `{{tables}}` (about 6,000 tokens). */
export const chartPromptMaxCharacters = 24_000;

const gridCharacters = (table: DataChartTable): number =>
  table.columns.reduce((total, column) => total + column.length, 0) +
  table.rows.reduce(
    (total, row) => total + row.reduce((sum, cell) => sum + cell.length, 0),
    0,
  );

/**
 * The approved snapshot's chart-eligible tables, each with the citation a
 * chart of it carries: the table's own page and section, and its caption
 * block (or the first block of its section) as the cited block.
 *
 * Only tables in the source package's sections are offered: the prompt may
 * use no other source context. The offer is bounded so a table-heavy document
 * cannot grow the prompt without limit: tables are taken in reading order, at
 * most `chartPromptMaxTables` of them, skipping any whose grid would take the
 * total past `chartPromptMaxCharacters`.
 */
export function chartTablesFromSnapshot(
  snapshot: SourceSnapshot,
  sourcePackage: SourcePackage,
): readonly ChartTableContext[] {
  const firstBlockIdBySection = firstSnapshotBlockIdBySection(snapshot);
  const packageSections = new Set(sourcePackage.sections.map((section) => section.sectionId));
  const textByBlock = new Map<string, string>();
  for (const block of snapshot.blocks)
    if ("text" in block && typeof block.text === "string") textByBlock.set(block.blockId, block.text);
  const offered: ChartTableContext[] = [];
  let characters = 0;
  const tables = [...snapshot.tables].sort((left, right) => left.order - right.order);
  for (const table of tables) {
    if (offered.length >= chartPromptMaxTables) break;
    if (!packageSections.has(table.sectionId)) continue;
    const bounded = boundedDataChartTable({
      tableId: table.tableId,
      columns: table.columns,
      rows: table.rows,
    });
    if (!isDataChartEligibleTable(bounded)) continue;
    const size = gridCharacters(bounded);
    if (characters + size > chartPromptMaxCharacters) continue;
    // The package's document identity is the snapshot's parsed document.
    const sourceRef = sourceTableCitation({
      parsedDocumentId: sourcePackage.normalizedDocumentId,
      parsedDocumentVersion: sourcePackage.parsedDocumentVersion,
      table,
      firstBlockIdBySection,
    });
    if (sourceRef === undefined) continue;
    const caption =
      table.captionBlockId === undefined ? undefined : textByBlock.get(table.captionBlockId);
    characters += size;
    offered.push({ table: bounded, sourceRef, caption: caption?.slice(0, 300) });
  }
  return offered;
}

/** The `{{tables}}` prompt variable: indexed grids the model may chart. */
export function chartTablesPromptVariable(tables: readonly ChartTableContext[]): string {
  return JSON.stringify(
    tables.map(({ table, sourceRef, caption }) => {
      const numeric = new Set(dataChartNumericColumns(table));
      return {
        tableId: table.tableId,
        page: sourceRef.pageStart,
        ...(caption === undefined ? {} : { caption }),
        columns: table.columns.map((name, index) => ({
          index,
          name,
          numeric: numeric.has(index),
        })),
        rows: table.rows.map((cells, index) => ({ index, cells })),
      };
    }),
  );
}

export type ChartSceneLike = Readonly<{
  template: string;
  visual: unknown;
}>;

/**
 * Model-facing reason a chart scene cannot be drawn, or `undefined` when every
 * selected cell resolves. A table the prompt did not offer is refused like a
 * foreign table. Like every deterministic-check message it is built only from
 * IDs and indexes: it becomes job error metadata when repairs run out, so it
 * must never quote a cell or column name. The model already has the indexed
 * grid, so indexes are all it needs to repair the selection; the teacher-facing
 * message naming the cell comes from lesson validation.
 */
export function chartSceneProblem(
  scene: ChartSceneLike,
  tables: readonly ChartTableContext[],
): string | undefined {
  if (scene.template !== "data-chart") return undefined;
  const visual = scene.visual as Parameters<typeof resolveDataChart>[1];
  const offered = tables.find((entry) => entry.table.tableId === visual.tableId);
  if (offered === undefined)
    return `tableId ${visual.tableId} is not one of the tables listed in the request; chart only a listed table.`;
  const resolution = resolveDataChart(offered.table, visual);
  if (resolution.ok) return undefined;
  const { code, fieldPath, rowIndex, columnIndex } = resolution.failure;
  const reason =
    code === "non_numeric_cell"
      ? `the cell at row index ${rowIndex} and column index ${columnIndex} is not a number`
      : code === "missing_category"
        ? `the category cell at row index ${rowIndex} and column index ${columnIndex} is blank`
        : code === "row_out_of_range"
          ? `row index ${rowIndex} is not in the listed grid`
          : code === "column_out_of_range"
            ? `column index ${columnIndex} is not in the listed grid`
            : "the chart does not match its table";
  return `${fieldPath}: ${reason}. Choose only columns marked numeric and rows whose cells in those columns are numbers.`;
}

/**
 * The table binding and citation application code adds to a chart scene. The
 * binding's alt text is the chart summary read from the table, so the lesson
 * stores a text equivalent of the chart.
 */
export function chartSceneGrounding(
  visual: DataChartVisual,
  tables: readonly ChartTableContext[],
): Readonly<{ binding: SceneAssetBinding; sourceRef: SourceRef }> {
  const offered = tables.find((entry) => entry.table.tableId === visual.tableId);
  if (offered === undefined)
    throw new Error(`Chart table ${visual.tableId} is not in the approved snapshot.`);
  return {
    binding: {
      assetId: visual.tableId,
      role: "diagram",
      slot: dataChartTableSlot,
      provenance: "source_table",
      visualRole: "grounding_critical",
      sourceRef: offered.sourceRef,
      altText: dataChartAltText(offered.table, visual),
    },
    sourceRef: offered.sourceRef,
  };
}


/** A chart scene's citations with its table cited (see `withSourceTableCitation`). */
export function withChartCitation(
  sourceRefs: readonly SourceRef[],
  tableRef: SourceRef,
): SourceRef[] {
  return withSourceTableCitation(sourceRefs, tableRef);
}
