import { describe, expect, it } from "vitest";
import { ingestionStatusMessage } from "./ingestion-status-panel";

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
});
