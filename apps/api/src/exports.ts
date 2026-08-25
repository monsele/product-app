import { createHash } from "node:crypto";
import {
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  lessonVersions,
  renderJobs,
  renderedVideos,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  exportFormatSchema,
  exportTypeSchema,
  lessonSpecSchema,
  versionExportManifestSchema,
  type VersionExportManifest,
} from "@avlp/schemas";
import type { AuthorizedProjectStorage } from "@avlp/storage";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { serializeCaptionExport } from "./caption-export.js";

const manifestSchema = z
  .object({
    captions: z
      .array(
        z
          .object({
            startFrame: z.number().int().nonnegative(),
            endFrame: z.number().int().positive(),
            text: z.string().trim().min(1).max(1_000),
          })
          .strict()
          .superRefine((cue, context) => {
            if (cue.endFrame <= cue.startFrame)
              context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endFrame"],
                message: "Caption end frame must be after its start frame.",
              });
          }),
      )
      .max(100_000),
    profile: z.object({ fps: z.literal(30) }).passthrough(),
  })
  .passthrough();
const snapshotSchema = z
  .object({
    lessonSpec: lessonSpecSchema,
    narration: z.object({
      blocks: z
        .array(
          z
            .object({
              order: z.number().int().positive(),
              text: z.string().trim().min(1).max(10_000),
            })
            .passthrough(),
        )
        .min(1)
        .max(1_000),
    }),
  })
  .passthrough();

export type ExportType = z.infer<typeof exportTypeSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportResult = Readonly<{
  body: string;
  contentHash: string;
  contentType: string;
  fileName: string;
  lessonVersionId: Identifier;
}>;

type Scope = { ownerUserId: Identifier; projectId: Identifier };

/** Builds bounded supporting files from immutable version/render snapshots only. */
export class ExportService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly storage: Pick<
      AuthorizedProjectStorage,
      "createSignedDownload"
    >,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async signedVideoDownload(
    input: Scope & { renderId: Identifier; correlationId: Identifier },
  ): Promise<{ expiresAt: string; url: string }> {
    const [row] = await this.database
      .select({
        render: { id: renderJobs.id },
        video: renderedVideos,
        version: lessonVersions,
      })
      .from(renderJobs)
      .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
      .innerJoin(renderedVideos, eq(renderedVideos.renderJobId, renderJobs.id))
      .innerJoin(
        lessonVersions,
        eq(lessonVersions.id, renderJobs.lessonVersionId),
      )
      .where(
        and(
          eq(renderJobs.id, input.renderId),
          eq(renderJobs.ownerUserId, input.ownerUserId),
          eq(renderJobs.projectId, input.projectId),
          eq(jobs.state, "succeeded"),
          eq(renderedVideos.ownerUserId, input.ownerUserId),
          eq(renderedVideos.projectId, input.projectId),
          eq(renderedVideos.width, 1920),
          eq(renderedVideos.height, 1080),
          eq(renderedVideos.fps, 30),
          eq(renderedVideos.videoCodec, "h264"),
          eq(renderedVideos.audioCodec, "aac"),
        ),
      )
      .limit(1);
    if (!row)
      throw new PublicError(
        "not_found",
        "The requested render is not available.",
        404,
      );
    const expiresInSeconds = 300;
    const signed = await this.storage.createSignedDownload(input.ownerUserId, {
      projectId: input.projectId,
      object: {
        kind: "render_video",
        renderJobId: row.render.id as Identifier,
      },
      expiresInSeconds,
      downloadFileName:
        safeFileStem(row.version.snapshot, row.version.versionNumber) + ".mp4",
    });
    await this.audit(
      input,
      "video",
      row.video.id as Identifier,
      row.version.id as Identifier,
      row.version.contentHash,
    );
    return {
      url: signed.url,
      expiresAt: serializeUtcTimestamp(
        new Date(this.now().getTime() + expiresInSeconds * 1_000),
      ),
    };
  }

  public async build(
    input: Scope & {
      correlationId: Identifier;
      format: string;
      lessonVersionId: Identifier;
      type: string;
    },
  ): Promise<ExportResult> {
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
    const snapshot = parseSnapshot(version.snapshot);
    const manifest = versionExportManifest(version.id as Identifier, snapshot);
    const type = exportTypeSchema.parse(input.type);
    const format = exportFormatSchema.parse(input.format);
    const result =
      type === "captions"
        ? await this.captions(input, version, format)
        : type === "narration"
          ? narration(manifest, format)
          : storyboard(manifest, format);
    await this.audit(
      input,
      type,
      version.id as Identifier,
      version.id as Identifier,
      result.contentHash,
    );
    return result;
  }

  private async captions(
    input: Scope,
    version: typeof lessonVersions.$inferSelect,
    format: ExportFormat,
  ): Promise<ExportResult> {
    if (format !== "srt" && format !== "vtt")
      throw new PublicError(
        "validation_failed",
        "Captions must be exported as SRT or VTT.",
        400,
      );
    const [render] = await this.database
      .select({ manifest: renderJobs.manifest })
      .from(renderJobs)
      .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
      .innerJoin(renderedVideos, eq(renderedVideos.renderJobId, renderJobs.id))
      .where(
        and(
          eq(renderJobs.ownerUserId, input.ownerUserId),
          eq(renderJobs.projectId, input.projectId),
          eq(renderJobs.lessonVersionId, version.id),
          eq(jobs.state, "succeeded"),
          eq(renderedVideos.ownerUserId, input.ownerUserId),
          eq(renderedVideos.projectId, input.projectId),
          eq(renderedVideos.width, 1920),
          eq(renderedVideos.height, 1080),
          eq(renderedVideos.fps, 30),
          eq(renderedVideos.videoCodec, "h264"),
          eq(renderedVideos.audioCodec, "aac"),
        ),
      )
      .orderBy(desc(renderJobs.createdAt))
      .limit(1);
    if (!render)
      throw new PublicError(
        "bad_request",
        "Captions are available after this lesson version has a completed render.",
        409,
      );
    const manifest = manifestSchema.safeParse(render.manifest);
    if (!manifest.success)
      throw new PublicError(
        "bad_request",
        "The completed render has an invalid caption manifest.",
        409,
      );
    const cues = manifest.data.captions.map((cue) => ({
      startMs: Math.round((cue.startFrame / manifest.data.profile.fps) * 1_000),
      endMs: Math.round((cue.endFrame / manifest.data.profile.fps) * 1_000),
      text: cue.text,
    }));
    const body = serializeCaptionExport(format, cues);
    return result(
      version.id as Identifier,
      body,
      format === "srt"
        ? "application/x-subrip; charset=utf-8"
        : "text/vtt; charset=utf-8",
      `${safeFileStem(version.snapshot, version.versionNumber)}.${format}`,
    );
  }

  private async audit(
    input: Scope & { correlationId: Identifier },
    type: "video" | ExportType,
    targetId: Identifier,
    lessonVersionId: Identifier,
    contentHash: string,
  ): Promise<void> {
    await new PostgresAuditWriter(this.database).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: { type: "user", userId: input.ownerUserId },
      eventType: "export.downloaded",
      target: {
        type: type === "video" ? "rendered_video" : "lesson_version",
        id: targetId,
      },
      correlationId: input.correlationId,
      metadata: { exportType: type, lessonVersionId, contentHash },
      occurredAt: this.now(),
    });
  }
}

function parseSnapshot(value: unknown) {
  const parsed = snapshotSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new PublicError(
    "bad_request",
    "This lesson version has an incompatible export snapshot.",
    409,
  );
}

function narration(
  manifest: VersionExportManifest,
  format: ExportFormat,
): ExportResult {
  if (format !== "text" && format !== "markdown")
    throw new PublicError(
      "validation_failed",
      "Narration must be exported as text or Markdown.",
      400,
    );
  const blocks = [...manifest.narration]
    .sort((left, right) => left.order - right.order)
    .map((block) => block.text);
  const body =
    format === "markdown"
      ? `# ${manifest.title}\n\n${blocks.join("\n\n")}`
      : blocks.join("\n\n") + "\n";
  return result(
    manifest.lessonVersionId,
    body,
    "text/plain; charset=utf-8",
    `${safeStem(manifest.title)}-narration.${format === "text" ? "txt" : "md"}`,
  );
}

function storyboard(
  manifest: VersionExportManifest,
  format: ExportFormat,
): ExportResult {
  if (format !== "markdown" && format !== "json")
    throw new PublicError(
      "validation_failed",
      "Storyboard must be exported as Markdown or JSON.",
      400,
    );
  const document = {
    schemaVersion: "storyboard-export-v1",
    lessonVersionId: manifest.lessonVersionId,
    title: manifest.title,
    subject: manifest.subject,
    scenes: [...manifest.scenes].sort(
      (left, right) => left.number - right.number,
    ),
  };
  const body =
    format === "json"
      ? JSON.stringify(document, null, 2) + "\n"
      : `# ${document.title} storyboard\n\n${document.scenes.map((scene) => `## Scene ${scene.number}: ${scene.template}\n\nDuration: ${scene.durationSeconds} seconds\n\nOn-screen text: ${scene.onScreenText.join(" | ")}\n\nNarration: ${scene.narration}`).join("\n\n")}\n`;
  return result(
    manifest.lessonVersionId,
    body,
    format === "json"
      ? "application/json; charset=utf-8"
      : "text/markdown; charset=utf-8",
    `${safeStem(document.title)}-storyboard.${format === "json" ? "json" : "md"}`,
  );
}

function result(
  lessonVersionId: Identifier,
  body: string,
  contentType: string,
  fileName: string,
): ExportResult {
  return {
    lessonVersionId,
    contentHash: createHash("sha256").update(body).digest("hex"),
    body,
    contentType,
    fileName,
  };
}
function safeFileStem(snapshot: unknown, versionNumber: number): string {
  const title = snapshotSchema.safeParse(snapshot).success
    ? snapshotSchema.parse(snapshot).lessonSpec.title
    : "lesson";
  return `${safeStem(title)}-v${versionNumber}`;
}
function versionExportManifest(
  lessonVersionId: Identifier,
  snapshot: z.infer<typeof snapshotSchema>,
): VersionExportManifest {
  return versionExportManifestSchema.parse({
    lessonVersionId,
    title: snapshot.lessonSpec.title,
    subject: snapshot.lessonSpec.subject,
    narration: snapshot.narration.blocks.map((block) => ({
      order: block.order,
      text: block.text,
    })),
    scenes: snapshot.lessonSpec.scenes.map((scene) => ({
      number: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narration: scene.narration,
      onScreenText: scene.onScreenText,
    })),
  });
}
function safeStem(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized.length === 0 ? "lesson" : normalized.slice(0, 80);
}
