import { describe, expect, it } from "vitest";
import type { GroundingStatus } from "@avlp/schemas";
import { groundingStatusLabel } from "./grounding-input";

describe("grounding-input", () => {
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
