import { describe, expect, it } from "vitest";
import {
  ingestionProgressPercent,
  ingestionStatusMessage,
  isIngestionActive,
  getIngestionStatusBadge,
  summarizeFindings,
} from "./ingestion-status-panel";

describe("ingestion status panel", () => {
  it("keeps an actionable retry message for a persisted failed job", () => {
    expect(
      ingestionStatusMessage({
        quality: null,
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "failed",
          progress: 0.4,
          errorCode: "PARSER_FAILED",
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: false,
      }),
    ).toContain("retry safely");
  });

  it("explains that blocking quality findings prevent the next stage", () => {
    expect(
      ingestionStatusMessage({
        quality: { score: 70, status: "blocked", findings: [] },
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "succeeded",
          progress: 1,
          errorCode: null,
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: false,
      }),
    ).toContain("Review is required");
  });

  it("maps named backend job states to truthful status badges without invented progress", () => {
    // Queued
    expect(
      getIngestionStatusBadge({
        quality: null,
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "queued",
          progress: 0,
          errorCode: null,
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: false,
      }),
    ).toEqual({ status: "in_progress", label: "Queued" });

    // Running
    expect(
      getIngestionStatusBadge({
        quality: null,
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "running",
          progress: 0.5,
          errorCode: null,
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: false,
      }),
    ).toEqual({ status: "in_progress", label: "Extracting content" });

    // Failed
    expect(
      getIngestionStatusBadge({
        quality: null,
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "failed",
          progress: 0.3,
          errorCode: "DOCLING_CRASH",
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: false,
      }),
    ).toEqual({ status: "error", label: "Extraction failed" });

    // Ready
    expect(
      getIngestionStatusBadge({
        quality: { score: 95, status: "ready", findings: [] },
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "succeeded",
          progress: 1,
          errorCode: null,
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: true,
      }),
    ).toEqual({ status: "success", label: "Ready for review" });

    // Review Required
    expect(
      getIngestionStatusBadge({
        quality: {
          score: 82,
          status: "review_required",
          findings: [
            {
              code: "malformed_table",
              severity: "warning",
              pageStart: 2,
              message: "Review table extraction.",
            },
          ],
        },
        latestJob: {
          id: "018f3c2d-4a00-7000-8000-000000000001",
          state: "succeeded",
          progress: 1,
          errorCode: null,
          updatedAt: "2026-08-15T12:00:00.000Z",
        },
        canProceed: true,
      }),
    ).toEqual({ status: "warning", label: "Items to check" });
  });
  it("reports the worker's own progress only while extraction is running", () => {
    const job = {
      id: "018f3c2d-4a00-7000-8000-000000000001",
      errorCode: null,
      updatedAt: "2026-08-15T12:00:00.000Z",
    };
    expect(
      ingestionProgressPercent({
        quality: null,
        latestJob: { ...job, state: "running", progress: 0.65 },
        canProceed: false,
      }),
    ).toBe(65);
    // A settled job has no progress to animate, and polling should stop.
    const settled = {
      quality: { score: 100, status: "ready" as const, findings: [] },
      latestJob: { ...job, state: "succeeded" as const, progress: 1 },
      canProceed: true,
    };
    expect(ingestionProgressPercent(settled)).toBeNull();
    expect(isIngestionActive(settled)).toBe(false);
    expect(
      isIngestionActive({
        quality: null,
        latestJob: { ...job, state: "retry_wait", progress: 0.1 },
        canProceed: false,
      }),
    ).toBe(true);
  });

  it("groups repeated findings by kind so a long document stays readable", () => {
    const findings = [
      ...Array.from({ length: 12 }, (_, index) => ({
        code: "missing_caption" as const,
        severity: "warning" as const,
        message: "Figure did not include a usable caption.",
        pageStart: index + 1,
        pageEnd: index + 1,
      })),
      {
        code: "low_ocr_quality" as const,
        severity: "blocking" as const,
        message: "Low-confidence text.",
        pageStart: 4,
        pageEnd: 4,
      },
    ];
    const summary = summarizeFindings(findings);
    expect(summary).toHaveLength(2);
    // Blocking findings lead, whatever their count.
    expect(summary[0]).toMatchObject({
      code: "low_ocr_quality",
      severity: "blocking",
      count: 1,
      pages: "page 4",
    });
    expect(summary[1]).toMatchObject({
      code: "missing_caption",
      count: 12,
      pages: "pages 1–12",
    });
  });
});
