import type { PromptDefinition } from "../../prompts.js";
import { storyboardPromptV1 } from "./v1.js";

/**
 * v2 adds the renderer's combined text budget to storyboard planning. Field
 * limits alone are not enough: title, on-screen text, and visual labels share
 * the same safe area and must fit together in one frame.
 */
export const storyboardPromptV2: PromptDefinition = {
  ...storyboardPromptV1,
  version: "v2",
  changelog:
    "v2: Adds explicit combined-frame layout budgeting and tells the planner to keep optional on-screen text sparse so generated scenes pass deterministic renderer preflight.",
  system:
    storyboardPromptV1.system +
    " Treat the template catalog's text limits as upper bounds, not targets. " +
    "The renderer has one shared safe-area budget per scene: title, on-screen text, and visual text are shown together. " +
    "Prefer fewer, shorter text blocks; omit optional title, prompt, example, call-to-action, and on-screen text when they would compete with the visual. " +
    "Every scene must remain readable at the fixed 1920x1080 canvas without relying on clipping or overflow.",
  userTemplate:
    storyboardPromptV1.userTemplate +
    "\n\nLayout preflight rules (mandatory): keep onScreenText empty unless it adds information not already present in the visual; use at most 2 short on-screen strings when needed. " +
    "Do not fill every optional field. Keep each visual phrase brief and make the complete scene fit as one readable frame. " +
    "If a concept needs more text, split it across narration blocks/scenes instead of packing one scene. Return JSON only.",
};
