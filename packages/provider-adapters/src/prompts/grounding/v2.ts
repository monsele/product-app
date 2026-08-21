import type { PromptDefinition } from "../../prompts.js";

/**
 * v2: batch grounding recheck for ST-053. The model receives an array of
 * segmented claims (each with a stable id, text, and optional generated-addition
 * label) plus the bounded source package, and returns one result per claim:
 * supported, unsupported, generated_addition, or needs_review, with precise
 * unsupported spans. Application code enforces deterministic source-ID rules
 * and the claim/status consistency rules afterwards.
 */
export const groundingPromptV2: PromptDefinition = {
  kind: "grounding",
  promptId: "grounding",
  version: "v2",
  purpose:
    "Recheck whether edited narration/on-screen claims are supported by the cited approved source snapshot after teacher edits, classifying each claim as supported, unsupported, generated_addition, or needs_review.",
  inputSchema: "Array of claims (id, text, optional generatedAddition) + SourcePackage + scope",
  outputSchema: "GroundingOutputV1 (grounding-v1)",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Marking unsupported content as supported.",
    "Ignoring partial support for spans.",
    "Dropping claims from the output.",
    "Adding claims that were not requested.",
    "Classifying a teacher-labelled generated addition as supported.",
    "Citing source blocks outside the provided package.",
    "Reporting generated additions with source citations.",
  ],
  evaluationCases: ["grounding-v2-batch", "grounding-v2-generated-addition"],
  changelog:
    "v2: Batch claim grounding for ST-053. Replaces the single-claim v1 template with an array of segmented claims and per-claim result objects. The schema version is grounding-v1.",
  system:
    "You are a source-grounding judge for an educational lesson. Compare each claim against ONLY the cited source blocks " +
    "in the provided source package. For every claim, decide whether the source supports it. " +
    "Report unsupported spans precisely; do not attach the nearest paragraph to an unsupported claim. " +
    "A claim labelled as a generated addition (analogy, example, illustration, or clarification added by the teacher) " +
    "must be classified as generated_addition and must never cite source blocks. " +
    "Do not invent, drop, reorder, or reword any claim. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Scope of this check: {{scope}}\n\n" +
    "Claims to check (each has an id, the exact text, and an optional generatedAddition label):\n{{claims}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    'Return a JSON object with a schemaVersion of "grounding-v1" and a "results" array with EXACTLY one entry per claim id from the input, in the same order. ' +
    "Each result has: claimId (the input claim id), status (supported, unsupported, generated_addition, or needs_review), " +
    "supportedSpans (array of { start, end, sourceBlockId } character offsets into the claim text that the source supports), and " +
    "unsupportedSpans (array of { start, end, reason } character offsets that the source does not support, with a short reason). " +
    "Use needs_review only for genuinely ambiguous partial support. Use generated_addition only when the claim carries a generatedAddition label. " +
    "Never attach a citation to a claim that the source does not support. Return JSON only.",
};
