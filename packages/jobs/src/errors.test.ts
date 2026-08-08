import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifyJobError, JobExecutionError } from "./index.js";

describe("job error classification", () => {
  it("keeps declared terminal failures terminal", () => {
    expect(
      classifyJobError(
        new JobExecutionError(
          "terminal",
          "UNSUPPORTED_INPUT",
          "The input cannot be processed.",
        ),
      ),
    ).toMatchObject({
      classification: "terminal",
      code: "UNSUPPORTED_INPUT",
    });
  });

  it("redacts unknown failures and treats schema failures as terminal", () => {
    expect(classifyJobError(new Error("provider token=secret"))).toEqual({
      classification: "retryable",
      code: "UNEXPECTED_JOB_FAILURE",
      message: "The job failed unexpectedly.",
    });
    const result = z.object({ required: z.string() }).safeParse({});
    if (result.success) throw new Error("Expected validation to fail.");
    expect(classifyJobError(result.error).classification).toBe("terminal");
  });
});
