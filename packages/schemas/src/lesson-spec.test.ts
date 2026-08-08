import { describe, expect, it } from "vitest";
import {
  lessonSpecJsonSchema,
  lessonSpecSchema,
  parseLessonSpec,
  sceneSpecSchema,
  type LessonSpec,
} from "./index.js";

const ids = [
  "018f0000-0000-7000-8000-000000000001",
  "018f0000-0000-7000-8000-000000000002",
  "018f0000-0000-7000-8000-000000000003",
  "018f0000-0000-7000-8000-000000000004",
  "018f0000-0000-7000-8000-000000000005",
] as const;
const baseScene = {
  id: ids[2],
  order: 1,
  narration: "Water changes state when its temperature changes.",
  durationSeconds: 30,
  onScreenText: ["Changing states"],
  transition: "fade" as const,
  assetBindings: [],
  sourceRefs: [
    {
      documentId: ids[3],
      parsedDocumentVersion: 1,
      pageStart: 2,
      blockIds: [ids[4]],
    },
  ],
  generatedAdditions: [],
};
const validLesson: LessonSpec = {
  schemaVersion: "1.0",
  lessonId: ids[0],
  projectId: ids[1],
  title: "States of matter",
  subject: "Science",
  audience: {
    ageBand: "11-13",
    difficulty: "introductory",
    priorKnowledge: ["Particles"],
  },
  targetDurationSeconds: 300,
  tone: "friendly",
  themeId: "mvp-default",
  objectiveIds: [ids[4]],
  voice: { providerVoiceId: "en-US-teacher", speakingRate: 1 },
  scenes: [
    {
      ...baseScene,
      template: "definition",
      visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    },
  ],
};

describe("LessonSpec v1", () => {
  it("parses and round-trips a valid fixture without changing its shape", () => {
    const parsed = parseLessonSpec(JSON.parse(JSON.stringify(validLesson)));
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(validLesson);
  });

  it.each([
    ["hook", { question: "What changes water?" }],
    ["definition", { term: "Matter", definition: "Anything with mass." }],
    ["process", { steps: ["Heat", "Evaporate"] }],
    [
      "input-process-output",
      { input: "Water", process: "Heating", output: "Vapour" },
    ],
    [
      "comparison",
      {
        leftLabel: "Solid",
        rightLabel: "Liquid",
        similarities: ["Matter"],
        differences: ["Shape"],
      },
    ],
    ["cause-effect", { causes: ["Heating"], effects: ["Evaporation"] }],
    [
      "labelled-diagram",
      { diagramDescription: "A water-cycle diagram", labels: ["Cloud"] },
    ],
    [
      "analogy",
      {
        sourceConcept: "Particles",
        analogy: "People moving",
        mapping: ["Fast means warmer"],
      },
    ],
    [
      "worked-example",
      {
        problem: "What happens when ice warms?",
        steps: ["Add heat"],
        answer: "It melts.",
      },
    ],
    ["summary", { takeaways: ["Matter changes state"] }],
  ] as const)("accepts the %s template", (template, visual) => {
    expect(
      sceneSpecSchema.safeParse({ ...baseScene, template, visual }).success,
    ).toBe(true);
  });

  it("rejects unsupported versions, templates, invalid settings, and missing provenance", () => {
    expect(
      lessonSpecSchema.safeParse({ ...validLesson, schemaVersion: "2.0" })
        .success,
    ).toBe(false);
    expect(
      sceneSpecSchema.safeParse({
        ...validLesson.scenes[0],
        template: "freeform",
      }).success,
    ).toBe(false);
    expect(
      lessonSpecSchema.safeParse({ ...validLesson, targetDurationSeconds: 240 })
        .success,
    ).toBe(false);
    expect(
      lessonSpecSchema.safeParse({ ...validLesson, tone: "excited" }).success,
    ).toBe(false);
    expect(
      lessonSpecSchema.safeParse({
        ...validLesson,
        audience: { ...validLesson.audience, ageBand: "7-9" },
      }).success,
    ).toBe(false);
    expect(
      lessonSpecSchema.safeParse({
        ...validLesson,
        scenes: [{ ...validLesson.scenes[0], transition: "zoom" }],
      }).success,
    ).toBe(false);
    expect(
      lessonSpecSchema.safeParse({
        ...validLesson,
        scenes: [{ ...validLesson.scenes[0], sourceRefs: [] }],
      }).success,
    ).toBe(false);
  });

  it("exports a named JSON Schema for external consumers", () => {
    expect(lessonSpecJsonSchema.definitions?.LessonSpec).toBeDefined();
  });
});
