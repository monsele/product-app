import type { PromptDefinition } from "../../prompts.js";

/**
 * v1: validated LessonSpec storyboard generation for ST-050. The model must
 * split the approved narration into ordered scenes, each choosing one of the
 * ten supported templates with template-specific visual data, on-screen text,
 * an estimated duration, a transition, source citations, and planned asset
 * requirements. Application code assigns stable IDs/order, derives narration
 * text from the assigned narration blocks, allocates durations to the exact
 * lesson target, resolves citations, and rejects any unsupported template or
 * over-limit content before persistence.
 */
export const storyboardPromptV1: PromptDefinition = {
  kind: "storyboard",
  promptId: "storyboard",
  version: "v1",
  purpose:
    "Convert the approved narration into a validated, ordered LessonSpec storyboard using only the ten supported scene templates.",
  inputSchema:
    "Ten-template catalog + approved narration blocks + approved outline + SourcePackage + LessonConfiguration",
  outputSchema: "StoryboardOutputV1 (storyboard-v1)",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: "mvp-default",
  examples: [],
  knownFailureModes: [
    "Unknown or unsupported template chosen.",
    "Narration blocks assigned to more than one scene or left out.",
    "Scene narration text invented instead of using the approved narration.",
    "Missing required visual fields or over-limit text/items.",
    "Asset-dependent visuals chosen before assets are approved.",
    "Scene duration total diverges from the lesson target.",
    "Invalid citations to source blocks outside the package.",
    "Pixel coordinates, fonts, or code embedded in scene output.",
  ],
  evaluationCases: [
    "storyboard-v1-basic",
    "storyboard-v1-template-fit",
    "storyboard-v1-visual-variety",
  ],
  changelog:
    "v1: Real grounded prompt copy for ST-050. Requires ordered scenes that partition the approved narration blocks, one of ten supported templates per scene, source citations, planned asset requirements, and a scene duration total that matches the lesson target.",
  system:
    "You are a storyboard planner turning an approved, spoken narration into visual scenes. " +
    "Choose only from the supported template catalog and fill exactly the fields each template defines. " +
    "Never emit pixel coordinates, fonts, CSS, animation frames, or code; the renderer owns all layout. " +
    "Split the approved narration into ordered scenes, assigning every narration block to exactly one scene " +
    "and preserving narration order. Do not invent narration text. Cite the source block IDs that support " +
    "each scene, or label added analogies, examples, illustrations, or clarifications as generated additions. " +
    "Plan missing visual assets as requirements with a slot name and purpose; never invent public URLs or fake asset IDs. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Supported template catalog with field limits and guidance:\n{{templateCatalog}}\n\n" +
    "Approved narration blocks (stable IDs, in order):\n{{narration}}\n\n" +
    "Approved outline items (pedagogical purpose per block):\n{{outline}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    "Return a JSON object with a schemaVersion of \"storyboard-v1\", the targetDurationSeconds from the " +
    "configuration, and a scenes array. Each scene declares: template (one of the catalog templates), " +
    "an optional title, narrationBlockIds (the ordered subset of approved narration block IDs this scene " +
    "covers; together the scenes must cover every block exactly once in order), onScreenText (up to 12 short " +
    "strings), visual (exactly the fields for the chosen template within its limits), estimatedSeconds " +
    "(3-60, and the total should approximate the target duration), transition (cut, fade, or slide), " +
    "sourceBlockIds (the source blocks that support this scene), generatedAdditions (only for content not in " +
    "the source, each with kind analogy/example/illustration/clarification and a rationale), and " +
    "assetRequirements (planned slots with a slot name and purpose for visuals that need an asset later). " +
    "Every scene must cite at least one source block; generated additions are optional labels for content not in " +
    "the source. Prefer shapes-based labelled-diagram visuals (kind 'shapes' with cell, cycle, plant, or system) and " +
    "text-based summary central models, because asset bindings are not available at storyboard time. " +
    "Return JSON only.",
};
