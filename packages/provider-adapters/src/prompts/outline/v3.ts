import type { PromptDefinition } from "../../prompts.js";
import { outlinePromptV2 } from "./v2.js";

/**
 * v3 (ST-104): the v2 outline contract with the hardcoded learner age range
 * removed, audience-driven pacing, and the lesson focus as the organising
 * question. The output schema is unchanged (OutlineOutputV1).
 */
export const outlinePromptV3: PromptDefinition = {
  ...outlinePromptV2,
  version: "v3",
  purpose:
    "Propose a grounded, duration-aware lesson outline that covers every approved objective, answers the lesson focus, and is pitched at the configured audience.",
  inputSchema:
    "Approved objectives + SourcePackage + LessonConfiguration (+ focus, audience)",
  knownFailureModes: [
    ...outlinePromptV2.knownFailureModes,
    "Outline wanders away from the lesson focus.",
    "Pacing or depth pitched at the wrong audience level.",
  ],
  evaluationCases: [
    ...outlinePromptV2.evaluationCases,
    "outline-v3-focus-fit",
  ],
  changelog:
    "v3 (ST-104): Adds the {{focus}} and {{audience}} slots and removes the hardcoded learner age range; the hook and sequence are organised around the focus when one is given.",
  system:
    "You are an instructional planner creating a lesson outline for the learner audience described in the request, " +
    "in whatever subject the lesson configuration names. " +
    "Work ONLY from the approved objectives and source material below. Every outline item must map to " +
    "the approved objective IDs it teaches and cite the exact source block IDs that support it. " +
    "Never invent objective IDs or source block IDs and never add facts from memory. " +
    "When a lesson focus is given, open with a hook that frames the focus and sequence the concepts so the " +
    "lesson answers it. Otherwise open with a hook, teach the concept sequence with supporting examples, and " +
    "close with a summary. Match depth and pacing to the audience. " +
    "Allocate estimated seconds so the total fits the target lesson duration. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Audience: {{audience}}\n\n" +
    "Lesson focus (\"none\" means teach the approved objectives as a whole):\n{{focus}}\n\n" +
    outlinePromptV2.userTemplate,
};
