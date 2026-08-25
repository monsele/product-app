import type { PromptDefinition } from "../../prompts.js";

/**
 * v1: one-block narration transform for ST-049. The model rewrites exactly the
 * selected block in the requested mode (shorten, simplify, expand, or
 * regenerate) using the bounded source package, the approved outline item,
 * and the neighboring narration blocks for continuity. Application code
 * revalidates the block deterministically (word budget, sentence length,
 * citation resolution, copied passages, and mode direction) before it becomes
 * a candidate.
 */
export const narrationBlockPromptV1: PromptDefinition = {
  kind: "narration",
  promptId: "narration-block",
  version: "v1",
  purpose:
    "Rewrite exactly one narration block in a requested mode without changing the rest of the lesson.",
  inputSchema:
    "Selected narration block + transform mode + optional instruction + neighboring narration + outline item + SourcePackage + LessonConfiguration",
  outputSchema: "NarrationBlockTransformOutputV1",
  allowedSourceContext:
    "Approved source snapshot package only. Never introduce knowledge from outside the supplied blocks.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "A rewritten block word count outside the outline item's target range.",
    "Mode direction violated (shorten longer than the current block, expand shorter).",
    "Long verbatim passage copied from the source.",
    "Sentence far too long for the learner age band.",
    "Invented or unsupported source block IDs.",
    "Visual directions embedded in speech text.",
    "Rewriting blocks other than the selected one.",
  ],
  evaluationCases: [
    "narration-block-v1-mode",
    "narration-block-v1-groundedness",
  ],
  changelog:
    "v1: Block-transform prompt for ST-049. Rewrites only the selected block in one of four modes with neighboring narration for continuity and grounded citations.",
  system:
    "You are a science narrator for learners aged 10-16 who rewrites ONE narration block " +
    "at a time. Keep the selected outline item's purpose and the neighboring narration's " +
    "tone and flow. Paraphrase the source; do not copy long passages. Write short, clear " +
    "sentences that convey one idea at a time. Ground each claim group in the exact source " +
    "block IDs that support it. If you add an analogy, example, illustration, or " +
    "clarification that is not in the source, label it as a generated addition with a " +
    "rationale. Never describe visuals or animations. Return ONLY a JSON object matching " +
    "the requested schema, containing exactly one block for the selected outline item.",
  userTemplate:
    "Mode: {{mode}}\n\n" +
    "Teacher instruction (may be empty):\n{{instruction}}\n\n" +
    "The current narration block to rewrite (outline item {{outlineItemId}}):\n{{currentBlock}}\n\n" +
    "Neighboring narration blocks for continuity (before and after the selected block):\n{{neighborBlocks}}\n\n" +
    "Approved outline item this block must narrate:\n{{outlineItem}}\n\n" +
    "Target word budget for the block:\n{{wordBudget}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    "Return a JSON object with schemaVersion \"narration-block-v1\", the requested mode, " +
    "and a block with the selected outlineItemId and an ordered sentences array. Each " +
    "sentence has text, the sourceBlockIds that support it (or an empty list), and " +
    "optionally a generatedAddition object with kind and rationale. A sentence must either " +
    "cite at least one source block OR be labelled as a generated addition, never both. " +
    "Keep the block's total word count within its target budget. Return JSON only.",
};
