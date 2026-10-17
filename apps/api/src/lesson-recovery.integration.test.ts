import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import {
  authorizeRecoveryCall,
  jobs,
  lessonRecoveryRuns,
  lessonRecoveryTasks,
  migrateDatabase,
  sceneAudio,
  captionTracks,
  scenes,
  voiceConfigurations,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import type { RegisteredJobHandler } from "@avlp/jobs";
import { eq } from "drizzle-orm";
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
    await database.client.delete(lessonRecoveryTasks);
    await database.client.delete(lessonRecoveryRuns);
    await database.client.delete(voiceConfigurations);
    await seed(database.client);
    const storyboard = storyboardPayload();
    await database.client
      .insert(scenes)
      .values(
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
    const [run] = await database.client.select().from(lessonRecoveryRuns);
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
    await start("repair-captions");
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
});
