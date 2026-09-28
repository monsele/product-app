import { createHash } from "node:crypto";
import { createId, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
} from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlocks,
  narrationSets,
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
  lessonNarrationSetSchema,
  narrationCopiedPassageMinimumRun,
  narrationGenerationParamsSchema,
  narrationOutputV1Schema,
  narrationQuotationMaxPerBlock,
  narrationQuotationMaxPerNarration,
  narrationSentenceMaximumWords,
  narrationWordCountRange,
  type GeneratedAddition,
  type LessonNarrationSet,
  type ModelCallParams,
  type ModelCallRecord,
  type NarrationGenerationParams,
  type NarrationOutputV1,
  type SourcePackage,
  type SourceRef,
  type SourceSnapshot,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";
import {
  longestCopiedWordRun,
  quotationAppearsInSource,
} from "./narration-copy-checks.js";
import { resolveObjectiveSourceRefs as resolveSourceRefs } from "./objectives-job.js";

/**
 * Deterministic narration rule failure. The job classifies this as a terminal
 * deterministic failure so uncovered outline items, invalid citations, copied
 * passages, or over-long sentences are never silently accepted as a draft.
 * Pacing is deliberately not in this set: see {@link NarrationDeterministicWarning}.
 */
export class NarrationDeterministicCheckError extends Error {
  public readonly code:
    | "OUTLINE_ITEM_UNCOVERED"
    | "UNSUPPORTED_SOURCE_BLOCK"
    | NarrationSentenceViolation["code"]
    | "TARGET_DURATION_MISMATCH";
  /**
   * Every sentence-level violation found, in order, when the failure is one a
   * corrective completion can fix. Empty for structural failures.
   */
  public readonly violations: readonly NarrationSentenceViolation[];

  public constructor(
    code: NarrationDeterministicCheckError["code"],
    message: string,
    violations: readonly NarrationSentenceViolation[] = [],
  ) {
    super(message);
    this.name = "NarrationDeterministicCheckError";
    this.code = code;
    this.violations = violations;
  }
}

/**
 * A sentence the model can correct in place: reword a copied passage, split an
 * over-long sentence, or fix a quotation that is not an exact quote or exceeds
 * the quotation caps. Structural failures are never in this set.
 */
export type NarrationSentenceViolation = {
  code:
    | "SENTENCE_TOO_LONG"
    | "LONG_COPIED_PASSAGE"
    | "QUOTATION_NOT_IN_SOURCE"
    | "TOO_MANY_QUOTATIONS";
  blockIndex: number;
  sentenceIndex: number;
  message: string;
};

/**
 * One improvement request for a script that passed every check but is well
 * short of the length the teacher chose: the voice reads it in less time than
 * the lesson needs, and scene timing follows the voice. Names each short block
 * and how many words to add; returns undefined when the script is long enough.
 */
export function narrationLengthImprovement(
  output: NarrationOutputV1,
  operationContext: NarrationOperationContext | undefined,
): string | undefined {
  if (operationContext === undefined) return undefined;
  const itemById = new Map(operationContext.items.map((item) => [item.id, item]));
  let totalWords = 0;
  let coveredSeconds = 0;
  const short: string[] = [];
  for (const [blockIndex, block] of output.blocks.entries()) {
    const item = itemById.get(block.outlineItemId);
    const words = block.sentences.reduce(
      (sum, sentence) => sum + countWords(sentence.text),
      0,
    );
    totalWords += words;
    if (item === undefined) continue;
    coveredSeconds += item.estimatedSeconds;
    const budget = narrationWordCountRange(item.estimatedSeconds);
    if (words < budget.min)
      short.push(`blocks[${blockIndex}] needs about ${budget.target - words} more words`);
  }
  const total = narrationWordCountRange(coveredSeconds);
  if (totalWords >= total.min || short.length === 0) return undefined;
  return (
    `The narration is too short to fill the lesson: it has ${totalWords} words and needs ${total.min}-${total.max} (about ${total.target}). ` +
    `Lengthen these blocks by explaining their ideas more fully, with examples and connections the cited sources support: ${short.join("; ")}. ` +
    "Every added sentence must cite the source blocks that support it, or be labelled as a generated addition. Keep every existing sentence and its citations."
  ).slice(0, narrationRepairInstructionMaxLength);
}

/** Upper bound on the corrective instruction sent back to the model. */
const narrationRepairInstructionMaxLength = 2_000;

/**
 * One corrective instruction naming every sentence to fix. Locations and
 * rules only: the previous JSON response travels with the instruction, so no
 * source text is repeated here.
 */
export function narrationRepairInstruction(
  error: unknown,
): string | undefined {
  if (
    !(error instanceof NarrationDeterministicCheckError) ||
    error.violations.length === 0
  )
    return undefined;
  const fixes = error.violations.map((violation) => {
    const location = `blocks[${violation.blockIndex}].sentences[${violation.sentenceIndex}]`;
    switch (violation.code) {
      case "LONG_COPIED_PASSAGE":
        return `${location} reuses ${narrationCopiedPassageMinimumRun}+ consecutive source words: say it in your own words, or, only if it is a verse, definition or legal wording that must stay exact, put the exact words in double quotation marks and set "quotation": true.`;
      case "SENTENCE_TOO_LONG":
        return `${location} is longer than ${narrationSentenceMaximumWords} words: split it into shorter sentences with the same sourceBlockIds.`;
      case "QUOTATION_NOT_IN_SOURCE":
        return `${location} is marked "quotation" but the quoted words are not exact words from its cited block: quote the block exactly inside double quotation marks, or paraphrase and remove "quotation".`;
      case "TOO_MANY_QUOTATIONS":
        return `${location} exceeds the quotation limit (${narrationQuotationMaxPerBlock} per block, ${narrationQuotationMaxPerNarration} in total): paraphrase it and remove "quotation".`;
    }
  });
  return `Fix exactly these sentences and change nothing else: ${fixes.join(" ")}`.slice(
    0,
    narrationRepairInstructionMaxLength,
  );
}

/**
 * A narration rule the draft violates without being wrong: pacing guidance the
 * teacher reviews rather than a correctness invariant the pipeline depends on.
 * Reported on the completed job so the signal survives the downgrade.
 */
export type NarrationDeterministicWarning = {
  code: "WORD_COUNT_OUT_OF_BUDGET";
  message: string;
};

/** Approved outline items and configuration available to narration checks. */
export type NarrationOperationContext = {
  outlineSetContentHash: string;
  items: readonly {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  }[];
  params: NarrationGenerationParams;
};

export type ApprovedOutlineSetResult =
  | {
      status: "ok";
      set: {
        id: Identifier;
        contentHash: string;
        sourceSnapshotId: Identifier;
        items: readonly {
          id: Identifier;
          order: number;
          kind: string;
          title: string;
          description: string;
          estimatedSeconds: number;
        }[];
      };
    }
  | {
      status:
        "missing" | "not_approved" | "revision_mismatch" | "snapshot_mismatch";
    };

/**
 * Deterministic SHA-256 of the approved outline items the narration must
 * cover, bound to the exact approved outline revision.
 */
export function computeOutlineSetContentHash(
  items: readonly {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  }[],
): string {
  const canonical = JSON.stringify(
    [...items]
      .sort((left, right) => left.order - right.order)
      .map((item) => ({
        id: item.id,
        order: item.order,
        kind: item.kind,
        title: item.title,
        description: item.description,
        estimatedSeconds: item.estimatedSeconds,
      })),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Loads the approved outline set for a tenant and verifies it is the exact
 * approved revision and source snapshot referenced by the narration payload.
 */
export async function loadApprovedOutlineSet(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  outlineSetId: Identifier;
  expectedRevision: number;
  sourceSnapshotId: Identifier;
}): Promise<ApprovedOutlineSetResult> {
  const [row] = await input.executor
    .select()
    .from(lessonOutlineSets)
    .where(
      and(
        eq(lessonOutlineSets.id, input.outlineSetId),
        eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
        eq(lessonOutlineSets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (row === undefined) return { status: "missing" };
  if (row.status !== "approved") return { status: "not_approved" };
  if (row.revision !== input.expectedRevision)
    return { status: "revision_mismatch" };
  if (row.sourceSnapshotId !== input.sourceSnapshotId)
    return { status: "snapshot_mismatch" };
  const itemRows = await input.executor
    .select({
      id: lessonOutlineItems.id,
      order: lessonOutlineItems.order,
      kind: lessonOutlineItems.kind,
      title: lessonOutlineItems.title,
      description: lessonOutlineItems.description,
      estimatedSeconds: lessonOutlineItems.estimatedSeconds,
    })
    .from(lessonOutlineItems)
    .where(
      and(
        eq(lessonOutlineItems.setId, row.id),
        eq(lessonOutlineItems.ownerUserId, input.ownerUserId),
        eq(lessonOutlineItems.projectId, input.projectId),
      ),
    )
    .orderBy(lessonOutlineItems.order);
  const items = itemRows.map((item) => ({
    id: item.id as Identifier,
    order: item.order,
    kind: item.kind,
    title: item.title,
    description: item.description,
    estimatedSeconds: item.estimatedSeconds,
  }));
  return {
    status: "ok",
    set: {
      id: row.id as Identifier,
      contentHash: computeOutlineSetContentHash(items),
      sourceSnapshotId: row.sourceSnapshotId as Identifier,
      items,
    },
  };
}

/** All block IDs present in a bounded source package. */
function collectPackageBlockIds(sourcePackage: SourcePackage): Set<string> {
  return new Set(
    sourcePackage.sections.flatMap((section) =>
      section.blocks.map((block) => block.blockId),
    ),
  );
}

function countWords(text: string): number {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return words.length;
}

/**
 * Deterministic narration rules: every approved outline item has exactly one
 * block, every sentence stays within the sentence-length ceiling, no sentence
 * copies a long passage from the source unless it is a marked quotation that
 * quotes its cited block exactly (within the quotation caps), every citation
 * resolves to a block in the approved source package, and generated additions
 * never cite source blocks (schema-enforced). Structural failures throw at
 * once; sentence-level violations are collected so one corrective completion
 * can fix all of them.
 *
 * Word-count budgets are returned as warnings instead. They express pacing
 * preference, not correctness: the review route already surfaces them without
 * blocking approval, and a teacher can regenerate a single block. Failing the
 * whole job for them discarded five good blocks over one, and denied the
 * per-block repair flow the draft exists to support.
 */
export function assertNarrationDeterministicChecks(
  output: NarrationOutputV1,
  sourcePackage: SourcePackage,
  operationContext: NarrationOperationContext | undefined,
): NarrationDeterministicWarning[] {
  const warnings: NarrationDeterministicWarning[] = [];
  if (operationContext === undefined)
    throw new NarrationDeterministicCheckError(
      "OUTLINE_ITEM_UNCOVERED",
      "The narration operation context is missing the approved outline items.",
    );
  if (
    output.targetDurationSeconds !==
    operationContext.params.targetDurationSeconds
  )
    throw new NarrationDeterministicCheckError(
      "TARGET_DURATION_MISMATCH",
      "The narration target duration must match the lesson configuration.",
    );
  const valid = collectPackageBlockIds(sourcePackage);
  const approvedItems = operationContext.items;
  const coveredIds = new Set<string>();
  const itemById = new Map(approvedItems.map((item) => [item.id, item]));
  const sourceTextById = new Map<string, string>();
  for (const section of sourcePackage.sections)
    for (const block of section.blocks)
      sourceTextById.set(block.blockId, block.text);
  const violations: NarrationSentenceViolation[] = [];
  let totalQuotations = 0;
  for (const [blockIndex, block] of output.blocks.entries()) {
    const item = itemById.get(block.outlineItemId);
    if (item === undefined)
      throw new NarrationDeterministicCheckError(
        "OUTLINE_ITEM_UNCOVERED",
        `blocks[${blockIndex}] references an outline item that is not approved: ${block.outlineItemId}.`,
      );
    if (coveredIds.has(block.outlineItemId))
      throw new NarrationDeterministicCheckError(
        "OUTLINE_ITEM_UNCOVERED",
        `blocks[${blockIndex}] duplicates narration for outline item ${block.outlineItemId}.`,
      );
    coveredIds.add(block.outlineItemId);
    const words = block.sentences.reduce(
      (sum, sentence) => sum + countWords(sentence.text),
      0,
    );
    const budget = narrationWordCountRange(item.estimatedSeconds);
    if (words < budget.min || words > budget.max)
      warnings.push({
        code: "WORD_COUNT_OUT_OF_BUDGET",
        message: `blocks[${blockIndex}] has ${words} words; the ${item.estimatedSeconds}s outline item suggests ${budget.min}-${budget.max}.`,
      });
    let blockQuotations = 0;
    for (const [sentenceIndex, sentence] of block.sentences.entries()) {
      const at = `blocks[${blockIndex}].sentences[${sentenceIndex}]`;
      const violate = (
        code: NarrationSentenceViolation["code"],
        message: string,
      ) => violations.push({ code, blockIndex, sentenceIndex, message });
      const sentenceWords = countWords(sentence.text);
      if (sentenceWords > narrationSentenceMaximumWords)
        violate(
          "SENTENCE_TOO_LONG",
          `${at} has ${sentenceWords} words; the maximum is ${narrationSentenceMaximumWords}.`,
        );
      for (const blockId of sentence.sourceBlockIds)
        if (!valid.has(blockId))
          throw new NarrationDeterministicCheckError(
            "UNSUPPORTED_SOURCE_BLOCK",
            `${at} cites unsupported source block ${blockId}.`,
          );
      if (sentence.quotation === true) {
        blockQuotations += 1;
        totalQuotations += 1;
        const blockId = sentence.sourceBlockIds[0]!;
        if (
          blockQuotations > narrationQuotationMaxPerBlock ||
          totalQuotations > narrationQuotationMaxPerNarration
        )
          violate(
            "TOO_MANY_QUOTATIONS",
            `${at} is a quotation beyond the limit of ${narrationQuotationMaxPerBlock} per block and ${narrationQuotationMaxPerNarration} per narration.`,
          );
        else if (
          !quotationAppearsInSource(
            sentence.text,
            sourceTextById.get(blockId) ?? "",
          )
        )
          violate(
            "QUOTATION_NOT_IN_SOURCE",
            `${at} is marked as a quotation but does not quote source block ${blockId} exactly.`,
          );
        continue;
      }
      for (const blockId of sentence.sourceBlockIds) {
        const longest = longestCopiedWordRun(
          sentence.text,
          sourceTextById.get(blockId) ?? "",
        );
        if (longest >= narrationCopiedPassageMinimumRun) {
          violate(
            "LONG_COPIED_PASSAGE",
            `${at} copies a ${longest}-word passage from source block ${blockId}.`,
          );
          break;
        }
      }
    }
  }
  for (const item of approvedItems)
    if (!coveredIds.has(item.id))
      throw new NarrationDeterministicCheckError(
        "OUTLINE_ITEM_UNCOVERED",
        `Approved outline item ${item.id} has no narration block.`,
      );
  const [first] = violations;
  if (first !== undefined)
    throw new NarrationDeterministicCheckError(
      first.code,
      violations.length === 1
        ? first.message
        : `${first.message} (${violations.length - 1} more sentence${violations.length === 2 ? "" : "s"} to fix)`,
      violations,
    );
  const coveredSeconds = [...coveredIds].reduce(
    (sum, itemId) => sum + (itemById.get(itemId)?.estimatedSeconds ?? 0),
    0,
  );
  const totalWords = output.blocks.reduce(
    (sum, block) =>
      sum +
      block.sentences.reduce(
        (sentenceSum, sentence) => sentenceSum + countWords(sentence.text),
        0,
      ),
    0,
  );
  const totalBudget = narrationWordCountRange(coveredSeconds);
  if (totalWords < totalBudget.min || totalWords > totalBudget.max)
    warnings.push({
      code: "WORD_COUNT_OUT_OF_BUDGET",
      message: `The narration totals ${totalWords} words; the covered ${coveredSeconds}s of outline time suggests ${totalBudget.min}-${totalBudget.max}.`,
    });
  return warnings;
}

/**
 * Idempotent draft-set persistence: one set per (owner, project, job
 * idempotency key). A retried job returns the already-created set instead of
 * duplicating the result record.
 */
export async function persistNarrationSet(input: {
  executor: DatabaseExecutor;
  output: NarrationOutputV1;
  sourcePackage: SourcePackage;
  snapshot: SourceSnapshot;
  params: ModelCallParams;
  modelCall: ModelCallRecord;
  operationContext: unknown;
  context: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string;
  };
  now: Date;
}): Promise<{ id: Identifier }> {
  const params = narrationGenerationParamsSchema.parse(input.params);
  const operationContext = input.operationContext as
    NarrationOperationContext | undefined;
  if (operationContext === undefined || operationContext.items.length === 0)
    throw new Error(
      "The narration operation context is missing the approved outline items.",
    );
  const timestamp = input.now;
  const setId = createId(timestamp);
  const itemByOutputId = new Map(
    operationContext.items.map((item) => [item.id, item]),
  );
  const sourceRefsFor = (blockIds: readonly string[]): SourceRef[] =>
    resolveSourceRefs(input.sourcePackage, blockIds);
  const blocks = input.output.blocks.map((block, index) => {
    const item = itemByOutputId.get(block.outlineItemId)!;
    const blockIds = block.sentences.flatMap(
      (sentence) => sentence.sourceBlockIds,
    );
    const generatedAdditions: GeneratedAddition[] = block.sentences.flatMap(
      (sentence) =>
        sentence.generatedAddition === undefined
          ? []
          : [
              {
                kind: sentence.generatedAddition.kind,
                content: sentence.text,
                rationale: sentence.generatedAddition.rationale,
              },
            ],
    );
    const text = block.sentences.map((sentence) => sentence.text).join(" ");
    const sourceRefs = sourceRefsFor(blockIds);
    return {
      id: createId(timestamp),
      outlineItemId: block.outlineItemId,
      order: index + 1,
      text,
      estimatedWords: block.sentences.reduce(
        (sum, sentence) => sum + countWords(sentence.text),
        0,
      ),
      targetSeconds: item.estimatedSeconds,
      sourceRefs,
      generatedAdditions,
      generated: true,
      revision: 0,
      contentHash: computeNarrationBlockContentHash({
        text,
        sourceRefs,
        generatedAdditions,
        generated: true,
      }),
    };
  });
  const totalEstimatedSeconds = input.output.blocks.reduce(
    (sum, block) =>
      sum + (itemByOutputId.get(block.outlineItemId)?.estimatedSeconds ?? 0),
    0,
  );
  const contentHash = computeNarrationSetContentHash(
    blocks,
    totalEstimatedSeconds,
  );
  const set: LessonNarrationSet = lessonNarrationSetSchema.parse({
    schemaVersion: 1,
    id: setId,
    projectId: input.context.projectId,
    sourceSnapshotId: input.snapshot.id,
    sourceSnapshotContentHash: input.snapshot.contentHash,
    outlineSetId: params.outlineSetId,
    outlineSetContentHash: operationContext.outlineSetContentHash,
    configurationVersion: params.configurationVersion,
    promptId: input.modelCall.promptId,
    promptVersion: input.modelCall.promptVersion,
    model: input.modelCall.model,
    modelCallId: input.modelCall.id,
    status: "draft",
    revision: 0,
    blocks,
    totalEstimatedSeconds,
    contentHash,
    generatedAt: serializeUtcTimestamp(timestamp),
    createdAt: serializeUtcTimestamp(timestamp),
  });

  return input.executor.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(narrationSets)
      .values({
        id: setId,
        projectId: input.context.projectId,
        ownerUserId: input.context.ownerUserId,
        sourceSnapshotId: input.snapshot.id,
        sourceSnapshotContentHash: input.snapshot.contentHash,
        outlineSetId: set.outlineSetId,
        outlineSetContentHash: set.outlineSetContentHash,
        configurationVersion: set.configurationVersion,
        promptId: set.promptId,
        promptVersion: set.promptVersion,
        model: set.model,
        modelCallId: set.modelCallId,
        status: set.status,
        revision: 0,
        idempotencyKey: input.context.idempotencyKey,
        totalEstimatedSeconds: set.totalEstimatedSeconds,
        generatedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          narrationSets.ownerUserId,
          narrationSets.projectId,
          narrationSets.idempotencyKey,
        ],
      })
      .returning({ id: narrationSets.id });
    if (created !== undefined) {
      await transaction.insert(narrationBlocks).values(
        set.blocks.map((block) => ({
          id: block.id,
          projectId: input.context.projectId,
          ownerUserId: input.context.ownerUserId,
          setId,
          outlineItemId: block.outlineItemId,
          order: block.order,
          text: block.text,
          estimatedWords: block.estimatedWords,
          targetSeconds: block.targetSeconds,
          sourceRefs: block.sourceRefs,
          generatedAdditions: block.generatedAdditions,
          generated: block.generated,
          revision: block.revision,
          origin: "generated",
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    } else {
      const [existing] = await transaction
        .select({ id: narrationSets.id })
        .from(narrationSets)
        .where(
          and(
            eq(narrationSets.ownerUserId, input.context.ownerUserId),
            eq(narrationSets.projectId, input.context.projectId),
            eq(narrationSets.idempotencyKey, input.context.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error("The idempotent narration set could not be read.");
      return { id: existing.id as Identifier };
    }
    return { id: setId };
  });
}

function outlineSetError(
  status: ApprovedOutlineSetResult["status"],
): JobExecutionError {
  switch (status) {
    case "missing":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_NOT_FOUND",
        "The referenced approved outline set does not exist.",
      );
    case "not_approved":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_NOT_APPROVED",
        "Narration generation requires an approved lesson outline.",
      );
    case "revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_REVISION_MISMATCH",
        "The referenced outline set is no longer the approved revision.",
      );
    case "snapshot_mismatch":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_SNAPSHOT_MISMATCH",
        "The approved outline references a different source snapshot.",
      );
    default:
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_INVALID",
        "The referenced approved outline set is invalid.",
      );
  }
}

/**
 * The narration generation job: the standard model-call lifecycle plus a
 * loaded approved outline set, per-item word budgets, deterministic narration
 * rules, and idempotent draft-set persistence.
 */
export function createNarrationGenerationJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<typeof createModelCallGenerationHandler<NarrationOutputV1>> {
  const options: ModelCallHandlerOptions<NarrationOutputV1> = {
    jobType: "narration.generate",
    payloadVersion: 2,
    operationType: "ai.narration",
    outputSchema: narrationOutputV1Schema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ snapshot, params, context }) => {
      const parsedParams = narrationGenerationParamsSchema.parse(params);
      const loaded = await loadApprovedOutlineSet({
        executor: input.database,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        outlineSetId: parsedParams.outlineSetId,
        expectedRevision: parsedParams.outlineSetRevision,
        sourceSnapshotId: snapshot.id,
      });
      if (loaded.status !== "ok") throw outlineSetError(loaded.status);
      const wordBudgets = loaded.set.items.map((item) => ({
        outlineItemId: item.id,
        estimatedSeconds: item.estimatedSeconds,
        budget: narrationWordCountRange(item.estimatedSeconds),
      }));
      return {
        variables: {
          outline: JSON.stringify(loaded.set.items),
          wordBudgets: JSON.stringify(wordBudgets),
          configuration: JSON.stringify(parsedParams),
        },
        context: {
          outlineSetContentHash: loaded.set.contentHash,
          items: loaded.set.items,
          params: parsedParams,
        },
      };
    },
    deterministicChecks: (value, sourcePackage, operationContext) =>
      assertNarrationDeterministicChecks(
        value,
        sourcePackage,
        operationContext as NarrationOperationContext | undefined,
      ),
    deterministicRepairInstruction: ({ error }) => {
      const instruction = narrationRepairInstruction(error);
      return instruction === undefined
        ? undefined
        : `${instruction} Keep each sentence's sourceBlockIds, meaning and outlineItemId.`;
    },
    // A second corrective round covers a fix that exposes, or introduces, one
    // more copied sentence; both are cheap next to failing the whole run.
    maxDeterministicRepairs: 2,
    warningRepairInstruction: ({ value, operationContext }) =>
      narrationLengthImprovement(
        value,
        operationContext as NarrationOperationContext | undefined,
      ),
    persistCandidate: (candidate) =>
      persistNarrationSet({
        executor: input.database,
        output: candidate.value,
        sourcePackage: candidate.sourcePackage,
        snapshot: candidate.snapshot,
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
  return createModelCallGenerationHandler<NarrationOutputV1>(options);
}
