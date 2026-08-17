import type { PromptDefinition } from "../../prompts.js";

export const groundingPromptV1: PromptDefinition = {
  kind: "grounding",
  promptId: "grounding",
  version: "v1",
  purpose:
    "Recheck whether a claim or generated text is supported by cited source blocks after teacher edits.",
  inputSchema: "Claim + cited source blocks",
  outputSchema: "GroundingOutputV1",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Marking unsupported content as supported.",
    "Ignoring partial support for spans.",
  ],
  evaluationCases: ["grounding-v1-basic"],
  changelog: "v1: Initial structural prompt definition.",
  system:
    "You are a source-grounding judge. Compare each claim against only the cited source " +
    "blocks. Report unsupported spans precisely; do not attach the nearest paragraph to an " +
    "unsupported claim. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Claim to check:\n{{claim}}\n\n" +
    "Cited source blocks:\n{{sourcePackage}}\n\n" +
    "Return JSON only.",
};
