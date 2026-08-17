import type { PromptDefinition } from "../../prompts.js";

export const objectivesPromptV1: PromptDefinition = {
  kind: "objectives",
  promptId: "objectives",
  version: "v1",
  purpose:
    "Propose measurable, age-appropriate learning objectives grounded in the approved source package.",
  inputSchema: "SourcePackage + LessonConfiguration",
  outputSchema: "ObjectivesOutputV1",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Objective count outside the bounded range.",
    "Objective not traceable to any source block.",
    "Verb not measurable.",
  ],
  evaluationCases: ["objectives-v1-basic"],
  changelog: "v1: Initial structural prompt definition.",
  system:
    "You are an instructional designer for introductory science lessons for learners aged 10-16. " +
    "Propose measurable learning objectives that are grounded only in the provided source material. " +
    "Return ONLY a JSON object matching the requested schema. Never invent source block IDs.",
  userTemplate:
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration:\n{{configuration}}\n\n" +
    "Propose 3 to 6 measurable learning objectives. Each objective must cite the source " +
    "block IDs that support it. Return JSON only.",
};
