import { describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  outlineObjectiveLinks,
  scenes,
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
  sourceSnapshotSchema,
  storyboardGenerationParamsSchema,
  storyboardOutputV1Schema,
  type SourceSnapshot,
  type StoryboardOutputV1,
  type StoryboardSceneOutput,
} from "@avlp/schemas";
import { z } from "zod";
import { computeOutlineSetContentHash } from "./narration-job.js";
import {
  allocateStoryboardDurations,
  assertStoryboardDeterministicChecks,
  createStoryboardGenerationJobHandler,
  loadStoryboardOperationContext,
  persistLessonStoryboard,
  StoryboardDeterministicCheckError,
  type StoryboardOperationContext,
} from "./storyboard-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const outlineSetId = "019ffbf1-eeee-7000-8000-000000000002";
const narrationSetId = "019ffbf1-eeee-7000-8000-000000000003";
const itemA = "019ffbf1-1111-7000-8000-000000000001";
const itemB = "019ffbf1-1111-7000-8000-000000000002";
const itemC = "019ffbf1-1111-7000-8000-000000000003";
const objectiveId = "019ffbf1-9999-7000-8000-000000000001";
const sectionId = "019ffbf1-2222-7000-8000-000000000001";
const blockA = "019ffbf1-3333-7000-8000-000000000001";
const blockB = "019ffbf1-3333-7000-8000-000000000002";
const blockC = "019ffbf1-3333-7000-8000-000000000003";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000009";

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

function outlineItemRows() {
  return [
    {
      id: itemA,
      order: 1,
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 30,
    },
    {
      id: itemB,
      order: 2,
      kind: "concept",
      title: "Condensation",
      description: "Explain condensation.",
      estimatedSeconds: 30,
    },
    {
      id: itemC,
      order: 3,
      kind: "summary",
      title: "The cycle",
      description: "Summarise the cycle.",
      estimatedSeconds: 30,
    },
  ];
}

function outlineObjectiveRows() {
  return [
    { outlineItemId: itemA, objectiveId },
    { outlineItemId: itemB, objectiveId },
    { outlineItemId: itemC, objectiveId },
  ];
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
          documentId: "019ffbf1-4444-7000-8000-000000000001",
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
          documentId: "019ffbf1-4444-7000-8000-000000000001",
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
          documentId: "019ffbf1-4444-7000-8000-000000000001",
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
    outlineSetContentHash: computeOutlineSetContentHash(outlineItemRows()),
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

function storyboardParams(overrides: Record<string, unknown> = {}) {
  return storyboardGenerationParamsSchema.parse({
    configurationVersion: 3,
    lessonTitle: "The water cycle",
    subject: "Science",
    ageBand: "11-13",
    difficulty: "introductory",
    tone: "friendly",
    targetDurationSeconds: 180,
    includeRecallQuestions: true,
    narrationSetId,
    narrationSetRevision: 0,
    ...overrides,
  });
}

function sceneOutput(
  narrationBlockIds: readonly string[],
  template: string,
  visual: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): StoryboardSceneOutput {
  // Raw scene builder: `validOutput` validates the assembled output through the
  // schema, while deterministic-check tests need to inject invalid scenes that
  // the schema would reject before the checks run.
  return {
    template,
    narrationBlockIds,
    onScreenText: [],
    visual,
    estimatedSeconds: 60,
    transition: "cut",
    sourceBlockIds: [...narrationBlockIds],
    generatedAdditions: [],
    assetRequirements: [],
    ...overrides,
  } as unknown as StoryboardSceneOutput;
}

function validOutput(): StoryboardOutputV1 {
  return storyboardOutputV1Schema.parse({
    schemaVersion: "storyboard-v1",
    targetDurationSeconds: 180,
    scenes: [
      sceneOutput([blockA], "hook", { question: "Where does the water go?" }),
      sceneOutput([blockB], "definition", {
        term: "Condensation",
        definition: "Vapour cooling into liquid.",
      }),
      sceneOutput([blockC], "summary", {
        takeaways: [{ text: "The cycle repeats." }],
      }),
    ],
  });
}

function operationContext(
  overrides: Record<string, unknown> = {},
): StoryboardOperationContext {
  return {
    params: storyboardParams(),
    narrationSet: {
      id: narrationSetId,
      revision: 0,
      contentHash: "a".repeat(64),
      sourceSnapshotId: snapshotId,
      blocks: narrationBlockRows().map((block) => ({
        id: block.id,
        outlineItemId: block.outlineItemId,
        order: block.order,
        text: block.text,
        estimatedWords: block.estimatedWords,
        targetSeconds: block.targetSeconds,
      })),
    },
    outlineSet: {
      id: outlineSetId,
      contentHash: computeOutlineSetContentHash(outlineItemRows()),
      items: outlineItemRows().map((item) => ({
        ...item,
        objectiveIds: [objectiveId],
      })),
    },
    ...overrides,
  };
}

describe("allocateStoryboardDurations", () => {
  it("allocates an exact target total", () => {
    const { durations } = allocateStoryboardDurations({
      scenes: [
        { estimatedSeconds: 45 },
        { estimatedSeconds: 90 },
        { estimatedSeconds: 120 },
      ],
      target: 180,
    });
    expect(durations.reduce((sum, value) => sum + value, 0)).toBe(180);
    for (const duration of durations) {
      expect(duration).toBeGreaterThanOrEqual(3);
      expect(duration).toBeLessThanOrEqual(60);
    }
  });

  it("keeps a target that already sums exactly", () => {
    const { durations } = allocateStoryboardDurations({
      scenes: [
        { estimatedSeconds: 60 },
        { estimatedSeconds: 60 },
        { estimatedSeconds: 60 },
      ],
      target: 180,
    });
    expect(durations).toEqual([60, 60, 60]);
  });

  it("rejects an unreachable target", () => {
    expect(() =>
      allocateStoryboardDurations({
        scenes: [
          { estimatedSeconds: 3 },
          { estimatedSeconds: 3 },
          { estimatedSeconds: 3 },
        ],
        target: 300,
      }),
    ).toThrow(StoryboardDeterministicCheckError);
  });
});

describe("assertStoryboardDeterministicChecks", () => {
  const pkg = buildSourcePackage(sampleSnapshot());
  const context = operationContext();

  it("accepts a valid ordered grounded storyboard", () => {
    expect(() =>
      assertStoryboardDeterministicChecks(validOutput(), pkg, context),
    ).not.toThrow();
  });

  it("rejects a missing operation context", () => {
    expect(() =>
      assertStoryboardDeterministicChecks(validOutput(), pkg, undefined),
    ).toThrow(/operation context is missing/);
  });

  it("rejects a target duration mismatch", () => {
    const output = validOutput();
    output.targetDurationSeconds = 300;
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(/target/);
  });

  it("rejects a scene count outside the supported bounds", () => {
    const output = validOutput();
    output.scenes = [output.scenes[0]!];
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(StoryboardDeterministicCheckError);
  });

  it("rejects a scene whose combined text exceeds the renderer layout budget", () => {
    const output = validOutput();
    output.scenes[0] = sceneOutput(
      [blockA],
      "hook",
      { question: "Where does the water go?" },
      { onScreenText: Array.from({ length: 12 }, () => "Key") },
    );
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(/readable layout capacity/);
  });

  it("rejects an ungrounded scene", () => {
    const output = validOutput();
    output.scenes[1] = sceneOutput(
      [blockB],
      "definition",
      {
        term: "Condensation",
        definition: "Vapour cooling into liquid.",
      },
      { sourceBlockIds: [], generatedAdditions: [] },
    );
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(/cite at least one source block/);
  });

  it("rejects a scene grounded only by generated additions", () => {
    const output = validOutput();
    output.scenes[1] = sceneOutput(
      [blockB],
      "definition",
      {
        term: "Condensation",
        definition: "Vapour cooling into liquid.",
      },
      {
        sourceBlockIds: [],
        generatedAdditions: [
          {
            kind: "analogy",
            content: "Like a sponge.",
            rationale: "A generated analogy.",
          },
        ],
      },
    );
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(StoryboardDeterministicCheckError);
  });

  it("rejects an unsupported source citation", () => {
    const output = validOutput();
    output.scenes[0]!.sourceBlockIds = [unknownBlock];
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(/unsupported source block/);
  });

  it("rejects a narration block assigned to more than one scene", () => {
    const output = validOutput();
    output.scenes[2] = sceneOutput([blockA, blockC], "summary", {
      takeaways: [{ text: "The cycle repeats." }],
    });
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(/more than one scene/);
  });

  it("rejects a narration block that is never assigned", () => {
    const output = validOutput();
    output.scenes[0] = sceneOutput([blockA], "hook", { question: "Why?" });
    output.scenes[1] = sceneOutput([blockB], "definition", {
      term: "Condensation",
      definition: "Vapour cooling into liquid.",
    });
    output.scenes[2] = sceneOutput([blockB], "summary", {
      takeaways: [{ text: "The cycle repeats." }],
    });
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(StoryboardDeterministicCheckError);
  });

  it("rejects scenes that do not preserve narration order", () => {
    const output = validOutput();
    output.scenes[1] = sceneOutput([blockC], "definition", {
      term: "Condensation",
      definition: "Vapour cooling into liquid.",
    });
    output.scenes[2] = sceneOutput([blockB], "summary", {
      takeaways: [{ text: "The cycle repeats." }],
    });
    expect(() =>
      assertStoryboardDeterministicChecks(output, pkg, context),
    ).toThrow(StoryboardDeterministicCheckError);
  });

  it("rejects an outline item with no narration in the bound set", () => {
    const ctx = operationContext({
      outlineSet: {
        id: outlineSetId,
        contentHash: "x".repeat(64),
        items: [
          ...outlineItemRows().map((item) => ({
            ...item,
            objectiveIds: [objectiveId],
          })),
          {
            id: "019ffbf1-1111-7000-8000-000000000099",
            order: 4,
            kind: "concept",
            title: "Extra",
            description: "An item without narration.",
            estimatedSeconds: 30,
            objectiveIds: [objectiveId],
          },
        ],
      },
    });
    expect(() =>
      assertStoryboardDeterministicChecks(validOutput(), pkg, ctx),
    ).toThrow(StoryboardDeterministicCheckError);
  });
});

describe("loadStoryboardOperationContext", () => {
  function executor(input: {
    setRows?: unknown[];
    blockRows?: unknown[];
    outlineSetRows?: unknown[];
    outlineItemRows?: unknown[];
    outlineLinkRows?: unknown[];
  }) {
    const rowsFor = (table: unknown): unknown[] => {
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
      if (table === outlineObjectiveLinks)
        return input.outlineLinkRows ?? outlineObjectiveRows();
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

  it("loads the narration set, blocks, and bound approved outline", async () => {
    const result = await loadStoryboardOperationContext({
      executor: executor({}),
      ownerUserId,
      projectId,
      params: storyboardParams(),
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.context.narrationSet.blocks).toHaveLength(3);
    expect(result.context.outlineSet.items).toHaveLength(3);
    expect(result.context.outlineSet.items[0]!.objectiveIds).toEqual([
      objectiveId,
    ]);
  });

  it("reports a missing narration set", async () => {
    const result = await loadStoryboardOperationContext({
      executor: executor({ setRows: [] }),
      ownerUserId,
      projectId,
      params: storyboardParams(),
    });
    expect(result.status).toBe("narration_set_missing");
  });

  it("rejects a stale narration-set revision", async () => {
    const result = await loadStoryboardOperationContext({
      executor: executor({ setRows: [narrationSetRow({ revision: 2 })] }),
      ownerUserId,
      projectId,
      params: storyboardParams(),
    });
    expect(result.status).toBe("narration_set_revision_mismatch");
  });

  it("reports a missing bound outline set", async () => {
    const result = await loadStoryboardOperationContext({
      executor: executor({ outlineSetRows: [] }),
      ownerUserId,
      projectId,
      params: storyboardParams(),
    });
    expect(result.status).toBe("outline_set_missing");
  });

  it("rejects a bound outline that is no longer approved", async () => {
    const result = await loadStoryboardOperationContext({
      executor: executor({
        outlineSetRows: [
          { id: outlineSetId, status: "draft", projectId, ownerUserId },
        ],
      }),
      ownerUserId,
      projectId,
      params: storyboardParams(),
    });
    expect(result.status).toBe("outline_set_not_approved");
  });

  it("rejects a bound outline whose content changed", async () => {
    const result = await loadStoryboardOperationContext({
      executor: executor({
        outlineSetRows: [
          { id: outlineSetId, status: "approved", projectId, ownerUserId },
        ],
        outlineItemRows: [
          {
            id: itemA,
            order: 1,
            kind: "concept",
            title: "Changed title",
            description: "Changed.",
            estimatedSeconds: 60,
          },
        ],
      }),
      ownerUserId,
      projectId,
      params: storyboardParams(),
    });
    expect(result.status).toBe("outline_set_hash_mismatch");
  });
});

describe("persistLessonStoryboard", () => {
  function storeCapture() {
    const inserted: unknown[] = [];
    const idsByKey = new Map<string, string>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === lessonSpecs) {
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
        if (table === scenes) inserted.push(value);
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
      transaction: async (
        callback: (executor: DatabaseExecutor) => Promise<unknown>,
      ) => callback(executor),
    } as unknown as DatabaseExecutor;
    return { executor, inserted, idsByKey };
  }

  function callPersist(input: {
    executor: DatabaseExecutor;
    idempotencyKey: string;
  }) {
    return persistLessonStoryboard({
      executor: input.executor,
      output: validOutput(),
      sourcePackage: buildSourcePackage(sampleSnapshot()),
      params: storyboardParams(),
      modelCall: {
        id: "019ffbf1-eeee-7000-8000-000000000004",
        promptId: "storyboard",
        promptVersion: "v1",
        model: "mock-model-1",
      } as never,
      operationContext: operationContext(),
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now: new Date("2026-08-18T10:00:00.000Z"),
    });
  }

  it("persists a validated storyboard draft with normalized scenes", async () => {
    const { executor, inserted } = storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    const specRow = inserted.find(
      (row) => (row as { payload?: unknown }).payload !== undefined,
    );
    expect(specRow).toBeDefined();
    const sceneRows = inserted.filter(
      (row) =>
        Array.isArray(row) &&
        (row[0] as { sceneJson?: unknown } | undefined)?.sceneJson !==
          undefined,
    );
    expect(sceneRows).toHaveLength(1);
    expect(sceneRows[0] as unknown[]).toHaveLength(3);
    const payload = (specRow as { payload: { totalDurationSeconds: number } })
      .payload;
    expect(payload.totalDurationSeconds).toBe(180);
  });

  it("returns the existing draft when the idempotency key repeats", async () => {
    const { executor, idsByKey } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-2" });
    const second = await callPersist({ executor, idempotencyKey: "key-2" });
    expect(second.id).toBe(first.id);
    expect(idsByKey.size).toBe(1);
  });
});

describe("createStoryboardGenerationJobHandler", () => {
  function fakeDatabase() {
    const specIdsByKey = new Map<string, { id: string }>();
    const rowsFor = (table: unknown): unknown[] => {
      if (table === sourceSnapshots)
        return [{ payload: sampleSnapshot(), snapshotVersion: 1 }];
      if (table === narrationSets) return [narrationSetRow()];
      if (table === narrationBlocks) return narrationBlockRows();
      if (table === lessonOutlineSets)
        return [
          { id: outlineSetId, status: "approved", projectId, ownerUserId },
        ];
      if (table === lessonOutlineItems) return outlineItemRows();
      if (table === outlineObjectiveLinks) return outlineObjectiveRows();
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
            if (table === lessonSpecs) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (specIdsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              specIdsByKey.set(key, { id });
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
            const value = [...specIdsByKey.values()].at(-1);
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
      schemaVersion: 2,
      operationType: "ai.storyboard",
      sourceSnapshotId: snapshotId,
      promptId: "storyboard",
      promptVersion: "v1",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: createId(),
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      params: storyboardParams(),
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createStoryboardGenerationJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(2) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "storyboard:v1",
        idempotencyKey: `storyboard:${createId()}`,
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

  it("runs the full storyboard generation lifecycle", async () => {
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput()),
    });
    const database = fakeDatabase();
    const handler = createStoryboardGenerationJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => new Date("2026-08-18T10:00:00.000Z"),
    });
    expect(handler.jobType).toBe("storyboard.generate");
    expect(handler.payloadVersion).toBe(2);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.storyboard",
      promptVersion: "v1",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("fails deterministically when scenes do not cover every narration block", async () => {
    const output = validOutput();
    output.scenes[0] = sceneOutput([blockA], "hook", { question: "Why?" });
    output.scenes[1] = sceneOutput([blockB], "definition", {
      term: "Condensation",
      definition: "Vapour cooling into liquid.",
    });
    output.scenes[2] = sceneOutput([blockB], "summary", {
      takeaways: [{ text: "The cycle repeats." }],
    });
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const database = fakeDatabase();
    const handler = createStoryboardGenerationJobHandler({
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
