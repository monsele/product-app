import { describe, expect, it, vi } from "vitest";
import { PublicError, type Identifier } from "@avlp/config";
import type { DatabaseClient } from "@avlp/database";
import {
  ServiceOneShotGateway,
  type OneShotGatewayServices,
} from "./one-shot-gateway.js";
import type { OneShotCallContext } from "./one-shot-runner.js";

const scope = {
  ownerUserId: "019ffc30-aaaa-7000-8000-000000000105" as Identifier,
  projectId: "019ffc30-bbbb-7000-8000-000000000105" as Identifier,
};
const context: OneShotCallContext = {
  ...scope,
  correlationId: "019ffc30-cccc-7000-8000-000000000105" as Identifier,
  oneShotRunId: "019ffc30-dddd-7000-8000-000000000105" as Identifier,
  requestKey: "oneshot:run:objectives:r0",
};
const snapshotId = "019ffc30-eeee-7000-8000-000000000105";

function gateway(overrides: Partial<Record<keyof OneShotGatewayServices, unknown>>) {
  return new ServiceOneShotGateway({
    database: {} as DatabaseClient,
    ...(overrides as Partial<OneShotGatewayServices>),
  } as OneShotGatewayServices);
}

describe("ST-105 one-shot gateway", () => {
  it("passes the run's key, correlation and authorisation to generation", async () => {
    const generate = vi.fn().mockResolvedValue({ jobId: "job-1", status: "queued" });
    const result = await gateway({ objectives: { generate } }).generate(context, "objectives");
    expect(result).toEqual({ jobId: "job-1" });
    expect(generate).toHaveBeenCalledWith({
      ...scope,
      idempotencyKey: context.requestKey,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    });
  });

  it("tells every service it writes through that the run is acting, for the audit trail", async () => {
    const run = { oneShotRunId: context.oneShotRunId };
    const approve = vi.fn().mockResolvedValue({ approved: { id: "set-1", revision: 4 } });
    const snapshotApprove = vi.fn().mockResolvedValue({ snapshot: { id: snapshotId } });
    const accept = vi.fn().mockResolvedValue({});
    const voiceSave = vi.fn().mockResolvedValue({});
    const configurationGet = vi.fn().mockResolvedValue({ configuration: null });
    const configurationSave = vi.fn().mockResolvedValue({ configuration: { version: 1 } });
    const subject = gateway({
      objectives: { approve },
      outline: { approve },
      narration: { approve },
      sourceSnapshots: { approve: snapshotApprove },
      storyboard: { acceptIllustrationCandidate: accept },
      voiceConfiguration: { save: voiceSave },
      lessonConfiguration: { get: configurationGet, save: configurationSave },
    });
    for (const stage of ["objectives", "outline", "narration"] as const)
      await subject.approve(context, stage, 4);
    await subject.approveSourceSnapshot(context);
    await subject.acceptIllustration(context, {
      candidateId: "c" as Identifier,
      sceneId: "s" as Identifier,
      slot: "illustration",
      sceneRevision: 1,
      storyboardRevision: 2,
    });
    await subject.saveDefaultVoice(context);
    await subject.saveConfiguration(context, {
      expectedVersion: 0,
      subject: "Engineering",
      lessonTitle: "Trusses",
      focusPrompt: "How do trusses carry load?",
      audience: { ageBand: "adult-professional", difficulty: "advanced", tone: "academic" },
      targetDurationSeconds: 180,
    });
    for (const call of [
      ...approve.mock.calls,
      ...snapshotApprove.mock.calls,
      ...accept.mock.calls,
      ...voiceSave.mock.calls,
      ...configurationSave.mock.calls,
    ])
      expect(call[0]).toMatchObject(run);
  });

  it("marks objectives stale when the snapshot or configuration moved on", async () => {
    const set = {
      sourceSnapshotId: snapshotId,
      configurationVersion: 2,
      revision: 3,
      focusCoverage: { status: "covered" },
    };
    const services = (configurationVersion: number, currentSnapshot: string) => ({
      objectives: {
        current: vi.fn().mockResolvedValue({
          state: "draft",
          set,
          approved: null,
          latestJob: null,
          canApprove: true,
        }),
      },
      sourceSnapshots: { status: vi.fn().mockResolvedValue({ snapshotId: currentSnapshot }) },
      lessonConfiguration: {
        get: vi.fn().mockResolvedValue({ configuration: { version: configurationVersion, focusPrompt: "x" } }),
      },
    });
    await expect(gateway(services(2, snapshotId)).approvalStage(scope, "objectives")).resolves.toMatchObject({
      state: "draft",
      stale: false,
      revision: 3,
      focusCoverage: { status: "covered" },
    });
    await expect(gateway(services(3, snapshotId)).approvalStage(scope, "objectives")).resolves.toMatchObject({ stale: true });
    await expect(
      gateway(services(2, "019ffc30-ffff-7000-8000-000000000105")).approvalStage(scope, "objectives"),
    ).resolves.toMatchObject({ stale: true });
  });

  it("stops instead of retrying forever when the intent key was already spent", async () => {
    const infer = vi
      .fn()
      .mockRejectedValue(new PublicError("edit_conflict", "Already made.", 409));
    await expect(gateway({ lessonIntent: { infer } }).inferIntent(context, "focus")).rejects.toMatchObject({
      code: "bad_request",
      statusCode: 409,
    });
    expect(infer).toHaveBeenCalledWith(expect.objectContaining({ oneShotRunId: context.oneShotRunId }));
  });

  it("reports ingestion ready, blocked or failed from the ingestion status", async () => {
    const status = (value: unknown) => ({ ingestion: { status: vi.fn().mockResolvedValue(value) } });
    await expect(gateway(status({ canProceed: true, quality: null, latestJob: null })).ingestion(scope)).resolves.toEqual({ state: "ready" });
    await expect(
      gateway(
        status({
          canProceed: false,
          quality: { status: "blocked", findings: [{ code: "parser_failure", severity: "blocking" }] },
          latestJob: null,
        }),
      ).ingestion(scope),
    ).resolves.toEqual({ state: "failed", errorCode: "parser_failure" });
    await expect(
      gateway(status({ canProceed: false, quality: null, latestJob: { state: "failed", errorCode: "CORRUPT_SOURCE" } })).ingestion(scope),
    ).resolves.toEqual({ state: "failed", errorCode: "CORRUPT_SOURCE" });
  });

  it("counts only errors as blocking and records warnings", async () => {
    const run = vi.fn().mockResolvedValue({
      id: "run-1",
      status: "failed",
      issues: [{ severity: "error" }, { severity: "warning" }, { severity: "warning" }],
    });
    await expect(gateway({ validation: { run } }).validate(scope)).resolves.toMatchObject({
      runId: "run-1",
      status: "failed",
      errors: 1,
      warnings: 2,
    });
    expect(run).toHaveBeenCalledWith({ ...scope, body: {} });
  });

  it("ST-107: hands the repair map every unacknowledged finding, never an acknowledged one", async () => {
    const sceneId = "019ffc30-9999-7000-8000-000000000105";
    const run = vi.fn().mockResolvedValue({
      id: "run-1",
      status: "failed",
      issues: [
        { severity: "error", code: "text_overflow", sceneId, scopeId: sceneId, details: { a: 1 }, acknowledgedAt: null },
        { severity: "warning", code: "scene_monotony", sceneId, scopeId: sceneId, details: {}, acknowledgedAt: "2026-09-27T10:00:00.000Z" },
      ],
    });
    const result = await gateway({ validation: { run } }).validate(scope);
    expect(result.findings).toEqual([
      { code: "text_overflow", severity: "error", sceneId, scopeId: sceneId, details: { a: 1 } },
    ]);
  });

  it("saves a before-render version and retries a failed render of the same content", async () => {
    const create = vi.fn().mockResolvedValue({ currentVersionId: "version-1" });
    const start = vi.fn().mockResolvedValue({ id: "render-1", status: "failed", retryable: true });
    const retry = vi.fn().mockResolvedValue({ id: "render-1", status: "queued", retryable: false });
    const subject = gateway({ lessonVersions: { create }, renders: { start, retry, detail: vi.fn() } });
    await expect(subject.saveLessonVersion({ ...scope, correlationId: context.correlationId })).resolves.toEqual({
      lessonVersionId: "version-1",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ body: { reason: "before_render" } }));
    await expect(
      subject.startRender({
        ...scope,
        correlationId: context.correlationId,
        lessonVersionId: "version-1" as Identifier,
        idempotencyKey: "oneshot:run:render:r0",
      }),
    ).resolves.toEqual({ renderJobId: "render-1" });
    expect(start).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "oneshot:run:render:r0", body: { lessonVersionId: "version-1" } }),
    );
    expect(retry).toHaveBeenCalledOnce();
  });

  it("ST-107: repairs through the existing scene-regeneration job with the run's key and authorisation", async () => {
    const regenerateScene = vi.fn().mockResolvedValue({ jobId: "job-9", status: "queued" });
    const current = vi.fn().mockResolvedValue({ storyboard: { revision: 7 } });
    const subject = gateway({ storyboard: { current, regenerateScene } });
    const repairContext = { ...context, requestKey: "oneshot:run:repair:1:scene-1" };
    await expect(
      subject.requestSceneRepair(repairContext, {
        sceneId: "scene-1",
        mode: "shorten",
        instruction: "Shorten the on-screen text so it fits its layout.",
      }),
    ).resolves.toEqual({ jobId: "job-9" });
    expect(regenerateScene).toHaveBeenCalledWith({
      ...scope,
      sceneId: "scene-1",
      body: {
        mode: "shorten",
        instruction: "Shorten the on-screen text so it fits its layout.",
        expectedRevision: 7,
      },
      idempotencyKey: "oneshot:run:repair:1:scene-1",
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    });
  });

  it("ST-107: applies a repair against the current revisions, as the run", async () => {
    const applySceneCandidate = vi.fn().mockResolvedValue({});
    const subject = gateway({
      storyboard: {
        current: vi.fn().mockResolvedValue({ storyboard: { revision: 8 } }),
        sceneDetail: vi.fn().mockResolvedValue({ sceneRevision: 3 }),
        applySceneCandidate,
      },
    });
    await subject.applySceneRepair(context, { sceneId: "scene-1", candidateId: "cand-1" as Identifier });
    expect(applySceneCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneId: "scene-1",
        candidateId: "cand-1",
        body: { expectedRevision: 8, expectedSceneRevision: 3 },
        oneShotRunId: context.oneShotRunId,
      }),
    );
  });

  it("ST-107: saves the confirmed style pack and sound bed with the configuration", async () => {
    const save = vi.fn().mockResolvedValue({ configuration: { version: 2 } });
    const subject = gateway({
      lessonConfiguration: { get: vi.fn().mockResolvedValue({ configuration: null }), save },
    });
    await subject.saveConfiguration(context, {
      expectedVersion: 1,
      subject: "Engineering",
      lessonTitle: "Trusses",
      focusPrompt: "How do trusses carry load?",
      audience: { ageBand: "adult-professional", difficulty: "advanced", tone: "academic" },
      targetDurationSeconds: 180,
      creativeStylePack: "systems",
      soundBed: "morning-pad",
    });
    expect(save.mock.calls[0]![0].body).toMatchObject({ creativeStylePack: "systems", soundBed: "morning-pad" });
  });

  it("ST-107: reads the render review as codes and details only", async () => {
    const detail = vi.fn().mockResolvedValue({
      status: "failed",
      progress: 1,
      errorCode: "RENDER_REVIEW_FAILED",
      review: {
        outcome: "failed",
        findings: [{ code: "BLACK_SEGMENT", severity: "error", detail: "Black from 0:10 to 0:14.", correction: "Check scene 3." }],
        contactSheet: [{ position: 0.5, atMs: 1000, url: "https://signed.example/frame" }],
      },
    });
    const state = await gateway({ renders: { detail } }).render(scope, "render-1" as Identifier);
    expect(state.review).toEqual({
      outcome: "failed",
      findings: [{ code: "BLACK_SEGMENT", severity: "error", detail: "Black from 0:10 to 0:14." }],
    });
    expect(JSON.stringify(state)).not.toContain("signed.example");
  });
});

describe("removing sentences grounding could not verify", () => {
  const scene = (id: string, narration: string) => ({
    id,
    stableSceneId: id,
    scene: { id, narration },
  });
  const claim = (id: string, sceneId: string, text: string) => ({
    id,
    text,
    location: { type: "narration", sceneId, sentenceIndex: 0 },
  });

  it("takes each unsupported sentence out of its scene, chaining storyboard revisions", async () => {
    const updateScene = vi
      .fn()
      .mockResolvedValueOnce({ revision: 8 })
      .mockResolvedValueOnce({ revision: 9 });
    const subject = gateway({
      grounding: {
        current: vi.fn().mockResolvedValue({
          check: {
            lessonSpecRevision: 7,
            claims: [
              claim("c1", "s1", "A hook we cannot verify."),
              claim("c2", "s1", "A supported fact."),
              claim("c3", "s2", "Another unverified line."),
            ],
            results: [
              { claimId: "c1", status: "unsupported" },
              { claimId: "c2", status: "supported" },
              { claimId: "c3", status: "unsupported" },
            ],
          },
        }),
      },
      storyboard: {
        current: vi.fn().mockResolvedValue({
          storyboard: {
            revision: 7,
            scenes: [
              scene("s1", "A hook we cannot verify. A supported fact."),
              scene("s2", "Another unverified line. More content here."),
            ],
          },
        }),
        updateScene,
      },
    });

    const result = await subject.removeUnverifiedSentences(context);

    expect(result).toEqual({
      removed: [
        { sceneId: "s1", text: "A hook we cannot verify." },
        { sceneId: "s2", text: "Another unverified line." },
      ],
      kept: 0,
    });
    expect(updateScene.mock.calls.map(([input]) => input.body)).toEqual([
      { expectedRevision: 7, scene: { id: "s1", narration: "A supported fact." } },
      { expectedRevision: 8, scene: { id: "s2", narration: "More content here." } },
    ]);
  });

  it("does nothing when the grounding check is for an older storyboard", async () => {
    const updateScene = vi.fn();
    const subject = gateway({
      grounding: {
        current: vi.fn().mockResolvedValue({
          check: {
            lessonSpecRevision: 6,
            claims: [claim("c1", "s1", "Old.")],
            results: [{ claimId: "c1", status: "unsupported" }],
          },
        }),
      },
      storyboard: {
        current: vi.fn().mockResolvedValue({
          storyboard: { revision: 7, scenes: [scene("s1", "Old. New.")] },
        }),
        updateScene,
      },
    });
    await expect(subject.removeUnverifiedSentences(context)).resolves.toEqual({
      removed: [],
      kept: 0,
    });
    expect(updateScene).not.toHaveBeenCalled();
  });
});

describe("ST-112 one-shot gateway: the v2 visual plan", () => {
  const job = (state: string, extra: Record<string, unknown> = {}) => ({
    id: "019ffc30-7777-7000-8000-000000000112",
    state,
    errorMetadata: null,
    resultMetadata: null,
    ...extra,
  });
  /** A database whose one `jobs` read returns `rows`. */
  const jobsDatabase = (rows: unknown[]) =>
    ({
      select: () => ({
        from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
      }),
    }) as unknown as DatabaseClient;
  const planGateway = (rows: unknown[]) =>
    new ServiceOneShotGateway({ database: jobsDatabase(rows) } as OneShotGatewayServices);
  const jobId = "019ffc30-7777-7000-8000-000000000112" as Identifier;

  it("asks for a v2 design's pictures and reports what each scene gets", async () => {
    const queueCinemaIllustrations = vi.fn().mockResolvedValue({
      queued: [{ key: "flat:kettle" }, { key: "flat:puddle" }],
      reused: [{ sceneId: "s3" }],
      motif: [{ sceneId: "s4", reason: "over_budget" }],
      budget: 5,
    });
    const generateMissing = vi.fn();
    const result = await gateway({
      illustrations: { queueCinemaIllustrations, generateMissing },
    }).requestIllustrations(context);

    expect(result).toEqual({
      queued: 2,
      skipped: 1,
      cinema: { reused: 1, motif: 1, budget: 5 },
    });
    expect(queueCinemaIllustrations).toHaveBeenCalledWith({
      ...scope,
      correlationId: context.correlationId,
      requestKey: context.requestKey,
      oneShotRunId: context.oneShotRunId,
    });
    // Slot filling and the v2 pictures are never both paid for.
    expect(generateMissing).not.toHaveBeenCalled();
  });

  it("fills decorative slots for every lesson without a v2 design", async () => {
    for (const skipped of ["design_v1", "no_design", "no_storyboard"]) {
      const queueCinemaIllustrations = vi
        .fn()
        .mockResolvedValue({ queued: [], reused: [], motif: [], budget: 0, skipped });
      const generateMissing = vi.fn().mockResolvedValue({ queued: 3, skipped: 1 });
      await expect(
        gateway({
          illustrations: { queueCinemaIllustrations, generateMissing },
        }).requestIllustrations(context),
      ).resolves.toEqual({ queued: 3, skipped: 1 });
      expect(generateMissing).toHaveBeenCalledWith(
        expect.objectContaining({ requestKey: context.requestKey, oneShotRunId: context.oneShotRunId }),
      );
    }
  });

  it("queues the planner with the run's key and authorisation, or reports nothing to plan", async () => {
    const requestVisualPlan = vi
      .fn()
      .mockResolvedValueOnce({ jobId, draftId: "draft-1", draftRevision: 1 })
      .mockResolvedValueOnce({ skipped: "design_v1" });
    const subject = gateway({ creativeDesign: { requestVisualPlan } });
    await expect(subject.requestVisualPlan(context)).resolves.toEqual({ jobId });
    await expect(subject.requestVisualPlan(context)).resolves.toBeNull();
    expect(requestVisualPlan).toHaveBeenCalledWith({
      ...scope,
      correlationId: context.correlationId,
      requestKey: context.requestKey,
      oneShotRunId: context.oneShotRunId,
    });
  });

  it("reads how a settled planner job left the design", async () => {
    await expect(planGateway([]).visualPlan(scope, jobId)).resolves.toEqual({
      job: null,
      outcome: null,
      fallbackReason: null,
    });
    await expect(planGateway([job("running")]).visualPlan(scope, jobId)).resolves.toMatchObject({
      job: { state: "running" },
      outcome: null,
    });
    await expect(
      planGateway([job("failed", { errorMetadata: { code: "VISUAL_PLAN_FALLBACK_INVALID" } })]).visualPlan(scope, jobId),
    ).resolves.toMatchObject({
      job: { state: "failed", errorCode: "VISUAL_PLAN_FALLBACK_INVALID" },
      outcome: null,
    });
    await expect(
      planGateway([job("succeeded", { resultMetadata: { visualPlan: "model" } })]).visualPlan(scope, jobId),
    ).resolves.toMatchObject({ outcome: "model", fallbackReason: null });
    await expect(
      planGateway([
        job("succeeded", { resultMetadata: { visualPlan: "authored", fallbackReason: "QUOTA_EXCEEDED" } }),
      ]).visualPlan(scope, jobId),
    ).resolves.toMatchObject({ outcome: "authored", fallbackReason: "QUOTA_EXCEEDED" });
    await expect(
      planGateway([job("succeeded", { resultMetadata: { visualPlan: "superseded" } })]).visualPlan(scope, jobId),
    ).resolves.toMatchObject({ outcome: "superseded" });
    // A result this reader does not know is never reported as a model plan.
    await expect(planGateway([job("succeeded")]).visualPlan(scope, jobId)).resolves.toMatchObject({
      outcome: "authored",
    });
  });

  it("applies the current draft revision, and keeps the design in use when it no longer fits", async () => {
    const getDraft = vi.fn().mockResolvedValue({ revision: 4, manifest: {}, applied: false });
    const apply = vi
      .fn()
      .mockResolvedValueOnce({ snapshotId: "snapshot-1", manifestHash: "a".repeat(64) })
      .mockRejectedValueOnce(new PublicError("validation_failed", "Does not fit.", 422))
      .mockRejectedValueOnce(new PublicError("edit_conflict", "Changed.", 409));
    const subject = gateway({ creativeDesign: { getDraft, apply } });

    await expect(subject.applyVisualDesign(context)).resolves.toEqual({
      applied: true,
      snapshotId: "snapshot-1",
    });
    expect(apply).toHaveBeenCalledWith({ ...scope, expectedRevision: 4 });
    await expect(subject.applyVisualDesign(context)).resolves.toEqual({ applied: false });
    // A concurrent edit is for the next tick to re-read, not a fallback.
    await expect(subject.applyVisualDesign(context)).rejects.toMatchObject({ code: "edit_conflict" });
  });

  it("reports no design, a v1 design and what a v2 design resolved to", async () => {
    const design = (value: unknown) => gateway({ creativeDesign: { getDraft: vi.fn().mockResolvedValue(value) } });
    await expect(design(null).visualDesign(scope)).resolves.toEqual({ release: null, applied: false });
    await expect(
      design({ revision: 1, applied: true, manifest: { manifestVersion: "1.0" } }).visualDesign(scope),
    ).resolves.toEqual({ release: "v1", applied: true });
    const hero = (origin: string) => ({ assetId: "asset-1", origin, altText: "A picture." });
    const sceneDesign = (compositionId: string, picture: unknown) => ({
      compositionId,
      imagery: { hero: picture, brief: null, motif: "orbit" },
    });
    await expect(
      design({
        revision: 3,
        applied: false,
        manifest: {
          manifestVersion: "2.0",
          scenes: {
            s1: sceneDesign("statement", null),
            s2: sceneDesign("comparison-split", hero("generated")),
            s3: sceneDesign("comparison-stacked", hero("source_figure")),
            s4: sceneDesign("sequence", null),
          },
        },
      }).visualDesign(scope),
    ).resolves.toEqual({
      release: "v2",
      applied: false,
      summary: { families: "comparison:2,sequence:1,statement:1", pictures: 2, generatedPictures: 1 },
    });
  });

  it("counts a v2 design's pictures still generating, whatever the storyboard requires", async () => {
    const candidate = (status: string) => ({ status, moderationStatus: "pending", selectable: false });
    const contactSheet = vi.fn().mockResolvedValue({
      scenes: [
        {
          sceneId: "s1",
          sceneRevision: 0,
          slots: [
            {
              slot: "cinema-hero",
              visualRole: "decorative",
              candidates: [candidate("queued"), candidate("generating"), candidate("accepted"), candidate("failed")],
            },
          ],
        },
      ],
    });
    const subject = new ServiceOneShotGateway({
      database: {
        select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
      } as unknown as DatabaseClient,
      illustrations: { contactSheet },
      storyboard: { current: vi.fn().mockResolvedValue({ storyboard: { revision: 1 } }) },
    } as unknown as OneShotGatewayServices);

    await expect(subject.illustrations(scope)).resolves.toEqual({ pending: 2, acceptable: [] });
  });
});
