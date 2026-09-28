/**
 * ST-105 — prompt-to-video runs on real Postgres.
 *
 * Ticks travel through the real outbox, job table and `executeJobDelivery`
 * exactly as the API's `orchestration` consumer runs them; only the pipeline
 * behind the runner's gateway is simulated (the stage services have their
 * own suites). That isolates what this story adds: persistence, the tick
 * lease and chain, idempotent start, one active run per project, cohort
 * drain, cancel, restart recovery and audit.
 *
 * ST-107: every run now starts from a brief, so `start` prepares one (with a
 * brief generator that records its call like the real one) and confirms it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PublicError, type Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
  migrateDatabase,
  modelCalls,
  oneShotRuns,
  outboxEvents,
  projects,
  sourceDocuments,
  usageRecords,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { executeJobDelivery, PostgresJobRepository } from "@avlp/jobs";
import { and, eq } from "drizzle-orm";
import {
  createOneShotAdvanceJobHandler,
  OneShotRunnerHost,
  OutboxOneShotTickScheduler,
  PostgresOneShotService,
  estimateOneShotBrief,
  type OneShotPilotCohort,
  type OneShotPricing,
  type OneShotRenderGate,
  type OneShotTickScheduler,
} from "./one-shot.js";
import { writeOneShotApprovalAudit } from "./one-shot-gateway.js";
import type { OneShotCallContext, OneShotStageGateway } from "./one-shot-runner.js";
import { FakePipeline } from "./one-shot-test-pipeline.js";
import { FakeBriefGenerator } from "./one-shot-test-brief.js";

/** The simulated pipeline, writing its automatic-approval audits for real. */
class AuditedPipeline extends FakePipeline {
  public constructor(private readonly database: () => DatabaseClient) {
    super();
  }

  public override async auditApproval(
    context: OneShotCallContext,
    input: Parameters<OneShotStageGateway["auditApproval"]>[1],
  ) {
    await super.auditApproval(context, input);
    await writeOneShotApprovalAudit(this.database(), context, input);
  }
}

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId = "019ffc20-aaaa-7000-8000-000000000105" as Identifier;
const otherOwnerUserId = "019ffc20-bbbb-7000-8000-000000000105" as Identifier;
const projectId = "019ffc20-cccc-7000-8000-000000000105" as Identifier;
const correlationId = "019ffc20-dddd-7000-8000-000000000105" as Identifier;
const focusPrompt = "How do trusses carry load?";
const pricing: OneShotPricing = {
  modelCallCostUsd: 1.08,
  imageCostUsd: 0.00225,
  ttsCostUsdPerMillionCharacters: 15,
  alignmentCostUsdPerAudioMinute: 0.0015,
};
const estimate = estimateOneShotBrief({ targetDurationSeconds: 180, plannedSceneCount: 6, pricing });
const briefBody = {
  focusPrompt,
  audience: { ageBand: "adult-professional", difficulty: "advanced", tone: "academic" },
  targetDurationSeconds: 180,
};
const scope = { ownerUserId, projectId };

describeWithPostgres("ST-105 prompt-to-video runs (Postgres)", () => {
  let database: TestDatabase | undefined;
  let clock = new Date("2026-09-27T10:00:00.000Z");
  const now = () => clock;
  let cohort: { enabled: boolean; members: Set<string> };
  let fake: FakePipeline;
  let briefs: FakeBriefGenerator;
  let renderCalls: string[];

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    const client = database!.client;
    await client.delete(oneShotRuns);
    await client.delete(usageRecords);
    await client.delete(modelCalls);
    await client.delete(outboxEvents);
    await client.delete(jobs);
    await client.delete(auditEvents);
    await client.delete(sourceDocuments);
    await client.delete(projects);
    await client.delete(users);
    await seed(client);
    clock = new Date("2026-09-27T10:00:00.000Z");
    cohort = { enabled: true, members: new Set([ownerUserId]) };
    fake = new AuditedPipeline(() => database!.client);
    briefs = new FakeBriefGenerator(() => database!.client, now);
    renderCalls = [];
  });

  afterAll(async () => {
    await database?.destroy();
  });

  const pilotCohort: OneShotPilotCohort = {
    enabled: () => cohort.enabled,
    includes: (userId) => cohort.members.has(userId),
  };
  const renderGate: OneShotRenderGate = {
    saveLessonVersion: async () => {
      renderCalls.push("saveLessonVersion");
      throw new PublicError("bad_request", "Unexpected render.", 409);
    },
    startRender: async () => {
      renderCalls.push("startRender");
      throw new PublicError("bad_request", "Unexpected render.", 409);
    },
  };

  function service(
    maxRunsPerHour = 3,
    scheduler: OneShotTickScheduler = new OutboxOneShotTickScheduler(now),
  ) {
    return new PostgresOneShotService(
      database!.client,
      pilotCohort,
      scheduler,
      renderGate,
      { pricing, maxRunsPerHour, briefs, budgetTolerance: 1.25, maxBriefRevisions: 3 },
      now,
    );
  }

  /** ST-107: a run starts from a confirmed brief. */
  async function start(key: string, subject = service()) {
    const prepared = await subject.brief({ ...scope, body: briefBody, idempotencyKey: key, correlationId });
    return confirm(prepared.brief!.revision, subject);
  }

  function confirm(briefRevision: number, subject = service(), acceptedEstimateUsd = estimate.totalUsd) {
    return subject.create({
      ...scope,
      body: { briefRevision, acceptedEstimateUsd },
      idempotencyKey: undefined,
      correlationId,
    });
  }

  function host() {
    return new OneShotRunnerHost(
      database!.client,
      fake,
      new OutboxOneShotTickScheduler(now),
      now,
    );
  }

  /** One consumer round: deliver every orchestration tick due now. */
  async function pumpOnce(runnerHost = host()): Promise<number> {
    const repository = new PostgresJobRepository(database!.client);
    const handler = createOneShotAdvanceJobHandler(runnerHost);
    const events = await repository.claimOutboxEvents(50, 30_000, clock);
    for (const event of events) {
      await repository.markOutboxDispatched(event.id, clock);
      await executeJobDelivery({
        rawEnvelope: event.envelope,
        queueName: "orchestration",
        payloadSchema: handler.payloadSchema,
        repository,
        handler: handler.handler,
        ...(handler.retryPolicy === undefined ? {} : { retryPolicy: handler.retryPolicy }),
      });
    }
    return events.length;
  }

  /** Rounds 3 s apart, with the pipeline worker finishing jobs in between. */
  async function pump(rounds = 80): Promise<typeof oneShotRuns.$inferSelect> {
    for (let round = 0; round < rounds; round += 1) {
      clock = new Date(clock.getTime() + 3_000);
      await pumpOnce();
      fake.completeJobs();
      const run = await latestRun();
      if (!["queued", "running", "rendering"].includes(run.status)) return run;
    }
    return latestRun();
  }

  async function latestRun() {
    const [run] = await database!.client.select().from(oneShotRuns);
    return run!;
  }

  async function tickJobs() {
    return database!.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "oneshot.advance"));
  }

  it("runs the full chain to the render gate through real ticks, and audits every automatic approval", async () => {
    const started = await start("start-1");
    expect(started.run).toMatchObject({ status: "queued", focusPrompt, briefRevision: 1 });

    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");
    expect(run.currentStep).toBe("render");
    expect(Number(run.actualCostUsd)).toBeCloseTo(0.42, 6);
    const view = (await service().current(scope)).run!;
    expect(view.steps.every((entry) => entry.state === "done")).toBe(true);
    expect(view.focusCoverage).toEqual({ status: "covered" });
    // Nothing is versioned or rendered without the human gate.
    expect(renderCalls).toEqual([]);
    // The brief supplied subject and title: no lesson-intent call.
    expect(fake.calls).not.toContain("inferIntent");

    // One job per tick, each succeeded, none duplicated.
    const ticks = await tickJobs();
    expect(ticks.every((job) => job.state === "succeeded")).toBe(true);
    expect(new Set(ticks.map((job) => job.idempotencyKey)).size).toBe(ticks.length);
    expect(ticks.every((job) => job.queueName === "orchestration")).toBe(true);
    expect(ticks.every((job) => job.correlationId === correlationId)).toBe(true);

    const approvals = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "one_shot.stage_approved"));
    expect(approvals.map((event) => (event.metadata as { step: string }).step).sort()).toEqual(
      ["illustrations", "narration", "objectives", "outline", "source_snapshot"],
    );
    for (const event of approvals) {
      expect(event.actorType).toBe("one_shot_run");
      expect(event.actorUserId).toBe(ownerUserId);
      expect(event.metadata).toMatchObject({ oneShotRunId: run.id });
    }
    const [startedAudit] = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "one_shot.run_started"));
    expect(JSON.stringify(startedAudit!.metadata)).not.toContain("truss");
  });

  it("stops after objectives when the focus is not covered, creating no later job", async () => {
    fake.coverageOnGenerate = { status: "not_covered", reason: "The document never discusses trusses." };
    await start("start-1");
    const run = await pump();
    expect(run).toMatchObject({
      status: "needs_attention",
      needsAttentionStage: "objectives",
      errorCode: "FOCUS_NOT_COVERED",
    });
    expect(run.focusCoverage).toMatchObject({ status: "not_covered" });
    for (const call of ["generate:storyboard", "requestIllustrations", "requestAudio", "requestGrounding"])
      expect(fake.calls).not.toContain(call);
    // The chain stopped: nothing further is queued.
    clock = new Date(clock.getTime() + 60_000);
    expect(await pumpOnce()).toBe(0);
  });

  it("replays the same keys to the same brief and run, and rejects a second concurrent run", async () => {
    const first = await start("start-1");
    const replayBrief = await service().brief({ ...scope, body: briefBody, idempotencyKey: "start-1", correlationId });
    expect(replayBrief.brief!.revision).toBe(1);
    expect(briefs.calls).toHaveLength(1);
    const replay = await confirm(1);
    expect(replay.run!.id).toBe(first.run!.id);
    expect(await tickJobs()).toHaveLength(1);

    await expect(
      service().brief({
        ...scope,
        body: { ...briefBody, focusPrompt: "Something else" },
        idempotencyKey: "start-1",
        correlationId,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(start("start-2")).rejects.toMatchObject({ statusCode: 409 });
    expect(await database!.client.select().from(oneShotRuns)).toHaveLength(1);
  });

  it("lets exactly one of two racing confirmations start the run", async () => {
    const prepared = await service().brief({ ...scope, body: briefBody, idempotencyKey: "race", correlationId });
    const results = await Promise.all([
      confirm(prepared.brief!.revision),
      confirm(prepared.brief!.revision),
    ]);
    expect(results[0]!.run!.id).toBe(results[1]!.run!.id);
    expect(await database!.client.select().from(oneShotRuns)).toHaveLength(1);
    expect(await tickJobs()).toHaveLength(1);
    const started = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "one_shot.run_started"));
    expect(started).toHaveLength(1);
  });

  it("resumes from persisted state after an API restart mid-tick without duplicating any job", async () => {
    await start("start-1");
    for (let round = 0; round < 6; round += 1) {
      clock = new Date(clock.getTime() + 3_000);
      await pumpOnce();
      fake.completeJobs();
    }
    const before = await latestRun();
    expect(before.status).toBe("running");

    // The API dies holding the next tick: its job is running with a lease,
    // and the run's tick lease names that job.
    clock = new Date(clock.getTime() + 3_000);
    const repository = new PostgresJobRepository(database!.client);
    const [due] = await repository.claimOutboxEvents(1, 30_000, clock);
    await repository.markOutboxDispatched(due!.id, clock);
    const jobId = due!.envelope.jobId;
    await repository.claimJob({ jobId, ownerUserId, projectId }, 60_000, clock);
    await database!.client
      .update(oneShotRuns)
      .set({
        tickJobId: jobId,
        tickSequence: before.tickSequence + 1,
        tickLeaseExpiresAt: new Date(clock.getTime() + 5 * 60_000),
      })
      .where(eq(oneShotRuns.id, before.id));

    // A stray job cannot fork the chain while the lease is held.
    await expect(
      host().tick({ ...scope, runId: before.id as Identifier, jobId: "019ffc20-9999-7000-8000-000000000105" as Identifier }),
    ).resolves.toBe("lease_held");

    // After the restart the stale-lease reaper requeues the same job, which
    // reclaims its own tick lease and continues from the persisted run.
    const requeued = await repository.requeueStaleJobs(10, new Date(clock.getTime() + 61_000));
    expect(requeued.requeued.map((job) => job.id)).toEqual([jobId]);
    // The reaper's outbox row takes the database clock; align it with the
    // test clock so the next consumer round sees it.
    clock = new Date(clock.getTime() + 61_000);
    await database!.client
      .update(outboxEvents)
      .set({ availableAt: clock })
      .where(eq(outboxEvents.jobId, jobId));
    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");
    for (const stage of ["objectives", "outline", "narration", "storyboard"])
      expect(fake.calls.filter((call) => call === `generate:${stage}`)).toHaveLength(1);
    expect(fake.calls.filter((call) => call === "requestIllustrations")).toHaveLength(1);
    const ticks = await tickJobs();
    expect(new Set(ticks.map((job) => job.idempotencyKey)).size).toBe(ticks.length);
  });

  it("stops on a failed stage job and continues the same run on resume", async () => {
    fake.failNext.add("narration");
    await start("start-1");
    const stopped = await pump();
    expect(stopped).toMatchObject({ status: "needs_attention", needsAttentionStage: "narration", errorCode: "STAGE_JOB_FAILED" });

    const resumed = await service().resume({ ...scope, correlationId });
    expect(resumed.run).toMatchObject({ id: stopped.id, status: "running", needsAttention: null });
    const run = await pump();
    expect(run).toMatchObject({ id: stopped.id, status: "awaiting_render_approval", resumeCount: 1 });
    expect(fake.keys).toContain(`oneshot:${stopped.id}:narration:r1`);
    await expect(service().resume({ ...scope, correlationId })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("never commits a confirmation or resume without the tick job that advances it", async () => {
    const failing = service(3, {
      schedule: async () => {
        throw new Error("outbox unavailable");
      },
    });
    await expect(start("start-1", failing)).rejects.toThrow("outbox unavailable");
    // The confirmation rolled back: the brief still waits for it, and no run
    // was started.
    expect(await latestRun()).toMatchObject({ status: "brief_ready", confirmedBriefRevision: null });
    expect(
      await database!.client
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.eventType, "one_shot.run_started")),
    ).toHaveLength(0);

    fake.failNext.add("outline");
    await confirm(1);
    const stopped = await pump();
    expect(stopped.status).toBe("needs_attention");
    await expect(failing.resume({ ...scope, correlationId })).rejects.toThrow("outbox unavailable");
    // The resume rolled back, so the run is still resumable.
    expect(await latestRun()).toMatchObject({ status: "needs_attention", resumeCount: 0 });
    await expect(service().resume({ ...scope, correlationId })).resolves.toMatchObject({
      run: { status: "running" },
    });
  });

  it("refuses a brief on a project with no usable source document", async () => {
    await database!.client
      .update(sourceDocuments)
      .set({ status: "rejected" })
      .where(eq(sourceDocuments.projectId, projectId));
    await expect(start("start-1")).rejects.toMatchObject({ statusCode: 409 });
    expect(await database!.client.select().from(oneShotRuns)).toHaveLength(0);
    expect(briefs.calls).toHaveLength(0);
  });

  it("ST-107: two brief revisions racing store one revision each or answer 409, never a 500", async () => {
    await service().brief({ ...scope, body: briefBody, idempotencyKey: "race-0", correlationId });
    const results = await Promise.allSettled([
      service().brief({ ...scope, body: { ...briefBody, focusPrompt: "Explain truss joints." }, idempotencyKey: "race-a", correlationId }),
      service().brief({ ...scope, body: { ...briefBody, focusPrompt: "Explain truss members." }, idempotencyKey: "race-b", correlationId }),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ statusCode: 409 });
    // The run is confirmable afterwards.
    const latest = await service().currentBrief(scope);
    expect(latest.brief!.revision).toBeGreaterThanOrEqual(2);
    expect((await latestRun()).status).toBe("brief_ready");
  });

  it("ST-107: waiting for the document to be read never uses up a brief call", async () => {
    briefs.ready = false;
    for (const key of ["wait-1", "wait-2", "wait-3", "wait-4"])
      await expect(
        service().brief({ ...scope, body: briefBody, idempotencyKey: key, correlationId }),
      ).rejects.toMatchObject({ statusCode: 409, retryable: true });
    expect(await database!.client.select().from(oneShotRuns)).toHaveLength(0);
    expect(briefs.calls).toHaveLength(0);

    briefs.ready = true;
    const prepared = await service().brief({ ...scope, body: briefBody, idempotencyKey: "wait-5", correlationId });
    expect(prepared).toMatchObject({ revisionsUsed: 1, maxRevisions: 3, brief: { revision: 1 } });
  });

  it("refuses to render before the run awaits render approval", async () => {
    await start("start-1");
    await expect(service().render({ ...scope, correlationId })).rejects.toMatchObject({ statusCode: 409 });
    expect(renderCalls).toEqual([]);
  });

  it("makes ticks of a cancelled run no-ops and frees the project for a new run", async () => {
    await start("start-1");
    clock = new Date(clock.getTime() + 3_000);
    await pumpOnce();
    const cancelled = await service().cancel({ ...scope, correlationId });
    expect(cancelled.run!.status).toBe("cancelled");
    const callsAtCancel = fake.calls.length;

    clock = new Date(clock.getTime() + 3_000);
    await pumpOnce();
    clock = new Date(clock.getTime() + 60_000);
    expect(await pumpOnce()).toBe(0);
    expect(fake.calls).toHaveLength(callsAtCancel);
    expect((await latestRun()).status).toBe("cancelled");
    // The tick delivered after the cancel did nothing, and none is left.
    const ticks = await tickJobs();
    expect(ticks.map((job) => job.resultMetadata)).toContainEqual({ outcome: "not_ticking" });
    expect(ticks.every((job) => job.state === "succeeded")).toBe(true);

    const next = await start("start-2");
    expect(next.run!.status).toBe("queued");
    expect(next.run!.id).not.toBe(cancelled.run!.id);
  });

  it("drains in-flight runs when the flag is turned off, while rejecting new ones", async () => {
    await start("start-1");
    cohort.enabled = false;
    await expect(
      service().brief({ ...scope, body: briefBody, idempotencyKey: "start-2", correlationId }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(confirm(1)).rejects.toMatchObject({ statusCode: 409 });
    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");
    // Cohort members can still see their run.
    expect((await service().current(scope)).run!.id).toBe(run.id);
  });

  it("never exposes or advances a run from another tenant's scope", async () => {
    const { run } = await start("start-1");
    cohort.members.add(otherOwnerUserId);
    const foreign = await service().current({ ownerUserId: otherOwnerUserId, projectId });
    expect(foreign.run).toBeNull();
    await expect(
      service().cancel({ ownerUserId: otherOwnerUserId, projectId, correlationId }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      host().tick({ ownerUserId: otherOwnerUserId, projectId, runId: run!.id, jobId: run!.id }),
    ).resolves.toBe("not_ticking");
    expect((await latestRun()).status).toBe("queued");
  });

  it("rejects an accepted estimate below the brief's and enforces the hourly run limit", async () => {
    const prepared = await service(2).brief({ ...scope, body: briefBody, idempotencyKey: "cheap", correlationId });
    await expect(
      confirm(prepared.brief!.revision, service(2), estimate.totalUsd - 0.01),
    ).rejects.toMatchObject({ statusCode: 409 });
    await service(2).cancel({ ...scope, correlationId });

    clock = new Date(clock.getTime() + 1_000);
    await start("q-1", service(2));
    await service(2).cancel({ ...scope, correlationId });
    await expect(start("q-2", service(2))).rejects.toMatchObject({ statusCode: 429 });
    const rows = await database!.client
      .select()
      .from(oneShotRuns)
      .where(and(eq(oneShotRuns.ownerUserId, ownerUserId), eq(oneShotRuns.projectId, projectId)));
    expect(rows).toHaveLength(2);
  });
});

async function seed(database: DatabaseClient): Promise<void> {
  const timestamp = new Date("2026-09-27T09:00:00.000Z");
  await database.insert(users).values([
    { id: ownerUserId, emailNormalized: "one-shot-owner@example.test", displayName: "Owner", createdAt: timestamp, updatedAt: timestamp },
    { id: otherOwnerUserId, emailNormalized: "one-shot-other@example.test", displayName: "Other", createdAt: timestamp, updatedAt: timestamp },
  ]);
  await database.insert(projects).values({
    id: projectId,
    ownerUserId,
    title: "Truss bridges",
    stage: "ingestion_review",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(sourceDocuments).values({
    id: "019ffc20-eeee-7000-8000-000000000105",
    ownerUserId,
    projectId,
    originalName: "trusses.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "c".repeat(64),
    storageKey: "users/tenant/trusses.pdf",
    pageCount: 2,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
