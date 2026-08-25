import { type PromptDefinition } from "../prompts.js";
import { groundingPromptV1 } from "./grounding/v1.js";
import { groundingPromptV2 } from "./grounding/v2.js";
import { narrationBlockPromptV1 } from "./narration-block/v1.js";
import { narrationPromptV1 } from "./narration/v1.js";
import { narrationPromptV2 } from "./narration/v2.js";
import { objectivesPromptV1 } from "./objectives/v1.js";
import { objectivesPromptV2 } from "./objectives/v2.js";
import { outlinePromptV1 } from "./outline/v1.js";
import { outlinePromptV2 } from "./outline/v2.js";
import { sceneRegenerationPromptV1 } from "./scene-regeneration/v1.js";
import { storyboardPromptV1 } from "./storyboard/v1.js";

/**
 * The repository's versioned prompt files. Every prompt change must bump a
 * version and update its changelog so downstream input-version keys change.
 */
export const repositoryPrompts: readonly PromptDefinition[] = [
  objectivesPromptV1,
  objectivesPromptV2,
  outlinePromptV1,
  outlinePromptV2,
  narrationPromptV1,
  narrationPromptV2,
  narrationBlockPromptV1,
  storyboardPromptV1,
  sceneRegenerationPromptV1,
  groundingPromptV1,
  groundingPromptV2,
];
