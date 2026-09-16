import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import { PublicError } from "@avlp/config";
import {
  jobs,
  learningObjectives,
  learningObjectiveSets,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  lessonVersions,
  migrateDatabase,
  modelCalls,
  narrationBlocks,
  narrationSets,
  outboxEvents,
  parsedDocuments,
  projects,
  scenes,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { eq } from "drizzle-orm";
import type { VersionSaveReadiness } from "@avlp/schemas";
import { PostgresLessonVersionsService } from "./lesson-versions.js";
import type { CitationHistoryService } from "./citation-history.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000007";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000007";
const sourceDocumentId: Identifier = "019ffbf1-abcd-7000-8000-000000000007";
const artifactId: Identifier = "019ffbf1-abce-7000-8000-000000000007";
const parsedDocumentId: Identifier = "019ffbf1-abcf-7000-8000-000000000007";
const snapshotId: Identifier = "019ffbf1-dddd-7000-8000-000000000007";
const objectiveSetId: Identifier = "019ffbf1-9999-7000-8000-000000000007";
const modelCallId: Identifier = "019ffbf1-eeee-7000-8000-000000000015";
const outlineSetId: Identifier = "019ffbf1-eeee-7000-8000-000000000007";
const narrationSetId: Identifier = "019ffbf1-ffff-7000-8000-000000000007";
const outlineItemA: Identifier = "019ffbf1-1111-7000-8000-000000000007";
const blockA: Identifier = "019ffbf1-3333-7000-8000-000000000007";
const objectiveId: Identifier = "019ffbf1-5555-7000-8000-000000000007";
const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000007";
const sceneA: Identifier = "019ffbf1-7777-7000-8000-000000000007";
const now = new Date("2026-09-16T10:00:00.000Z");

const noopCitations: CitationHistoryService = {
  snapshotForVersion: async () => {
    throw new Error("citations should not be requested for a blocked save");
  },
  persistSnapshot: async () => {
    throw new Error("citations should not be persisted for a blocked save");
  },
};

const fakeCitations: CitationHistoryService = {
  snapshotForVersion: async (input) => ({
    schemaVersion: "citation-history-v1",
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    lessonSpecId: input.lessonSpecId ?? lessonSpecId,
    lessonSpecRevision: input.lessonSpecRevision ?? 0,
    lessonVersionId: input.lessonVersionId,
    sceneCitations: [],
    groundingCheckId: input.groundingCheckId,
    createdAt: now.toISOString(),
  }),
  persistSnapshot: async () => ({ id: "019ffbf1-4444-7000-8000-000000000097" }),
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
    totalDurationSeconds: 30,
    objectiveIds: [objectiveId],
    contentHash: "d".repeat(64),
    scenes: [
      {
        id: sceneA,
        stableSceneId: sceneA,
        order: 1,
        template: "definition",
        durationSeconds: 30,
        narrationBlockIds: [blockA],
        assetRequirements: [],
        scene: {
          id: sceneA,
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
              sectionId: "019ffbf1-2222-7000-8000-000000000001",
              blockIds: [blockA],
            },
          ],
          generatedAdditions: [],
          template: "definition",
          visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
        },
      },
    ],
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
}

async function seed(client: DatabaseClient, narrationStatus: "approved" | "draft") {
  await client.delete(outboxEvents);
  await client.delete(jobs);
  await client.delete(scenes);
  await client.delete(lessonVersions);
  await client.delete(lessonSpecs);
  await client.delete(narrationBlocks);
  await client.delete(narrationSets);
  await client.delete(lessonOutlineItems);
  await client.delete(lessonOutlineSets);
  await client.delete(lessonConfigurations);
  await client.delete(learningObjectives);
  await client.delete(learningObjectiveSets);
  await client.delete(modelCalls);
  await client.delete(sourceSnapshots);
  await client.delete(parsedDocuments);
  await client.delete(sourceDocumentIngestionArtifacts);
  await client.delete(sourceDocuments);
  await client.delete(projects);
  await client.delete(users);

  await client.insert(users).values({ id: ownerUserId, emailNormalized: "owner-versions@example.test", displayName: "Owner" });
  await client.insert(projects).values({ id: projectId, ownerUserId, title: "Water cycle", stage: "draft", latestFailedOperation: null, createdAt: now, updatedAt: now, revision: 1 });
  await client.insert(sourceDocuments).values({ id: sourceDocumentId, ownerUserId, projectId, originalName: "water-cycle.pdf", mediaType: "application/pdf", sizeBytes: 1_000, sha256: "a".repeat(64), storageKey: "users/versions-owner/water-cycle.pdf", pageCount: 2, status: "active", createdAt: now, updatedAt: now });
  await client.insert(sourceDocumentIngestionArtifacts).values({ id: artifactId, ownerUserId, projectId, sourceDocumentId, parserVersion: "docling-v1", normalizedSchemaVersion: "1.0", canonicalStorageKey: "users/versions-owner/canonical.json", state: "ready", createdAt: now, updatedAt: now });
  await client.insert(parsedDocuments).values({ id: parsedDocumentId, ownerUserId, projectId, ingestionArtifactId: artifactId, sourceDocumentId, version: 1, schemaVersion: "1.0", parserVersion: "docling-v1", adapterVersion: "1.0", normalizedStorageKey: "users/versions-owner/normalized.json", title: "The Water Cycle", language: "en", pageCount: 2, createdAt: now, updatedAt: now });
  await client.insert(sourceSnapshots).values({ id: snapshotId, ownerUserId, projectId, parsedDocumentId, parsedDocumentVersion: 1, snapshotVersion: 1, schemaVersion: "1.0", contentHash: "b".repeat(64), approvedBy: ownerUserId, approvedAt: now, payload: { schemaVersion: "1.0", id: snapshotId, projectId, sourceDocumentId, parsedDocumentId, parsedDocumentVersion: 1, contentHash: "b".repeat(64), approvedBy: ownerUserId, approvedAt: now.toISOString(), sections: [], blocks: [], figures: [], tables: [] }, createdAt: now, updatedAt: now });
  await client.insert(lessonConfigurations).values({ id: "019ffbf1-9999-7000-8000-000000000017", projectId, ownerUserId, version: 3, ageBand: "11-13", difficulty: "introductory", subject: "Science", lessonTitle: "The water cycle", targetDurationSeconds: 180, tone: "friendly", visualTheme: "mvp-default", includeRecallQuestions: true, sourceParsedDocumentVersion: 1, createdAt: now, updatedAt: now });
  await client.insert(modelCalls).values({ id: modelCallId, ownerUserId, projectId, operationType: "ai.objectives", idempotencyKey: "versions:model-call:1", promptId: "objectives", promptVersion: "v2", provider: "mock", model: "mock-model-1", inputVersion: "objectives:input-1", inputHash: "a".repeat(64), inputUnits: 100, outputUnits: 100, estimatedCostUsd: "0.001", latencyMs: 100, validationStatus: "valid", status: "succeeded", correlationId: "019ffbf1-0000-7000-8000-000000000098", createdAt: now, updatedAt: now });
  await client.insert(learningObjectiveSets).values({ id: objectiveSetId, ownerUserId, projectId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), configurationVersion: 3, promptId: "objectives", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "versions:objectives:1", keyConcepts: [], prerequisiteKnowledge: [], vocabulary: [], misconceptions: [], assessmentQuestions: [], generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(learningObjectives).values({ id: objectiveId, ownerUserId, projectId, setId: objectiveSetId, order: 1, statement: "Explain the water cycle.", verb: "explain", confidence: 0.9, sourceRefs: [], generated: true, revision: 0, createdAt: now, updatedAt: now });
  await client.insert(lessonOutlineSets).values({ id: outlineSetId, projectId, ownerUserId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), objectiveSetId, objectiveSetContentHash: "b".repeat(64), configurationVersion: 3, promptId: "outline", promptVersion: "v2", model: "mock-model-1", modelCallId, status: "approved", revision: 0, idempotencyKey: "versions:outline:1", totalEstimatedSeconds: 30, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(lessonOutlineItems).values({ id: outlineItemA, projectId, ownerUserId, setId: outlineSetId, order: 1, kind: "concept", title: "Evaporation", description: "Explain evaporation.", estimatedSeconds: 30, sourceRefs: [], framingNote: null, generated: true, revision: 0, createdAt: now, updatedAt: now });
  await client.insert(narrationSets).values({ id: narrationSetId, projectId, ownerUserId, sourceSnapshotId: snapshotId, sourceSnapshotContentHash: "b".repeat(64), outlineSetId, outlineSetContentHash: "b".repeat(64), configurationVersion: 3, promptId: "narration", promptVersion: "v2", model: "mock-model-1", modelCallId, status: narrationStatus, revision: 0, idempotencyKey: "versions:narration:1", totalEstimatedSeconds: 30, generatedAt: now, createdAt: now, updatedAt: now });
  await client.insert(narrationBlocks).values({ id: blockA, projectId, ownerUserId, setId: narrationSetId, outlineItemId: outlineItemA, order: 1, text: "Water evaporates when heated and rises as water vapour into the sky.", estimatedWords: 12, targetSeconds: 30, sourceRefs: [{ documentId: "019ffbf1-3333-7000-8000-000000000001", parsedDocumentVersion: 1, pageStart: 1, pageEnd: 1, sectionId: "019ffbf1-2222-7000-8000-000000000001", blockIds: [blockA] }], generatedAdditions: [], generated: true, revision: 0, createdAt: now, updatedAt: now });
  const payload = storyboardPayload();
  await client.insert(lessonSpecs).values({ id: lessonSpecId, projectId, ownerUserId, schemaVersion: "storyboard-v1", basedOnNarrationSetId: payload.basedOnNarrationSetId, narrationSetContentHash: payload.narrationSetContentHash, outlineSetId: payload.outlineSetId, outlineSetContentHash: payload.outlineSetContentHash, configurationVersion: payload.configurationVersion, promptId: payload.promptId, promptVersion: payload.promptVersion, model: payload.model, modelCallId: payload.modelCallId, status: "approved", revision: 0, idempotencyKey: "versions:storyboard:1", title: payload.title, subject: payload.subject, targetDurationSeconds: payload.targetDurationSeconds, totalDurationSeconds: payload.totalDurationSeconds, objectiveIds: payload.objectiveIds, contentHash: payload.contentHash, payload, generatedAt: now, createdAt: now, updatedAt: now });
}

describeWithPostgres("PostgresLessonVersionsService readiness (Postgres)", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("blocks a save with narration still a draft, names the exact blocker, and creates no version or pointer", async () => {
    await seed(database!.client, "draft");
    const service = new PostgresLessonVersionsService(database!.client, noopCitations, () => now);

    const attempt = service.create({ ownerUserId, projectId, body: { reason: "explicit_save" }, correlationId: "019ffbf1-4444-7000-8000-000000000099" });
    await expect(attempt).rejects.toBeInstanceOf(PublicError);
    const error = (await attempt.catch((caught: unknown) => caught)) as PublicError;
    expect(error.statusCode).toBe(409);
    expect(error.message).toContain("Narration is still a draft");
    const details = error.details as VersionSaveReadiness;
    expect(details.ready).toBe(false);
    expect(details.blockers).toEqual([
      { code: "narration_unapproved", message: "Narration is still a draft and must be approved.", recoveryStage: "narration" },
    ]);

    const [project] = await database!.client.select({ currentLessonVersionId: projects.currentLessonVersionId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    expect(project?.currentLessonVersionId ?? null).toBeNull();
    const versionRows = await database!.client.select({ id: lessonVersions.id }).from(lessonVersions).where(eq(lessonVersions.projectId, projectId));
    expect(versionRows).toHaveLength(0);
  });

  it("succeeds once narration is approved, creating exactly one version and updating the pointer", async () => {
    await seed(database!.client, "approved");
    const service = new PostgresLessonVersionsService(database!.client, fakeCitations, () => now);

    const result = await service.create({ ownerUserId, projectId, body: { reason: "explicit_save" }, correlationId: "019ffbf1-4444-7000-8000-000000000098" });
    expect(result.versions).toHaveLength(1);
    expect(result.currentVersionId).toBe(result.versions[0]!.id);
  });
});
