import { describe, expect, it } from "vitest";
import { deriveSaveVersionOutcome } from "./storyboard-panel";

function blockedPayload() {
  return {
    error: {
      code: "bad_request",
      message: "Narration is still a draft and must be approved.",
      retryable: false,
      correlationId: "019ffbf1-eeee-7000-8000-000000000060",
      details: {
        ready: false,
        blockers: [
          {
            code: "narration_unapproved",
            message: "Narration is still a draft and must be approved.",
            recoveryStage: "narration",
          },
        ],
      },
    },
  };
}

describe("deriveSaveVersionOutcome", () => {
  it("names the readiness blocker on a blocked save (the observed narration-draft case)", () => {
    const outcome = deriveSaveVersionOutcome(false, blockedPayload());
    expect(outcome).toEqual({
      kind: "blocked",
      message: "Narration is still a draft and must be approved.",
      blockers: [
        {
          code: "narration_unapproved",
          message: "Narration is still a draft and must be approved.",
          recoveryStage: "narration",
        },
      ],
    });
  });

  it("falls back to a plain error when the failure carries no structured readiness details", () => {
    const outcome = deriveSaveVersionOutcome(false, {
      error: {
        code: "internal_error",
        message: "Unexpected failure.",
        retryable: true,
        correlationId: "019ffbf1-eeee-7000-8000-000000000061",
      },
    });
    expect(outcome).toEqual({ kind: "error", message: "Unexpected failure." });
  });

  it("falls back to a generic message when the response body cannot be parsed at all", () => {
    expect(deriveSaveVersionOutcome(false, null)).toEqual({
      kind: "error",
      message: "Unable to save this lesson version.",
    });
  });

  it("reports success regardless of body once the response is ok", () => {
    expect(deriveSaveVersionOutcome(true, blockedPayload())).toEqual({
      kind: "success",
    });
  });

  it("models a successful retry once the blocking prerequisite is approved", () => {
    const firstAttempt = deriveSaveVersionOutcome(false, blockedPayload());
    expect(firstAttempt.kind).toBe("blocked");

    const retryAfterApproval = deriveSaveVersionOutcome(true, null);
    expect(retryAfterApproval).toEqual({ kind: "success" });
  });
});
