/**
 * ST-103 — the review report is one row per render, upserted by every
 * attempt, and only while the job still holds its lease in its own tenant.
 */
import { createId, type Identifier } from "@avlp/config";
import {
  eq,
  jobs,
  migrateDatabase,
  renderJobs,
  renderReviewReports,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { JobHandlerContext } from "@avlp/jobs";
import type { RenderReviewReport } from "@avlp/schemas";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgresRenderLifecycle } from "./render-lifecycle.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000103" as Identifier;
const projectId = "019ffbf1-cccc-7000-8000-000000000103" as Identifier;
const otherOwnerUserId = "019ffbf1-bbbb-7000-8000-000000000103" as Identifier;

function report(
  jobId: Identifier,
  attempt: number,
  outcome: "passed" | "failed",
): RenderReviewReport {
  return {
    attempt,
    contactSheet: [],
    durationMs: 60_000,
    findings:
      outcome === "failed"
        ? [
            {
              atMs: 1_000,
              code: "BLACK_SEGMENT",
              correction: "Check the scene.",
              detail: "The picture is black for 2.00 s from 1.00 s.",
              severity: "error",
            },
          ]
        : [],
    jobId,
    loudness: { integratedLufs: -16, peakDbfs: -3 },
    outcome,
    reviewVersion: "render-review-v1",
    reviewedAt: new Date("2026-09-26T00:00:00.000Z").toISOString(),
    videoChecksumSha256: "a".repeat(64),
  };
}

describeWithPostgres("PostgresRenderLifecycle.recordReview", () => {
  let database: TestDatabase | undefined;
  let lifecycle: PostgresRenderLifecycle;
  let jobId: Identifier;
  let renderJobId: Identifier;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
    lifecycle = new PostgresRenderLifecycle(database.client);
  });
  afterAll(async () => {
    await database?.destroy();
  });

  beforeEach(async () => {
    const client = database!.client;
    await client.delete(renderReviewReports);
    await client.delete(renderJobs);
    await client.delete(jobs);
    jobId = createId();
    renderJobId = createId();
    // Only the rows under test are seeded; referential checks against the
    // lesson-version graph are switched off for this throwaway database.
    await client.transaction(async (tx) => {
      await tx.execute("set local session_replication_role = replica");
      await tx.insert(jobs).values({
        correlationId: createId(),
        id: jobId,
        idempotencyKey: `lesson.render:${jobId}`,
        inputVersion: "v1",
        jobType: "lesson.render",
        ownerUserId,
        payload: {},
        payloadVersion: 1,
        projectId,
        queueName: "render",
        state: "running",
      });
      await tx.insert(renderJobs).values({
        id: renderJobId,
        jobId,
        lessonVersionId: createId(),
        manifest: {},
        manifestHash: "m".repeat(64),
        ownerUserId,
        projectId,
        validationRunId: createId(),
      });
    });
  });

  const contextFor = (
    attempt: number,
    overrides: Partial<JobHandlerContext> = {},
  ): JobHandlerContext => ({
    attempt,
    correlationId: createId(),
    heartbeat: () => Promise.resolve(),
    idempotencyKey: `lesson.render:${jobId}`,
    jobId,
    ownerUserId,
    projectId,
    reportProgress: () => Promise.resolve(),
    ...overrides,
  });

  it("upserts one report per render across retried attempts", async () => {
    await expect(
      lifecycle.recordReview({
        context: contextFor(1),
        report: report(jobId, 1, "failed"),
      }),
    ).resolves.toBe(true);
    await expect(
      lifecycle.recordReview({
        context: contextFor(2),
        report: report(jobId, 2, "passed"),
      }),
    ).resolves.toBe(true);
    const rows = await database!.client
      .select()
      .from(renderReviewReports)
      .where(eq(renderReviewReports.renderJobId, renderJobId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      attempt: 2,
      outcome: "passed",
      ownerUserId,
      projectId,
      reviewVersion: "render-review-v1",
    });
    expect((rows[0]!.report as RenderReviewReport).attempt).toBe(2);
  });

  it("refuses a review for another tenant's job or a job that lost its lease", async () => {
    await expect(
      lifecycle.recordReview({
        context: contextFor(1, { ownerUserId: otherOwnerUserId }),
        report: report(jobId, 1, "passed"),
      }),
    ).resolves.toBe(false);
    await database!.client
      .update(jobs)
      .set({ state: "cancelled" })
      .where(eq(jobs.id, jobId));
    await expect(
      lifecycle.recordReview({
        context: contextFor(1),
        report: report(jobId, 1, "passed"),
      }),
    ).resolves.toBe(false);
    expect(
      await database!.client.select().from(renderReviewReports),
    ).toHaveLength(0);
  });
});
