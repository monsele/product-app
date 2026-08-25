import { createId, type Identifier } from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  narrationBlockCandidates,
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
  narrationBlockTransformOutputSchema,
  narrationCopiedPassageMinimumRun,
  narrationSentenceMaximumWords,
  narrationTransformParamsSchema,
  narrationWordCountRange,
  type GeneratedAddition,
  type ModelCallParams,
  type ModelCallRecord,
  type NarrationBlockTransformOutput,
  type NarrationTransformMode,
  type NarrationTransformParams,
  type SourcePackage,
} from "@avlp/schemas";
import { and, eq, sql } from "drizzle-orm";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";
import { computeOutlineSetContentHash } from "./narration-job.js";
import { resolveObjectiveSourceRefs as resolveSourceRefs } from "./objectives-job.js";

/**
 * Deterministic block-transform rule failure. The job classifies this as a
 * terminal deterministic failure so a rewritten block that breaks mode
 * direction, word budgets, sentence length, or grounding is never offered as a
 * candidate.
 */
export class NarrationTransformDeterministicCheckError extends Error {
  public readonly code:
    | "MODE_MISMATCH"
    | "OUTLINE_ITEM_MISMATCH"
    | "WORD_COUNT_OUT_OF_BUDGET"
    | "MODE_DIRECTION_VIOLATED"
    | "SENTENCE_TOO_LONG"
    | "UNSUPPORTED_SOURCE_BLOCK"
    | "LONG_COPIED_PASSAGE";

  public constructor(
    code: NarrationTransformDeterministicCheckError["code"],
    message: string,
  ) {
    super(message);
    this.name = "NarrationTransformDeterministicCheckError";
    this.code = code;
  }
}

export type NarrationTransformOperationContext = {
  params: NarrationTransformParams;
  set: {
    id: Identifier;
    revision: number;
  };
  block: {
    id: Identifier;
    outlineItemId: Identifier;
    order: number;
    text: string;
    estimatedWords: number;
    revision: number;
    generated: boolean;
  };
  currentWords: number;
  neighbors: readonly { order: number; text: string }[];
  outlineItem: {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  };
  wordBudget: { min: number; target: number; max: number };
};

export type LoadedNarrationTransformContext =
  | { status: "ok"; context: NarrationTransformOperationContext }
  | { status: "set_missing" }
  | { status: "set_not_draft" }
  | { status: "set_revision_mismatch" }
  | { status: "block_missing" }
  | { status: "outline_mismatch" };

/**
 * Loads the working draft narration set, the target block, its neighbors, and
 * the approved outline the set was generated from, all tenant-scoped. The
 * approved outline must still be approved and its content hash must equal the
 * hash the narration set was bound to.
 */
export async function loadNarrationTransformContext(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  params: NarrationTransformParams;
}): Promise<LoadedNarrationTransformContext> {
  const [setRow] = await input.executor
    .select()
    .from(narrationSets)
    .where(
      and(
        eq(narrationSets.id, input.params.narrationSetId),
        eq(narrationSets.ownerUserId, input.ownerUserId),
        eq(narrationSets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (setRow === undefined) return { status: "set_missing" };
  if (setRow.status !== "draft") return { status: "set_not_draft" };
  if (setRow.revision !== input.params.narrationSetRevision)
    return { status: "set_revision_mismatch" };
  const [blockRow] = await input.executor
    .select()
    .from(narrationBlocks)
    .where(
      and(
        eq(narrationBlocks.id, input.params.blockId),
        eq(narrationBlocks.setId, setRow.id),
        eq(narrationBlocks.ownerUserId, input.ownerUserId),
        eq(narrationBlocks.projectId, input.projectId),
        eq(narrationBlocks.outlineItemId, input.params.outlineItemId),
      ),
    )
    .limit(1);
  if (blockRow === undefined) return { status: "block_missing" };
  const siblingRows = await input.executor
    .select({
      order: narrationBlocks.order,
      text: narrationBlocks.text,
    })
    .from(narrationBlocks)
    .where(
      and(
        eq(narrationBlocks.setId, setRow.id),
        eq(narrationBlocks.ownerUserId, input.ownerUserId),
        eq(narrationBlocks.projectId, input.projectId),
        sql`${narrationBlocks.id} <> ${blockRow.id}`,
      ),
    )
    .orderBy(narrationBlocks.order);
  const outlineSet = await loadApprovedOutlineBoundToNarration({
    executor: input.executor,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    outlineSetId: setRow.outlineSetId,
    expectedContentHash: setRow.outlineSetContentHash,
  });
  if (outlineSet === undefined) return { status: "outline_mismatch" };
  const outlineItem = outlineSet.items.find(
    (item) => item.id === input.params.outlineItemId,
  );
  if (outlineItem === undefined) return { status: "outline_mismatch" };
  const countWords = (text: string): number =>
    text.trim().split(/\s+/).filter((word) => word.length > 0).length;
  return {
    status: "ok",
    context: {
      params: input.params,
      set: {
        id: setRow.id as Identifier,
        revision: setRow.revision,
      },
      block: {
        id: blockRow.id as Identifier,
        outlineItemId: blockRow.outlineItemId as Identifier,
        order: blockRow.order,
        text: blockRow.text,
        estimatedWords: blockRow.estimatedWords,
        revision: blockRow.revision,
        generated: blockRow.generated,
      },
      currentWords: countWords(blockRow.text),
      neighbors: siblingRows.map((row) => ({ order: row.order, text: row.text })),
      outlineItem: {
        id: outlineItem.id,
        order: outlineItem.order,
        kind: outlineItem.kind,
        title: outlineItem.title,
        description: outlineItem.description,
        estimatedSeconds: outlineItem.estimatedSeconds,
      },
      wordBudget: narrationWordCountRange(outlineItem.estimatedSeconds),
    },
  };
}

type ApprovedOutlineForNarration = {
  items: readonly {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  }[];
};

async function loadApprovedOutlineBoundToNarration(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  outlineSetId: Identifier;
  expectedContentHash: string;
}): Promise<ApprovedOutlineForNarration | undefined> {
  const [setRow] = await input.executor
    .select()
    .from(lessonOutlineSets)
    .where(
      and(
        eq(lessonOutlineSets.id, input.outlineSetId),
        eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
        eq(lessonOutlineSets.projectId, input.projectId),
        eq(lessonOutlineSets.status, "approved"),
      ),
    )
    .limit(1);
  if (setRow === undefined) return undefined;
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
        eq(lessonOutlineItems.setId, setRow.id),
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
  if (computeOutlineSetContentHash(items) !== input.expectedContentHash)
    return undefined;
  return { items };
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
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

function longestCopiedWordRun(sentence: string, sourceText: string): number {
  const sentenceWords = sentence.trim().split(/\s+/).filter((word) => word.length > 0);
  const sourceWords = sourceText.trim().split(/\s+/).filter((word) => word.length > 0);
  if (sentenceWords.length === 0 || sourceWords.length === 0) return 0;
  const sourceNGrams = new Set<string>();
  for (let index = 0; index + narrationCopiedPassageMinimumRun <= sourceWords.length; index += 1)
    sourceNGrams.add(sourceWords.slice(index, index + narrationCopiedPassageMinimumRun).join(" "));
  let longest = 0;
  for (let index = 0; index + narrationCopiedPassageMinimumRun <= sentenceWords.length; index += 1) {
    const run = sentenceWords.slice(index, index + narrationCopiedPassageMinimumRun);
    if (!sourceNGrams.has(run.join(" "))) continue;
    let end = index + narrationCopiedPassageMinimumRun;
    while (end < sentenceWords.length && sourceWords.includes(sentenceWords[end]!)) end += 1;
    longest = Math.max(longest, end - index);
  }
  return longest;
}

/**
 * Deterministic rules for one rewritten block: the mode and outline item must
 * match the request, the word count must fit the outline item's budget (and
 * move in the requested direction), every sentence must stay within the
 * sentence-length ceiling, every citation must resolve to the bounded source
 * package, and no sentence may copy a long passage from any package block.
 * Throws on the first violation.
 */
export function assertNarrationBlockTransformChecks(
  output: NarrationBlockTransformOutput,
  sourcePackage: SourcePackage,
  operationContext: NarrationTransformOperationContext | undefined,
): void {
  if (operationContext === undefined)
    throw new NarrationTransformDeterministicCheckError(
      "OUTLINE_ITEM_MISMATCH",
      "The narration transform operation context is missing.",
    );
  if (output.mode !== operationContext.params.mode)
    throw new NarrationTransformDeterministicCheckError(
      "MODE_MISMATCH",
      `The model returned mode ${output.mode} instead of ${operationContext.params.mode}.`,
    );
  if (output.block.outlineItemId !== operationContext.params.outlineItemId)
    throw new NarrationTransformDeterministicCheckError(
      "OUTLINE_ITEM_MISMATCH",
      `The model returned a block for outline item ${output.block.outlineItemId} instead of ${operationContext.params.outlineItemId}.`,
    );
  const valid = collectPackageBlockIds(sourcePackage);
  const sourceTextById = new Map<string, string>();
  for (const section of sourcePackage.sections)
    for (const block of section.blocks)
      sourceTextById.set(block.blockId, block.text);
  const words = output.block.sentences.reduce(
    (sum, sentence) => sum + countWords(sentence.text),
    0,
  );
  const budget = operationContext.wordBudget;
  if (words < budget.min || words > budget.max)
    throw new NarrationTransformDeterministicCheckError(
      "WORD_COUNT_OUT_OF_BUDGET",
      `The rewritten block has ${words} words; the outline item requires ${budget.min}-${budget.max}.`,
    );
  if (output.mode === "shorten" && words >= operationContext.currentWords)
    throw new NarrationTransformDeterministicCheckError(
      "MODE_DIRECTION_VIOLATED",
      `The "shorten" block has ${words} words, not fewer than the current ${operationContext.currentWords}.`,
    );
  if (output.mode === "expand" && words <= operationContext.currentWords)
    throw new NarrationTransformDeterministicCheckError(
      "MODE_DIRECTION_VIOLATED",
      `The "expand" block has ${words} words, not more than the current ${operationContext.currentWords}.`,
    );
  for (const [sentenceIndex, sentence] of output.block.sentences.entries()) {
    const sentenceWords = countWords(sentence.text);
    if (sentenceWords > narrationSentenceMaximumWords)
      throw new NarrationTransformDeterministicCheckError(
        "SENTENCE_TOO_LONG",
        `sentences[${sentenceIndex}] has ${sentenceWords} words; the maximum is ${narrationSentenceMaximumWords}.`,
      );
    for (const blockId of sentence.sourceBlockIds) {
      if (!valid.has(blockId))
        throw new NarrationTransformDeterministicCheckError(
          "UNSUPPORTED_SOURCE_BLOCK",
          `sentences[${sentenceIndex}] cites unsupported source block ${blockId}.`,
        );
      const longest = longestCopiedWordRun(
        sentence.text,
        sourceTextById.get(blockId) ?? "",
      );
      if (longest >= narrationCopiedPassageMinimumRun)
        throw new NarrationTransformDeterministicCheckError(
          "LONG_COPIED_PASSAGE",
          `sentences[${sentenceIndex}] copies a ${longest}-word passage from source block ${blockId}.`,
        );
    }
  }
}

/**
 * Idempotent candidate persistence for one block-transform job: one pending
 * candidate per (tenant, project, block, job idempotency key). A retried job
 * returns the already-created candidate instead of duplicating the result.
 */
export async function persistNarrationBlockCandidate(input: {
  executor: DatabaseExecutor;
  value: NarrationBlockTransformOutput;
  sourcePackage: SourcePackage;
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
  narrationTransformParamsSchema.parse(input.params);
  const operationContext = input.operationContext as
    | NarrationTransformOperationContext
    | undefined;
  if (operationContext === undefined)
    throw new Error("The narration transform operation context is missing.");
  const timestamp = input.now;
  const candidateId = createId(timestamp);
  const text = input.value.block.sentences
    .map((sentence) => sentence.text)
    .join(" ");
  const blockIds = input.value.block.sentences.flatMap(
    (sentence) => sentence.sourceBlockIds,
  );
  const sourceRefs = resolveSourceRefs(input.sourcePackage, blockIds);
  const generatedAdditions: GeneratedAddition[] =
    input.value.block.sentences.flatMap((sentence) =>
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
  const [created] = await input.executor
    .insert(narrationBlockCandidates)
    .values({
      id: candidateId,
      projectId: input.context.projectId,
      ownerUserId: input.context.ownerUserId,
      setId: operationContext.set.id,
      blockId: operationContext.block.id,
      mode: input.value.mode,
      text,
      estimatedWords: countWords(text),
      sourceRefs,
      generatedAdditions,
      generated: true,
      status: "pending",
      blockRevision: operationContext.block.revision,
      modelCallId: input.modelCall.id,
      idempotencyKey: input.context.idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [
        narrationBlockCandidates.ownerUserId,
        narrationBlockCandidates.projectId,
        narrationBlockCandidates.blockId,
        narrationBlockCandidates.idempotencyKey,
      ],
    })
    .returning({ id: narrationBlockCandidates.id });
  if (created !== undefined) return { id: created.id as Identifier };
  const [existing] = await input.executor
    .select({ id: narrationBlockCandidates.id })
    .from(narrationBlockCandidates)
    .where(
      and(
        eq(narrationBlockCandidates.ownerUserId, input.context.ownerUserId),
        eq(narrationBlockCandidates.projectId, input.context.projectId),
        eq(narrationBlockCandidates.blockId, operationContext.block.id),
        eq(
          narrationBlockCandidates.idempotencyKey,
          input.context.idempotencyKey,
        ),
      ),
    )
    .limit(1);
  if (existing === undefined)
    throw new Error("The idempotent narration candidate could not be read.");
  return { id: existing.id as Identifier };
}

function transformContextError(
  status: LoadedNarrationTransformContext["status"],
): JobExecutionError {
  switch (status) {
    case "set_missing":
      return new JobExecutionError(
        "terminal",
        "NARRATION_SET_NOT_FOUND",
        "The referenced narration set does not exist.",
      );
    case "set_not_draft":
      return new JobExecutionError(
        "terminal",
        "NARRATION_SET_NOT_DRAFT",
        "Only draft narration can be regenerated block by block.",
      );
    case "set_revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "NARRATION_SET_REVISION_MISMATCH",
        "The narration changed after this regeneration was requested.",
      );
    case "block_missing":
      return new JobExecutionError(
        "terminal",
        "NARRATION_BLOCK_NOT_FOUND",
        "The referenced narration block does not exist.",
      );
    case "outline_mismatch":
      return new JobExecutionError(
        "terminal",
        "NARRATION_OUTLINE_MISMATCH",
        "The approved outline no longer matches the narration.",
      );
    default:
      return new JobExecutionError(
        "terminal",
        "NARRATION_TRANSFORM_INVALID",
        "The narration block transform request is invalid.",
      );
  }
}

/**
 * The narration block transform job: the standard model-call lifecycle plus a
 * loaded narration draft set, the target block and its neighbors, the approved
 * outline item, bounded source narrowing, single-block deterministic checks,
 * and idempotent candidate persistence.
 */
export function createNarrationBlockTransformJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<typeof createModelCallGenerationHandler<NarrationBlockTransformOutput>> {
  const options: ModelCallHandlerOptions<NarrationBlockTransformOutput> = {
    jobType: "narration.transform",
    payloadVersion: 1,
    operationType: "ai.narration",
    outputSchema: narrationBlockTransformOutputSchema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ params, context }) => {
      const parsedParams = narrationTransformParamsSchema.parse(params);
      const loaded = await loadNarrationTransformContext({
        executor: input.database,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        params: parsedParams,
      });
      if (loaded.status !== "ok") throw transformContextError(loaded.status);
      const { context: operationContext } = loaded;
      return {
        variables: {
          mode: operationContext.params.mode,
          instruction: operationContext.params.instruction ?? "",
          currentBlock: JSON.stringify({
            id: operationContext.block.id,
            order: operationContext.block.order,
            text: operationContext.block.text,
            estimatedWords: operationContext.block.estimatedWords,
            revision: operationContext.block.revision,
            generated: operationContext.block.generated,
          }),
          neighborBlocks: JSON.stringify(operationContext.neighbors),
          outlineItem: JSON.stringify(operationContext.outlineItem),
          outlineItemId: operationContext.outlineItem.id,
          wordBudget: JSON.stringify(operationContext.wordBudget),
        },
        context: operationContext,
      };
    },
    deterministicChecks: (value, sourcePackage, operationContext) =>
      assertNarrationBlockTransformChecks(
        value,
        sourcePackage,
        operationContext as NarrationTransformOperationContext | undefined,
      ),
    persistCandidate: (candidate) =>
      persistNarrationBlockCandidate({
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
    ...(input.maxRepairs === undefined
      ? {}
      : { maxRepairs: input.maxRepairs }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  return createModelCallGenerationHandler<NarrationBlockTransformOutput>(
    options,
  );
}

export type { NarrationTransformMode };
