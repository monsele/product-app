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
