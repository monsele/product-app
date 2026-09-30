/**
 * A seeded two-scene water-cycle lesson with an authored v2 design draft, for
 * the ST-110 worker integration tests (visual plan and hero illustrations).
 */
import type { Identifier } from "@avlp/config";
import {
  auditEvents,
  creativeDesignDrafts,
  creativeDesignSnapshots,
  illustrationGenerationCandidates,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  modelCalls,
  narrationBlocks,
  narrationSets,
  parsedDocuments,
  projectAssets,
  projects,
  scenes,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  usageRecords,
  users,
  type DatabaseClient,
} from "@avlp/database";
import {
  anyCreativeDesignManifestSchema,
  creativeDesignHash,
  isCreativeDesignManifestV2,
  planCinemaDesign,
  sceneSpecSchema,
  sourceSnapshotSchema,
  type CreativeDesignManifestV2,
} from "@avlp/schemas";
import { eq } from "drizzle-orm";

export const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000110";
export const otherOwnerId: Identifier = "019ffbf1-aaab-7000-8000-000000000110";
export const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000110";
export const otherProjectId: Identifier = "019ffbf1-cccd-7000-8000-000000000110";
export const sourceDocumentId: Identifier = "019ffbf1-abcd-7000-8000-000000000110";
export const artifactId: Identifier = "019ffbf1-abce-7000-8000-000000000110";
export const parsedDocumentId: Identifier = "019ffbf1-abcf-7000-8000-000000000110";
export const snapshotId: Identifier = "019ffbf1-dddd-7000-8000-000000000110";
export const objectiveSetId: Identifier = "019ffbf1-9999-7000-8000-000000000110";
export const modelCallId: Identifier = "019ffbf1-eeee-7000-8000-000000000120";
export const outlineSetId: Identifier = "019ffbf1-eeee-7000-8000-000000000110";
export const narrationSetId: Identifier = "019ffbf1-ffff-7000-8000-000000000110";
export const outlineItemA: Identifier = "019ffbf1-1111-7000-8000-000000000110";
export const blockA: Identifier = "019ffbf1-3333-7000-8000-000000000110";
export const objectiveId: Identifier = "019ffbf1-5555-7000-8000-000000000110";
export const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000110";
export const draftId: Identifier = "019ffbf1-8888-7000-8000-000000000110";
export const sceneA: Identifier = "019ffbf1-7777-7000-8000-000000000110";
export const sceneB: Identifier = "019ffbf1-7778-7000-8000-000000000110";
export const now = new Date("2026-09-29T10:00:00.000Z");
export const seed = "0123456789abcdef";

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
  title: "Evaporation",
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
  title: "How water rises",
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
export const sceneSpecs = [definitionScene, processScene].map((scene) => sceneSpecSchema.parse(scene));

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

export function authoredDesign(): CreativeDesignManifestV2 {
  return planCinemaDesign({ packId: "everyday", scenes: sceneSpecs, seed });
}

export async function seedDatabase(client: DatabaseClient) {
  for (const table of [
    auditEvents,
    usageRecords,
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
  await client.insert(users).values([
    { id: ownerUserId, emailNormalized: "owner-visual-plan@example.test", displayName: "Owner" },
    { id: otherOwnerId, emailNormalized: "other-visual-plan@example.test", displayName: "Other" },
  ]);
  await client.insert(projects).values([
    { id: projectId, ownerUserId, title: "Water cycle", stage: "draft", latestFailedOperation: null, createdAt: now, updatedAt: now, revision: 1 },
    { id: otherProjectId, ownerUserId: otherOwnerId, title: "Other", stage: "draft", latestFailedOperation: null, createdAt: now, updatedAt: now, revision: 1 },
  ]);
  await client.insert(sourceDocuments).values({ id: sourceDocumentId, ownerUserId, projectId, originalName: "water-cycle.pdf", mediaType: "application/pdf", sizeBytes: 1_000, sha256: "a".repeat(64), storageKey: "users/visual-plan-owner/water-cycle.pdf", pageCount: 2, status: "active", createdAt: now, updatedAt: now });
  await client.insert(sourceDocumentIngestionArtifacts).values({ id: artifactId, ownerUserId, projectId, sourceDocumentId, parserVersion: "docling-v1", normalizedSchemaVersion: "1.0", canonicalStorageKey: "users/visual-plan-owner/canonical.json", state: "ready", createdAt: now, updatedAt: now });
  await client.insert(parsedDocuments).values({ id: parsedDocumentId, ownerUserId, projectId, ingestionArtifactId: artifactId, sourceDocumentId, version: 1, schemaVersion: "1.0", parserVersion: "docling-v1", adapterVersion: "1.0", normalizedStorageKey: "users/visual-plan-owner/normalized.json", title: "The Water Cycle", language: "en", pageCount: 2, createdAt: now, updatedAt: now });
  await client.insert(sourceSnapshots).values({ id: snapshotId, ownerUserId, projectId, parsedDocumentId, parsedDocumentVersion: 1, snapshotVersion: 1, schemaVersion: "1.0", contentHash: "b".repeat(64), approvedBy: ownerUserId, approvedAt: now, payload: {}, createdAt: now, updatedAt: now });
  await client.insert(lessonConfigurations).values({ id: "019ffbf1-9999-7000-8000-000000000120", projectId, ownerUserId, version: 3, ageBand: "11-13", difficulty: "introductory", subject: "Science", lessonTitle: "The water cycle", targetDurationSeconds: 180, tone: "friendly", visualTheme: "mvp-default", includeRecallQuestions: true, sourceParsedDocumentVersion: 1, createdAt: now, updatedAt: now });
  await client.insert(modelCalls).values({ id: modelCallId, ownerUserId, projectId, operationType: "ai.objectives", idempotencyKey: "visual-plan:model-call:1", promptId: "objectives", promptVersion: "v2", provider: "mock", model: "mock-model-1", inputVersion: "objectives:input-1", inputHash: "a".repeat(64), inputUnits: 100, outputUnits: 100, estimatedCostUsd: "0.001", latencyMs: 100, validationStatus: "valid", status: "succeeded", correlationId: "019ffbf1-0000-7000-8000-000000000110", createdAt: now, updatedAt: now });
  await client.insert(learningObjectiveSets).values({ id: objectiveSetId, ownerUserId, projectId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), configurationVersion: 3, promptId: "objectives", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "visual-plan:objectives:1", keyConcepts: [], prerequisiteKnowledge: [], vocabulary: [], misconceptions: [], assessmentQuestions: [], generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(learningObjectives).values({ id: objectiveId, ownerUserId, projectId, setId: objectiveSetId, order: 1, statement: "Explain the water cycle.", verb: "explain", confidence: 0.9, sourceRefs: [], generated: true, revision: 0, createdAt: now, updatedAt: now });
  await client.insert(lessonOutlineSets).values({ id: outlineSetId, projectId, ownerUserId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), objectiveSetId, objectiveSetContentHash: "b".repeat(64), configurationVersion: 3, promptId: "outline", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "visual-plan:outline:1", totalEstimatedSeconds: 60, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(lessonOutlineItems).values({ id: outlineItemA, projectId, ownerUserId, setId: outlineSetId, order: 1, kind: "concept", title: "Evaporation", description: "Explain evaporation.", estimatedSeconds: 60, sourceRefs: [], framingNote: null, generated: true, revision: 0, createdAt: now, updatedAt: now });
  await client.insert(narrationSets).values({ id: narrationSetId, projectId, ownerUserId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), outlineSetId, outlineSetContentHash: "b".repeat(64), configurationVersion: 3, promptId: "narration", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "visual-plan:narration:1", totalEstimatedSeconds: 60, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(narrationBlocks).values({ id: blockA, projectId, ownerUserId, setId: narrationSetId, outlineItemId: outlineItemA, order: 1, text: definitionScene.narration, estimatedWords: 12, targetSeconds: 60, sourceRefs, generatedAdditions: [], generated: true, revision: 0, createdAt: now, updatedAt: now });
  const payload = storyboardPayload();
  await client.insert(lessonSpecs).values({ id: lessonSpecId, projectId, ownerUserId, schemaVersion: "storyboard-v1", basedOnNarrationSetId: payload.basedOnNarrationSetId, narrationSetContentHash: payload.narrationSetContentHash, outlineSetId: payload.outlineSetId, outlineSetContentHash: payload.outlineSetContentHash, configurationVersion: payload.configurationVersion, promptId: payload.promptId, promptVersion: payload.promptVersion, model: payload.model, modelCallId: payload.modelCallId, status: "draft", revision: 0, idempotencyKey: "visual-plan:storyboard:1", title: payload.title, subject: payload.subject, targetDurationSeconds: payload.targetDurationSeconds, totalDurationSeconds: payload.totalDurationSeconds, objectiveIds: payload.objectiveIds, contentHash: payload.contentHash, payload, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(scenes).values(
    payload.scenes.map((entry, index) => ({
      id: entry.id,
      projectId,
      ownerUserId,
      lessonSpecId,
      stableSceneId: entry.stableSceneId,
      order: index + 1,
      template: entry.template,
      durationSeconds: entry.durationSeconds,
      narrationBlockIds: entry.narrationBlockIds,
      assetRequirements: entry.assetRequirements,
      sceneJson: entry.scene,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const manifest = authoredDesign();
  await client.insert(creativeDesignDrafts).values({ id: draftId, projectId, ownerUserId, lessonSpecId, lessonSpecRevision: 0, manifest, manifestHash: creativeDesignHash(manifest), revision: 1, createdAt: now, updatedAt: now });
}

export const snapshot = sourceSnapshotSchema.parse({
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
    { sectionId: sourceRefs[0]!.sectionId, order: 1, level: 1, heading: "Water cycle", pageStart: 1, pageEnd: 1, reviewOrder: null, blockIds: [blockA], figureIds: [], tableIds: [] },
  ],
  blocks: [
    { blockId: blockA, sectionId: sourceRefs[0]!.sectionId, kind: "paragraph", order: 1, pageStart: 1, pageEnd: 1, text: "SOURCE-ONLY sentence the planner must never see.", corrected: false, revision: 0 },
  ],
  figures: [],
  tables: [],
});

export async function readDraft(client: DatabaseClient) {
  const [row] = await client
    .select()
    .from(creativeDesignDrafts)
    .where(eq(creativeDesignDrafts.id, draftId));
  const manifest = anyCreativeDesignManifestSchema.parse(row!.manifest);
  if (!isCreativeDesignManifestV2(manifest)) throw new Error("expected a v2 draft");
  return { revision: row!.revision, manifestHash: row!.manifestHash, manifest };
}
