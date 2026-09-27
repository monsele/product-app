import { describe, expect, it } from "vitest";
import {
  lessonAgeBandValues,
  lessonConfigurationInputSchema,
  lessonDifficultyValues,
  lessonFocusPromptMaxLength,
  lessonIntentDocumentOutlineSchema,
  lessonIntentOutputV1Schema,
  lessonSpecSchema,
  lessonSpecVersion,
  legacyAudienceLessonSpecVersion,
  learningObjectiveSetSchema,
  modelCallOperationValues,
  objectiveFocusCoverageSchema,
  objectiveGenerationParamsSchema,
  objectiveOutputFocusCoverage,
  objectiveOutputSchema,
  objectiveOutputV2Schema,
  parseLessonSpec,
  type LessonSpec,
} from "./index.js";

const ids = [
  "018f1111-1111-7111-8111-111111111111",
  "018f1111-1111-7111-8111-111111111112",
  "018f1111-1111-7111-8111-111111111113",
  "018f1111-1111-7111-8111-111111111114",
  "018f1111-1111-7111-8111-111111111115",
] as const;

const legacyLesson: LessonSpec = {
  schemaVersion: "1.8",
  lessonId: ids[0],
  projectId: ids[1],
  title: "Load paths in a truss",
  subject: "Structural engineering",
  audience: {
    ageBand: "adult-beginner",
    difficulty: "intermediate",
    priorKnowledge: [],
  },
  targetDurationSeconds: 180,
  tone: "academic",
  themeId: "mvp-default",
  objectiveIds: [ids[2]],
  voice: { providerVoiceId: "english-aria", speakingRate: 1 },
  scenes: [
    {
      id: ids[3],
      order: 1,
      narration: "Loads travel through members to the supports.",
      durationSeconds: 180,
      onScreenText: [],
      transition: "fade",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: ids[4],
          parsedDocumentVersion: 1,
          pageStart: 1,
          blockIds: [ids[2]],
        },
      ],
      generatedAdditions: [],
      template: "summary",
      visual: { takeaways: [{ text: "Members carry axial load." }] },
    },
  ],
};

const outputV1 = {
  schemaVersion: "objectives-v1" as const,
  objectives: [0, 1, 2].map((index) => ({
    statement: `Explain load path ${index}.`,
    verb: "explain",
    sourceBlockIds: [ids[2]],
    confidence: 0.9,
  })),
  keyConcepts: [],
  prerequisiteKnowledge: [],
  vocabulary: [],
  misconceptions: [],
  assessmentQuestions: [],
};

describe("ST-104 audience values", () => {
  it("adds advanced difficulty and adult bands without removing existing values", () => {
    expect(lessonAgeBandValues).toEqual([
      "8-10",
      "11-13",
      "14-16",
      "adult-beginner",
      "adult-intermediate",
      "adult-professional",
    ]);
    expect(lessonDifficultyValues).toEqual([
      "introductory",
      "intermediate",
      "advanced",
    ]);
  });
});

describe("ST-104 LessonSpec 1.8/1.9 compatibility", () => {
  it("writes 1.9 and still reads a stored 1.8 document byte-for-byte", () => {
    expect(lessonSpecVersion).toBe("1.9");
    expect(legacyAudienceLessonSpecVersion).toBe("1.8");
    const parsed = lessonSpecSchema.parse(legacyLesson);
    expect(parsed).toEqual(legacyLesson);
    expect(JSON.stringify(parseLessonSpec(legacyLesson))).toBe(
      JSON.stringify(legacyLesson),
    );
  });

  it("accepts adult-professional with advanced only on 1.9", () => {
    const professional = {
      ...legacyLesson,
      audience: {
        ageBand: "adult-professional",
        difficulty: "advanced",
        priorKnowledge: [],
      },
    };
    expect(
      lessonSpecSchema.safeParse({ ...professional, schemaVersion: "1.9" })
        .success,
    ).toBe(true);
    const asLegacy = lessonSpecSchema.safeParse(professional);
    expect(asLegacy.success).toBe(false);
    expect(asLegacy.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      ["audience.ageBand", "audience.difficulty"],
    );
  });

  it("accepts every legacy audience value on 1.9 as well", () => {
    expect(
      lessonSpecSchema.safeParse({ ...legacyLesson, schemaVersion: "1.9" })
        .success,
    ).toBe(true);
  });
});

describe("ST-104 focus prompt", () => {
  const base = {
    expectedVersion: 1,
    ageBand: "adult-professional",
    difficulty: "advanced",
    subject: "History",
    lessonTitle: "The printing press",
    targetDurationSeconds: 180,
    tone: "academic",
    includeRecallQuestions: false,
  };

  it("trims, bounds, and allows omission or an explicit clear", () => {
    expect(
      lessonConfigurationInputSchema.parse({
        ...base,
        focusPrompt: "  How did print change religion?  ",
      }).focusPrompt,
    ).toBe("How did print change religion?");
    expect(lessonConfigurationInputSchema.parse(base).focusPrompt).toBe(
      undefined,
    );
    expect(
      lessonConfigurationInputSchema.parse({ ...base, focusPrompt: null })
        .focusPrompt,
    ).toBeNull();
    for (const focusPrompt of [
      "   ",
      "x".repeat(lessonFocusPromptMaxLength + 1),
    ])
      expect(
        lessonConfigurationInputSchema.safeParse({ ...base, focusPrompt })
          .success,
      ).toBe(false);
  });

  it("is optional on generation params so an unfocused lesson keeps its shape", () => {
    const params = {
      configurationVersion: 1,
      lessonTitle: "Print",
      subject: "History",
      ageBand: "adult-professional",
      difficulty: "advanced",
      tone: "academic",
      targetDurationSeconds: 180,
      includeRecallQuestions: false,
    };
    expect(objectiveGenerationParamsSchema.parse(params)).not.toHaveProperty(
      "focusPrompt",
    );
    expect(
      objectiveGenerationParamsSchema.parse({
        ...params,
        focusPrompt: "Religion",
      }).focusPrompt,
    ).toBe("Religion");
  });
});

describe("ST-104 focus coverage", () => {
  it("parses the three coverage states and rejects malformed ones", () => {
    expect(objectiveFocusCoverageSchema.parse({ status: "covered" })).toEqual({
      status: "covered",
    });
    expect(
      objectiveFocusCoverageSchema.parse({
        status: "partial",
        missing: ["Economic effects"],
      }),
    ).toEqual({ status: "partial", missing: ["Economic effects"] });
    expect(
      objectiveFocusCoverageSchema.parse({
        status: "not_covered",
        reason: "The document is about bridges, not the focus topic.",
      }).status,
    ).toBe("not_covered");
    for (const invalid of [
      { status: "partial", missing: [] },
      { status: "not_covered" },
      { status: "covered", reason: "extra" },
      { status: "unknown" },
    ])
      expect(objectiveFocusCoverageSchema.safeParse(invalid).success).toBe(
        false,
      );
  });

  it("accepts V1 (pinned v2 jobs) and V2 outputs through one reader", () => {
    const v1 = objectiveOutputSchema.parse(outputV1);
    expect(objectiveOutputFocusCoverage(v1)).toBeNull();
    const v2 = objectiveOutputSchema.parse({
      ...outputV1,
      schemaVersion: "objectives-v2",
      focusCoverage: { status: "covered" },
    });
    expect(objectiveOutputFocusCoverage(v2)).toEqual({ status: "covered" });
    expect(
      objectiveOutputV2Schema.safeParse({
        ...outputV1,
        schemaVersion: "objectives-v2",
      }).success,
    ).toBe(false);
  });

  it("keeps focusCoverage optional on persisted sets generated before v3", () => {
    const set = {
      schemaVersion: 1,
      id: ids[0],
      projectId: ids[1],
      sourceSnapshotId: ids[2],
      sourceSnapshotContentHash: "a".repeat(64),
      configurationVersion: 1,
      promptId: "objectives",
      promptVersion: "v2",
      model: "mock",
      modelCallId: ids[3],
      status: "draft",
      revision: 0,
      objectives: [],
      keyConcepts: [],
      prerequisiteKnowledge: [],
      vocabulary: [],
      misconceptions: [],
      assessmentQuestions: [],
      generatedAt: "2026-09-27T12:00:00.000Z",
      createdAt: "2026-09-27T12:00:00.000Z",
    };
    expect(learningObjectiveSetSchema.safeParse(set).success).toBe(true);
    expect(
      learningObjectiveSetSchema.safeParse({
        ...set,
        focusCoverage: { status: "not_covered", reason: "Off topic." },
      }).success,
    ).toBe(true);
  });
});

describe("ST-104 lesson intent", () => {
  it("is a registered model-call operation", () => {
    expect(modelCallOperationValues).toContain("ai.lesson-intent");
  });

  it("carries only a title and headings, never body text", () => {
    expect(
      lessonIntentDocumentOutlineSchema.safeParse({
        title: "Bridges",
        headings: ["Trusses"],
        blocks: ["Body text"],
      }).success,
    ).toBe(false);
    expect(
      lessonIntentOutputV1Schema.parse({
        schemaVersion: "lesson-intent-v1",
        subject: "Civil engineering",
        lessonTitle: "How trusses carry load",
      }).subject,
    ).toBe("Civil engineering");
  });
});

describe("ST-104 configuration reader compatibility", () => {
  it("reads a configuration without focusPrompt (a pre-ST-104 API) as no focus", async () => {
    const { lessonConfigurationSchema } = await import("./index.js");
    const parsed = lessonConfigurationSchema.parse({
      version: 1,
      ageBand: "11-13",
      difficulty: "introductory",
      subject: "Biology",
      lessonTitle: "The Water Cycle",
      targetDurationSeconds: 300,
      tone: "friendly",
      visualTheme: "mvp-default",
      videoApproach: "standard",
      creativeStylePack: null,
      soundBed: "none",
      includeRecallQuestions: false,
      sourceParsedDocumentVersion: 1,
      updatedAt: "2026-09-27T08:00:00.000Z",
    });
    expect(parsed.focusPrompt).toBeNull();
  });
});
