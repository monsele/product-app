import { describe, expect, it } from "vitest";
import type {
  GroundingStatus,
  GroundingCheckResultResponse,
} from "@avlp/schemas";
import {
  groundingCheckMatchesLesson,
  groundingReviewStatus,
  groundingStatusLabel,
} from "./grounding-input";

describe("grounding-input", () => {
  it("presents contradictory historical support as needing review without upgrading any verdict", () => {
    expect(groundingReviewStatus({ status: "supported", unsupportedSpans: [{}] })).toBe("needs_review");
    expect(groundingReviewStatus({ status: "supported", unsupportedSpans: [] })).toBe("supported");
    expect(groundingReviewStatus({ status: "unsupported", unsupportedSpans: [] })).toBe("unsupported");
  });
  it("does not present older or other-lesson results as current", () => {
    const check: NonNullable<GroundingCheckResultResponse["check"]> = {
      schemaVersion: "grounding-check-v1",
      id: "01989a3d-8e00-7000-8000-000000000001",
      projectId: "01989a3d-8e00-7000-8000-000000000002",
      lessonSpecId: "01989a3d-8e00-7000-8000-000000000003",
      lessonSpecRevision: 5,
      lessonSpecContentHash: "a".repeat(64),
      sourceSnapshotId: "01989a3d-8e00-7000-8000-000000000004",
      sourceSnapshotContentHash: "b".repeat(64),
      claims: [],
      results: [],
      modelCalls: [],
      summary: {
        total: 0,
        supported: 0,
        unsupported: 0,
        generatedAddition: 0,
        needsReview: 0,
      },
      createdAt: "2026-09-29T10:00:00.000Z",
    };
    expect(groundingCheckMatchesLesson(check, check.lessonSpecId, 5)).toBe(
      true,
    );
    expect(groundingCheckMatchesLesson(check, check.lessonSpecId, 6)).toBe(
      false,
    );
    expect(groundingCheckMatchesLesson(check, "other-lesson", 5)).toBe(false);
    expect(groundingCheckMatchesLesson(null, check.lessonSpecId, 5)).toBe(
      false,
    );
  });
  it("labels every grounding status", () => {
    const statuses: GroundingStatus[] = [
      "supported",
      "unsupported",
      "generated_addition",
      "needs_review",
    ];
    for (const status of statuses)
      expect(groundingStatusLabel(status)).not.toBe("");
  });
});
