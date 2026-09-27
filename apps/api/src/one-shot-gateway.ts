/**
 * ST-105 — the runner's gateway onto the existing NestJS services.
 *
 * Every method is one call to the service the wizard already uses, with the
 * run owner's scope, the run's correlation id and a deterministic request key.
 * Nothing here re-implements a service's checks: a refusal propagates to the
 * runner, which stops the run at that stage.
 *
 * The few direct reads (project scenes, slot bindings, a job's state) are
 * tenant-scoped on owner and project, like every other project query.
 */

import { PublicError, type Identifier } from "@avlp/config";
import {
  jobs,
  lessonSpecs,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  sceneSpecSchema,
  type LessonValidationRun,
  type RenderStatusResponse,
} from "@avlp/schemas";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { GroundingService } from "./grounding.js";
import type { IllustrationGenerationService } from "./illustration-generation.js";
import type { IngestionStatusService } from "./ingestion-status.js";
import type { LessonConfigurationService } from "./lesson-configuration.js";
import type { LessonIntentService } from "./lesson-intent.js";
import type { LessonValidationService } from "./lesson-validation.js";
import type { LessonVersionsService } from "./lesson-versions.js";
import type { NarrationService } from "./narration.js";
import type { ObjectivesService } from "./objectives.js";
import { oneShotCostSoFar, type OneShotRenderGate } from "./one-shot.js";
import type {
  ApprovalStage,
  ApprovalStageState,
  AudioState,
  IllustrationState,
  OneShotCallContext,
  OneShotJobStatus,
  OneShotScope,
  OneShotStageGateway,
  RenderState,
} from "./one-shot-runner.js";
import type { OutlineService } from "./outline.js";
import type { RenderService } from "./renders.js";
import type { SceneAudioService } from "./scene-audio.js";
import type { SourceSnapshotService } from "./source-snapshot.js";
import type { StoryboardService } from "./storyboard.js";
import type { VoiceConfigurationService } from "./voice-configuration.js";

export type OneShotGatewayServices = {
  database: DatabaseClient;
  ingestion: Pick<IngestionStatusService, "status">;
  sourceSnapshots: Pick<SourceSnapshotService, "status" | "approve">;
  lessonConfiguration: Pick<LessonConfigurationService, "get" | "save">;
  voiceConfiguration: Pick<VoiceConfigurationService, "get" | "save">;
  lessonIntent: Pick<LessonIntentService, "infer">;
  objectives: Pick<ObjectivesService, "current" | "generate" | "approve">;
  outline: Pick<OutlineService, "current" | "generate" | "approve">;
  narration: Pick<NarrationService, "current" | "generate" | "approve">;
  storyboard: Pick<
    StoryboardService,
    "current" | "generate" | "acceptIllustrationCandidate"
  >;
  illustrations: Pick<
    IllustrationGenerationService,
    "generateMissing" | "contactSheet"
  >;
  grounding: Pick<GroundingService, "current" | "check">;
  sceneAudio: Pick<SceneAudioService, "generateAll" | "status">;
  validation: Pick<LessonValidationService, "run">;
  lessonVersions: Pick<LessonVersionsService, "create">;
  renders: Pick<RenderService, "start" | "detail" | "retry">;
};

/** The voice every run narrates with (ST-105 stage map, step 3). */
export const oneShotDefaultVoiceId = "english-aria" as const;

const sceneAssetRequirementsSchema = z.array(
  z.object({ slot: z.string().trim().min(1).max(64) }).passthrough(),
);

function jobStatus(
  job: { id: string; state: string; errorCode: string | null } | null,
): OneShotJobStatus | null {
  return job === null
    ? null
    : {
        id: job.id as Identifier,
        state: job.state as OneShotJobStatus["state"],
        errorCode: job.errorCode,
      };
}

/**
 * One automatic approval, recorded as the run acting for its owner (actor
 * `one_shot_run`; the writer adds `oneShotRunId` to the metadata).
 */
export async function writeOneShotApprovalAudit(
  database: DatabaseClient,
  context: OneShotCallContext,
  input: Parameters<OneShotStageGateway["auditApproval"]>[1],
): Promise<void> {
  await new PostgresAuditWriter(database).write({
    ownerUserId: context.ownerUserId,
    projectId: context.projectId,
    actor: {
      type: "one_shot_run",
      runId: context.oneShotRunId,
      userId: context.ownerUserId,
    },
    eventType: "one_shot.stage_approved",
    target: input.target,
    correlationId: context.correlationId,
    metadata: {
      step: input.step,
      ...(input.revision === undefined ? {} : { revision: input.revision }),
    },
  });
}

export class ServiceOneShotGateway
  implements OneShotStageGateway, OneShotRenderGate
{
  public constructor(private readonly services: OneShotGatewayServices) {}

  // ---- Ingestion and source --------------------------------------------

  public async ingestion(scope: OneShotScope) {
    const status = await this.services.ingestion.status(
      scope.ownerUserId,
      scope.projectId,
    );
    if (status.canProceed) return { state: "ready" as const };
    if (status.quality?.status === "blocked")
      return {
        state: "failed" as const,
        errorCode:
          status.quality.findings.find(
            (finding) => finding.severity === "blocking",
          )?.code ?? "ingestion_blocked",
      };
    if (status.latestJob?.state === "failed")
      return {
        state: "failed" as const,
        errorCode: status.latestJob.errorCode ?? "INGESTION_FAILED",
      };
    const validation = await this.latestJob(scope, "document.validation");
    if (validation?.state === "failed")
      return {
        state: "failed" as const,
        errorCode: validation.errorCode ?? "DOCUMENT_VALIDATION_FAILED",
      };
    return { state: "pending" as const };
  }

  public async sourceSnapshot(scope: OneShotScope) {
    const status = await this.services.sourceSnapshots.status(scope);
    return { approved: status.approved, stale: status.stale };
  }

  public async approveSourceSnapshot(context: OneShotCallContext) {
    const response = await this.services.sourceSnapshots.approve({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    });
    return { snapshotId: response.snapshot.id as Identifier };
  }

  // ---- Configuration ------------------------------------------------------

  public async configuration(scope: OneShotScope) {
    const response = await this.services.lessonConfiguration.get(
      scope.ownerUserId,
      scope.projectId,
    );
    return response.configuration === null
      ? null
      : {
          version: response.configuration.version,
          focusPrompt: response.configuration.focusPrompt,
        };
  }

  public async voiceConfigured(scope: OneShotScope) {
    const response = await this.services.voiceConfiguration.get(scope);
    return response.configuration !== null;
  }

  public async inferIntent(context: OneShotCallContext, focusPrompt: string) {
    try {
      const intent = await this.services.lessonIntent.infer({
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        focusPrompt,
        idempotencyKey: context.requestKey,
        correlationId: context.correlationId,
        oneShotRunId: context.oneShotRunId,
      });
      return { subject: intent.subject, lessonTitle: intent.lessonTitle };
    } catch (error) {
      // The intent result is not stored for replay, so a reused key means a
      // tick died between inferring and saving. Retrying would never succeed;
      // stop now, and resume retries under the next resume key.
      if (error instanceof PublicError && error.code === "edit_conflict")
        throw new PublicError(
          "bad_request",
          "The lesson subject and title could not be recovered after an interruption. Resume the run to infer them again.",
          409,
        );
      throw error;
    }
  }

  public async saveConfiguration(
    context: OneShotCallContext,
    input: Parameters<OneShotStageGateway["saveConfiguration"]>[1],
  ) {
    const existing = await this.services.lessonConfiguration.get(
      context.ownerUserId,
      context.projectId,
    );
    const saved = await this.services.lessonConfiguration.save({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
      body: {
        expectedVersion: input.expectedVersion,
        ageBand: input.audience.ageBand,
        difficulty: input.audience.difficulty,
        tone: input.audience.tone,
        subject: input.subject,
        lessonTitle: input.lessonTitle,
        targetDurationSeconds: input.targetDurationSeconds,
        focusPrompt: input.focusPrompt,
        includeRecallQuestions:
          existing.configuration?.includeRecallQuestions ?? false,
      },
    });
    if (saved.configuration === null)
      throw new Error("The lesson configuration was not saved.");
    return { version: saved.configuration.version };
  }

  public async saveDefaultVoice(context: OneShotCallContext) {
    await this.services.voiceConfiguration.save({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
      body: {
        expectedVersion: 0,
        voiceId: oneShotDefaultVoiceId,
        speakingRate: 1,
        pronunciationOverrides: [],
      },
    });
  }

  // ---- Objectives, outline, narration ------------------------------------

  public async approvalStage(
    scope: OneShotScope,
    stage: ApprovalStage,
  ): Promise<ApprovalStageState> {
    if (stage === "objectives") {
      const [current, source, configuration] = await Promise.all([
        this.services.objectives.current(scope),
        this.services.sourceSnapshots.status(scope),
        this.configuration(scope),
      ]);
      const set = current.set;
      return {
        state: current.state,
        stale:
          set !== null &&
          (set.sourceSnapshotId !== source.snapshotId ||
            (configuration !== null &&
              set.configurationVersion !== configuration.version)),
        revision: set?.revision ?? null,
        canApprove: current.canApprove,
        latestJob: jobStatus(current.latestJob),
        focusCoverage: set?.focusCoverage ?? null,
      };
    }
    if (stage === "outline") {
      const [current, objectives, source] = await Promise.all([
        this.services.outline.current(scope),
        this.services.objectives.current(scope),
        this.services.sourceSnapshots.status(scope),
      ]);
      const set = current.set;
      return {
        state: current.state,
        stale:
          set !== null &&
          (set.sourceSnapshotId !== source.snapshotId ||
            set.objectiveSetId !== objectives.approved?.id),
        revision: set?.revision ?? null,
        canApprove: current.canApprove,
        latestJob: jobStatus(current.latestJob),
      };
    }
    const [current, outline] = await Promise.all([
      this.services.narration.current(scope),
      this.services.outline.current(scope),
    ]);
    const set = current.set;
    return {
      state: current.state,
      stale:
        current.stale ||
        (set !== null && set.outlineSetId !== outline.approved?.id),
      revision: set?.revision ?? null,
      canApprove: current.canApprove,
      latestJob: jobStatus(current.latestJob),
    };
  }

  public async generate(
    context: OneShotCallContext,
    stage: ApprovalStage | "storyboard",
  ) {
    const input = {
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      idempotencyKey: context.requestKey,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    };
    const response =
      stage === "objectives"
        ? await this.services.objectives.generate(input)
        : stage === "outline"
          ? await this.services.outline.generate(input)
          : stage === "narration"
            ? await this.services.narration.generate(input)
            : await this.services.storyboard.generate(input);
    return { jobId: response.jobId as Identifier };
  }

  public async approve(
    context: OneShotCallContext,
    stage: ApprovalStage,
    expectedRevision: number,
  ) {
    const input = {
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      body: { expectedRevision },
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    };
    const response =
      stage === "objectives"
        ? await this.services.objectives.approve(input)
        : stage === "outline"
          ? await this.services.outline.approve(input)
          : await this.services.narration.approve(input);
    const approved = response.approved;
    if (approved === null)
      throw new PublicError(
        "bad_request",
        `The ${stage} could not be approved.`,
        409,
      );
    return { approvedId: approved.id as Identifier, revision: approved.revision };
  }

  // ---- Storyboard and illustrations -------------------------------------

  public async storyboard(scope: OneShotScope) {
    const current = await this.services.storyboard.current(scope);
    return {
      state: current.state,
      stale: current.stale,
      lessonSpecId: (current.storyboard?.id ?? null) as Identifier | null,
      revision: current.storyboard?.revision ?? null,
      latestJob: jobStatus(current.latestJob),
    };
  }

  public async requestIllustrations(context: OneShotCallContext) {
    const response = await this.services.illustrations.generateMissing({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      requestKey: context.requestKey,
      oneShotRunId: context.oneShotRunId,
    });
    return { queued: response.queued, skipped: response.skipped };
  }

  public async illustrations(scope: OneShotScope): Promise<IllustrationState> {
    const [sheet, storyboard, slots] = await Promise.all([
      this.services.illustrations.contactSheet(scope),
      this.services.storyboard.current(scope),
      this.sceneSlots(scope),
    ]);
    const storyboardRevision = storyboard.storyboard?.revision;
    let pending = 0;
    const acceptable: IllustrationState["acceptable"] = [];
    for (const scene of sheet.scenes) {
      for (const slot of scene.slots) {
        const key = `${scene.sceneId}:${slot.slot}`;
        // Only slots the storyboard requires and nothing has filled yet.
        if (!slots.required.has(key) || slots.bound.has(key)) continue;
        // Only decorative slots are ever filled automatically (ST-059/085).
        if (slot.visualRole !== "decorative") continue;
        pending += slot.candidates.filter(
          (candidate) =>
            candidate.status === "queued" ||
            candidate.status === "generating" ||
            (candidate.status === "pending_review" &&
              candidate.moderationStatus === "pending"),
        ).length;
        const selectable = slot.candidates.find(
          (candidate) => candidate.selectable,
        );
        if (selectable !== undefined && storyboardRevision !== undefined)
          acceptable.push({
            candidateId: selectable.id,
            sceneId: scene.sceneId,
            slot: slot.slot,
            sceneRevision: scene.sceneRevision,
            storyboardRevision,
          });
      }
    }
    return { pending, acceptable };
  }

  public async acceptIllustration(
    context: OneShotCallContext,
    candidate: IllustrationState["acceptable"][number],
  ) {
    await this.services.storyboard.acceptIllustrationCandidate({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      candidateId: candidate.candidateId,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
      body: {
        expectedSceneRevision: candidate.sceneRevision,
        expectedStoryboardRevision: candidate.storyboardRevision,
      },
    });
  }

  // ---- Grounding, audio, validation ---------------------------------------

  public async grounding(
    scope: OneShotScope,
    spec: { lessonSpecId: Identifier; revision: number },
  ) {
    const current = await this.services.grounding.current(scope);
    return {
      current:
        current.check !== null &&
        current.check.lessonSpecId === spec.lessonSpecId &&
        current.check.lessonSpecRevision === spec.revision,
      latestJob: jobStatus(current.latestJob),
    };
  }

  public async requestGrounding(
    context: OneShotCallContext,
    spec: { lessonSpecId: Identifier; revision: number },
  ) {
    const response = await this.services.grounding.check({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      idempotencyKey: context.requestKey,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
      body: {
        scope: "lesson",
        lessonSpecId: spec.lessonSpecId,
        lessonSpecRevision: spec.revision,
      },
    });
    return { jobId: response.jobId as Identifier };
  }

  public async audio(scope: OneShotScope): Promise<AudioState> {
    const sceneIds = await this.currentSceneIds(scope);
    const state: AudioState = {
      total: sceneIds.length,
      ready: 0,
      pending: 0,
      failed: 0,
      missing: 0,
    };
    for (const sceneId of sceneIds) {
      const status = await this.services.sceneAudio.status({
        ...scope,
        sceneId,
      });
      if (status.status === "ready") state.ready += 1;
      else if (status.status === "queued" || status.status === "generating")
        state.pending += 1;
      else if (status.status === "failed") state.failed += 1;
      else state.missing += 1;
    }
    return state;
  }

  public async requestAudio(context: OneShotCallContext) {
    await this.services.sceneAudio.generateAll({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
      body: { idempotencyKey: context.requestKey },
    });
  }

  public async validate(scope: OneShotScope) {
    const run: LessonValidationRun = await this.services.validation.run({
      ...scope,
      body: {},
    });
    return {
      runId: run.id,
      status: run.status,
      errors: run.issues.filter((issue) => issue.severity === "error").length,
      warnings: run.issues.filter((issue) => issue.severity === "warning")
        .length,
    };
  }

  // ---- Render gate ---------------------------------------------------------

  public async saveLessonVersion(
    scope: OneShotScope & { correlationId: Identifier },
  ) {
    const response = await this.services.lessonVersions.create({
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      correlationId: scope.correlationId,
      body: { reason: "before_render" },
    });
    if (response.currentVersionId === null)
      throw new Error("The lesson version was not saved.");
    return { lessonVersionId: response.currentVersionId };
  }

  public async startRender(
    scope: OneShotScope & {
      correlationId: Identifier;
      lessonVersionId: Identifier;
      idempotencyKey: string;
    },
  ) {
    let render: RenderStatusResponse = await this.services.renders.start({
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      correlationId: scope.correlationId,
      idempotencyKey: scope.idempotencyKey,
      body: { lessonVersionId: scope.lessonVersionId },
    });
    // The render identity is content-addressed, so re-approving an unchanged
    // lesson after a failed render finds that render; retry it explicitly.
    if (render.status === "failed" && render.retryable)
      render = await this.services.renders.retry({
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        renderId: render.id,
        correlationId: scope.correlationId,
      });
    return { renderJobId: render.id };
  }

  public async render(
    scope: OneShotScope,
    renderJobId: Identifier,
  ): Promise<RenderState> {
    const render = await this.services.renders.detail({
      ...scope,
      renderId: renderJobId,
    });
    return {
      status: render.status === "rendering" ? "running" : render.status,
      progress: render.progress,
      errorCode: render.errorCode,
    };
  }

  // ---- Metering and audit -------------------------------------------------

  public async costSoFar(scope: OneShotScope, correlationId: Identifier) {
    return oneShotCostSoFar(this.services.database, scope, correlationId);
  }

  public async auditApproval(
    context: OneShotCallContext,
    input: Parameters<OneShotStageGateway["auditApproval"]>[1],
  ) {
    await writeOneShotApprovalAudit(this.services.database, context, input);
  }

  // ---- Tenant-scoped reads -----------------------------------------------

  private async latestJob(
    scope: OneShotScope,
    jobType: string,
  ): Promise<OneShotJobStatus | null> {
    const [job] = await this.services.database
      .select({
        id: jobs.id,
        state: jobs.state,
        errorMetadata: jobs.errorMetadata,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerUserId, scope.ownerUserId),
          eq(jobs.projectId, scope.projectId),
          eq(jobs.jobType, jobType),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (job === undefined) return null;
    const code = (job.errorMetadata as { code?: unknown } | null)?.code;
    return {
      id: job.id as Identifier,
      state: job.state,
      errorCode: typeof code === "string" ? code : null,
    };
  }

  /** The scenes `generateAll` would voice: the newest draft storyboard, or
   * else the newest approved one. */
  private async currentSceneIds(scope: OneShotScope): Promise<Identifier[]> {
    const newest = async (status: "draft" | "approved") =>
      (
        await this.services.database
          .select({ id: lessonSpecs.id })
          .from(lessonSpecs)
          .where(
            and(
              eq(lessonSpecs.ownerUserId, scope.ownerUserId),
              eq(lessonSpecs.projectId, scope.projectId),
              eq(lessonSpecs.status, status),
            ),
          )
          .orderBy(desc(lessonSpecs.generatedAt))
          .limit(1)
      )[0];
    const spec = (await newest("draft")) ?? (await newest("approved"));
    if (spec === undefined) return [];
    const rows = await this.services.database
      .select({ stableSceneId: scenes.stableSceneId })
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, scope.ownerUserId),
          eq(scenes.projectId, scope.projectId),
          eq(scenes.lessonSpecId, spec.id),
        ),
      )
      .orderBy(asc(scenes.order));
    return rows.map((row) => row.stableSceneId as Identifier);
  }

  private async sceneSlots(
    scope: OneShotScope,
  ): Promise<{ required: Set<string>; bound: Set<string> }> {
    const rows = await this.services.database
      .select({
        stableSceneId: scenes.stableSceneId,
        sceneJson: scenes.sceneJson,
        assetRequirements: scenes.assetRequirements,
      })
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, scope.ownerUserId),
          eq(scenes.projectId, scope.projectId),
        ),
      );
    const required = new Set<string>();
    const bound = new Set<string>();
    for (const row of rows) {
      const parsed = sceneSpecSchema.safeParse(row.sceneJson);
      if (!parsed.success) continue;
      for (const binding of parsed.data.assetBindings)
        bound.add(`${row.stableSceneId}:${binding.slot}`);
      // The storyboard's persisted requirements: the set `asset_required`
      // validation checks, and the set `generateMissing` fills.
      const requirements = sceneAssetRequirementsSchema.safeParse(
        row.assetRequirements,
      );
      if (requirements.success)
        for (const entry of requirements.data)
          required.add(`${row.stableSceneId}:${entry.slot}`);
    }
    return { required, bound };
  }
}
