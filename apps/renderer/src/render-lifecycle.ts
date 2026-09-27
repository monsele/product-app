import { createId } from "@avlp/config";
import {
  jobs,
  renderJobs,
  renderedVideos,
  renderReviewReports,
  renderThumbnails,
  type DatabaseClient,
  and,
  eq,
} from "@avlp/database";
import type { JobHandlerContext } from "@avlp/jobs";
import type { RenderReviewReport } from "@avlp/schemas";
import type { RenderJobResult } from "./contracts.js";

/** Persists only verified immutable artifacts. It deliberately checks the
 * generic job lease state so late worker output cannot reactivate cancellation. */
export class PostgresRenderLifecycle {
  public constructor(private readonly database: DatabaseClient) {}

  /**
   * ST-103. Upserts the one review report for this render. Runs after ffmpeg
   * has finished and the contact sheet is stored, so the transaction only
   * holds the row lock for the write itself. The same lease check as
   * `complete` stops a cancelled job's late review from being attached.
   */
  public async recordReview(input: {
    context: JobHandlerContext;
    report: RenderReviewReport;
  }): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [render] = await tx
        .select({ id: renderJobs.id })
        .from(renderJobs)
        .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
        .where(
          and(
            eq(renderJobs.jobId, input.context.jobId),
            eq(renderJobs.ownerUserId, input.context.ownerUserId),
            eq(renderJobs.projectId, input.context.projectId),
            eq(jobs.state, "running"),
          ),
        )
        .limit(1)
        .for("update");
      if (render === undefined) return false;
      const now = new Date();
      await tx
        .insert(renderReviewReports)
        .values({
          id: createId(now),
          ownerUserId: input.context.ownerUserId,
          projectId: input.context.projectId,
          renderJobId: render.id,
          reviewVersion: input.report.reviewVersion,
          outcome: input.report.outcome,
          attempt: input.context.attempt,
          report: input.report,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [renderReviewReports.renderJobId],
          set: {
            reviewVersion: input.report.reviewVersion,
            outcome: input.report.outcome,
            attempt: input.context.attempt,
            report: input.report,
            updatedAt: now,
          },
        });
      return true;
    });
  }

  public async complete(input: {
    context: JobHandlerContext;
    result: RenderJobResult;
  }): Promise<boolean> {
    return this.database.transaction(async (tx) => {
      const [render] = await tx
        .select({ id: renderJobs.id })
        .from(renderJobs)
        .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
        .where(
          and(
            eq(renderJobs.jobId, input.context.jobId),
            eq(renderJobs.ownerUserId, input.context.ownerUserId),
            eq(renderJobs.projectId, input.context.projectId),
            eq(jobs.state, "running"),
          ),
        )
        .limit(1)
        .for("update");
      if (render === undefined) return false;
      const now = new Date();
      const videoId = createId(now);
      await tx
        .insert(renderedVideos)
        .values({
          id: videoId,
          ownerUserId: input.context.ownerUserId,
          projectId: input.context.projectId,
          renderJobId: render.id,
          storageKey: input.result.video.storageKey,
          checksumSha256: input.result.video.checksumSha256,
          durationMs: input.result.video.durationMs,
          sizeBytes: input.result.video.sizeBytes,
          width: input.result.video.width,
          height: input.result.video.height,
          fps: input.result.video.fps,
          videoCodec: input.result.video.videoCodec,
          audioCodec: input.result.video.audioCodec,
          createdAt: now,
        })
        .onConflictDoNothing({ target: [renderedVideos.renderJobId] });
      const [video] = await tx
        .select({ id: renderedVideos.id })
        .from(renderedVideos)
        .where(eq(renderedVideos.renderJobId, render.id))
        .limit(1);
      if (video && input.result.thumbnail.status === "succeeded")
        await tx
          .insert(renderThumbnails)
          .values({
            id: createId(now),
            ownerUserId: input.context.ownerUserId,
            projectId: input.context.projectId,
            renderedVideoId: video.id,
            storageKey: input.result.thumbnail.metadata.storageKey,
            checksumSha256: input.result.thumbnail.metadata.checksumSha256,
            timestampMs: input.result.thumbnail.metadata.timestampMs,
            width: input.result.thumbnail.metadata.width,
            height: input.result.thumbnail.metadata.height,
            createdAt: now,
          })
          .onConflictDoNothing({ target: [renderThumbnails.renderedVideoId] });
      await tx
        .update(renderJobs)
        .set({
          status: "completed",
          progress: 1,
          attempt: input.context.attempt,
          errorCode: null,
          errorMessage: null,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(renderJobs.id, render.id));
      return true;
    });
  }
}
