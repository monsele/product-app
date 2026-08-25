import { describe, expect, it } from "vitest";
import {
  definitionVisualSchema,
  analogyVisualSchema,
  comparisonVisualSchema,
  causeEffectVisualSchema,
  diagramVisualSchema,
  ipoVisualSchema,
  processVisualSchema,
  workedExampleVisualSchema,
  summaryVisualSchema,
  initialLessonSpecVersion,
  lessonSpecJsonSchema,
  lessonSpecSchema,
  migrateLessonSpecV1_3ToV1_4,
  migrateLessonSpecV1_4ToV1_5,
  migrateLessonSpecV1_5ToV1_6,
  migrateLessonSpecV1_6ToV1_7,
  migrateLessonSpecV1_2ToV1_3,
  migrateLessonSpecV1_0ToV1_1,
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
  schemaVersion: "1.8",
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

  it("migrates compatible 1.0 lesson specs to the current contract", () => {
    const legacy = { ...validLesson, schemaVersion: initialLessonSpecVersion };
    expect(migrateLessonSpecV1_0ToV1_1(legacy)).toEqual(validLesson);
    expect(parseLessonSpec(legacy)).toEqual(validLesson);
  });

  it("refuses to truncate legacy definition content during migration", () => {
    const legacy = {
      ...validLesson,
      schemaVersion: initialLessonSpecVersion,
      scenes: [
        {
          ...validLesson.scenes[0],
          visual: { term: "Term", definition: "D".repeat(121) },
        },
      ],
    };
    expect(() => migrateLessonSpecV1_0ToV1_1(legacy)).toThrow(
      "requires an explicit teacher migration",
    );
  });

  it.each([
    ["hook", { question: "What changes water?" }],
    ["definition", { term: "Matter", definition: "Anything with mass." }],
    ["process", { steps: ["Heat", "Evaporate"] }],
    [
      "input-process-output",
      {
        inputs: [{ label: "Water" }],
        process: { label: "Heating" },
        outputs: [{ label: "Vapour" }],
      },
    ],
    [
      "comparison",
      {
        leftSubject: { label: "Solid" },
        rightSubject: { label: "Liquid" },
        similarities: ["Matter"],
        differences: ["Shape"],
      },
    ],
    [
      "cause-effect",
      {
        causes: [{ id: "cause-1", label: "Heating" }],
        effects: [{ id: "effect-1", label: "Evaporation" }],
        connections: [{ from: "cause-1", to: "effect-1" }],
      },
    ],
    [
      "labelled-diagram",
      {
        kind: "shapes",
        shape: "cycle",
        labels: [{ anchor: "top", id: "cloud", text: "Cloud" }],
      },
    ],
    [
      "analogy",
      {
        sourceConcept: "Particle movement",
        familiarSystem: "People moving through a hallway",
        mappings: [{ concept: "Faster particles", analogy: "Faster walkers" }],
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
    ["summary", { takeaways: [{ text: "Matter changes state" }] }],
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

  it("enforces the hook template's bounded visual contract", () => {
    expect(
      sceneSpecSchema.safeParse({
        ...baseScene,
        template: "hook",
        visual: { question: "Q".repeat(81) },
      }).success,
    ).toBe(false);
    expect(
      sceneSpecSchema.safeParse({
        ...baseScene,
        template: "hook",
        visual: {
          question: "What makes plants grow?",
          supportingElements: ["Sunlight", "Water", "Air", "Soil"],
        },
      }).success,
    ).toBe(false);
  });

  it("requires explicit, bounded analogy mapping pairs", () => {
    expect(
      analogyVisualSchema.safeParse({
        sourceConcept: "Electric current",
        familiarSystem: "Water pipes",
        mappings: [{ concept: "Current", analogy: "Water flow" }],
      }).success,
    ).toBe(true);
    expect(
      analogyVisualSchema.safeParse({
        sourceConcept: "Electric current",
        familiarSystem: "Water pipes",
        mappings: [],
      }).success,
    ).toBe(false);
  });

  it("upgrades non-analogy 1.6 documents and requires teacher mapping for legacy analogies", () => {
    expect(
      migrateLessonSpecV1_6ToV1_7({
        ...validLesson,
        schemaVersion: "1.6",
      }),
    ).toMatchObject({ schemaVersion: "1.8" });
    expect(() =>
      migrateLessonSpecV1_6ToV1_7({
        ...validLesson,
        schemaVersion: "1.6",
        scenes: [
          {
            ...baseScene,
            template: "analogy",
            visual: {
              sourceConcept: "Electric current",
              analogy: "Water pipes",
              mapping: ["Current is like water flow"],
            },
          },
        ],
      }),
    ).toThrow("requires an explicit teacher migration");
  });

  it("validates definition examples as paired bounded visual fields", () => {
    expect(
      definitionVisualSchema.safeParse({
        term: "T".repeat(80),
        definition: "D".repeat(120),
        exampleLabel: "L".repeat(48),
        exampleText: "E".repeat(48),
      }).success,
    ).toBe(true);
    expect(
      definitionVisualSchema.safeParse({
        term: "T".repeat(81),
        definition: "A definition.",
      }).success,
    ).toBe(false);
    expect(
      definitionVisualSchema.safeParse({
        term: "Term",
        definition: "A definition.",
        exampleLabel: "Example",
      }).success,
    ).toBe(false);
  });

  it("enforces the bounded ordered process visual contract", () => {
    expect(
      processVisualSchema.safeParse({ steps: ["Collect", "Compare"] }).success,
    ).toBe(true);
    expect(processVisualSchema.safeParse({ steps: ["Only one"] }).success).toBe(
      false,
    );
    expect(
      processVisualSchema.safeParse({
        steps: Array.from({ length: 7 }, () => "Step"),
      }).success,
    ).toBe(false);
    expect(
      processVisualSchema.safeParse({ steps: ["L".repeat(81), "Next"] })
        .success,
    ).toBe(false);
  });

  it("requires bounded IPO collections, labels, and optional asset slots", () => {
    expect(
      ipoVisualSchema.safeParse({
        inputs: [{ label: "Water", assetSlot: "input-1-icon" }],
        process: { label: "Heat" },
        outputs: [{ label: "Water vapour", assetSlot: "output-1-icon" }],
      }).success,
    ).toBe(true);
    expect(
      ipoVisualSchema.safeParse({
        inputs: [],
        process: { label: "Heat" },
        outputs: [{ label: "Water vapour" }],
      }).success,
    ).toBe(false);
    expect(
      ipoVisualSchema.safeParse({
        inputs: [{ label: "Water", assetSlot: "unapproved-slot" }],
        process: { label: "Heat" },
        outputs: [{ label: "Water vapour" }],
      }).success,
    ).toBe(false);
    expect(
      ipoVisualSchema.safeParse({
        inputs: [{ label: "Water" }],
        process: { label: "" },
        outputs: [],
      }).success,
    ).toBe(false);
  });

  it("requires two bounded subjects and no more than four comparison differences", () => {
    expect(
      comparisonVisualSchema.safeParse({
        leftSubject: { label: "Solid", assetSlot: "left-subject-image" },
        rightSubject: { label: "Liquid", assetSlot: "right-subject-image" },
        similarities: ["Matter"],
        differences: ["Shape", "Flow", "Volume", "Particle movement"],
      }).success,
    ).toBe(true);
    const tooManyDifferences = comparisonVisualSchema.safeParse({
      leftSubject: { label: "Solid" },
      rightSubject: { label: "Liquid" },
      similarities: ["Matter"],
      differences: ["One", "Two", "Three", "Four", "Five"],
    });
    expect(tooManyDifferences.success).toBe(false);
    if (!tooManyDifferences.success)
      expect(tooManyDifferences.error.issues[0]?.path).toEqual(["differences"]);
  });

  it("requires bounded explicit causal chains and migrates the former cause/effect labels", () => {
    expect(
      causeEffectVisualSchema.safeParse({
        causes: [{ id: "cause-1", label: "Heating" }],
        mechanism: { id: "mechanism", label: "Molecules gain energy" },
        effects: [{ id: "effect-1", label: "Evaporation" }],
        connections: [
          { from: "cause-1", to: "mechanism" },
          { from: "mechanism", to: "effect-1" },
        ],
      }).success,
    ).toBe(true);
    expect(
      causeEffectVisualSchema.safeParse({
        causes: [],
        effects: [{ id: "effect-1", label: "Evaporation" }],
        connections: [],
      }).success,
    ).toBe(false);
    expect(
      causeEffectVisualSchema.safeParse({
        causes: Array.from({ length: 4 }, (_, index) => ({
          id: `cause-${index + 1}`,
          label: "Cause",
        })),
        effects: [{ id: "effect-1", label: "Effect" }],
        connections: [],
      }).success,
    ).toBe(false);
    expect(
      migrateLessonSpecV1_4ToV1_5({
        ...validLesson,
        schemaVersion: "1.4",
        scenes: [
          {
            ...validLesson.scenes[0],
            template: "cause-effect",
            visual: { causes: ["Heating"], effects: ["Evaporation"] },
          },
        ],
      }),
    ).toMatchObject({
      schemaVersion: "1.8",
      scenes: [
        expect.objectContaining({
          visual: expect.objectContaining({
            connections: [{ from: "cause-1", to: "effect-1" }],
          }),
        }),
      ],
    });
  });

  it("migrates 1.3 comparison labels to structured subjects", () => {
    const prior = {
      ...validLesson,
      schemaVersion: "1.3",
      scenes: [
        {
          ...validLesson.scenes[0],
          template: "comparison" as const,
          visual: {
            leftLabel: "Solid",
            rightLabel: "Liquid",
            similarities: ["Matter"],
            differences: ["Shape"],
          },
        },
      ],
    };
    expect(migrateLessonSpecV1_3ToV1_4(prior)).toMatchObject({
      schemaVersion: "1.8",
      scenes: [
        expect.objectContaining({
          visual: expect.objectContaining({
            leftSubject: { label: "Solid" },
            rightSubject: { label: "Liquid" },
          }),
        }),
      ],
    });
  });

  it("migrates scalar IPO data from 1.2 and rejects incompatible process content", () => {
    const compatible = {
      ...validLesson,
      schemaVersion: "1.2",
      scenes: [
        {
          ...validLesson.scenes[0],
          template: "process",
          visual: { steps: ["Collect", "Compare"] },
        },
      ],
    };
    const scalarIpo = {
      ...compatible,
      scenes: [
        {
          ...validLesson.scenes[0],
          template: "input-process-output" as const,
          visual: { input: "Water", process: "Heat", output: "Vapour" },
        },
      ],
    };
    expect(migrateLessonSpecV1_2ToV1_3(scalarIpo)).toMatchObject({
      schemaVersion: "1.8",
      scenes: [
        expect.objectContaining({
          template: "input-process-output",
          visual: {
            inputs: [{ label: "Water" }],
            process: { label: "Heat" },
            outputs: [{ label: "Vapour" }],
          },
        }),
      ],
    });
    expect(migrateLessonSpecV1_2ToV1_3(compatible)).toMatchObject({
      schemaVersion: "1.8",
      scenes: [
        expect.objectContaining({
          template: "process",
          visual: { steps: ["Collect", "Compare"] },
        }),
      ],
    });
    expect(() =>
      migrateLessonSpecV1_2ToV1_3({
        ...compatible,
        scenes: [
          {
            ...compatible.scenes[0],
            visual: { steps: Array.from({ length: 7 }, () => "Step") },
          },
        ],
      }),
    ).toThrow("requires an explicit teacher migration");
  });

  it("exports a named JSON Schema for external consumers", () => {
    expect(lessonSpecJsonSchema.definitions?.LessonSpec).toBeDefined();
  });

  it("accepts only bounded semantic labelled-diagram anchors", () => {
    expect(
      diagramVisualSchema.safeParse({
        kind: "asset",
        baseAssetSlot: "diagram",
        labels: [{ id: "nucleus", anchor: "left", text: "Nucleus" }],
      }).success,
    ).toBe(true);
    expect(
      diagramVisualSchema.safeParse({
        kind: "asset",
        baseAssetSlot: "diagram",
        labels: [{ id: "nucleus", anchor: "x-472", text: "Nucleus" }],
      }).success,
    ).toBe(false);
  });

  it("accepts bounded worked-example content and rejects unsafe density", () => {
    expect(
      workedExampleVisualSchema.safeParse({
        problem: "What is 24 ÷ 8?",
        steps: ["Divide 24 by 8."],
        answer: "3",
      }).success,
    ).toBe(true);
    expect(
      workedExampleVisualSchema.safeParse({
        problem: "Problem",
        steps: Array.from({ length: 13 }, () => "Step"),
        answer: "Answer",
      }).success,
    ).toBe(false);
    expect(
      workedExampleVisualSchema.safeParse({
        problem: "p".repeat(1001),
        steps: ["Step"],
        answer: "Answer",
      }).success,
    ).toBe(false);
  });

  it("migrates legacy labelled diagrams to the shapes-only semantic fallback", () => {
    expect(
      migrateLessonSpecV1_5ToV1_6({
        ...validLesson,
        schemaVersion: "1.5",
        scenes: [
          {
            ...validLesson.scenes[0],
            template: "labelled-diagram",
            visual: { diagramDescription: "Water cycle", labels: ["Cloud"] },
          },
        ],
      }),
    ).toMatchObject({
      schemaVersion: "1.8",
      scenes: [
        expect.objectContaining({
          visual: {
            kind: "shapes",
            shape: "system",
            labels: [{ anchor: "top-left", id: "label-1", text: "Cloud" }],
          },
        }),
      ],
    });
  });

  it("requires concise structured summary takeaways and optional objective links", () => {
    expect(
      summaryVisualSchema.safeParse({
        centralModel: "Energy changes particle movement.",
        takeaways: [
          { text: "Heating speeds particles up.", objectiveId: ids[4] },
        ],
      }).success,
    ).toBe(true);
    expect(summaryVisualSchema.safeParse({ takeaways: [] }).success).toBe(
      false,
    );
    const excessive = summaryVisualSchema.safeParse({
      takeaways: Array.from({ length: 5 }, () => ({ text: "Takeaway" })),
    });
    expect(excessive.success).toBe(false);
  });
});
