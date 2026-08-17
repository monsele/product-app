import { describe, expect, it } from "vitest";
import {
  learningObjectiveSetSchema,
  objectiveGenerationParamsSchema,
  objectiveOutputV1Schema,
  objectivesResponseSchema,
  sourceSnapshotSchema,
  type LearningObjectiveSet,
  type ObjectiveOutputV1,
  type SourceSnapshot,
} from "./index.js";

const blockId = "019ffbf1-2222-7000-8000-000000000001";
const blockIdB = "019ffbf1-2223-7000-8000-000000000001";
const sectionId = "019ffbf1-1111-7000-8000-000000000001";

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: "019ffbf1-eeee-7000-8000-000000000001",
    projectId: "019ffbf1-ffff-7000-8000-000000000001",
    sourceDocumentId: "019ffbf1-4444-7000-8000-000000000001",
    parsedDocumentId: "019ffbf1-3333-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy: "019ffbf1-aaaa-7000-8000-000000000001",
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: [
      {
        sectionId,
        order: 1,
        level: 1,
        heading: "Water cycle",
        pageStart: 1,
        pageEnd: 2,
        reviewOrder: null,
        blockIds: [blockId, blockIdB],
        figureIds: [],
        tableIds: [],
      },
    ],
    blocks: [
      {
        blockId,
        sectionId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water evaporates when heated.",
        corrected: false,
        revision: 0,
      },
      {
        blockId: blockIdB,
        sectionId,
        kind: "paragraph",
        order: 2,
        pageStart: 2,
        pageEnd: 2,
        text: "Condensation forms clouds.",
        corrected: false,
        revision: 0,
      },
    ],
    figures: [],
    tables: [],
  });
}

function sampleOutput(): ObjectiveOutputV1 {
  return objectiveOutputV1Schema.parse({
    schemaVersion: "objectives-v1",
    objectives: [
      {
        statement: "Describe how evaporation forms water vapour.",
        verb: "describe",
        sourceBlockIds: [blockId],
        confidence: 0.95,
      },
      {
        statement: "Explain how condensation forms clouds.",
        verb: "explain",
        sourceBlockIds: [blockIdB],
        confidence: 0.9,
      },
      {
        statement: "Sequence the water cycle stages.",
        verb: "sequence",
        sourceBlockIds: [blockId, blockIdB],
        confidence: 0.85,
      },
    ],
    keyConcepts: [
      { text: "Evaporation", sourceBlockIds: [blockId] },
      { text: "Condensation", sourceBlockIds: [blockIdB] },
    ],
    prerequisiteKnowledge: [
      { text: "States of matter", sourceBlockIds: [blockId] },
    ],
    vocabulary: [
      {
        term: "Evaporation",
        definition: "Liquid turning into vapour.",
        sourceBlockIds: [blockId],
      },
    ],
    misconceptions: [
      {
        misconception: "Boiling and evaporation are the same.",
        correction: "Evaporation happens below the boiling point.",
        sourceBlockIds: [blockId],
      },
    ],
    assessmentQuestions: [
      {
        question: "What turns liquid water into vapour?",
        sourceBlockIds: [blockId],
      },
    ],
  });
}

describe("objective output schema", () => {
  it("accepts a bounded grounded output", () => {
    expect(() => objectiveOutputV1Schema.parse(sampleOutput())).not.toThrow();
  });

  it("rejects objectives without a source block", () => {
    const output = sampleOutput();
    output.objectives[0] = {
      ...output.objectives[0]!,
      sourceBlockIds: [],
    };
    expect(() => objectiveOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects more than the bounded objective count", () => {
    const output = sampleOutput();
    const extras = [0, 1, 2, 3].map((index) => ({
      statement: `Extra objective ${index}`,
      verb: "identify",
      sourceBlockIds: [blockId],
      confidence: 0.5,
    }));
    output.objectives = [...output.objectives, ...extras];
    expect(() => objectiveOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects fewer than the minimum objective count", () => {
    const output = sampleOutput();
    output.objectives = output.objectives.slice(0, 1);
    expect(() => objectiveOutputV1Schema.parse(output)).toThrow();
  });

  it("rejects an unknown schema version", () => {
    expect(() =>
      objectiveOutputV1Schema.parse({ ...sampleOutput(), schemaVersion: "v9" }),
    ).toThrow();
  });
});

describe("objective generation params", () => {
  it("accepts bounded configuration-derived params", () => {
    expect(() =>
      objectiveGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
      }),
    ).not.toThrow();
  });

  it("rejects unknown parameters", () => {
    expect(() =>
      objectiveGenerationParamsSchema.parse({
        configurationVersion: 3,
        lessonTitle: "The water cycle",
        subject: "Science",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 300,
        includeRecallQuestions: true,
        surprise: true,
      }),
    ).toThrow();
  });
});

describe("learning objective set", () => {
  function sampleSet(): LearningObjectiveSet {
    const output = sampleOutput();
    const sourceRef = {
      documentId: "019ffbf1-3333-7000-8000-000000000001",
      parsedDocumentVersion: 1,
      pageStart: 1,
      pageEnd: 1,
      sectionId,
      blockIds: [blockId],
    };
    return learningObjectiveSetSchema.parse({
      schemaVersion: 1,
      id: "019ffbf1-eeee-7000-8000-000000000001",
      projectId: "019ffbf1-ffff-7000-8000-000000000001",
      sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
      sourceSnapshotContentHash: "a".repeat(64),
      configurationVersion: 3,
      promptId: "objectives",
      promptVersion: "v2",
      model: "mock-model-1",
      modelCallId: "019ffbf1-eeee-7000-8000-000000000002",
      status: "draft",
      objectives: output.objectives.map((objective, index) => ({
        id: `019ffbf1-eeee-7000-8000-00000000001${index + 1}`,
        order: index + 1,
        statement: objective.statement,
        verb: objective.verb,
        confidence: objective.confidence,
        sourceRefs: [sourceRef],
        generated: true,
        revision: 0,
      })),
      keyConcepts: output.keyConcepts.map((item, index) => ({
        id: `019ffbf1-eeee-7000-8000-00000000002${index + 1}`,
        order: index + 1,
        text: item.text,
        sourceRefs: [sourceRef],
      })),
      prerequisiteKnowledge: [],
      vocabulary: [],
      misconceptions: [],
      assessmentQuestions: [],
      generatedAt: "2026-08-17T10:00:00.000Z",
      createdAt: "2026-08-17T10:00:00.000Z",
    });
  }

  it("accepts a persisted draft set", () => {
    expect(() => learningObjectiveSetSchema.parse(sampleSet())).not.toThrow();
  });

  it("rejects objectives without source references", () => {
    const set = sampleSet();
    set.objectives[0]!.sourceRefs = [];
    expect(() => learningObjectiveSetSchema.parse(set)).toThrow();
  });

  it("rejects an unknown set status", () => {
    const set = sampleSet();
    set.status = "published" as never;
    expect(() => learningObjectiveSetSchema.parse(set)).toThrow();
  });
});

describe("objectives response", () => {
  it("accepts an idle response", () => {
    expect(() =>
      objectivesResponseSchema.parse({
        state: "idle",
        set: null,
        latestJob: null,
        canGenerate: true,
      }),
    ).not.toThrow();
  });

  it("accepts a draft response", () => {
    const output = sampleOutput();
    const sourceRef = {
      documentId: "019ffbf1-3333-7000-8000-000000000001",
      parsedDocumentVersion: 1,
      pageStart: 1,
      sectionId,
      blockIds: [blockId],
    };
    const set: LearningObjectiveSet = learningObjectiveSetSchema.parse({
      schemaVersion: 1,
      id: "019ffbf1-eeee-7000-8000-000000000001",
      projectId: "019ffbf1-ffff-7000-8000-000000000001",
      sourceSnapshotId: "019ffbf1-eeee-7000-8000-000000000001",
      sourceSnapshotContentHash: "a".repeat(64),
      configurationVersion: 3,
      promptId: "objectives",
      promptVersion: "v2",
      model: "mock-model-1",
      modelCallId: "019ffbf1-eeee-7000-8000-000000000002",
      status: "draft",
      objectives: output.objectives.map((objective, index) => ({
        id: `019ffbf1-eeee-7000-8000-00000000001${index + 1}`,
        order: index + 1,
        statement: objective.statement,
        verb: objective.verb,
        confidence: objective.confidence,
        sourceRefs: [sourceRef],
        generated: true,
        revision: 0,
      })),
      keyConcepts: [],
      prerequisiteKnowledge: [],
      vocabulary: [],
      misconceptions: [],
      assessmentQuestions: [],
      generatedAt: "2026-08-17T10:00:00.000Z",
      createdAt: "2026-08-17T10:00:00.000Z",
    });
    expect(() =>
      objectivesResponseSchema.parse({
        state: "draft",
        set,
        latestJob: {
          id: "019ffbf1-eeee-7000-8000-000000000003",
          state: "succeeded",
          errorCode: null,
          updatedAt: "2026-08-17T10:00:00.000Z",
        },
        canGenerate: true,
      }),
    ).not.toThrow();
  });

  it("rejects an unknown generation state", () => {
    expect(() =>
      objectivesResponseSchema.parse({
        state: "approving",
        set: null,
        latestJob: null,
        canGenerate: true,
      }),
    ).toThrow();
  });
});

describe("source snapshot reuse", () => {
  it("keeps the snapshot fixture valid for citation checks", () => {
    expect(() => sampleSnapshot()).not.toThrow();
  });
});
