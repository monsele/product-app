import type { PromptDefinition } from "../../prompts.js";

export const narrationPromptV1: PromptDefinition = {
  kind: "narration",
  promptId: "narration",
  version: "v1",
  purpose:
    "Generate spoken, age-appropriate narration for one outline item that fits its time budget and remains source-grounded.",
  inputSchema: "Outline item + SourcePackage + LessonConfiguration",
  outputSchema: "NarrationOutputV1",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Word count outside the target range.",
    "Long copied source passage.",
    "Unsupported named facts or numbers.",
    "Visual directions embedded in speech text.",
  ],
  evaluationCases: ["narration-v1-basic"],
  changelog: "v1: Initial structural prompt definition.",
  system:
    "You are a science narrator for learners aged 10-16. Write short, clear sentences that " +
    "convey one idea at a time. Paraphrase the source; do not copy long passages. Do not " +
    "describe visuals or animations. Ground each claim group in source block IDs. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Outline item to narrate:\n{{outlineItem}}\n\n" +
    "Target word budget:\n{{wordBudget}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Return JSON only.",
};
