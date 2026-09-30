/**
 * ST-112 — the services the prompt-to-video runner drives for a v2 design,
 * against Postgres: queueing the visual planner, applying the planned design
 * and validating a lesson whose decorative slots stay unbound.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  creativeDesignSnapshots,
  jobs,
  lessonSpecs,
  migrateDatabase,
  outboxEvents,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  creativeDesignHash,
  isCreativeDesignManifestV2,
  modelCallJobPayloadSchema,
  planCinemaDesign,
  sceneSpecSchema,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  blockA,
  definitionScene,
  lessonSpecId,
  now,
  ownerUserId,
  processScene,
  projectId,
  scope,
  seed,
  storyboardPayload,
} from "./cinema-lesson.fixture.js";
import {
  PostgresCreativeDesignService,
  visualPlanMaxAttempts,
} from "./creative-design.js";
import { IllustrationGenerationService } from "./illustration-generation.js";
import { PostgresLessonValidationService } from "./lesson-validation.js";
import {
  ServiceOneShotGateway,
  type OneShotGatewayServices,
} from "./one-shot-gateway.js";
import type { OneShotCallContext } from "./one-shot-runner.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const draftId: Identifier = "019ffbf1-8888-7000-8000-000000000112";
const oneShotRunId: Identifier = "019ffbf1-abab-7000-8000-000000000112";
const correlationId: Identifier = "019ffbf1-0000-7000-8000-000000000112";
const otherOwner: Identifier = "019ffbf1-aaab-7000-8000-000000000112";
const lesson = [definitionScene, processScene];
const sceneSpecs = lesson.map((scene) => sceneSpecSchema.parse(scene));
const v2Design = () =>
  planCinemaDesign({ packId: "everyday", scenes: sceneSpecs, seed: "0123456789abcdef" });

const request = {
  ...scope,
  correlationId,
  requestKey: `oneshot:${oneShotRunId}:visual_plan:r0:${lessonSpecId}`,
  oneShotRunId,
};

/** Scene rows for the seeded storyboard; `requirements` plans slots on scene A. */
async function seedScenes(
  client: DatabaseClient,
  requirements: { slot: string; purpose: string }[] = [],
) {
  const base = storyboardPayload();
  const payload = {
    ...base,
    scenes: base.scenes.map((entry, index) => ({
      ...entry,
      assetRequirements: index === 0 ? requirements : [],
    })),
  };
  await client.update(lessonSpecs).set({ payload }).where(eq(lessonSpecs.id, lessonSpecId));
  await client.insert(scenes).values(
    payload.scenes.map((entry) => ({
      id: entry.id,
      projectId,
      ownerUserId,
      lessonSpecId,
      stableSceneId: entry.stableSceneId,
      order: entry.order,
      template: entry.template,
      durationSeconds: entry.durationSeconds,
      narrationBlockIds: [blockA],
      assetRequirements: entry.assetRequirements,
      sceneJson: entry.scene,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

async function seedDraft(client: DatabaseClient, manifest: unknown, options: { applied?: boolean } = {}) {
  const manifestHash = creativeDesignHash(manifest as Parameters<typeof creativeDesignHash>[0]);
  await client.insert(creativeDesignDrafts).values({
    id: draftId,
    projectId,
    ownerUserId,
    lessonSpecId,
    lessonSpecRevision: 0,
    manifest,
    manifestHash,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (options.applied === true)
    await client.insert(creativeDesignSnapshots).values({
      id: "019ffbf1-8889-7000-8000-000000000112",
      projectId,
      ownerUserId,
      lessonSpecId,
      lessonSpecRevision: 0,
      manifest,
      manifestHash,
      createdAt: now,
    });
}

describeWithPostgres("ST-112 visual design services for a run (Postgres)", () => {
  let database: TestDatabase | undefined;
  let design: PostgresCreativeDesignService;
  const client = () => database!.client;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seed(client());
    // A ticking clock: the newest snapshot of a revision is the one in use.
    let elapsed = 0;
    design = new PostgresCreativeDesignService(
      client(),
      () => new Date(now.getTime() + (elapsed += 1_000)),
    );
  });

  afterAll(async () => {
    await database?.destroy();
  });

  const planJobs = () =>
    client()
      .select()
      .from(jobs)
      .where(and(eq(jobs.projectId, projectId), eq(jobs.jobType, "creative-design.visual-plan")));

  it("queues one planner job for the current v2 draft, as the worker expects it", async () => {
    await seedScenes(client());
    await seedDraft(client(), v2Design());

    const queued = await design.requestVisualPlan(request);
    expect(queued).toMatchObject({ draftId, draftRevision: 1 });
    if ("skipped" in queued) throw new Error("expected a job");

    const [job] = await planJobs();
    expect(job).toMatchObject({
      id: queued.jobId,
      queueName: "pipeline",
      ownerUserId,
      payloadVersion: 2,
      correlationId,
    });
    const payload = modelCallJobPayloadSchema.parse(job!.payload);
    expect(payload).toMatchObject({
      operationType: "ai.creative_design",
      promptId: "visual-plan",
      promptVersion: "v1",
      params: { draftId, draftRevision: 1 },
      // The paid call traces back to the run's single authorisation.
      providerApproval: { selectionReason: "one_shot_run", oneShotRunId },
    });
    const events = await client().select().from(outboxEvents).where(eq(outboxEvents.jobId, queued.jobId));
    expect(events).toHaveLength(1);
    // The handler falls back on its final attempt; both must agree on which.
    expect(events[0]!.deliveryOptions).toMatchObject({ maxAttempts: visualPlanMaxAttempts });
    expect(visualPlanMaxAttempts).toBe(3);
  });

  it("is idempotent on the request key: a replayed tick queues nothing new", async () => {
    await seedScenes(client());
    await seedDraft(client(), v2Design());

    const first = await design.requestVisualPlan(request);
    const replay = await design.requestVisualPlan(request);
    expect(replay).toEqual(first);
    expect(await planJobs()).toHaveLength(1);
    expect(await client().select().from(outboxEvents)).toHaveLength(1);
  });

  it("plans nothing for a v1 design, a lesson without one, or another tenant", async () => {
    await seedScenes(client());
    await expect(design.requestVisualPlan(request)).resolves.toEqual({ skipped: "no_design" });

    const planned = await design.plan({ ...scope, body: { packId: "everyday", expectedRevision: 0 } });
    expect(planned.manifest.manifestVersion).toBe("1.0");
    await expect(design.requestVisualPlan(request)).resolves.toEqual({ skipped: "design_v1" });

    await client().delete(creativeDesignDrafts);
    await seedDraft(client(), v2Design());
    await expect(
      design.requestVisualPlan({ ...request, ownerUserId: otherOwner }),
    ).resolves.toEqual({ skipped: "no_design" });
    expect(await planJobs()).toHaveLength(0);
  });

  it("applies the current storyboard's draft when an earlier storyboard's draft also exists", async () => {
    // An earlier storyboard of the same project, with its own design draft.
    const earlierSpecId: Identifier = "019ffbf1-6665-7000-8000-000000000112";
    const [current] = await client().select().from(lessonSpecs).where(eq(lessonSpecs.id, lessonSpecId));
    await client().insert(lessonSpecs).values({
      ...current!,
      id: earlierSpecId,
      idempotencyKey: "design-v2:storyboard:earlier",
      generatedAt: new Date(now.getTime() - 60_000),
    });
    const earlier = v2Design();
    await client().insert(creativeDesignDrafts).values({
      id: "019ffbf1-8887-7000-8000-000000000112",
      projectId,
      ownerUserId,
      lessonSpecId: earlierSpecId,
      lessonSpecRevision: 0,
      manifest: earlier,
      manifestHash: creativeDesignHash(earlier),
      revision: 7,
      createdAt: now,
      updatedAt: now,
    });
    await seedScenes(client());
    await seedDraft(client(), v2Design());

    const applied = await design.apply({ ...scope, expectedRevision: 1 });
    const [snapshot] = await client()
      .select()
      .from(creativeDesignSnapshots)
      .where(eq(creativeDesignSnapshots.id, applied.snapshotId));
    expect(snapshot).toMatchObject({ lessonSpecId, lessonSpecRevision: 0 });
    expect((await design.getDraft(scope))?.applied).toBe(true);
  });

  describe("through the run's gateway", () => {
    const context: OneShotCallContext = { ...request };
    const gateway = () =>
      new ServiceOneShotGateway({
        database: client(),
        creativeDesign: design,
        illustrations: new IllustrationGenerationService(client(), () => now),
        validation: new PostgresLessonValidationService(client(), () => now),
      } as unknown as OneShotGatewayServices);

    it("reports the v2 design, queues its planner, reads the job and applies the draft", async () => {
      await seedScenes(client());
      await seedDraft(client(), v2Design());
      const subject = gateway();

      const before = await subject.visualDesign(scope);
      expect(before).toMatchObject({ release: "v2", applied: false });
      expect(before.summary?.pictures).toBe(0);
      expect(before.summary?.families).toMatch(/^[a-z-]+:\d(,[a-z-]+:\d)*$/u);

      const queued = await subject.requestVisualPlan(context);
      expect(queued).not.toBeNull();
      await expect(subject.visualPlan(scope, queued!.jobId)).resolves.toMatchObject({
        job: { id: queued!.jobId, state: "queued" },
        outcome: null,
      });
      // As the worker leaves it after its authored fallback.
      await client()
        .update(jobs)
        .set({ state: "succeeded", resultMetadata: { visualPlan: "authored", fallbackReason: "QUOTA_EXCEEDED" } })
        .where(eq(jobs.id, queued!.jobId));
      await expect(subject.visualPlan(scope, queued!.jobId)).resolves.toMatchObject({
        outcome: "authored",
        fallbackReason: "QUOTA_EXCEEDED",
      });
      // Another tenant cannot read the job.
      await expect(
        subject.visualPlan({ ...scope, ownerUserId: otherOwner }, queued!.jobId),
      ).resolves.toEqual({ job: null, outcome: null, fallbackReason: null });

      const applied = await subject.applyVisualDesign(context);
      expect(applied.applied).toBe(true);
      await expect(subject.visualDesign(scope)).resolves.toMatchObject({ release: "v2", applied: true });
    });

    it("an authored v2 design asks for no pictures and queues no slot filling", async () => {
      await seedScenes(client(), [{ slot: "visual-example", purpose: "A picture of evaporation." }]);
      await seedDraft(client(), v2Design(), { applied: true });

      const requested = await gateway().requestIllustrations(context);
      // No brief without a model plan: every scene keeps its authored motif,
      // and the planned decorative slot is not generated for.
      expect(requested).toMatchObject({ queued: 0, cinema: { reused: 0 } });
      expect(
        await client().select().from(jobs).where(eq(jobs.jobType, "illustration.generate")),
      ).toHaveLength(0);
    });

    it("validation lets a v2 lesson leave a planned decorative slot unbound, and no other lesson", async () => {
      const requirement = [{ slot: "visual-example", purpose: "A picture of evaporation." }];
      const assetErrors = async () =>
        (await gateway().validate(scope)).findings?.filter((finding) => finding.code === "asset_required") ?? [];

      await seedScenes(client(), requirement);
      // No design: the legacy look needs the slot filled.
      expect(await assetErrors()).toHaveLength(1);

      // A v1 design needs it too.
      await design.plan({ ...scope, body: { packId: "everyday", expectedRevision: 0 } });
      const draft = await design.getDraft(scope);
      await design.apply({ ...scope, expectedRevision: draft!.revision });
      expect(await assetErrors()).toHaveLength(1);

      // Upgraded to v2 and applied: the same storyboard now validates, under
      // a different input hash, so the earlier failed run is not reused.
      const upgraded = await design.upgrade({ ...scope, body: { expectedRevision: draft!.revision } });
      expect(isCreativeDesignManifestV2(upgraded.manifest)).toBe(true);
      await design.apply({ ...scope, expectedRevision: upgraded.revision });
      expect(await assetErrors()).toEqual([]);
    });
  });
});
