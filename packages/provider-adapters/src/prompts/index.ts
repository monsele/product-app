import { type PromptDefinition } from "../prompts.js";
import { groundingPromptV1 } from "./grounding/v1.js";
import { narrationPromptV1 } from "./narration/v1.js";
import { objectivesPromptV1 } from "./objectives/v1.js";
import { outlinePromptV1 } from "./outline/v1.js";
import { storyboardPromptV1 } from "./storyboard/v1.js";

/**
 * The repository's versioned prompt files. Every prompt change must bump a
 * version and update its changelog so downstream input-version keys change.
 */
export const repositoryPrompts: readonly PromptDefinition[] = [
  objectivesPromptV1,
  outlinePromptV1,
  narrationPromptV1,
  storyboardPromptV1,
  groundingPromptV1,
];
