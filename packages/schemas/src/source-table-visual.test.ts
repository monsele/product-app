import { describe, expect, it } from "vitest";
import {
  assetProvenanceSchema,
  previewAssetSchema,
  sceneAssetBindingSchema,
  sourceTableVisualMaxColumns,
  sourceTableVisualMaxRows,
  sourceTableVisualSchema,
  sourceVisualPickerEntrySchema,
  sourceVisualPickerResponseSchema,
} from "./index.js";

const tableId = "019ffbf1-eeee-7000-8000-000000000600";
const figureId = "019ffbf1-eeee-7000-8000-000000000601";
const sectionId = "019ffbf1-eeee-7000-8000-000000000602";
const assetId = "019ffbf1-eeee-7000-8000-000000000603";

function table(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tableId,
    columns: ["Name", "Value"],
    rows: [["Sodium", "11"]],
    rowCount: 1,
    truncated: false,
    ...overrides,
  };
}

describe("assetProvenanceSchema", () => {
  it("accepts source_table alongside the existing provenance values", () => {
    for (const value of [
      "catalog",
      "source_figure",
      "source_table",
      "teacher_uploaded",
      "ai_generated",
    ])
      expect(assetProvenanceSchema.safeParse(value).success).toBe(true);
  });
});

describe("sourceTableVisualSchema", () => {
  it("accepts a bounded table within row and column limits", () => {
    expect(sourceTableVisualSchema.safeParse(table()).success).toBe(true);
  });

  it("rejects a row whose cell count does not match the column count", () => {
    const result = sourceTableVisualSchema.safeParse(
      table({ rows: [["only-one-cell"]], columns: ["A", "B"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects more columns than the runtime display bound allows", () => {
    const columns = Array.from(
      { length: sourceTableVisualMaxColumns + 1 },
      (_, index) => `Column ${index}`,
    );
    const rows = [columns.map((_, index) => `Cell ${index}`)];
    expect(sourceTableVisualSchema.safeParse(table({ columns, rows })).success).toBe(
      false,
    );
  });

  it("rejects more rows than the runtime display bound allows", () => {
    const rows = Array.from({ length: sourceTableVisualMaxRows + 1 }, () => [
      "Sodium",
      "11",
    ]);
    expect(sourceTableVisualSchema.safeParse(table({ rows })).success).toBe(false);
  });

  it("rejects a malformed table payload — non-string cell content", () => {
    const result = sourceTableVisualSchema.safeParse(
      table({ rows: [[42, "11"]] }),
    );
    expect(result.success).toBe(false);
  });

  it("preserves blank cells from an extracted source table", () => {
    expect(
      sourceTableVisualSchema.safeParse(table({ rows: [["Sodium", ""]] }))
        .success,
    ).toBe(true);
  });

  it("accepts an empty table with zero rows", () => {
    expect(
      sourceTableVisualSchema.safeParse(table({ rows: [], rowCount: 0 })).success,
    ).toBe(true);
  });
});

describe("previewAssetSchema", () => {
  it("accepts a source_table asset carrying table data and no media src", () => {
    const result = previewAssetSchema.safeParse({
      altText: "Table: Name, Value",
      assetId,
      provenance: "source_table",
      source: "source_table",
      table: table(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects a source_table asset that also carries a media src", () => {
    const result = previewAssetSchema.safeParse({
      altText: "Table: Name, Value",
      assetId,
      source: "source_table",
      src: "https://example.test/figure.png",
      table: table(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a source_table asset missing table data", () => {
    const result = previewAssetSchema.safeParse({
      altText: "Table: Name, Value",
      assetId,
      source: "source_table",
    });
    expect(result.success).toBe(false);
  });

  it("still requires src for an image-sourced preview asset", () => {
    const result = previewAssetSchema.safeParse({
      altText: "A figure",
      assetId,
      source: "source",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an existing image preview asset unchanged", () => {
    const result = previewAssetSchema.safeParse({
      altText: "A figure",
      assetId,
      provenance: "source_figure",
      source: "source",
      src: "https://example.test/figure.png",
    });
    expect(result.success).toBe(true);
  });
});

describe("sceneAssetBindingSchema", () => {
  it("accepts a source_table provenance binding", () => {
    const result = sceneAssetBindingSchema.safeParse({
      assetId: tableId,
      role: "diagram",
      slot: "diagram",
      provenance: "source_table",
    });
    expect(result.success).toBe(true);
  });

  it("still rejects an unrecognized provenance value", () => {
    const result = sceneAssetBindingSchema.safeParse({
      assetId: tableId,
      role: "diagram",
      slot: "diagram",
      provenance: "invented_provenance",
    });
    expect(result.success).toBe(false);
  });
});

describe("sourceVisualPickerEntrySchema", () => {
  it("accepts a figure entry", () => {
    const result = sourceVisualPickerEntrySchema.safeParse({
      kind: "figure",
      figureId,
      sectionId,
      pageStart: 3,
      caption: "Sodium atom diagram",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a table entry", () => {
    const result = sourceVisualPickerEntrySchema.safeParse({
      kind: "table",
      tableId,
      sectionId,
      pageStart: 4,
      columns: ["Name", "Value"],
      rowCount: 12,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an entry whose kind does not match its own field shape", () => {
    const result = sourceVisualPickerEntrySchema.safeParse({
      kind: "table",
      figureId,
      sectionId,
      pageStart: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("sourceVisualPickerResponseSchema", () => {
  it("accepts an empty response when no snapshot has been approved yet", () => {
    const result = sourceVisualPickerResponseSchema.safeParse({
      entries: [],
      snapshotId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a mixed list of figure and table entries", () => {
    const result = sourceVisualPickerResponseSchema.safeParse({
      entries: [
        { kind: "figure", figureId, sectionId, pageStart: 1 },
        {
          kind: "table",
          tableId,
          sectionId,
          pageStart: 2,
          columns: ["A"],
          rowCount: 1,
        },
      ],
      snapshotId: "019ffbf1-eeee-7000-8000-000000000604",
    });
    expect(result.success).toBe(true);
  });
});
