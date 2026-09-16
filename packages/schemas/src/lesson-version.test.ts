import { describe, expect, it } from "vitest";
import {
  versionRecoveryStageSchema,
  versionSaveBlockerSchema,
  versionSaveReadinessSchema,
} from "./index.js";

function blocker(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    code: "narration_unapproved",
    message: "Narration is still a draft and must be approved.",
    recoveryStage: "narration",
    ...overrides,
  };
}

describe("versionRecoveryStageSchema", () => {
  it("accepts only the allowlisted workspace stages", () => {
    for (const stage of ["configuration", "objectives", "outline", "narration", "storyboard"])
      expect(versionRecoveryStageSchema.safeParse(stage).success).toBe(true);
  });

  it("rejects a stage outside the allowlist, including one that resembles a route", () => {
    expect(versionRecoveryStageSchema.safeParse("preview").success).toBe(false);
    expect(versionRecoveryStageSchema.safeParse("render").success).toBe(false);
    expect(versionRecoveryStageSchema.safeParse("/workspace/other-project/narration").success).toBe(false);
    expect(versionRecoveryStageSchema.safeParse("https://evil.example/narration").success).toBe(false);
  });
});

describe("versionSaveBlockerSchema", () => {
  it("accepts a well-formed blocker", () => {
    expect(versionSaveBlockerSchema.safeParse(blocker()).success).toBe(true);
  });

  it("rejects an unrecognized blocker code", () => {
    const result = versionSaveBlockerSchema.safeParse(blocker({ code: "narration_is_on_fire" }));
    expect(result.success).toBe(false);
  });

  it("rejects an unsafe or arbitrary recovery route in place of an allowlisted stage", () => {
    expect(versionSaveBlockerSchema.safeParse(blocker({ recoveryStage: "https://evil.example" })).success).toBe(false);
    expect(versionSaveBlockerSchema.safeParse(blocker({ recoveryStage: "../admin" })).success).toBe(false);
  });

  it("rejects unknown extra fields (e.g. a database id leaking through)", () => {
    const result = versionSaveBlockerSchema.safeParse({ ...blocker(), narrationSetId: "019ffbf1-eeee-7000-8000-000000000050" });
    expect(result.success).toBe(false);
  });
});

describe("versionSaveReadinessSchema", () => {
  it("accepts a not-ready result with at least one blocker", () => {
    const result = versionSaveReadinessSchema.safeParse({ ready: false, blockers: [blocker()] });
    expect(result.success).toBe(true);
  });

  it("rejects a not-ready result with zero blockers", () => {
    const result = versionSaveReadinessSchema.safeParse({ ready: false, blockers: [] });
    expect(result.success).toBe(false);
  });

  it("rejects ready: true, since a readiness payload is only ever sent for a blocked save", () => {
    const result = versionSaveReadinessSchema.safeParse({ ready: true, blockers: [] });
    expect(result.success).toBe(false);
  });

  it("preserves deterministic multi-blocker order rather than a set", () => {
    const parsed = versionSaveReadinessSchema.parse({
      ready: false,
      blockers: [
        blocker({ code: "configuration_missing", message: "Lesson configuration has not been completed yet.", recoveryStage: "configuration" }),
        blocker({ code: "storyboard_missing", message: "The storyboard has not been generated yet.", recoveryStage: "storyboard" }),
      ],
    });
    expect(parsed.blockers.map((entry) => entry.code)).toEqual(["configuration_missing", "storyboard_missing"]);
  });
});
