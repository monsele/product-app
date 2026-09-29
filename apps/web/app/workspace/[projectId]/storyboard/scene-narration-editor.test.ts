import { describe, expect, it } from "vitest";
import type { LessonValidationRun, ValidationIssue } from "@avlp/schemas";
import { sceneGroundingFlags } from "./scene-narration-editor";

const sceneId = "0198d270-0000-7000-8000-000000000101";
const otherSceneId = "0198d270-0000-7000-8000-000000000102";

function flag(overrides: Partial<ValidationIssue>): ValidationIssue {
  return {
    id: "0198d270-0000-7000-8000-000000000201",
    severity: "warning",
    code: "grounding_unsupported_claim",
    scopeType: "grounding",
    scopeId: sceneId,
    sceneId,
    fieldPath: "grounding.claims.claim-1",
    message: "Narration isn't backed by your document.",
    details: { claimText: "Water boils at 50 degrees.", reasons: [] },
    acknowledgeable: true,
    acknowledgedAt: null,
    ...overrides,
  };
}

function run(issues: ValidationIssue[], stale = false): LessonValidationRun {
  return { issues, stale, inputHash: "hash" } as unknown as LessonValidationRun;
}

describe("sceneGroundingFlags", () => {
  it("returns this scene's flagged sentences only", () => {
    const mine = flag({});
    const theirs = flag({
      id: "0198d270-0000-7000-8000-000000000202",
      sceneId: otherSceneId,
      scopeId: otherSceneId,
    });
    const unrelated = flag({
      id: "0198d270-0000-7000-8000-000000000203",
      code: "text_overflow",
      acknowledgeable: false,
    });
    expect(sceneGroundingFlags(run([mine, theirs, unrelated]), sceneId)).toEqual([
      mine,
    ]);
  });

  it("ignores stale runs and findings without a quoted sentence", () => {
    expect(sceneGroundingFlags(run([flag({})], true), sceneId)).toEqual([]);
    expect(
      sceneGroundingFlags(run([flag({ details: {} })]), sceneId),
    ).toEqual([]);
    expect(sceneGroundingFlags(null, sceneId)).toEqual([]);
  });
});
