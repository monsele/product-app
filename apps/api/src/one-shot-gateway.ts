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

import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  carryForwardCreativeDesignSnapshot,
  contentBlocks,
  jobs,
  lessonSpecs,
  modelCalls,
  parsedSections,
  sceneCandidates,
  scenes,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  cinemaComposition,
  cinemaHeroSlot,
  isCreativeDesignManifestV2,
  lessonStoryboardSceneSchema,
  reconciledLessonDurationToleranceSeconds,
  sceneSpecSchema,
  type LessonStoryboardScene,
  type LessonValidationRun,
  type RenderStatusResponse,
  type SceneSpec,
} from "@avlp/schemas";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { CreativeDesignService } from "./creative-design.js";
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
  PromiseState,
  RenderState,
  RepairContext,
  SceneRepairStatus,
  VisualDesignState,
  VisualPlanStatus,
} from "./one-shot-runner.js";
import type { OutlineService } from "./outline.js";
import { withoutSentences } from "./one-shot-repair.js";
import { findLatestProjectParsedDocument } from "./project-parsed-document.js";
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
    | "current"
    | "generate"
    | "acceptIllustrationCandidate"
    | "regenerateScene"
    | "applySceneCandidate"
    | "rejectSceneCandidate"
    | "sceneDetail"
    | "updateScene"
  >;
  illustrations: Pick<
    IllustrationGenerationService,
    "generateMissing" | "contactSheet" | "queueCinemaIllustrations"
  >;
  creativeDesign: Pick<
    CreativeDesignService,
    "getDraft" | "requestVisualPlan" | "apply"
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
          ageBand: response.configuration.ageBand,
          difficulty: response.configuration.difficulty,
          targetDurationSeconds: response.configuration.targetDurationSeconds,
          creativeStylePack: response.configuration.creativeStylePack,
          soundBed: response.configuration.soundBed,
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
        // ST-107: the confirmed brief's choices; omitted keeps the stored ones.
        ...(input.creativeStylePack === undefined
          ? {}
          : { creativeStylePack: input.creativeStylePack }),
        ...(input.soundBed === undefined ? {} : { soundBed: input.soundBed }),
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
    options?: { briefCoverage?: readonly string[] },
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
        ? await this.services.objectives.generate({
            ...input,
            ...(options?.briefCoverage === undefined
              ? {}
              : { briefCoverage: options.briefCoverage }),
          })
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
    const request = {
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      requestKey: context.requestKey,
      oneShotRunId: context.oneShotRunId,
    };
    // ST-112. A v2 design takes its deduplicated, budgeted presentation
    // illustrations; its decorative slots stay unbound (an authored motif is
    // drawn instead), so slot filling is for every other lesson only.
    const cinema =
      await this.services.illustrations.queueCinemaIllustrations(request);
    if (cinema.skipped === undefined)
      return {
        queued: cinema.queued.length,
        skipped: cinema.motif.length,
        cinema: {
          reused: cinema.reused.length,
          motif: cinema.motif.length,
          budget: cinema.budget,
        },
      };
    const response = await this.services.illustrations.generateMissing(request);
    return { queued: response.queued, skipped: response.skipped };
  }

  // ---- ST-112: the v2 visual plan ----------------------------------------

  public async visualDesign(scope: OneShotScope): Promise<VisualDesignState> {
    const draft = await this.services.creativeDesign.getDraft(scope);
    if (draft === null) return { release: null, applied: false };
    if (!isCreativeDesignManifestV2(draft.manifest))
      return { release: "v1", applied: draft.applied };
    const families = new Map<string, number>();
    let pictures = 0;
    let generatedPictures = 0;
    for (const design of Object.values(draft.manifest.scenes)) {
      const family = cinemaComposition(design.compositionId).family;
      families.set(family, (families.get(family) ?? 0) + 1);
      if (design.imagery.hero === null) continue;
      pictures += 1;
      if (design.imagery.hero.origin === "generated") generatedPictures += 1;
    }
    return {
      release: "v2",
      applied: draft.applied,
      summary: {
        families: [...families.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([family, count]) => `${family}:${count}`)
          .join(","),
        pictures,
        generatedPictures,
      },
    };
  }

  public async requestVisualPlan(context: OneShotCallContext) {
    const response = await this.services.creativeDesign.requestVisualPlan({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      correlationId: context.correlationId,
      requestKey: context.requestKey,
      oneShotRunId: context.oneShotRunId,
    });
    return "skipped" in response ? null : { jobId: response.jobId };
  }

  public async visualPlan(
    scope: OneShotScope,
    jobId: Identifier,
  ): Promise<VisualPlanStatus> {
    const [job] = await this.services.database
      .select({
        id: jobs.id,
        state: jobs.state,
        errorMetadata: jobs.errorMetadata,
        resultMetadata: jobs.resultMetadata,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, jobId),
          eq(jobs.ownerUserId, scope.ownerUserId),
          eq(jobs.projectId, scope.projectId),
          eq(jobs.jobType, "creative-design.visual-plan"),
        ),
      )
      .limit(1);
    if (job === undefined)
      return { job: null, outcome: null, fallbackReason: null };
    const code = (job.errorMetadata as { code?: unknown } | null)?.code;
    const status: OneShotJobStatus = {
      id: job.id as Identifier,
      state: job.state,
      errorCode: typeof code === "string" ? code : null,
    };
    if (job.state !== "succeeded")
      return { job: status, outcome: null, fallbackReason: null };
    const result = job.resultMetadata as {
      visualPlan?: unknown;
      fallbackReason?: unknown;
    } | null;
    const outcome = result?.visualPlan;
    return {
      job: status,
      outcome:
        outcome === "model" || outcome === "superseded" ? outcome : "authored",
      fallbackReason:
        typeof result?.fallbackReason === "string"
          ? result.fallbackReason
          : null,
    };
  }

  public async applyVisualDesign(context: OneShotCallContext) {
    const draft = await this.services.creativeDesign.getDraft(context);
    if (draft === null) return { applied: false as const };
    try {
      const snapshot = await this.services.creativeDesign.apply({
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        expectedRevision: draft.revision,
      });
      return { applied: true as const, snapshotId: snapshot.snapshotId };
    } catch (error) {
      // The draft no longer fits the storyboard (it was edited since): the
      // design already pinned to this revision stays in use.
      if (error instanceof PublicError && error.code === "validation_failed")
        return { applied: false as const };
      throw error;
    }
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
        // ST-112. A v2 design's presentation illustrations are pinned by the
        // worker as they finish, so only the ones in flight matter here.
        if (slot.slot === cinemaHeroSlot) {
          pending += slot.candidates.filter(
            (candidate) =>
              candidate.status === "queued" ||
              candidate.status === "generating",
          ).length;
          continue;
        }
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
      // ST-107. Acknowledged warnings were accepted by the user; they are not
      // findings for the repair map.
      findings: run.issues
        .filter((issue) => issue.acknowledgedAt === null)
        .map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          sceneId: issue.sceneId,
          scopeId: issue.scopeId,
          details: issue.details,
        })),
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
      // ST-107. Codes, severities and measured details only; the contact
      // sheet's signed URLs are never read here.
      review:
        render.review === null
          ? null
          : {
              outcome: render.review.outcome,
              findings: render.review.findings.map((finding) => ({
                code: finding.code,
                severity: finding.severity,
                detail: finding.detail,
              })),
            },
    };
  }

  // ---- ST-107: bounded self-repair and the brief-promise check -------------

  public async repairContext(scope: OneShotScope): Promise<RepairContext> {
    const [storyboard, objectives] = await Promise.all([
      this.services.storyboard.current(scope),
      this.services.objectives.current(scope),
    ]);
    const working = storyboard.storyboard?.scenes ?? [];
    const sections = await this.blockSections(
      scope,
      working.flatMap((scene) => sceneBlockIds(scene)),
    );
    return {
      scenes: working.map((scene) => ({
        sceneId: scene.stableSceneId,
        order: scene.order,
        template: scene.scene.template,
        blockIds: sceneBlockIds(scene),
        sectionIds: [
          ...new Set(
            sceneBlockIds(scene)
              .map((id) => sections.get(id))
              .filter((id): id is string => id !== undefined),
          ),
        ],
      })),
      objectives: (objectives.approved?.objectives ?? []).map((objective) => ({
        objectiveId: objective.id,
        statement: objective.statement,
        blockIds: objective.sourceRefs.flatMap((ref) => ref.blockIds),
      })),
    };
  }

  public async requestSceneRepair(
    context: OneShotCallContext,
    repair: Parameters<OneShotStageGateway["requestSceneRepair"]>[1],
  ) {
    const current = await this.services.storyboard.current(context);
    if (current.storyboard === null)
      throw new PublicError(
        "bad_request",
        "The storyboard is missing, so the scene cannot be fixed automatically.",
        409,
      );
    const response = await this.services.storyboard.regenerateScene({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      sceneId: repair.sceneId as Identifier,
      body: {
        mode: repair.mode,
        instruction: repair.instruction,
        expectedRevision: current.storyboard.revision,
      },
      idempotencyKey: context.requestKey,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    });
    return { jobId: response.jobId as Identifier };
  }

  public async sceneRepairStatus(
    scope: OneShotScope,
    repair: { sceneId: string; jobId: Identifier },
  ): Promise<SceneRepairStatus> {
    const [job] = await this.services.database
      .select({
        id: jobs.id,
        state: jobs.state,
        idempotencyKey: jobs.idempotencyKey,
        errorMetadata: jobs.errorMetadata,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.id, repair.jobId),
          eq(jobs.ownerUserId, scope.ownerUserId),
          eq(jobs.projectId, scope.projectId),
        ),
      )
      .limit(1);
    if (job === undefined) return { job: null, candidate: null };
    const code = (job.errorMetadata as { code?: unknown } | null)?.code;
    const status: OneShotJobStatus = {
      id: job.id as Identifier,
      state: job.state,
      errorCode: typeof code === "string" ? code : null,
    };
    if (job.state !== "succeeded") return { job: status, candidate: null };
    // The worker stores the candidate under the job's own idempotency key.
    const [candidate] = await this.services.database
      .select({
        id: sceneCandidates.id,
        status: sceneCandidates.status,
        beforeScene: sceneCandidates.beforeScene,
        afterScene: sceneCandidates.afterScene,
        modelCallId: sceneCandidates.modelCallId,
        costUsd: modelCalls.estimatedCostUsd,
      })
      .from(sceneCandidates)
      .innerJoin(
        modelCalls,
        and(
          eq(modelCalls.id, sceneCandidates.modelCallId),
          eq(modelCalls.ownerUserId, scope.ownerUserId),
          eq(modelCalls.projectId, scope.projectId),
        ),
      )
      .where(
        and(
          eq(sceneCandidates.ownerUserId, scope.ownerUserId),
          eq(sceneCandidates.projectId, scope.projectId),
          eq(sceneCandidates.idempotencyKey, job.idempotencyKey),
        ),
      )
      .orderBy(desc(sceneCandidates.createdAt))
      .limit(1);
    if (candidate === undefined) return { job: status, candidate: null };
    const before = lessonStoryboardSceneSchema.safeParse(candidate.beforeScene);
    const after = lessonStoryboardSceneSchema.safeParse(candidate.afterScene);
    const kept =
      before.success &&
      after.success &&
      sceneBlockIds(before.data).every((id) =>
        sceneBlockIds(after.data).includes(id),
      );
    return {
      job: status,
      candidate: {
        id: candidate.id as Identifier,
        status:
          candidate.status === "accepted" || candidate.status === "rejected"
            ? candidate.status
            : "pending",
        keepsSourceRefs: kept,
        costUsd: Number(candidate.costUsd),
        modelCallId: candidate.modelCallId as Identifier,
      },
    };
  }

  public async applySceneRepair(
    context: OneShotCallContext,
    repair: { sceneId: string; candidateId: Identifier },
  ) {
    const body = await this.candidateDecisionBody(context, repair.sceneId);
    await this.services.storyboard.applySceneCandidate({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      sceneId: repair.sceneId as Identifier,
      candidateId: repair.candidateId,
      body,
      correlationId: context.correlationId,
      oneShotRunId: context.oneShotRunId,
    });
  }

  public async rejectSceneRepair(
    context: OneShotCallContext,
    repair: { sceneId: string; candidateId: Identifier },
  ) {
    const body = await this.candidateDecisionBody(context, repair.sceneId);
    await this.services.storyboard.rejectSceneCandidate({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      sceneId: repair.sceneId as Identifier,
      candidateId: repair.candidateId,
      body,
      correlationId: context.correlationId,
    });
  }

  public async removeUnverifiedSentences(context: OneShotCallContext) {
    const [grounding, current] = await Promise.all([
      this.services.grounding.current(context),
      this.services.storyboard.current(context),
    ]);
    const storyboard = current.storyboard;
    const check = grounding.check;
    const removed: { sceneId: string; text: string }[] = [];
    let kept = 0;
    if (
      storyboard === null ||
      check === null ||
      check.lessonSpecRevision !== storyboard.revision
    )
      return { removed, kept };
    const unsupported = new Set(
      check.results
        .filter((result) => result.status === "unsupported")
        .map((result) => result.claimId),
    );
    const sentencesByScene = new Map<string, string[]>();
    for (const claim of check.claims) {
      if (!unsupported.has(claim.id)) continue;
      const sceneId = claim.location.sceneId;
      if (claim.location.type !== "narration" || sceneId === undefined) {
        kept += 1;
        continue;
      }
      sentencesByScene.set(sceneId, [
        ...(sentencesByScene.get(sceneId) ?? []),
        claim.text,
      ]);
    }
    let revision = storyboard.revision;
    for (const [sceneId, sentences] of sentencesByScene) {
      const entry = storyboard.scenes.find(
        (scene) =>
          scene.stableSceneId === sceneId ||
          scene.id === sceneId ||
          scene.scene.id === sceneId,
      );
      if (entry === undefined) {
        kept += sentences.length;
        continue;
      }
      const edit = withoutSentences(entry.scene.narration, sentences);
      kept += edit.missing;
      if (edit.removed.length === 0) continue;
      const response = await this.services.storyboard.updateScene({
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        sceneId: entry.stableSceneId as Identifier,
        correlationId: context.correlationId,
        body: {
          expectedRevision: revision,
          scene: { ...entry.scene, narration: edit.narration },
        },
      });
      revision = response.revision;
      removed.push(
        ...edit.removed.map((text) => ({ sceneId: entry.stableSceneId, text })),
      );
    }
    return { removed, kept };
  }

  public async promiseState(scope: OneShotScope): Promise<PromiseState> {
    const [storyboard, configuration] = await Promise.all([
      this.services.storyboard.current(scope),
      this.services.lessonConfiguration.get(scope.ownerUserId, scope.projectId),
    ]);
    const working = storyboard.storyboard;
    const scenesList = working?.scenes ?? [];
    const [sections, sectionOrder] = await Promise.all([
      this.blockSections(
        scope,
        scenesList.flatMap((scene) => sceneBlockIds(scene)),
      ),
      this.sectionOrder(scope),
    ]);
    return {
      sceneSections: scenesList.map((scene) => ({
        sceneId: scene.stableSceneId,
        order: scene.order,
        sectionIds: [
          ...new Set(
            sceneBlockIds(scene)
              .map((id) => sections.get(id))
              .filter((id): id is string => id !== undefined),
          ),
        ],
      })),
      sectionOrder,
      measuredDurationSeconds: working?.totalDurationSeconds ?? 0,
      toleranceSeconds: reconciledLessonDurationToleranceSeconds(
        working?.targetDurationSeconds ?? 0,
        scenesList.length,
      ),
      pinned: {
        stylePackId: await this.renderedStylePack(scope, working),
        soundBed: configuration.configuration?.soundBed ?? null,
      },
    };
  }

  /**
   * The style pack the lesson will actually preview and render with: the
   * design snapshot pinned to the current storyboard revision. The lesson
   * configuration alone is not enough, because a revision without a snapshot
   * renders the legacy look whatever the configuration says. A missing
   * snapshot is re-pinned here first (idempotent), so only a style that truly
   * cannot be applied fails the brief promise.
   */
  private async renderedStylePack(
    scope: OneShotScope,
    working:
      | {
          id: string;
          revision: number;
          scenes: readonly {
            stableSceneId: string;
            scene: SceneSpec;
          }[];
        }
      | null
      | undefined,
  ): Promise<string | null> {
    if (working === null || working === undefined) return null;
    const now = new Date();
    const manifest = await this.services.database.transaction((transaction) =>
      carryForwardCreativeDesignSnapshot(transaction, {
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        lessonSpecId: working.id,
        nextRevision: working.revision,
        scenes: working.scenes.map((scene) => ({
          ...scene.scene,
          id: scene.stableSceneId,
        })),
        createId: () => createId(now),
        now,
      }),
    );
    return manifest?.pack.id ?? null;
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

  /** The expected revisions a candidate decision is checked against. */
  private async candidateDecisionBody(scope: OneShotScope, sceneId: string) {
    const [current, detail] = await Promise.all([
      this.services.storyboard.current(scope),
      this.services.storyboard.sceneDetail({
        ...scope,
        sceneId: sceneId as Identifier,
      }),
    ]);
    if (current.storyboard === null)
      throw new PublicError(
        "bad_request",
        "The storyboard is missing, so the fix cannot be applied.",
        409,
      );
    return {
      expectedRevision: current.storyboard.revision,
      expectedSceneRevision: detail.sceneRevision,
    };
  }

  /**
   * Source section of each block, through the project's latest parsed
   * document only, so a block ID from another tenant resolves to nothing.
   */
  private async blockSections(
    scope: OneShotScope,
    blockIds: readonly string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(blockIds)];
    if (unique.length === 0) return new Map();
    const document = await findLatestProjectParsedDocument(
      this.services.database,
      scope,
    );
    if (document === undefined) return new Map();
    const rows = await this.services.database
      .select({ id: contentBlocks.id, sectionId: contentBlocks.sectionId })
      .from(contentBlocks)
      .where(
        and(
          eq(contentBlocks.parsedDocumentId, document.id),
          inArray(contentBlocks.id, unique),
        ),
      );
    return new Map(rows.map((row) => [row.id, row.sectionId]));
  }

  /** Document order of every section of the project's latest parse. */
  private async sectionOrder(scope: OneShotScope): Promise<Map<string, number>> {
    const document = await findLatestProjectParsedDocument(
      this.services.database,
      scope,
    );
    if (document === undefined) return new Map();
    const rows = await this.services.database
      .select({ id: parsedSections.id })
      .from(parsedSections)
      .where(eq(parsedSections.parsedDocumentId, document.id))
      .orderBy(asc(parsedSections.pageStart), asc(parsedSections.order));
    return new Map(rows.map((row, index) => [row.id, index]));
  }

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

/** Every source block a storyboard scene cites. */
function sceneBlockIds(scene: LessonStoryboardScene): string[] {
  return scene.scene.sourceRefs.flatMap((ref) => ref.blockIds);
}
