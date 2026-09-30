import type { Identifier } from "@avlp/config";
import {
  captionCues,
  captionTracks,
  sceneAudio,
  scenes,
  type DatabaseExecutor,
} from "@avlp/database";
import type { CinemaCaptionMs } from "@avlp/schemas";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

/**
 * Each scene's current caption cues (scene-relative milliseconds), by stable
 * scene ID, chosen exactly as a render chooses them: the scene's latest ready
 * narration audio, then that audio's latest ready caption track. A scene
 * without ready audio or captions is absent. Tenant-scoped on every table.
 */
export async function loadSceneCaptionsMs(
  db: DatabaseExecutor,
  scope: Readonly<{ ownerUserId: Identifier; projectId: Identifier }>,
  lessonSpecId: string,
): Promise<Map<string, CinemaCaptionMs[]>> {
  const audioRows = await db
    .select({ stableSceneId: scenes.stableSceneId, audioId: sceneAudio.id })
    .from(scenes)
    .innerJoin(sceneAudio, eq(sceneAudio.sceneId, scenes.id))
    .where(
      and(
        eq(scenes.ownerUserId, scope.ownerUserId),
        eq(scenes.projectId, scope.projectId),
        eq(scenes.lessonSpecId, lessonSpecId),
        eq(sceneAudio.ownerUserId, scope.ownerUserId),
        eq(sceneAudio.projectId, scope.projectId),
        eq(sceneAudio.status, "ready"),
      ),
    )
    .orderBy(desc(sceneAudio.updatedAt));
  const audioBySceneId = new Map<string, string>();
  for (const row of audioRows)
    if (!audioBySceneId.has(row.stableSceneId))
      audioBySceneId.set(row.stableSceneId, row.audioId);
  if (audioBySceneId.size === 0) return new Map();
  const trackRows = await db
    .select({ trackId: captionTracks.id, audioId: captionTracks.sceneAudioId })
    .from(captionTracks)
    .where(
      and(
        eq(captionTracks.ownerUserId, scope.ownerUserId),
        eq(captionTracks.projectId, scope.projectId),
        eq(captionTracks.status, "ready"),
        inArray(captionTracks.sceneAudioId, [...audioBySceneId.values()]),
      ),
    )
    .orderBy(desc(captionTracks.updatedAt));
  const trackByAudioId = new Map<string, string>();
  for (const row of trackRows)
    if (!trackByAudioId.has(row.audioId)) trackByAudioId.set(row.audioId, row.trackId);
  const result = new Map<string, CinemaCaptionMs[]>();
  for (const [sceneId, audioId] of audioBySceneId) {
    const trackId = trackByAudioId.get(audioId);
    if (trackId === undefined) continue;
    const cues = await db
      .select({ startMs: captionCues.startMs, endMs: captionCues.endMs, text: captionCues.text })
      .from(captionCues)
      .where(
        and(
          eq(captionCues.ownerUserId, scope.ownerUserId),
          eq(captionCues.projectId, scope.projectId),
          eq(captionCues.trackId, trackId),
        ),
      )
      .orderBy(asc(captionCues.position));
    if (cues.length > 0) result.set(sceneId, cues);
  }
  return result;
}
