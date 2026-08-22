import { describe, expect, it } from "vitest";
import {
  createDefaultStoryboardSceneSpec,
  currentSceneRegenerationCompatibility,
  lessonStoryboardSchema,
  lessonStoryboardSceneSchema,
  migrateStoryboardSceneTemplate,
  sceneEditInvalidation,
  sceneEditorMetadata,
  sceneCandidateDecisionInputSchema,
  sceneCandidateSchema,
  sceneRegenerationInputSchema,
  sceneRegenerationOutputSchema,
  sceneRegenerationParamsSchema,
  sceneRegenerationResponseSchema,
  sceneSpecSchema,
  sceneTemplateValues,
  storyboardAssetRequirementSchema,
  storyboardDurationToleranceSeconds,
  storyboardGenerationParamsSchema,
  storyboardGenerationResponseSchema,
  storyboardOutputV1Schema,
  storyboardResponseSchema,
  storyboardSceneCreateInputSchema,
  storyboardSceneDeleteInputSchema,
  storyboardSceneDetailResponseSchema,
  storyboardSceneDuplicateInputSchema,
  storyboardSceneListEntrySchema,
  storyboardSceneListResponseSchema,
  storyboardSceneOutputSchema,
  storyboardSceneReorderInputSchema,
  storyboardSceneTemplateSwitchInputSchema,
  storyboardSceneUpdateInputSchema,
  storyboardTemplateCatalog,
  storyboardTemplateCatalogEntrySchema,
  type LessonStoryboard,
  type LessonStoryboardScene,
  type StoryboardSceneOutput,
} from "./index.js";

const blockA = "019ffbf1-2222-7000-8000-000000000001";
const blockB = "019ffbf1-2223-7000-8000-000000000001";
const objectiveId = "019ffbf1-9999-7000-8000-000000000001";

function sceneOutput(
  overrides: Record<string, unknown> = {},
): StoryboardSceneOutput {
  return storyboardSceneOutputSchema.parse({
    template: "definition",
    narrationBlockIds: [blockA],
    onScreenText: ["Key term"],
    visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    estimatedSeconds: 30,
    transition: "cut",
    sourceBlockIds: [blockA],
    generatedAdditions: [],
    assetRequirements: [],
    ...overrides,
  });
}

function sampleOutput() {
  return storyboardOutputV1Schema.parse({
    schemaVersion: "storyboard-v1",
    targetDurationSeconds: 300,
    scenes: [
      sceneOutput({
        template: "hook",
        visual: { question: "What happens when water heats up?" },
      }),
      sceneOutput({ narrationBlockIds: [blockB] }),
      sceneOutput(),
      sceneOutput(),
      sceneOutput(),
    ].map((scene) => ({ ...scene, estimatedSeconds: 60 })),
  });
}

function sceneSpec(overrides: Record<string, unknown> = {}) {
  return sceneSpecSchema.parse({
    id: "019ffbf1-eeee-7000-8000-000000000001",
    order: 1,
    narration: "Heating water turns it into vapour.",
    durationSeconds: 30,
    onScreenText: ["Key term"],
    transition: "cut",
    assetBindings: [],
    sourceRefs: [
      {
        documentId: "019ffbf1-4444-7000-8000-000000000001",
        parsedDocumentVersion: 1,
        pageStart: 1,
        blockIds: [blockA],
      },
    ],
    generatedAdditions: [],
    template: "definition",
    visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    ...overrides,
  });
}

function storyboardScene(
  overrides: Record<string, unknown> = {},
): LessonStoryboardScene {
  return lessonStoryboardSceneSchema.parse({
    id: "019ffbf1-eeee-7000-8000-000000000001",
    stableSceneId: "019ffbf1-eeee-7000-8000-000000000001",
    order: 1,
    template: "definition",
    durationSeconds: 30,
    narrationBlockIds: [blockA],
    assetRequirements: [],
    scene: sceneSpec(),
    ...overrides,
  });
}

function sampleStoryboard(): LessonStoryboard {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: "019ffbf1-eeee-7000-8000-000000000010",
    projectId: "019ffbf1-ffff-7000-8000-000000000001",
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000020",
    narrationSetContentHash: "a".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000021",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 2,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000030",
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 300,
    totalDurationSeconds: 30,
    objectiveIds: [objectiveId],
    contentHash: "c".repeat(64),
    scenes: [storyboardScene()],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
  });
}

describe("storyboard template catalog", () => {
  it("provides one entry for every supported template with positive limits", () => {
    expect(storyboardTemplateCatalog).toHaveLength(sceneTemplateValues.length);
    for (const entry of storyboardTemplateCatalog) {
      const parsed = storyboardTemplateCatalogEntrySchema.parse(entry);
      expect(sceneTemplateValues).toContain(parsed.template);
      expect(Object.values(parsed.itemLimits).every((limit) => limit > 0)).toBe(
        true,
      );
      expect(Object.values(parsed.textLimits).every((limit) => limit > 0)).toBe(
        true,
      );
      expect(parsed.guidance.length).toBeGreaterThan(0);
    }
    expect(
      new Set(storyboardTemplateCatalog.map((entry) => entry.template)).size,
    ).toBe(sceneTemplateValues.length);
  });

  it("catalog guidance steers asset-dependent templates to storyboard-safe defaults", () => {
    const diagram = storyboardTemplateCatalog.find(
      (entry) => entry.template === "labelled-diagram",
    );
    expect(diagram?.guidance).toContain("shapes");
  });
});

describe("storyboard scene output schema", () => {
  it("accepts every supported template with its own visual shape", () => {
    const fixtures: Record<string, unknown> = {
      hook: { question: "What will you discover?" },
      definition: { term: "Term", definition: "A concise explanation." },
      process: { steps: ["First step", "Second step"] },
      "input-process-output": {
        inputs: [{ label: "Input" }],
        process: { label: "Process" },
        outputs: [{ label: "Output" }],
      },
      comparison: {
        leftSubject: { label: "Left" },
        rightSubject: { label: "Right" },
        similarities: ["Shared"],
        differences: ["Different"],
      },
      "cause-effect": {
        causes: [{ id: "cause-1", label: "Cause" }],
        effects: [{ id: "effect-1", label: "Effect" }],
        connections: [{ from: "cause-1", to: "effect-1" }],
      },
      "labelled-diagram": {
        kind: "shapes",
        shape: "system",
        labels: [{ anchor: "top-left", id: "label-1", text: "Part" }],
      },
      analogy: {
        sourceConcept: "Concept",
        familiarSystem: "Familiar system",
        mappings: [{ concept: "Part", analogy: "Familiar part" }],
      },
      "worked-example": {
        problem: "Problem",
        steps: ["Step one"],
        answer: "Answer",
      },
      summary: { takeaways: [{ text: "Takeaway" }] },
    };
    for (const template of sceneTemplateValues) {
      expect(() =>
        sceneOutput({ template, visual: fixtures[template] }),
      ).not.toThrow();
    }
  });

  it("rejects an unsupported template", () => {
    expect(() => sceneOutput({ template: "unknown" })).toThrow();
  });

  it("rejects a scene without narration blocks", () => {
    expect(() => sceneOutput({ narrationBlockIds: [] })).toThrow();
  });

  it("rejects over-limit visual text", () => {
    expect(() =>
      sceneOutput({ visual: { term: "T".repeat(81), definition: "Short." } }),
    ).toThrow();
  });

  it("rejects an estimated duration outside the scene bounds", () => {
    expect(() => sceneOutput({ estimatedSeconds: 61 })).toThrow();
  });

  it("rejects asset requirements beyond the per-scene cap", () => {
    expect(() =>
      sceneOutput({
        assetRequirements: Array.from({ length: 11 }, () => ({
          slot: "slot",
          purpose: "Needed later.",
        })),
      }),
    ).toThrow();
  });
});

describe("storyboard output schema", () => {
  it("accepts a bounded grounded output", () => {
    expect(() => sampleOutput()).not.toThrow();
  });

  it("rejects an unknown schema version", () => {
    expect(() =>
      storyboardOutputV1Schema.parse({
        ...sampleOutput(),
        schemaVersion: "storyboard-v2",
      }),
    ).toThrow();
  });

  it("rejects fewer than the minimum scene count", () => {
    expect(() =>
      storyboardOutputV1Schema.parse({
        ...sampleOutput(),
        scenes: [sceneOutput()],
      }),
    ).toThrow();
  });

  it("rejects an ungrounded scene", () => {
    expect(() =>
      storyboardOutputV1Schema.parse({
        ...sampleOutput(),
        scenes: [
          sceneOutput(),
          sceneOutput({
            template: "hook",
            visual: { question: "Why?" },
            sourceBlockIds: [],
          }),
          sceneOutput({ sourceBlockIds: [], generatedAdditions: [] }),
        ],
      }),
    ).toThrow();
  });

  it("rejects a scene grounded only by a generated addition", () => {
    expect(() =>
      storyboardSceneOutputSchema.parse(
        sceneOutput({
          sourceBlockIds: [],
          generatedAdditions: [
            {
              kind: "analogy",
              content: "Like a sponge.",
              rationale: "A generated analogy.",
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it("accepts a scene with generated additions alongside citations", () => {
    expect(() =>
      storyboardSceneOutputSchema.parse(
        sceneOutput({
          generatedAdditions: [
            {
              kind: "analogy",
              content: "Like a sponge.",
              rationale: "A generated analogy.",
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe("lesson storyboard schema", () => {
  it("round-trips a valid storyboard", () => {
    const parsed = lessonStoryboardSchema.parse(
      JSON.parse(JSON.stringify(sampleStoryboard())),
    );
    expect(parsed.totalDurationSeconds).toBe(30);
    expect(parsed.scenes).toHaveLength(1);
  });

  it("rejects duplicate scene ids", () => {
    const duplicate = sampleStoryboard();
    duplicate.scenes = [storyboardScene(), storyboardScene({ order: 2 })];
    expect(() =>
      lessonStoryboardSchema.parse(JSON.parse(JSON.stringify(duplicate))),
    ).toThrow();
  });

  it("rejects a total duration that does not match the scene sum", () => {
    expect(() =>
      lessonStoryboardSchema.parse(
        JSON.parse(
          JSON.stringify({ ...sampleStoryboard(), totalDurationSeconds: 60 }),
        ),
      ),
    ).toThrow();
  });

  it("rejects an empty objective list", () => {
    expect(() =>
      lessonStoryboardSchema.parse(
        JSON.parse(JSON.stringify({ ...sampleStoryboard(), objectiveIds: [] })),
      ),
    ).toThrow();
  });
});

describe("storyboard generation params and responses", () => {
  it("accepts bounded generation params", () => {
    expect(() =>
      storyboardGenerationParamsSchema.parse({
        configurationVersion: 2,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: false,
        narrationSetId: "019ffbf1-eeee-7000-8000-000000000020",
        narrationSetRevision: 0,
      }),
    ).not.toThrow();
  });

  it("rejects generation params without a narration set", () => {
    expect(() =>
      storyboardGenerationParamsSchema.parse({
        configurationVersion: 2,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: false,
        narrationSetRevision: 0,
      }),
    ).toThrow();
  });

  it("accepts the queued generation response", () => {
    expect(() =>
      storyboardGenerationResponseSchema.parse({
        jobId: "019ffbf1-eeee-7000-8000-000000000040",
        status: "queued",
      }),
    ).not.toThrow();
  });

  it("accepts an idle review response without a storyboard", () => {
    expect(() =>
      storyboardResponseSchema.parse({
        state: "idle",
        storyboard: null,
        approved: null,
        latestJob: null,
        latestSceneRegenerationJob: null,
        sceneCandidates: [],
        canGenerate: true,
        canApprove: false,
        canEdit: false,
        stale: false,
        staleReason: null,
        validation: {
          structurallyValid: false,
          durationStatus: "within",
          durationWarning: null,
          uncoveredOutlineItemIds: [],
          unassignedBlockIds: [],
        },
      }),
    ).not.toThrow();
  });
});

describe("storyboard asset requirement schema", () => {
  it("rejects a requirement without a purpose", () => {
    expect(() =>
      storyboardAssetRequirementSchema.parse({ slot: "subject" }),
    ).toThrow();
  });
});

describe("storyboard duration tolerance", () => {
  it("never returns a tolerance below ten seconds", () => {
    expect(storyboardDurationToleranceSeconds(180)).toBeGreaterThanOrEqual(10);
    expect(storyboardDurationToleranceSeconds(300)).toBe(15);
    expect(storyboardDurationToleranceSeconds(420)).toBe(21);
  });
});

describe("scene regeneration schemas", () => {
  const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000100";
  const sceneId = "019ffbf1-eeee-7000-8000-000000000050";
  const narrationSetId = "019ffbf1-eeee-7000-8000-000000000020";
  const blockA = "019ffbf1-2222-7000-8000-000000000001";
  const objectiveId = "019ffbf1-9999-7000-8000-000000000001";

  function candidateScene(overrides: Record<string, unknown> = {}) {
    return lessonStoryboardSceneSchema.parse({
      id: sceneId,
      stableSceneId: sceneId,
      order: 1,
      template: "definition",
      durationSeconds: 30,
      narrationBlockIds: [blockA],
      assetRequirements: [],
      scene: {
        id: sceneId,
        order: 1,
        narration: "Water evaporates when heated.",
        durationSeconds: 30,
        onScreenText: ["Key term"],
        transition: "cut",
        assetBindings: [],
        sourceRefs: [
          {
            documentId: "019ffbf1-3333-7000-8000-000000000001",
            parsedDocumentVersion: 1,
            pageStart: 1,
            pageEnd: 1,
            sectionId: "019ffbf1-2222-7000-8000-000000000001",
            blockIds: [blockA],
          },
        ],
        generatedAdditions: [],
        template: "definition",
        visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
      },
      ...overrides,
    });
  }

  it("accepts every regeneration mode input", () => {
    for (const mode of ["improve-visual", "simplify", "shorten", "regenerate"])
      expect(() =>
        sceneRegenerationInputSchema.parse({
          mode,
          expectedRevision: 0,
        }),
      ).not.toThrow();
  });

  it("rejects an unknown regeneration mode", () => {
    expect(() =>
      sceneRegenerationInputSchema.parse({
        mode: "expand-all",
        expectedRevision: 0,
      }),
    ).toThrow();
  });

  it("accepts bounded regeneration params", () => {
    expect(() =>
      sceneRegenerationParamsSchema.parse({
        lessonSpecId,
        lessonSpecRevision: 0,
        sceneId,
        sceneRevision: 0,
        mode: "improve-visual",
        instruction: "Use a clearer diagram.",
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: false,
      }),
    ).not.toThrow();
  });

  it("rejects regeneration params without a scene", () => {
    expect(() =>
      sceneRegenerationParamsSchema.parse({
        lessonSpecId,
        lessonSpecRevision: 0,
        sceneRevision: 0,
        mode: "regenerate",
        instruction: null,
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: false,
      }),
    ).toThrow();
  });

  it("accepts a single-scene regeneration output", () => {
    expect(() =>
      sceneRegenerationOutputSchema.parse({
        schemaVersion: "scene-regeneration-v1",
        mode: "improve-visual",
        scene: {
          template: "definition",
          narrationBlockIds: [blockA],
          onScreenText: ["Key term"],
          visual: {
            term: "Evaporation",
            definition: "Water turning into water vapour.",
          },
          estimatedSeconds: 30,
          transition: "fade",
          sourceBlockIds: [blockA],
          generatedAdditions: [],
          assetRequirements: [],
        },
      }),
    ).not.toThrow();
  });

  it("rejects an output with an unsupported scene template", () => {
    expect(() =>
      sceneRegenerationOutputSchema.parse({
        schemaVersion: "scene-regeneration-v1",
        mode: "regenerate",
        scene: {
          template: "slideshow",
          narrationBlockIds: [blockA],
          onScreenText: [],
          visual: { term: "Evaporation", definition: "Water vapour." },
          estimatedSeconds: 30,
          transition: "cut",
          sourceBlockIds: [blockA],
          generatedAdditions: [],
          assetRequirements: [],
        },
      }),
    ).toThrow();
  });

  it("accepts a pending scene candidate", () => {
    expect(() =>
      sceneCandidateSchema.parse({
        id: "019ffbf1-eeee-7000-8000-000000000110",
        sceneId,
        mode: "simplify",
        before: candidateScene(),
        after: candidateScene({
          template: "definition",
          scene: {
            ...candidateScene().scene,
            onScreenText: ["A simpler term"],
            visual: {
              term: "Evaporation",
              definition: "Water becoming gas.",
            },
          },
        }),
        status: "pending",
        sceneRevision: 0,
        modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
        createdAt: "2026-08-18T10:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects a candidate with an invalid status", () => {
    expect(() =>
      sceneCandidateSchema.parse({
        id: "019ffbf1-eeee-7000-8000-000000000110",
        sceneId,
        mode: "regenerate",
        before: candidateScene(),
        after: candidateScene(),
        status: "expired",
        sceneRevision: 0,
        modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
        createdAt: "2026-08-18T10:00:00.000Z",
      }),
    ).toThrow();
  });

  it("exposes the current scene-regeneration compatibility", () => {
    expect(currentSceneRegenerationCompatibility.promptId).toBe(
      "scene-regeneration",
    );
    expect(currentSceneRegenerationCompatibility.promptVersion).toBe("v1");
  });

  it("accepts the queued scene-regeneration response", () => {
    expect(() =>
      sceneRegenerationResponseSchema.parse({
        jobId: "019ffbf1-eeee-7000-8000-000000000120",
        status: "queued",
      }),
    ).not.toThrow();
  });

  it("accepts candidate apply decisions", () => {
    expect(() =>
      sceneCandidateDecisionInputSchema.parse({
        expectedRevision: 0,
        expectedSceneRevision: 0,
      }),
    ).not.toThrow();
  });

  it("rejects a candidate apply decision without a scene revision", () => {
    expect(() =>
      sceneCandidateDecisionInputSchema.parse({ expectedRevision: 0 }),
    ).toThrow();
  });

  it("accepts a review response with scene candidates", () => {
    expect(() =>
      storyboardResponseSchema.parse({
        state: "draft",
        storyboard: lessonStoryboardSchema.parse({
          schemaVersion: 1,
          id: "019ffbf1-eeee-7000-8000-000000000040",
          projectId: "019ffbf1-ffff-7000-8000-000000000001",
          basedOnNarrationSetId: narrationSetId,
          narrationSetContentHash: "a".repeat(64),
          outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
          outlineSetContentHash: "b".repeat(64),
          configurationVersion: 3,
          promptId: "storyboard",
          promptVersion: "v1",
          model: "mock-model-1",
          modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
          status: "draft",
          revision: 0,
          title: "The water cycle",
          subject: "Science",
          targetDurationSeconds: 180,
          totalDurationSeconds: 30,
          objectiveIds: [objectiveId],
          contentHash: "c".repeat(64),
          scenes: [candidateScene()],
          generatedAt: "2026-08-18T10:00:00.000Z",
          createdAt: "2026-08-18T10:00:00.000Z",
        }),
        approved: null,
        latestJob: null,
        latestSceneRegenerationJob: {
          id: "019ffbf1-eeee-7000-8000-000000000120",
          state: "succeeded",
          errorCode: null,
          updatedAt: "2026-08-18T10:00:00.000Z",
        },
        sceneCandidates: [
          sceneCandidateSchema.parse({
            id: "019ffbf1-eeee-7000-8000-000000000110",
            sceneId,
            mode: "simplify",
            before: candidateScene(),
            after: candidateScene(),
            status: "pending",
            sceneRevision: 0,
            modelCallId: "019ffbf1-eeee-7000-8000-000000000005",
            createdAt: "2026-08-18T10:00:00.000Z",
          }),
        ],
        canGenerate: true,
        canApprove: false,
        canEdit: false,
        stale: false,
        staleReason: null,
        validation: {
          structurallyValid: true,
          durationStatus: "within",
          durationWarning: null,
          uncoveredOutlineItemIds: [],
          unassignedBlockIds: [],
        },
      }),
    ).not.toThrow();
  });
});

describe("ST-054 storyboard scene list and detail read model", () => {
  const sceneId = "019ffbf1-eeee-7000-8000-000000000050";

  function detailScene() {
    return lessonStoryboardSceneSchema.parse({
      id: sceneId,
      stableSceneId: sceneId,
      order: 1,
      template: "definition",
      durationSeconds: 30,
      narrationBlockIds: [blockA],
      assetRequirements: [],
      scene: sceneSpec({
        id: sceneId,
        order: 1,
        narration: "Heating water turns it into vapour.",
      }),
    });
  }

  const listEntry = () =>
    storyboardSceneListEntrySchema.parse({
      sceneId,
      order: 1,
      template: "definition",
      title: null,
      narrationSummary: "Heating water turns it into vapour.",
      narrationBlockCount: 1,
      durationSeconds: 30,
      status: {
        assets: "planned",
        audio: "not_generated",
        validation: "ok",
        stale: false,
      },
    });

  it("accepts a scene list response with projected statuses", () => {
    expect(() =>
      storyboardSceneListResponseSchema.parse({
        revision: 2,
        stale: true,
        staleReason: "The approved narration changed.",
        totalDurationSeconds: 30,
        targetDurationSeconds: 180,
        scenes: [listEntry()],
      }),
    ).not.toThrow();
  });

  it("accepts a scene detail response with the full scene", () => {
    expect(() =>
      storyboardSceneDetailResponseSchema.parse({
        scene: detailScene(),
        status: {
          assets: "none",
          audio: "not_generated",
          validation: "warning",
          stale: true,
        },
      }),
    ).not.toThrow();
  });

  it("rejects an entry whose duration is outside the scene bounds", () => {
    expect(() =>
      storyboardSceneListEntrySchema.parse({
        ...listEntry(),
        durationSeconds: 0,
      }),
    ).toThrow();
  });

  it("rejects unknown status projections", () => {
    expect(() =>
      storyboardSceneListEntrySchema.parse({
        ...listEntry(),
        status: {
          assets: "generated",
          audio: "not_generated",
          validation: "ok",
          stale: false,
        },
      }),
    ).toThrow();
  });
});

describe("storyboard scene editing contracts (ST-055)", () => {
  const sceneId = "019ffbf1-2222-7000-8000-000000000001";

  it("accepts a valid reorder input", () => {
    expect(() =>
      storyboardSceneReorderInputSchema.parse({
        expectedRevision: 2,
        sceneIds: [sceneId, blockA],
      }),
    ).not.toThrow();
  });

  it("rejects a reorder input without a scene list", () => {
    expect(() =>
      storyboardSceneReorderInputSchema.parse({
        expectedRevision: 2,
        sceneIds: [],
      }),
    ).toThrow();
  });

  it("accepts a valid create input for every registered template", () => {
    for (const template of sceneTemplateValues)
      expect(() =>
        storyboardSceneCreateInputSchema.parse({
          expectedRevision: 0,
          template,
        }),
      ).not.toThrow();
  });

  it("rejects a create input with an unknown template", () => {
    expect(() =>
      storyboardSceneCreateInputSchema.parse({
        expectedRevision: 0,
        template: "freeform",
      }),
    ).toThrow();
  });

  it("accepts duplicate and delete inputs", () => {
    expect(() =>
      storyboardSceneDuplicateInputSchema.parse({ expectedRevision: 1 }),
    ).not.toThrow();
    expect(() =>
      storyboardSceneDeleteInputSchema.parse({ expectedRevision: 1 }),
    ).not.toThrow();
  });

  it("builds a valid uncited default scene spec for every template", () => {
    for (const template of sceneTemplateValues) {
      const spec = createDefaultStoryboardSceneSpec(template, {
        id: sceneId,
        order: 1,
        durationSeconds: 10,
      });
      expect(spec.template).toBe(template);
      expect(spec.sourceRefs).toEqual([]);
      expect(spec.assetBindings).toEqual([]);
      expect(() => sceneSpecSchema.parse(spec)).not.toThrow();
    }
  });

  it("allows a draft scene with no narration blocks or citations", () => {
    const spec = createDefaultStoryboardSceneSpec("definition", {
      id: sceneId,
      order: 1,
      durationSeconds: 10,
    });
    expect(() =>
      lessonStoryboardSceneSchema.parse({
        id: sceneId,
        stableSceneId: sceneId,
        order: 1,
        template: "definition",
        durationSeconds: 10,
        narrationBlockIds: [],
        assetRequirements: [],
        scene: spec,
      }),
    ).not.toThrow();
  });

  it("covers common and template-specific fields for every editor form", () => {
    for (const template of sceneTemplateValues) {
      const metadata = sceneEditorMetadata(template);
      expect(metadata.fields.map((field) => field.path)).toContain("narration");
      expect(metadata.fields.map((field) => field.path)).toContain(
        "durationSeconds",
      );
      expect(
        metadata.fields.some((field) => field.path.startsWith("visual.")),
      ).toBe(true);
    }
  });

  it("maps compatible visual fields and reports reset fields on template migration", () => {
    const source = createDefaultStoryboardSceneSpec("process", {
      id: sceneId,
      order: 1,
      durationSeconds: 10,
    });
    const migrated = migrateStoryboardSceneTemplate(source, "worked-example");
    expect(migrated.scene.template).toBe("worked-example");
    if (migrated.scene.template !== "worked-example")
      throw new Error("Expected worked-example migration.");
    expect(migrated.scene.visual.steps).toEqual(["First step", "Second step"]);
    expect(migrated.resetFields).toEqual([]);
  });

  it("preserves an un-slotted scene asset through a template migration", () => {
    const source = sceneSpecSchema.parse({
      ...createDefaultStoryboardSceneSpec("definition", {
        id: sceneId,
        order: 1,
        durationSeconds: 10,
      }),
      assetBindings: [
        {
          assetId: "019ffbf1-2222-7000-8000-000000000099",
          role: "background",
        },
      ],
    });
    const migrated = migrateStoryboardSceneTemplate(source, "summary");
    expect(migrated.scene.assetBindings).toEqual(source.assetBindings);
    expect(migrated.resetFields).not.toContain("assetBindings.undefined");
  });

  it("defines bounded update and template switch commands with selective invalidation", () => {
    const source = createDefaultStoryboardSceneSpec("definition", {
      id: sceneId,
      order: 1,
      durationSeconds: 10,
    });
    expect(() =>
      storyboardSceneUpdateInputSchema.parse({
        expectedRevision: 0,
        scene: source,
      }),
    ).not.toThrow();
    expect(() =>
      storyboardSceneTemplateSwitchInputSchema.parse({
        expectedRevision: 0,
        template: "summary",
      }),
    ).not.toThrow();
    const assetOnly = { ...source, assetBindings: [] };
    expect(sceneEditInvalidation(source, assetOnly).invalidated).not.toContain(
      "audio",
    );
    const narrationEdit = {
      ...source,
      narration: "A revised narration sentence.",
    };
    expect(sceneEditInvalidation(source, narrationEdit).invalidated).toEqual(
      expect.arrayContaining(["audio", "captions"]),
    );
  });
});
