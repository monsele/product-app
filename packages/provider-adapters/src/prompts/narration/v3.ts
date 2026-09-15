import type { PromptDefinition } from "../../prompts.js";

/**
 * v3: makes the deterministic copied-passage rule explicit. The source remains
 * the authority for claims and citations, but narration must use its own words.
 */
export const narrationPromptV3: PromptDefinition = {
  kind: "narration",
  promptId: "narration",
  version: "v3",
  purpose:
    "Generate spoken, age-appropriate narration divided by approved outline item that fits each item's time budget, stays source-grounded, and paraphrases cited source material.",
  inputSchema:
    "Approved outline + per-item word budgets + SourcePackage + LessonConfiguration",
  outputSchema: "NarrationOutputV1",
  allowedSourceContext:
    "Approved source snapshot package only. Never introduce knowledge from outside the supplied blocks.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "A narration block word count outside its outline item's target range.",
    "Eight or more consecutive source words copied verbatim into a cited sentence.",
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
    "v3: States the eight-consecutive-word copying limit and requires a per-sentence paraphrase check before returning cited narration.",
  system:
    "You are a science narrator for learners aged 10-16. Write short, clear sentences that " +
    "convey one idea at a time. Use the source for facts, but express every cited sentence in " +
    "your own words: never reuse eight or more consecutive words from any source block. Before " +
    "returning the JSON, check each cited sentence and paraphrase any matching phrase. Do not " +
    "describe visuals or animations. Ground each claim group in the exact source block IDs that " +
    "support it. If you add an analogy, example, illustration, or clarification that is not in " +
    "the source, label it as a generated addition with a rationale. Cover every outline item exactly " +
    "once. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Approved outline items to narrate (with stable IDs):\n{{outline}}\n\n" +
    "Per-item target word budgets:\n{{wordBudgets}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    'Return a JSON object with a schemaVersion of "narration-v1", the targetDurationSeconds from ' +
    "the configuration, and a blocks array with exactly one entry per approved outline item. " +
    "Each block must declare the outlineItemId and an ordered sentences array. Each sentence has text, " +
    "the sourceBlockIds that support it (or an empty list), and optionally a generatedAddition object " +
    "with kind (analogy, example, illustration, or clarification) and a rationale. A sentence must either " +
    "cite at least one source block OR be labelled as a generated addition, never both. Keep sentences " +
    "short and each block's total word count within its target budget. Return JSON only.",
};
