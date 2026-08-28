import { describe, expect, it } from "vitest";
import {
  ingestionStatusMessage,
  getIngestionStatusBadge,
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
});
