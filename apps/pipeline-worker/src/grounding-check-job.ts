import { createHash } from "node:crypto";
import { createId, type Identifier } from "@avlp/config";
import {
  groundingChecks,
  lessonSpecs,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { JobExecutionError } from "@avlp/jobs";
import {
  type LanguageModelProvider,
  type ModelPricingTable,
  type PromptRegistry,
  type QuotaGuard,
} from "@avlp/provider-adapters";
import {
  groundingCheckParamsSchema,
  groundingCheckSchema,
  groundingOutputSchema,
  groundingStatusSchema,
  lessonStoryboardSchema,
  type GeneratedAddition,
  type GroundingCheckParams,
  type GroundingClaim,
  type GroundingClaimResult,
  type GroundingOutput,
  type SourcePackage,
  type SourceRef,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";

/**
 * Deterministic grounding-rule failure. The job classifies this as a terminal
 * deterministic failure so a grounding check that references a stale lesson
 * spec, an invalid scene, an unresolved source block, or an inconsistent model
 * output is never persisted.
 */
export class GroundingCheckDeterministicError extends Error {
  public readonly code:
    | "LESSON_SPEC_MISMATCH"
    | "SCENE_MISMATCH"
    | "CLAIM_MISMATCH"
    | "UNRESOLVED_SOURCE_BLOCK"
    | "UNSUPPORTED_SOURCE_BLOCK"
    | "INVALID_STATUS";

  public constructor(
    code: GroundingCheckDeterministicError["code"],
    message: string,
  ) {
    super(message);
    this.name = "GroundingCheckDeterministicError";
    this.code = code;
  }
}

export type GroundingCheckOperationContext = {
  params: GroundingCheckParams;
  lessonSpec: {
    id: Identifier;
    revision: number;
    contentHash: string;
  };
  sourceSnapshot: {
    id: Identifier;
    contentHash: string;
  };
  claims: readonly GroundingClaim[];
};

export type LoadedGroundingCheckContext =
  | { status: "ok"; context: GroundingCheckOperationContext }
  | { status: "lesson_spec_missing" }
  | { status: "lesson_spec_revision_mismatch" }
  | { status: "lesson_spec_hash_mismatch" }
  | { status: "source_snapshot_missing" }
  | { status: "source_snapshot_hash_mismatch" }
  | { status: "scene_missing" };

/** Splits text into sentences on terminal punctuation followed by whitespace. */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

/**
 * Deterministic UUIDv7-shaped claim id derived from the scene, sentence index,
 * and timestamp. Two runs with the same inputs and clock produce the same claim
 * ids so persisted grounding results are reproducible by content.
 */
export function claimIdFor(
  now: Date,
  sceneId: string,
  sentenceIndex: number | string,
): string {
  const digest = createHash("sha256")
    .update(`${sceneId}:${sentenceIndex}`)
    .digest();
  const bytes = Uint8Array.from(digest.subarray(0, 16));
  const milliseconds = BigInt(now.getTime());
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number((milliseconds >> BigInt((5 - index) * 8)) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Normalizes text for generated-addition matching: lowercases, strips
 * punctuation, and collapses whitespace so teacher edits that preserve the
 * wording still match their recorded generated-addition label.
 */
export function normalizeClaimText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic matcher for a sentence against a recorded generated addition.
 * A teacher edit typically preserves most of the analogy/example wording, so
 * a normalized word-overlap ratio is used instead of a verbatim prefix match.
 * The 0.5 threshold keeps the match robust to rewording while still rejecting
 * ordinary factual sentences that share only generic connective words.
 */
export function isGeneratedAdditionSentence(
  sentence: string,
  addition: GeneratedAddition,
): boolean {
  const normalizedSentence = normalizeClaimText(sentence);
  const normalizedAddition = normalizeClaimText(addition.content);
  if (normalizedAddition.length === 0) return false;
  if (normalizedSentence.includes(normalizedAddition)) return true;
  const additionTokens = normalizedAddition.split(" ").filter((token) => token.length >= 3);
  if (additionTokens.length === 0) return false;
  const sentenceTokens = new Set(normalizedSentence.split(" "));
  const matched = additionTokens.filter((token) => sentenceTokens.has(token));
  return matched.length / additionTokens.length >= 0.5;
}

/**
 * Segments narration text into bounded claim units, one per sentence. Every
 * sentence inherits the scene's existing source refs ("use existing source
 * refs first"); sentences matching a recorded generated addition are treated
 * as generated additions with no citations, even when the teacher edited the
 * wording.
 */
export function segmentClaims(input: {
  text: string;
  sceneId: Identifier;
  sourceRefs: readonly SourceRef[];
  generatedAdditions: readonly GeneratedAddition[];
  now: Date;
}): GroundingClaim[] {
  const sentences = splitSentences(input.text);
  return sentences.map((sentence, sentenceIndex) => {
    const matchedAddition = input.generatedAdditions.find((addition) =>
      isGeneratedAdditionSentence(sentence, addition),
    );
    const isGenerated = matchedAddition !== undefined;
    const base = {
      id: claimIdFor(input.now, input.sceneId, sentenceIndex),
      text: sentence,
      sourceRefs: isGenerated ? [] : input.sourceRefs,
      location: {
        type: "narration" as const,
        sceneId: input.sceneId,
        sentenceIndex,
      },
    };
    if (isGenerated)
      return {
        ...base,
        generatedAddition: matchedAddition,
      } as GroundingClaim;
    return base as GroundingClaim;
  });
}

/**
 * Segments on-screen text entries into bounded claim units, one per entry.
 * On-screen labels are short display phrases, so each entry is a single claim
 * that inherits the scene's existing source refs unless it matches a recorded
 * generated addition.
 */
export function segmentOnScreenTextClaims(input: {
  entries: readonly string[];
  sceneId: Identifier;
  sourceRefs: readonly SourceRef[];
  generatedAdditions: readonly GeneratedAddition[];
  now: Date;
}): GroundingClaim[] {
  return input.entries
    .map((entry, entryIndex) => {
      const sentence = entry.trim();
      if (sentence.length === 0) return null;
      const matchedAddition = input.generatedAdditions.find((addition) =>
        isGeneratedAdditionSentence(sentence, addition),
      );
      const isGenerated = matchedAddition !== undefined;
      const base = {
        id: claimIdFor(input.now, input.sceneId, `ost:${entryIndex}`),
        text: sentence,
        sourceRefs: isGenerated ? [] : input.sourceRefs,
        location: {
          type: "on_screen_text" as const,
          sceneId: input.sceneId,
          sentenceIndex: entryIndex,
        },
      };
      if (isGenerated)
        return {
          ...base,
          generatedAddition: matchedAddition,
        } as GroundingClaim;
      return base as GroundingClaim;
    })
    .filter((claim): claim is GroundingClaim => claim !== null);
}

/** All source block IDs cited by a set of source refs. */
export function citedBlockIds(sourceRefs: readonly SourceRef[]): Set<string> {
  return new Set(sourceRefs.flatMap((ref) => ref.blockIds));
}

/**
 * Loads the working lesson spec (draft or approved), verifies its revision and
 * content hash, loads the referenced approved source snapshot and verifies its
 * content hash, and derives the claims to check from the target scene or all
 * scenes. Deterministic source-ID validation runs here: every block ID cited
 * by the claims must resolve to a block in the approved snapshot.
 */
export async function loadGroundingCheckContext(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  params: GroundingCheckParams;
  now: Date;
}): Promise<LoadedGroundingCheckContext> {
  const [lessonSpecRow] = await input.executor
    .select()
    .from(lessonSpecs)
    .where(
      and(
        eq(lessonSpecs.id, input.params.lessonSpecId),
        eq(lessonSpecs.ownerUserId, input.ownerUserId),
        eq(lessonSpecs.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (lessonSpecRow === undefined) return { status: "lesson_spec_missing" };
  if (lessonSpecRow.revision !== input.params.lessonSpecRevision)
    return { status: "lesson_spec_revision_mismatch" };
  if (lessonSpecRow.contentHash !== input.params.lessonSpecContentHash)
    return { status: "lesson_spec_hash_mismatch" };

  const [snapshotRow] = await input.executor
    .select()
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.id, input.params.sourceSnapshotId),
        eq(sourceSnapshots.ownerUserId, input.ownerUserId),
        eq(sourceSnapshots.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (snapshotRow === undefined) return { status: "source_snapshot_missing" };
  if (snapshotRow.contentHash !== input.params.sourceSnapshotContentHash)
    return { status: "source_snapshot_hash_mismatch" };

  const snapshot = parseSnapshotPayload(snapshotRow.payload);
  const snapshotBlockIds = new Set(snapshot.blocks.map((block) => block.blockId));

  const storyboard = lessonStoryboardSchema.parse(lessonSpecRow.payload);
  const targetScenes =
    input.params.scope === "scene"
      ? storyboard.scenes.filter(
          (scene) => scene.stableSceneId === input.params.sceneId,
        )
      : storyboard.scenes;
  if (input.params.scope === "scene" && targetScenes.length === 0)
    return { status: "scene_missing" };

  const claims: GroundingClaim[] = [];
  for (const scene of targetScenes) {
    const cited = citedBlockIds(scene.scene.sourceRefs);
    for (const blockId of cited)
      if (!snapshotBlockIds.has(blockId))
        throw new GroundingCheckDeterministicError(
          "UNRESOLVED_SOURCE_BLOCK",
          `Scene ${scene.stableSceneId} cites source block ${blockId} that is not in the approved snapshot.`,
        );
    claims.push(
      ...segmentClaims({
        text: scene.scene.narration,
        sceneId: scene.stableSceneId,
        sourceRefs: scene.scene.sourceRefs,
        generatedAdditions: scene.scene.generatedAdditions,
        now: input.now,
      }),
      ...segmentOnScreenTextClaims({
        entries: scene.scene.onScreenText,
        sceneId: scene.stableSceneId,
        sourceRefs: scene.scene.sourceRefs,
        generatedAdditions: scene.scene.generatedAdditions,
        now: input.now,
      }),
    );
  }

  return {
    status: "ok",
    context: {
      params: input.params,
      lessonSpec: {
        id: lessonSpecRow.id as Identifier,
        revision: lessonSpecRow.revision,
        contentHash: lessonSpecRow.contentHash,
      },
      sourceSnapshot: {
        id: snapshotRow.id as Identifier,
        contentHash: snapshotRow.contentHash,
      },
      claims,
    },
  };
}

function parseSnapshotPayload(payload: unknown): {
  blocks: readonly { blockId: string }[];
} {
  const parsed = payload as { blocks?: readonly { blockId?: unknown }[] };
  const blocks = Array.isArray(parsed?.blocks)
    ? parsed.blocks.filter(
        (block): block is { blockId: string } =>
          typeof block?.blockId === "string",
      )
    : [];
  return { blocks };
}

/** All block IDs present in a bounded source package. */
function collectPackageBlockIds(sourcePackage: SourcePackage): Set<string> {
  return new Set(
    sourcePackage.sections.flatMap((section) =>
      section.blocks.map((block) => block.blockId),
    ),
  );
}

/**
 * Deterministic grounding checks applied to the model output:
 * - every claim in the operation context must have exactly one result
 * - every result must reference a claim that exists in the operation context
 * - every status must be one of the four grounding statuses
 * - every supported span must cite a source block present in the source package
 * - every span must fall inside the claim text
 * - a claim with no source refs must be classified as generated_addition
 * - a claim with source refs cannot be classified as generated_addition
 */
export function assertGroundingChecks(
  output: GroundingOutput,
  sourcePackage: SourcePackage,
  operationContext: GroundingCheckOperationContext | undefined,
): void {
  if (operationContext === undefined)
    throw new GroundingCheckDeterministicError(
      "CLAIM_MISMATCH",
      "The grounding check operation context is missing.",
    );
  const valid = collectPackageBlockIds(sourcePackage);
  const claimsById = new Map(
    operationContext.claims.map((claim) => [claim.id, claim]),
  );
  const resultIds = new Set<string>();
  for (const [index, result] of output.results.entries()) {
    if (resultIds.has(result.claimId))
      throw new GroundingCheckDeterministicError(
        "CLAIM_MISMATCH",
        `Grounding result ${index} duplicates claim ${result.claimId}.`,
      );
    resultIds.add(result.claimId);
    const claim = claimsById.get(result.claimId);
    if (claim === undefined)
      throw new GroundingCheckDeterministicError(
        "CLAIM_MISMATCH",
        `Grounding result ${index} references unknown claim ${result.claimId}.`,
      );
    if (!groundingStatusSchema.safeParse(result.status).success)
      throw new GroundingCheckDeterministicError(
        "INVALID_STATUS",
        `Grounding result ${index} has invalid status ${result.status}.`,
      );
    const textLength = claim.text.length;
    for (const span of result.supportedSpans) {
      if (!valid.has(span.sourceBlockId))
        throw new GroundingCheckDeterministicError(
          "UNSUPPORTED_SOURCE_BLOCK",
          `Grounding result ${index} cites unsupported source block ${span.sourceBlockId}.`,
        );
      if (span.end > textLength)
        throw new GroundingCheckDeterministicError(
          "INVALID_STATUS",
          `Grounding result ${index} supported span exceeds the claim text.`,
        );
    }
    for (const span of result.unsupportedSpans) {
      if (span.end > textLength)
        throw new GroundingCheckDeterministicError(
          "INVALID_STATUS",
          `Grounding result ${index} unsupported span exceeds the claim text.`,
        );
    }
    const hasSourceRefs = claim.sourceRefs.length > 0;
    if (!hasSourceRefs && result.status !== "generated_addition")
      throw new GroundingCheckDeterministicError(
        "INVALID_STATUS",
        `Claim ${claim.id} has no source refs so must be generated_addition, not ${result.status}.`,
      );
    if (hasSourceRefs && result.status === "generated_addition")
      throw new GroundingCheckDeterministicError(
        "INVALID_STATUS",
        `Claim ${claim.id} has source refs so cannot be generated_addition.`,
      );
  }
  for (const claim of operationContext.claims) {
    if (!resultIds.has(claim.id))
      throw new GroundingCheckDeterministicError(
        "CLAIM_MISMATCH",
        `Grounding results are missing for claim ${claim.id}.`,
      );
  }
}

/**
 * Idempotent persistence of a grounding check result: one row per (tenant,
 * project, job idempotency key). A retried job returns the already-created
 * row instead of duplicating the result.
 */
export async function persistGroundingCheck(input: {
  executor: DatabaseExecutor;
  value: GroundingOutput;
  sourcePackage: SourcePackage;
  params: unknown;
  modelCall: { id: Identifier };
  operationContext: unknown;
  context: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string;
  };
  now: Date;
}): Promise<{ id: Identifier }> {
  const parsedParams = groundingCheckParamsSchema.parse(input.params);
  const operationContext = input.operationContext as
    | GroundingCheckOperationContext
    | undefined;
  if (operationContext === undefined)
    throw new Error("The grounding check operation context is missing.");
  const timestamp = input.now;
  const checkId = createId(timestamp);

  const results: GroundingClaimResult[] = input.value.results.map((result) => ({
    claimId: result.claimId,
    status: result.status,
    supportedSpans: result.supportedSpans,
    unsupportedSpans: result.unsupportedSpans,
    modelAssisted: true,
    modelCallId: input.modelCall.id,
    checkedAt: timestamp.toISOString(),
  }));

  const summary = {
    total: results.length,
    supported: results.filter((result) => result.status === "supported").length,
    unsupported: results.filter((result) => result.status === "unsupported")
      .length,
    generatedAddition: results.filter(
      (result) => result.status === "generated_addition",
    ).length,
    needsReview: results.filter((result) => result.status === "needs_review")
      .length,
  };

  const check = groundingCheckSchema.parse({
    schemaVersion: "grounding-check-v1",
    id: checkId,
    projectId: input.context.projectId,
    lessonSpecId: operationContext.lessonSpec.id,
    lessonSpecRevision: operationContext.lessonSpec.revision,
    lessonSpecContentHash: operationContext.lessonSpec.contentHash,
    sourceSnapshotId: operationContext.sourceSnapshot.id,
    sourceSnapshotContentHash: operationContext.sourceSnapshot.contentHash,
    claims: [...operationContext.claims],
    results,
    summary,
    modelCalls: [input.modelCall.id],
    createdAt: timestamp.toISOString(),
  });

  const [created] = await input.executor
    .insert(groundingChecks)
    .values({
      id: check.id,
      projectId: check.projectId,
      ownerUserId: input.context.ownerUserId,
      lessonSpecId: check.lessonSpecId,
      lessonSpecRevision: check.lessonSpecRevision,
      lessonSpecContentHash: check.lessonSpecContentHash,
      sourceSnapshotId: check.sourceSnapshotId,
      sourceSnapshotContentHash: check.sourceSnapshotContentHash,
      scope: parsedParams.scope,
      sceneId:
        parsedParams.scope === "scene" ? parsedParams.sceneId ?? null : null,
      claims: check.claims as unknown[],
      results: check.results,
      summary: check.summary,
      modelCallIds: check.modelCalls,
      idempotencyKey: input.context.idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [
        groundingChecks.ownerUserId,
        groundingChecks.projectId,
        groundingChecks.idempotencyKey,
      ],
    })
    .returning({ id: groundingChecks.id });
  if (created !== undefined) return { id: created.id as Identifier };
  const [existing] = await input.executor
    .select({ id: groundingChecks.id })
    .from(groundingChecks)
    .where(
      and(
        eq(groundingChecks.ownerUserId, input.context.ownerUserId),
        eq(groundingChecks.projectId, input.context.projectId),
        eq(groundingChecks.idempotencyKey, input.context.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing === undefined)
    throw new Error("The idempotent grounding check could not be read.");
  return { id: existing.id as Identifier };
}

function groundingContextError(
  status: Exclude<LoadedGroundingCheckContext["status"], "ok">,
): JobExecutionError {
  switch (status) {
    case "lesson_spec_missing":
      return new JobExecutionError(
        "terminal",
        "LESSON_SPEC_NOT_FOUND",
        "The referenced lesson spec does not exist.",
      );
    case "lesson_spec_revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "LESSON_SPEC_REVISION_MISMATCH",
        "The lesson spec changed after this grounding check was requested.",
      );
    case "lesson_spec_hash_mismatch":
      return new JobExecutionError(
        "terminal",
        "LESSON_SPEC_HASH_MISMATCH",
        "The lesson spec content changed after this grounding check was requested.",
      );
    case "source_snapshot_missing":
      return new JobExecutionError(
        "terminal",
        "SOURCE_SNAPSHOT_NOT_FOUND",
        "The referenced source snapshot does not exist.",
      );
    case "source_snapshot_hash_mismatch":
      return new JobExecutionError(
        "terminal",
        "SOURCE_SNAPSHOT_HASH_MISMATCH",
        "The approved source changed after this grounding check was requested.",
      );
    case "scene_missing":
      return new JobExecutionError(
        "terminal",
        "SCENE_NOT_FOUND",
        "The referenced storyboard scene does not exist.",
      );
    default:
      return new JobExecutionError(
        "terminal",
        "GROUNDING_CHECK_INVALID",
        "The grounding check request is invalid.",
      );
  }
}

/**
 * The grounding check job: the standard model-call lifecycle plus the loaded
 * lesson spec, source snapshot, segmented claims, deterministic checks, and
 * idempotent result persistence. Teacher-added analogies and examples that are
 * already labelled as generated additions are classified deterministically;
 * every other claim is sent to the model for entailment classification against
 * the bounded source package.
 */
export function createGroundingCheckJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<typeof createModelCallGenerationHandler<GroundingOutput>> {
  const now = input.now ?? (() => new Date());
  const options: ModelCallHandlerOptions<GroundingOutput> = {
    jobType: "grounding.check",
    payloadVersion: 1,
    operationType: "ai.grounding",
    outputSchema: groundingOutputSchema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ params, context }) => {
      const parsedParams = groundingCheckParamsSchema.parse(params);
      const loaded = await loadGroundingCheckContext({
        executor: input.database,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        params: parsedParams,
        now: now(),
      });
      if (loaded.status !== "ok") throw groundingContextError(loaded.status);
      const { context: operationContext } = loaded;
      const claimSummaries = operationContext.claims.map((claim) => ({
        id: claim.id,
        text: claim.text,
        ...(claim.generatedAddition === undefined
          ? {}
          : { generatedAddition: claim.generatedAddition }),
      }));
      return {
        variables: {
          claims: JSON.stringify(claimSummaries),
          scope: parsedParams.scope,
          ...(parsedParams.sceneId === undefined
            ? {}
            : { sceneId: parsedParams.sceneId }),
        },
        context: operationContext,
      };
    },
    deterministicChecks: (value, sourcePackage, operationContext) =>
      assertGroundingChecks(
        value,
        sourcePackage,
        operationContext as GroundingCheckOperationContext | undefined,
      ),
    persistCandidate: (candidate) =>
      persistGroundingCheck({
        executor: input.database,
        value: candidate.value,
        sourcePackage: candidate.sourcePackage,
        params: candidate.params,
        modelCall: candidate.modelCall,
        operationContext: candidate.operationContext,
        context: candidate.context,
        now: candidate.now,
      }),
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    ...(input.maxRepairs === undefined ? {} : { maxRepairs: input.maxRepairs }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  return createModelCallGenerationHandler<GroundingOutput>(options);
}

export type { GroundingClaim };
