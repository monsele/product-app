import { describe, expect, it } from "vitest";
import {
  creativeDesignErrorMessage,
  creativeDesignPlanExpectedRevision,
} from "./creative-design-panel";

describe("creativeDesignPlanExpectedRevision", () => {
  it("creates a design only when no draft exists", () => {
    expect(creativeDesignPlanExpectedRevision(null)).toBe(0);
  });

  it("updates an existing draft using its current revision", () => {
    expect(creativeDesignPlanExpectedRevision({ revision: 1 })).toBe(1);
    expect(creativeDesignPlanExpectedRevision({ revision: 7 })).toBe(7);
  });

  it("keeps preflight details available when an API error includes them", () => {
    expect(
      creativeDesignErrorMessage(
        {
          error: {
            fieldErrors: {
              "issues.0": "A required storyboard asset has not been bound.",
            },
            message:
              "This lesson cannot use the selected creative style yet. Existing design remains unchanged.",
          },
        },
        "fallback",
      ),
    ).toContain("A required storyboard asset has not been bound.");
  });
});
