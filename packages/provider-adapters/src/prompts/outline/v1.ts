import type { PromptDefinition } from "../../prompts.js";

export const outlinePromptV1: PromptDefinition = {
  kind: "outline",
  promptId: "outline",
  version: "v1",
  purpose:
    "Propose a grounded, duration-aware lesson outline covering approved objectives.",
  inputSchema: "Approved objectives + SourcePackage + LessonConfiguration",
  outputSchema: "OutlineOutputV1",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Total estimated duration outside tolerance.",
    "Objective left uncovered.",
    "Outline item cites unknown source blocks.",
  ],
  evaluationCases: ["outline-v1-basic"],
  changelog: "v1: Initial structural prompt definition.",
  system:
    "You are an instructional planner. Create an ordered lesson outline that covers every " +
    "approved objective and fits the target duration. Ground each item in the provided source. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Approved objectives:\n{{objectives}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration:\n{{configuration}}\n\n" +
    "Return JSON only.",
};
