import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
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
import { sceneAudio } from "@avlp/database";
import {
  sceneAudioFitToleranceMs,
  storyboardDurationToleranceSeconds,
} from "@avlp/schemas";
import { eq } from "drizzle-orm";
import { reconcileLessonSceneDurations } from "./duration-reconciliation.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId: Identifier = "019ffbf1-aaaa-7000-8000-000000000084";
const otherOwnerUserId: Identifier = "019ffbf1-bbbb-7000-8000-000000000084";
const projectId: Identifier = "019ffbf1-cccc-7000-8000-000000000084";
const sourceDocumentId: Identifier = "019ffbf1-abcd-7000-8000-000000000084";
const artifactId: Identifier = "019ffbf1-abce-7000-8000-000000000084";
const parsedDocumentId: Identifier = "019ffbf1-abcf-7000-8000-000000000084";
const snapshotId: Identifier = "019ffbf1-dddd-7000-8000-000000000084";
const objectiveSetId: Identifier = "019ffbf1-9999-7000-8000-000000000084";
const modelCallId: Identifier = "019ffbf1-eeee-7000-8000-000000000085";
const outlineSetId: Identifier = "019ffbf1-eeee-7000-8000-000000000084";
const narrationSetId: Identifier = "019ffbf1-ffff-7000-8000-000000000084";
const outlineItemA: Identifier = "019ffbf1-1111-7000-8000-000000000084";
const outlineItemB: Identifier = "019ffbf1-2222-7000-8000-000000000084";
const blockA: Identifier = "019ffbf1-3333-7000-8000-000000000084";
const blockB: Identifier = "019ffbf1-4444-7000-8000-000000000084";
const objectiveId: Identifier = "019ffbf1-5555-7000-8000-000000000084";
const lessonSpecId: Identifier = "019ffbf1-6666-7000-8000-000000000084";
const sceneA: Identifier = "019ffbf1-7777-7000-8000-000000000084";
const sceneB: Identifier = "019ffbf1-8888-7000-8000-000000000084";
const now = new Date("2026-08-17T10:00:00.000Z");

function configRow() {
  return {
    id: "019ffbf1-9999-7000-8000-000000000084",
    projectId,
    ownerUserId,
    version: 3,
    ageBand: "11-13",
    difficulty: "introductory",
    subject: "Science",
    lessonTitle: "The water cycle",
    targetDurationSeconds: 180,
    tone: "friendly",
    visualTheme: "mvp-default",
    includeRecallQuestions: true,
    sourceParsedDocumentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function outlineSetRow() {
  return {
    id: outlineSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    objectiveSetId,
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "draft" as const,
    revision: 0,
    idempotencyKey: "outline:key-1",
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function outlineItemRows() {
  return [
    {
      id: outlineItemA,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 1,
      kind: "concept",
      title: "Evaporation",
      description: "Explain evaporation.",
      estimatedSeconds: 30,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: outlineItemB,
      projectId,
      ownerUserId,
      setId: outlineSetId,
      order: 2,
      kind: "concept",
      title: "Condensation",
      description: "Explain condensation.",
      estimatedSeconds: 30,
      sourceRefs: [],
      framingNote: null,
      generated: true,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function narrationSetRow() {
  return {
    id: narrationSetId,
    projectId,
    ownerUserId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    outlineSetId,
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "draft" as const,
    revision: 0,
    idempotencyKey: "narration:key-1",
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function narrationBlockRows() {
  return [
    {
      id: blockA,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: outlineItemA,
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
          sectionId: "019ffbf1-2222-7000-8000-000000000001",
          blockIds: [blockA],
        },
      ],
      generatedAdditions: [],
      generated: true,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: blockB,
      projectId,
      ownerUserId,
      setId: narrationSetId,
      outlineItemId: outlineItemB,
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
          sectionId: "019ffbf1-2222-7000-8000-000000000001",
          blockIds: [blockB],
        },
      ],
      generatedAdditions: [],
      generated: true,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

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
          visual: {
            term: "Evaporation",
            definition: "A liquid becoming a gas.",
          },
        },
      },
      {
        id: sceneB,
        stableSceneId: sceneB,
        order: 2,
        template: "summary",
        durationSeconds: 30,
        narrationBlockIds: [blockB],
        assetRequirements: [],
        scene: {
          id: sceneB,
          order: 2,
          narration: "Condensation forms clouds when water vapour cools.",
          durationSeconds: 30,
          onScreenText: [],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [
            {
              documentId: "019ffbf1-3333-7000-8000-000000000001",
              parsedDocumentVersion: 1,
              pageStart: 2,
              pageEnd: 2,
              sectionId: "019ffbf1-2222-7000-8000-000000000001",
              blockIds: [blockB],
            },
          ],
          generatedAdditions: [],
          template: "summary",
          visual: { takeaways: [{ text: "The cycle repeats." }] },
        },
      },
    ],
    generatedAt: now.toISOString(),
    createdAt: now.toISOString(),
  };
}

function lessonSpecRow() {
  const payload = storyboardPayload();
  return {
    id: lessonSpecId,
    projectId,
    ownerUserId,
    schemaVersion: "storyboard-v1",
    basedOnNarrationSetId: payload.basedOnNarrationSetId,
    narrationSetContentHash: payload.narrationSetContentHash,
    outlineSetId: payload.outlineSetId,
    outlineSetContentHash: payload.outlineSetContentHash,
    configurationVersion: payload.configurationVersion,
    promptId: payload.promptId,
    promptVersion: payload.promptVersion,
    model: payload.model,
    modelCallId: payload.modelCallId,
    status: "draft" as const,
    revision: 0,
    idempotencyKey: "reconciliation:key-1",
    title: payload.title,
    subject: payload.subject,
    targetDurationSeconds: payload.targetDurationSeconds,
    totalDurationSeconds: payload.totalDurationSeconds,
    objectiveIds: payload.objectiveIds,
    contentHash: payload.contentHash,
    payload,
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function seed(client: DatabaseClient) {
  await client.delete(outboxEvents);
  await client.delete(jobs);
  await client.delete(auditEvents);
  await client.delete(scenes);
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

  await client.insert(users).values([
    {
      id: ownerUserId,
      emailNormalized: "reconcile-owner@example.test",
      displayName: "Owner",
    },
    {
      id: otherOwnerUserId,
      emailNormalized: "reconcile-other@example.test",
      displayName: "Other",
    },
  ]);
  await client.insert(projects).values({
    id: projectId,
    ownerUserId,
    title: "Water cycle",
    stage: "draft",
    latestFailedOperation: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  });
  await client.insert(sourceDocuments).values({
    id: sourceDocumentId,
    ownerUserId,
    projectId,
    originalName: "water-cycle.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "a".repeat(64),
    storageKey: "users/reconciliation-owner/water-cycle.pdf",
    pageCount: 2,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(sourceDocumentIngestionArtifacts).values({
    id: artifactId,
    ownerUserId,
    projectId,
    sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: "users/reconciliation-owner/canonical.json",
    state: "ready",
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
    normalizedStorageKey: "users/reconciliation-owner/normalized.json",
    title: "The Water Cycle",
    language: "en",
    pageCount: 2,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(sourceSnapshots).values({
    id: snapshotId,
    ownerUserId,
    projectId,
    parsedDocumentId,
    parsedDocumentVersion: 1,
    snapshotVersion: 1,
    schemaVersion: "1.0",
    contentHash: "b".repeat(64),
    approvedBy: ownerUserId,
    approvedAt: now,
    payload: {
      schemaVersion: "1.0",
      id: snapshotId,
      projectId,
      sourceDocumentId,
      parsedDocumentId,
      parsedDocumentVersion: 1,
      contentHash: "b".repeat(64),
      approvedBy: ownerUserId,
      approvedAt: now.toISOString(),
      sections: [],
      blocks: [],
      figures: [],
      tables: [],
    },
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(lessonConfigurations).values(configRow());
  await client.insert(modelCalls).values({
    id: modelCallId,
    ownerUserId,
    projectId,
    operationType: "ai.objectives",
    idempotencyKey: "reconciliation:model-call:1",
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
    correlationId: "019ffbf1-0000-7000-8000-000000000099",
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(learningObjectiveSets).values({
    id: objectiveSetId,
    ownerUserId,
    projectId,
    sourceSnapshotId: snapshotId,
    sourceSnapshotContentHash: "b".repeat(64),
    configurationVersion: 3,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId,
    status: "approved",
    revision: 0,
    idempotencyKey: "reconciliation:objectives:1",
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await client.insert(lessonOutlineSets).values(outlineSetRow());
  await client.insert(lessonOutlineItems).values(outlineItemRows());
  await client.insert(narrationSets).values(narrationSetRow());
  await client.insert(narrationBlocks).values(narrationBlockRows());
  await client.insert(lessonSpecs).values(lessonSpecRow());
  await client.insert(scenes).values(sceneRows());
}

/** The normalized scene rows the storyboard payload is kept in sync with. */
function sceneRows() {
  return storyboardPayload().scenes.map((scene) => ({
    id: scene.id,
    ownerUserId,
    projectId,
    lessonSpecId,
    stableSceneId: scene.stableSceneId,
    order: scene.order,
    template: scene.template,
    durationSeconds: scene.durationSeconds,
    narrationBlockIds: scene.narrationBlockIds,
    assetRequirements: scene.assetRequirements,
    sceneJson: scene.scene,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }));
}

/** Ready per-scene audio with the measured durations under test. */
async function seedAudio(
  client: DatabaseClient,
  durationsMsBySceneId: Readonly<Record<string, number | null>>,
  overrides: { ownerUserId?: Identifier; projectId?: Identifier } = {},
) {
  await client.delete(sceneAudio);
  await client.insert(sceneAudio).values(
    Object.entries(durationsMsBySceneId).map(([id, durationMs], index) => ({
      id: `019ffbf1-aa${String(index).padStart(2, "0")}-7000-8000-000000000084`,
      ownerUserId: overrides.ownerUserId ?? ownerUserId,
      projectId: overrides.projectId ?? projectId,
      sceneId: id,
      status: "ready" as const,
      voiceConfigurationVersion: 1,
      narrationHash: "e".repeat(64),
      voiceConfigurationHash: "f".repeat(64),
      contentHash: `${index}`.repeat(64).slice(0, 64),
      storageKey: `users/reconciliation-owner/audio-${index}.wav`,
      checksumSha256: "a".repeat(64),
      contentType: "audio/wav",
      durationMs,
      timing: [],
      plannedDurationMs: 30_000,
      fitWarning: null,
      jobId: null,
      failureCode: null,
      createdAt: now,
      updatedAt: new Date(now.getTime() + index),
    })),
  );
}

describeWithPostgres("reconcileLessonSceneDurations (Postgres)", () => {
  let database: TestDatabase | undefined;

  const reconcile = () =>
    reconcileLessonSceneDurations({
      database: database!.client,
      ownerUserId,
      projectId,
      correlationId: "019ffbf1-0000-7000-8000-000000000084",
      now,
    });

  const specRow = async () =>
    (
      await database!.client
        .select()
        .from(lessonSpecs)
        .where(eq(lessonSpecs.id, lessonSpecId))
    )[0]!;

  const sceneDurations = async () =>
    Object.fromEntries(
      (
        await database!.client
          .select()
          .from(scenes)
          .where(eq(scenes.lessonSpecId, lessonSpecId))
      ).map((row) => [row.id, row.durationSeconds]),
    );

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seed(database!.client);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("re-times both scenes and the lesson total from the measured audio", async () => {
    // 30s scenes whose audio came back at 33.4s and 27.6s: on-budget narration
    // that the old exact-equality rules would have blocked in both directions.
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    const result = await reconcile();
    expect(result.status).toBe("reconciled");
    expect(await sceneDurations()).toEqual({ [sceneA]: 33, [sceneB]: 28 });
    const spec = await specRow();
    expect(spec.totalDurationSeconds).toBe(61);
    expect(spec.revision).toBe(1);
    // Every scene now sits inside the audio-fit tolerance of its own audio.
    for (const outcome of result.outcomes!)
      expect(
        Math.abs(
          outcome.appliedDurationSeconds * 1_000 -
            outcome.measuredAudioDurationMs,
        ),
      ).toBeLessThanOrEqual(sceneAudioFitToleranceMs);
  });

  it("keeps the scene payload and the normalized rows in step", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    await reconcile();
    const spec = await specRow();
    const payload = spec.payload as {
      scenes: {
        id: string;
        durationSeconds: number;
        scene: { durationSeconds: number };
      }[];
    };
    const rows = await sceneDurations();
    for (const scene of payload.scenes) {
      // A drift between these three is exactly what scene_duration_out_of_range
      // blocks on, so reconciliation must move all of them together.
      expect(scene.durationSeconds).toBe(rows[scene.id]);
      expect(scene.scene.durationSeconds).toBe(rows[scene.id]);
    }
    expect(spec.contentHash).not.toBe("d".repeat(64));
  });

  it("is idempotent: a second run changes no row and cuts no revision", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    await reconcile();
    const before = await specRow();
    const second = await reconcile();
    const after = await specRow();
    expect(second.status).toBe("unchanged");
    expect(after.revision).toBe(before.revision);
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(await sceneDurations()).toEqual({ [sceneA]: 33, [sceneB]: 28 });
  });

  it("writes nothing when the audio already matches the planned durations", async () => {
    await seedAudio(database!.client, { [sceneA]: 30_000, [sceneB]: 30_000 });
    expect((await reconcile()).status).toBe("unchanged");
    expect((await specRow()).revision).toBe(0);
  });

  it("waits for every scene rather than re-timing a partly generated lesson", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400 });
    expect((await reconcile()).status).toBe("not_ready");
    expect((await specRow()).revision).toBe(0);
    // Audio that exists but was never measured is equally not ready.
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: null });
    expect((await reconcile()).status).toBe("not_ready");
    expect((await specRow()).revision).toBe(0);
  });

  it("drops the reconciliation rather than overwriting a concurrent scene edit", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    const edit = database!.client
      .update(lessonSpecs)
      .set({ revision: 1, updatedAt: now })
      .where(eq(lessonSpecs.id, lessonSpecId));
    // The teacher edit lands between this reconciliation's read and its write.
    const [, result] = await Promise.all([edit, reconcile()]);
    const spec = await specRow();
    if (result.status === "conflict") {
      expect(spec.revision).toBe(1);
      expect(await sceneDurations()).toEqual({ [sceneA]: 30, [sceneB]: 30 });
    } else {
      // The reconciliation read the pre-edit revision and won the race; either
      // way exactly one of the two writes lands, never a merge of both.
      expect(result.status).toBe("reconciled");
      expect(spec.revision).toBe(1);
    }
  });

  it("returns conflict and writes nothing when the revision moved under it", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    // The stored payload still reads revision 0, but the row's revision column
    // has already advanced: exactly the state a concurrent storyboard edit
    // leaves behind. The guarded write must match no row.
    await database!.client
      .update(lessonSpecs)
      .set({ revision: 2, updatedAt: now })
      .where(eq(lessonSpecs.id, lessonSpecId));
    const result = await reconcile();
    expect(result.status).toBe("conflict");
    expect((await specRow()).revision).toBe(2);
    expect(await sceneDurations()).toEqual({ [sceneA]: 30, [sceneB]: 30 });
  });

  it("never reads or writes another tenant's scenes", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    const foreign = await reconcileLessonSceneDurations({
      database: database!.client,
      ownerUserId: otherOwnerUserId,
      projectId,
      correlationId: "019ffbf1-0000-7000-8000-000000000084",
      now,
    });
    expect(foreign.status).toBe("not_ready");
    expect((await specRow()).revision).toBe(0);
    expect(await sceneDurations()).toEqual({ [sceneA]: 30, [sceneB]: 30 });
  });

  it("ignores audio rows belonging to another tenant", async () => {
    await seedAudio(
      database!.client,
      { [sceneA]: 33_400, [sceneB]: 27_600 },
      { ownerUserId: otherOwnerUserId },
    );
    expect((await reconcile()).status).toBe("not_ready");
    expect((await specRow()).revision).toBe(0);
  });

  it("clamps audio that cannot fit the per-scene bounds and reports the scene", async () => {
    await seedAudio(database!.client, { [sceneA]: 75_000, [sceneB]: 27_600 });
    const result = await reconcile();
    expect(result.status).toBe("reconciled");
    const unfittable = result.outcomes!.filter((outcome) => outcome.unfittable);
    expect(unfittable).toHaveLength(1);
    expect(unfittable[0]).toMatchObject({
      stableSceneId: sceneA,
      appliedDurationSeconds: 60,
      clampReason: "scene_maximum",
    });
    // The clamped duration is persisted, so validation raises the blocking
    // overrun against the same scene the teacher sees named in preflight.
    expect((await sceneDurations())[sceneA]).toBe(60);
  });

  it("records the per-scene outcome as an auditable system event", async () => {
    await seedAudio(database!.client, { [sceneA]: 33_400, [sceneB]: 27_600 });
    await reconcile();
    const events = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.projectId, projectId));
    const reconciliation = events.find(
      (event) =>
        (event.metadata as { operation?: string } | null)?.operation ===
        "duration_reconciliation",
    );
    expect(reconciliation).toBeDefined();
    expect(reconciliation!.actorType).toBe("system");
    const metadata = reconciliation!.metadata as {
      scenes: { stableSceneId: string; appliedDurationSeconds: number }[];
      invalidatedScope: string[];
    };
    expect(metadata.invalidatedScope).toEqual([
      "preview",
      "render",
      "validation",
    ]);
    expect(metadata.scenes).toHaveLength(2);
  });

  it("keeps the reconciled total inside the lesson tolerance band", async () => {
    await seedAudio(database!.client, { [sceneA]: 31_400, [sceneB]: 28_600 });
    await reconcile();
    const spec = await specRow();
    const planned = storyboardPayload().totalDurationSeconds;
    expect(Math.abs(spec.totalDurationSeconds - planned)).toBeLessThanOrEqual(
      storyboardDurationToleranceSeconds(planned),
    );
  });
});
