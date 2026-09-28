/**
 * ST-105 test support: an in-memory pipeline behind the runner's gateway.
 * Used by the runner unit tests and the Postgres integration tests; never
 * imported by production code.
 */
import { PublicError, type Identifier } from "@avlp/config";
import type {
  AcceptableIllustration,
  ApprovalStage,
  ApprovalStageState,
  ConfigurationState,
  OneShotCallContext,
  OneShotJobStatus,
  OneShotStageGateway,
  PromiseState,
  RenderState,
  RepairContext,
  SceneRepairStatus,
  ValidationOutcome,
} from "./one-shot-runner.js";
import type { RepairFinding } from "./one-shot-repair.js";

/** ST-107. One scene-regeneration job queued by a repair. */
export type FakeRepairJob = {
  sceneId: string;
  key: string;
  mode: string;
  instruction: string;
  job: OneShotJobStatus;
  candidate: NonNullable<SceneRepairStatus["candidate"]> | null;
};

export const fakeSpecId = "019ffc10-eeee-7000-8000-000000000105" as Identifier;

let sequence = 0;
export function nextId(): Identifier {
  sequence += 1;
  return `019ffc10-0000-7000-8000-${String(sequence).padStart(12, "0")}` as Identifier;
}

export type StageFake = {
  state: ApprovalStageState["state"];
  stale: boolean;
  revision: number | null;
  canApprove: boolean;
  latestJob: OneShotJobStatus | null;
  focusCoverage?: ApprovalStageState["focusCoverage"];
};

/**
 * An in-memory pipeline. `generate` queues a job that `completeJobs` finishes,
 * the way the pipeline worker would between two ticks.
 */
export class FakePipeline implements OneShotStageGateway {
  public ingestionState: "pending" | "ready" | "failed" = "ready";
  public snapshot = { approved: false, stale: false };
  public config: ConfigurationState | null = null;
  public voice = false;
  public stages: Record<ApprovalStage, StageFake> = {
    objectives: idleStage(),
    outline: idleStage(),
    narration: idleStage(),
  };
  public storyboardFake: StageFake & { lessonSpecId: Identifier | null } = {
    ...idleStage(),
    lessonSpecId: null,
  };
  public illustrationPending = 0;
  public acceptable: AcceptableIllustration[] = [];
  public groundingCurrent = false;
  public groundingJob: OneShotJobStatus | null = null;
  public audioFake = { total: 0, ready: 0, pending: 0, failed: 0, missing: 0 };
  public validation: ValidationOutcome = {
    runId: nextId(),
    status: "passed",
    errors: 0,
    warnings: 1,
  };
  public renderFake: RenderState = {
    status: "running",
    progress: 0.2,
    errorCode: null,
  };
  /** The next job queued for this stage fails instead of succeeding. */
  public failNext = new Set<string>();
  public coverageOnGenerate: ApprovalStageState["focusCoverage"] = {
    status: "covered",
  };
  public calls: string[] = [];
  public audits: { step: string; targetType: string }[] = [];
  public keys: string[] = [];
  public throwOn: { method: string; error: unknown } | null = null;
  // ---- ST-107 ------------------------------------------------------------
  /** Unacknowledged validation findings; `validation` counts follow them
   * when `findingsDriveValidation` is set. */
  public findings: RepairFinding[] = [];
  public findingsDriveValidation = false;
  public repairContextFake: RepairContext = { scenes: [], objectives: [] };
  public repairJobs: FakeRepairJob[] = [];
  /** Scenes whose regenerated candidate drops a source reference. */
  public dropSourceRefsFor = new Set<string>();
  /** Scenes whose repair job fails. */
  public failRepairFor = new Set<string>();
  /** What applying a repair to a scene fixes (the test decides). */
  public onRepairApplied: (sceneId: string, fake: FakePipeline) => void = (
    sceneId,
    fake,
  ) => {
    fake.findings = fake.findings.filter((finding) => finding.sceneId !== sceneId);
  };
  public promise: PromiseState = {
    sceneSections: [],
    sectionOrder: new Map(),
    measuredDurationSeconds: 180,
    toleranceSeconds: 30,
    pinned: { stylePackId: null, soundBed: null },
  };
  /** Every cost the pipeline would meter, summed like the usage records. */
  public cost = 0.42;

  private maybeThrow(method: string) {
    if (this.throwOn?.method === method) {
      const { error } = this.throwOn;
      this.throwOn = null;
      throw error;
    }
  }

  public async ingestion() {
    return this.ingestionState === "failed"
      ? { state: "failed" as const, errorCode: "parser_failure" }
      : { state: this.ingestionState };
  }
  public async sourceSnapshot() {
    return { ...this.snapshot };
  }
  public async approveSourceSnapshot(context: OneShotCallContext) {
    this.maybeThrow("approveSourceSnapshot");
    this.calls.push("approveSourceSnapshot");
    this.keys.push(context.requestKey);
    this.snapshot = { approved: true, stale: false };
    return { snapshotId: nextId() };
  }
  public async configuration() {
    return this.config === null ? null : { ...this.config };
  }
  public async voiceConfigured() {
    return this.voice;
  }
  public async inferIntent(context: OneShotCallContext) {
    this.calls.push("inferIntent");
    this.keys.push(context.requestKey);
    return { subject: "Engineering", lessonTitle: "How trusses carry load" };
  }
  public async saveConfiguration(
    _context: OneShotCallContext,
    input: Parameters<OneShotStageGateway["saveConfiguration"]>[1],
  ) {
    this.calls.push("saveConfiguration");
    this.config = {
      version: input.expectedVersion + 1,
      focusPrompt: input.focusPrompt,
      ageBand: input.audience.ageBand,
      difficulty: input.audience.difficulty,
      targetDurationSeconds: input.targetDurationSeconds,
      ...(input.creativeStylePack === undefined
        ? {}
        : { creativeStylePack: input.creativeStylePack }),
      ...(input.soundBed === undefined ? {} : { soundBed: input.soundBed }),
    };
    this.promise = {
      ...this.promise,
      pinned: {
        stylePackId: input.creativeStylePack ?? null,
        soundBed: input.soundBed ?? null,
      },
    };
    return { version: this.config.version };
  }
  public async saveDefaultVoice() {
    this.calls.push("saveDefaultVoice");
    this.voice = true;
  }
  public async approvalStage(_scope: unknown, stage: ApprovalStage) {
    const fake = this.stages[stage];
    return {
      state: fake.state,
      stale: fake.stale,
      revision: fake.revision,
      canApprove: fake.canApprove,
      latestJob: fake.latestJob,
      ...(stage === "objectives"
        ? { focusCoverage: fake.focusCoverage ?? null }
        : {}),
    };
  }
  public briefCoverageSeen: readonly string[] | undefined;
  public async generate(
    context: OneShotCallContext,
    stage: ApprovalStage | "storyboard",
    options?: { briefCoverage?: readonly string[] },
  ) {
    this.maybeThrow("generate");
    this.calls.push(`generate:${stage}`);
    if (stage === "objectives") this.briefCoverageSeen = options?.briefCoverage;
    this.keys.push(context.requestKey);
    const job: OneShotJobStatus = { id: nextId(), state: "queued", errorCode: null };
    const fake = stage === "storyboard" ? this.storyboardFake : this.stages[stage];
    fake.latestJob = job;
    fake.state = "generating";
    return { jobId: job.id };
  }
  public async approve(
    _context: OneShotCallContext,
    stage: ApprovalStage,
    expectedRevision: number,
  ) {
    this.maybeThrow("approve");
    this.calls.push(`approve:${stage}`);
    const fake = this.stages[stage];
    if (fake.revision !== expectedRevision)
      throw new PublicError("edit_conflict", "Changed.", 409);
    fake.state = "approved";
    return { approvedId: nextId(), revision: expectedRevision };
  }
  public async storyboard() {
    return {
      state: this.storyboardFake.state,
      stale: this.storyboardFake.stale,
      lessonSpecId: this.storyboardFake.lessonSpecId,
      revision: this.storyboardFake.revision,
      latestJob: this.storyboardFake.latestJob,
    };
  }
  public async illustrations() {
    return { pending: this.illustrationPending, acceptable: [...this.acceptable] };
  }
  public async requestIllustrations(context: OneShotCallContext) {
    this.calls.push("requestIllustrations");
    this.keys.push(context.requestKey);
    this.illustrationPending = 1;
    return { queued: 1, skipped: 1 };
  }
  public async acceptIllustration(
    _context: OneShotCallContext,
    candidate: AcceptableIllustration,
  ) {
    this.calls.push(`acceptIllustration:${candidate.candidateId}`);
    this.acceptable = this.acceptable.filter(
      (entry) => entry.candidateId !== candidate.candidateId,
    );
  }
  public async grounding() {
    return { current: this.groundingCurrent, latestJob: this.groundingJob };
  }
  public async requestGrounding(context: OneShotCallContext) {
    this.calls.push("requestGrounding");
    this.keys.push(context.requestKey);
    this.groundingJob = { id: nextId(), state: "queued", errorCode: null };
    return { jobId: this.groundingJob.id };
  }
  public async audio() {
    return { ...this.audioFake };
  }
  public async requestAudio(context: OneShotCallContext) {
    this.calls.push("requestAudio");
    this.keys.push(context.requestKey);
    this.audioFake = { total: 3, ready: 0, pending: 3, failed: 0, missing: 0 };
  }
  public async validate() {
    this.calls.push("validate");
    if (!this.findingsDriveValidation)
      return { ...this.validation, findings: [...this.findings] };
    const errors = this.findings.filter((finding) => finding.severity === "error").length;
    return {
      runId: nextId(),
      status: errors === 0 ? ("passed" as const) : ("failed" as const),
      errors,
      warnings: this.findings.filter((finding) => finding.severity === "warning").length,
      findings: [...this.findings],
    };
  }
  public async render() {
    return { ...this.renderFake };
  }
  public async costSoFar() {
    return this.cost;
  }

  // ---- ST-107 ------------------------------------------------------------

  public async repairContext() {
    return JSON.parse(JSON.stringify(this.repairContextFake)) as RepairContext;
  }
  public async requestSceneRepair(
    context: OneShotCallContext,
    repair: { sceneId: string; mode: string; instruction: string },
  ) {
    this.calls.push(`repairScene:${repair.sceneId}`);
    this.keys.push(context.requestKey);
    // The service's idempotency: the same key finds the same job.
    const existing = this.repairJobs.find((entry) => entry.key === context.requestKey);
    if (existing !== undefined) return { jobId: existing.job.id };
    const job: FakeRepairJob = {
      sceneId: repair.sceneId,
      key: context.requestKey,
      mode: repair.mode,
      instruction: repair.instruction,
      job: { id: nextId(), state: "queued", errorCode: null },
      candidate: null,
    };
    this.repairJobs.push(job);
    return { jobId: job.job.id };
  }
  public async sceneRepairStatus(
    _scope: unknown,
    repair: { sceneId: string; jobId: Identifier },
  ): Promise<SceneRepairStatus> {
    const entry = this.repairJobs.find((job) => job.job.id === repair.jobId);
    if (entry === undefined) return { job: null, candidate: null };
    return { job: { ...entry.job }, candidate: entry.candidate === null ? null : { ...entry.candidate } };
  }
  public async applySceneRepair(
    _context: OneShotCallContext,
    repair: { sceneId: string; candidateId: Identifier },
  ) {
    this.calls.push(`applyRepair:${repair.sceneId}`);
    const entry = this.repairJobs.find((job) => job.candidate?.id === repair.candidateId);
    if (entry?.candidate !== undefined && entry.candidate !== null)
      entry.candidate = { ...entry.candidate, status: "accepted" };
    // The storyboard changed: grounding and the scene's audio are stale.
    this.storyboardFake.revision = (this.storyboardFake.revision ?? 0) + 1;
    this.groundingCurrent = false;
    this.groundingJob = null;
    this.audioFake = {
      ...this.audioFake,
      ready: Math.max(0, this.audioFake.ready - 1),
      missing: this.audioFake.missing + 1,
    };
    this.onRepairApplied(repair.sceneId, this);
  }
  public async rejectSceneRepair(
    _context: OneShotCallContext,
    repair: { sceneId: string; candidateId: Identifier },
  ) {
    this.calls.push(`rejectRepair:${repair.sceneId}`);
    const entry = this.repairJobs.find((job) => job.candidate?.id === repair.candidateId);
    if (entry?.candidate !== undefined && entry.candidate !== null)
      entry.candidate = { ...entry.candidate, status: "rejected" };
  }
  public async promiseState() {
    return { ...this.promise };
  }
  public async auditApproval(
    _context: OneShotCallContext,
    input: { step: string; target: { type: string; id: string } },
  ) {
    this.audits.push({ step: input.step, targetType: input.target.type });
  }

  /** What the pipeline worker does between two ticks. */
  public completeJobs() {
    for (const stage of ["objectives", "outline", "narration"] as const) {
      const fake = this.stages[stage];
      if (fake.latestJob?.state === "queued") {
        if (this.failNext.delete(stage)) {
          fake.latestJob = { ...fake.latestJob, state: "failed", errorCode: "MODEL_OUTPUT_INVALID" };
          fake.state = fake.revision === null ? "failed" : "draft";
          continue;
        }
        fake.latestJob = { ...fake.latestJob, state: "succeeded" };
        fake.state = "draft";
        fake.stale = false;
        fake.revision = (fake.revision ?? 0) + 1;
        fake.canApprove = true;
        if (stage === "objectives") fake.focusCoverage = this.coverageOnGenerate;
      }
    }
    const board = this.storyboardFake;
    if (board.latestJob?.state === "queued") {
      if (this.failNext.delete("storyboard")) {
        board.latestJob = { ...board.latestJob, state: "failed", errorCode: "X" };
        board.state = "failed";
      } else {
        board.latestJob = { ...board.latestJob, state: "succeeded" };
        board.state = "draft";
        board.stale = false;
        board.lessonSpecId = fakeSpecId;
        board.revision = 4;
      }
    }
    if (this.illustrationPending > 0) {
      this.illustrationPending = 0;
      this.acceptable = [
        {
          candidateId: "019ffc10-1111-7000-8000-000000000105" as Identifier,
          sceneId: "019ffc10-2222-7000-8000-000000000105" as Identifier,
          slot: "illustration",
          sceneRevision: 2,
          storyboardRevision: 4,
        },
      ];
    }
    if (this.groundingJob?.state === "queued") {
      this.groundingJob = { ...this.groundingJob, state: "succeeded" };
      this.groundingCurrent = true;
    }
    if (this.audioFake.pending > 0)
      this.audioFake = {
        ...this.audioFake,
        ready: this.audioFake.total,
        pending: 0,
      };
    for (const entry of this.repairJobs) {
      if (entry.job.state !== "queued") continue;
      if (this.failRepairFor.has(entry.sceneId)) {
        entry.job = { ...entry.job, state: "failed", errorCode: "MODEL_OUTPUT_INVALID" };
        continue;
      }
      entry.job = { ...entry.job, state: "succeeded" };
      entry.candidate = {
        id: nextId(),
        status: "pending",
        keepsSourceRefs: !this.dropSourceRefsFor.has(entry.sceneId),
        costUsd: 0.01,
        modelCallId: nextId(),
      };
      this.cost = Math.round((this.cost + 0.01) * 1_000_000) / 1_000_000;
    }
  }
}

export function idleStage(): StageFake {
  return {
    state: "idle",
    stale: false,
    revision: null,
    canApprove: false,
    latestJob: null,
  };
}
