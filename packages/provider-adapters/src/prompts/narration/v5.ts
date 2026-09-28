import type { PromptDefinition } from "../../prompts.js";
import { narrationPromptV4 } from "./v4.js";

/**
 * v5: the v4 narration contract, plus marked direct quotations. Sources such
 * as sermons, statutes and poems contain wording that must be spoken exactly;
 * v4 forbade any eight-word reuse, so the model either mangled a verse or
 * failed the copied-passage check. A quotation is now explicit, attributed,
 * capped, and checked word for word against its one cited block.
 */
export const narrationPromptV5: PromptDefinition = {
  ...narrationPromptV4,
  version: "v5",
  purpose:
    "Generate spoken narration divided by approved outline item, pitched at the configured audience, answering the lesson focus, source-grounded, and paraphrased except for marked, exact quotations.",
  knownFailureModes: [
    ...narrationPromptV4.knownFailureModes,
    "Quotation marked but not word for word from its cited block.",
    "Quotations used in place of explanation.",
  ],
  evaluationCases: [
    ...narrationPromptV4.evaluationCases,
    "narration-v5-marked-quotation",
  ],
  changelog:
    "v5: Adds marked direct quotations (\"quotation\": true, exact words in double quotation marks, one cited block, at most one per block and four per narration) for wording that must stay exact. Every other cited sentence keeps the v4 eight-word paraphrase rule.",
  system:
    "You are a lesson narrator for the learner audience described in the request, in whatever subject the " +
    "lesson configuration names. Write clear spoken sentences that convey one idea at a time, with sentence " +
    "length and vocabulary suited to that audience. Use the source for facts, but express every cited sentence in " +
    "your own words: never reuse eight or more consecutive words from any source block. The only exception is " +
    "a direct quotation of wording that must stay exact, such as a scripture verse, a legal provision, a formal " +
    "definition or a line of a poem: attribute it in the sentence, put the exact source words inside double " +
    "quotation marks, cite only the block it comes from, and set \"quotation\": true. Use at most one quotation " +
    "per block and four in the whole narration, and explain rather than quote everywhere else. Before " +
    "returning the JSON, check each cited sentence that is not a quotation and paraphrase any matching phrase. Do not " +
    "describe visuals or animations. Ground each claim group in the exact source block IDs that " +
    "support it. If you add an analogy, example, illustration, or clarification that is not in " +
    "the source, label it as a generated addition with a rationale. Keep the lesson focus in view when one is " +
    "given. Cover every outline item exactly once. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    narrationPromptV4.userTemplate.replace(
      " A sentence must either ",
      ' A sentence that quotes its source word for word also sets "quotation": true and cites exactly one ' +
        "source block. A sentence must either ",
    ),
};
