import type { PromptDefinition } from "../../prompts.js";

/**
 * v2: grounded, duration-aware narration for ST-048. The model must return one
 * spoken narration block per approved outline item, written as short
 * age-appropriate sentences, citing existing source block IDs or labelling
 * AI-added analogies/examples as generated additions. Application code derives
 * page/section labels, word counts, and validates coverage, citations,
 * sentence length, copying, and duration fit.
 */
export const narrationPromptV2: PromptDefinition = {
  kind: "narration",
  promptId: "narration",
  version: "v2",
  purpose:
    "Generate spoken, age-appropriate narration divided by approved outline item that fits each item's time budget and stays source-grounded.",
  inputSchema: "Approved outline + per-item word budgets + SourcePackage + LessonConfiguration",
  outputSchema: "NarrationOutputV1",
  allowedSourceContext:
    "Approved source snapshot package only. Never introduce knowledge from outside the supplied blocks.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "A narration block word count outside its outline item's target range.",
    "Long verbatim passage copied from the source.",
    "Sentence far too long for the learner age band.",
    "Unsupported named facts or numbers.",
    "Invented or unsupported source block IDs.",
    "Visual directions embedded in speech text.",
    "An approved outline item left without a narration block.",
  ],
  evaluationCases: [
    "narration-v1-basic",
    "narration-v1-clarity",
    "narration-v1-age-appropriateness",
  ],
  changelog:
    "v2: Real grounded prompt copy for ST-048. Requires one block per approved outline item, spoken sentences with existing source block IDs (or explicit generated-addition labels), and word counts within each item's budget.",
  system:
    "You are a science narrator for learners aged 10-16. Write short, clear sentences that " +
    "convey one idea at a time. Paraphrase the source; do not copy long passages verbatim. " +
    "Do not describe visuals or animations. Ground each claim group in the exact source block IDs " +
    "that support it. If you add an analogy, example, illustration, or clarification that is not in " +
    "the source, label it as a generated addition with a rationale. Cover every outline item exactly " +
    "once. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Approved outline items to narrate (with stable IDs):\n{{outline}}\n\n" +
    "Per-item target word budgets:\n{{wordBudgets}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    "Return a JSON object with a schemaVersion of \"narration-v1\", the targetDurationSeconds from " +
    "the configuration, and a blocks array with exactly one entry per approved outline item. " +
    "Each block must declare the outlineItemId and an ordered sentences array. Each sentence has text, " +
    "the sourceBlockIds that support it (or an empty list), and optionally a generatedAddition object " +
    "with kind (analogy, example, illustration, or clarification) and a rationale. A sentence must either " +
    "cite at least one source block OR be labelled as a generated addition, never both. Keep sentences " +
    "short and each block's total word count within its target budget. Return JSON only.",
};
