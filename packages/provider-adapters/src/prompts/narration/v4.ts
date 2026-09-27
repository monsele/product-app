import type { PromptDefinition } from "../../prompts.js";
import { narrationPromptV3 } from "./v3.js";

/**
 * v4 (ST-104): the v3 narration contract (paraphrase rule, grounding, one
 * block per outline item) with the "science narrator for learners aged 10-16"
 * identity replaced by a subject-neutral narrator whose register follows the
 * configured audience and difficulty, and the lesson focus kept in view.
 */
export const narrationPromptV4: PromptDefinition = {
  ...narrationPromptV3,
  version: "v4",
  purpose:
    "Generate spoken narration divided by approved outline item, pitched at the configured audience, answering the lesson focus, source-grounded, and paraphrased.",
  inputSchema:
    "Approved outline + per-item word budgets + SourcePackage + LessonConfiguration (+ focus, audience)",
  knownFailureModes: [
    ...narrationPromptV3.knownFailureModes.filter(
      (mode) => mode !== "Sentence far too long for the learner age band.",
    ),
    "Sentence length or vocabulary wrong for the configured audience.",
    "Narration drifts away from the lesson focus.",
  ],
  evaluationCases: [
    ...narrationPromptV3.evaluationCases,
    "narration-v4-audience-register",
  ],
  changelog:
    "v4 (ST-104): Subject-neutral lesson narrator; adds the {{focus}} and {{audience}} slots and removes the science-only identity and the hardcoded learner age range. The eight-word copying limit and grounding rules are unchanged from v3.",
  system:
    "You are a lesson narrator for the learner audience described in the request, in whatever subject the " +
    "lesson configuration names. Write clear spoken sentences that convey one idea at a time, with sentence " +
    "length and vocabulary suited to that audience. Use the source for facts, but express every cited sentence in " +
    "your own words: never reuse eight or more consecutive words from any source block. Before " +
    "returning the JSON, check each cited sentence and paraphrase any matching phrase. Do not " +
    "describe visuals or animations. Ground each claim group in the exact source block IDs that " +
    "support it. If you add an analogy, example, illustration, or clarification that is not in " +
    "the source, label it as a generated addition with a rationale. Keep the lesson focus in view when one is " +
    "given. Cover every outline item exactly once. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Audience: {{audience}}\n\n" +
    "Lesson focus (\"none\" means narrate the approved outline as a whole):\n{{focus}}\n\n" +
    narrationPromptV3.userTemplate,
};
