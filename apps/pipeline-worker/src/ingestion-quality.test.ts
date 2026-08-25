import { describe, expect, it } from "vitest";
import { assessIngestionQuality } from "./ingestion-quality.js";

const base = {
  message: "Parser warning.",
  pageStart: 1,
  pageEnd: 1,
} as const;

describe("assessIngestionQuality", () => {
  it("blocks uncertain reading order while keeping its provenance", () => {
    const report = assessIngestionQuality([
      { ...base, code: "uncertain_reading_order", severity: "warning" },
    ]);
    expect(report).toMatchObject({ score: 75, status: "blocked" });
    expect(report.findings[0]).toMatchObject({
      code: "uncertain_reading_order",
      severity: "blocking",
      pageStart: 1,
    });
  });

  it("requires review for malformed tables and missing captions", () => {
    const report = assessIngestionQuality([
      { ...base, code: "malformed_table", severity: "warning" },
      { ...base, code: "missing_caption", severity: "warning" },
    ]);
    expect(report).toMatchObject({ score: 88, status: "review_required" });
  });
});
