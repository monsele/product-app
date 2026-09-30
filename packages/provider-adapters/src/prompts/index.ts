import { type PromptDefinition } from "../prompts.js";
export * from "./audience.js";
import { groundingPromptV1 } from "./grounding/v1.js";
import { groundingPromptV2 } from "./grounding/v2.js";
import { creativeDesignPromptV1 } from "./creative-design/v1.js";
import { visualPlanPromptV1 } from "./visual-plan/v1.js";
import { narrationBlockPromptV1 } from "./narration-block/v1.js";
import { narrationPromptV1 } from "./narration/v1.js";
import { narrationPromptV2 } from "./narration/v2.js";
import { narrationPromptV3 } from "./narration/v3.js";
import { narrationPromptV4 } from "./narration/v4.js";
import { narrationPromptV5 } from "./narration/v5.js";
import { objectivesPromptV1 } from "./objectives/v1.js";
import { objectivesPromptV2 } from "./objectives/v2.js";
import { objectivesPromptV3 } from "./objectives/v3.js";
import { objectivesPromptV4 } from "./objectives/v4.js";
import { outlinePromptV1 } from "./outline/v1.js";
import { outlinePromptV2 } from "./outline/v2.js";
import { outlinePromptV3 } from "./outline/v3.js";
import { sceneRegenerationPromptV1 } from "./scene-regeneration/v1.js";
import { sceneRegenerationPromptV2 } from "./scene-regeneration/v2.js";
import { storyboardPromptV1 } from "./storyboard/v1.js";
import { storyboardPromptV2 } from "./storyboard/v2.js";
import { storyboardPromptV3 } from "./storyboard/v3.js";
import { lessonIntentPromptV1 } from "./lesson-intent/v1.js";
import { oneShotBriefPromptV1 } from "./one-shot-brief/v1.js";

/**
 * The repository's versioned prompt files. Every prompt change must bump a
 * version and update its changelog so downstream input-version keys change.
 */
export const repositoryPrompts: readonly PromptDefinition[] = [
  objectivesPromptV1,
  objectivesPromptV2,
  objectivesPromptV3,
  objectivesPromptV4,
  outlinePromptV1,
  outlinePromptV2,
  outlinePromptV3,
  narrationPromptV1,
  narrationPromptV2,
  narrationPromptV3,
  narrationPromptV4,
  narrationPromptV5,
  narrationBlockPromptV1,
  storyboardPromptV1,
  storyboardPromptV2,
  storyboardPromptV3,
  sceneRegenerationPromptV1,
  sceneRegenerationPromptV2,
  groundingPromptV1,
  groundingPromptV2,
  creativeDesignPromptV1,
  visualPlanPromptV1,
  lessonIntentPromptV1,
  oneShotBriefPromptV1,
];
