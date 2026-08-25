import type { PromptDefinition } from "../../prompts.js";

/**
 * v2: grounded, duration-aware outline planning. The model must return a
 * structured sequence covering every approved objective, citing existing
 * source block IDs, with estimated seconds that fit the target duration
 * tolerance. Application code derives page/section labels and validates
 * coverage, citations, order, and duration.
 */
export const outlinePromptV2: PromptDefinition = {
  kind: "outline",
  promptId: "outline",
  version: "v2",
  purpose:
    "Propose a grounded, duration-aware lesson outline that covers every approved objective and fits the configured target duration.",
  inputSchema: "Approved objectives + SourcePackage + LessonConfiguration",
  outputSchema: "OutlineOutputV1",
  allowedSourceContext:
    "Approved source snapshot package only. Never introduce knowledge from outside the supplied blocks.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Total estimated duration outside the configured tolerance.",
    "An approved objective left uncovered by every outline item.",
    "Outline item cites invented or unsupported source block IDs.",
    "Sequence missing the opening hook or closing summary.",
    "Recall question omitted when the configuration requests one.",
  ],
  evaluationCases: [
    "outline-v1-sequence-quality",
    "outline-v1-objective-coverage",
    "outline-v1-duration-fit",
  ],
  changelog:
    "v2: Real grounded prompt copy for ST-046. Requires a structured sequence (hook first, summary last) where every item maps to approved objective IDs and existing source block IDs, and the total estimated duration lands within the configured tolerance.",
  system:
    "You are an instructional planner creating a lesson outline for learners aged 10-16. " +
    "Work ONLY from the approved objectives and source material below. Every outline item must map to " +
    "the approved objective IDs it teaches and cite the exact source block IDs that support it. " +
    "Never invent objective IDs or source block IDs and never add facts from memory. " +
    "Open with a hook, teach the concept sequence with supporting examples, and close with a summary. " +
    "Allocate estimated seconds so the total fits the target lesson duration. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Approved objectives (with stable IDs):\n{{objectives}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    "Return a JSON object with a schemaVersion of \"outline-v1\", the targetDurationSeconds from the " +
    "configuration, and an ordered items array. Each item must declare a kind (hook, concept, example, " +
    "analogy, summary, or recall_question), a short title, a description of the teaching purpose, the " +
    "approved objectiveIds it covers, the sourceBlockIds that support it, and estimatedSeconds. " +
    "The first item must be a hook, the last a summary, and every approved objective must be covered by " +
    "at least one item. Non-hook items must cite at least one source block. If you use a hook that has " +
    "no direct source support, label it with a framingNote explaining it is a generated framing device. " +
    "The sum of estimatedSeconds must be within the configured duration tolerance. " +
    "If the configuration has includeRecallQuestions true, include a recall_question item. Return JSON only.",
};
