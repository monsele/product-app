import type {
  GroundingStatus,
  GroundingCheckResultResponse,
} from "@avlp/schemas";

export function groundingCheckMatchesLesson(
  check: GroundingCheckResultResponse["check"],
  lessonSpecId: string,
  lessonSpecRevision: number,
): boolean {
  return (
    check !== null &&
    check.lessonSpecId === lessonSpecId &&
    check.lessonSpecRevision === lessonSpecRevision
  );
}

/** Human-readable label for a claim's grounding classification. */
export function groundingReviewStatus(result: {
  status: GroundingStatus;
  unsupportedSpans: readonly unknown[];
}): GroundingStatus {
  return result.status === "supported" && result.unsupportedSpans.length > 0
    ? "needs_review"
    : result.status;
}

export function groundingStatusLabel(status: GroundingStatus): string {
  switch (status) {
    case "supported":
      return "Supported by source";
    case "unsupported":
      return "Could not verify against source";
    case "generated_addition":
      return "Generated addition";
    case "needs_review":
      return "Needs review";
  }
}
