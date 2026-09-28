import type { PromptDefinition } from "../../prompts.js";

/**
 * v4 (ST-107): v3 plus the `{{briefCoverage}}` slot. A prompt-to-video run
 * passes the coverage points the user confirmed in the video brief, so the
 * objectives are grounded in what the brief promised. The wizard keeps v3.
 */
export const objectivesPromptV4: PromptDefinition = {
  kind: "objectives",
  promptId: "objectives",
  version: "v4",
  purpose:
    "Propose 3-6 measurable learning objectives that serve the lesson focus at the configured audience level, with grounded planning metadata and a focus-coverage report.",
  inputSchema:
    "SourcePackage + ObjectiveGenerationParams (+ focus, audience, confirmed brief coverage)",
  outputSchema: "ObjectiveOutputV2",
  allowedSourceContext:
    "Approved source snapshot package only. Never introduce knowledge from outside the supplied blocks.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Objective count outside the bounded 3-6 range.",
    "Objective not traceable to any supplied source block ID.",
    "Invented or unsupported source block IDs.",
    "Non-measurable verb (know, understand, learn).",
    "Objectives drift away from the stated focus toward the rest of the document.",
    "focusCoverage reported as covered when the source does not address the focus.",
    "Wording pitched at the wrong audience level or assuming one subject area.",
    "A confirmed brief coverage point with no objective serving it.",
  ],
  evaluationCases: [
    "objectives-v1-faithfulness",
    "objectives-v1-age-appropriateness",
    "objectives-v3-focus-coverage",
    "objectives-v3-subject-neutrality",
    "objectives-v4-brief-coverage",
  ],
  changelog:
    "v4 (ST-107): Adds the {{briefCoverage}} slot. When a prompt-to-video brief was confirmed, every confirmed coverage point should be served by at least one objective that cites blocks supporting it. Otherwise identical to v3.",
  system:
    "You are an instructional designer creating measurable learning objectives for the learner audience " +
    "described in the request, in whatever subject the lesson configuration names. " +
    "Work ONLY from the source material below. Every objective and every planning item must cite the exact " +
    "block IDs that support it from the source material. Never invent block IDs and never add facts from memory. " +
    "When a lesson focus is given, choose objectives that serve that focus and cite only the blocks relevant to it; " +
    "do not cover unrelated parts of the document. Then report honestly whether the source can answer the focus. " +
    "Write measurable outcomes with observable verbs (such as identify, describe, explain, compare, analyse, " +
    "evaluate, apply, calculate, sequence) whose wording and depth match the audience and difficulty. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON; `subject` names the domain):\n{{configuration}}\n\n" +
    "Audience: {{audience}}\n\n" +
    "Lesson focus (\"none\" means cover the approved source as a whole):\n{{focus}}\n\n" +
    "Confirmed video brief coverage points (\"none\" means there is no brief). When present, make sure every " +
    "point is served by at least one objective whose cited blocks support it:\n{{briefCoverage}}\n\n" +
    'Return a JSON object with a schemaVersion of "objectives-v2". Propose between 3 and 6 measurable learning ' +
    "objectives. For each objective provide a statement, a measurable verb, the source block IDs that support it, " +
    "and a confidence between 0 and 1. Then provide supporting planning metadata: key concepts, prerequisite " +
    "knowledge, vocabulary with short definitions, likely misconceptions with corrections, and possible assessment " +
    "questions. Every planning item must cite at least one source block ID. " +
    'Finally provide focusCoverage: {"status":"covered"} when the focus is "none" or the source fully answers it; ' +
    '{"status":"partial","missing":[...]} listing the parts of the focus the source does not address; or ' +
    '{"status":"not_covered","reason":"..."} when the source cannot answer the focus. Even when not covered, still ' +
    "return the best-grounded objectives the source supports. Return JSON only.",
};
