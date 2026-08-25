import type { GroundingStatus } from "@avlp/schemas";

/** Human-readable label for a claim's grounding classification. */
export function groundingStatusLabel(status: GroundingStatus): string {
  switch (status) {
    case "supported":
      return "Supported by source";
    case "unsupported":
      return "Not supported by source";
    case "generated_addition":
      return "Generated addition";
    case "needs_review":
      return "Needs review";
  }
}
