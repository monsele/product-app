import {
  ingestionQualityReportSchema,
  type IngestionQualityReport,
  type IngestionWarning,
} from "@avlp/schemas";

const blockingCodes = new Set<IngestionWarning["code"]>([
  "low_ocr_quality",
  "uncertain_reading_order",
  "duplicate_reading_order",
]);

const penalties: Readonly<Record<IngestionWarning["code"], number>> = {
  unknown_block: 3,
  low_ocr_quality: 30,
  missing_caption: 4,
  malformed_table: 8,
  malformed_media: 6,
  uncertain_reading_order: 25,
  duplicate_reading_order: 25,
};

/** Maps normalized-parser findings to a stable teacher-facing quality gate. */
export function assessIngestionQuality(
  warnings: readonly IngestionWarning[],
): IngestionQualityReport {
  const findings = warnings.map((warning) => ({
    ...warning,
    severity: blockingCodes.has(warning.code) ? "blocking" : "warning",
  }));
  const score = Math.max(
    0,
    100 -
      warnings.reduce((total, warning) => total + penalties[warning.code], 0),
  );
  return ingestionQualityReportSchema.parse({
    score,
    status: findings.some((finding) => finding.severity === "blocking")
      ? "blocked"
      : findings.length > 0
        ? "review_required"
        : "ready",
    findings,
  });
}
