import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Identifier } from "@avlp/config";
import {
  contentBlocks,
  extractedFigures,
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
  sourceDocuments,
  sourceDocumentIngestionArtifacts,
  sourceDocumentIngestionReuses,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";
import { PostgresSourceVisualsService } from "./source-visuals.js";
import { PostgresStoryboardService } from "./storyboard.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000700";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000700";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000700";
const reusedProjectId: Identifier = "019ffbf1-cccc-7000-8000-000000000701";
const sourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000700";
const reusedSourceDocumentId: Identifier = "019ffbf1-dddd-7000-8000-000000000701";
const artifactId: Identifier = "019ffbf1-eeee-7000-8000-000000000700";
const parsedDocumentId: Identifier = "019ffbf1-ffff-7000-8000-000000000700";
const sectionId: Identifier = "019ffbf1-1111-7000-8000-000000000700";
const blockId: Identifier = "019ffbf1-2222-7000-8000-000000000700";
const figureId: Identifier = "019ffbf1-3333-7000-8000-000000000700";
const tableId: Identifier = "019ffbf1-4444-7000-8000-000000000700";
const correlationId: Identifier = "019ffbf1-5555-7000-8000-000000000700";
const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000700";
const sceneId: Identifier = "019ffbf1-7777-7000-8000-000000000700";
const now = new Date("2026-09-16T10:00:00.000Z");

function labelledDiagramStoryboardPayload() {
  return {
    schemaVersion: 1,
    id: lessonSpecId,
    projectId: reusedProjectId,
    basedOnNarrationSetId: "019ffbf1-8888-7000-8000-000000000700",
    narrationSetContentHash: "c".repeat(64),
    outlineSetId: "019ffbf1-9999-7000-8000-000000000700",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-aaaa-7000-8000-000000000799",
    status: "draft",
    revision: 0,
    title: "Group 1 elements",
    subject: "Chemistry",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: ["019ffbf1-bbbb-7000-8000-000000000799"],
    contentHash: "d".repeat(64),
    scenes: [
      {
        id: sceneId,
        stableSceneId: sceneId,
        order: 1,
        template: "labelled-diagram",
        durationSeconds: 30,
        narrationBlockIds: [],
        assetRequirements: [],
        scene: {
          id: sceneId,
          order: 1,
          narration: "Alkali metals share one outer electron.",
          durationSeconds: 30,
          onScreenText: [],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [],
          generatedAdditions: [],
          template: "labelled-diagram",
          title: "Group 1 elements",
          visual: {
            baseAssetSlot: "diagram",
            kind: "asset",
            labels: [{ anchor: "top", id: "note", text: "Alkali metals" }],
          },
        },
      },
    ],
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
}

async function seed(client: DatabaseClient): Promise<void> {
  await client.delete(scenes);
  await client.delete(lessonSpecs);
  await client.delete(narrationSets);
  await client.delete(lessonOutlineSets);
  await client.delete(learningObjectiveSets);
  await client.delete(modelCalls);
  await client.delete(sourceSnapshots);
  await client.delete(parsedTables);
  await client.delete(extractedFigures);
  await client.delete(contentBlocks);
  await client.delete(parsedSections);
  await client.delete(parsedDocuments);
  await client.delete(sourceDocumentIngestionReuses);
  await client.delete(sourceDocumentIngestionArtifacts);
  await client.delete(sourceDocuments);
  await client.delete(projects);
  await client.delete(users);

  await client.insert(users).values([
    {
      id: ownerUserId,
      emailNormalized: "reuse-owner@example.test",
      displayName: "Owner",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: otherOwnerUserId,
      emailNormalized: "reuse-other@example.test",
      displayName: "Other",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await client.insert(projects).values([
    {
      id: projectId,
      ownerUserId,
      title: "Original chemistry lesson",
      stage: "ingestion_review",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
    {
      id: reusedProjectId,
      ownerUserId,
      title: "Reused chemistry lesson",
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
  ]);
  await client.insert(sourceDocuments).values([
    {
      id: sourceDocumentId,
      ownerUserId,
      projectId,
      originalName: "periodic-table.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1_000,
      sha256: "e".repeat(64),
      storageKey: "users/tenant/periodic-table.pdf",
      pageCount: 4,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: reusedSourceDocumentId,
      ownerUserId,
      projectId: reusedProjectId,
      originalName: "periodic-table-copy.pdf",
      mediaType: "application/pdf",
      sizeBytes: 1_000,
      sha256: "e".repeat(64),
      storageKey: "users/tenant/periodic-table-copy.pdf",
      pageCount: 4,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  await client.insert(sourceDocumentIngestionArtifacts).values({
    id: artifactId,
    ownerUserId,
    projectId,
    sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: "users/tenant/canonical-700.json",
    state: "ready",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(sourceDocumentIngestionReuses).values({
    id: "019ffbf1-c1c1-7000-8000-000000000700",
    ownerUserId,
    projectId: reusedProjectId,
    sourceDocumentId: reusedSourceDocumentId,
    ingestionArtifactId: artifactId,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedDocuments).values({
    id: parsedDocumentId,
    ownerUserId,
    projectId,
    ingestionArtifactId: artifactId,
    sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    adapterVersion: "1.0",
    normalizedStorageKey: "users/tenant/normalized-700.json",
    title: "The Periodic Table",
    language: "en",
    pageCount: 4,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedSections).values({
    id: sectionId,
    parsedDocumentId,
    order: 1,
    level: 1,
    heading: "Group 1: Alkali metals",
    pageStart: 3,
    pageEnd: 3,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(contentBlocks).values({
    id: blockId,
    parsedDocumentId,
    sectionId,
    kind: "paragraph",
    order: 1,
    pageStart: 3,
    pageEnd: 3,
    content: { text: "Alkali metals are highly reactive." },
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(extractedFigures).values({
    id: figureId,
    parsedDocumentId,
    sectionId,
    order: 1,
    pageStart: 3,
    pageEnd: 3,
    altText: "Diagram of alkali metal electron shells",
    contentType: "image/png",
    storageKey: "users/tenant/parsed/700/figures/1/original.png",
    // Stored once, at ingestion, under the *originating* project's tenant
    // prefix — a reused project's requests must still resolve this exact
    // key, never one reconstructed from the reusing project's own id.
    thumbnailStorageKey: `users/${ownerUserId}/projects/${projectId}/parsed/${artifactId}/figures/${figureId}/thumbnail.png`,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(parsedTables).values({
    id: tableId,
    parsedDocumentId,
    sectionId,
    order: 1,
    pageStart: 3,
    pageEnd: 3,
    columns: ["Element", "Symbol"],
    rows: [
      ["Lithium", "Li"],
      ["Sodium", "Na"],
    ],
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * `lessonSpecs` cascades through `narrationSets` -> `lessonOutlineSets` ->
 * `learningObjectiveSets`, each of which references an approved
 * `sourceSnapshots` row. Build the minimal chain for the reusing project's
 * own approved snapshot, then the draft storyboard that will be edited.
 */
async function createStoryboardFor(
  client: DatabaseClient,
  snapshotId: Identifier,
): Promise<void> {
  const modelCallId: Identifier = "019ffbf1-aaaa-7000-8000-000000000799";
  const objectiveSetId: Identifier = "019ffbf1-bbbb-7000-8000-000000000799";
  const outlineSetId: Identifier = "019ffbf1-9999-7000-8000-000000000700";
  const narrationSetId: Identifier = "019ffbf1-8888-7000-8000-000000000700";
  await client.insert(modelCalls).values({
    id: modelCallId,
    ownerUserId,
    projectId: reusedProjectId,
    operationType: "ai.objectives",
    idempotencyKey: "reuse-test:model-call:1",
    promptId: "objectives",
    promptVersion: "v2",
    provider: "mock",
    model: "mock-model-1",
    inputVersion: "objectives:input-1",
    inputHash: "a".repeat(64),
    inputUnits: 100,
    outputUnits: 100,
    estimatedCostUsd: "0.001",
    latencyMs: 100,
    validationStatus: "valid",
    status: "succeeded",
    correlationId: "019ffbf1-0000-7000-8000-000000000799",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(learningObjectiveSets).values({
    id: objectiveSetId,
    ownerUserId,
    projectId: reusedProjectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "approved",
    revision: 0,
    idempotencyKey: "reuse-test:objectives:1",
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(lessonOutlineSets).values({
    id: outlineSetId,
    ownerUserId,
    projectId: reusedProjectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    objectiveSetId,
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "approved",
    revision: 0,
    idempotencyKey: "reuse-test:outline:1",
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(narrationSets).values({
    id: narrationSetId,
    ownerUserId,
    projectId: reusedProjectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "approved",
    revision: 0,
    idempotencyKey: "reuse-test:narration:1",
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(lessonSpecs).values({
    id: lessonSpecId,
    projectId: reusedProjectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: "c".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId,
    status: "draft",
    revision: 0,
    idempotencyKey: "storyboard:key-700",
    title: "Group 1 elements",
    subject: "Chemistry",
    targetDurationSeconds: 180,
    totalDurationSeconds: 30,
    objectiveIds: [objectiveSetId],
    contentHash: "d".repeat(64),
    payload: labelledDiagramStoryboardPayload(),
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

describeWithPostgres(
  "ST-093 source-visual reuse and cross-tenant authorization (Postgres)",
  () => {
    let database: TestDatabase | undefined;
    let snapshotService: PostgresSourceSnapshotService;
    let visualsService: PostgresSourceVisualsService;
    let storyboardService: PostgresStoryboardService;

    beforeAll(async () => {
      database = await createTestDatabase(serverUrl!);
      await migrateDatabase(database.client);
    });

    beforeEach(async () => {
      await seed(database!.client);
      snapshotService = new PostgresSourceSnapshotService(
        database!.client,
        () => now,
      );
      visualsService = new PostgresSourceVisualsService(
        database!.client,
        snapshotService,
        undefined,
      );
      storyboardService = new PostgresStoryboardService(
        database!.client,
        (input) => snapshotService.status(input),
        (input) => snapshotService.latestApprovedVisuals(input),
        () => now,
      );
    });

    afterAll(async () => {
      await database?.destroy();
    });

    it("lists the approved figure and table for the originating project", async () => {
      await snapshotService.approve({ ownerUserId, projectId, correlationId });
      const result = await visualsService.list({ ownerUserId, projectId });
      expect(result.entries).toHaveLength(2);
      const figure = result.entries.find((entry) => entry.kind === "figure");
      const table = result.entries.find((entry) => entry.kind === "table");
      expect(figure).toMatchObject({ figureId, pageStart: 3 });
      expect(table).toMatchObject({
        tableId,
        pageStart: 3,
        columns: ["Element", "Symbol"],
        rowCount: 2,
      });
    });

    it("lets a same-owner reused project approve, list, and bind the shared immutable figures and tables without exposing the original project's rows", async () => {
      await snapshotService.approve({ ownerUserId, projectId, correlationId });

      // The reusing project has no parsed document of its own; approving
      // resolves the shared immutable artifact via the reuse reference.
      const reusedApproval = await snapshotService.approve({
        ownerUserId,
        projectId: reusedProjectId,
        correlationId,
      });
      expect(reusedApproval.snapshot.figureCount).toBe(1);
      expect(reusedApproval.snapshot.tableCount).toBe(1);

      const originalSnapshots = await database!.client
        .select()
        .from(sourceSnapshots);
      // Two project-local snapshot rows exist, never a shared one.
      expect(originalSnapshots).toHaveLength(2);
      expect(new Set(originalSnapshots.map((row) => row.projectId))).toEqual(
        new Set([projectId, reusedProjectId]),
      );

      const reusedVisuals = await visualsService.list({
        ownerUserId,
        projectId: reusedProjectId,
      });
      expect(reusedVisuals.snapshotId).toBe(reusedApproval.snapshot.id);
      expect(reusedVisuals.entries).toHaveLength(2);
      const reusedTable = reusedVisuals.entries.find(
        (entry) => entry.kind === "table",
      );
      const reusedFigure = reusedVisuals.entries.find(
        (entry) => entry.kind === "figure",
      );
      expect(reusedTable).toMatchObject({ tableId, columns: ["Element", "Symbol"] });
      expect(reusedFigure).toMatchObject({ figureId });

      await createStoryboardFor(database!.client, reusedApproval.snapshot.id);

      // Binding the shared table into the reusing project's own scene must
      // succeed through the normal storyboard authorization path.
      const result = await storyboardService.updateScene({
        ownerUserId,
        projectId: reusedProjectId,
        sceneId,
        body: {
          expectedRevision: 0,
          scene: {
            ...labelledDiagramStoryboardPayload().scenes[0]!.scene,
            assetBindings: [
              { assetId: tableId, role: "diagram", slot: "diagram" },
            ],
          },
        },
        correlationId,
      });
      expect(result.scene.scene.assetBindings).toEqual([
        { assetId: tableId, role: "diagram", slot: "diagram" },
      ]);
    });

    it("signs a reused figure's thumbnail from its own stored key, not one derived from the reusing project's id", async () => {
      await snapshotService.approve({ ownerUserId, projectId, correlationId });
      const reusedApproval = await snapshotService.approve({
        ownerUserId,
        projectId: reusedProjectId,
        correlationId,
      });

      const createSignedDownload = vi
        .fn()
        .mockResolvedValue({ url: "https://storage.example.test/thumb" });
      const reuseAwareVisualsService = new PostgresSourceVisualsService(
        database!.client,
        snapshotService,
        { createSignedDownload },
      );

      const reusedVisuals = await reuseAwareVisualsService.list({
        ownerUserId,
        projectId: reusedProjectId,
      });
      expect(reusedVisuals.snapshotId).toBe(reusedApproval.snapshot.id);
      const reusedFigure = reusedVisuals.entries.find(
        (entry) => entry.kind === "figure",
      );
      expect(reusedFigure).toMatchObject({
        figureId,
        thumbnailUrl: "https://storage.example.test/thumb",
      });
      // The signed key is the one recorded at ingestion time under the
      // *originating* project (`projectId`), never rebuilt from the
      // reusing project's id (`reusedProjectId`) — a key rebuilt from the
      // reusing project would point at an object that was never written.
      expect(createSignedDownload).toHaveBeenCalledWith({
        key: `users/${ownerUserId}/projects/${projectId}/parsed/${artifactId}/figures/${figureId}/thumbnail.png`,
        expiresInSeconds: 300,
      });
    });

    it("does not expose another owner's source visuals for the same project id", async () => {
      await snapshotService.approve({ ownerUserId, projectId, correlationId });
      const foreign = await visualsService.list({
        ownerUserId: otherOwnerUserId,
        projectId,
      });
      expect(foreign).toEqual({ entries: [], snapshotId: null });
    });

    it("rejects binding a table that is not present in the reusing project's own approved snapshot", async () => {
      // The reusing project never approves its own snapshot, so its
      // `latestApprovedVisuals` is undefined and no table can be trusted.
      const originalApproval = await snapshotService.approve({
        ownerUserId,
        projectId,
        correlationId,
      });
      await createStoryboardFor(
        database!.client,
        originalApproval.snapshot.id,
      );

      await expect(
        storyboardService.updateScene({
          ownerUserId,
          projectId: reusedProjectId,
          sceneId,
          body: {
            expectedRevision: 0,
            scene: {
              ...labelledDiagramStoryboardPayload().scenes[0]!.scene,
              assetBindings: [
                { assetId: tableId, role: "diagram", slot: "diagram" },
              ],
            },
          },
          correlationId,
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  },
);
