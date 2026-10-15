/**
 * ST-114 — animated data-chart scenes built from approved source tables.
 *
 * The model never writes a number. A `data-chart` visual names a table, a
 * category column, value columns and rows by index; application code copies
 * every value from the approved table cell and refuses the scene when a
 * selected cell is not a number under one deterministic parse. Everything here
 * is pure so the storyboard job, lesson validation, the editor and both
 * renderers resolve a chart identically.
 */
import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";

/** The display bounds of a source table (ST-093 `sourceTableVisualSchema`):
 * a chart can only reference cells the preview manifest carries. */
export const dataChartMaxTableColumns = 8;
export const dataChartMaxTableRows = 12;
export const dataChartMaxCellLength = 160;
export const dataChartMinRows = 2;
export const dataChartMaxRows = 8;
export const dataChartMaxSeries = 3;
export const dataChartUnitLabelMaxLength = 24;
/** The slot a data-chart scene binds its source table to. */
export const dataChartTableSlot = "chart-table" as const;
/** The table a newly added data-chart scene names until the teacher picks one.
 * No table has this ID, so the scene stays render-blocked until then. */
export const dataChartUnselectedTableId =
  "00000000-0000-7000-8000-000000000000" as const;

export const dataChartKindValues = ["bar", "line"] as const;
export const dataChartKindSchema = z.enum(dataChartKindValues);
export type DataChartKind = z.infer<typeof dataChartKindSchema>;

const columnIndex = z
  .number()
  .int()
  .min(0)
  .max(dataChartMaxTableColumns - 1);
const rowIndex = z
  .number()
  .int()
  .min(0)
  .max(dataChartMaxTableRows - 1);

/**
 * `data-chart` visual. Every field is a reference into an approved table or a
 * closed choice; `.strict()` refuses any extra key, so a model output carrying
 * `values`, `min`, `ticks` or similar fails. `highlightCategory` is the row
 * index of the emphasised category (one of `rowIndexes`), never a label, and
 * `unitLabel` may not contain digits so no figure can enter through it.
 */
export const dataChartVisualSchema = z
  .object({
    tableId: identifierSchema,
    chartKind: dataChartKindSchema,
    categoryColumn: columnIndex,
    valueColumns: z.array(columnIndex).min(1).max(dataChartMaxSeries),
    rowIndexes: z.array(rowIndex).min(dataChartMinRows).max(dataChartMaxRows),
    highlightCategory: rowIndex.optional(),
    unitLabel: z
      .string()
      .trim()
      .min(1)
      .max(dataChartUnitLabelMaxLength)
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.valueColumns).size !== value.valueColumns.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueColumns"],
        message: "Each value column can be charted only once.",
      });
    if (value.valueColumns.includes(value.categoryColumn))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valueColumns"],
        message: "The category column cannot also be a value column.",
      });
    if (new Set(value.rowIndexes).size !== value.rowIndexes.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowIndexes"],
        message: "Each table row can be charted only once.",
      });
    if (
      value.highlightCategory !== undefined &&
      !value.rowIndexes.includes(value.highlightCategory)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["highlightCategory"],
        message: "The highlighted category must be one of the charted rows.",
      });
    if (value.unitLabel !== undefined && /[0-9]/.test(value.unitLabel))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["unitLabel"],
        message:
          "A unit label cannot contain numbers; chart values come only from the source table.",
      });
  });
export type DataChartVisual = z.infer<typeof dataChartVisualSchema>;

/** The table shape a chart resolves against: the approved snapshot table, or
 * the bounded preview copy of it. */
export type DataChartTable = Readonly<{
  tableId: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
}>;

/**
 * The bounded view of an approved table, identical to the preview manifest's
 * source-table truncation (ST-093): the first 12 rows and 8 columns, each cell
 * cut to 160 characters. Charts resolve against this view everywhere, so the
 * job, validation and the renderers can never disagree about a cell.
 */
export function boundedDataChartTable(table: DataChartTable): DataChartTable {
  return {
    tableId: table.tableId,
    columns: table.columns
      .slice(0, dataChartMaxTableColumns)
      .map((column) => column.slice(0, dataChartMaxCellLength)),
    rows: table.rows
      .slice(0, dataChartMaxTableRows)
      .map((row) =>
        row
          .slice(0, dataChartMaxTableColumns)
          .map((cell) => cell.slice(0, dataChartMaxCellLength)),
      ),
  };
}

const currencySymbols = "$£€¥₹₦₩₽¢";
const numberPattern = new RegExp(
  `^([+-])?([${currencySymbols}])?([+-])?((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+)\\s?(%)?$`,
  "u",
);

/**
 * The deterministic numeric parse for a table cell. Accepted: an optional sign,
 * an optional leading currency symbol, digits with correctly grouped `,`
 * thousands separators, an optional `.` decimal part and an optional trailing
 * `%`. Anything else is not a number: a European `0,97` is refused rather than
 * misread as 97, and a currency amount cannot also be a percentage.
 */
export function parseDataChartNumber(cell: string): number | undefined {
  const normalized = cell.trim().replace(/−/gu, "-");
  const match = numberPattern.exec(normalized);
  if (match === null) return undefined;
  const [, leadingSign, currency, innerSign, digits, percent] = match;
  if (leadingSign !== undefined && innerSign !== undefined) return undefined;
  if (currency !== undefined && percent !== undefined) return undefined;
  if (innerSign !== undefined && currency === undefined) return undefined;
  const magnitude = Number((digits ?? "").replace(/,/gu, ""));
  if (!Number.isFinite(magnitude)) return undefined;
  const sign = (leadingSign ?? innerSign) === "-" ? -1 : 1;
  // `-0` would print as "0" but compare unequal under Object.is.
  return magnitude === 0 ? 0 : sign * magnitude;
}

export type DataChartTicks = Readonly<{
  min: number;
  max: number;
  step: number;
  ticks: readonly number[];
}>;

function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / 10 ** exponent;
  const nice = round
    ? fraction < 1.5
      ? 1
      : fraction < 3
        ? 2
        : fraction < 7
          ? 5
          : 10
    : fraction <= 1
      ? 1
      : fraction <= 2
        ? 2
        : fraction <= 5
          ? 5
          : 10;
  return nice * 10 ** exponent;
}

function decimalsOf(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/**
 * Pure "nice ticks" (Heckbert): a rounded axis range that contains
 * `[minimum, maximum]` and evenly spaced round tick values. Ticks are rounded
 * to the step's precision so 0.1 + 0.2 never prints as 0.30000000000000004.
 */
export function niceDataChartTicks(
  minimum: number,
  maximum: number,
  maximumTicks = 5,
): DataChartTicks {
  let low = Math.min(minimum, maximum);
  let high = Math.max(minimum, maximum);
  if (low === high) {
    const pad = low === 0 ? 1 : Math.abs(low) / 2;
    low = low >= 0 && low - pad < 0 ? 0 : low - pad;
    high += pad;
  }
  const range = niceNumber(high - low, false);
  const step = niceNumber(range / Math.max(1, maximumTicks - 1), true);
  const decimals = decimalsOf(step);
  const round = (value: number) => Number(value.toFixed(decimals));
  const niceMin = round(Math.floor(low / step) * step);
  const niceMax = round(Math.ceil(high / step) * step);
  const ticks: number[] = [];
  const count = Math.round((niceMax - niceMin) / step);
  for (let index = 0; index <= count; index += 1)
    ticks.push(round(niceMin + index * step));
  return { min: niceMin, max: niceMax, step, ticks };
}

export type DataChartValue = Readonly<{
  /** The parsed number that positions the mark. */
  value: number;
  /** The cell's own text, shown as the value label so the screen repeats the
   * source exactly. */
  text: string;
}>;
export type DataChartSeries = Readonly<{
  columnIndex: number;
  name: string;
  values: readonly DataChartValue[];
}>;
export type DataChartCategory = Readonly<{ rowIndex: number; label: string }>;
export type ResolvedDataChart = Readonly<{
  tableId: string;
  chartKind: DataChartKind;
  categoryName: string;
  categories: readonly DataChartCategory[];
  series: readonly DataChartSeries[];
  /** Index into `categories` of the highlighted category, if any. */
  highlightIndex: number | undefined;
  unitLabel: string | undefined;
  min: number;
  max: number;
  ticks: readonly number[];
}>;

export const dataChartFailureCodeValues = [
  "table_mismatch",
  "column_out_of_range",
  "row_out_of_range",
  "missing_category",
  "non_numeric_cell",
] as const;
export type DataChartFailureCode = (typeof dataChartFailureCodeValues)[number];
export type DataChartFailure = Readonly<{
  code: DataChartFailureCode;
  /** Teacher-facing; names the table cell or reference at fault. */
  message: string;
  /** The `visual.*` path of the offending reference. */
  fieldPath: string;
  rowIndex?: number;
  columnIndex?: number;
}>;
export type DataChartResolution =
  | Readonly<{ ok: true; chart: ResolvedDataChart }>
  | Readonly<{ ok: false; failure: DataChartFailure }>;

const fail = (failure: DataChartFailure): DataChartResolution => ({
  ok: false,
  failure,
});

const quoteCell = (value: string): string =>
  value.trim().length === 0 ? "is blank" : `contains "${value.trim()}"`;

/**
 * Copies a chart's categories and values out of an approved table. The table
 * is bounded first, so a reference past the preview bounds is out of range
 * here too. Bars always start from zero (the axis includes 0); a line's axis
 * spans only its data.
 */
export function resolveDataChart(
  input: DataChartTable,
  visual: DataChartVisual,
): DataChartResolution {
  if (input.tableId !== visual.tableId)
    return fail({
      code: "table_mismatch",
      fieldPath: "visual.tableId",
      message: "The chart's source table is not available to this lesson.",
    });
  const table = boundedDataChartTable(input);
  const columnName = (index: number) =>
    table.columns[index]?.trim() || `column ${index + 1}`;
  const columns = [visual.categoryColumn, ...visual.valueColumns];
  for (const [position, index] of columns.entries())
    if (index >= table.columns.length)
      return fail({
        code: "column_out_of_range",
        fieldPath:
          position === 0
            ? "visual.categoryColumn"
            : `visual.valueColumns.${position - 1}`,
        columnIndex: index,
        message: `The table has ${table.columns.length} column${
          table.columns.length === 1 ? "" : "s"
        }; column ${index + 1} does not exist.`,
      });
  for (const [position, index] of visual.rowIndexes.entries())
    if (index >= table.rows.length)
      return fail({
        code: "row_out_of_range",
        fieldPath: `visual.rowIndexes.${position}`,
        rowIndex: index,
        message: `The table has ${table.rows.length} row${
          table.rows.length === 1 ? "" : "s"
        } a chart can use; row ${index + 1} does not exist.`,
      });
  const categories: DataChartCategory[] = [];
  for (const [position, index] of visual.rowIndexes.entries()) {
    const label = (table.rows[index]?.[visual.categoryColumn] ?? "").trim();
    if (label.length === 0)
      return fail({
        code: "missing_category",
        fieldPath: `visual.rowIndexes.${position}`,
        rowIndex: index,
        columnIndex: visual.categoryColumn,
        message: `Row ${index + 1}, column "${columnName(
          visual.categoryColumn,
        )}" is blank, so the category has no label.`,
      });
    categories.push({ rowIndex: index, label });
  }
  const series: DataChartSeries[] = [];
  for (const columnIndexValue of visual.valueColumns) {
    const values: DataChartValue[] = [];
    for (const [position, index] of visual.rowIndexes.entries()) {
      const cell = table.rows[index]?.[columnIndexValue] ?? "";
      const value = parseDataChartNumber(cell);
      if (value === undefined)
        return fail({
          code: "non_numeric_cell",
          fieldPath: `visual.rowIndexes.${position}`,
          rowIndex: index,
          columnIndex: columnIndexValue,
          message: `Row ${index + 1}, column "${columnName(
            columnIndexValue,
          )}" ${quoteCell(cell)}, which is not a number.`,
        });
      values.push({ value, text: cell.trim() });
    }
    series.push({
      columnIndex: columnIndexValue,
      name: columnName(columnIndexValue),
      values,
    });
  }
  const all = series.flatMap((entry) => entry.values.map((item) => item.value));
  const dataMin = Math.min(...all);
  const dataMax = Math.max(...all);
  const axis =
    visual.chartKind === "bar"
      ? niceDataChartTicks(Math.min(0, dataMin), Math.max(0, dataMax))
      : niceDataChartTicks(dataMin, dataMax);
  const highlightIndex =
    visual.highlightCategory === undefined
      ? undefined
      : visual.rowIndexes.indexOf(visual.highlightCategory);
  return {
    ok: true,
    chart: {
      tableId: table.tableId,
      chartKind: visual.chartKind,
      categoryName: columnName(visual.categoryColumn),
      categories,
      series,
      highlightIndex:
        highlightIndex === undefined || highlightIndex < 0
          ? undefined
          : highlightIndex,
      unitLabel: visual.unitLabel,
      min: axis.min,
      max: axis.max,
      ticks: axis.ticks,
    },
  };
}

/** True when at least two rows of some column parse as numbers: the minimum a
 * chart needs. Only such tables are offered to the storyboard model. */
export function dataChartNumericColumns(input: DataChartTable): number[] {
  const table = boundedDataChartTable(input);
  return table.columns.flatMap((_, index) =>
    table.rows.filter(
      (row) => parseDataChartNumber(row[index] ?? "") !== undefined,
    ).length >= dataChartMinRows
      ? [index]
      : [],
  );
}

export function isDataChartEligibleTable(input: DataChartTable): boolean {
  const table = boundedDataChartTable(input);
  return (
    table.columns.length >= 2 &&
    table.rows.length >= dataChartMinRows &&
    dataChartNumericColumns(table).length > 0
  );
}

/**
 * The accessible one-line summary used as the chart's alt text and transcript
 * line, e.g. "Bar chart: sodium 0.97, potassium 0.86". Values are the cells'
 * own text.
 */
export function dataChartSummary(chart: ResolvedDataChart): string {
  const kind = chart.chartKind === "bar" ? "Bar chart" : "Line chart";
  const unit = chart.unitLabel === undefined ? "" : ` (${chart.unitLabel})`;
  if (chart.series.length === 1) {
    const only = chart.series[0]!;
    return `${kind} of ${only.name}${unit}: ${chart.categories
      .map((category, index) => `${category.label} ${only.values[index]!.text}`)
      .join(", ")}.`;
  }
  return `${kind} of ${chart.series
    .map((entry) => entry.name)
    .join(", ")} by ${chart.categoryName}${unit}: ${chart.categories
    .map(
      (category, index) =>
        `${category.label}: ${chart.series
          .map((entry) => `${entry.name} ${entry.values[index]!.text}`)
          .join(", ")}`,
    )
    .join("; ")}.`;
}

/** A scene asset binding's alt text limit. */
const dataChartAltTextMaxLength = 500;

/**
 * The alt text a chart's table binding carries: the chart summary (the values
 * are the cells' own text), cut to the binding's 500-character limit, or the
 * table's column names when the selection does not resolve. Application code
 * writes it from the approved table whenever it binds a chart, so the lesson
 * itself stores a text equivalent of the chart, not only the preview.
 */
export function dataChartAltText(
  table: DataChartTable,
  visual: DataChartVisual,
): string {
  const resolution = resolveDataChart(table, visual);
  const text = resolution.ok
    ? dataChartSummary(resolution.chart)
    : `Table: ${boundedDataChartTable(table).columns.join(", ")}`;
  return text.length <= dataChartAltTextMaxLength
    ? text
    : `${text.slice(0, dataChartAltTextMaxLength - 1)}…`;
}
