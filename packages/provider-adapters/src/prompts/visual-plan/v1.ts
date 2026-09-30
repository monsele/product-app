import { type PromptDefinition } from "../../prompts.js";

/**
 * ST-110: the bounded visual planner. It chooses among registered
 * compositions and writes short display wording, illustration briefs and
 * narration-anchored beats. Everything it returns is grounded in code
 * (`groundVisualPlanProposal`, `planCinemaDesign`); anything unsupported is
 * dropped, never applied.
 */
export const visualPlanPromptV1: PromptDefinition = {
  kind: "creative-design",
  promptId: "visual-plan",
  version: "v1",
  purpose:
    "Propose per-scene compositions, concise grounded display wording, illustration briefs and narration-anchored visual beats for one video.",
  inputSchema: "VisualPlanInputV1",
  outputSchema: "VisualPlanProposalV1",
  allowedSourceContext:
    "No source document text. Approved scene content and narration, the selected identity, available pictures and the registered composition catalogue only.",
  templateCatalogVersion: "cinema-1.0.0",
  examples: [],
  knownFailureModes: [
    "composition not eligible for the scene",
    "headline adds a word or number not in the scene",
    "beat addresses an element the composition does not show",
    "beat anchored past the end of the narration",
    "illustration brief asks for text, labels or numbers in the picture",
    "CSS, colours, fonts, coordinates or code",
  ],
  evaluationCases: [
    "visual-plan-v1-grounded",
    "visual-plan-v1-drop-unsupported",
  ],
  changelog: "v1: Initial bounded visual planner for ST-110.",
  system: [
    "You are a video art director planning the visuals of a short educational video. Return JSON only.",
    'Shape: {"artDirection"?: {"treatment"?: "flat"|"ink-sketch"|"editorial", "subjects"?: "objects"|"people-and-objects"|"scenes", "humanFigures"?: boolean}, "scenes": [{"sceneId", "compositions": [1-3 ids, best first], "headline"?, "emphasis"?: [up to 3 words], "kicker"?, "illustration"?: {"concept", "description", "subject": "object"|"person"|"place"|"process"} | null, "beats"?: [{"target", "motion", "sentence", "phrase"?}]}]}.',
    "Rules:",
    "- Use each sceneId exactly once, and only ids from the input.",
    "- compositions: choose only ids from that scene's eligibleCompositions; prefer picture-led compositions where hasPicture is true or you give an illustration. Vary families across the video; never the same family three scenes in a row.",
    "- headline (max 160 chars) and kicker (max 40): short display wording built only from words and numbers already in that scene's approved text. Never add a fact, word or figure. Omit them to keep the authored wording.",
    "- emphasis: exact words from the headline or the scene's main text.",
    "- illustration: what one picture should show to explain the scene (concept max 80, description max 300). Describe the subject only. Never ask for text, labels, numbers or logos in the picture. Never give colour codes, fonts, sizes, positions, URLs or style instructions: the shared art direction sets the drawing style. Use null when a picture would not help, and for scenes that already have a picture.",
    "- beats: when each element appears or is emphasised. target must be one of the beatTargets listed with your first-choice composition; motion is one of sequential-reveal, path-build, emphasis, transform; sentence is the 0-based index into that scene's numbered narration; phrase, if given, is an exact phrase from that sentence. Follow the narration order.",
    "- Never return CSS, HTML, code, coordinates, colours, fonts, URLs or rewritten lesson content.",
  ].join("\n"),
  userTemplate:
    "Plan the visuals for this video. The approved content below is fixed; do not change it.\n{{visualPlanInput}}",
};
