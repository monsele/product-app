import { type PromptDefinition } from "../../prompts.js";

/** ST-097: bounded interpretation only; the model cannot author a scene. */
export const creativeDesignPromptV1: PromptDefinition = {
  kind: "creative-design",
  promptId: "creative-design",
  version: "v1",
  purpose:
    "Translate an explicit teacher design request into supported bounded overrides.",
  inputSchema: "CreativeDesignInterpretationInputV1",
  outputSchema: "CreativeDesignProposalPatchV1",
  allowedSourceContext:
    "No source text. The request and resolved creative manifest only.",
  templateCatalogVersion: "st-101-planner-v1",
  examples: [],
  knownFailureModes: [
    "arbitrary CSS",
    "new fonts",
    "asset URLs",
    "content rewriting",
    "pixel coordinates",
  ],
  evaluationCases: [
    "creative-design-v1-supported",
    "creative-design-v1-reject-arbitrary-style",
  ],
  changelog: "v1: Initial bounded personalisation interpreter for ST-097.",
  system:
    "Return JSON only. You may set only motionEnergy, imageryPreference, captionPreset, colors, and fontPair. Never return CSS, code, coordinates, URLs, logo IDs, treatment IDs, source text, or rewritten educational content. Omit unsupported requests.",
  userTemplate:
    "Interpret this bounded design request against the registered manifest. Preserve lesson content.\n{{creativeDesignInput}}",
};
