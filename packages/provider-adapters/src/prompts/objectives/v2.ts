import type { PromptDefinition } from "../../prompts.js";

/**
 * v2: grounded, bounded objective generation with instructional planning
 * metadata. Block IDs are the only citation currency: the model must return
 * existing block IDs and application code derives page/section labels.
 */
export const objectivesPromptV2: PromptDefinition = {
  kind: "objectives",
  promptId: "objectives",
  version: "v2",
  purpose:
    "Propose 3-6 measurable, age-appropriate learning objectives and grounded instructional planning metadata from the approved source package.",
  inputSchema: "SourcePackage + ObjectiveGenerationParams",
  outputSchema: "ObjectiveOutputV1",
  allowedSourceContext:
    "Approved source snapshot package only. Never introduce knowledge from outside the supplied blocks.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Objective count outside the bounded 3-6 range.",
    "Objective not traceable to any supplied source block ID.",
    "Invented or unsupported source block IDs.",
    "Non-measurable verb (know, understand, learn).",
    "Planning items (concepts, vocabulary, misconceptions, questions) without source block support.",
  ],
  evaluationCases: [
    "objectives-v1-faithfulness",
    "objectives-v1-age-appropriateness",
  ],
  changelog:
    "v2: Real grounded prompt copy for ST-044. Requires 3-6 measurable objectives each citing existing source block IDs; returns planning metadata (key concepts, prerequisites, vocabulary, misconceptions, assessment questions) all grounded in supplied blocks.",
  system:
    "You are an instructional designer creating measurable learning objectives for learners aged 10-16. " +
    "Work ONLY from the source material below. Every objective and every planning item must cite the exact " +
    "block IDs that support it from the source material. Never invent block IDs and never add facts from memory. " +
    "Write measurable outcomes (use observable verbs such as identify, describe, explain, compare, predict, " +
    "calculate, sequence) whose wording and complexity match the learner age band and tone in the lesson " +
    "configuration. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    "Propose between 3 and 6 measurable learning objectives. For each objective provide a statement, a " +
    "measurable verb, the source block IDs that support it, and a confidence between 0 and 1. Then provide " +
    "supporting planning metadata: key concepts, prerequisite knowledge, vocabulary with short definitions, " +
    "likely misconceptions with corrections, and possible assessment questions. Every planning item must cite " +
    "at least one source block ID. Return JSON only.",
};
