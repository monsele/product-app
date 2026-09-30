/**
 * ST-107 — the video brief, run budget ledger, bounded self-repair and
 * decision log on real Postgres.
 *
 * The brief comes from the real `ProviderOneShotBriefService` with the
 * deterministic mock provider, reading a seeded parsed document and the
 * migrated sound-bed catalog. Ticks travel through the real outbox and job
 * table; only the stage pipeline behind the gateway is simulated.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PublicError, togetherModelDefaults, type Identifier } from "@avlp/config";
import {
  auditEvents,
  contentBlocks,
  jobs,
  migrateDatabase,
  modelCalls,
  oneShotRunBriefs,
  oneShotRunDecisions,
  oneShotRuns,
  outboxEvents,
  parsedDocuments,
  parsedSections,
  projects,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  usageRecords,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { executeJobDelivery, PostgresJobRepository } from "@avlp/jobs";
import {
  DynamicMockLanguageModelProvider,
  type LanguageModelProvider,
  type ProviderCompletionRequest,
} from "@avlp/provider-adapters";
import { and, eq, sql } from "drizzle-orm";
import {
  createOneShotAdvanceJobHandler,
  OneShotRunnerHost,
  OutboxOneShotTickScheduler,
  PostgresOneShotService,
  type OneShotPilotCohort,
  type OneShotPricing,
} from "./one-shot.js";
import { ProviderOneShotBriefService } from "./one-shot-brief.js";
import { FakePipeline } from "./one-shot-test-pipeline.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

const ownerUserId = "019ffc60-aaaa-7000-8000-000000000107" as Identifier;
const otherOwnerUserId = "019ffc60-bbbb-7000-8000-000000000107" as Identifier;
const projectId = "019ffc60-cccc-7000-8000-000000000107" as Identifier;
const correlationId = "019ffc60-dddd-7000-8000-000000000107" as Identifier;
const sourceDocumentId = "019ffc60-eeee-7000-8000-000000000107" as Identifier;
const artifactId = "019ffc60-ffff-7000-8000-000000000107" as Identifier;
const parsedDocumentId = "019ffc60-1111-7000-8000-000000000107" as Identifier;
const sectionIds = [
  "019ffc60-5ec1-7000-8000-000000000001",
  "019ffc60-5ec1-7000-8000-000000000002",
  "019ffc60-5ec1-7000-8000-000000000003",
] as Identifier[];
const secretBody = "Hidden body text past the first block must never reach the brief.";

const pricing: OneShotPricing = {
  modelCallCostUsd: 1.08,
  imageCostUsd: 0.00225,
  ttsCostUsdPerMillionCharacters: 15,
  alignmentCostUsdPerAudioMinute: 0.0015,
};
const briefBody = {
  focusPrompt: "Explain how trusses spread load through triangles",
  audience: { ageBand: "adult-professional", difficulty: "advanced", tone: "academic" },
  targetDurationSeconds: 180,
};
const scope = { ownerUserId, projectId };

/** Answers every brief with a section ID that is not in the document. */
class InventingProvider implements LanguageModelProvider {
  public readonly providerId = "together";
  public readonly supportedModels = [togetherModelDefaults.llm] as const;
  public calls = 0;
  public async complete(request: ProviderCompletionRequest) {
    this.calls += 1;
    return {
      providerId: this.providerId,
      model: request.model,
      text: JSON.stringify({
        schemaVersion: "one-shot-brief-v1",
        subject: "Engineering",
        lessonTitle: "Trusses",
        coverage: [
          { point: "Load", sectionIds: ["019ffc60-dead-7000-8000-000000000001"] },
          { point: "Triangles", sectionIds: [sectionIds[1]] },
        ],
        notCovered: [],
        plannedSceneCount: 6,
        stylePackId: "hologram",
        stylePackReason: "Shiny.",
        soundBed: "invented-track",
        soundBedReason: "Nice.",
      }),
      finishReason: "stop" as const,
      usage: { inputTokens: 100, outputTokens: 50 },
      latencyMs: 5,
      retries: 0,
    };
  }
}

describeWithPostgres("ST-107 brief, budget, self-repair and decisions (Postgres)", () => {
  let database: TestDatabase | undefined;
  let clock = new Date("2026-09-27T10:00:00.000Z");
  const now = () => clock;
  let cohort: { enabled: boolean; members: Set<string> };
  let fake: FakePipeline;
  let provider: LanguageModelProvider;

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
    await client.delete(contentBlocks);
    await client.delete(parsedSections);
    await client.delete(parsedDocuments);
    await client.delete(sourceDocumentIngestionArtifacts);
    await client.delete(sourceDocuments);
    await client.delete(projects);
    await client.delete(users);
    await seed(client);
    clock = new Date("2026-09-27T10:00:00.000Z");
    cohort = { enabled: true, members: new Set([ownerUserId]) };
    fake = pipelineCitingEveryBriefSection();
    provider = new DynamicMockLanguageModelProvider({ providerId: "together" });
  });

  afterAll(async () => {
    await database?.destroy();
  });

  const pilotCohort: OneShotPilotCohort = {
    enabled: () => cohort.enabled,
    includes: (userId) => cohort.members.has(userId),
  };

  function service(maxBriefRevisions = 3) {
    return new PostgresOneShotService(
      database!.client,
      pilotCohort,
      new OutboxOneShotTickScheduler(now),
      {
        saveLessonVersion: async () => {
          throw new PublicError("bad_request", "Unexpected render.", 409);
        },
        startRender: async () => {
          throw new PublicError("bad_request", "Unexpected render.", 409);
        },
      },
      {
        pricing,
        maxRunsPerHour: 10,
        briefs: new ProviderOneShotBriefService({
          database: database!.client,
          provider,
          quotaGuard: { assertCanGenerate: async () => {} },
          maxRepairs: 1,
          now,
        }),
        budgetTolerance: 1.25,
        maxBriefRevisions,
      },
      now,
    );
  }

  function host() {
    return new OneShotRunnerHost(database!.client, fake, new OutboxOneShotTickScheduler(now), now);
  }

  async function pumpOnce(): Promise<number> {
    const repository = new PostgresJobRepository(database!.client);
    const handler = createOneShotAdvanceJobHandler(host());
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

  async function pump(rounds = 120, between?: (round: number) => void) {
    for (let round = 0; round < rounds; round += 1) {
      clock = new Date(clock.getTime() + 3_000);
      await pumpOnce();
      between?.(round);
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

  async function brief(key: string, body = briefBody, subject = service()) {
    return subject.brief({ ...scope, body, idempotencyKey: key, correlationId });
  }

  async function confirm(briefRevision: number, acceptedEstimateUsd: number, extra: Record<string, unknown> = {}) {
    return service().create({
      ...scope,
      body: { briefRevision, acceptedEstimateUsd, ...extra },
      idempotencyKey: undefined,
      correlationId,
    });
  }

  function pipelineCitingEveryBriefSection(): FakePipeline {
    const pipeline = new FakePipeline();
    pipeline.promise = {
      ...pipeline.promise,
      sceneSections: sectionIds.map((sectionId, index) => ({
        sceneId: `s${index + 1}`,
        order: index + 1,
        sectionIds: [sectionId],
      })),
      sectionOrder: new Map(sectionIds.map((id, index) => [id, index])),
    };
    return pipeline;
  }

  it("prepares a grounded brief, runs nothing paid until confirmation, then drives the chain", async () => {
    const prepared = await brief("brief-1");
    const view = prepared.brief!;
    expect(view.revision).toBe(1);
    // Every coverage section is a real section of the document, with chips.
    for (const point of view.coverage)
      for (const id of point.sectionIds) expect(sectionIds).toContain(id);
    expect(view.sections.map((entry) => entry.sectionId).sort()).toEqual(
      [...new Set(view.coverage.flatMap((point) => point.sectionIds))].sort(),
    );
    expect(view.stylePackId).toBe("essential");
    expect(view.soundBed).toBe("morning-pad");
    expect(view.stylePackReason.length).toBeGreaterThan(0);
    expect(view.estimate.pricingVersion).toBe("one-shot-estimate-v3");
    expect(prepared.revisionsUsed).toBe(1);

    // The brief call saw headings and first blocks, never the rest of the body.
    const mock = provider as DynamicMockLanguageModelProvider;
    const sent = mock.requests.map((request) => request.messages.map((m) => m.content).join("\n")).join("\n");
    expect(sent).toContain("Load paths");
    expect(sent).not.toContain(secretBody);
    // A heading with no content is never offered: no scene could cite it.
    expect(sent).not.toContain("Load glossary");

    // Nothing paid beyond the brief: one metered call, no job queued.
    const usage = await database!.client.select().from(usageRecords);
    expect(usage.map((record) => record.operationType)).toEqual(["ai.one-shot-brief"]);
    expect(await database!.client.select().from(jobs)).toHaveLength(0);
    expect(await latestRun()).toMatchObject({ status: "brief_ready", confirmedBriefRevision: null });

    // Confirm with a changed style pack; the sound bed stays the brief's.
    const started = await confirm(1, view.estimate.totalUsd, { stylePackId: "systems" });
    expect(started.run).toMatchObject({
      status: "queued",
      briefRevision: 1,
      stylePackId: "systems",
      soundBed: "morning-pad",
      budget: { reservedUsd: view.estimate.totalUsd, reservationRevision: 1, proposedEstimateUsd: null },
    });
    expect(started.run!.budget!.capUsd).toBeCloseTo(view.estimate.totalUsd * 1.25, 5);

    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");
    expect(fake.config).toMatchObject({ creativeStylePack: "systems", soundBed: "morning-pad" });
    expect(fake.briefCoverageSeen).toEqual(view.coverage.map((point) => point.point));
    expect(fake.calls).not.toContain("inferIntent");

    // The decision log and ledger survive a reload and match the usage records.
    const reloaded = await service().decisions(scope);
    expect(reloaded.runId).toBe(run.id);
    const kinds = reloaded.decisions.map((entry) => entry.kind);
    expect(kinds.slice(0, 4)).toEqual(["brief", "style_pack", "sound_bed", "budget_reservation"]);
    expect(kinds.filter((kind) => kind === "auto_approval")).toHaveLength(5);
    expect(reloaded.decisions.map((entry) => entry.seq)).toEqual(
      reloaded.decisions.map((_, index) => index + 1),
    );
    expect(reloaded.decisions[1]).toMatchObject({ summary: "Style pack: systems.", reason: expect.stringContaining("Chosen by you") });
    expect(reloaded.decisions[0]).toMatchObject({ model: expect.any(String), costUsd: expect.any(Number) });
    const usageTotal = (await database!.client.select().from(usageRecords))
      .filter((record) => record.correlationId === correlationId)
      .reduce((sum, record) => sum + Number(record.estimatedCostUsd), 0);
    const ledgerTotal = reloaded.ledger.reduce((sum, line) => sum + line.actualUsd, 0);
    expect(ledgerTotal).toBeCloseTo(usageTotal, 6);
    const briefLine = reloaded.ledger.find((line) => line.step === "brief")!;
    expect(briefLine.usageRecordIds).toHaveLength(1);
    expect(briefLine.estimateUsd).toBeCloseTo(1.08, 6);
    expect(reloaded.budget).toMatchObject({ reservationRevision: 1 });

    // The decision log is append-only.
    await expect(
      database!.client.execute(sql`update one_shot_run_decisions set summary = 'edited'`),
    ).rejects.toThrow();

    // Audit carries no user content.
    const audits = await database!.client
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "one_shot.brief_prepared"));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]!.metadata)).not.toContain("truss");
  });

  it("ST-112: persists the visual plan step, its decisions and its ledger line for a v2 design", async () => {
    fake.designRelease = "v2";
    const prepared = await brief("brief-1");
    const estimate = prepared.brief!.estimate;
    // The accepted estimate reserves the plan call and the picture allowance.
    expect(estimate.items.find((item) => item.key === "ai.visual-plan")).toMatchObject({ quantity: 1 });
    await confirm(1, estimate.totalUsd);

    // As the worker meters the plan call: under the run's correlation id.
    await database!.client.insert(usageRecords).values({
      id: "019ffc60-7777-7000-8000-000000000112",
      ownerUserId,
      projectId,
      operationType: "ai.creative_design",
      idempotencyKey: "visual-plan:test",
      provider: "fake",
      model: "mock-model-1",
      unit: "token",
      quantity: "200",
      estimatedCostUsd: "0.040000",
      status: "succeeded",
      correlationId,
      occurredAt: clock,
    });
    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");

    const view = (await service().current(scope)).run!;
    expect(view.steps.map((entry) => entry.step)).toEqual([
      "ingestion",
      "source_snapshot",
      "configuration",
      "objectives",
      "outline",
      "narration",
      "storyboard",
      "visual_plan",
      "illustrations",
      "grounding",
      "audio",
      "validation",
    ]);
    // Fallbacks, composition distribution and image use are on the steps.
    expect(view.steps.find((entry) => entry.step === "visual_plan")).toMatchObject({
      state: "done",
      jobId: fake.visualPlanJob!.id,
      detail: { visualPlan: "model" },
    });
    expect(view.steps.find((entry) => entry.step === "illustrations")?.detail).toMatchObject({
      queued: 2,
      reused: 1,
      motif: 1,
      designApplied: true,
      families: "sequence:1,statement:2",
      pictures: 2,
    });

    const reloaded = await service().decisions(scope);
    const summaries = reloaded.decisions.map((entry) => entry.summary);
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Planned the visuals"),
        expect.stringContaining("drawn motif instead of a generated picture"),
        "Applied the planned visual design automatically.",
      ]),
    );
    // Cost and estimate sit on the plan's own ledger line.
    const line = reloaded.ledger.find((entry) => entry.step === "visual_plan")!;
    expect(line.estimateUsd).toBeCloseTo(1.08, 6);
    expect(line.actualUsd).toBeCloseTo(0.04, 6);
    expect(line.usageRecordIds).toEqual(["019ffc60-7777-7000-8000-000000000112"]);
    expect(reloaded.ledger.map((entry) => entry.step)).not.toContain("other");
  });

  it("rejects a brief that names a section, style pack or track that does not exist, with no silent fallback", async () => {
    const inventing = new InventingProvider();
    provider = inventing;
    await expect(brief("brief-1")).rejects.toMatchObject({ statusCode: 502 });
    // The bounded repair policy asked again once, then gave up.
    expect(inventing.calls).toBe(2);
    expect(await database!.client.select().from(oneShotRunBriefs)).toHaveLength(0);
    const run = await latestRun();
    expect(run).toMatchObject({ status: "brief_pending", briefAttempts: 1 });
    // The failed call is still recorded and metered.
    const [call] = await database!.client.select().from(modelCalls);
    expect(call).toMatchObject({ operationType: "ai.one-shot-brief", status: "failed", validationStatus: "invalid" });
    expect(await database!.client.select().from(usageRecords)).toHaveLength(1);
  });

  it("allows at most the configured number of brief calls and rejects confirming a stale revision", async () => {
    await brief("brief-1");
    const second = await brief("brief-2", { ...briefBody, focusPrompt: "Explain why triangles are rigid" });
    expect(second.brief!.revision).toBe(2);
    expect(second.brief!.focusPrompt).toBe("Explain why triangles are rigid");

    await expect(confirm(1, second.brief!.estimate.totalUsd)).rejects.toMatchObject({ statusCode: 409 });
    await expect(confirm(7, second.brief!.estimate.totalUsd)).rejects.toMatchObject({ statusCode: 409 });

    await brief("brief-3");
    await expect(brief("brief-4")).rejects.toMatchObject({ statusCode: 409 });
    expect((await service().currentBrief(scope)).revisionsUsed).toBe(3);

    const started = await confirm(3, second.brief!.estimate.totalUsd);
    expect(started.run).toMatchObject({ status: "queued", briefRevision: 3, focusPrompt: briefBody.focusPrompt });
    await expect(brief("brief-5")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("stops before a paid step that would pass the cap, and continues only after a new estimate is accepted", async () => {
    const prepared = await brief("brief-1");
    const total = prepared.brief!.estimate.totalUsd;
    await confirm(1, total);
    // Part-way through, spend jumps close to the cap.
    const stopped = await pump(120, (round) => {
      if (round === 6) fake.cost = total * 1.25 - 0.5;
    });
    expect(stopped).toMatchObject({ status: "needs_attention", errorCode: "ONE_SHOT_BUDGET_CAP" });
    const view = (await service().current(scope)).run!;
    const proposal = view.budget!.proposedEstimateUsd!;
    expect(proposal).toBeGreaterThan(total * 1.25 - 0.5);

    // A lower estimate and a stale revision are both refused.
    await expect(
      service().acceptBudget({ ...scope, body: { reservationRevision: 1, acceptedEstimateUsd: proposal - 0.01 }, correlationId }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service().acceptBudget({ ...scope, body: { reservationRevision: 0, acceptedEstimateUsd: proposal }, correlationId }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const accepted = await service().acceptBudget({
      ...scope,
      body: { reservationRevision: 1, acceptedEstimateUsd: proposal },
      correlationId,
    });
    expect(accepted.run).toMatchObject({
      status: "running",
      needsAttention: null,
      budget: { reservedUsd: proposal, reservationRevision: 2, proposedEstimateUsd: null },
    });
    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");
    const decisions = await service().decisions(scope);
    expect(decisions.decisions.filter((entry) => entry.kind === "budget_reservation")).toHaveLength(2);
  });

  it("repairs a text overflow and a monotonous run automatically, logging each repair", async () => {
    fake.findingsDriveValidation = true;
    fake.repairContextFake = {
      scenes: [1, 2, 3, 4].map((index) => ({
        sceneId: `019ffc60-5ce0-7000-8000-00000000000${index}`,
        order: index,
        template: "concept",
        blockIds: [],
        sectionIds: [],
      })),
      objectives: [],
    };
    const [s1, s2, s3, s4] = fake.repairContextFake.scenes.map((entry) => entry.sceneId);
    fake.findings = [
      { code: "text_overflow", severity: "error", sceneId: s1!, scopeId: s1!, details: {} },
      { code: "scene_monotony", severity: "warning", sceneId: s2!, scopeId: s2!, details: { sceneIds: [s2, s3, s4], template: "concept" } },
    ];
    fake.onRepairApplied = (sceneId, pipeline) => {
      pipeline.findings = pipeline.findings.filter((entry) =>
        sceneId === s1 ? entry.code !== "text_overflow" : entry.code !== "scene_monotony",
      );
    };
    const prepared = await brief("brief-1");
    await confirm(1, prepared.brief!.estimate.totalUsd);
    const run = await pump();
    expect(run.status).toBe("awaiting_render_approval");
    expect(fake.findings).toEqual([]);
    expect(fake.repairJobs.map((job) => job.sceneId)).toEqual([s1, s3]);
    const decisions = (await service().decisions(scope)).decisions.filter((entry) => entry.kind === "repair");
    expect(decisions.map((entry) => entry.summary)).toEqual([
      "Round 1: regenerating scene 1 because on-screen text overflowed its layout.",
      "Round 1: regenerating scene 3 because too many scenes in a row used the same template.",
      "Round 1: applied the regenerated scene 1.",
      "Round 1: applied the regenerated scene 3.",
    ]);
    expect(run.repairState).toMatchObject({ roundsDone: 1, active: null });
  });

  it("escalates a grounding finding without repairing or acknowledging it", async () => {
    fake.findingsDriveValidation = true;
    fake.findings = [{ code: "grounding_missing", severity: "error", sceneId: null, scopeId: null, details: {} }];
    const prepared = await brief("brief-1");
    await confirm(1, prepared.brief!.estimate.totalUsd);
    const run = await pump();
    expect(run).toMatchObject({ status: "needs_attention", needsAttentionStage: "preview", errorCode: "VALIDATION_BLOCKING" });
    expect(fake.repairJobs).toEqual([]);
    expect(fake.findings).toHaveLength(1);
  });

  it("deduplicates a repair job replayed by a tick that died before saving", async () => {
    fake.findingsDriveValidation = true;
    const sceneId = "019ffc60-5ce0-7000-8000-000000000001";
    fake.repairContextFake = {
      scenes: [{ sceneId, order: 1, template: "concept", blockIds: [], sectionIds: [] }],
      objectives: [],
    };
    fake.findings = [{ code: "text_overflow", severity: "error", sceneId, scopeId: sceneId, details: {} }];
    const prepared = await brief("brief-1");
    await confirm(1, prepared.brief!.estimate.totalUsd);
    let beforeRepair: typeof oneShotRuns.$inferSelect | undefined;
    for (let round = 0; round < 80 && fake.repairJobs.length === 0; round += 1) {
      beforeRepair = await latestRun();
      clock = new Date(clock.getTime() + 3_000);
      await pumpOnce();
      if (fake.repairJobs.length === 0) fake.completeJobs();
    }
    expect(fake.repairJobs).toHaveLength(1);
    // The tick that queued the repair "died": its save is lost.
    await database!.client
      .update(oneShotRuns)
      .set({ repairState: beforeRepair!.repairState, steps: beforeRepair!.steps })
      .where(eq(oneShotRuns.id, beforeRepair!.id));
    clock = new Date(clock.getTime() + 3_000);
    await pumpOnce();
    expect(fake.repairJobs).toHaveLength(1);
    expect(fake.keys.filter((key) => key.includes(":repair:1:"))).toEqual([
      `oneshot:${beforeRepair!.id}:repair:1:${sceneId}`,
      `oneshot:${beforeRepair!.id}:repair:1:${sceneId}`,
    ]);
  });

  it("keeps every endpoint behind the cohort and the tenant", async () => {
    const prepared = await brief("brief-1");
    // Another tenant sees no brief, no decisions and cannot confirm or accept.
    cohort.members.add(otherOwnerUserId);
    const foreign = { ownerUserId: otherOwnerUserId, projectId };
    expect((await service().currentBrief(foreign)).brief).toBeNull();
    expect(await service().decisions(foreign)).toEqual({ runId: null, decisions: [], ledger: [], budget: null });
    await expect(
      service().create({ ...foreign, body: { briefRevision: 1, acceptedEstimateUsd: 100 }, idempotencyKey: undefined, correlationId }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      service().acceptBudget({ ...foreign, body: { reservationRevision: 0, acceptedEstimateUsd: 100 }, correlationId }),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Outside the cohort: hidden reads and refused writes.
    cohort.members.delete(ownerUserId);
    await expect(service().currentBrief(scope)).rejects.toMatchObject({ statusCode: 404 });
    expect((await service().decisions(scope)).decisions).toEqual([]);
    await expect(brief("brief-2")).rejects.toMatchObject({ statusCode: 409 });

    // Flag off: members keep their reads but cannot brief or confirm.
    cohort.members.add(ownerUserId);
    cohort.enabled = false;
    await expect(brief("brief-2")).rejects.toMatchObject({ statusCode: 409 });
    await expect(confirm(1, prepared.brief!.estimate.totalUsd)).rejects.toMatchObject({ statusCode: 409 });
    expect((await service().currentBrief(scope)).brief!.revision).toBe(1);

    const rows = await database!.client
      .select()
      .from(oneShotRunDecisions)
      .where(and(eq(oneShotRunDecisions.ownerUserId, otherOwnerUserId)));
    expect(rows).toHaveLength(0);
  });
});

async function seed(database: DatabaseClient): Promise<void> {
  const timestamp = new Date("2026-09-27T09:00:00.000Z");
  await database.insert(users).values([
    { id: ownerUserId, emailNormalized: "brief-owner@example.test", displayName: "Owner", createdAt: timestamp, updatedAt: timestamp },
    { id: otherOwnerUserId, emailNormalized: "brief-other@example.test", displayName: "Other", createdAt: timestamp, updatedAt: timestamp },
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
    id: sourceDocumentId,
    ownerUserId,
    projectId,
    originalName: "trusses.pdf",
    mediaType: "application/pdf",
    sizeBytes: 1_000,
    sha256: "d".repeat(64),
    storageKey: "users/tenant/trusses.pdf",
    pageCount: 3,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(sourceDocumentIngestionArtifacts).values({
    id: artifactId,
    ownerUserId,
    projectId,
    sourceDocumentId,
    parserVersion: "docling-v1",
    normalizedSchemaVersion: "1.0",
    canonicalStorageKey: "users/tenant/trusses-canonical.json",
    state: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(parsedDocuments).values({
    id: parsedDocumentId,
    ownerUserId,
    projectId,
    ingestionArtifactId: artifactId,
    sourceDocumentId,
    version: 1,
    schemaVersion: "1.0",
    parserVersion: "docling-v1",
    adapterVersion: "1.0",
    normalizedStorageKey: "users/tenant/trusses-normalized.json",
    title: "Truss engineering",
    language: "en",
    pageCount: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  const headings = ["Load paths in trusses", "Triangles and rigidity", "Famous bridges"];
  // A section with a heading and no blocks, like a document-title heading.
  await database.insert(parsedSections).values({
    id: "019ffc60-5ec1-7000-8000-000000000009",
    parsedDocumentId,
    order: 4,
    level: 1,
    heading: "Load glossary",
    pageStart: 3,
    pageEnd: 3,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await database.insert(parsedSections).values(
    headings.map((heading, index) => ({
      id: sectionIds[index]!,
      parsedDocumentId,
      order: index + 1,
      level: 1,
      heading,
      pageStart: index + 1,
      pageEnd: index + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
  await database.insert(contentBlocks).values(
    headings.flatMap((heading, index) => [
      {
        id: `019ffc60-b10c-7000-8000-00000000000${index * 2 + 1}`,
        parsedDocumentId,
        sectionId: sectionIds[index]!,
        kind: "paragraph",
        order: 1,
        pageStart: index + 1,
        pageEnd: index + 1,
        content: { text: `${heading}: the load spreads through each member of the truss.` },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: `019ffc60-b10c-7000-8000-00000000000${index * 2 + 2}`,
        parsedDocumentId,
        sectionId: sectionIds[index]!,
        kind: "paragraph",
        order: 2,
        pageStart: index + 1,
        pageEnd: index + 1,
        content: { text: secretBody },
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]),
  );
}
