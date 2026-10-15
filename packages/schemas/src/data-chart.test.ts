import { describe, expect, it } from "vitest";
import {
  boundedDataChartTable,
  dataChartAltText,
  dataChartSummary,
  dataChartTableSlot,
  dataChartVisualSchema,
  isDataChartEligibleTable,
  lessonSpecSchema,
  niceDataChartTicks,
  parseDataChartNumber,
  resolveDataChart,
  sceneSpecSchema,
  storyboardSceneOutputSchema,
  type DataChartVisual,
  type LessonSpec,
} from "./index.js";

const tableId = "019ffbf1-eeee-7000-8000-000000000700";
const foreignTableId = "019ffbf1-eeee-7000-8000-000000000799";
const ids = [
  "019ffbf1-eeee-7000-8000-000000000701",
  "019ffbf1-eeee-7000-8000-000000000702",
  "019ffbf1-eeee-7000-8000-000000000703",
  "019ffbf1-eeee-7000-8000-000000000704",
  "019ffbf1-eeee-7000-8000-000000000705",
] as const;

const table = {
  tableId,
  columns: ["Element", "Mass (g)", "Share", "Price", "Note"],
  rows: [
    ["Sodium", "0.97", "12%", "$1,250.50", "soft"],
    ["Potassium", "0.86", "9 %", "£980", "softer"],
    ["Lithium", "0.53", "4%", "€2,100", "n/a"],
    ["Caesium", "1,873", "−3%", "¥15", "?"],
    ["", "1.00", "1%", "$1", "blank label"],
  ],
};

const visual = (overrides: Partial<DataChartVisual> = {}): DataChartVisual => ({
  tableId,
  chartKind: "bar",
  categoryColumn: 0,
  valueColumns: [1],
  rowIndexes: [0, 1, 2],
  ...overrides,
});

describe("parseDataChartNumber", () => {
  it.each([
    ["0.97", 0.97],
    ["1,873", 1873],
    ["1,234,567.25", 1234567.25],
    ["12%", 12],
    ["9 %", 9],
    ["$1,250.50", 1250.5],
    ["£980", 980],
    ["-4", -4],
    ["−3%", -3],
    ["-$5", -5],
    ["$-5", -5],
    [".5", 0.5],
    ["  42  ", 42],
    ["0", 0],
    ["-0", 0],
  ])("parses %j as %d", (cell, expected) => {
    expect(parseDataChartNumber(cell)).toBe(expected);
  });

  it.each([
    "",
    "n/a",
    "0,97",
    "1,23",
    "12,3456",
    "1.2.3",
    "$5%",
    "5$",
    "--5",
    "-$-5",
    "1e3",
    "12 kg",
    "about 5",
    "Infinity",
  ])("refuses %j", (cell) => {
    expect(parseDataChartNumber(cell)).toBeUndefined();
  });
});

describe("niceDataChartTicks", () => {
  it("rounds the range out to round steps", () => {
    expect(niceDataChartTicks(0, 0.97)).toEqual({
      min: 0,
      max: 1,
      step: 0.2,
      ticks: [0, 0.2, 0.4, 0.6, 0.8, 1],
    });
    expect(niceDataChartTicks(0, 1873).ticks).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("never prints floating-point noise", () => {
    const { ticks } = niceDataChartTicks(0.1, 0.7);
    for (const tick of ticks) expect(String(tick).length).toBeLessThanOrEqual(4);
  });

  it("spans negative and positive values", () => {
    const result = niceDataChartTicks(-3, 12);
    expect(result.min).toBeLessThanOrEqual(-3);
    expect(result.max).toBeGreaterThanOrEqual(12);
    expect(result.ticks).toContain(0);
  });

  it("gives a flat series a visible range", () => {
    const result = niceDataChartTicks(5, 5);
    expect(result.max).toBeGreaterThan(result.min);
  });
});

describe("resolveDataChart", () => {
  it("copies categories and values exactly from the table cells", () => {
    const result = resolveDataChart(table, visual({ valueColumns: [1, 2, 3] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.chart.categories.map((category) => category.label)).toEqual([
      "Sodium",
      "Potassium",
      "Lithium",
    ]);
    expect(result.chart.series.map((series) => series.name)).toEqual([
      "Mass (g)",
      "Share",
      "Price",
    ]);
    expect(result.chart.series[0]!.values).toEqual([
      { value: 0.97, text: "0.97" },
      { value: 0.86, text: "0.86" },
      { value: 0.53, text: "0.53" },
    ]);
    expect(result.chart.series[2]!.values.map((value) => value.text)).toEqual([
      "$1,250.50",
      "£980",
      "€2,100",
    ]);
    // A bar axis starts from zero.
    expect(result.chart.min).toBe(0);
  });

  it("keeps the requested row order and the highlight position", () => {
    const result = resolveDataChart(
      table,
      visual({ chartKind: "line", rowIndexes: [2, 0], highlightCategory: 0 }),
    );
    expect(result.ok && result.chart.categories.map((category) => category.label)).toEqual([
      "Lithium",
      "Sodium",
    ]);
    expect(result.ok && result.chart.highlightIndex).toBe(1);
    // A line axis spans only its data.
    expect(result.ok && result.chart.min).toBeGreaterThan(0);
  });

  it("names the cell when a selected value is not a number", () => {
    const result = resolveDataChart(table, visual({ valueColumns: [4] }));
    expect(result).toEqual({
      ok: false,
      failure: {
        code: "non_numeric_cell",
        fieldPath: "visual.rowIndexes.0",
        rowIndex: 0,
        columnIndex: 4,
        message: 'Row 1, column "Note" contains "soft", which is not a number.',
      },
    });
  });

  it("refuses a blank category label", () => {
    const result = resolveDataChart(table, visual({ rowIndexes: [0, 4] }));
    expect(!result.ok && result.failure.code).toBe("missing_category");
    expect(!result.ok && result.failure.message).toContain("Row 5");
  });

  it("refuses references outside the table", () => {
    const row = resolveDataChart(table, visual({ rowIndexes: [0, 7] }));
    expect(!row.ok && row.failure).toMatchObject({
      code: "row_out_of_range",
      fieldPath: "visual.rowIndexes.1",
    });
    const column = resolveDataChart(table, visual({ valueColumns: [6] }));
    expect(!column.ok && column.failure).toMatchObject({
      code: "column_out_of_range",
      fieldPath: "visual.valueColumns.0",
    });
  });

  it("refuses a table the chart does not name (AC8)", () => {
    const result = resolveDataChart(
      { ...table, tableId: foreignTableId },
      visual(),
    );
    expect(!result.ok && result.failure.code).toBe("table_mismatch");
  });

  it("resolves against the same bounded view as the preview manifest", () => {
    const wide = {
      tableId,
      columns: Array.from({ length: 10 }, (_, index) => `C${index}`),
      rows: Array.from({ length: 15 }, (_, row) =>
        Array.from({ length: 10 }, (_, column) => `${row * 10 + column}`),
      ),
    };
    const bounded = boundedDataChartTable(wide);
    expect(bounded.columns).toHaveLength(8);
    expect(bounded.rows).toHaveLength(12);
    expect(bounded.rows.every((row) => row.length === 8)).toBe(true);
  });

  it("summarises the chart for alt text with the cells' own text", () => {
    const single = resolveDataChart(table, visual({ rowIndexes: [0, 1] }));
    expect(single.ok && dataChartSummary(single.chart)).toBe(
      "Bar chart of Mass (g): Sodium 0.97, Potassium 0.86.",
    );
    const multi = resolveDataChart(
      table,
      visual({ chartKind: "line", valueColumns: [1, 2], rowIndexes: [0, 1], unitLabel: "per sample" }),
    );
    expect(multi.ok && dataChartSummary(multi.chart)).toBe(
      "Line chart of Mass (g), Share by Element (per sample): Sodium: Mass (g) 0.97, Share 12%; Potassium: Mass (g) 0.86, Share 9 %.",
    );
  });

  it("gives the binding the summary as alt text, within its 500-character limit", () => {
    expect(dataChartAltText(table, visual({ rowIndexes: [0, 1] }))).toBe(
      "Bar chart of Mass (g): Sodium 0.97, Potassium 0.86.",
    );
    const long = {
      tableId,
      columns: ["Category", "Value"],
      rows: Array.from({ length: 8 }, (_, row) => [`${"Long category label ".repeat(4)}${row}`, `${row + 1}`]),
    };
    const altText = dataChartAltText(
      long,
      visual({ categoryColumn: 0, valueColumns: [1], rowIndexes: [0, 1, 2, 3, 4, 5, 6, 7] }),
    );
    expect(altText).toHaveLength(500);
    expect(altText.endsWith("…")).toBe(true);
    // A selection that does not resolve falls back to the column names.
    expect(dataChartAltText(table, visual({ valueColumns: [4], rowIndexes: [0, 1] }))).toBe(
      "Table: Element, Mass (g), Share, Price, Note",
    );
  });
});

describe("isDataChartEligibleTable", () => {
  it("needs a category column and a column with two numeric rows", () => {
    expect(isDataChartEligibleTable(table)).toBe(true);
    expect(
      isDataChartEligibleTable({
        tableId,
        columns: ["Name", "Role"],
        rows: [
          ["Ada", "Engineer"],
          ["Grace", "Admiral"],
        ],
      }),
    ).toBe(false);
    expect(
      isDataChartEligibleTable({ tableId, columns: ["Only"], rows: [["1"], ["2"]] }),
    ).toBe(false);
  });
});

describe("dataChartVisualSchema (AC2: the model never writes a number)", () => {
  it("accepts a reference-only visual", () => {
    expect(dataChartVisualSchema.safeParse(visual({ highlightCategory: 1, unitLabel: "grams" })).success).toBe(true);
  });

  it.each([
    ["inline values", { values: [0.97, 0.86] }],
    ["an axis range", { min: 0, max: 1 }],
    ["ticks", { ticks: [0, 0.5, 1] }],
    ["a series of numbers", { series: [{ name: "Mass", values: [1, 2] }] }],
  ])("rejects %s", (_, extra) => {
    expect(dataChartVisualSchema.safeParse({ ...visual(), ...extra }).success).toBe(false);
  });

  it("rejects digits in the unit label", () => {
    const result = dataChartVisualSchema.safeParse(visual({ unitLabel: "0.97 g" }));
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["unitLabel"]);
  });

  it("rejects a highlighted category given as text or outside the charted rows", () => {
    expect(
      dataChartVisualSchema.safeParse({ ...visual(), highlightCategory: "Sodium" }).success,
    ).toBe(false);
    expect(dataChartVisualSchema.safeParse(visual({ highlightCategory: 5 })).success).toBe(false);
  });

  it("rejects duplicate, overlapping or out-of-bounds references", () => {
    for (const bad of [
      visual({ valueColumns: [1, 1] }),
      visual({ valueColumns: [0] }),
      visual({ rowIndexes: [1, 1] }),
      visual({ rowIndexes: [0] }),
      visual({ rowIndexes: [0, 1, 2, 3, 4, 5, 6, 7, 8] }),
      visual({ rowIndexes: [0, 12] }),
      visual({ valueColumns: [1, 2, 3, 4] }),
      visual({ categoryColumn: 8 }),
      visual({ categoryColumn: 1.5 }),
      { ...visual(), chartKind: "pie" },
      { ...visual(), tableId: "table-1" },
    ])
      expect(dataChartVisualSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("rejects a model storyboard scene that carries numbers in its visual", () => {
    const base = {
      template: "data-chart",
      narrationBlockIds: [ids[0]],
      onScreenText: [],
      estimatedSeconds: 20,
      transition: "fade",
      sourceBlockIds: [ids[0]],
      generatedAdditions: [],
      assetRequirements: [],
    };
    expect(storyboardSceneOutputSchema.safeParse({ ...base, visual: visual() }).success).toBe(true);
    expect(
      storyboardSceneOutputSchema.safeParse({
        ...base,
        visual: { ...visual(), values: [0.97, 0.86, 0.53] },
      }).success,
    ).toBe(false);
  });
});

describe("data-chart scenes in a LessonSpec", () => {
  const chartScene = (overrides: Record<string, unknown> = {}) => ({
    id: ids[3],
    order: 1,
    narration: "Sodium is heavier than potassium.",
    durationSeconds: 20,
    onScreenText: [],
    transition: "fade",
    assetBindings: [
      {
        assetId: tableId,
        role: "diagram",
        slot: dataChartTableSlot,
        provenance: "source_table",
        visualRole: "grounding_critical",
        sourceRef: {
          documentId: ids[4],
          parsedDocumentVersion: 1,
          pageStart: 2,
          blockIds: [ids[2]],
          tableIds: [tableId],
        },
      },
    ],
    sourceRefs: [
      {
        documentId: ids[4],
        parsedDocumentVersion: 1,
        pageStart: 2,
        blockIds: [ids[2]],
        tableIds: [tableId],
      },
    ],
    generatedAdditions: [],
    template: "data-chart",
    visual: visual(),
    ...overrides,
  });
  const lesson = (schemaVersion: string, scene = chartScene()) =>
    ({
      schemaVersion,
      lessonId: ids[0],
      projectId: ids[1],
      title: "Alkali metals",
      subject: "Chemistry",
      audience: { ageBand: "14-16", difficulty: "introductory", priorKnowledge: [] },
      targetDurationSeconds: 180,
      tone: "friendly",
      themeId: "mvp-default",
      objectiveIds: [ids[2]],
      voice: { providerVoiceId: "english-aria", speakingRate: 1 },
      scenes: [scene],
    }) as unknown as LessonSpec;

  it("is accepted only in LessonSpec 1.10", () => {
    expect(lessonSpecSchema.safeParse(lesson("1.10")).success).toBe(true);
    for (const legacy of ["1.8", "1.9"]) {
      const result = lessonSpecSchema.safeParse(lesson(legacy));
      expect(result.success, legacy).toBe(false);
      expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
        "scenes.0.template",
      );
    }
  });

  it("requires the table binding to be the table the chart names", () => {
    const scene = chartScene({ visual: visual({ tableId: foreignTableId }) });
    const result = sceneSpecSchema.safeParse(scene);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "assetBindings.0.assetId",
    );
  });

  it("refuses an AI-generated picture in the chart's table slot", () => {
    const scene = chartScene();
    const result = sceneSpecSchema.safeParse({
      ...scene,
      assetBindings: [{ ...scene.assetBindings[0], provenance: "ai_generated" }],
    });
    expect(result.success).toBe(false);
  });
});
