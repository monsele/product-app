import { describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import {
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
} from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  scenes,
  sceneCandidates,
  sourceSnapshots,
  type DatabaseExecutor,
} from "@avlp/database";
import { createJobEnvelope, type JobMetadata } from "@avlp/jobs";
import {
  InMemoryQuotaGuard,
  jsonCompletion,
  MockLanguageModelProvider,
  mockPricing,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import {
  buildSourcePackage,
  lessonStoryboardSceneSchema,
  lessonStoryboardSchema,
  sceneRegenerationOutputSchema,
  sceneRegenerationParamsSchema,
  sourceSnapshotSchema,
  type LessonStoryboardScene,
  type SceneRegenerationOutput,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import {
  assertSceneRegenerationChecks,
  createSceneRegenerationJobHandler,
  loadSceneRegenerationContext,
  persistSceneCandidate,
  SceneRegenerationDeterministicCheckError,
  type SceneRegenerationOperationContext,
} from "./scene-regeneration-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const narrationSetId = "019ffbf1-eeee-7000-8000-000000000003";
const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000040";
const itemA = "019ffbf1-1111-7000-8000-000000000001";
const itemB = "019ffbf1-1111-7000-8000-000000000002";
const itemC = "019ffbf1-1111-7000-8000-000000000003";
const sectionId = "019ffbf1-2222-7000-8000-000000000001";
const blockA = "019ffbf1-3333-7000-8000-000000000001";
const blockB = "019ffbf1-3333-7000-8000-000000000002";
const blockC = "019ffbf1-3333-7000-8000-000000000003";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000009";
const sceneId = "019ffbf1-eeee-7000-8000-000000000050";
const neighborSceneId = "019ffbf1-eeee-7000-8000-000000000051";

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: snapshotId,
    projectId,
    sourceDocumentId: "019ffbf1-5555-7000-8000-000000000001",
    parsedDocumentId: "019ffbf1-6666-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy: ownerUserId,
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: [
      {
        sectionId,
        order: 1,
        level: 1,
        heading: "Water cycle",
        pageStart: 1,
        pageEnd: 3,
        reviewOrder: null,
        blockIds: [blockA, blockB, blockC],
        figureIds: [],
        tableIds: [],
      },
    ],
    blocks: [
      {
        blockId: blockA,
        sectionId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water evaporates when heated and rises as water vapour into the sky.",
        corrected: false,
        revision: 0,
      },
      {
        blockId: blockB,
        sectionId,
        kind: "paragraph",
        order: 2,
        pageStart: 2,
        pageEnd: 2,
        text: "Condensation forms clouds when water vapour cools and becomes liquid.",
        corrected: false,
        revision: 0,
      },
      {
        blockId: blockC,
        sectionId,
        kind: "paragraph",
        order: 3,
        pageStart: 3,
        pageEnd: 3,
        text: "Precipitation returns water to the ground and the cycle repeats.",
        corrected: false,
        revision: 0,
      },
    ],
    figures: [],
    tables: [],
  });
}

function narrationBlockRows() {
  return [
    {
      id: blockA,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: itemA,
      order: 1,
      text: "Water evaporates when heated and rises as water vapour into the sky.",
      estimatedWords: 12,
      targetSeconds: 30,
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId,
          blockIds: [blockA],
        },
      ],
      generatedAdditions: [],
      generated: true,
      revision: 0,
    },
    {
      id: blockB,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: itemB,
      order: 2,
      text: "Condensation forms clouds when water vapour cools and becomes liquid.",
      estimatedWords: 12,
      targetSeconds: 30,
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 2,
          pageEnd: 2,
          sectionId,
          blockIds: [blockB],
        },
      ],
      generatedAdditions: [],
      generated: true,
      revision: 0,
    },
    {
      id: blockC,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: itemC,
      order: 3,
      text: "Precipitation returns water to the ground and the cycle repeats.",
      estimatedWords: 12,
      targetSeconds: 30,
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 3,
          pageEnd: 3,
          sectionId,
          blockIds: [blockC],
        },
      ],
      generatedAdditions: [],
      generated: true,
      revision: 0,
    },
  ];
}

function narrationSetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: narrationSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "a".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000004",
    status: "draft",
    revision: 0,
    totalEstimatedSeconds: 90,
    ...overrides,
  };
}

function narrationSetContentHash(): string {
  return computeNarrationSetContentHash(
    narrationBlockRows().map((block) => ({
      contentHash: computeNarrationBlockContentHash({
        text: block.text,
        sourceRefs: block.sourceRefs,
        generatedAdditions: block.generatedAdditions,
        generated: block.generated,
      }),
    })),
    90,
  );
}

function outlineItemRows() {
  return [
    {
      id: itemA,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 1,
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 30,
    },
    {
      id: itemB,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 2,
      kind: "concept",
      title: "Condensation",
      description: "Explain condensation.",
      estimatedSeconds: 30,
    },
    {
      id: itemC,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 3,
      kind: "concept",
      title: "Precipitation",
      description: "Explain precipitation.",
      estimatedSeconds: 30,
    },
  ];
}

function currentScene(
  overrides: Record<string, unknown> = {},
): LessonStoryboardScene {
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
      narration:
        "Water evaporates when heated and rises as water vapour into the sky.",
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
          sectionId,
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

function neighborScene(): LessonStoryboardScene {
  return lessonStoryboardSceneSchema.parse({
    id: neighborSceneId,
    stableSceneId: neighborSceneId,
    order: 2,
    template: "summary",
    durationSeconds: 30,
    narrationBlockIds: [blockB, blockC],
    assetRequirements: [],
    scene: {
      id: neighborSceneId,
      order: 2,
      narration: "Condensation and precipitation complete the cycle.",
      durationSeconds: 30,
      onScreenText: [],
      transition: "cut",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-7000-8000-000000000001",
          parsedDocumentVersion: 1,
          pageStart: 2,
          pageEnd: 3,
          sectionId,
          blockIds: [blockB, blockC],
        },
      ],
      generatedAdditions: [],
      template: "summary",
      visual: { takeaways: [{ text: "The cycle repeats." }] },
    },
  });
}

function lessonSpecRow(overrides: Record<string, unknown> = {}) {
  return {
    id: lessonSpecId,
    projectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: narrationSetContentHash(),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000004",
    status: "draft",
    revision: 0,
    idempotencyKey: "storyboard:key-1",
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 60,
    objectiveIds: ["019ffbf1-9999-7000-8000-000000000001"],
    contentHash: "d".repeat(64),
    payload: storyboardPayload(),
    generatedAt: new Date("2026-08-18T10:00:00.000Z"),
    createdAt: new Date("2026-08-18T10:00:00.000Z"),
    updatedAt: new Date("2026-08-18T10:00:00.000Z"),
    ...overrides,
  };
}

function storyboardPayload() {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: narrationSetContentHash(),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-eeee-7000-8000-000000000004",
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 60,
    objectiveIds: ["019ffbf1-9999-7000-8000-000000000001"],
    contentHash: "d".repeat(64),
    scenes: [currentScene(), neighborScene()],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
  });
}

function sceneRegenerationParams(overrides: Record<string, unknown> = {}) {
  return sceneRegenerationParamsSchema.parse({
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
    targetDurationSeconds: 180,
    includeRecallQuestions: true,
    ...overrides,
  });
}

function validOutput(): SceneRegenerationOutput {
  return sceneRegenerationOutputSchema.parse({
    schemaVersion: "scene-regeneration-v1",
    mode: "improve-visual",
    scene: {
      template: "labelled-diagram",
      narrationBlockIds: [blockA],
      onScreenText: ["Key term"],
      visual: {
        kind: "shapes",
        shape: "system",
        labels: [
          { anchor: "center", id: "water", text: "Water" },
          { anchor: "top", id: "vapour", text: "Vapour" },
        ],
      },
      estimatedSeconds: 30,
      transition: "fade",
      sourceBlockIds: [blockA],
      generatedAdditions: [],
      assetRequirements: [],
    },
  });
}

function sceneOutput(overrides: Record<string, unknown> = {}) {
  const output = validOutput();
  return {
    ...output,
    scene: { ...output.scene, ...overrides },
  } as unknown as SceneRegenerationOutput;
}

function operationContext(
  overrides: Record<string, unknown> = {},
): SceneRegenerationOperationContext {
  return {
    params: sceneRegenerationParams(),
    lessonSpec: { id: lessonSpecId, revision: 0 },
    currentScene: currentScene(),
    currentSceneRevision: 0,
    neighbors: [
      {
        id: neighborSceneId,
        order: 2,
        template: "summary",
        title: undefined,
        narration: "Condensation and precipitation complete the cycle.",
        onScreenText: [],
        durationSeconds: 30,
      },
    ],
    narrationBlocks: narrationBlockRows()
      .slice(0, 1)
      .map((block) => ({
        id: block.id,
        order: block.order,
        outlineItemId: block.outlineItemId,
        text: block.text,
      })),
    outline: outlineItemRows().map((item) => ({
      id: item.id,
      order: item.order,
      kind: item.kind,
      title: item.title,
      description: item.description,
      estimatedSeconds: item.estimatedSeconds,
    })),
    storyboard: lessonSpecRow().payload,
    ...overrides,
  };
}

describe("assertSceneRegenerationChecks", () => {
  const pkg = buildSourcePackage(sampleSnapshot());
  const context = operationContext();

  it("accepts a valid regenerated scene", () => {
    expect(() =>
      assertSceneRegenerationChecks(validOutput(), pkg, context),
    ).not.toThrow();
  });

  it("rejects a missing operation context", () => {
    expect(() =>
      assertSceneRegenerationChecks(validOutput(), pkg, undefined),
    ).toThrow(/operation context is missing/);
  });

  it("rejects a mode that does not match the request", () => {
    const output = sceneOutput({});
    output.mode = "regenerate";
    expect(() => assertSceneRegenerationChecks(output, pkg, context)).toThrow(
      SceneRegenerationDeterministicCheckError,
    );
  });

  it("rejects a changed narration-block assignment", () => {
    const output = sceneOutput({ narrationBlockIds: [blockB] });
    expect(() => assertSceneRegenerationChecks(output, pkg, context)).toThrow(
      /narration-block assignment/,
    );
  });

  it("rejects an ungrounded regenerated scene", () => {
    const output = sceneOutput({ sourceBlockIds: [] });
    expect(() => assertSceneRegenerationChecks(output, pkg, context)).toThrow(
      /cite at least one source block/,
    );
  });

  it("rejects an unsupported source citation", () => {
    const output = sceneOutput({ sourceBlockIds: [unknownBlock] });
    expect(() => assertSceneRegenerationChecks(output, pkg, context)).toThrow(
      /unsupported source block/,
    );
  });

  it("rejects a regenerated scene whose combined text exceeds the layout budget", () => {
    const output = sceneOutput({
      onScreenText: Array.from({ length: 12 }, () => "Key"),
    });
    expect(() => assertSceneRegenerationChecks(output, pkg, context)).toThrow(
      /readable layout capacity/,
    );
  });

  it("rejects an out-of-bounds duration", () => {
    const output = sceneOutput({ estimatedSeconds: 2 });
    expect(() => assertSceneRegenerationChecks(output, pkg, context)).toThrow(
      /outside the supported bounds/,
    );
  });
});

describe("loadSceneRegenerationContext", () => {
  function executor(input: {
    specRows?: unknown[];
    sceneRows?: unknown[];
    setRows?: unknown[];
    blockRows?: unknown[];
    outlineSetRows?: unknown[];
    outlineItemRows?: unknown[];
  }) {
    const rowsFor = (table: unknown): unknown[] => {
      if (table === lessonSpecs) return input.specRows ?? [lessonSpecRow()];
      if (table === scenes)
        return (
          input.sceneRows ?? [
            {
              id: sceneId,
              stableSceneId: sceneId,
              revision: 0,
              projectId,
              ownerUserId,
            },
          ]
        );
      if (table === narrationSets) return input.setRows ?? [narrationSetRow()];
      if (table === narrationBlocks)
        return input.blockRows ?? narrationBlockRows();
      if (table === lessonOutlineSets)
        return (
          input.outlineSetRows ?? [
            { id: outlineSetId, status: "approved", projectId, ownerUserId },
          ]
        );
      if (table === lessonOutlineItems)
        return input.outlineItemRows ?? outlineItemRows();
      return [];
    };
    const query = (rows: unknown[]) => {
      const result = {
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve(rows).then(resolve),
        limit: async () => rows,
        orderBy: () => result,
      };
      return result;
    };
    return {
      select: () => ({
        from: (table: unknown) => ({ where: () => query(rowsFor(table)) }),
      }),
    } as unknown as DatabaseExecutor;
  }

  it("loads the lesson spec, scene, neighbors, narration, and outline", async () => {
    const result = await loadSceneRegenerationContext({
      executor: executor({}),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.context.currentScene.stableSceneId).toBe(sceneId);
    expect(result.context.currentSceneRevision).toBe(0);
    expect(result.context.neighbors).toHaveLength(1);
    expect(result.context.neighbors[0]!.id).toBe(neighborSceneId);
    expect(result.context.narrationBlocks).toHaveLength(1);
    expect(result.context.narrationBlocks[0]!.id).toBe(blockA);
    expect(result.context.outline).toHaveLength(3);
  });

  it("reports a missing lesson spec", async () => {
    const result = await loadSceneRegenerationContext({
      executor: executor({ specRows: [] }),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("lesson_spec_missing");
  });

  it("rejects a non-draft lesson spec", async () => {
    const result = await loadSceneRegenerationContext({
      executor: executor({ specRows: [lessonSpecRow({ status: "approved" })] }),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("lesson_spec_not_draft");
  });

  it("rejects a stale lesson spec revision", async () => {
    const result = await loadSceneRegenerationContext({
      executor: executor({ specRows: [lessonSpecRow({ revision: 2 })] }),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("lesson_spec_revision_mismatch");
  });

  it("reports a missing scene", async () => {
    const result = await loadSceneRegenerationContext({
      executor: executor({ sceneRows: [] }),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("scene_missing");
  });

  it("rejects a stale scene revision", async () => {
    const result = await loadSceneRegenerationContext({
      executor: executor({
        sceneRows: [
          {
            id: sceneId,
            stableSceneId: sceneId,
            revision: 1,
            projectId,
            ownerUserId,
          },
        ],
      }),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("scene_revision_mismatch");
  });

  it("rejects a narration set whose content changed", async () => {
    const staleSet = narrationSetRow();
    const result = await loadSceneRegenerationContext({
      executor: executor({
        setRows: [
          {
            ...staleSet,
            totalEstimatedSeconds: 120,
            blocks: narrationBlockRows().map((block) => ({
              ...block,
              text: `${block.text} An added sentence.`,
            })),
          },
        ],
      }),
      ownerUserId,
      projectId,
      params: sceneRegenerationParams(),
    });
    expect(result.status).toBe("narration_set_mismatch");
  });
});

describe("persistSceneCandidate", () => {
  function storeCapture() {
    const inserted: unknown[] = [];
    const idsByKey = new Map<string, string>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === sceneCandidates) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (idsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              idsByKey.set(key, id);
              inserted.push(value);
              return [{ id }];
            }
            return [{ id: createId() }];
          },
          then: (resolve: (rows: never[]) => void) =>
            Promise.resolve([]).then(resolve),
        };
        return chain;
      },
    });
    const executor = {
      insert,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              const key = [...idsByKey.keys()].at(-1);
              if (key === undefined) return [];
              const id = idsByKey.get(key)!;
              return [{ id }];
            },
          }),
        }),
      }),
    } as unknown as DatabaseExecutor;
    return { executor, inserted, idsByKey };
  }

  function callPersist(input: {
    executor: DatabaseExecutor;
    idempotencyKey: string;
  }) {
    return persistSceneCandidate({
      executor: input.executor,
      value: validOutput(),
      sourcePackage: buildSourcePackage(sampleSnapshot()),
      params: sceneRegenerationParams(),
      modelCall: {
        id: "019ffbf1-eeee-7000-8000-000000000004",
        promptId: "scene-regeneration",
        promptVersion: "v1",
        model: "mock-model-1",
      } as never,
      operationContext: operationContext(),
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now: new Date("2026-08-18T10:00:00.000Z"),
    });
  }

  it("persists a pending candidate with before/after scenes", async () => {
    const { executor, inserted } = storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = inserted[0] as {
      sceneId: string;
      status: string;
      sceneRevision: number;
      beforeScene: { stableSceneId: string };
      afterScene: { stableSceneId: string };
    };
    expect(row.sceneId).toBe(sceneId);
    expect(row.status).toBe("pending");
    expect(row.sceneRevision).toBe(0);
    expect(row.beforeScene.stableSceneId).toBe(sceneId);
    expect(row.afterScene.stableSceneId).toBe(sceneId);
  });

  it("returns the existing candidate when the idempotency key repeats", async () => {
    const { executor, idsByKey } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-2" });
    const second = await callPersist({ executor, idempotencyKey: "key-2" });
    expect(second.id).toBe(first.id);
    expect(idsByKey.size).toBe(1);
  });
});

describe("createSceneRegenerationJobHandler", () => {
  function fakeDatabase() {
    const candidateIdsByKey = new Map<string, { id: string }>();
    const rowsFor = (table: unknown): unknown[] => {
      if (table === sourceSnapshots)
        return [{ payload: sampleSnapshot(), snapshotVersion: 1 }];
      if (table === lessonSpecs) return [lessonSpecRow()];
      if (table === scenes)
        return [
          {
            id: sceneId,
            stableSceneId: sceneId,
            revision: 0,
            projectId,
            ownerUserId,
          },
        ];
      if (table === narrationSets) return [narrationSetRow()];
      if (table === narrationBlocks) return narrationBlockRows();
      if (table === lessonOutlineSets)
        return [
          { id: outlineSetId, status: "approved", projectId, ownerUserId },
        ];
      if (table === lessonOutlineItems) return outlineItemRows();
      return [];
    };
    const query = (rows: unknown[]) => {
      const result = {
        then: (resolve: (value: unknown[]) => void) =>
          Promise.resolve(rows).then(resolve),
        limit: async () => rows,
        orderBy: () => result,
      };
      return result;
    };
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === sceneCandidates) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (candidateIdsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              candidateIdsByKey.set(key, { id });
              return [{ id }];
            }
            return [{ id: createId() }];
          },
          then: (resolve: (rows: never[]) => void) =>
            Promise.resolve([]).then(resolve),
        };
        return chain;
      },
    });
    const select = () => ({
      from: (table: unknown) => ({ where: () => query(rowsFor(table)) }),
    });
    const transactionSelect = () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const value = [...candidateIdsByKey.values()].at(-1);
            return value === undefined ? [] : [value];
          },
        }),
      }),
    });
    return {
      client: {},
      insert,
      select,
      transaction: async (cb: (inner: unknown) => Promise<unknown>) =>
        cb({ insert, select: transactionSelect }),
    };
  }

  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1,
      operationType: "ai.scene_regeneration",
      sourceSnapshotId: snapshotId,
      promptId: "scene-regeneration",
      promptVersion: "v1",
      model: "mock-model-1",
      params: sceneRegenerationParams(),
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createSceneRegenerationJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(1) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "scene-regenerate:v1",
        idempotencyKey: `scene-regenerate:${createId()}`,
        correlationId: createId(),
        payloadVersion: handler.payloadVersion,
        payload: jobPayloadValue,
      },
    );
    const inner = (
      handler as unknown as {
        handler: (payload: unknown, context: unknown) => Promise<JobMetadata>;
      }
    ).handler;
    try {
      const metadata = await inner(
        (envelope as unknown as { payload: unknown }).payload,
        {
          jobId: envelope.jobId,
          projectId,
          ownerUserId,
          correlationId: envelope.correlationId,
          idempotencyKey: envelope.idempotencyKey,
          attempt: 1,
        },
      );
      return { outcome: "succeeded" as const, metadata };
    } catch (error) {
      return { outcome: "failed" as const, error };
    }
  }

  it("runs the full scene regeneration lifecycle", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput()),
    });
    const database = fakeDatabase();
    const handler = createSceneRegenerationJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-18T10:00:00.000Z"),
    });
    expect(handler.jobType).toBe("storyboard.scene-regenerate");
    expect(handler.payloadVersion).toBe(1);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.scene_regeneration",
      promptVersion: "v1",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("fails deterministically when the narration assignment changes", async () => {
    const output = sceneOutput({ narrationBlockIds: [blockB] });
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const database = fakeDatabase();
    const handler = createSceneRegenerationJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-18T10:00:00.000Z"),
    });
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("failed");
    const error = result.error as Error & { code?: string };
    expect(error.message).toContain(
      "The model output failed deterministic checks",
    );
    expect(error).toMatchObject({ code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE" });
  });
});
