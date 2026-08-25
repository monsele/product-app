import { describe, expect, it } from "vitest";
import { boundedJobTypeLabel } from "./metrics.js";

describe("bounded metric labels", () => {
  it("uses only registered job types and collapses arbitrary values", () => {
    const allowed = new Set(["lesson.generate"]);

    expect(boundedJobTypeLabel("lesson.generate", allowed)).toBe(
      "lesson.generate",
    );
    expect(boundedJobTypeLabel("tenant-controlled-value", allowed)).toBe(
      "unknown",
    );
    expect(boundedJobTypeLabel("invalid value", allowed)).toBe("unknown");
  });
});
