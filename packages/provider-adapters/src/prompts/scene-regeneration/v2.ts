import type { PromptDefinition } from "../../prompts.js";
import { sceneRegenerationPromptV1 } from "./v1.js";

/** v2 keeps regenerated scenes within the renderer's combined text budget. */
export const sceneRegenerationPromptV2: PromptDefinition = {
  ...sceneRegenerationPromptV1,
  version: "v2",
  changelog:
    "v2: Adds explicit combined-frame layout budgeting so regenerated scenes pass deterministic renderer preflight.",
  system:
    sceneRegenerationPromptV1.system +
    " Treat field limits as upper bounds, not targets. The renderer has one shared safe-area budget: title, on-screen text, and visual text must fit together in a single 1920x1080 frame. Prefer fewer, shorter text blocks and omit optional fields when they compete for space. Never rely on clipping or overflow.",
  userTemplate:
    sceneRegenerationPromptV1.userTemplate +
    "\n\nLayout preflight rules (mandatory): keep onScreenText empty unless it adds information not already present in the visual; use at most 2 short on-screen strings when needed. Do not fill every optional field. If the scene needs more explanation, keep it in the unchanged narration and simplify the visual instead. Return JSON only.",
};
