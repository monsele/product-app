import { createHash } from "node:crypto";
import { PublicError, type Identifier } from "@avlp/config";
import {
  captionCues,
  captionTracks,
  lessonVersions,
  sceneAudio,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { and, asc, eq, inArray } from "drizzle-orm";

export type CaptionExportFormat = "srt" | "vtt";
export type CaptionExportResult = Readonly<{
  lessonVersionId: Identifier;
  contentHash: string;
  format: CaptionExportFormat;
  body: string;
}>;

/** Version-bound builder consumed by ST-069's authenticated download route. */
export class CaptionExportService {
  public constructor(private readonly database: DatabaseClient) {}
  public async build(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    lessonVersionId: Identifier;
    format: CaptionExportFormat;
  }): Promise<CaptionExportResult> {
    const [version] = await this.database
      .select()
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.id, input.lessonVersionId),
          eq(lessonVersions.ownerUserId, input.ownerUserId),
          eq(lessonVersions.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (!version)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    const versionScenes = await this.database
      .select({ id: scenes.id, order: scenes.order })
      .from(scenes)
      .where(
        and(
          eq(scenes.lessonSpecId, version.lessonSpecId),
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
        ),
      )
      .orderBy(asc(scenes.order));
    if (versionScenes.length === 0)
      throw new PublicError(
        "bad_request",
        "This lesson version has no captionable scenes.",
        409,
      );
    const audioRows = await this.database
      .select({ id: sceneAudio.id, sceneId: sceneAudio.sceneId })
      .from(sceneAudio)
      .where(
        and(
          eq(sceneAudio.ownerUserId, input.ownerUserId),
          eq(sceneAudio.projectId, input.projectId),
          eq(sceneAudio.status, "ready"),
          inArray(
            sceneAudio.sceneId,
            versionScenes.map((scene) => scene.id),
          ),
        ),
      );
    const cues =
      audioRows.length === 0
        ? []
        : await this.database
            .select({
              sceneId: sceneAudio.sceneId,
              startMs: captionCues.startMs,
              endMs: captionCues.endMs,
              text: captionCues.text,
            })
            .from(captionTracks)
            .innerJoin(
              sceneAudio,
              eq(sceneAudio.id, captionTracks.sceneAudioId),
            )
            .innerJoin(captionCues, eq(captionCues.trackId, captionTracks.id))
            .where(
              and(
                eq(captionTracks.ownerUserId, input.ownerUserId),
                eq(captionTracks.projectId, input.projectId),
                eq(captionTracks.status, "ready"),
                inArray(
                  captionTracks.sceneAudioId,
                  audioRows.map((audio) => audio.id),
                ),
              ),
            )
            .orderBy(asc(captionCues.position));
    if (cues.length === 0)
      throw new PublicError(
        "bad_request",
        "Captions are missing or stale for this lesson version.",
        409,
      );
    const ordered = cues.sort(
      (left, right) =>
        versionScenes.findIndex((scene) => scene.id === left.sceneId) -
          versionScenes.findIndex((scene) => scene.id === right.sceneId) ||
        left.startMs - right.startMs,
    );
    let offset = 0;
    const rows = ordered.map((cue, index) => {
      const row = {
        startMs: cue.startMs + offset,
        endMs: cue.endMs + offset,
        text: cue.text,
      };
      if (
        index === ordered.length - 1 ||
        ordered[index + 1]!.sceneId !== cue.sceneId
      )
        offset = row.endMs;
      return row;
    });
    const body = input.format === "srt" ? srt(rows) : vtt(rows);
    return {
      lessonVersionId: input.lessonVersionId,
      format: input.format,
      body,
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  }
}
const time = (ms: number, decimal: "," | ".") =>
  `${String(Math.floor(ms / 3_600_000)).padStart(2, "0")}:${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1_000) % 60).padStart(2, "0")}${decimal}${String(ms % 1_000).padStart(3, "0")}`;
const srt = (
  cues: readonly { startMs: number; endMs: number; text: string }[],
) =>
  `${cues.map((cue, index) => `${index + 1}\n${time(cue.startMs, ",")} --> ${time(cue.endMs, ",")}\n${cue.text}`).join("\n\n")}\n`;
const vtt = (
  cues: readonly { startMs: number; endMs: number; text: string }[],
) =>
  `WEBVTT\n\n${cues.map((cue) => `${time(cue.startMs, ".")} --> ${time(cue.endMs, ".")}\n${cue.text}`).join("\n\n")}\n`;
