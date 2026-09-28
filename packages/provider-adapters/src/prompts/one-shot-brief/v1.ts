import type { PromptDefinition } from "../../prompts.js";

/**
 * v1 (ST-107): the prompt-to-video brief. Before any paid generation, it plans
 * what the video will cover (with the document sections behind each point),
 * what it will leave out, how many scenes it needs, and which registered style
 * pack and sound bed suit it. It supersedes `lesson-intent/v1` for runs with a
 * brief and returns the same subject and title fields.
 *
 * The model only chooses from closed lists that the request supplies: section
 * IDs from the outline, the registered style packs, and the active sound-bed
 * tracks. The output schema rejects anything else. The model never produces a
 * cost; the estimate is computed deterministically from `plannedSceneCount`.
 */
export const oneShotBriefPromptV1: PromptDefinition = {
  kind: "one-shot-brief",
  promptId: "one-shot-brief",
  version: "v1",
  purpose:
    "Plan a short explainer video from a focus prompt and a document outline: coverage points with their source sections, what is left out, a scene count, and a style pack and sound bed chosen from closed lists with reasons.",
  inputSchema:
    "Focus prompt + audience + target duration + document outline (title, section IDs, headings, each section's first block) + style packs + sound-bed tracks",
  outputSchema: "OneShotBriefOutputV1",
  allowedSourceContext:
    "The focus prompt, the document title, section headings and the first block of each section only. Never the rest of the body text.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Coverage point citing a section ID that is not in the outline.",
    "Coverage that drifts away from the focus toward the rest of the document.",
    "A style pack or sound-bed track that is not in the supplied lists.",
    "A scene count outside the stated range for the target duration.",
    "Promising coverage the listed sections cannot support.",
  ],
  evaluationCases: [
    "one-shot-brief-v1-section-ids",
    "one-shot-brief-v1-focus-fit",
    "one-shot-brief-v1-closed-choices",
  ],
  changelog:
    "v1 (ST-107): First version. Returns subject, lessonTitle, coverage points with sectionIds, notCovered, plannedSceneCount, stylePackId and soundBed, each choice with a short reason.",
  system:
    "You plan short explainer videos built only from a learner's own document. Given what the learner wants " +
    "explained, who it is for, the target length, and an outline of the document (section IDs, headings and each " +
    "section's opening text), decide what the video will cover and what it will leave out. Every coverage point " +
    "must name the section IDs from the outline that support it; never invent a section ID and never promise " +
    "something the listed sections do not support. Choose exactly one style pack and one sound bed from the " +
    "lists supplied (or \"none\" for the sound bed), each with a short reason tied to the content and audience. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "What the learner wants the video to explain:\n{{focus}}\n\n" +
    "Audience: {{audience}}\n\n" +
    "Target length: {{targetDurationSeconds}} seconds. Plan between {{minScenes}} and {{maxScenes}} scenes.\n\n" +
    "Document outline (JSON; cite sections by sectionId):\n{{documentOutline}}\n\n" +
    "Style packs you may choose from (JSON):\n{{stylePacks}}\n\n" +
    'Sound-bed tracks you may choose from (JSON; or "none"):\n{{soundBeds}}\n\n' +
    'Return a JSON object with a schemaVersion of "one-shot-brief-v1" and these fields: subject (the discipline, in a ' +
    "few words), lessonTitle (at most ten words, not a question), coverage (2 to 8 points, each " +
    '{"point": "...", "sectionIds": ["..."]}), notCovered (parts of the request or document the video will leave ' +
    "out; may be empty), plannedSceneCount, stylePackId, stylePackReason (at most 200 characters), soundBed (a " +
    'trackId or "none"), and soundBedReason (at most 200 characters). Return JSON only.',
};
