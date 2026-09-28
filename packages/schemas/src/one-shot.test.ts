import { describe, expect, it } from "vitest";
import {
  createOneShotBriefOutputSchema,
  oneShotBriefResponseSchema,
  oneShotCreateInputSchema,
  oneShotDecisionDraftSchema,
  oneShotPlannedSceneRange,
} from "./one-shot.js";

const sections = ["019ffc70-5ec1-7000-8000-000000000001", "019ffc70-5ec1-7000-8000-000000000002"];
const schema = createOneShotBriefOutputSchema({
  sectionIds: sections,
  soundBedTrackIds: ["morning-pad"],
  targetDurationSeconds: 180,
});
const valid = {
  schemaVersion: "one-shot-brief-v1",
  subject: "Structural engineering",
  lessonTitle: "How trusses carry load",
  coverage: [
    { point: "Load paths", sectionIds: [sections[0]] },
    { point: "Triangles", sectionIds: [sections[1]] },
  ],
  notCovered: [],
  plannedSceneCount: 6,
  stylePackId: "systems",
  stylePackReason: "Precise diagrams suit load paths.",
  soundBed: "morning-pad",
  soundBedReason: "Calm under narration.",
};

describe("ST-107 brief output schema", () => {
  it("accepts a brief that only uses what exists", () => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, soundBed: "none" }).success).toBe(true);
  });

  it("rejects a section, style pack or track that does not exist", () => {
    expect(
      schema.safeParse({
        ...valid,
        coverage: [valid.coverage[0], { point: "Invented", sectionIds: ["019ffc70-dead-7000-8000-000000000001"] }],
      }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...valid, stylePackId: "hologram" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, soundBed: "invented-track" }).success).toBe(false);
  });

  it("bounds coverage, reasons and the scene plan", () => {
    expect(schema.safeParse({ ...valid, coverage: [valid.coverage[0]] }).success).toBe(false);
    expect(
      schema.safeParse({ ...valid, coverage: Array.from({ length: 9 }, () => valid.coverage[0]) }).success,
    ).toBe(false);
    expect(schema.safeParse({ ...valid, stylePackReason: "x".repeat(201) }).success).toBe(false);
    const range = oneShotPlannedSceneRange(180);
    expect(range).toEqual({ min: 3, max: 9 });
    expect(schema.safeParse({ ...valid, plannedSceneCount: range.min - 1 }).success).toBe(false);
    expect(schema.safeParse({ ...valid, plannedSceneCount: range.max + 1 }).success).toBe(false);
    // The model never produces a cost.
    expect(schema.safeParse({ ...valid, estimatedCostUsd: 1 }).success).toBe(false);
  });

  it("confirms a revision with an optional closed-list override only", () => {
    expect(oneShotCreateInputSchema.safeParse({ briefRevision: 1, acceptedEstimateUsd: 5 }).success).toBe(true);
    expect(
      oneShotCreateInputSchema.safeParse({ briefRevision: 1, acceptedEstimateUsd: 5, stylePackId: "hologram" }).success,
    ).toBe(false);
    expect(oneShotCreateInputSchema.safeParse({ briefRevision: 0, acceptedEstimateUsd: 5 }).success).toBe(false);
    // The ST-105 request body is no longer an authorisation on its own.
    expect(
      oneShotCreateInputSchema.safeParse({ focusPrompt: "x", targetDurationSeconds: 180, acceptedEstimateUsd: 5 }).success,
    ).toBe(false);
  });

  it("reports the revision budget and the closed style list with every brief response", () => {
    expect(
      oneShotBriefResponseSchema.safeParse({ brief: null, revisionsUsed: 0, maxRevisions: 3, stylePackIds: ["essential"] }).success,
    ).toBe(true);
  });

  it("keeps decision drafts to closed kinds and bounded text", () => {
    expect(oneShotDecisionDraftSchema.safeParse({ kind: "repair", summary: "Fixed." }).success).toBe(true);
    expect(oneShotDecisionDraftSchema.safeParse({ kind: "guess", summary: "Fixed." }).success).toBe(false);
    expect(oneShotDecisionDraftSchema.safeParse({ kind: "repair", summary: "x".repeat(501) }).success).toBe(false);
  });
});
