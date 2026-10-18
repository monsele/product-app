import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import {
  authorizeRecoveryCall,
  jobs,
  lessonRecoveryRuns,
  lessonRecoveryTasks,
  lessonRecoverySignals,
  lessonSpecs,
  migrateDatabase,
  sceneAudio,
  captionTracks,
  scenes,
  voiceConfigurations,
  lessonPreparationGrants,
  oneShotRuns,
  illustrationGenerationCandidates,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { RegisteredJobHandler } from "@avlp/jobs";
import { eq, isNull, sql } from "drizzle-orm";
import {
  seed,
  scope,
  now,
  sceneA,
  sceneB,
  storyboardPayload,
} from "./cinema-lesson.fixture.js";
import { LessonReadinessService } from "./lesson-readiness.js";
import { LessonRecoveryService } from "./lesson-recovery.js";
import { PostgresLessonValidationService } from "./lesson-validation.js";
import { SceneAudioService } from "./scene-audio.js";
import { PostgresStoryboardService } from "./storyboard.js";
import { lessonStoryboardSchema } from "@avlp/schemas";

const suite = process.env.TEST_DATABASE_URL ? describe : describe.skip;
suite("durable technical recovery (Postgres)", () => {
  let database: TestDatabase;
  let service: LessonRecoveryService;
  let validation: PostgresLessonValidationService;
  let readiness: LessonReadinessService;
  beforeAll(async () => {
    database = await createTestDatabase(process.env.TEST_DATABASE_URL!);
    await migrateDatabase(database.client);
  }, 30000);
  afterAll(async () => {
    await database?.destroy();
  });
  beforeEach(async () => {
    await database.client.delete(lessonPreparationGrants);
    await database.client.delete(oneShotRuns);
    await database.client.delete(lessonRecoveryTasks);
    await database.client.delete(lessonRecoveryRuns);
    await database.client.delete(voiceConfigurations);
    await seed(database.client);
    const storyboard = storyboardPayload();
    await database.client.insert(scenes).values(
      storyboard.scenes.map((entry) => ({
        id: entry.id,
        ...scope,
        lessonSpecId: storyboard.id,
        stableSceneId: entry.stableSceneId,
        order: entry.order,
        template: entry.template,
        durationSeconds: entry.durationSeconds,
        narrationBlockIds: entry.narrationBlockIds,
        assetRequirements: [],
        sceneJson: entry.scene,
      })),
    );
    await database.client.insert(voiceConfigurations).values({
      id: createId(),
      ...scope,
      voiceId: "english-aria",
      speakingRate: 1,
      createdAt: now,
      updatedAt: now,
    });
    validation = new PostgresLessonValidationService(database.client);
    readiness = new LessonReadinessService(database.client, validation, true);
    service = new LessonRecoveryService(
      database.client,
      readiness,
      validation,
      new SceneAudioService(database.client),
      {
        modelCallCostUsd: 1,
        imageCostUsd: 0.01,
        ttsCostUsdPerMillionCharacters: 15,
        alignmentCostUsdPerAudioMinute: 0.0015,
      },
    );
  });
  async function start(key = "recovery-test-start") {
    const estimate = await service.estimate(scope);
    const input = {
      ...scope,
      correlationId: createId(),
      body: {
        expectedRevision: estimate.revision,
        idempotencyKey: key,
        estimateFingerprint: estimate.fingerprint,
        acceptedMaximumCostUsd: estimate.maximumCostUsd,
      },
    };
    await service.start(input);
    return input;
  }
  async function tick() {
    const [run] = await database.client.select().from(lessonRecoveryRuns).where(isNull(lessonRecoveryRuns.stoppedAt));
    if (!run) return;
    const [job] = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, `recovery:${run!.id}:${run!.sequence}`));
    if (!job) return;
    await service.handler().handler(job!.payload, {
      ...scope,
      jobId: job!.id as Identifier,
      correlationId: job!.correlationId as Identifier,
      idempotencyKey: job!.idempotencyKey,
      attempt: 1,
      heartbeat: async () => {},
      reportProgress: async () => {},
      payloadVersion: 1,
      inputVersion: job!.inputVersion,
    } as Parameters<RegisteredJobHandler["handler"]>[1]);
  }
  async function deliverChanges() {
    // Advance only the debounce timestamp; provider calls remain real fixture jobs.
    await database.client
      .update(lessonRecoverySignals)
      .set({ changedAt: new Date(Date.now() - 3000) });
    return service.drainSignals();
  }
  const pricing = {
    modelCallCostUsd: 1,
    imageCostUsd: 0.01,
    ttsCostUsdPerMillionCharacters: 15,
    alignmentCostUsdPerAudioMinute: 0.0015,
  };
  it("persists generation consent and enrolls the completed draft once across concurrent deliveries", async () => {
    const jobId = createId();
    const spec = storyboardPayload();
    service = new LessonRecoveryService(
      database.client,
      readiness,
      validation,
      new SceneAudioService(database.client),
      pricing,
      undefined,
      {
        storyboard: {
          generate: async (input) => {
            await database.client
              .insert(jobs)
              .values({
                id: jobId,
                ...scope,
                jobType: "storyboard.generate",
                queueName: "pipeline",
                correlationId: input.correlationId,
                inputVersion: "generation",
                idempotencyKey: "generation-consent-test",
                payloadVersion: 2,
                payload: {},
              })
              .onConflictDoNothing();
            return { jobId, status: "queued" as const };
          },
        },
      },
    );
    const estimate = await service.generationEstimate(scope);
    const input = {
      ...scope,
      correlationId: createId(),
      idempotencyKey: "generation-with-preparation",
      body: {
        estimateFingerprint: estimate.fingerprint,
        acceptedMaximumCostUsd: estimate.maximumCostUsd,
      },
    };
    await expect(
      service.generatePrepared({
        ...input,
        body: { ...input.body, estimateFingerprint: "f".repeat(64) },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await Promise.all([
      service.generatePrepared(input),
      service.generatePrepared(input),
    ]);
    expect(
      await database.client.select().from(lessonPreparationGrants),
    ).toHaveLength(1);
    expect(
      await database.client.select().from(lessonRecoveryRuns),
    ).toHaveLength(0);
    await database.client
      .update(jobs)
      .set({ state: "succeeded", resultMetadata: { candidateId: spec.id } })
      .where(eq(jobs.id, jobId));
    await Promise.all([service.drainSignals(), service.drainSignals()]);
    const [run] = await database.client.select().from(lessonRecoveryRuns);
    expect(run!.allowanceUsd).toBe(estimate.maximumCostUsd.toFixed(6));
    expect(
      (await database.client.select().from(lessonPreparationGrants))[0]!.runId,
    ).toBe(run!.id);
    await service.drainSignals();
    expect(
      await database.client.select().from(lessonRecoveryRuns),
    ).toHaveLength(1);
    expect(
      (await database.client.select().from(lessonRecoveryRuns))[0]!
        .allowanceUsd,
    ).toBe(run!.allowanceUsd);
  });
  it("earmarks the confirmed video cap once and shares the project session across workflows", async () => {
    const generationId = createId();
    await database.client.insert(oneShotRuns).values({
      id: generationId,
      ...scope,
      idempotencyKey: "video-recovery",
      requestHash: "a".repeat(64),
      focusPrompt: "Water",
      audience: {},
      targetDurationSeconds: 180,
      acceptedEstimateUsd: "10",
      capUsd: "10",
      reservedUsd: "10",
      correlationId: createId(),
      preparationAuthorized: true,
      status: "running",
    });
    service = new LessonRecoveryService(
      database.client,
      readiness,
      validation,
      new SceneAudioService(database.client),
      pricing,
      undefined,
      {
        grounding: {
          check: async () => {
            throw new Error("not dispatched during enrollment");
          },
        },
      },
    );
    await Promise.all([
      service.prepareOneShot({ ...scope, oneShotRunId: generationId }),
      service.prepareOneShot({ ...scope, oneShotRunId: generationId }),
    ]);
    const runs = await database.client.select().from(lessonRecoveryRuns);
    expect(runs).toHaveLength(1);
    const [generation] = await database.client.select().from(oneShotRuns);
    expect(Number(generation!.preparationAllowanceUsd)).toBe(
      Number(runs[0]!.allowanceUsd),
    );
    expect(Number(generation!.preparationAllowanceUsd)).toBeGreaterThan(0);
    expect(Number(generation!.preparationAllowanceUsd)).toBeLessThanOrEqual(10);
    await start("switch-to-storyboard");
    expect(
      await database.client.select().from(lessonRecoveryRuns),
    ).toHaveLength(1);
    expect(
      (await database.client.select().from(lessonRecoveryRuns))[0]!
        .allowanceUsd,
    ).toBe(runs[0]!.allowanceUsd);
    await database.client.update(oneShotRuns).set({ status: "cancelled" });
    await tick();
    const [task] = await database.client.select().from(lessonRecoveryTasks);
    await expect(
      authorizeRecoveryCall(database.client, {
        ...scope,
        taskId: task!.id,
        jobId: task!.jobId!,
        attempt: 1,
        phase: "cancelled-video",
        maximumCostUsd: 0,
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_CANCELLED" });
  });
  it("retries the exact authorized asset job within lifetime attempts and reserves its calls", async () => {
    const candidateId = createId();
    const jobId = createId();
    await database.client.insert(illustrationGenerationCandidates).values({
      id: candidateId,
      ...scope,
      sceneId: sceneA,
      slot: "illustration",
      status: "failed",
      promptVersion: "v1",
      provider: "fixture-v1",
      idempotencyKey: "failed-image",
    });
    const payload = { schemaVersion: 1, candidateId };
    await database.client.insert(jobs).values({
      id: jobId,
      ...scope,
      jobType: "illustration.generate",
      queueName: "pipeline",
      correlationId: createId(),
      inputVersion: "authorized-image-input",
      idempotencyKey: "authorized-image",
      payloadVersion: 1,
      payload,
      state: "failed",
      errorClassification: "retryable",
      attempts: 1,
    });
    // Explicit preparation allowance covers the image retry too.
    service = new LessonRecoveryService(
      database.client,
      readiness,
      validation,
      new SceneAudioService(database.client),
      pricing,
      undefined,
      {
        grounding: {
          check: async () => {
            throw new Error("not dispatched while audio prepares");
          },
        },
      },
    );
    await start();
    await tick();
    const [job] = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId));
    expect(job!.state).toBe("queued");
    expect(job!.attempts).toBe(1);
    expect(job!.payload).toEqual(payload);
    const [task] = (
      await database.client.select().from(lessonRecoveryTasks)
    ).filter((entry) => entry.operation === "asset");
    await authorizeRecoveryCall(database.client, {
      ...scope,
      taskId: task!.id,
      jobId,
      attempt: 2,
      phase: "image",
      maximumCostUsd: 0.01,
    });
    await expect(
      authorizeRecoveryCall(database.client, {
        ...scope,
        taskId: task!.id,
        jobId,
        attempt: 4,
        phase: "fourth",
        maximumCostUsd: 0.01,
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_ATTEMPTS_EXHAUSTED" });
  });
  it("pauses paid repairs at the cap while editing stays open, then resumes only with new consent", async () => {
    const payload = lessonStoryboardSchema.parse(storyboardPayload());
    payload.scenes[0]!.assetRequirements = [
      { slot: "illustration", purpose: "Required teaching visual" },
    ];
    await database.client.update(lessonSpecs).set({ payload });
    const candidateId = createId();
    const jobId = createId();
    await database.client
      .insert(illustrationGenerationCandidates)
      .values({
        id: candidateId,
        ...scope,
        sceneId: sceneA,
        slot: "illustration",
        status: "failed",
        promptVersion: "v1",
        provider: "fixture-v1",
        idempotencyKey: "budget-image",
      });
    await database.client
      .insert(jobs)
      .values({
        id: jobId,
        ...scope,
        jobType: "illustration.generate",
        queueName: "pipeline",
        correlationId: createId(),
        inputVersion: "budget-image",
        idempotencyKey: "budget-image",
        payloadVersion: 1,
        payload: { schemaVersion: 1, candidateId },
        state: "failed",
        errorClassification: "retryable",
        attempts: 1,
      });
    service = new LessonRecoveryService(
      database.client,
      readiness,
      validation,
      new SceneAudioService(database.client),
      pricing,
      undefined,
      {
        grounding: {
          check: async () => {
            throw new Error("waits for media");
          },
        },
      },
    );
    await start("initial-budget");
    await database.client.update(lessonRecoveryRuns).set({ allowanceUsd: "0" });
    await tick();
    const state = await readiness.read(scope);
    expect(state.capabilities.edit).toBe(true);
    expect(state.capabilities.preview).toBe(true);
    expect(state.capabilities.render).toBe(false);
    expect(state.tasks.some((task) => task.action === "approve_usage")).toBe(
      true,
    );
    expect(
      (await database.client.select().from(jobs).where(eq(jobs.id, jobId)))[0]!
        .state,
    ).toBe("failed");
    const stop = {
      ...scope,
      body: {
        expectedRevision: state.revision,
        idempotencyKey: "stop-paused-budget",
      },
    };
    await service.stop(stop);
    await service.stop(stop);
    await start("new-preparation-consent");
    await tick();
    expect(
      (await database.client.select().from(jobs).where(eq(jobs.id, jobId)))[0]!
        .state,
    ).toBe("queued");
    expect(
      (await database.client.select().from(lessonRecoveryRuns)).filter(
        (run) => run.stoppedAt === null,
      ),
    ).toHaveLength(1);
  });
  it("coalesces durable changes without creating authority or reviving stopped sessions", async () => {
    await database.client
      .update(voiceConfigurations)
      .set({ speakingRate: 1.1 });
    expect(await deliverChanges()).toBe(0);
    expect(
      await database.client.select().from(lessonRecoveryRuns),
    ).toHaveLength(0);
    await start();
    await tick();
    const [run] = await database.client.select().from(lessonRecoveryRuns);
    // Represent a settled session, with no outstanding coordinator lease.
    await database.client
      .update(lessonRecoveryRuns)
      .set({ state: "succeeded" });
    await database.client
      .update(voiceConfigurations)
      .set({ speakingRate: 1.2 });
    await database.client
      .update(voiceConfigurations)
      .set({ speakingRate: 1.3 });
    expect(
      await database.client.select().from(lessonRecoverySignals),
    ).toHaveLength(1);
    const deliveries = await Promise.all([
      deliverChanges(),
      service.drainSignals(),
    ]);
    expect(deliveries.reduce((sum, count) => sum + count, 0)).toBe(1);
    const [resumed] = await database.client.select().from(lessonRecoveryRuns);
    expect(resumed!.id).toBe(run!.id);
    expect(resumed!.allowanceUsd).toBe(run!.allowanceUsd);
    expect(resumed!.state).toBe("queued");
    await service.stop({
      ...scope,
      body: { expectedRevision: 0, idempotencyKey: "stop-signals" },
    });
    await database.client
      .update(voiceConfigurations)
      .set({ speakingRate: 1.4 });
    expect(await deliverChanges()).toBe(0);
    expect(
      (await database.client.select().from(lessonRecoveryRuns))[0]!.state,
    ).toBe("cancelled");
  });
  it("retains an edit notification while the coordinator holds a lease", async () => {
    await start();
    await database.client
      .update(lessonRecoveryRuns)
      .set({ leaseUntil: new Date(Date.now() + 60000) });
    await database.client
      .update(lessonSpecs)
      .set({ revision: sql`${lessonSpecs.revision} + 1` });
    expect(await deliverChanges()).toBe(0);
    expect(
      await database.client.select().from(lessonRecoverySignals),
    ).toHaveLength(1);
    await database.client.update(lessonRecoveryRuns).set({ leaseUntil: null });
    expect(await deliverChanges()).toBe(1);
    expect(
      await database.client.select().from(lessonRecoverySignals),
    ).toHaveLength(0);
  });
  it("starts once, survives a new coordinator instance and only queues affected media", async () => {
    const input = await start();
    await service.start(input);
    await tick();
    const tasks = await database.client.select().from(lessonRecoveryTasks);
    const runs = await database.client.select().from(lessonRecoveryRuns);
    expect(runs.map((run) => run.failureCode)).toEqual([null]);
    expect(tasks).toHaveLength(2);
    expect(new Set(tasks.map((task) => task.sceneId))).toEqual(
      new Set([sceneA, sceneB]),
    );
    expect(tasks.every((task) => task.jobId && task.state === "running")).toBe(
      true,
    );
    await tick();
    const audioJobs = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "tts.generate"));
    expect(audioJobs).toHaveLength(2);
    expect((await readiness.read(scope)).capabilities).toEqual({
      edit: true,
      preview: true,
      render: false,
    });
  });
  it("rejects a changed estimate and another tenant", async () => {
    const estimate = await service.estimate(scope);
    await expect(
      service.start({
        ...scope,
        correlationId: createId(),
        body: {
          expectedRevision: estimate.revision + 1,
          idempotencyKey: "stale-request",
          estimateFingerprint: estimate.fingerprint,
          acceptedMaximumCostUsd: estimate.maximumCostUsd,
        },
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service.estimate({ ...scope, ownerUserId: createId() }),
    ).rejects.toThrow();
  });
  it("enforces cancellation and per-dispatch spending atomically", async () => {
    await start();
    await tick();
    const [task] = await database.client.select().from(lessonRecoveryTasks);
    const call = {
      ...scope,
      taskId: task!.id,
      jobId: task!.jobId!,
      attempt: 1,
      heartbeat: async () => {},
      reportProgress: async () => {},
      phase: "synthesis",
      maximumCostUsd: 0,
    };
    await authorizeRecoveryCall(database.client, call);
    await expect(
      authorizeRecoveryCall(database.client, call),
    ).rejects.toMatchObject({ code: "RECOVERY_DISPATCH_ALREADY_RESERVED" });
    await expect(
      authorizeRecoveryCall(database.client, {
        ...call,
        phase: "paid",
        maximumCostUsd: 1,
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_ALLOWANCE_EXHAUSTED" });
    await expect(
      authorizeRecoveryCall(database.client, {
        ...call,
        attempt: 4,
        phase: "excess-attempt",
      }),
    ).rejects.toMatchObject({ code: "RECOVERY_ATTEMPTS_EXHAUSTED" });
    const state = await readiness.read(scope);
    await service.stop({
      ...scope,
      body: { expectedRevision: state.revision, idempotencyKey: "stop-test" },
    });
    await expect(
      authorizeRecoveryCall(database.client, { ...call, phase: "after-stop" }),
    ).rejects.toThrow();
  });
  it("repairs audio and captions using the actual worker, then reuses completed output", async () => {
    // Import built worker at runtime to exercise both workspaces without a TS rootDir dependency.
    const moduleUrl = new URL(
      "../../pipeline-worker/dist/scene-audio-job.js",
      import.meta.url,
    ).href;
    const worker = (await import(moduleUrl)) as {
      createSceneAudioGenerationJobHandler(input: {
        database: DatabaseClient;
        storage: { putBytes: () => Promise<{ checksumSha256: string }> };
      }): RegisteredJobHandler;
    };
    await start();
    await tick();
    let storedAudioCount = 0;
    const handler = worker.createSceneAudioGenerationJobHandler({
      database: database.client,
      storage: {
        putBytes: async () => {
          storedAudioCount += 1;
          return { checksumSha256: "a".repeat(64) };
        },
      },
    });
    const audioJobs = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "tts.generate"));
    for (const job of audioJobs) {
      await handler.handler(job.payload, {
        ...scope,
        jobId: job.id as Identifier,
        correlationId: job.correlationId as Identifier,
        idempotencyKey: job.idempotencyKey,
        attempt: 1,
        heartbeat: async () => {},
        reportProgress: async () => {},
      } as Parameters<RegisteredJobHandler["handler"]>[1]);
      await database.client
        .update(jobs)
        .set({ state: "succeeded", attempts: 1 })
        .where(eq(jobs.id, job.id));
    }
    await tick();
    const rows = await database.client.select().from(sceneAudio);
    expect(
      rows.every((row) => row.status === "ready" && row.durationMs! > 0),
    ).toBe(true);
    const report = await validation.run({ ...scope, body: {} });
    expect(
      report.issues.filter((issue) =>
        [
          "audio_missing",
          "audio_not_ready",
          "captions_missing",
          "captions_not_ready",
          "narration_duration_mismatch",
          "audio_duration_mismatch",
        ].includes(issue.code),
      ),
    ).toEqual([]);
    await tick();
    expect(
      await database.client
        .select()
        .from(jobs)
        .where(eq(jobs.jobType, "tts.generate")),
    ).toHaveLength(2);
    await database.client.update(captionTracks).set({ status: "stale" });
    // No page visit or second preparation command: the saved dependency wakes
    // the same authorized session, including after the coordinator has settled.
    expect(await deliverChanges()).toBe(1);
    await tick();
    const repairs = (
      await database.client
        .select()
        .from(jobs)
        .where(eq(jobs.jobType, "tts.generate"))
    ).filter((job) => !audioJobs.some((original) => original.id === job.id));
    expect(repairs).toHaveLength(2);
    for (const job of repairs) {
      await handler.handler(job.payload, {
        ...scope,
        jobId: job.id as Identifier,
        correlationId: job.correlationId as Identifier,
        idempotencyKey: job.idempotencyKey,
        attempt: 1,
        heartbeat: async () => {},
        reportProgress: async () => {},
      });
      await database.client
        .update(jobs)
        .set({ state: "succeeded", attempts: 1 })
        .where(eq(jobs.id, job.id));
    }
    await tick();
    expect(storedAudioCount).toBe(2);
    expect(
      (await validation.run({ ...scope, body: {} })).issues.filter(
        (issue) => issue.scopeType === "captions",
      ),
    ).toEqual([]);
  }, 30000);
  it("recovers only failed Scene 6 and reconciles 238 seconds against the 180-second estimate", async () => {
    const payload = storyboardPayload();
    const first = payload.scenes[0]!;
    payload.scenes = Array.from({ length: 6 }, (_, index) => {
      const id = createId();
      return {
        ...first,
        id,
        stableSceneId: id,
        order: index + 1,
        scene: {
          ...first.scene,
          id,
          order: index + 1,
          narration: `Scene ${index + 1}. ${first.scene.narration}`,
        },
      };
    });
    payload.totalDurationSeconds = 180;
    await database.client.delete(scenes);
    await database.client
      .update(lessonSpecs)
      .set({ payload, totalDurationSeconds: 180 });
    await database.client.insert(scenes).values(
      payload.scenes.map((entry) => ({
        id: entry.id,
        ...scope,
        lessonSpecId: payload.id,
        stableSceneId: entry.stableSceneId,
        order: entry.order,
        template: entry.template,
        durationSeconds: entry.durationSeconds,
        narrationBlockIds: entry.narrationBlockIds,
        assetRequirements: [],
        sceneJson: entry.scene,
      })),
    );
    const worker = (await import(
      new URL("../../pipeline-worker/dist/scene-audio-job.js", import.meta.url)
        .href
    )) as {
      createSceneAudioGenerationJobHandler(input: {
        database: DatabaseClient;
        storage: { putBytes: () => Promise<{ checksumSha256: string }> };
        provider: {
          providerId: string;
          outputFormat: "wav";
          contentType: "audio/wav";
          synthesize(input: { narration: string }): {
            bytes: Uint8Array;
            durationMs: number;
            timing: { text: string; startMs: number; endMs: number }[];
          };
        };
      }): RegisteredJobHandler;
    };
    const synthesized: string[] = [];
    const handler = worker.createSceneAudioGenerationJobHandler({
      database: database.client,
      storage: { putBytes: async () => ({ checksumSha256: "a".repeat(64) }) },
      provider: {
        providerId: "fixture-v1",
        outputFormat: "wav",
        contentType: "audio/wav",
        synthesize({ narration }) {
          synthesized.push(narration);
          const durationMs = narration.startsWith("Scene 6.") ? 38000 : 40000;
          return {
            bytes: new Uint8Array(44),
            durationMs,
            timing: [{ text: narration, startMs: 0, endMs: durationMs }],
          };
        },
      },
    });
    const audio = new SceneAudioService(database.client);
    await audio.generateAll({
      ...scope,
      correlationId: createId(),
      body: { idempotencyKey: "six-scene-generation" },
    });
    const initialJobs = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "tts.generate"));
    const rows = await database.client.select().from(sceneAudio);
    const failed = rows.find((row) => row.sceneId === payload.scenes[5]!.id)!;
    async function execute(job: typeof jobs.$inferSelect) {
      await handler.handler(job.payload, {
        ...scope,
        jobId: job.id as Identifier,
        correlationId: job.correlationId as Identifier,
        idempotencyKey: job.idempotencyKey,
        attempt: 1,
        heartbeat: async () => {},
        reportProgress: async () => {},
      });
      await database.client
        .update(jobs)
        .set({ state: "succeeded", attempts: 1 })
        .where(eq(jobs.id, job.id));
    }
    for (const job of initialJobs.filter((job) => job.id !== failed.jobId))
      await execute(job);
    await database.client
      .update(sceneAudio)
      .set({ status: "failed", failureCode: "PROVIDER_UNAVAILABLE" })
      .where(eq(sceneAudio.id, failed.id));
    await database.client
      .update(jobs)
      .set({
        state: "failed",
        attempts: 1,
        errorClassification: "retryable",
        errorMetadata: { code: "PROVIDER_UNAVAILABLE" },
      })
      .where(eq(jobs.id, failed.jobId!));
    const before = await readiness.read(scope);
    expect(
      (await database.client.select().from(sceneAudio)).filter(
        (row) => row.status === "ready",
      ),
    ).toHaveLength(5);
    expect(before.capabilities.edit).toBe(true);
    expect(before.capabilities.preview).toBe(true);
    expect(before.capabilities.render).toBe(false);
    await start();
    await tick();
    const tasks = await database.client.select().from(lessonRecoveryTasks);
    expect(
      tasks.map((task) => ({
        sceneId: task.sceneId,
        operation: task.operation,
        issues: task.issueCodes,
      })),
    ).toEqual([
      {
        sceneId: payload.scenes[5]!.id,
        operation: "audio",
        issues: expect.any(Array),
      },
    ]);
    expect(tasks[0]!.sceneId).toBe(payload.scenes[5]!.id);
    expect(tasks[0]!.priorAttempts).toBe(1);
    const [repair] = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.id, tasks[0]!.jobId!));
    await execute(repair!);
    await tick();
    const ready = await readiness.read(scope);
    expect(synthesized).toHaveLength(6);
    expect(ready.actualDurationSeconds).toBe(238);
    expect(ready.targetDurationSeconds).toBe(180);
    expect(
      (await validation.run({ ...scope, body: {} })).issues.filter(
        (issue) =>
          issue.severity === "error" &&
          [
            "audio_missing",
            "audio_not_ready",
            "captions_missing",
            "captions_not_ready",
            "audio_duration_mismatch",
            "narration_duration_mismatch",
            "lesson_duration_mismatch",
          ].includes(issue.code),
      ),
    ).toEqual([]);
    const editor = new PostgresStoryboardService(database.client, async () => {
      throw new Error("Source approval is not used by scene editing");
    });
    const current = await readiness.currentSpec(scope);
    const selected = current.storyboard.scenes[0]!;
    await editor.updateScene({
      ...scope,
      sceneId: selected.stableSceneId,
      correlationId: createId(),
      body: {
        expectedRevision: current.row.revision,
        scene: { ...selected.scene, onScreenText: ["Teacher's visual edit"] },
      },
    });
    await deliverChanges();
    await tick();
    expect(
      await database.client
        .select()
        .from(jobs)
        .where(eq(jobs.jobType, "tts.generate")),
    ).toHaveLength(7);
    const edited = await readiness.currentSpec(scope);
    const narration =
      "Scene 1. The teacher has revised this explanation of evaporation.";
    await editor.updateScene({
      ...scope,
      sceneId: selected.stableSceneId,
      correlationId: createId(),
      body: {
        expectedRevision: edited.row.revision,
        scene: { ...edited.storyboard.scenes[0]!.scene, narration },
      },
    });
    await deliverChanges();
    await tick();
    const latestJobs = await database.client
      .select()
      .from(jobs)
      .where(eq(jobs.jobType, "tts.generate"));
    expect(latestJobs).toHaveLength(8);
    const nextJob = latestJobs.find(
      (job) =>
        job.id !== repair!.id &&
        !initialJobs.some((initial) => initial.id === job.id),
    )!;
    await execute(nextJob);
    await tick();
    const saved = (await readiness.currentSpec(scope)).storyboard.scenes[0]!
      .scene;
    expect(saved.narration).toBe(narration);
    expect(saved.onScreenText).toEqual(["Teacher's visual edit"]);
    expect(synthesized).toHaveLength(7);
  }, 30000);
});
