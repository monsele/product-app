import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import { PublicError } from "@avlp/config";
import {
  creativeDesignDrafts,
  creativeDesignSnapshots,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  migrateDatabase,
  modelCalls,
  narrationBlocks,
  narrationSets,
  parsedDocuments,
  projects,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  eligibleCinemaCompositions,
  isCreativeDesignManifestV2,
  sceneSpecSchema,
} from "@avlp/schemas";
import { PostgresCreativeDesignService } from "./creative-design.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000108";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000108";
const sourceDocumentId: Identifier = "019ffbf1-abcd-7000-8000-000000000108";
const artifactId: Identifier = "019ffbf1-abce-7000-8000-000000000108";
const parsedDocumentId: Identifier = "019ffbf1-abcf-7000-8000-000000000108";
const snapshotId: Identifier = "019ffbf1-dddd-7000-8000-000000000108";
const objectiveSetId: Identifier = "019ffbf1-9999-7000-8000-000000000108";
const modelCallId: Identifier = "019ffbf1-eeee-7000-8000-000000000118";
const outlineSetId: Identifier = "019ffbf1-eeee-7000-8000-000000000108";
const narrationSetId: Identifier = "019ffbf1-ffff-7000-8000-000000000108";
const outlineItemA: Identifier = "019ffbf1-1111-7000-8000-000000000108";
const blockA: Identifier = "019ffbf1-3333-7000-8000-000000000108";
const objectiveId: Identifier = "019ffbf1-5555-7000-8000-000000000108";
const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000108";
const sceneA: Identifier = "019ffbf1-7777-7000-8000-000000000108";
const sceneB: Identifier = "019ffbf1-7778-7000-8000-000000000108";
const now = new Date("2026-09-29T10:00:00.000Z");
const scope = { ownerUserId, projectId };

const sourceRefs = [
  {
    documentId: "019ffbf1-3333-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    pageStart: 1,
    pageEnd: 1,
    sectionId: "019ffbf1-2222-7000-8000-000000000001",
    blockIds: [blockA],
  },
];

const definitionScene = {
  id: sceneA,
  order: 1,
  narration: "Water evaporates when heated and rises as water vapour into the sky.",
  durationSeconds: 30,
  onScreenText: ["Key term"],
  transition: "cut",
  assetBindings: [],
  sourceRefs,
  generatedAdditions: [],
  template: "definition",
  visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
};
const processScene = {
  id: sceneB,
  order: 2,
  narration: "First the sun warms the water. Then the water evaporates. Finally the vapour rises.",
  durationSeconds: 30,
  onScreenText: [],
  transition: "fade",
  assetBindings: [],
  sourceRefs,
  generatedAdditions: [],
  template: "process",
  visual: { steps: ["The sun warms the water", "The water evaporates", "The vapour rises"] },
};

function storyboardPayload() {
  return {
    schemaVersion: 1,
    id: lessonSpecId,
    projectId,
    basedOnNarrationSetId: narrationSetId,
    narrationSetContentHash: "c".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId,
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 60,
    objectiveIds: [objectiveId],
    contentHash: "d".repeat(64),
    scenes: [definitionScene, processScene].map((scene) => ({
      id: scene.id,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: [blockA],
      assetRequirements: [],
      scene,
    })),
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
}

async function seed(client: DatabaseClient) {
  for (const table of [
    creativeDesignSnapshots,
    creativeDesignDrafts,
    lessonSpecs,
    narrationBlocks,
    narrationSets,
    lessonOutlineItems,
    lessonOutlineSets,
    lessonConfigurations,
    learningObjectives,
    learningObjectiveSets,
    modelCalls,
    sourceSnapshots,
    parsedDocuments,
    sourceDocumentIngestionArtifacts,
    sourceDocuments,
    projects,
    users,
  ])
    await client.delete(table);
  await client.insert(users).values({ id: ownerUserId, emailNormalized: "owner-design-v2@example.test", displayName: "Owner" });
  await client.insert(projects).values({ id: projectId, ownerUserId, title: "Water cycle", stage: "draft", latestFailedOperation: null, createdAt: now, updatedAt: now, revision: 1 });
  await client.insert(sourceDocuments).values({ id: sourceDocumentId, ownerUserId, projectId, originalName: "water-cycle.pdf", mediaType: "application/pdf", sizeBytes: 1_000, sha256: "a".repeat(64), storageKey: "users/design-v2-owner/water-cycle.pdf", pageCount: 2, status: "active", createdAt: now, updatedAt: now });
  await client.insert(sourceDocumentIngestionArtifacts).values({ id: artifactId, ownerUserId, projectId, sourceDocumentId, parserVersion: "docling-v1", normalizedSchemaVersion: "1.0", canonicalStorageKey: "users/design-v2-owner/canonical.json", state: "ready", createdAt: now, updatedAt: now });
  await client.insert(parsedDocuments).values({ id: parsedDocumentId, ownerUserId, projectId, ingestionArtifactId: artifactId, sourceDocumentId, version: 1, schemaVersion: "1.0", parserVersion: "docling-v1", adapterVersion: "1.0", normalizedStorageKey: "users/design-v2-owner/normalized.json", title: "The Water Cycle", language: "en", pageCount: 2, createdAt: now, updatedAt: now });
  await client.insert(sourceSnapshots).values({ id: snapshotId, ownerUserId, projectId, parsedDocumentId, parsedDocumentVersion: 1, snapshotVersion: 1, schemaVersion: "1.0", contentHash: "b".repeat(64), approvedBy: ownerUserId, approvedAt: now, payload: { schemaVersion: "1.0", id: snapshotId, projectId, sourceDocumentId, parsedDocumentId, parsedDocumentVersion: 1, contentHash: "b".repeat(64), approvedBy: ownerUserId, approvedAt: now.toISOString(), sections: [], blocks: [], figures: [], tables: [] }, createdAt: now, updatedAt: now });
  await client.insert(lessonConfigurations).values({ id: "019ffbf1-9999-7000-8000-000000000118", projectId, ownerUserId, version: 3, ageBand: "11-13", difficulty: "introductory", subject: "Science", lessonTitle: "The water cycle", targetDurationSeconds: 180, tone: "friendly", visualTheme: "mvp-default", includeRecallQuestions: true, sourceParsedDocumentVersion: 1, createdAt: now, updatedAt: now });
  await client.insert(modelCalls).values({ id: modelCallId, ownerUserId, projectId, operationType: "ai.objectives", idempotencyKey: "design-v2:model-call:1", promptId: "objectives", promptVersion: "v2", provider: "mock", model: "mock-model-1", inputVersion: "objectives:input-1", inputHash: "a".repeat(64), inputUnits: 100, outputUnits: 100, estimatedCostUsd: "0.001", latencyMs: 100, validationStatus: "valid", status: "succeeded", correlationId: "019ffbf1-0000-7000-8000-000000000108", createdAt: now, updatedAt: now });
  await client.insert(learningObjectiveSets).values({ id: objectiveSetId, ownerUserId, projectId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), configurationVersion: 3, promptId: "objectives", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "design-v2:objectives:1", keyConcepts: [], prerequisiteKnowledge: [], vocabulary: [], misconceptions: [], assessmentQuestions: [], generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(learningObjectives).values({ id: objectiveId, ownerUserId, projectId, setId: objectiveSetId, order: 1, statement: "Explain the water cycle.", verb: "explain", confidence: 0.9, sourceRefs: [], generated: true, revision: 0, createdAt: now, updatedAt: now });
  await client.insert(lessonOutlineSets).values({ id: outlineSetId, projectId, ownerUserId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), objectiveSetId, objectiveSetContentHash: "b".repeat(64), configurationVersion: 3, promptId: "outline", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "design-v2:outline:1", totalEstimatedSeconds: 60, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(lessonOutlineItems).values({ id: outlineItemA, projectId, ownerUserId, setId: outlineSetId, order: 1, kind: "concept", title: "Evaporation", description: "Explain evaporation.", estimatedSeconds: 60, sourceRefs: [], framingNote: null, generated: true, revision: 0, createdAt: now, updatedAt: now });
  await client.insert(narrationSets).values({ id: narrationSetId, projectId, ownerUserId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), outlineSetId, outlineSetContentHash: "b".repeat(64), configurationVersion: 3, promptId: "narration", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "design-v2:narration:1", totalEstimatedSeconds: 60, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(narrationBlocks).values({ id: blockA, projectId, ownerUserId, setId: narrationSetId, outlineItemId: outlineItemA, order: 1, text: definitionScene.narration, estimatedWords: 12, targetSeconds: 60, sourceRefs, generatedAdditions: [], generated: true, revision: 0, createdAt: now, updatedAt: now });
  const payload = storyboardPayload();
  await client.insert(lessonSpecs).values({ id: lessonSpecId, projectId, ownerUserId, schemaVersion: "storyboard-v1", basedOnNarrationSetId: payload.basedOnNarrationSetId, narrationSetContentHash: payload.narrationSetContentHash, outlineSetId: payload.outlineSetId, outlineSetContentHash: payload.outlineSetContentHash, configurationVersion: payload.configurationVersion, promptId: payload.promptId, promptVersion: payload.promptVersion, model: payload.model, modelCallId: payload.modelCallId, status: "draft", revision: 0, idempotencyKey: "design-v2:storyboard:1", title: payload.title, subject: payload.subject, targetDurationSeconds: payload.targetDurationSeconds, totalDurationSeconds: payload.totalDurationSeconds, objectiveIds: payload.objectiveIds, contentHash: payload.contentHash, payload, generatedAt: now, createdAt: now, updatedAt: now });
}

describeWithPostgres("PostgresCreativeDesignService v2 drafts (ADR-015, Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresCreativeDesignService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seed(database!.client);
    service = new PostgresCreativeDesignService(database!.client, () => now);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("upgrades a v1 draft to v2 only on request, then lists, applies and keeps it", async () => {
    const planned = await service.plan({ ...scope, body: { packId: "field-notes", expectedRevision: 0 } });
    expect(planned.manifest.manifestVersion).toBe("1.0");

    const upgraded = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } });
    expect(upgraded.revision).toBe(planned.revision + 1);
    expect(isCreativeDesignManifestV2(upgraded.manifest)).toBe(true);
    if (!isCreativeDesignManifestV2(upgraded.manifest)) return;
    expect(upgraded.manifest.pack.id).toBe("field-notes");
    expect(upgraded.manifest.variationSeed).toMatch(/^[0-9a-f]{16}$/u);
    expect(Object.keys(upgraded.manifest.scenes).sort()).toEqual([sceneA, sceneB].sort());

    const draft = await service.getDraft(scope);
    expect(draft?.manifest).toEqual(upgraded.manifest);
    expect(draft?.eligibility).toEqual([]);
    expect(draft?.applied).toBe(false);

    const alternatives = await service.alternatives({ ...scope, sceneId: sceneB });
    const expected = eligibleCinemaCompositions(sceneSpecSchema.parse(processScene)).map((entry) => entry.id);
    expect(alternatives.map((entry) => entry.treatmentId)).toEqual(expected);
    expect(expected.length).toBeGreaterThanOrEqual(2);

    const applied = await service.apply({ ...scope, expectedRevision: upgraded.revision });
    expect(applied.manifestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect((await service.getDraft(scope))?.applied).toBe(true);

    // Upgrading again is a no-op; a stale revision is a conflict.
    await expect(service.upgrade({ ...scope, body: { expectedRevision: upgraded.revision } })).resolves.toEqual({
      revision: upgraded.revision,
      manifest: upgraded.manifest,
    });
    const stale = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } }).catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(PublicError);
    expect((stale as PublicError).statusCode).toBe(409);
  });

  it("switches pack on a v2 draft without falling back to v1", async () => {
    const planned = await service.plan({ ...scope, body: { packId: "essential", expectedRevision: 0 } });
    const upgraded = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } });
    if (!isCreativeDesignManifestV2(upgraded.manifest)) throw new Error("expected a v2 draft");
    const switched = await service.plan({ ...scope, body: { packId: "systems", expectedRevision: upgraded.revision } });
    expect(isCreativeDesignManifestV2(switched.manifest)).toBe(true);
    if (!isCreativeDesignManifestV2(switched.manifest)) return;
    expect(switched.manifest.pack.id).toBe("systems");
    expect(switched.manifest.variationSeed).toBe(upgraded.manifest.variationSeed);
    // The new pack's own look, not the previous pack's colours.
    expect(switched.manifest.settings.colors).not.toEqual(upgraded.manifest.settings.colors);
  });

  it("saves a v2 draft edit and refuses a composition that cannot present the scene", async () => {
    const planned = await service.plan({ ...scope, body: { packId: "prism", expectedRevision: 0 } });
    const upgraded = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } });
    if (!isCreativeDesignManifestV2(upgraded.manifest)) throw new Error("expected a v2 draft");
    const manifest = upgraded.manifest;
    const other = eligibleCinemaCompositions(sceneSpecSchema.parse(processScene)).find(
      (entry) => entry.id !== manifest.scenes[sceneB]!.compositionId,
    )!;
    const locked = await service.createOrUpdateDraft({
      ...scope,
      body: {
        expectedRevision: upgraded.revision,
        manifest: {
          ...manifest,
          scenes: { ...manifest.scenes, [sceneB]: { ...manifest.scenes[sceneB]!, compositionId: other.id, locked: true } },
        },
      },
    });
    expect(isCreativeDesignManifestV2(locked.manifest) && locked.manifest.scenes[sceneB]?.compositionId).toBe(other.id);

    const refused = await service
      .createOrUpdateDraft({
        ...scope,
        body: {
          expectedRevision: locked.revision,
          manifest: {
            ...manifest,
            // A before/after comparison cannot present a definition.
            scenes: { ...manifest.scenes, [sceneA]: { ...manifest.scenes[sceneA]!, compositionId: "comparison-stacked" } },
          },
        },
      })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(PublicError);
    expect((refused as PublicError).statusCode).toBe(422);
    expect((await service.getDraft(scope))?.revision).toBe(locked.revision);
  });
});
