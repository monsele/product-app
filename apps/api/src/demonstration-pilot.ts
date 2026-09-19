/**
 * ST-096 — the demonstration pilot's API.
 *
 * Five operations, each bounded: is this lesson eligible, create a comparison,
 * load one, request or retry one half of it, and record what a tester thought.
 *
 * The invariants worth stating up front, because the rest of this file exists
 * to keep them:
 *
 * - **The baseline never moves.** A comparison references an immutable lesson
 *   version and writes only to its own three tables plus a render job. Nothing
 *   here updates `lesson_specs`, `lesson_versions`, `projects` or an existing
 *   render, so creating or retrying a comparison cannot change what the teacher
 *   already approved (AC5).
 *
 * - **Two approaches, two identities.** The approach is inside the hashed
 *   variant identity and inside the render job's idempotency key, so the
 *   demonstration half of a pair can never be served the standard half's cached
 *   output even though their narration is byte-identical (CR-06, AC7).
 *
 * - **No silent fallback.** Every refusal names a reason and a recovery. A
 *   lesson that stops being eligible produces an error, never a quiet
 *   substitution of the standard approach (AC2).
 *
 * - **The server decides.** Cohort membership and content eligibility are
 *   re-checked on every write. Hiding a radio button is not authorisation.
 */

import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  captionCues,
  captionTracks,
  demonstrationComparisons,
  demonstrationFeedback,
  demonstrationVariants,
  jobs,
  lessonVersions,
  renderJobs,
  renderedVideos,
  sceneAudio,
  scenes,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { hashJobOptions } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  lessonSpecSchema,
  readVideoApproach,
  videoApproachSchema,
  type RenderStatusResponse,
  type VideoApproach,
} from "@avlp/schemas";
import {
  demonstrationComparisonCreateSchema,
  demonstrationComparisonListSchema,
  demonstrationComparisonViewSchema,
  demonstrationEligibilitySchema,
  demonstrationFeedbackInputSchema,
  demonstrationFeedbackViewSchema,
  demonstrationPilotExperimentVersion,
  demonstrationPilotHashPolicy,
  demonstrationVariantIdentityInputSchema,
  demonstrationVariantPlanSchema,
  demonstrationVariantRequestSchema,
  type DemonstrationComparisonList,
  type DemonstrationComparisonView,
  type DemonstrationEligibility,
  type DemonstrationFeedbackView,
  type DemonstrationIneligibilityReason,
  type DemonstrationVariantPlan,
} from "@avlp/schemas/demonstration-pilot";
import {
  demonstrationFps,
  demonstrationNarrationTrackSchema,
  type DemonstrationNarrationTrack,
} from "@avlp/schemas/demonstration-proof";
import {
  buildDemonstrationPilotPlans,
  demonstrationPilotBindings,
  resolveDemonstrationPilotBinding,
  type DemonstrationPilotBinding,
} from "@avlp/scene-library/demonstration-proof";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { RenderService } from "./renders.js";

type Scope = { ownerUserId: Identifier; projectId: Identifier };

/**
 * Who may see and choose the experimental approach.
 *
 * Deliberately an interface rather than an environment lookup buried in the
 * service: the cohort is checked on every read *and* every write, and the tests
 * need to drive both sides of it without setting process environment.
 */
export interface DemonstrationPilotCohort {
  /** False turns off *new* experimental work while leaving completed outputs
   * readable, which is what the story's feature-flag requirement asks for. */
  enabled(): boolean;
  includes(userId: Identifier): boolean;
}

export function createEnvironmentPilotCohort(environment: {
  DEMONSTRATION_PILOT_ENABLED?: boolean;
  DEMONSTRATION_PILOT_USER_IDS?: string;
}): DemonstrationPilotCohort {
  const members = new Set(
    (environment.DEMONSTRATION_PILOT_USER_IDS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
  const enabled = environment.DEMONSTRATION_PILOT_ENABLED === true;
  return {
    enabled: () => enabled,
    includes: (userId) => members.has(userId.toLowerCase()),
  };
}

export interface DemonstrationPilotService {
  eligibility(input: Scope): Promise<DemonstrationEligibility>;
  list(input: Scope): Promise<DemonstrationComparisonList>;
  create(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<DemonstrationComparisonView>;
  detail(
    input: Scope & { comparisonId: Identifier },
  ): Promise<DemonstrationComparisonView>;
  requestVariant(
    input: Scope & {
      comparisonId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<DemonstrationComparisonView>;
  retryVariant(
    input: Scope & {
      comparisonId: Identifier;
      variantId: Identifier;
      correlationId: Identifier;
    },
  ): Promise<DemonstrationComparisonView>;
  feedback(
    input: Scope & { comparisonId: Identifier },
  ): Promise<DemonstrationFeedbackView>;
  saveFeedback(
    input: Scope & {
      comparisonId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<DemonstrationFeedbackView>;
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}

function notFound(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}

/**
 * A refusal a tester can act on.
 *
 * `reasons` is carried in the error details rather than flattened into the
 * message so the client can render the same list it renders beside the
 * disabled radio button, instead of two different explanations of one thing.
 */
function ineligible(
  reasons: readonly DemonstrationIneligibilityReason[],
): PublicError {
  return new PublicError(
    "bad_request",
    "This lesson cannot be explained with the demonstration approach.",
    409,
    false,
    Object.fromEntries(
      reasons.map((reason, index) => [
        `reasons.${index}`,
        `${reason.code}: ${reason.suggestedCorrection}`,
      ]),
    ),
  );
}

/** The audio and cue identity shared by both halves of a controlled pair.
 * Storage locations are included because they identify the immutable project
 * media; signed delivery URLs are deliberately absent. */
const renderMediaIdentitySchema = z
  .object({
    audio: z.array(
      z
        .object({
          checksumSha256: z.string().length(64),
          contentType: z.string(),
          sceneId: z.string().uuid(),
          storageKey: z.string().min(1),
        })
        .strict(),
    ),
    captions: z.array(
      z
        .object({
          endFrame: z.number().int(),
          sceneId: z.string().uuid(),
          startFrame: z.number().int(),
          text: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

function renderMediaIdentityHash(value: unknown): string | undefined {
  const parsed = renderMediaIdentitySchema.safeParse(value);
  return parsed.success ? hashJobOptions(parsed.data) : undefined;
}

const profileForIdentity = Object.freeze({
  audioCodec: "aac",
  fps: 30,
  height: 1080,
  pixelFormat: "yuv420p",
  videoCodec: "h264",
  width: 1920,
});
const demonstrationPilotRendererVersion =
  "st-096-remotion-4.0.507-scene-library-v1";

type EligibilityOutcome = Readonly<{
  eligibility: DemonstrationEligibility;
  binding?: DemonstrationPilotBinding;
  baseline?: typeof lessonVersions.$inferSelect;
  narration?: Readonly<Record<string, DemonstrationNarrationTrack>>;
  sceneAudioRows?: readonly SceneAudioRow[];
  /** The lesson's own scene IDs, in the binding's scene order. */
  lessonSceneIds?: readonly string[];
}>;

/**
 * A scene's audio, still carrying the scene it belongs to.
 *
 * The pairing is kept explicit rather than relying on two arrays staying in the
 * same order: the binding's scene order and the query's row order agree today,
 * and a mis-pairing would not fail loudly - it would animate one scene's plan
 * over another scene's recording.
 */
type SceneAudioRow = Readonly<{
  stableSceneId: string;
  audio: typeof sceneAudio.$inferSelect;
}>;

export class PostgresDemonstrationPilotService implements DemonstrationPilotService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly cohort: DemonstrationPilotCohort,
    private readonly renders: Pick<RenderService, "retry" | "start">,
    private readonly storage: Pick<ObjectStorage, "getMetadata">,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async eligibility(input: Scope): Promise<DemonstrationEligibility> {
    return (await this.resolveEligibility(this.database, input)).eligibility;
  }

  public async list(input: Scope): Promise<DemonstrationComparisonList> {
    const [eligibility, rows] = await Promise.all([
      this.eligibility(input),
      this.database
        .select()
        .from(demonstrationComparisons)
        .where(
          and(
            eq(demonstrationComparisons.ownerUserId, input.ownerUserId),
            eq(demonstrationComparisons.projectId, input.projectId),
          ),
        )
        .orderBy(desc(demonstrationComparisons.createdAt))
        .limit(50),
    ]);
    const views = await Promise.all(
      rows.map((row) => this.view(this.database, input, row)),
    );
    return demonstrationComparisonListSchema.parse({
      comparisons: views,
      eligibility,
    });
  }

  public async detail(
    input: Scope & { comparisonId: Identifier },
  ): Promise<DemonstrationComparisonView> {
    const row = await this.loadComparison(this.database, input);
    return this.view(this.database, input, row);
  }

  public async create(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<DemonstrationComparisonView> {
    const command = parse(demonstrationComparisonCreateSchema, input.body);
    this.assertCohort(input.ownerUserId);
    const now = this.now();
    const resolved = await this.resolveEligibility(this.database, input, {
      lessonVersionId: command.lessonVersionId,
    });
    if (
      resolved.binding === undefined ||
      resolved.baseline === undefined ||
      resolved.narration === undefined ||
      resolved.sceneAudioRows === undefined
    )
      throw ineligible(resolved.eligibility.reasons);

    const plan = await this.buildVariantPlan(
      input,
      resolved.binding,
      resolved.lessonSceneIds ?? [],
      resolved.narration,
      resolved.sceneAudioRows,
      resolved.baseline,
    );
    const planSha256 = hashJobOptions(plan);
    const correspondence = this.sceneCorrespondence(plan);
    const durationInFrames = correspondence.reduce(
      (total, scene) => total + scene.durationInFrames,
      0,
    );
    const captionSha256 = hashJobOptions(plan.captions);
    const audioChecksums = plan.scenes.map(
      (scene) => scene.audio.checksumSha256,
    );
    const standardRenderMediaSha256 = renderMediaIdentityHash({
      audio: plan.scenes.map((scene) => ({
        checksumSha256: scene.audio.checksumSha256,
        contentType: scene.audio.contentType,
        sceneId: scene.sceneId,
        storageKey: scene.audio.storageKey,
      })),
      captions: plan.captions,
    });
    if (standardRenderMediaSha256 === undefined)
      throw new Error("The comparison's resolved media identity is invalid.");

    const comparisonId = await this.database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: demonstrationComparisons.id })
        .from(demonstrationComparisons)
        .where(
          and(
            eq(demonstrationComparisons.ownerUserId, input.ownerUserId),
            eq(demonstrationComparisons.projectId, input.projectId),
            eq(
              demonstrationComparisons.baselineLessonVersionId,
              resolved.baseline!.id,
            ),
            eq(
              demonstrationComparisons.experimentVersion,
              demonstrationPilotExperimentVersion,
            ),
          ),
        )
        .limit(1);
      // A repeated click opens the existing pair rather than making a second
      // one. The story asks for exactly this, and the unique index below makes
      // it true even when two requests race past this read.
      if (existing !== undefined) return existing.id as Identifier;

      const id = createId(now);
      const [created] = await tx
        .insert(demonstrationComparisons)
        .values({
          id,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          baselineLessonVersionId: resolved.baseline!.id,
          baselineContentHash: resolved.baseline!.contentHash,
          sourceSnapshotId: resolved.baseline!.sourceSnapshotId,
          experimentVersion: demonstrationPilotExperimentVersion,
          themeId: "mvp-default",
          sceneCorrespondence: correspondence,
          mediaIdentity: {
            audio: plan.scenes.map((scene) => ({
              beatCount: scene.audio.beats.length,
              checksumSha256: scene.audio.checksumSha256,
              durationMs: scene.audio.durationMs,
              sceneId: scene.sceneId,
            })),
            captionSha256,
            hashPolicy: demonstrationPilotHashPolicy,
            rendererVersion: demonstrationPilotRendererVersion,
            standardRenderMediaSha256,
          },
          durationInFrames,
          createdBy: input.ownerUserId,
          createdAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: demonstrationComparisons.id });
      if (created === undefined) {
        const [raced] = await tx
          .select({ id: demonstrationComparisons.id })
          .from(demonstrationComparisons)
          .where(
            and(
              eq(demonstrationComparisons.ownerUserId, input.ownerUserId),
              eq(demonstrationComparisons.projectId, input.projectId),
              eq(
                demonstrationComparisons.baselineLessonVersionId,
                resolved.baseline!.id,
              ),
              eq(
                demonstrationComparisons.experimentVersion,
                demonstrationPilotExperimentVersion,
              ),
            ),
          )
          .limit(1);
        if (raced === undefined)
          throw new Error("The comparison could not be read after creation.");
        return raced.id as Identifier;
      }

      for (const approach of videoApproachSchema.options) {
        const identity = this.identityFor({
          approach,
          audioChecksums,
          baseline: resolved.baseline!,
          captionSha256,
          planSha256: approach === "demonstration" ? planSha256 : null,
        });
        await tx
          .insert(demonstrationVariants)
          .values({
            id: createId(now),
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            comparisonId: id,
            approach,
            status: "pending",
            identitySha256: identity,
            plan: approach === "demonstration" ? plan : null,
            planSha256: approach === "demonstration" ? planSha256 : null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }

      // Adopt, rather than re-render, an output this project already produced
      // from the same baseline. That is what keeps "create a comparison" from
      // silently duplicating billed work, and what keeps the teacher's original
      // render the authoritative standard half of the pair.
      await this.adoptExistingRender(
        tx,
        input,
        id,
        resolved.baseline!.id as Identifier,
        standardRenderMediaSha256,
        demonstrationPilotRendererVersion,
      );

      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "demonstration.comparison_created",
        target: { type: "lesson_version", id: resolved.baseline!.id },
        correlationId: input.correlationId,
        metadata: {
          comparisonId: id,
          experimentVersion: demonstrationPilotExperimentVersion,
          bindingId: plan.bindingId,
        },
        occurredAt: now,
      });
      return id;
    });

    await this.startVariant({
      ...input,
      approach: command.approach,
      comparisonId,
      retry: false,
    });
    return this.detail({ ...input, comparisonId });
  }

  public async requestVariant(
    input: Scope & {
      comparisonId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<DemonstrationComparisonView> {
    const command = parse(demonstrationVariantRequestSchema, input.body);
    this.assertCohort(input.ownerUserId);
    await this.startVariant({
      ...input,
      approach: command.approach,
      retry: false,
    });
    return this.detail(input);
  }

  public async retryVariant(
    input: Scope & {
      comparisonId: Identifier;
      variantId: Identifier;
      correlationId: Identifier;
    },
  ): Promise<DemonstrationComparisonView> {
    this.assertCohort(input.ownerUserId);
    const [variant] = await this.database
      .select()
      .from(demonstrationVariants)
      .where(
        and(
          eq(demonstrationVariants.id, input.variantId),
          eq(demonstrationVariants.comparisonId, input.comparisonId),
          eq(demonstrationVariants.ownerUserId, input.ownerUserId),
          eq(demonstrationVariants.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (variant === undefined) throw notFound();
    await this.startVariant({
      ...input,
      approach: variant.approach,
      retry: true,
    });
    return this.detail(input);
  }

  public async feedback(
    input: Scope & { comparisonId: Identifier },
  ): Promise<DemonstrationFeedbackView> {
    await this.loadComparison(this.database, input);
    const [row] = await this.database
      .select()
      .from(demonstrationFeedback)
      .where(
        and(
          eq(demonstrationFeedback.comparisonId, input.comparisonId),
          eq(demonstrationFeedback.ownerUserId, input.ownerUserId),
          eq(demonstrationFeedback.projectId, input.projectId),
          eq(demonstrationFeedback.testerUserId, input.ownerUserId),
        ),
      )
      .limit(1);
    return demonstrationFeedbackViewSchema.parse({
      comparisonId: input.comparisonId,
      comment: row?.comment ?? null,
      preference: row?.preference ?? null,
      ratedVariantIds: (row?.ratedVariantIds as string[] | undefined) ?? [],
      ratedOutputs: (row?.ratedOutputs as unknown[] | undefined) ?? [],
      ratings: (row?.ratings as unknown[] | undefined) ?? [],
      revision: row?.revision ?? 0,
      updatedAt:
        row === undefined ? null : serializeUtcTimestamp(row.updatedAt),
    });
  }

  public async saveFeedback(
    input: Scope & {
      comparisonId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<DemonstrationFeedbackView> {
    const command = parse(demonstrationFeedbackInputSchema, input.body);
    const now = this.now();
    await this.database.transaction(async (tx) => {
      await this.loadComparison(tx, input);
      const variants = await tx
        .select({
          job: jobs,
          render: renderJobs,
          variant: demonstrationVariants,
          video: renderedVideos,
        })
        .from(demonstrationVariants)
        .innerJoin(renderJobs, eq(renderJobs.id, demonstrationVariants.renderJobId))
        .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
        .innerJoin(renderedVideos, eq(renderedVideos.renderJobId, renderJobs.id))
        .where(
          and(
            eq(demonstrationVariants.comparisonId, input.comparisonId),
            eq(demonstrationVariants.ownerUserId, input.ownerUserId),
            eq(demonstrationVariants.projectId, input.projectId),
          ),
        )
        .orderBy(asc(demonstrationVariants.approach));
      if (
        variants.length !== videoApproachSchema.options.length ||
        variants.some((entry) => entry.job.state !== "succeeded")
      )
        throw new PublicError(
          "bad_request",
          "Feedback is available after both comparison outputs are ready.",
          409,
        );
      const [current] = await tx
        .select()
        .from(demonstrationFeedback)
        .where(
          and(
            eq(demonstrationFeedback.comparisonId, input.comparisonId),
            eq(demonstrationFeedback.ownerUserId, input.ownerUserId),
            eq(demonstrationFeedback.projectId, input.projectId),
            eq(demonstrationFeedback.testerUserId, input.ownerUserId),
          ),
        )
        .limit(1)
        .for("update");
      const expected = current?.revision ?? 0;
      if (command.expectedRevision !== expected)
        throw new PublicError(
          "bad_request",
          "This feedback changed since it was loaded. Reload and try again.",
          409,
        );
      const values = {
        ratings: command.ratings,
        preference: command.preference,
        comment:
          command.comment === null || command.comment.length === 0
            ? null
            : command.comment,
        ratedVariantIds: variants.map((entry) => entry.variant.id),
        ratedOutputs: variants.map((entry) => ({
          approach: entry.variant.approach,
          checksumSha256: entry.video.checksumSha256,
          renderJobId: entry.render.id,
          renderedVideoId: entry.video.id,
          variantId: entry.variant.id,
        })),
        updatedAt: now,
      };
      if (current === undefined)
        await tx.insert(demonstrationFeedback).values({
          id: createId(now),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          comparisonId: input.comparisonId,
          testerUserId: input.ownerUserId,
          revision: 1,
          createdAt: now,
          ...values,
        });
      else
        await tx
          .update(demonstrationFeedback)
          .set({ ...values, revision: current.revision + 1 })
          .where(
            and(
              eq(demonstrationFeedback.id, current.id),
              eq(demonstrationFeedback.revision, current.revision),
            ),
          );
      // The comment is tenant content. Only its presence is audited; the words
      // themselves stay inside the authorised project scope.
      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "demonstration.feedback_saved",
        target: { type: "lesson_version", id: input.comparisonId },
        correlationId: input.correlationId,
        metadata: {
          comparisonId: input.comparisonId,
          hasComment: values.comment !== null,
          preference: command.preference ?? "unstated",
          ratedApproaches: command.ratings.length,
        },
        occurredAt: now,
      });
    });
    return this.feedback(input);
  }

  // -------------------------------------------------------------------------
  // Eligibility
  // -------------------------------------------------------------------------

  private assertCohort(userId: Identifier): void {
    if (!this.cohort.enabled())
      throw new PublicError(
        "bad_request",
        "The demonstration pilot is not currently accepting new comparisons.",
        409,
      );
    if (!this.cohort.includes(userId))
      throw new PublicError(
        "bad_request",
        "The demonstration-led approach is not enabled for this account.",
        409,
      );
  }

  private async resolveEligibility(
    executor: DatabaseExecutor,
    input: Scope,
    options: { lessonVersionId?: Identifier } = {},
  ): Promise<EligibilityOutcome> {
    const inCohort = this.cohort.includes(input.ownerUserId);
    const enabled = this.cohort.enabled();
    const testLesson = this.supportedTestLessonHint();

    if (!inCohort)
      return {
        eligibility: this.eligibilityOf({
          visible: false,
          reasons: [
            {
              code: "not_in_cohort",
              message:
                "The demonstration-led approach is an invited pilot and is not enabled for this account.",
              suggestedCorrection:
                "Continue with the standard explanation. Ask the product team if you would like to join the pilot.",
            },
          ],
          supportedTestLesson: null,
        }),
      };

    if (!enabled)
      return {
        eligibility: this.eligibilityOf({
          visible: true,
          reasons: [
            {
              code: "pilot_disabled",
              message:
                "The demonstration pilot is paused, so no new experimental videos can be started.",
              suggestedCorrection:
                "Continue with the standard explanation. Comparisons you have already produced remain available.",
            },
          ],
          supportedTestLesson: testLesson,
        }),
      };

    const baseline = await this.loadBaseline(executor, input, options);
    if (baseline === undefined)
      return {
        eligibility: this.eligibilityOf({
          visible: true,
          reasons: [
            {
              code: "no_baseline_version",
              message:
                "This lesson has no saved version yet, so there is nothing to compare from.",
              suggestedCorrection:
                "Finish the storyboard, generate narration audio and save a lesson version, then try again.",
            },
          ],
          supportedTestLesson: testLesson,
        }),
      };

    const lesson = lessonSpecSchema.safeParse(
      (baseline.snapshot as { lessonSpec?: unknown }).lessonSpec,
    );
    const audioRows = await this.loadSceneAudio(executor, input, baseline);
    const orderedSceneIds = lesson.success
      ? lesson.data.scenes.map((scene) => scene.id)
      : [];
    // Matched on the narration recordings, in scene order. Scene IDs are minted
    // per project and cannot identify a curated subject; the audio checksums
    // can, and are the thing the animation's measured beats belong to.
    const orderedChecksums = orderedSceneIds.map(
      (sceneId) =>
        audioRows.find((row) => row.stableSceneId === sceneId)?.audio
          .checksumSha256 ?? "",
    );
    const binding = lesson.success
      ? resolveDemonstrationPilotBinding(orderedChecksums)
      : undefined;
    if (binding === undefined)
      return {
        eligibility: this.eligibilityOf({
          visible: true,
          reasons: [
            {
              code: "no_registered_recipe",
              message:
                "No registered demonstration recipe explains this lesson's content. The pilot covers two curated subjects while the approach is being evaluated.",
              suggestedCorrection:
                "Open one of the supported test lessons to compare the two approaches, or keep this lesson on the standard explanation.",
            },
          ],
          supportedTestLesson: testLesson,
        }),
        baseline,
      };

    const missing = binding.scenes.filter((scene, index) => {
      const row = audioRows.find(
        (entry) => entry.stableSceneId === orderedSceneIds[index],
      );
      return (
        row === undefined ||
        row.audio.status !== "ready" ||
        row.audio.storageKey === null ||
        row.audio.checksumSha256 === null ||
        row.audio.durationMs === null
      );
    });
    if (missing.length > 0)
      return {
        eligibility: this.eligibilityOf({
          visible: true,
          reasons: missing.map((scene) => ({
            code: "narration_not_ready" as const,
            message: `Scene "${scene.title}" has no current narration audio.`,
            suggestedCorrection:
              "Generate narration audio and captions for every scene, then try again.",
          })),
          supportedTestLesson: testLesson,
        }),
        baseline,
        binding,
      };

    const drifted = binding.scenes.filter((scene, index) => {
      const row = audioRows.find(
        (entry) => entry.stableSceneId === orderedSceneIds[index],
      );
      return row?.audio.checksumSha256 !== scene.narrationChecksumSha256;
    });
    if (drifted.length > 0)
      return {
        eligibility: this.eligibilityOf({
          visible: true,
          reasons: drifted.map((scene) => ({
            code: "narration_identity_changed" as const,
            message: `Scene "${scene.title}"'s narration recording is not the one this demonstration was timed against.`,
            suggestedCorrection:
              "Restore the approved narration for this scene, or use a curated test lesson. The animation is never retimed to fit different audio.",
          })),
          supportedTestLesson: testLesson,
        }),
        baseline,
        binding,
      };

    const narration = Object.fromEntries(
      binding.scenes.map((scene, index) => {
        const lessonSceneId = orderedSceneIds[index]!;
        const row = audioRows.find(
          (entry) => entry.stableSceneId === lessonSceneId,
        )!;
        return [
          lessonSceneId,
          demonstrationNarrationTrackSchema.parse({
            beats: this.beatsFor(scene),
            checksumSha256: row.audio.checksumSha256,
            durationMs: row.audio.durationMs,
            sceneId: lessonSceneId,
            // The composition resolves a real signed URL at playback and render
            // time. Identity never depends on it, so a placeholder of the right
            // shape is the honest value to carry through eligibility.
            src: "data:audio/wav;base64,AA==",
            timingProvenance: this.timingProvenanceFor(scene),
          }),
        ];
      }),
    );

    const built = buildDemonstrationPilotPlans(
      binding,
      orderedSceneIds,
      narration,
    );
    if (built.plans === undefined)
      return {
        eligibility: this.eligibilityOf({
          visible: true,
          reasons: built.issues.slice(0, 20).map((issue) => ({
            code: "plan_validation_failed" as const,
            message: issue.message,
            ...(issue.sceneId === undefined ? {} : { sceneId: issue.sceneId }),
            suggestedCorrection: issue.suggestedCorrection,
          })),
          supportedTestLesson: testLesson,
        }),
        baseline,
        binding,
      };

    return {
      eligibility: this.eligibilityOf({
        visible: true,
        reasons: [],
        recipes: built.plans.map((entry) => ({
          recipeId: entry.recipeId,
          recipeVersion: entry.plan.recipe.version,
          sceneId: entry.sceneId,
        })),
        supportedTestLesson: null,
      }),
      baseline,
      binding,
      lessonSceneIds: orderedSceneIds,
      narration,
      sceneAudioRows: audioRows,
    };
  }

  private eligibilityOf(input: {
    visible: boolean;
    reasons: readonly DemonstrationIneligibilityReason[];
    recipes?: readonly {
      sceneId: string;
      recipeId: string;
      recipeVersion: string;
    }[];
    supportedTestLesson: {
      subject: string;
      label: string;
      projectId: null;
    } | null;
  }): DemonstrationEligibility {
    return demonstrationEligibilitySchema.parse({
      experimentVersion: demonstrationPilotExperimentVersion,
      reasons: input.reasons,
      recipes: input.recipes ?? [],
      selectable: input.reasons.length === 0,
      supportedTestLesson: input.supportedTestLesson,
      visible: input.visible,
    });
  }

  private supportedTestLessonHint(): {
    subject: string;
    label: string;
    projectId: null;
  } {
    const first = demonstrationPilotBindings[0]!;
    return { label: first.label, projectId: null, subject: first.subject };
  }

  /**
   * The measured beats for one scene.
   *
   * They come from the binding, not from the caption track, and the caller has
   * already required the scene's audio checksum to equal the binding's. So the
   * beats are the ones measured from *these exact bytes* — which is what makes
   * `measured-phrase-boundaries` a truthful provenance claim rather than a
   * label copied onto whatever audio happened to be present.
   */
  private beatsFor(
    scene: DemonstrationPilotBinding["scenes"][number],
  ): unknown {
    return registeredBeats(scene.narrationTrackId);
  }

  private timingProvenanceFor(
    scene: DemonstrationPilotBinding["scenes"][number],
  ): unknown {
    return registeredProvenance(scene.narrationTrackId);
  }

  // -------------------------------------------------------------------------
  // Variant assembly
  // -------------------------------------------------------------------------

  private async buildVariantPlan(
    input: Scope,
    binding: DemonstrationPilotBinding,
    lessonSceneIds: readonly string[],
    narration: Readonly<Record<string, DemonstrationNarrationTrack>>,
    audioRows: readonly SceneAudioRow[],
    baseline: typeof lessonVersions.$inferSelect,
  ): Promise<DemonstrationVariantPlan> {
    const built = buildDemonstrationPilotPlans(
      binding,
      lessonSceneIds,
      narration,
    );
    if (built.plans === undefined)
      throw ineligible(
        built.issues.map((issue) => ({
          code: "plan_validation_failed" as const,
          message: issue.message,
          ...(issue.sceneId === undefined ? {} : { sceneId: issue.sceneId }),
          suggestedCorrection: issue.suggestedCorrection,
        })),
      );

    const assets = await this.resolvePilotAssets(input, binding);
    const captions = await this.resolveCaptions(
      input,
      binding,
      lessonSceneIds,
      audioRows,
    );

    const scenes = binding.scenes.map((scene, index) => {
      const lessonSceneId = lessonSceneIds[index]!;
      const audioRow = audioRows.find(
        (row) => row.stableSceneId === lessonSceneId,
      )?.audio;
      const track = narration[lessonSceneId]!;
      if (audioRow?.storageKey == null || audioRow.contentType == null)
        throw new Error("A ready scene audio row lost its storage identity.");
      const contentType =
        audioRow.contentType === "audio/wav" ? "audio/wav" : "audio/mpeg";
      return {
        assetBySlot: { ...scene.assetBySlot },
        audio: {
          beats: track.beats.map((beat) => ({ ...beat })),
          checksumSha256: track.checksumSha256,
          contentType,
          durationMs: track.durationMs,
          storageKey: audioRow.storageKey,
          timingProvenance: track.timingProvenance,
        },
        durationSeconds: scene.durationSeconds,
        narration: scene.narration,
        order: scene.order,
        plan: built.plans!.find((entry) => entry.sceneId === lessonSceneId)!
          .plan,
        planVersion: "1.0.0" as const,
        recipeId: scene.recipeId,
        recipeVersion: "1.0.0" as const,
        sceneId: lessonSceneId,
        title: scene.title,
      };
    });

    void baseline;
    return demonstrationVariantPlanSchema.parse({
      assets,
      bindingId: binding.bindingId,
      captions,
      experimentVersion: demonstrationPilotExperimentVersion,
      hashPolicy: demonstrationPilotHashPolicy,
      schemaVersion: 1,
      scenes,
      themeId: "mvp-default",
    });
  }

  /**
   * Resolves each recipe asset slot to verified bytes in the project's storage.
   *
   * The artwork must already be in the project's own prefix before a variant
   * can reference it, because a render resolves media through the tenant-scoped
   * path and a manifest checksum is not permission to read anything (CR-02).
   * The seeding path writes those objects; this verifies them and refuses
   * rather than falling back to the bundled copy if one is missing or has
   * changed underneath.
   */
  private async resolvePilotAssets(
    input: Scope,
    binding: DemonstrationPilotBinding,
  ): Promise<unknown[]> {
    return Promise.all(
      binding.assets.map(async (asset) => {
        const storageKey = storageKeys.demonstrationAsset({
          assetId: asset.assetId,
          extension: asset.contentType === "image/png" ? "png" : "svg",
          projectId: input.projectId,
          userId: input.ownerUserId,
        });
        const metadata = await this.storage
          .getMetadata(storageKey)
          .catch(() => undefined);
        if (metadata === undefined)
          throw ineligible([
            {
              code: "no_registered_recipe",
              message: `The demonstration artwork "${asset.assetId}" is not available in this project.`,
              suggestedCorrection:
                "Open a supported test lesson, which carries the demonstration artwork with its provenance.",
            },
          ]);
        if (metadata.checksumSha256 !== asset.checksumSha256)
          throw ineligible([
            {
              code: "no_registered_recipe",
              message: `The demonstration artwork "${asset.assetId}" no longer matches its registered checksum.`,
              suggestedCorrection:
                "Open a fresh supported test lesson. Artwork is never substituted once a comparison references it.",
            },
          ]);
        return {
          altText: asset.altText,
          assetId: asset.assetId,
          checksumSha256: asset.checksumSha256,
          contentType: asset.contentType,
          height: asset.height,
          provenance: asset.provenance,
          storageKey,
          width: asset.width,
        };
      }),
    );
  }

  /**
   * The lesson's own caption cues, on the composition's global frame timeline.
   *
   * Read from `caption_cues` rather than regenerated from the binding, because
   * AC4 requires both approaches to present the *same* captions and the
   * standard half reads these exact rows. Offsetting by the preceding scenes'
   * frames is the same arithmetic the render manifest performs, for the same
   * reason.
   */
  private async resolveCaptions(
    input: Scope,
    binding: DemonstrationPilotBinding,
    lessonSceneIds: readonly string[],
    audioRows: readonly SceneAudioRow[],
  ): Promise<unknown[]> {
    const tracks = await this.database
      .select({ track: captionTracks, audioId: sceneAudio.id })
      .from(captionTracks)
      .innerJoin(sceneAudio, eq(sceneAudio.id, captionTracks.sceneAudioId))
      .where(
        and(
          eq(captionTracks.ownerUserId, input.ownerUserId),
          eq(captionTracks.projectId, input.projectId),
          eq(captionTracks.status, "ready"),
          inArray(
            sceneAudio.id,
            audioRows.map((row) => row.audio.id),
          ),
        ),
      )
      .orderBy(desc(captionTracks.updatedAt));

    const cues: unknown[] = [];
    let offsetFrames = 0;
    for (const [index, scene] of binding.scenes.entries()) {
      const lessonSceneId = lessonSceneIds[index]!;
      const audioRow = audioRows.find(
        (row) => row.stableSceneId === lessonSceneId,
      )?.audio;
      const track = tracks.find((entry) => entry.audioId === audioRow?.id);
      if (audioRow === undefined || track === undefined)
        throw ineligible([
          {
            code: "narration_not_ready",
            message: `Scene "${scene.title}" has no current captions.`,
            sceneId: lessonSceneId,
            suggestedCorrection:
              "Generate captions for every scene, then create the comparison again.",
          },
        ]);
      const rows = await this.database
        .select({
          endMs: captionCues.endMs,
          startMs: captionCues.startMs,
          text: captionCues.text,
        })
        .from(captionCues)
        .where(
          and(
            eq(captionCues.ownerUserId, input.ownerUserId),
            eq(captionCues.projectId, input.projectId),
            eq(captionCues.trackId, track.track.id),
          ),
        )
        .orderBy(asc(captionCues.position));
      for (const cue of rows)
        cues.push({
          endFrame:
            offsetFrames + Math.round((cue.endMs / 1_000) * demonstrationFps),
          sceneId: lessonSceneId,
          startFrame:
            offsetFrames + Math.round((cue.startMs / 1_000) * demonstrationFps),
          text: cue.text,
        });
      offsetFrames += scene.durationSeconds * demonstrationFps;
    }
    return cues;
  }

  private sceneCorrespondence(plan: DemonstrationVariantPlan): {
    sceneId: string;
    order: number;
    title: string;
    startFrame: number;
    durationInFrames: number;
  }[] {
    let startFrame = 0;
    return plan.scenes.map((scene) => {
      const durationInFrames = scene.durationSeconds * demonstrationFps;
      const entry = {
        durationInFrames,
        order: scene.order,
        sceneId: scene.sceneId,
        startFrame,
        title: scene.title,
      };
      startFrame += durationInFrames;
      return entry;
    });
  }

  private identityFor(input: {
    approach: VideoApproach;
    audioChecksums: readonly string[];
    baseline: typeof lessonVersions.$inferSelect;
    captionSha256: string;
    planSha256: string | null;
  }): string {
    return hashJobOptions(
      demonstrationVariantIdentityInputSchema.parse({
        approach: input.approach,
        audioChecksums: [...input.audioChecksums],
        baselineContentHash: input.baseline.contentHash,
        baselineLessonVersionId: input.baseline.id,
        captionSha256: input.captionSha256,
        experimentVersion: demonstrationPilotExperimentVersion,
        planSha256: input.planSha256,
        profileSha256: hashJobOptions(profileForIdentity),
        rendererVersion: demonstrationPilotRendererVersion,
        themeId: "mvp-default",
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Render lifecycle
  // -------------------------------------------------------------------------

  private async adoptExistingRender(
    executor: DatabaseExecutor,
    input: Scope,
    comparisonId: Identifier,
    baselineLessonVersionId: Identifier,
    expectedMediaSha256: string,
    expectedRendererVersion: string,
  ): Promise<void> {
    const candidates = await executor
      .select({ render: renderJobs, job: jobs })
      .from(renderJobs)
      .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
      .where(
        and(
          eq(renderJobs.ownerUserId, input.ownerUserId),
          eq(renderJobs.projectId, input.projectId),
          eq(renderJobs.lessonVersionId, baselineLessonVersionId),
          eq(jobs.state, "succeeded"),
        ),
      )
      .orderBy(desc(renderJobs.createdAt));
    const adopted = candidates.find((entry) => {
      const manifest = entry.render.manifest as {
        approach?: unknown;
        audio?: unknown;
        captions?: unknown;
        comparison?: unknown;
      };
      // Only a plain project render is adoptable. A render that already belongs
      // to a comparison is that comparison's evidence and is never re-pointed.
      return (
        manifest.comparison === undefined &&
        readVideoApproach(manifest.approach) === "standard" &&
        renderMediaIdentityHash({
          audio: manifest.audio,
          captions: manifest.captions,
        }) === expectedMediaSha256 &&
        renderImplementationVersionOf(entry.job.payload) ===
          expectedRendererVersion
      );
    });
    if (adopted === undefined) return;
    await executor
      .update(demonstrationVariants)
      .set({
        renderJobId: adopted.render.id,
        status: "ready",
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(demonstrationVariants.comparisonId, comparisonId),
          eq(demonstrationVariants.approach, "standard"),
          eq(demonstrationVariants.status, "pending"),
        ),
      );
  }

  /**
   * Re-resolve the exact baseline before every newly queued attempt.
   *
   * A comparison is immutable, but the project rows used to create it can be
   * edited after its first half completes. Rendering against those newer rows
   * would spend work on a pair that is known not to be controlled. The worker
   * repeats the caption check as defence in depth; this check rejects the work
   * before it reaches the queue.
   */
  private async assertVariantInputsCurrent(
    input: Scope,
    comparison: typeof demonstrationComparisons.$inferSelect,
    variant: typeof demonstrationVariants.$inferSelect,
  ): Promise<void> {
    this.assertCohort(input.ownerUserId);
    const resolved = await this.resolveEligibility(this.database, input, {
      lessonVersionId: comparison.baselineLessonVersionId as Identifier,
    });
    if (
      resolved.binding === undefined ||
      resolved.baseline === undefined ||
      resolved.narration === undefined ||
      resolved.sceneAudioRows === undefined
    )
      throw ineligible(resolved.eligibility.reasons);

    const plan = await this.buildVariantPlan(
      input,
      resolved.binding,
      resolved.lessonSceneIds ?? [],
      resolved.narration,
      resolved.sceneAudioRows,
      resolved.baseline,
    );
    const expectedMediaSha256 = renderMediaIdentityHash({
      audio: plan.scenes.map((scene) => ({
        checksumSha256: scene.audio.checksumSha256,
        contentType: scene.audio.contentType,
        sceneId: scene.sceneId,
        storageKey: scene.audio.storageKey,
      })),
      captions: plan.captions,
    });
    const savedMediaSha256 =
      typeof (
        comparison.mediaIdentity as { standardRenderMediaSha256?: unknown }
      ).standardRenderMediaSha256 === "string"
        ? (comparison.mediaIdentity as { standardRenderMediaSha256: string })
            .standardRenderMediaSha256
        : undefined;
    if (
      expectedMediaSha256 === undefined ||
      savedMediaSha256 !== expectedMediaSha256 ||
      hashJobOptions(this.sceneCorrespondence(plan)) !==
        hashJobOptions(comparison.sceneCorrespondence)
    )
      throw new PublicError(
        "bad_request",
        "This comparison's narration, captions, or scene timing changed. Create a new comparison from the updated lesson.",
        409,
      );
    if (
      variant.approach === "demonstration" &&
      variant.planSha256 !== hashJobOptions(plan)
    )
      throw new PublicError(
        "bad_request",
        "This comparison's validated demonstration plan changed. Create a new comparison from the updated lesson.",
        409,
      );
  }

  private async startVariant(
    input: Scope & {
      approach: VideoApproach;
      comparisonId: Identifier;
      correlationId: Identifier;
      retry: boolean;
    },
  ): Promise<void> {
    const now = this.now();
    const comparison = await this.loadComparison(this.database, input);
    const [variant] = await this.database
      .select()
      .from(demonstrationVariants)
      .where(
        and(
          eq(demonstrationVariants.comparisonId, input.comparisonId),
          eq(demonstrationVariants.approach, input.approach),
          eq(demonstrationVariants.ownerUserId, input.ownerUserId),
          eq(demonstrationVariants.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (variant === undefined) throw notFound();

    // An active or finished variant is reused rather than re-queued. Only an
    // explicit retry of a failed variant starts new work, and it starts work
    // for that variant alone (AC7).
    if (variant.renderJobId !== null && !input.retry) return;
    if (variant.status === "ready" && !input.retry) return;

    // A retry claims the original immutable render job, whose manifest is
    // already the comparison's recorded input. A fresh request builds a new
    // manifest from project rows, so only that path must reject drift before
    // queuing. Both paths still require current cohort membership above.
    if (!(input.retry && variant.renderJobId !== null))
      await this.assertVariantInputsCurrent(input, comparison, variant);

    let render: RenderStatusResponse;
    try {
      render =
        input.retry && variant.renderJobId !== null
          ? await this.renders.retry({
              ownerUserId: input.ownerUserId,
              projectId: input.projectId,
              renderId: variant.renderJobId,
              correlationId: input.correlationId,
            })
          : await this.renders.start({
              ownerUserId: input.ownerUserId,
              projectId: input.projectId,
              body: { lessonVersionId: comparison.baselineLessonVersionId },
              correlationId: input.correlationId,
              variant: {
                approach: input.approach,
                comparisonId: input.comparisonId,
                plan:
                  input.approach === "demonstration"
                    ? demonstrationVariantPlanSchema.parse(variant.plan)
                    : null,
                planSha256: variant.planSha256,
              },
            });
    } catch (error) {
      await this.database
        .update(demonstrationVariants)
        .set({
          status: "failed",
          errorCode: "VARIANT_QUEUE_FAILED",
          errorMessage:
            error instanceof PublicError
              ? error.message
              : "This variant could not be queued. You can try again.",
          updatedAt: now,
        })
        .where(eq(demonstrationVariants.id, variant.id));
      throw error;
    }

    await this.database
      .update(demonstrationVariants)
      .set({
        renderJobId: render.id,
        status: "queued",
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(demonstrationVariants.id, variant.id),
          eq(demonstrationVariants.ownerUserId, input.ownerUserId),
        ),
      );

    await new PostgresAuditWriter(this.database).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: { type: "user", userId: input.ownerUserId },
      eventType: input.retry
        ? "demonstration.variant_retried"
        : "demonstration.variant_requested",
      target: { type: "render_job", id: render.id },
      correlationId: input.correlationId,
      metadata: {
        approach: input.approach,
        comparisonId: input.comparisonId,
        variantId: variant.id,
      },
      occurredAt: now,
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  private async loadComparison(
    executor: DatabaseExecutor,
    input: Scope & { comparisonId: Identifier },
  ): Promise<typeof demonstrationComparisons.$inferSelect> {
    const [row] = await executor
      .select()
      .from(demonstrationComparisons)
      .where(
        and(
          eq(demonstrationComparisons.id, input.comparisonId),
          eq(demonstrationComparisons.ownerUserId, input.ownerUserId),
          eq(demonstrationComparisons.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (row === undefined) throw notFound();
    return row;
  }

  private async loadBaseline(
    executor: DatabaseExecutor,
    input: Scope,
    options: { lessonVersionId?: Identifier },
  ): Promise<typeof lessonVersions.$inferSelect | undefined> {
    const rows = await executor
      .select()
      .from(lessonVersions)
      .where(
        and(
          eq(lessonVersions.ownerUserId, input.ownerUserId),
          eq(lessonVersions.projectId, input.projectId),
          ...(options.lessonVersionId === undefined
            ? []
            : [eq(lessonVersions.id, options.lessonVersionId)]),
        ),
      )
      .orderBy(desc(lessonVersions.versionNumber))
      .limit(1);
    return rows[0];
  }

  private async loadSceneAudio(
    executor: DatabaseExecutor,
    input: Scope,
    baseline: typeof lessonVersions.$inferSelect,
  ): Promise<
    readonly {
      stableSceneId: string;
      audio: typeof sceneAudio.$inferSelect;
    }[]
  > {
    const rows = await executor
      .select({ stableSceneId: scenes.stableSceneId, audio: sceneAudio })
      .from(scenes)
      .innerJoin(sceneAudio, eq(sceneAudio.sceneId, scenes.id))
      .where(
        and(
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
          eq(scenes.lessonSpecId, baseline.lessonSpecId),
          eq(sceneAudio.ownerUserId, input.ownerUserId),
          eq(sceneAudio.projectId, input.projectId),
        ),
      )
      .orderBy(asc(scenes.order), desc(sceneAudio.updatedAt));
    const bySceneId = new Map<
      string,
      { stableSceneId: string; audio: typeof sceneAudio.$inferSelect }
    >();
    for (const row of rows)
      if (!bySceneId.has(row.stableSceneId))
        bySceneId.set(row.stableSceneId, row);
    return [...bySceneId.values()];
  }

  private async view(
    executor: DatabaseExecutor,
    input: Scope,
    comparison: typeof demonstrationComparisons.$inferSelect,
  ): Promise<DemonstrationComparisonView> {
    const [variants, baseline] = await Promise.all([
      executor
        .select()
        .from(demonstrationVariants)
        .where(
          and(
            eq(demonstrationVariants.comparisonId, comparison.id),
            eq(demonstrationVariants.ownerUserId, input.ownerUserId),
            eq(demonstrationVariants.projectId, input.projectId),
          ),
        )
        .orderBy(asc(demonstrationVariants.approach)),
      executor
        .select({
          contentHash: lessonVersions.contentHash,
          versionNumber: lessonVersions.versionNumber,
        })
        .from(lessonVersions)
        .where(eq(lessonVersions.id, comparison.baselineLessonVersionId))
        .limit(1),
    ]);

    const renderIds = variants
      .map((variant) => variant.renderJobId)
      .filter((id): id is string => id !== null);
    const renders =
      renderIds.length === 0
        ? []
        : await executor
            .select({ render: renderJobs, job: jobs, video: renderedVideos })
            .from(renderJobs)
            .innerJoin(jobs, eq(jobs.id, renderJobs.jobId))
            .leftJoin(
              renderedVideos,
              eq(renderedVideos.renderJobId, renderJobs.id),
            )
            .where(inArray(renderJobs.id, renderIds));

    const currentHash = baseline[0]?.contentHash;
    const expectedMediaSha256 =
      typeof (
        comparison.mediaIdentity as { standardRenderMediaSha256?: unknown }
      ).standardRenderMediaSha256 === "string"
        ? (comparison.mediaIdentity as { standardRenderMediaSha256: string })
            .standardRenderMediaSha256
        : undefined;
    const expectedRendererVersion =
      typeof (comparison.mediaIdentity as { rendererVersion?: unknown })
        .rendererVersion === "string"
        ? (comparison.mediaIdentity as { rendererVersion: string })
            .rendererVersion
        : undefined;
    const mediaMismatch = variants.some((variant) => {
      if (variant.renderJobId === null) return false;
      const render = renders.find(
        (candidate) => candidate.render.id === variant.renderJobId,
      );
      return (
        expectedMediaSha256 === undefined ||
        expectedRendererVersion === undefined ||
        render === undefined ||
        renderImplementationVersionOf(render.job.payload) !==
          expectedRendererVersion ||
        renderMediaIdentityHash({
          audio: (render.render.manifest as { audio?: unknown }).audio,
          captions: (render.render.manifest as { captions?: unknown }).captions,
        }) !== expectedMediaSha256
      );
    });
    // The pair stays viewable when its baseline moves on — it is historical
    // evidence — but it stops being presentable as a controlled comparison,
    // and the reason says which way it drifted.
    const controlled =
      currentHash === comparison.baselineContentHash && !mediaMismatch;

    return demonstrationComparisonViewSchema.parse({
      baselineContentHash: comparison.baselineContentHash,
      baselineLessonVersionId: comparison.baselineLessonVersionId,
      baselineVersionNumber: baseline[0]?.versionNumber ?? 1,
      controlled,
      createdAt: serializeUtcTimestamp(comparison.createdAt),
      durationInFrames: comparison.durationInFrames,
      experimentVersion: comparison.experimentVersion,
      id: comparison.id,
      projectId: comparison.projectId,
      scenes: comparison.sceneCorrespondence,
      themeId: comparison.themeId,
      uncontrolledReason: controlled
        ? null
        : currentHash !== comparison.baselineContentHash
          ? "The lesson has changed since this pair was produced. Both videos remain available as a record of that version, but they are no longer a like-for-like comparison of the current lesson."
          : "The rendered media no longer matches the audio and captions recorded for this comparison. The outputs remain available as a record, but are not presented as a controlled pair.",
      variants: variants.map((variant) => {
        const entry = renders.find(
          (candidate) => candidate.render.id === variant.renderJobId,
        );
        const status =
          entry !== undefined &&
          (expectedMediaSha256 === undefined ||
            expectedRendererVersion === undefined ||
            renderImplementationVersionOf(entry.job.payload) !==
              expectedRendererVersion ||
            renderMediaIdentityHash({
              audio: (entry.render.manifest as { audio?: unknown }).audio,
              captions: (entry.render.manifest as { captions?: unknown })
                .captions,
            }) !== expectedMediaSha256)
            ? "stale"
            : variantStatus(variant, entry?.job.state);
        return {
          approach: variant.approach,
          createdAt: serializeUtcTimestamp(variant.createdAt),
          durationMs: entry?.video?.durationMs ?? null,
          errorCode: variant.errorCode ?? entry?.render.errorCode ?? null,
          errorMessage:
            variant.errorMessage ?? entry?.render.errorMessage ?? null,
          id: variant.id,
          identitySha256: variant.identitySha256,
          progress: entry?.render.progress ?? 0,
          recipes: recipesOf(variant.plan),
          renderId: variant.renderJobId,
          status,
          updatedAt: serializeUtcTimestamp(variant.updatedAt),
          videoAvailable: entry?.video != null,
        };
      }),
    });
  }
}

function variantStatus(
  variant: typeof demonstrationVariants.$inferSelect,
  jobState: (typeof jobs.$inferSelect)["state"] | undefined,
): string {
  if (variant.renderJobId === null)
    return variant.status === "failed" ? "failed" : "pending";
  if (jobState === "succeeded") return "ready";
  if (jobState === "failed") return "failed";
  if (jobState === "cancelled") return "failed";
  if (jobState === "running") return "generating";
  return "queued";
}

function recipesOf(plan: unknown): unknown[] {
  const parsed = demonstrationVariantPlanSchema.safeParse(plan);
  if (!parsed.success) return [];
  return parsed.data.scenes.map((scene) => ({
    recipeId: scene.recipeId,
    recipeVersion: scene.recipeVersion,
    sceneId: scene.sceneId,
  }));
}

function renderImplementationVersionOf(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as { rendererVersion?: unknown }).rendererVersion;
  return typeof value === "string" ? value : undefined;
}

/**
 * The registered beats and provenance for one narration track.
 *
 * Kept as free functions so the class does not reach into the scene library's
 * generated narration module in more than one place. The caller has already
 * proved, by checksum, that the project's audio *is* this recording.
 */
function registeredBeats(trackId: string): unknown {
  return registeredTrack(trackId).beats.map((beat) => ({ ...beat }));
}

function registeredProvenance(trackId: string): unknown {
  return registeredTrack(trackId).timingProvenance;
}

let trackLoader:
  | ((trackId: string) => {
      beats: readonly {
        beatId: string;
        startMs: number;
        endMs: number;
        text: string;
      }[];
      timingProvenance: unknown;
    })
  | undefined;

function registeredTrack(trackId: string): {
  beats: readonly {
    beatId: string;
    startMs: number;
    endMs: number;
    text: string;
  }[];
  timingProvenance: unknown;
} {
  if (trackLoader === undefined)
    throw new Error(
      "The demonstration narration registry was not installed. Call installDemonstrationNarrationRegistry during API startup.",
    );
  return trackLoader(trackId);
}

/**
 * Installs the generated narration registry.
 *
 * It is injected rather than imported at module scope because the generated
 * module carries fifteen megabytes of base64 audio, and an API process that
 * never touches the pilot should never pay for it. `runtime.ts` installs it
 * when the pilot is configured.
 */
export function installDemonstrationNarrationRegistry(
  loader: (trackId: string) => {
    beats: readonly {
      beatId: string;
      startMs: number;
      endMs: number;
      text: string;
    }[];
    timingProvenance: unknown;
  },
): void {
  trackLoader = loader;
}
