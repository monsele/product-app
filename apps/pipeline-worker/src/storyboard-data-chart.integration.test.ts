/**
 * ST-114 (Postgres): the storyboard job turns an approved numeric table into
 * a `data-chart` scene. The model answers with references only; the job
 * refuses a non-numeric selection (offering it back for repair), binds and
 * cites the table itself, and plans a v2 chart composition. An earlier pinned
 * prompt version is never offered charts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  creativeDesignDrafts,
  creativeDesignSnapshots,
  lessonOutlineItems,
  lessonSpecs,
  migrateDatabase,
  modelCalls,
  narrationBlocks,
  narrationSets,
  outlineObjectiveLinks,
  scenes,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { JobMetadata } from "@avlp/jobs";
import {
  InMemoryQuotaGuard,
  MockLanguageModelProvider,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import {
  anyCreativeDesignManifestSchema,
  dataChartTableSlot,
  isCreativeDesignManifestV2,
  lessonStoryboardSchema,
  resolveDataChart,
  sourceSnapshotSchema,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  blockA,
  now,
  objectiveId,
  outlineItemA,
  outlineSetId,
  ownerUserId,
  narrationSetId,
  parsedDocumentId,
  projectId,
  seedDatabase,
  snapshotId,
  sourceDocumentId,
  sourceRefs,
} from "./cinema-lesson.fixture.js";
import { computeOutlineSetContentHash } from "./narration-job.js";
import { createStoryboardGenerationJobHandler } from "./storyboard-job.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const sectionId = sourceRefs[0]!.sectionId;
const blockB = "019ffbf1-3334-7000-8000-000000000110";
const blockC = "019ffbf1-3335-7000-8000-000000000110";
const captionBlock = "019ffbf1-3336-7000-8000-000000000110";
const outlineItemB = "019ffbf1-1112-7000-8000-000000000110";
const outlineItemC = "019ffbf1-1113-7000-8000-000000000110";
const tableId = "019ffbf1-4444-7000-8000-000000000110";

const table = {
  tableId,
  sectionId,
  order: 1,
  pageStart: 2,
  pageEnd: 2,
  captionBlockId: captionBlock,
  columns: ["Metal", "Density (g/cm³)", "Notes"],
  rows: [
    ["Lithium", "0.53", "lightest"],
    ["Sodium", "0.97", "soft"],
    ["Potassium", "0.86", "lilac flame"],
  ],
};

const narration = [
  { id: blockA, item: outlineItemA, text: "Metals in group one are unusually light." },
  { id: blockB, item: outlineItemB, text: "Lithium is the least dense, and sodium is denser than potassium." },
  { id: blockC, item: outlineItemC, text: "So density does not simply rise down the group." },
];

const snapshot = sourceSnapshotSchema.parse({
  schemaVersion: "1.0",
  id: snapshotId,
  projectId,
  sourceDocumentId,
  parsedDocumentId,
  parsedDocumentVersion: 1,
  contentHash: "b".repeat(64),
  approvedBy: ownerUserId,
  approvedAt: now.toISOString(),
  sections: [
    {
      sectionId,
      order: 1,
      level: 1,
      heading: "Group one metals",
      pageStart: 1,
      pageEnd: 2,
      reviewOrder: null,
      blockIds: [blockA, blockB, blockC, captionBlock],
      figureIds: [],
      tableIds: [tableId],
    },
  ],
  blocks: [
    ...narration.map((entry, index) => ({
      blockId: entry.id,
      sectionId,
      kind: "paragraph",
      order: index + 1,
      pageStart: 1,
      pageEnd: 1,
      text: entry.text,
      corrected: false,
      revision: 0,
    })),
    {
      blockId: captionBlock,
      sectionId,
      kind: "caption",
      order: 4,
      pageStart: 2,
      pageEnd: 2,
      text: "Table 1: Densities of the group one metals.",
      corrected: false,
      revision: 0,
    },
  ],
  figures: [],
  tables: [table],
});

async function seedChartLesson(client: DatabaseClient): Promise<void> {
  await seedDatabase(client);
  // The fixture's storyboard is replaced by the one this job generates.
  for (const tableName of [scenes, creativeDesignSnapshots, creativeDesignDrafts, lessonSpecs])
    await client.delete(tableName);
  await client.delete(narrationBlocks);
  const items = [
    { id: outlineItemA, order: 1, title: "Light metals" },
    { id: outlineItemB, order: 2, title: "Densities" },
    { id: outlineItemC, order: 3, title: "The trend" },
  ].map((item) => ({ ...item, kind: "concept", description: `Explain ${item.title.toLowerCase()}.`, estimatedSeconds: 60 }));
  await client.delete(lessonOutlineItems);
  await client.insert(lessonOutlineItems).values(
    items.map((item) => ({
      ...item,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
  await client.insert(outlineObjectiveLinks).values(
    items.map((item) => ({
      id: createId(now),
      projectId,
      ownerUserId,
      outlineItemId: item.id,
      objectiveId,
      createdAt: now,
      updatedAt: now,
    })),
  );
  await client
    .update(narrationSets)
    .set({ outlineSetContentHash: computeOutlineSetContentHash(items), totalEstimatedSeconds: 180 })
    .where(eq(narrationSets.id, narrationSetId));
  await client.insert(narrationBlocks).values(
    narration.map((entry, index) => ({
      id: entry.id,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: entry.item,
      order: index + 1,
      text: entry.text,
      estimatedWords: 12,
      targetSeconds: 60,
      sourceRefs: [{ ...sourceRefs[0]!, documentId: parsedDocumentId, blockIds: [entry.id] }],
      generatedAdditions: [],
      generated: true,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

const chartVisual = (valueColumn: number) => ({
  tableId,
  chartKind: "bar",
  categoryColumn: 0,
  valueColumns: [valueColumn],
  rowIndexes: [0, 1, 2],
  highlightCategory: 1,
});

function storyboardOutput(valueColumn: number) {
  const base = {
    onScreenText: [],
    transition: "fade",
    generatedAdditions: [],
    assetRequirements: [],
    estimatedSeconds: 60,
  };
  return {
    schemaVersion: "storyboard-v1",
    targetDurationSeconds: 180,
    scenes: [
      {
        ...base,
        template: "hook",
        narrationBlockIds: [blockA],
        sourceBlockIds: [blockA],
        visual: { question: "Why are these metals so light?" },
      },
      {
        ...base,
        template: "data-chart",
        title: "Densities compared",
        narrationBlockIds: [blockB],
        sourceBlockIds: [blockB],
        visual: chartVisual(valueColumn),
      },
      {
        ...base,
        template: "summary",
        narrationBlockIds: [blockC],
        sourceBlockIds: [blockC],
        visual: { takeaways: [{ text: "Density does not simply rise down the group." }] },
      },
    ],
  };
}

function harness(client: DatabaseClient, completions: readonly unknown[]) {
  let call = 0;
  const provider = new MockLanguageModelProvider({
    completion: () => JSON.stringify(completions[Math.min(call++, completions.length - 1)]),
  });
  const handler = createStoryboardGenerationJobHandler({
    database: client,
    creativeDesignV2: true,
    provider,
    promptRegistry: new StaticPromptRegistry(repositoryPrompts),
    quotaGuard: new InMemoryQuotaGuard([
      { operationType: "ai.storyboard", maxCalls: 20, windowMs: 3_600_000 },
    ]),
    now: () => now,
    modelCallOverrides: {
      sourceSnapshotLoader: async () => ({ status: "ok", snapshot }),
    },
  });
  return { handler, provider };
}

async function run(
  handler: ReturnType<typeof createStoryboardGenerationJobHandler>,
  promptVersion: string,
): Promise<JobMetadata> {
  const jobId = createId();
  return handler.handler(
    {
      schemaVersion: 2,
      operationType: "ai.storyboard",
      sourceSnapshotId: snapshotId,
      promptId: "storyboard",
      promptVersion,
      model: "mock-model-1",
      providerApproval: {
        approvalReference: jobId,
        providerId: "mock",
        model: "mock-model-1",
        estimatedCostUsd: 0.01,
        selectionReason: "explicit_job_request",
      },
      params: {
        configurationVersion: 3,
        lessonTitle: "Group one metals",
        subject: "Chemistry",
        ageBand: "11-13",
        difficulty: "introductory",
        tone: "friendly",
        targetDurationSeconds: 180,
        includeRecallQuestions: true,
        narrationSetId,
        narrationSetRevision: 0,
      },
    },
    {
      jobId,
      projectId,
      ownerUserId,
      correlationId: createId(),
      idempotencyKey: `storyboard:${promptVersion}:${jobId}`,
      attempt: 1,
      heartbeat: vi.fn(async () => undefined),
      reportProgress: vi.fn(async () => undefined),
    },
  );
}

describeWithPostgres("ST-114 storyboard job → data-chart scene (Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  }, 120_000);

  beforeEach(async () => {
    await seedChartLesson(database!.client);
  }, 60_000);

  afterAll(async () => {
    await database?.destroy();
  });

  it("repairs a non-numeric selection, then saves a bound, cited chart whose values are the table cells", async () => {
    const client = database!.client;
    // First answer charts the "Notes" column; the repair charts densities.
    const { handler, provider } = harness(client, [storyboardOutput(2), storyboardOutput(1)]);
    const result = await run(handler, "v4");
    // The first answer failed the chart rule and the repair passed it.
    expect(result).toMatchObject({ promptVersion: "v4", validationStatus: "repaired" });

    // v4 offered charts: the catalogue lists data-chart and the table grid.
    const prompt = provider.requests[0]!.messages.map((message) => message.content).join("\n");
    expect(prompt).toContain('"template":"data-chart"');
    expect(prompt).toContain(`"tableId":"${tableId}"`);
    expect(prompt).toContain('"numeric":true');
    // The repair round named the offending cell by its indexes in the grid
    // the model was given, never by its text.
    const repair = provider.requests[1]!.messages.at(-1)!.content;
    expect(repair).toContain("the cell at row index 0 and column index 2 is not a number");
    expect(repair).not.toContain("lightest");

    const [row] = await client
      .select()
      .from(lessonSpecs)
      .where(and(eq(lessonSpecs.projectId, projectId), eq(lessonSpecs.ownerUserId, ownerUserId)));
    const storyboard = lessonStoryboardSchema.parse(row!.payload);
    const chartScene = storyboard.scenes.find((entry) => entry.template === "data-chart")!.scene;
    if (chartScene.template !== "data-chart") throw new Error("expected a chart");
    // The application, not the model, bound and cited the table.
    expect(chartScene.assetBindings).toEqual([
      expect.objectContaining({
        assetId: tableId,
        slot: dataChartTableSlot,
        role: "diagram",
        provenance: "source_table",
        visualRole: "grounding_critical",
      }),
    ]);
    expect(chartScene.sourceRefs).toEqual([
      expect.objectContaining({
        sectionId,
        tableIds: [tableId],
        blockIds: expect.arrayContaining([blockB, captionBlock]),
      }),
    ]);
    // Values are exactly the approved cells.
    const resolved = resolveDataChart(table, chartScene.visual);
    expect(resolved.ok && resolved.chart.series[0]!.values.map((value) => value.text)).toEqual([
      "0.53",
      "0.97",
      "0.86",
    ]);

    // The v2 design gives the chart a chart composition at 1.1.0.
    const [draft] = await client
      .select()
      .from(creativeDesignDrafts)
      .where(eq(creativeDesignDrafts.projectId, projectId));
    const manifest = anyCreativeDesignManifestSchema.parse(draft!.manifest);
    if (!isCreativeDesignManifestV2(manifest)) throw new Error("expected a v2 design");
    const design = manifest.scenes[chartScene.id]!;
    expect(["hero-chart", "hero-chart-keyed"]).toContain(design.compositionId);
    expect(design.compositionVersion).toBe("1.1.0");

    // One model-call record covers the answer and its repair, and is metered.
    const calls = await client.select().from(modelCalls).where(eq(modelCalls.operationType, "ai.storyboard"));
    expect(calls).toHaveLength(1);
    const usage = await client.select().from(usageRecords).where(eq(usageRecords.operationType, "ai.storyboard"));
    expect(usage.length).toBeGreaterThanOrEqual(1);
  });

  it("fails a selection that stays non-numeric without writing source text into the job error", async () => {
    const client = database!.client;
    // Every answer, including both repairs, charts the "Notes" column.
    const { handler } = harness(client, [storyboardOutput(2)]);
    const error: unknown = await run(handler, "v4").then(
      () => undefined,
      (failure: unknown) => failure,
    );
    expect(error).toMatchObject({ code: "MODEL_OUTPUT_DETERMINISTIC_FAILURE" });
    const details = JSON.stringify((error as { details?: unknown }).details);
    expect(details).toContain("CHART_DATA_INVALID");
    expect(details).toContain("row index 0 and column index 2");
    for (const sourceText of ["lightest", "soft", "lilac", "Notes", "Metal"])
      expect(details).not.toContain(sourceText);
    const saved = await client.select().from(lessonSpecs).where(eq(lessonSpecs.projectId, projectId));
    expect(saved).toHaveLength(0);
  });

  it("never offers charts to an earlier pinned prompt version", async () => {
    const client = database!.client;
    const { handler, provider } = harness(client, [storyboardOutput(1)]);
    await expect(run(handler, "v3")).rejects.toThrow();
    const prompt = provider.requests[0]!.messages.map((message) => message.content).join("\n");
    expect(prompt).not.toContain('"template":"data-chart"');
    expect(prompt).not.toContain(tableId);
    const saved = await client.select().from(lessonSpecs).where(eq(lessonSpecs.projectId, projectId));
    expect(saved).toHaveLength(0);
  });
});
