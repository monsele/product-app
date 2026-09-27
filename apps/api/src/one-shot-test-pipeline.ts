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
  OneShotCallContext,
  OneShotJobStatus,
  OneShotStageGateway,
  RenderState,
  ValidationOutcome,
} from "./one-shot-runner.js";

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
  public config: { version: number; focusPrompt: string | null } | null = null;
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
    input: { expectedVersion: number; focusPrompt: string },
  ) {
    this.calls.push("saveConfiguration");
    this.config = { version: input.expectedVersion + 1, focusPrompt: input.focusPrompt };
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
  public async generate(
    context: OneShotCallContext,
    stage: ApprovalStage | "storyboard",
  ) {
    this.maybeThrow("generate");
    this.calls.push(`generate:${stage}`);
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
  public async requestAudio() {
    this.calls.push("requestAudio");
    this.audioFake = { total: 3, ready: 0, pending: 3, failed: 0, missing: 0 };
  }
  public async validate() {
    this.calls.push("validate");
    return { ...this.validation };
  }
  public async render() {
    return { ...this.renderFake };
  }
  public async costSoFar() {
    return 0.42;
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
