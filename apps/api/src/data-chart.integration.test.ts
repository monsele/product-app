/**
 * ST-114 (Postgres): a data-chart scene from table choice to preview.
 *
 * The teacher picks an approved table; the server records the chart's table
 * binding and citation. The preview manifest resolves that table inside the
 * project's own approved snapshot, and the chart drawn from it repeats the
 * table cells exactly. A non-numeric selection fails lesson validation with
 * the cell named; another tenant's table is refused; and a changed approved
 * table reaches the next preview while grounding asks for a recheck.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  contentBlocks,
  learningObjectiveSets,
  lessonOutlineSets,
  lessonSpecs,
  migrateDatabase,
  modelCalls,
  narrationSets,
  parsedDocuments,
  parsedSections,
  parsedTables,
  projects,
  scenes,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  users,
  validationIssues,
  validationRuns,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { resolveSceneChart } from "@avlp/scene-library";
import {
  createDefaultStoryboardSceneSpec,
  dataChartSummary,
  dataChartTableSlot,
  lessonStoryboardSchema,
  type SceneSpec,
} from "@avlp/schemas";
import { eq } from "drizzle-orm";
import { PostgresLessonValidationService } from "./lesson-validation.js";
import { PreviewManifestService } from "./preview-manifest.js";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";
import { PostgresSourceVisualsService } from "./source-visuals.js";
import { PostgresStoryboardService } from "./storyboard.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000114";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000114";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000114";
const otherProjectId: Identifier = "019ffbf1-cccd-7000-8000-000000000114";
const correlationId: Identifier = "019ffbf1-5555-7000-8000-000000000114";
const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000114";
const sceneId: Identifier = "019ffbf1-7777-7000-8000-000000000114";
const tableId: Identifier = "019ffbf1-4444-7000-8000-000000000114";
const foreignTableId: Identifier = "019ffbf1-4445-7000-8000-000000000114";
const blockId: Identifier = "019ffbf1-2222-7000-8000-000000000114";
const now = new Date("2026-10-14T10:00:00.000Z");

const columns = ["Metal", "Density (g/cm³)", "Notes"];
const rows = [
  ["Lithium", "0.53", "lightest"],
  ["Sodium", "0.97", "soft"],
  ["Potassium", "0.86", "lilac flame"],
];

const ids = (owner: string, suffix: string) => ({
  sourceDocumentId: `019ffbf1-dd${suffix}-7000-8000-000000000114`,
  artifactId: `019ffbf1-ee${suffix}-7000-8000-000000000114`,
  parsedDocumentId: `019ffbf1-ff${suffix}-7000-8000-000000000114`,
  sectionId: `019ffbf1-11${suffix}-7000-8000-000000000114`,
  owner,
});

async function seedSource(
  client: DatabaseClient,
  input: { owner: Identifier; project: Identifier; suffix: string; table: Identifier; block: Identifier },
): Promise<void> {
  const keys = ids(input.owner, input.suffix);
  await client.insert(sourceDocuments).values({
    id: keys.sourceDocumentId,
    ownerUserId: input.owner,
    projectId: input.project,
    originalName: "alkali-metals.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "e".repeat(64),
    storageKey: `users/${input.owner}/alkali.pdf`,
    pageCount: 2,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(sourceDocumentIngestionArtifacts).values({
    id: keys.artifactId,
    ownerUserId: input.owner,
    projectId: input.project,
    sourceDocumentId: keys.sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: `users/${input.owner}/canonical.json`,
    state: "ready",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedDocuments).values({
    id: keys.parsedDocumentId,
    ownerUserId: input.owner,
    projectId: input.project,
    ingestionArtifactId: keys.artifactId,
    sourceDocumentId: keys.sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    adapterVersion: "1.0",
    normalizedStorageKey: `users/${input.owner}/normalized.json`,
    title: "Alkali metals",
    language: "en",
    pageCount: 2,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedSections).values({
    id: keys.sectionId,
    parsedDocumentId: keys.parsedDocumentId,
    order: 1,
    level: 1,
    heading: "Group 1 metals",
    pageStart: 1,
    pageEnd: 2,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(contentBlocks).values({
    id: input.block,
    parsedDocumentId: keys.parsedDocumentId,
    sectionId: keys.sectionId,
    kind: "paragraph",
    order: 1,
    pageStart: 1,
    pageEnd: 1,
    content: { text: "Lithium is the least dense of the alkali metals." },
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedTables).values({
    id: input.table,
    parsedDocumentId: keys.parsedDocumentId,
    sectionId: keys.sectionId,
    order: 1,
    pageStart: 2,
    pageEnd: 2,
    columns,
    rows,
    createdAt: now,
    updatedAt: now,
  });
}

async function seed(client: DatabaseClient): Promise<void> {
  for (const table of [
    validationIssues,
    validationRuns,
    scenes,
    lessonSpecs,
    narrationSets,
    lessonOutlineSets,
    learningObjectiveSets,
    modelCalls,
    sourceSnapshots,
    parsedTables,
    contentBlocks,
    parsedSections,
    parsedDocuments,
    sourceDocumentIngestionArtifacts,
    sourceDocuments,
    projects,
    users,
  ])
    await client.delete(table);
  await client.insert(users).values([
    { id: ownerUserId, emailNormalized: "chart-owner@example.test", displayName: "Owner", createdAt: now, updatedAt: now },
    { id: otherOwnerUserId, emailNormalized: "chart-other@example.test", displayName: "Other", createdAt: now, updatedAt: now },
  ]);
  await client.insert(projects).values([
    { id: projectId, ownerUserId, title: "Alkali metals", stage: "draft", latestFailedOperation: null, createdAt: now, updatedAt: now, revision: 1 },
    { id: otherProjectId, ownerUserId: otherOwnerUserId, title: "Other tenant", stage: "draft", latestFailedOperation: null, createdAt: now, updatedAt: now, revision: 1 },
  ]);
  await seedSource(client, { owner: ownerUserId, project: projectId, suffix: "a1", table: tableId, block: blockId });
  await seedSource(client, {
    owner: otherOwnerUserId,
    project: otherProjectId,
    suffix: "b2",
    table: foreignTableId,
    block: "019ffbf1-2223-7000-8000-000000000114",
  });
}

function chartScene(): SceneSpec {
  const base = createDefaultStoryboardSceneSpec("data-chart", {
    id: sceneId,
    order: 1,
    durationSeconds: 30,
  });
  return {
    ...base,
    narration: "Lithium is the least dense, and sodium is denser than potassium.",
    title: "Densities compared",
    sourceRefs: [
      {
        documentId: ids(ownerUserId, "a1").parsedDocumentId,
        parsedDocumentVersion: 1,
        pageStart: 1,
        pageEnd: 1,
        sectionId: ids(ownerUserId, "a1").sectionId,
        blockIds: [blockId],
      },
    ],
  } as SceneSpec;
}

async function createStoryboard(client: DatabaseClient, snapshotId: Identifier): Promise<void> {
  const modelCallId: Identifier = "019ffbf1-aaab-7000-8000-000000000114";
  const objectiveSetId: Identifier = "019ffbf1-bbbc-7000-8000-000000000114";
  const outlineSetId: Identifier = "019ffbf1-9999-7000-8000-000000000114";
  const narrationSetId: Identifier = "019ffbf1-8888-7000-8000-000000000114";
  const common = { ownerUserId, projectId, createdAt: now, updatedAt: now };
  await client.insert(modelCalls).values({ ...common, id: modelCallId, operationType: "ai.objectives", idempotencyKey: "chart:model-call:1", promptId: "objectives", promptVersion: "v2", provider: "mock", model: "mock-model-1", inputVersion: "objectives:input-1", inputHash: "a".repeat(64), inputUnits: 100, outputUnits: 100, estimatedCostUsd: "0.001", latencyMs: 100, validationStatus: "valid", status: "succeeded", correlationId });
  await client.insert(learningObjectiveSets).values({ ...common, id: objectiveSetId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), configurationVersion: 1, promptId: "objectives", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "chart:objectives:1", generatedAt: now });
  await client.insert(lessonOutlineSets).values({ ...common, id: outlineSetId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), objectiveSetId, objectiveSetContentHash: "b".repeat(64), configurationVersion: 1, promptId: "outline", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "chart:outline:1", totalEstimatedSeconds: 60, generatedAt: now });
  await client.insert(narrationSets).values({ ...common, id: narrationSetId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), outlineSetId, outlineSetContentHash: "b".repeat(64), configurationVersion: 1, promptId: "narration", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "chart:narration:1", totalEstimatedSeconds: 60, generatedAt: now });
  const scene = chartScene();
  const payload = {
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: "c".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "v4",
    model: "mock-model-1",
    modelCallId,
    status: "draft",
    revision: 0,
    title: "Alkali metals",
    subject: "Chemistry",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: [objectiveSetId],
    contentHash: "d".repeat(64),
    scenes: [
      {
        id: sceneId,
        stableSceneId: sceneId,
        order: 1,
        template: "data-chart",
        durationSeconds: 30,
        narrationBlockIds: [],
        assetRequirements: [],
        scene,
      },
    ],
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
  await client.insert(lessonSpecs).values({ ...common, id: lessonSpecId, schemaVersion: "storyboard-v1", basedOnNarrationSetId: narrationSetId, narrationSetContentHash: "c".repeat(64), outlineSetId, outlineSetContentHash: "b".repeat(64), configurationVersion: 1, promptId: "storyboard", promptVersion: "v4", model: "mock-model-1", modelCallId, status: "draft", revision: 0, idempotencyKey: "chart:storyboard:1", title: "Alkali metals", subject: "Chemistry", targetDurationSeconds: 180, totalDurationSeconds: 30, objectiveIds: [objectiveSetId], contentHash: "d".repeat(64), payload, generatedAt: now });
}

describeWithPostgres("ST-114 data-chart scene from approved table to preview (Postgres)", () => {
  let database: TestDatabase | undefined;
  let snapshotService: PostgresSourceSnapshotService;
  let storyboardService: PostgresStoryboardService;
  let previewService: PreviewManifestService;
  let visualsService: PostgresSourceVisualsService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  }, 120_000);

  beforeEach(async () => {
    await seed(database!.client);
    snapshotService = new PostgresSourceSnapshotService(database!.client, () => now);
    storyboardService = new PostgresStoryboardService(
      database!.client,
      (input) => snapshotService.status(input),
      (input) => snapshotService.latestApprovedVisuals(input),
      () => now,
    );
    previewService = new PreviewManifestService(
      database!.client,
      { createSignedDownload: async () => ({ url: "https://storage.test/signed", expiresAt: now.toISOString() }) } as never,
      snapshotService,
    );
    visualsService = new PostgresSourceVisualsService(database!.client, snapshotService, undefined);
    const approval = await snapshotService.approve({ ownerUserId, projectId, correlationId });
    await snapshotService.approve({ ownerUserId: otherOwnerUserId, projectId: otherProjectId, correlationId });
    await createStoryboard(database!.client, approval.snapshot.id);
  }, 60_000);

  afterAll(async () => {
    await database?.destroy();
  });

  const editChart = (visual: Partial<Extract<SceneSpec, { template: "data-chart" }>["visual"]>, expectedRevision = 0) => {
    const scene = chartScene() as Extract<SceneSpec, { template: "data-chart" }>;
    return storyboardService.updateScene({
      ownerUserId,
      projectId,
      sceneId,
      correlationId,
      body: {
        expectedRevision,
        scene: {
          ...scene,
          visual: { ...scene.visual, ...visual },
          // The editor sends only the reference; the server adds the rest.
          assetBindings: [{ assetId: visual.tableId ?? scene.visual.tableId, role: "diagram", slot: dataChartTableSlot }],
        },
      },
    });
  };

  it("offers the table's grid to the editor, records the binding and citation, and previews the table's own values (AC1)", async () => {
    const visuals = await visualsService.list({ ownerUserId, projectId });
    const entry = visuals.entries.find((candidate) => candidate.kind === "table");
    expect(entry).toMatchObject({ tableId, chartGrid: { columns, rows, numericColumns: [1] } });

    await editChart({ tableId, categoryColumn: 0, valueColumns: [1], rowIndexes: [0, 1, 2], highlightCategory: 1 });
    const [spec] = await database!.client.select().from(lessonSpecs).where(eq(lessonSpecs.id, lessonSpecId));
    const saved = lessonStoryboardSchema.parse(spec!.payload).scenes[0]!.scene;
    expect(saved.assetBindings).toEqual([
      expect.objectContaining({
        assetId: tableId,
        provenance: "source_table",
        visualRole: "grounding_critical",
        sourceRef: expect.objectContaining({ tableIds: [tableId], pageStart: 2 }),
        // The lesson stores the chart summary as its text equivalent.
        altText: "Bar chart of Density (g/cm³): Lithium 0.53, Sodium 0.97, Potassium 0.86.",
      }),
    ]);
    expect(saved.sourceRefs).toEqual([expect.objectContaining({ tableIds: [tableId], blockIds: [blockId] })]);

    const manifest = await previewService.get({ ownerUserId, projectId });
    expect(manifest.assets[tableId]).toMatchObject({ source: "source_table", table: { tableId, columns, rows } });
    const previewScene = manifest.storyboard.scenes[0]!.scene;
    if (previewScene.template !== "data-chart") throw new Error("expected a chart");
    const chart = resolveSceneChart(previewScene, manifest.assets);
    expect(chart.ok).toBe(true);
    if (!chart.ok) return;
    expect(chart.chart.series[0]!.values.map((value) => value.text)).toEqual(["0.53", "0.97", "0.86"]);
    expect(dataChartSummary(chart.chart)).toBe(
      "Bar chart of Density (g/cm³): Lithium 0.53, Sodium 0.97, Potassium 0.86.",
    );
  });

  it("fails lesson validation with the non-numeric cell named (AC3)", async () => {
    await editChart({ tableId, valueColumns: [2], rowIndexes: [0, 1] });
    const run = await new PostgresLessonValidationService(database!.client, () => now).run({
      ownerUserId,
      projectId,
      body: {},
    });
    expect(run.status).toBe("failed");
    expect(run.issues).toContainEqual(
      expect.objectContaining({
        code: "chart_data_invalid",
        severity: "error",
        sceneId,
        message: 'Row 1, column "Notes" contains "lightest", which is not a number.',
      }),
    );
  });

  it("refuses another tenant's table and never previews it (AC8)", async () => {
    await expect(editChart({ tableId: foreignTableId })).rejects.toMatchObject({ statusCode: 400 });
    const manifest = await previewService.get({ ownerUserId, projectId });
    expect(manifest.assets[foreignTableId]).toBeUndefined();
  });

  it("previews a changed approved table and asks for a grounding recheck (AC4, simulated correction)", async () => {
    await editChart({ tableId, categoryColumn: 0, valueColumns: [1], rowIndexes: [0, 1, 2] });
    // Simulation only: table-cell correction overlays are ST-117, which
    // replaces this test. Writing to the immutable parser table here stands in
    // for the corrected effective table that re-approval would snapshot; no
    // product path writes to `parsed_tables`.
    await database!.client
      .update(parsedTables)
      .set({ rows: [["Lithium", "0.534"], ["Sodium", "0.97"], ["Potassium", "0.86"]].map((row) => [...row, "x"]) })
      .where(eq(parsedTables.id, tableId));
    await snapshotService.approve({ ownerUserId, projectId, correlationId });
    const manifest = await previewService.get({ ownerUserId, projectId });
    const scene = manifest.storyboard.scenes[0]!.scene;
    if (scene.template !== "data-chart") throw new Error("expected a chart");
    const chart = resolveSceneChart(scene, manifest.assets);
    expect(chart.ok && chart.chart.series[0]!.values[0]!.text).toBe("0.534");
    const run = await new PostgresLessonValidationService(database!.client, () => now).run({
      ownerUserId,
      projectId,
      body: {},
    });
    expect(run.issues).toContainEqual(
      expect.objectContaining({ code: "grounding_recheck_required", sceneId }),
    );
  });
});
