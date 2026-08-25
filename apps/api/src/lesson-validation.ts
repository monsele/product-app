import { createHash } from "node:crypto";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  captionCues,
  captionTracks,
  extractedFigures,
  groundingChecks,
  learningObjectives,
  lessonSpecs,
  narrationBlocks,
  outlineObjectiveLinks,
  parsedDocuments,
  projectAssets,
  sceneAudio,
  scenes,
  sourceSnapshots,
  validationIssues,
  validationRuns,
  type DatabaseClient,
} from "@avlp/database";
import { validateScene } from "@avlp/scene-library";
import {
  lessonStoryboardSchema,
  sourceSnapshotSchema,
  lessonValidationRulesetVersion,
  lessonValidationRunInputSchema,
  lessonValidationRunSchema,
  validationIssueSchema,
  type LessonStoryboard,
  type LessonValidationRun,
  type SourceSnapshot,
  type ValidationIssue,
  type ValidationIssueCode,
  type ValidationScopeType,
  type ValidationSeverity,
} from "@avlp/schemas";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { approvedAssetById } from "./approved-assets.js";
import { resolveSourceRefsAgainstSnapshot } from "./source-snapshot.js";

const sceneLibraryVersion = "mvp-v1";
const durationToleranceMs = 1_500;

type IssueDraft = Readonly<{
  severity: ValidationSeverity;
  code: ValidationIssueCode;
  scopeType: ValidationScopeType;
  scopeId: Identifier | null;
  sceneId: Identifier | null;
  fieldPath: string;
  message: string;
  details: Record<string, unknown>;
  acknowledgeable: boolean;
}>;

type SceneMedia = Readonly<{
  audio: {
    contentHash: string | null;
    durationMs: number | null;
    fitWarning: string | null;
    status: "queued" | "generating" | "ready" | "stale" | "failed" | null;
  } | null;
  captions: {
    contentHash: string;
    cues: readonly { endMs: number; startMs: number }[];
    status: "queued" | "generating" | "ready" | "stale" | "failed";
  } | null;
}>;

type ValidationInput = Readonly<{
  storyboard: LessonStoryboard;
  artifactHashes: Record<string, string>;
  coveredObjectiveIds: ReadonlySet<string>;
  knownObjectiveIds: ReadonlySet<string>;
  narrationDurationSecondsByBlockId: ReadonlyMap<string, number>;
  resolvedAssetIds: ReadonlySet<string>;
  citationIssueCountsByStableSceneId: ReadonlyMap<string, readonly number[]>;
  mediaByStableSceneId: ReadonlyMap<string, SceneMedia>;
  grounding: Readonly<{
    exact: boolean;
    hasUnsupportedClaims: boolean;
    hasUnlabelledGeneratedAdditions: boolean;
    needsReview: boolean;
  }>;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  return value;
}

function hashValidationArtifact(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function groundingState(
  check:
    | {
        claims: unknown;
        results: unknown;
        summary: unknown;
      }
    | undefined,
): ValidationInput["grounding"] {
  if (check === undefined)
    return {
      exact: false,
      hasUnsupportedClaims: false,
      hasUnlabelledGeneratedAdditions: false,
      needsReview: false,
    };
  if (
    !Array.isArray(check.claims) ||
    !Array.isArray(check.results) ||
    !isRecord(check.summary) ||
    typeof check.summary.unsupported !== "number" ||
    typeof check.summary.needsReview !== "number"
  )
    return {
      exact: false,
      hasUnsupportedClaims: true,
      hasUnlabelledGeneratedAdditions: false,
      needsReview: false,
    };
  return {
    exact: true,
    hasUnsupportedClaims:
      check.summary.unsupported > 0 ||
      check.results.some(
        (result) => isRecord(result) && result.status === "unsupported",
      ),
    hasUnlabelledGeneratedAdditions: check.claims.some(
      (claim) =>
        !isRecord(claim) ||
        !Array.isArray(claim.sourceRefs) ||
        (claim.sourceRefs.length === 0 &&
          claim.generatedAddition === undefined),
    ),
    needsReview:
      check.summary.needsReview > 0 ||
      check.results.some(
        (result) => isRecord(result) && result.status === "needs_review",
      ),
  };
}

export function validationInputHash(input: {
  artifactHashes: Record<string, string>;
  lessonSpecContentHash: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonicalize({
          artifactHashes: input.artifactHashes,
          lessonSpecContentHash: input.lessonSpecContentHash,
          rulesetVersion: lessonValidationRulesetVersion,
          sceneLibraryVersion,
        }),
      ),
    )
    .digest("hex");
}

/** A validation run may authorize rendering only for its exact assembled input. */
export function isValidationRunStale(
  runInputHash: string,
  currentInputHash: string,
): boolean {
  return runInputHash !== currentInputHash;
}

export const validationRuleDependencies = Object.freeze({
  assets: ["asset_required", "asset_unresolved"],
  audio: ["audio_missing", "audio_not_ready", "audio_duration_mismatch"],
  captions: [
    "captions_missing",
    "captions_not_ready",
    "caption_timing_invalid",
  ],
  grounding: [
    "grounding_missing",
    "grounding_recheck_required",
    "generated_addition_unlabelled",
  ],
  lesson: [
    "lesson_duration_mismatch",
    "objective_uncovered",
    "objective_unknown",
  ],
  scene: [
    "unsupported_template",
    "invalid_scene",
    "text_overflow",
    "diagram_collision",
    "scene_duration_out_of_range",
    "narration_duration_mismatch",
  ],
} as const satisfies Record<string, readonly ValidationIssueCode[]>);

/** Maps an edit to the smallest deterministic rule family that must rerun. */
export function affectedValidationRules(
  changed: readonly (keyof typeof validationRuleDependencies)[],
): readonly ValidationIssueCode[] {
  return [
    ...new Set(
      changed.flatMap((dependency) => validationRuleDependencies[dependency]),
    ),
  ];
}

function issue(
  code: ValidationIssueCode,
  options: Omit<IssueDraft, "code" | "acknowledgeable"> & {
    acknowledgeable?: boolean;
  },
): IssueDraft {
  return {
    ...options,
    code,
    acknowledgeable: options.acknowledgeable ?? false,
  };
}

/** Removes persistence-only fields before the strict public issue contract. */
export function validationIssueResponse(input: {
  id: string;
  severity: string;
  code: string;
  scopeType: string;
  scopeId: string | null;
  sceneId: string | null;
  fieldPath: string;
  message: string;
  details: unknown;
  acknowledgeable: boolean;
  acknowledgedAt: Date | null;
}): ValidationIssue {
  return validationIssueSchema.parse({
    id: input.id,
    severity: input.severity,
    code: input.code,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    sceneId: input.sceneId,
    fieldPath: input.fieldPath,
    message: input.message,
    details: input.details,
    acknowledgeable: input.acknowledgeable,
    acknowledgedAt:
      input.acknowledgedAt === null
        ? null
        : serializeUtcTimestamp(input.acknowledgedAt),
  });
}

/** Pure, versioned rules. It never calls providers or uses current time. */
export function evaluateLessonValidation(
  input: ValidationInput,
): readonly IssueDraft[] {
  const issues: IssueDraft[] = [];
  const total = input.storyboard.scenes.reduce(
    (sum, storyboardScene) => sum + storyboardScene.durationSeconds,
    0,
  );
  if (total !== input.storyboard.targetDurationSeconds)
    issues.push(
      issue("lesson_duration_mismatch", {
        severity: "error",
        scopeType: "lesson",
        scopeId: null,
        sceneId: null,
        fieldPath: "targetDurationSeconds",
        message: "Scene durations must equal the configured lesson duration.",
        details: {
          actualSeconds: total,
          expectedSeconds: input.storyboard.targetDurationSeconds,
        },
      }),
    );
  for (const objectiveId of input.storyboard.objectiveIds) {
    if (!input.knownObjectiveIds.has(objectiveId))
      issues.push(
        issue("objective_unknown", {
          severity: "error",
          scopeType: "objective",
          scopeId: objectiveId as Identifier,
          sceneId: null,
          fieldPath: "objectiveIds",
          message: "This storyboard objective is not available in the project.",
          details: {},
        }),
      );
    else if (!input.coveredObjectiveIds.has(objectiveId))
      issues.push(
        issue("objective_uncovered", {
          severity: "error",
          scopeType: "objective",
          scopeId: objectiveId as Identifier,
          sceneId: null,
          fieldPath: "objectiveIds",
          message: "This objective is not covered by any scene narration.",
          details: {},
        }),
      );
  }
  for (const [
    sceneIndex,
    storyboardScene,
  ] of input.storyboard.scenes.entries()) {
    const scene = storyboardScene.scene;
    const sceneId = storyboardScene.stableSceneId as Identifier;
    const basePath = `scenes.${sceneIndex}.scene`;
    for (const libraryIssue of validateScene(scene))
      issues.push(
        issue(
          libraryIssue.code === "missing_asset"
            ? "asset_required"
            : libraryIssue.code,
          {
            severity: libraryIssue.severity,
            scopeType:
              libraryIssue.code === "missing_asset" ? "asset" : "scene",
            scopeId: sceneId,
            sceneId,
            fieldPath: `${basePath}.${libraryIssue.fieldPath}`,
            message: libraryIssue.message,
            details: { suggestedCorrection: libraryIssue.suggestedCorrection },
          },
        ),
      );
    if (scene.durationSeconds !== storyboardScene.durationSeconds)
      issues.push(
        issue("scene_duration_out_of_range", {
          severity: "error",
          scopeType: "scene",
          scopeId: sceneId,
          sceneId,
          fieldPath: `${basePath}.durationSeconds`,
          message: "The scene duration must match its storyboard allocation.",
          details: {
            sceneDurationSeconds: scene.durationSeconds,
            storyboardDurationSeconds: storyboardScene.durationSeconds,
          },
        }),
      );
    const narrationDurations = storyboardScene.narrationBlockIds.map(
      (blockId) => input.narrationDurationSecondsByBlockId.get(blockId),
    );
    const plannedNarrationSeconds = narrationDurations.reduce<number>(
      (total, duration) => total + (duration ?? 0),
      0,
    );
    if (
      narrationDurations.length === 0 ||
      narrationDurations.some((duration) => duration === undefined) ||
      Math.abs(plannedNarrationSeconds - scene.durationSeconds) > 1
    )
      issues.push(
        issue("narration_duration_mismatch", {
          severity: "error",
          scopeType: "scene",
          scopeId: sceneId,
          sceneId,
          fieldPath: `scenes.${sceneIndex}.narrationBlockIds`,
          message:
            "Narration timing must match the planned scene duration before rendering.",
          details: {
            narrationSeconds: plannedNarrationSeconds,
            sceneDurationSeconds: scene.durationSeconds,
          },
        }),
      );
    for (const requirement of storyboardScene.assetRequirements) {
      const binding = scene.assetBindings.find(
        (item) => item.slot === requirement.slot,
      );
      if (binding === undefined)
        issues.push(
          issue("asset_required", {
            severity: "error",
            scopeType: "asset",
            scopeId: null,
            sceneId,
            fieldPath: `scenes.${sceneIndex}.assetRequirements.${requirement.slot}`,
            message: "A required storyboard asset has not been bound.",
            details: { slot: requirement.slot },
          }),
        );
    }
    for (const [bindingIndex, binding] of scene.assetBindings.entries())
      if (!input.resolvedAssetIds.has(binding.assetId))
        issues.push(
          issue("asset_unresolved", {
            severity: "error",
            scopeType: "asset",
            scopeId: null,
            sceneId,
            fieldPath: `${basePath}.assetBindings.${bindingIndex}.assetId`,
            message:
              "This asset is unavailable to the project or no longer active.",
            details: {},
          }),
        );
    if (scene.sourceRefs.length === 0)
      issues.push(
        issue("grounding_missing", {
          severity: "error",
          scopeType: "grounding",
          scopeId: sceneId,
          sceneId,
          fieldPath: `${basePath}.sourceRefs`,
          message: "Every scene must cite at least one approved source block.",
          details: {},
        }),
      );
    for (const [referenceIndex, citationIssueCount] of (
      input.citationIssueCountsByStableSceneId.get(sceneId) ?? []
    ).entries())
      if (citationIssueCount > 0)
        issues.push(
          issue("grounding_missing", {
            severity: "error",
            scopeType: "grounding",
            scopeId: sceneId,
            sceneId,
            fieldPath: `${basePath}.sourceRefs.${referenceIndex}.blockIds`,
            message:
              "A scene citation does not resolve against the approved source snapshot.",
            details: { citationIssueCount },
          }),
        );
    if (!input.grounding.exact)
      issues.push(
        issue("grounding_recheck_required", {
          severity: "warning",
          scopeType: "grounding",
          scopeId: sceneId,
          sceneId,
          fieldPath: `${basePath}.sourceRefs`,
          message:
            "Grounding has not been rechecked for this exact lesson revision.",
          details: {},
          acknowledgeable: true,
        }),
      );
    const media = input.mediaByStableSceneId.get(sceneId);
    if (media?.audio === null || media === undefined)
      issues.push(
        issue("audio_missing", {
          severity: "error",
          scopeType: "audio",
          scopeId: sceneId,
          sceneId,
          fieldPath: `scenes.${sceneIndex}.audio`,
          message: "A ready audio track is required for every scene.",
          details: {},
        }),
      );
    else {
      if (media.audio.status !== "ready")
        issues.push(
          issue("audio_not_ready", {
            severity: "error",
            scopeType: "audio",
            scopeId: sceneId,
            sceneId,
            fieldPath: `scenes.${sceneIndex}.audio.status`,
            message: "Scene audio is not ready for rendering.",
            details: { status: media.audio.status },
          }),
        );
      if (
        media.audio.fitWarning !== null ||
        media.audio.durationMs === null ||
        Math.abs(media.audio.durationMs - scene.durationSeconds * 1000) >
          durationToleranceMs
      )
        issues.push(
          issue("audio_duration_mismatch", {
            severity: "error",
            scopeType: "audio",
            scopeId: sceneId,
            sceneId,
            fieldPath: `scenes.${sceneIndex}.audio.durationMs`,
            message: "Scene audio does not fit the planned scene duration.",
            details: {
              audioDurationMs: media.audio.durationMs,
              plannedDurationMs: scene.durationSeconds * 1000,
            },
          }),
        );
    }
    if (media?.captions === null || media === undefined)
      issues.push(
        issue("captions_missing", {
          severity: "error",
          scopeType: "captions",
          scopeId: sceneId,
          sceneId,
          fieldPath: `scenes.${sceneIndex}.captions`,
          message: "Captions are required for every scene.",
          details: {},
        }),
      );
    else {
      if (media.captions.status !== "ready")
        issues.push(
          issue("captions_not_ready", {
            severity: "error",
            scopeType: "captions",
            scopeId: sceneId,
            sceneId,
            fieldPath: `scenes.${sceneIndex}.captions.status`,
            message: "Scene captions are not ready for rendering.",
            details: { status: media.captions.status },
          }),
        );
      let priorEnd = 0;
      const hasInvalidCaptionTiming = media.captions.cues.some((cue) => {
        const invalid =
          cue.startMs < priorEnd || cue.startMs < 0 || cue.endMs <= cue.startMs;
        priorEnd = Math.max(priorEnd, cue.endMs);
        return invalid;
      });
      if (
        media.captions.cues.length === 0 ||
        hasInvalidCaptionTiming ||
        priorEnd > scene.durationSeconds * 1000 + durationToleranceMs
      )
        issues.push(
          issue("caption_timing_invalid", {
            severity: "error",
            scopeType: "captions",
            scopeId: sceneId,
            sceneId,
            fieldPath: `scenes.${sceneIndex}.captions.cues`,
            message: "Caption cues must be ordered within the scene duration.",
            details: {},
          }),
        );
    }
  }
  if (input.grounding.hasUnsupportedClaims)
    issues.push(
      issue("grounding_missing", {
        severity: "error",
        scopeType: "grounding",
        scopeId: null,
        sceneId: null,
        fieldPath: "grounding.results",
        message:
          "Grounding found unsupported claims that must be corrected before rendering.",
        details: {},
      }),
    );
  if (input.grounding.hasUnlabelledGeneratedAdditions)
    issues.push(
      issue("generated_addition_unlabelled", {
        severity: "error",
        scopeType: "grounding",
        scopeId: null,
        sceneId: null,
        fieldPath: "grounding.claims",
        message: "A generated addition must be labelled before rendering.",
        details: {},
      }),
    );
  if (input.grounding.needsReview)
    issues.push(
      issue("grounding_recheck_required", {
        severity: "warning",
        scopeType: "grounding",
        scopeId: null,
        sceneId: null,
        fieldPath: "grounding.results",
        message: "Grounding requires teacher review before rendering.",
        details: {},
        acknowledgeable: true,
      }),
    );
  return issues;
}

export interface LessonValidationService {
  run(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
  }): Promise<LessonValidationRun>;
  latest(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<LessonValidationRun | null>;
}

function parseRunBoundary(input: unknown): void {
  const parsed = lessonValidationRunInputSchema.safeParse(input);
  if (parsed.success) return;
  throw new PublicError(
    "validation_failed",
    "The validation request body is invalid.",
    400,
    false,
    Object.fromEntries(
      parsed.error.issues.map((entry) => [
        entry.path.join(".") || "root",
        entry.message,
      ]),
    ),
  );
}

export class PostgresLessonValidationService implements LessonValidationService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async run(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
  }): Promise<LessonValidationRun> {
    parseRunBoundary(input.body);
    const assembled = await this.assemble(input);
    if (assembled === null)
      throw new Error("A storyboard is required to validate a lesson.");
    const inputHash = validationInputHash({
      artifactHashes: assembled.artifactHashes,
      lessonSpecContentHash: assembled.spec.contentHash,
    });
    const [cached] = await this.database
      .select()
      .from(validationRuns)
      .where(
        and(
          eq(validationRuns.ownerUserId, input.ownerUserId),
          eq(validationRuns.projectId, input.projectId),
          eq(validationRuns.inputHash, inputHash),
        ),
      )
      .limit(1);
    if (cached !== undefined) return this.readRun(cached, false);
    const startedAt = this.now();
    const drafts = evaluateLessonValidation(assembled.input);
    const runId = createId(startedAt);
    const completedAt = this.now();
    const [created] = await this.database.transaction(async (tx) => {
      const inserted = await tx
        .insert(validationRuns)
        .values({
          id: runId,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          lessonSpecId: assembled.spec.id,
          lessonSpecRevision: assembled.spec.revision,
          lessonSpecContentHash: assembled.spec.contentHash,
          inputHash,
          rulesetVersion: lessonValidationRulesetVersion,
          sceneLibraryVersion,
          artifactHashes: assembled.artifactHashes,
          status: drafts.some((item) => item.severity === "error")
            ? "failed"
            : "passed",
          startedAt,
          completedAt,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted !== undefined)
        await tx.insert(validationIssues).values(
          drafts.map((draft) => ({
            id: createId(completedAt),
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            runId,
            ...draft,
            scopeId: draft.scopeId,
            sceneId: draft.sceneId,
            acknowledgedAt: null,
            acknowledgedBy: null,
            createdAt: completedAt,
          })),
        );
      return inserted;
    });
    if (created === undefined) {
      const [concurrent] = await this.database
        .select()
        .from(validationRuns)
        .where(
          and(
            eq(validationRuns.ownerUserId, input.ownerUserId),
            eq(validationRuns.projectId, input.projectId),
            eq(validationRuns.inputHash, inputHash),
          ),
        )
        .limit(1);
      if (concurrent === undefined)
        throw new Error("Validation run could not be persisted.");
      return this.readRun(concurrent, false);
    }
    return this.readRun(created, false);
  }

  public async latest(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<LessonValidationRun | null> {
    const assembled = await this.assemble(input, true);
    if (assembled === null) return null;
    const [latest] = await this.database
      .select()
      .from(validationRuns)
      .where(
        and(
          eq(validationRuns.ownerUserId, input.ownerUserId),
          eq(validationRuns.projectId, input.projectId),
        ),
      )
      .orderBy(desc(validationRuns.completedAt))
      .limit(1);
    if (latest === undefined) return null;
    const currentHash = validationInputHash({
      artifactHashes: assembled.artifactHashes,
      lessonSpecContentHash: assembled.spec.contentHash,
    });
    return this.readRun(
      latest,
      isValidationRunStale(latest.inputHash, currentHash),
    );
  }

  private async readRun(
    row: typeof validationRuns.$inferSelect,
    stale: boolean,
  ): Promise<LessonValidationRun> {
    const rows = await this.database
      .select()
      .from(validationIssues)
      .where(
        and(
          eq(validationIssues.ownerUserId, row.ownerUserId),
          eq(validationIssues.projectId, row.projectId),
          eq(validationIssues.runId, row.id),
        ),
      )
      .orderBy(asc(validationIssues.createdAt), asc(validationIssues.id));
    return lessonValidationRunSchema.parse({
      id: row.id,
      lessonSpecId: row.lessonSpecId,
      lessonSpecRevision: row.lessonSpecRevision,
      lessonSpecContentHash: row.lessonSpecContentHash,
      inputHash: row.inputHash,
      rulesetVersion: row.rulesetVersion,
      sceneLibraryVersion: row.sceneLibraryVersion,
      artifactHashes: row.artifactHashes,
      status: row.status,
      stale,
      startedAt: serializeUtcTimestamp(row.startedAt),
      completedAt: serializeUtcTimestamp(row.completedAt),
      issues: rows.map((entry) => validationIssueResponse(entry)),
    });
  }

  private async assemble(
    input: { ownerUserId: Identifier; projectId: Identifier },
    allowMissing = false,
  ): Promise<{
    spec: typeof lessonSpecs.$inferSelect;
    artifactHashes: Record<string, string>;
    input: ValidationInput;
  } | null> {
    const findSpec = async (status: "draft" | "approved") =>
      (
        await this.database
          .select()
          .from(lessonSpecs)
          .where(
            and(
              eq(lessonSpecs.ownerUserId, input.ownerUserId),
              eq(lessonSpecs.projectId, input.projectId),
              eq(lessonSpecs.status, status),
            ),
          )
          .orderBy(desc(lessonSpecs.generatedAt))
          .limit(1)
      )[0];
    const spec = (await findSpec("draft")) ?? (await findSpec("approved"));
    if (spec === undefined) {
      if (allowMissing) return null;
      throw new PublicError(
        "not_found",
        "No current storyboard is available for validation.",
        404,
      );
    }
    const storyboard = lessonStoryboardSchema.parse(spec.payload);
    const sceneRows = await this.database
      .select()
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
          eq(scenes.lessonSpecId, spec.id),
        ),
      );
    const sceneRowByStableId = new Map(
      sceneRows.map((row) => [row.stableSceneId, row]),
    );
    const sceneIds = sceneRows.map((row) => row.id);
    const audioRows =
      sceneIds.length === 0
        ? []
        : await this.database
            .select()
            .from(sceneAudio)
            .where(
              and(
                eq(sceneAudio.ownerUserId, input.ownerUserId),
                eq(sceneAudio.projectId, input.projectId),
                inArray(sceneAudio.sceneId, sceneIds),
              ),
            )
            .orderBy(desc(sceneAudio.updatedAt));
    const latestAudioBySceneId = new Map<
      string,
      typeof sceneAudio.$inferSelect
    >();
    for (const audio of audioRows)
      if (!latestAudioBySceneId.has(audio.sceneId))
        latestAudioBySceneId.set(audio.sceneId, audio);
    const audioIds = [...latestAudioBySceneId.values()].map((row) => row.id);
    const trackRows =
      audioIds.length === 0
        ? []
        : await this.database
            .select()
            .from(captionTracks)
            .where(
              and(
                eq(captionTracks.ownerUserId, input.ownerUserId),
                eq(captionTracks.projectId, input.projectId),
                inArray(captionTracks.sceneAudioId, audioIds),
              ),
            )
            .orderBy(desc(captionTracks.updatedAt));
    const latestTrackByAudioId = new Map<
      string,
      typeof captionTracks.$inferSelect
    >();
    for (const track of trackRows)
      if (!latestTrackByAudioId.has(track.sceneAudioId))
        latestTrackByAudioId.set(track.sceneAudioId, track);
    const trackIds = [...latestTrackByAudioId.values()].map((row) => row.id);
    const cueRows =
      trackIds.length === 0
        ? []
        : await this.database
            .select()
            .from(captionCues)
            .where(
              and(
                eq(captionCues.ownerUserId, input.ownerUserId),
                eq(captionCues.projectId, input.projectId),
                inArray(captionCues.trackId, trackIds),
              ),
            )
            .orderBy(asc(captionCues.position));
    const cuesByTrack = new Map<
      string,
      Array<{ startMs: number; endMs: number }>
    >();
    for (const cue of cueRows)
      cuesByTrack.set(cue.trackId, [
        ...(cuesByTrack.get(cue.trackId) ?? []),
        { startMs: cue.startMs, endMs: cue.endMs },
      ]);
    const mediaByStableSceneId = new Map<string, SceneMedia>();
    for (const storyboardScene of storyboard.scenes) {
      const sceneRow = sceneRowByStableId.get(storyboardScene.stableSceneId);
      const audio =
        sceneRow === undefined
          ? undefined
          : latestAudioBySceneId.get(sceneRow.id);
      const track =
        audio === undefined ? undefined : latestTrackByAudioId.get(audio.id);
      mediaByStableSceneId.set(storyboardScene.stableSceneId, {
        audio:
          audio === undefined
            ? null
            : {
                status: audio.status,
                contentHash: audio.contentHash,
                durationMs: audio.durationMs,
                fitWarning: audio.fitWarning,
              },
        captions:
          track === undefined
            ? null
            : {
                status: track.status,
                contentHash: track.contentHash,
                cues: cuesByTrack.get(track.id) ?? [],
              },
      });
    }
    const assetIds = [
      ...new Set(
        storyboard.scenes.flatMap((scene) =>
          scene.scene.assetBindings.map((binding) => binding.assetId),
        ),
      ),
    ];
    const [projectAssetRows, sourceFigureRows] = await Promise.all([
      assetIds.length === 0
        ? []
        : this.database
            .select({ id: projectAssets.id })
            .from(projectAssets)
            .where(
              and(
                eq(projectAssets.ownerUserId, input.ownerUserId),
                eq(projectAssets.projectId, input.projectId),
                eq(projectAssets.status, "active"),
                isNull(projectAssets.deletedAt),
                inArray(projectAssets.id, assetIds),
              ),
            ),
      assetIds.length === 0
        ? []
        : this.database
            .select({ id: extractedFigures.id })
            .from(extractedFigures)
            .innerJoin(
              parsedDocuments,
              eq(extractedFigures.parsedDocumentId, parsedDocuments.id),
            )
            .where(
              and(
                eq(parsedDocuments.ownerUserId, input.ownerUserId),
                eq(parsedDocuments.projectId, input.projectId),
                inArray(extractedFigures.id, assetIds),
              ),
            ),
    ]);
    const resolvedAssetIds = new Set([
      ...assetIds.filter((assetId) => approvedAssetById(assetId) !== undefined),
      ...projectAssetRows.map((row) => row.id),
      ...sourceFigureRows.map((row) => row.id),
    ]);
    const narrationRows = await this.database
      .select({
        id: narrationBlocks.id,
        outlineItemId: narrationBlocks.outlineItemId,
        targetSeconds: narrationBlocks.targetSeconds,
      })
      .from(narrationBlocks)
      .where(
        and(
          eq(narrationBlocks.ownerUserId, input.ownerUserId),
          eq(narrationBlocks.projectId, input.projectId),
          eq(narrationBlocks.setId, spec.basedOnNarrationSetId),
        ),
      );
    const outlineItemIds = narrationRows.map((row) => row.outlineItemId);
    const objectiveLinks =
      outlineItemIds.length === 0
        ? []
        : await this.database
            .select({
              outlineItemId: outlineObjectiveLinks.outlineItemId,
              objectiveId: outlineObjectiveLinks.objectiveId,
            })
            .from(outlineObjectiveLinks)
            .where(
              and(
                eq(outlineObjectiveLinks.ownerUserId, input.ownerUserId),
                eq(outlineObjectiveLinks.projectId, input.projectId),
                inArray(outlineObjectiveLinks.outlineItemId, outlineItemIds),
              ),
            );
    const objectiveIdsByBlock = new Map(
      narrationRows.map((row) => [
        row.id,
        objectiveLinks
          .filter((link) => link.outlineItemId === row.outlineItemId)
          .map((link) => link.objectiveId),
      ]),
    );
    const coveredObjectiveIds = new Set(
      storyboard.scenes.flatMap((scene) =>
        scene.narrationBlockIds.flatMap(
          (blockId) => objectiveIdsByBlock.get(blockId) ?? [],
        ),
      ),
    );
    const objectiveRows = await this.database
      .select({ id: learningObjectives.id })
      .from(learningObjectives)
      .where(
        and(
          eq(learningObjectives.ownerUserId, input.ownerUserId),
          eq(learningObjectives.projectId, input.projectId),
          inArray(learningObjectives.id, storyboard.objectiveIds),
        ),
      );
    const [currentSnapshot] = await this.database
      .select({
        contentHash: sourceSnapshots.contentHash,
        id: sourceSnapshots.id,
        payload: sourceSnapshots.payload,
      })
      .from(sourceSnapshots)
      .where(
        and(
          eq(sourceSnapshots.ownerUserId, input.ownerUserId),
          eq(sourceSnapshots.projectId, input.projectId),
        ),
      )
      .orderBy(desc(sourceSnapshots.snapshotVersion))
      .limit(1);
    const parsedSnapshot =
      currentSnapshot === undefined
        ? undefined
        : sourceSnapshotSchema.safeParse(currentSnapshot.payload);
    const sourceSnapshot: SourceSnapshot | undefined = parsedSnapshot?.success
      ? parsedSnapshot.data
      : undefined;
    const citationIssueCountsByStableSceneId = new Map<
      string,
      readonly number[]
    >(
      storyboard.scenes.map((storyboardScene) => [
        storyboardScene.stableSceneId,
        sourceSnapshot === undefined
          ? storyboardScene.scene.sourceRefs.map(() => 1)
          : resolveSourceRefsAgainstSnapshot(
              sourceSnapshot,
              storyboardScene.scene.sourceRefs,
            ).map((citation) => citation.issues.length),
      ]),
    );
    const [exactGrounding] =
      currentSnapshot === undefined
        ? []
        : await this.database
            .select({
              id: groundingChecks.id,
              claims: groundingChecks.claims,
              results: groundingChecks.results,
              summary: groundingChecks.summary,
            })
            .from(groundingChecks)
            .where(
              and(
                eq(groundingChecks.ownerUserId, input.ownerUserId),
                eq(groundingChecks.projectId, input.projectId),
                eq(groundingChecks.lessonSpecId, spec.id),
                eq(groundingChecks.lessonSpecRevision, spec.revision),
                eq(groundingChecks.lessonSpecContentHash, spec.contentHash),
                eq(groundingChecks.sourceSnapshotId, currentSnapshot.id),
                eq(
                  groundingChecks.sourceSnapshotContentHash,
                  currentSnapshot.contentHash,
                ),
              ),
            )
            .limit(1);
    const artifactHashes = Object.fromEntries(
      storyboard.scenes.map((scene) => {
        const media = mediaByStableSceneId.get(scene.stableSceneId);
        return [scene.stableSceneId, hashValidationArtifact(media ?? null)];
      }),
    );
    artifactHashes.assets = hashValidationArtifact({
      requested: assetIds.sort(),
      resolved: [...resolvedAssetIds].sort(),
    });
    artifactHashes.objectives = hashValidationArtifact({
      known: objectiveRows.map((row) => row.id).sort(),
      covered: [...coveredObjectiveIds].sort(),
    });
    artifactHashes.narration = hashValidationArtifact(
      narrationRows
        .map((row) => ({ id: row.id, targetSeconds: row.targetSeconds }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
    artifactHashes.citations = hashValidationArtifact({
      sourceSnapshotContentHash: currentSnapshot?.contentHash ?? null,
      issues: [...citationIssueCountsByStableSceneId.entries()],
    });
    artifactHashes.grounding = hashValidationArtifact({
      id: exactGrounding?.id ?? null,
      claims: exactGrounding?.claims ?? null,
      results: exactGrounding?.results ?? null,
      summary: exactGrounding?.summary ?? null,
    });
    return {
      spec,
      artifactHashes,
      input: {
        storyboard,
        artifactHashes,
        knownObjectiveIds: new Set(objectiveRows.map((row) => row.id)),
        coveredObjectiveIds,
        narrationDurationSecondsByBlockId: new Map(
          narrationRows.map((row) => [row.id, row.targetSeconds]),
        ),
        resolvedAssetIds,
        citationIssueCountsByStableSceneId,
        mediaByStableSceneId,
        grounding: groundingState(exactGrounding),
      },
    };
  }
}
