/**
 * A seeded water-cycle project (source, objectives, outline, narration and a
 * two-scene draft storyboard) for the creative-design v2 integration tests.
 */
import type { Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  creativeDesignSnapshots,
  illustrationGenerationCandidates,
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  modelCalls,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  parsedDocuments,
  projectAssets,
  projects,
  scenes,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";

export const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000108";
export const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000108";
export const sourceDocumentId: Identifier = "019ffbf1-abcd-7000-8000-000000000108";
export const artifactId: Identifier = "019ffbf1-abce-7000-8000-000000000108";
export const parsedDocumentId: Identifier = "019ffbf1-abcf-7000-8000-000000000108";
export const snapshotId: Identifier = "019ffbf1-dddd-7000-8000-000000000108";
export const objectiveSetId: Identifier = "019ffbf1-9999-7000-8000-000000000108";
export const modelCallId: Identifier = "019ffbf1-eeee-7000-8000-000000000118";
export const outlineSetId: Identifier = "019ffbf1-eeee-7000-8000-000000000108";
export const narrationSetId: Identifier = "019ffbf1-ffff-7000-8000-000000000108";
export const outlineItemA: Identifier = "019ffbf1-1111-7000-8000-000000000108";
export const blockA: Identifier = "019ffbf1-3333-7000-8000-000000000108";
export const objectiveId: Identifier = "019ffbf1-5555-7000-8000-000000000108";
export const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000108";
export const sceneA: Identifier = "019ffbf1-7777-7000-8000-000000000108";
export const sceneB: Identifier = "019ffbf1-7778-7000-8000-000000000108";
export const now = new Date("2026-09-29T10:00:00.000Z");
export const scope = { ownerUserId, projectId };

export const sourceRefs = [
  {
    documentId: "019ffbf1-3333-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    pageStart: 1,
    pageEnd: 1,
    sectionId: "019ffbf1-2222-7000-8000-000000000001",
    blockIds: [blockA],
  },
];

export const definitionScene = {
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
export const processScene = {
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

export function storyboardPayload() {
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

export async function seed(client: DatabaseClient) {
  for (const table of [
    outboxEvents,
    jobs,
    illustrationGenerationCandidates,
    projectAssets,
    scenes,
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

