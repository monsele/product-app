import type { PromptDefinition } from "../../prompts.js";

/**
 * v1: one-scene regeneration for ST-051. The model receives the current scene,
 * its neighbors (read-only context), the narration blocks the scene covers,
 * the outline items, and the bounded source package, and returns exactly one
 * regenerated scene in the requested mode. Application code preserves the
 * narration-block assignment, stable IDs, order, and the rest of the
 * storyboard; the teacher compares before/after and applies the candidate.
 */
export const sceneRegenerationPromptV1: PromptDefinition = {
  kind: "storyboard",
  promptId: "scene-regeneration",
  version: "v1",
  purpose:
    "Regenerate exactly one storyboard scene (template, visual, on-screen text, transition, citations) without touching any other scene.",
  inputSchema:
    "Current scene + neighboring scenes + narration blocks + outline items + SourcePackage + LessonConfiguration + mode",
  outputSchema: "SceneRegenerationOutputV1 (scene-regeneration-v1)",
  allowedSourceContext: "Approved source snapshot package only.",
  templateCatalogVersion: "mvp-default",
  examples: [],
  knownFailureModes: [
    "More than one scene returned.",
    "Narration blocks re-assigned or changed.",
    "Unknown or unsupported template chosen.",
    "Neighboring scene content copied or modified.",
    "Missing required visual fields or over-limit text/items.",
    "Asset-dependent visuals chosen before assets are approved.",
    "Invalid citations to source blocks outside the package.",
    "Pixel coordinates, fonts, or code embedded in scene output.",
    "Scene changed in a way that contradicts the requested mode.",
  ],
  evaluationCases: [
    "scene-regeneration-v1-isolation",
    "scene-regeneration-v1-template-fit",
    "scene-regeneration-v1-continuity",
  ],
  changelog:
    "v1: Real grounded prompt copy for ST-051. Requires exactly one scene using the ten-template catalog, unchanged narration-block assignment, source citations, and the current scene plus neighbors as read-only continuity context.",
  system:
    "You are a storyboard scene editor improving one scene of an existing, approved lesson. " +
    "Return exactly ONE scene matching the requested mode. Keep the narrationBlockIds of the scene you are improving. " +
    "Never change, reorder, or copy content from neighboring scenes; they are read-only context for continuity. " +
    "Choose only from the supported template catalog and fill exactly the fields each template defines. " +
    "Never emit pixel coordinates, fonts, CSS, animation frames, or code; the renderer owns all layout. " +
    "Cite the source block IDs that support the scene, or label added analogies, examples, illustrations, or clarifications as generated additions. " +
    "Plan missing visual assets as requirements with a slot name and purpose; never invent public URLs or fake asset IDs. " +
    "Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "Supported template catalog with field limits and guidance:\n{{templateCatalog}}\n\n" +
    "Current scene (the one to improve):\n{{currentScene}}\n\n" +
    "Neighboring scenes (read-only context for continuity — never modify or copy them):\n{{neighborScenes}}\n\n" +
    "Narration blocks this scene covers (unchanged):\n{{narrationBlocks}}\n\n" +
    "Outline items with pedagogical purpose:\n{{outline}}\n\n" +
    "Source material (machine-readable blocks with stable IDs):\n{{sourcePackage}}\n\n" +
    "Lesson configuration (JSON):\n{{configuration}}\n\n" +
    "Regeneration mode: {{mode}}\n" +
    "{{instruction}}\n\n" +
    'Return a JSON object with a schemaVersion of "scene-regeneration-v1", the requested mode, and exactly one scene object. ' +
    "The scene declares: template (one of the catalog templates), narrationBlockIds (MUST equal the current scene's narrationBlockIds — do not change the narration assignment), " +
    "an optional title, onScreenText (up to 12 short strings), visual (exactly the fields for the chosen template within its limits), " +
    "estimatedSeconds (3-60), transition (cut, fade, or slide), sourceBlockIds (the source blocks that support this scene), " +
    "generatedAdditions (only for content not in the source, each with kind analogy/example/illustration/clarification and a rationale), and " +
    "assetRequirements (planned slots with a slot name and purpose). Every scene must cite at least one source block; " +
    "generated additions are optional labels for content not in the source. Prefer shapes-based labelled-diagram visuals " +
    "(kind 'shapes' with cell, cycle, plant, or system) and text-based summary central models. Return JSON only.",
};
