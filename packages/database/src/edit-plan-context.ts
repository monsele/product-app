import {
  lessonStoryboardSchema,
  type EditPlanSceneContext,
  type LessonStoryboard,
} from "@avlp/schemas";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "./client.js";
import { lessonSpecs, narrationBlocks, narrationSets, sceneAudio } from "./schema.js";

/**
 * ST-115. Everything an edit plan is checked against, read for one tenant:
 * the storyboard draft, each scene's measured narration (rounded up to whole
 * seconds, ADR-004), the working narration blocks with the scene that covers
 * each, and whether that narration can still be regenerated. Shared by the
 * planning job and the API, so a plan is validated against the same view of
 * the lesson in both places.
 */
export type EditPlanStoryboardContext = Readonly<{
  lessonSpecId: string;
  revision: number;
  storyboard: LessonStoryboard;
  scenes: readonly EditPlanSceneContext[];
  narrationBlocks: readonly Readonly<{ blockId: string; sceneId: string | null }>[];
  narrationEditable: boolean;
  narrationSetRevision: number | null;
}>;

/** The draft storyboard a teacher edits, or undefined when there is none. */
export async function loadEditPlanStoryboardContext(
  executor: DatabaseExecutor,
  scope: Readonly<{ ownerUserId: string; projectId: string }>,
  lessonSpecId?: string,
): Promise<EditPlanStoryboardContext | undefined> {
  const [row] = await executor
    .select({
      id: lessonSpecs.id,
      revision: lessonSpecs.revision,
      payload: lessonSpecs.payload,
    })
    .from(lessonSpecs)
    .where(
      and(
        eq(lessonSpecs.ownerUserId, scope.ownerUserId),
        eq(lessonSpecs.projectId, scope.projectId),
        eq(lessonSpecs.status, "draft"),
        ...(lessonSpecId === undefined ? [] : [eq(lessonSpecs.id, lessonSpecId)]),
      ),
    )
    .orderBy(desc(lessonSpecs.generatedAt))
    .limit(1);
  if (row === undefined) return undefined;
  const storyboard = lessonStoryboardSchema.parse(row.payload);
  const sceneRowIds = storyboard.scenes.map((scene) => scene.id);
  const audio =
    sceneRowIds.length === 0
      ? []
      : await executor
          .select({
            sceneId: sceneAudio.sceneId,
            durationMs: sceneAudio.durationMs,
          })
          .from(sceneAudio)
          .where(
            and(
              eq(sceneAudio.ownerUserId, scope.ownerUserId),
              eq(sceneAudio.projectId, scope.projectId),
              eq(sceneAudio.status, "ready"),
              inArray(sceneAudio.sceneId, sceneRowIds),
            ),
          )
          .orderBy(desc(sceneAudio.updatedAt));
  const measured = new Map<string, number>();
  for (const entry of audio)
    if (
      !measured.has(entry.sceneId) &&
      entry.durationMs !== null &&
      entry.durationMs > 0
    )
      measured.set(entry.sceneId, Math.ceil(entry.durationMs / 1000));
  const [narrationSet] = await executor
    .select({ status: narrationSets.status, revision: narrationSets.revision })
    .from(narrationSets)
    .where(
      and(
        eq(narrationSets.id, storyboard.basedOnNarrationSetId),
        eq(narrationSets.ownerUserId, scope.ownerUserId),
        eq(narrationSets.projectId, scope.projectId),
      ),
    )
    .limit(1);
  const blocks = await executor
    .select({ id: narrationBlocks.id })
    .from(narrationBlocks)
    .where(
      and(
        eq(narrationBlocks.setId, storyboard.basedOnNarrationSetId),
        eq(narrationBlocks.ownerUserId, scope.ownerUserId),
        eq(narrationBlocks.projectId, scope.projectId),
      ),
    )
    .orderBy(narrationBlocks.order);
  const sceneByBlock = new Map<string, string>();
  for (const scene of storyboard.scenes)
    for (const blockId of scene.narrationBlockIds)
      if (!sceneByBlock.has(blockId)) sceneByBlock.set(blockId, scene.stableSceneId);
  const narrationEditable = narrationSet?.status === "draft";
  return {
    lessonSpecId: row.id,
    revision: row.revision,
    storyboard,
    scenes: [...storyboard.scenes]
      .sort((left, right) => left.order - right.order)
      .map((scene) => ({
        stableSceneId: scene.stableSceneId,
        order: scene.order,
        scene: scene.scene,
        measuredSeconds: measured.get(scene.id) ?? null,
      })),
    narrationBlocks: blocks.map((block) => ({
      blockId: block.id,
      sceneId: sceneByBlock.get(block.id) ?? null,
    })),
    narrationEditable,
    narrationSetRevision: narrationEditable ? (narrationSet?.revision ?? null) : null,
  };
}
