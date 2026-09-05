import { describe, expect, it } from "vitest";
import { createId } from "@avlp/config";
import {
  groundingChecks,
  lessonSpecs,
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
  groundingCheckParamsSchema,
  groundingOutputSchema,
  lessonStoryboardSchema,
  sourceSnapshotSchema,
  type GroundingCheckParams,
  type GroundingOutput,
  type SourceSnapshot,
} from "@avlp/schemas";
import { z } from "zod";
import {
  assertGroundingChecks,
  claimIdFor,
  createGroundingCheckJobHandler,
  GroundingCheckDeterministicError,
  loadGroundingCheckContext,
  persistGroundingCheck,
  segmentClaims,
  segmentOnScreenTextClaims,
  splitSentences,
  type GroundingCheckOperationContext,
} from "./grounding-check-job.js";

const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const lessonSpecId = "019ffbf1-eeee-7000-8000-000000000040";
const sectionId = "019ffbf1-2222-7000-8000-000000000001";
const blockA = "019ffbf1-3333-7000-8000-000000000001";
const blockB = "019ffbf1-3333-7000-8000-000000000002";
const blockC = "019ffbf1-3333-7000-8000-000000000003";
const unknownBlock = "019ffbf1-9999-7000-8000-000000000009";
const sceneId = "019ffbf1-eeee-7000-8000-000000000050";
const neighborSceneId = "019ffbf1-eeee-7000-8000-000000000051";
const now = new Date("2026-08-18T10:00:00.000Z");

const sourceRef = {
  documentId: "019ffbf1-3333-7000-8000-000000000001",
  parsedDocumentVersion: 1,
  pageStart: 1,
  pageEnd: 1,
  sectionId,
  blockIds: [blockA],
};

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

function lessonSpecPayload() {
  return lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000003",
    narrationSetContentHash: "b".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
    outlineSetContentHash: "c".repeat(64),
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
    scenes: [
      {
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
          sourceRefs: [sourceRef],
          generatedAdditions: [],
          template: "definition",
          visual: {
            term: "Evaporation",
            definition: "A liquid becoming a gas.",
          },
        },
      },
      {
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
      },
    ],
    generatedAt: "2026-08-18T10:00:00.000Z",
    createdAt: "2026-08-18T10:00:00.000Z",
  });
}

function lessonSpecRow(overrides: Record<string, unknown> = {}) {
  return {
    id: lessonSpecId,
    projectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: "019ffbf1-eeee-7000-8000-000000000003",
    narrationSetContentHash: "b".repeat(64),
    outlineSetId: "019ffbf1-eeee-7000-8000-000000000002",
    outlineSetContentHash: "c".repeat(64),
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
    payload: lessonSpecPayload(),
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function groundingParams(
  overrides: Record<string, unknown> = {},
): GroundingCheckParams {
  return groundingCheckParamsSchema.parse({
    lessonSpecId,
    lessonSpecRevision: 0,
    lessonSpecContentHash: "d".repeat(64),
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "a".repeat(64),
    scope: "lesson",
    ...overrides,
  });
}

function validOutput(
  claims: readonly { id: string; text?: string }[],
): GroundingOutput {
  return groundingOutputSchema.parse({
    schemaVersion: "grounding-v1",
    results: claims.map((claim) => ({
      schemaVersion: "grounding-claim-v1",
      claimId: claim.id,
      status: "supported",
      supportedSpans: [
        {
          start: 0,
          end: Math.max(1, Math.min(20, (claim.text ?? "").length)),
          sourceBlockId: blockA,
        },
      ],
      unsupportedSpans: [],
    })),
  });
}

function operationContext(
  overrides: Record<string, unknown> = {},
): GroundingCheckOperationContext {
  const claims = segmentClaims({
    text: "Water evaporates when heated and rises as water vapour into the sky.",
    sceneId,
    sourceRefs: [sourceRef],
    generatedAdditions: [],
    now,
  });
  return {
    params: groundingParams(),
    lessonSpec: { id: lessonSpecId, revision: 0, contentHash: "d".repeat(64) },
    sourceSnapshot: { id: snapshotId, contentHash: "a".repeat(64) },
    claims,
    ...overrides,
  };
}

describe("splitSentences", () => {
  it("splits on terminal punctuation", () => {
    expect(splitSentences("One sentence. Two sentences! Three?")).toEqual([
      "One sentence.",
      "Two sentences!",
      "Three?",
    ]);
  });

  it("handles empty text", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("claimIdFor", () => {
  it("produces deterministic UUIDv7-shaped ids for the same inputs", () => {
    const first = claimIdFor(now, sceneId, 0);
    const second = claimIdFor(now, sceneId, 0);
    expect(first).toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("differs across sentence indexes", () => {
    expect(claimIdFor(now, sceneId, 0)).not.toBe(claimIdFor(now, sceneId, 1));
  });
});

describe("segmentClaims", () => {
  it("segments one claim per sentence with inherited source refs", () => {
    const claims = segmentClaims({
      text: "Water evaporates when heated. It rises as vapour.",
      sceneId,
      sourceRefs: [sourceRef],
      generatedAdditions: [],
      now,
    });
    expect(claims).toHaveLength(2);
    expect(claims[0]!.sourceRefs).toEqual([sourceRef]);
    expect(claims[0]!.generatedAddition).toBeUndefined();
    expect(claims[0]!.location.sentenceIndex).toBe(0);
    expect(claims[1]!.location.sentenceIndex).toBe(1);
  });

  it("labels sentences matching a generated addition without source refs", () => {
    const claims = segmentClaims({
      text: "Think of the cycle like a water wheel.",
      sceneId,
      sourceRefs: [sourceRef],
      generatedAdditions: [
        {
          kind: "analogy",
          content: "Think of the cycle like a water wheel.",
          rationale: "Helps students visualize the process.",
        },
      ],
      now,
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.sourceRefs).toEqual([]);
    expect(claims[0]!.generatedAddition?.kind).toBe("analogy");
  });

  it("labels a teacher-edited generated addition rather than re-citing it", () => {
    const claims = segmentClaims({
      text: "Picture the water cycle as a giant rotating wheel.",
      sceneId,
      sourceRefs: [sourceRef],
      generatedAdditions: [
        {
          kind: "analogy",
          content: "Think of the cycle like a water wheel turning constantly.",
          rationale: "Helps students visualize the process.",
        },
      ],
      now,
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.sourceRefs).toEqual([]);
    expect(claims[0]!.generatedAddition?.kind).toBe("analogy");
  });

  it("does not mislabel an unrelated factual sentence as generated", () => {
    const claims = segmentClaims({
      text: "Evaporation converts liquid water into water vapour.",
      sceneId,
      sourceRefs: [sourceRef],
      generatedAdditions: [
        {
          kind: "analogy",
          content: "The water cycle is like a conveyor belt.",
          rationale: "Makes the cycle concrete.",
        },
      ],
      now,
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.sourceRefs).toEqual([sourceRef]);
    expect(claims[0]!.generatedAddition).toBeUndefined();
  });
});

describe("segmentOnScreenTextClaims", () => {
  it("segments one claim per on-screen entry", () => {
    const claims = segmentOnScreenTextClaims({
      entries: ["Key term", ""],
      sceneId,
      sourceRefs: [sourceRef],
      generatedAdditions: [],
      now,
    });
    expect(claims).toHaveLength(1);
    expect(claims[0]!.text).toBe("Key term");
    expect(claims[0]!.location.type).toBe("on_screen_text");
    expect(claims[0]!.location.sentenceIndex).toBe(0);
  });
});

describe("assertGroundingChecks", () => {
  const pkg = buildSourcePackage(sampleSnapshot(), { blockIds: [blockA] });
  const context = operationContext();

  it("accepts a valid grounding output", () => {
    expect(() =>
      assertGroundingChecks(validOutput(context.claims), pkg, context),
    ).not.toThrow();
  });

  it("rejects a missing operation context", () => {
    expect(() =>
      assertGroundingChecks(validOutput(context.claims), pkg, undefined),
    ).toThrow(/operation context is missing/);
  });

  it("rejects a result for an unknown claim", () => {
    const output = validOutput([{ id: claimIdFor(now, sceneId, 0) }]);
    const bad = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: [
        {
          schemaVersion: "grounding-claim-v1",
          claimId: claimIdFor(now, sceneId, 999),
          status: "supported",
          supportedSpans: [],
          unsupportedSpans: [],
        },
      ],
    });
    expect(() => assertGroundingChecks(bad, pkg, context)).toThrow(
      GroundingCheckDeterministicError,
    );
    void output;
  });

  it("rejects an output that drops a claim", () => {
    const truncated = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: [],
    });
    expect(() => assertGroundingChecks(truncated, pkg, context)).toThrow(
      /missing for claim/,
    );
  });

  it("rejects a supported span that exceeds the claim text", () => {
    const output = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: [
        {
          schemaVersion: "grounding-claim-v1",
          claimId: context.claims[0]!.id,
          status: "supported",
          supportedSpans: [{ start: 0, end: 10_000, sourceBlockId: blockA }],
          unsupportedSpans: [],
        },
      ],
    });
    expect(() => assertGroundingChecks(output, pkg, context)).toThrow(
      /exceeds the claim text/,
    );
  });

  it("rejects an unsupported source block in a supported span", () => {
    const output = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: [
        {
          schemaVersion: "grounding-claim-v1",
          claimId: context.claims[0]!.id,
          status: "supported",
          supportedSpans: [{ start: 0, end: 20, sourceBlockId: unknownBlock }],
          unsupportedSpans: [],
        },
      ],
    });
    expect(() => assertGroundingChecks(output, pkg, context)).toThrow(
      /unsupported source block/,
    );
  });

  it("rejects a generated_addition status for a claim with source refs", () => {
    const output = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: [
        {
          schemaVersion: "grounding-claim-v1",
          claimId: context.claims[0]!.id,
          status: "generated_addition",
          supportedSpans: [],
          unsupportedSpans: [],
        },
      ],
    });
    expect(() => assertGroundingChecks(output, pkg, context)).toThrow(
      /cannot be generated_addition/,
    );
  });

  it("accepts generated_addition for a claim without source refs", () => {
    const generatedClaim = segmentClaims({
      text: "Think of the cycle like a water wheel.",
      sceneId: neighborSceneId,
      sourceRefs: [sourceRef],
      generatedAdditions: [
        {
          kind: "analogy",
          content: "Think of the cycle like a water wheel.",
          rationale: "Helps students visualize the process.",
        },
      ],
      now,
    })[0]!;
    const generatedContext = operationContext({ claims: [generatedClaim] });
    const output = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: [
        {
          schemaVersion: "grounding-claim-v1",
          claimId: generatedClaim.id,
          status: "generated_addition",
          supportedSpans: [],
          unsupportedSpans: [],
        },
      ],
    });
    expect(() =>
      assertGroundingChecks(output, pkg, generatedContext),
    ).not.toThrow();
  });
});

describe("loadGroundingCheckContext", () => {
  function executor(input: { specRows?: unknown[]; snapshotRows?: unknown[] }) {
    const rowsFor = (table: unknown): unknown[] => {
      if (table === lessonSpecs) return input.specRows ?? [lessonSpecRow()];
      if (table === sourceSnapshots)
        return (
          input.snapshotRows ?? [
            {
              id: snapshotId,
              payload: sampleSnapshot(),
              snapshotVersion: 1,
              contentHash: "a".repeat(64),
            },
          ]
        );
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

  it("loads the lesson spec, snapshot, and segments claims", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({}),
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.context.claims.length).toBeGreaterThanOrEqual(1);
    expect(result.context.claims[0]!.location.sceneId).toBe(sceneId);
  });

  it("reports a missing lesson spec", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({ specRows: [] }),
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    expect(result.status).toBe("lesson_spec_missing");
  });

  it("rejects a stale lesson spec revision", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({ specRows: [lessonSpecRow({ revision: 2 })] }),
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    expect(result.status).toBe("lesson_spec_revision_mismatch");
  });

  it("rejects a lesson spec whose content hash changed", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({
        specRows: [lessonSpecRow({ contentHash: "e".repeat(64) })],
      }),
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    expect(result.status).toBe("lesson_spec_hash_mismatch");
  });

  it("reports a missing source snapshot", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({ snapshotRows: [] }),
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    expect(result.status).toBe("source_snapshot_missing");
  });

  it("rejects a snapshot whose content hash changed", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({
        snapshotRows: [
          {
            payload: { ...sampleSnapshot(), contentHash: "f".repeat(64) },
            snapshotVersion: 1,
            contentHash: "f".repeat(64),
          },
        ],
      }),
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    expect(result.status).toBe("source_snapshot_hash_mismatch");
  });

  it("reports a missing scene for scene scope", async () => {
    const result = await loadGroundingCheckContext({
      executor: executor({}),
      ownerUserId,
      projectId,
      params: groundingParams({
        scope: "scene",
        sceneId: unknownBlock,
      }),
      now,
    });
    expect(result.status).toBe("scene_missing");
  });
});

describe("persistGroundingCheck", () => {
  function storeCapture() {
    const inserted: unknown[] = [];
    const idsByKey = new Map<string, string>();
    const insert = (table: unknown) => ({
      values: (value: unknown) => {
        const chain = {
          onConflictDoNothing: () => chain,
          returning: async () => {
            if (table === groundingChecks) {
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
    const context = operationContext();
    return persistGroundingCheck({
      executor: input.executor,
      value: validOutput(context.claims),
      sourcePackage: buildSourcePackage(sampleSnapshot(), {
        blockIds: [blockA],
      }),
      params: groundingParams(),
      modelCall: { id: "019ffbf1-eeee-7000-8000-000000000004" },
      operationContext: context,
      context: { ownerUserId, projectId, idempotencyKey: input.idempotencyKey },
      now,
    });
  }

  it("persists a completed grounding check with summary", async () => {
    const { executor, inserted } = storeCapture();
    const result = await callPersist({ executor, idempotencyKey: "key-1" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    const row = inserted[0] as {
      scope: string;
      lessonSpecRevision: number;
      summary: { total: number; supported: number };
    };
    expect(row.scope).toBe("lesson");
    expect(row.lessonSpecRevision).toBe(0);
    expect(row.summary.total).toBeGreaterThanOrEqual(1);
    expect(row.summary.supported).toBeGreaterThanOrEqual(1);
  });

  it("persists a scene-scoped check with the stable scene id", async () => {
    const { executor, inserted } = storeCapture();
    const context = operationContext();
    await persistGroundingCheck({
      executor,
      value: validOutput(context.claims),
      sourcePackage: buildSourcePackage(sampleSnapshot(), {
        blockIds: [blockA],
      }),
      params: groundingParams({ scope: "scene", sceneId }),
      modelCall: { id: "019ffbf1-eeee-7000-8000-000000000004" },
      operationContext: context,
      context: { ownerUserId, projectId, idempotencyKey: "key-scene-1" },
      now,
    });
    const row = inserted[0] as { scope: string; sceneId: string };
    expect(row.scope).toBe("scene");
    expect(row.sceneId).toBe(sceneId);
  });

  it("returns the existing check when the idempotency key repeats", async () => {
    const { executor, idsByKey } = storeCapture();
    const first = await callPersist({ executor, idempotencyKey: "key-2" });
    const second = await callPersist({ executor, idempotencyKey: "key-2" });
    expect(second.id).toBe(first.id);
    expect(idsByKey.size).toBe(1);
  });
});

describe("createGroundingCheckJobHandler", () => {
  function fakeDatabase() {
    const checkIdsByKey = new Map<string, { id: string }>();
    const rowsFor = (table: unknown): unknown[] => {
      if (table === sourceSnapshots)
        return [
          {
            id: snapshotId,
            payload: sampleSnapshot(),
            snapshotVersion: 1,
            contentHash: "a".repeat(64),
          },
        ];
      if (table === lessonSpecs) return [lessonSpecRow()];
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
            if (table === groundingChecks) {
              const key = (value as { idempotencyKey: string }).idempotencyKey;
              if (checkIdsByKey.has(key)) return [];
              const id = (value as { id: string }).id;
              checkIdsByKey.set(key, { id });
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
            const value = [...checkIdsByKey.values()].at(-1);
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
      operationType: "ai.grounding",
      sourceSnapshotId: snapshotId,
      promptId: "grounding",
      promptVersion: "v2",
      model: "mock-model-1",
      providerApproval: {
        approvalReference: createId(),
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      narrowing: { blockIds: [blockA] },
      params: groundingParams(),
      ...overrides,
    };
  }

  async function execute(
    handler: ReturnType<typeof createGroundingCheckJobHandler>,
    jobPayloadValue: unknown,
  ) {
    const envelope = createJobEnvelope(
      z.object({ schemaVersion: z.literal(2) }).passthrough(),
      {
        jobId: createId(),
        jobType: handler.jobType,
        projectId,
        ownerUserId,
        inputVersion: "grounding:v1",
        idempotencyKey: `grounding:${createId()}`,
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

  it("runs the full grounding check lifecycle", async () => {
    const database = fakeDatabase();
    const context = await loadGroundingCheckContext({
      executor: database as unknown as DatabaseExecutor,
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    if (context.status !== "ok") throw new Error("unreachable");
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(validOutput(context.context.claims)),
    });
    const handler = createGroundingCheckJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => now,
    });
    expect(handler.jobType).toBe("grounding.check");
    expect(handler.payloadVersion).toBe(2);
    const result = await execute(handler, jobPayload());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome !== "succeeded") throw new Error("unreachable");
    expect(result.metadata).toMatchObject({
      operationType: "ai.grounding",
      promptVersion: "v2",
      validationStatus: "validated",
    });
    expect(result.metadata.candidateId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("fails deterministically when the model misclassifies a cited claim as generated", async () => {
    const database = fakeDatabase();
    const context = await loadGroundingCheckContext({
      executor: database as unknown as DatabaseExecutor,
      ownerUserId,
      projectId,
      params: groundingParams(),
      now,
    });
    if (context.status !== "ok") throw new Error("unreachable");
    const claims = context.context.claims;
    const output = groundingOutputSchema.parse({
      schemaVersion: "grounding-v1",
      results: claims.map((claim, index) =>
        index === 0
          ? {
              schemaVersion: "grounding-claim-v1",
              claimId: claim.id,
              status: "generated_addition",
              supportedSpans: [],
              unsupportedSpans: [],
            }
          : {
              schemaVersion: "grounding-claim-v1",
              claimId: claim.id,
              status: "supported",
              supportedSpans: [
                {
                  start: 0,
                  end: Math.max(1, Math.min(20, claim.text.length)),
                  sourceBlockId: blockA,
                },
              ],
              unsupportedSpans: [],
            },
      ),
    });
    const provider = new MockLanguageModelProvider({
      model: "mock-model-1",
      completion: jsonCompletion(output),
    });
    const handler = createGroundingCheckJobHandler({
      database: database as never,
      provider,
      promptRegistry: new StaticPromptRegistry(repositoryPrompts),
      quotaGuard: new InMemoryQuotaGuard([]),
      pricing: mockPricing,
      now: () => now,
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
