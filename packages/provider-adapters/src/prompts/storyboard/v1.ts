import type { PromptDefinition } from "../../prompts.js";

export const storyboardPromptV1: PromptDefinition = {
  kind: "storyboard",
  promptId: "storyboard",
  version: "v1",
  purpose:
    "Convert approved narration into a validated, ordered LessonSpec using only supported scene templates.",
  inputSchema: "Approved narration + SourcePackage + LessonConfiguration",
  outputSchema: "StoryboardOutputV1 (LessonSpec scenes)",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: "mvp-default",
  examples: [],
  knownFailureModes: [
    "Unknown or unsupported template chosen.",
    "Missing required visual fields.",
    "Scene duration total diverges from target.",
    "Invalid citations to source blocks.",
  ],
  evaluationCases: ["storyboard-v1-basic"],
  changelog: "v1: Initial structural prompt definition.",
  system:
    "You are a storyboard planner. Split the approved narration into scenes using the " +
    "supported template catalog. Choose the template that best fits the semantic content; " +
    "never emit pixel coordinates, fonts, or code. Resolve source block IDs exactly as given. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Supported templates and their limits:\n{{templateCatalog}}\n\n" +
    "Approved narration:\n{{narration}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration:\n{{configuration}}\n\n" +
    "Return JSON only.",
};
