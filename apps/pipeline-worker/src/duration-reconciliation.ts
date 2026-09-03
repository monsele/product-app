import {
  computeLessonStoryboardContentHash,
  computeLessonStoryboardSceneContentHash,
  type Identifier,
} from "@avlp/config";
import {
  lessonSpecs,
  sceneAudio,
  scenes,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  lessonStoryboardSchema,
  reconcileSceneDurations,
  type LessonStoryboard,
  type LessonStoryboardScene,
  type SceneDurationReconciliation,
} from "@avlp/schemas";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

/**
 * ST-084 — re-time scenes from the audio that was actually synthesized.
 *
 * Scene durations are allocated from a word budget before any audio exists, so
 * treating them as a prediction a TTS engine must hit makes on-budget narration
 * fail preflight with no remedy the teacher can apply. Speech is the hard
 * constraint and visuals are elastic, so once every scene's audio is ready the
 * durations move onto the measured audio instead.
 *
 * The step is deterministic and idempotent: it derives the target durations
 * from persisted `scene_audio.duration_ms` alone, makes no provider call, and
 * writes nothing when every scene already holds its reconciled duration. It
 * runs before a lesson version is cut, so no immutable version is ever mutated.
 */
export type LessonDurationReconciliationResult = Readonly<{
  status: "reconciled" | "unchanged" | "not_ready" | "conflict";
  lessonSpecId?: Identifier;
  revision?: number;
  outcomes?: readonly SceneDurationReconciliation[];
}>;

export async function reconcileLessonSceneDurations(input: {
  database: DatabaseClient;
  ownerUserId: Identifier;
  projectId: Identifier;
  correlationId: Identifier;
  now: Date;
}): Promise<LessonDurationReconciliationResult> {
  const spec = await workingLessonSpec(input.database, input);
  if (spec === undefined) return { status: "not_ready" };
  const storyboardResult = lessonStoryboardSchema.safeParse(spec.payload);
  if (!storyboardResult.success) return { status: "not_ready" };
  const storyboard = storyboardResult.data;
  const measured = await measuredAudioBySceneId(input.database, {
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    lessonSpecId: spec.id as Identifier,
  });
  // Reconciling a partially generated lesson would re-time some scenes against
  // audio and leave the rest on their planned durations, so every scene must
  // have a measured duration before anything is written.
  const pending = storyboard.scenes.some(
    (scene) => measured.get(scene.id) === undefined,
  );
  if (pending) return { status: "not_ready" };
  const outcomes = reconcileSceneDurations(
    storyboard.scenes.map((scene) => ({
      stableSceneId: scene.stableSceneId,
      durationSeconds: scene.durationSeconds,
      measuredAudioDurationMs: measured.get(scene.id)!,
    })),
  );
  const appliedByStableSceneId = new Map(
    outcomes.map((outcome) => [
      outcome.stableSceneId,
      outcome.appliedDurationSeconds,
    ]),
  );
  if (
    outcomes.every(
      (outcome) =>
        outcome.appliedDurationSeconds === outcome.previousDurationSeconds,
    )
  )
    return {
      status: "unchanged",
      lessonSpecId: spec.id as Identifier,
      revision: spec.revision,
      outcomes,
    };
  const nextScenes = storyboard.scenes.map((scene) =>
    retimeScene(scene, appliedByStableSceneId.get(scene.stableSceneId)!),
  );
  const next = rebuildStoryboard(storyboard, nextScenes);

  let applied = false;
  await input.database.transaction(async (transaction) => {
    // The revision guard is the whole concurrency story: a teacher edit that
    // lands between the read above and this write has already bumped the
    // revision, so this update matches no row and the reconciliation is
    // dropped rather than overwriting the edit. The next audio completion or
    // an explicit rerun reconciles the edited storyboard instead.
    const [updated] = await transaction
      .update(lessonSpecs)
      .set({
        revision: next.revision,
        totalDurationSeconds: next.totalDurationSeconds,
        contentHash: next.contentHash,
        payload: next,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(lessonSpecs.id, spec.id),
          eq(lessonSpecs.ownerUserId, input.ownerUserId),
          eq(lessonSpecs.projectId, input.projectId),
          eq(lessonSpecs.revision, storyboard.revision),
        ),
      )
      .returning({ id: lessonSpecs.id });
    if (updated === undefined) return;
    for (const scene of nextScenes)
      await transaction
        .update(scenes)
        .set({
          durationSeconds: scene.durationSeconds,
          sceneJson: scene.scene,
          revision: sql`${scenes.revision} + 1`,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(scenes.id, scene.id),
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
            eq(scenes.lessonSpecId, spec.id),
          ),
        );
    await new PostgresAuditWriter(transaction).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: { type: "system" },
      eventType: "storyboard.edited",
      target: { type: "lesson_spec", id: spec.id },
      correlationId: input.correlationId,
      metadata: {
        operation: "duration_reconciliation",
        lessonSpecRevision: next.revision,
        invalidatedScope: ["preview", "render", "validation"],
        scenes: outcomes.map((outcome) => ({
          stableSceneId: outcome.stableSceneId,
          previousDurationSeconds: outcome.previousDurationSeconds,
          measuredAudioDurationMs: outcome.measuredAudioDurationMs,
          appliedDurationSeconds: outcome.appliedDurationSeconds,
          clampReason: outcome.clampReason,
          unfittable: outcome.unfittable,
        })),
      },
      occurredAt: input.now,
    });
    applied = true;
  });
  if (!applied) return { status: "conflict" };
  return {
    status: "reconciled",
    lessonSpecId: spec.id as Identifier,
    revision: next.revision,
    outcomes,
  };
}

function retimeScene(
  scene: LessonStoryboardScene,
  durationSeconds: number,
): LessonStoryboardScene {
  return {
    ...scene,
    durationSeconds,
    scene: { ...scene.scene, durationSeconds },
  };
}

function rebuildStoryboard(
  storyboard: LessonStoryboard,
  nextScenes: readonly LessonStoryboardScene[],
): LessonStoryboard {
  const totalDurationSeconds = nextScenes.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0,
  );
  return lessonStoryboardSchema.parse({
    ...storyboard,
    revision: storyboard.revision + 1,
    totalDurationSeconds,
    contentHash: computeLessonStoryboardContentHash({
      totalDurationSeconds,
      objectiveIds: storyboard.objectiveIds,
      scenes: nextScenes.map((scene) => ({
        contentHash: computeLessonStoryboardSceneContentHash({
          template: scene.scene.template,
          title: scene.scene.title,
          narration: scene.scene.narration,
          durationSeconds: scene.scene.durationSeconds,
          onScreenText: scene.scene.onScreenText,
          transition: scene.scene.transition,
          visual: scene.scene.visual,
          sourceRefs: scene.scene.sourceRefs,
          generatedAdditions: scene.scene.generatedAdditions,
          assetBindings: scene.scene.assetBindings,
        }),
        narrationBlockIds: scene.narrationBlockIds,
        assetRequirements: scene.assetRequirements,
      })),
    }),
    scenes: nextScenes,
  });
}

async function workingLessonSpec(
  database: DatabaseExecutor,
  scope: { ownerUserId: Identifier; projectId: Identifier },
) {
  const bySpecStatus = async (status: "draft" | "approved") =>
    (
      await database
        .select()
        .from(lessonSpecs)
        .where(
          and(
            eq(lessonSpecs.ownerUserId, scope.ownerUserId),
            eq(lessonSpecs.projectId, scope.projectId),
            eq(lessonSpecs.status, status),
          ),
        )
        .orderBy(desc(lessonSpecs.generatedAt))
        .limit(1)
    )[0];
  return (await bySpecStatus("draft")) ?? (await bySpecStatus("approved"));
}

/** Ready audio durations for one lesson's scenes, keyed by scene row id. */
async function measuredAudioBySceneId(
  database: DatabaseExecutor,
  scope: {
    ownerUserId: Identifier;
    projectId: Identifier;
    lessonSpecId: Identifier;
  },
): Promise<Map<string, number>> {
  const sceneRows = await database
    .select({ id: scenes.id })
    .from(scenes)
    .where(
      and(
        eq(scenes.ownerUserId, scope.ownerUserId),
        eq(scenes.projectId, scope.projectId),
        eq(scenes.lessonSpecId, scope.lessonSpecId),
      ),
    );
  if (sceneRows.length === 0) return new Map();
  const audioRows = await database
    .select({
      sceneId: sceneAudio.sceneId,
      status: sceneAudio.status,
      durationMs: sceneAudio.durationMs,
      updatedAt: sceneAudio.updatedAt,
    })
    .from(sceneAudio)
    .where(
      and(
        eq(sceneAudio.ownerUserId, scope.ownerUserId),
        eq(sceneAudio.projectId, scope.projectId),
        inArray(
          sceneAudio.sceneId,
          sceneRows.map((scene) => scene.id),
        ),
      ),
    )
    .orderBy(desc(sceneAudio.updatedAt));
  const measured = new Map<string, number>();
  const seen = new Set<string>();
  for (const audio of audioRows) {
    if (seen.has(audio.sceneId)) continue;
    seen.add(audio.sceneId);
    if (audio.status !== "ready" || audio.durationMs === null) continue;
    measured.set(audio.sceneId, audio.durationMs);
  }
  return measured;
}
