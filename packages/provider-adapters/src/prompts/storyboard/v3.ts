import type { PromptDefinition } from "../../prompts.js";
import { storyboardPromptV2 } from "./v2.js";

const scienceShapeGuidance =
  "Prefer shapes-based labelled-diagram visuals (kind 'shapes' with cell, cycle, plant, or system) and " +
  "text-based summary central models, because asset bindings are not available at storyboard time.";
const neutralShapeGuidance =
  "Prefer shapes-based labelled-diagram visuals (kind 'shapes') and text-based summary central models, " +
  "because asset bindings are not available at storyboard time. Choose the generic 'system' or 'cycle' shape " +
  "unless the lesson subject is literally about a cell or a plant.";

if (!storyboardPromptV2.userTemplate.includes(scienceShapeGuidance))
  throw new Error(
    "storyboard/v3 expects the v2 shape guidance it replaces; update v3 when v2 changes.",
  );

/**
 * v3 (ST-104): the v2 storyboard contract (template catalog, narration
 * partition, combined-frame budget) made subject-neutral and audience-aware.
 * The science-leaning shape preference becomes a neutral default, and the
 * on-screen register follows the configured audience and lesson focus.
 */
export const storyboardPromptV3: PromptDefinition = {
  ...storyboardPromptV2,
  version: "v3",
  purpose:
    "Convert the approved narration into a validated, ordered LessonSpec storyboard for any subject, with on-screen text pitched at the configured audience and centred on the lesson focus.",
  inputSchema:
    "Ten-template catalog + approved narration blocks + approved outline + SourcePackage + LessonConfiguration (+ focus, audience)",
  knownFailureModes: [
    ...storyboardPromptV2.knownFailureModes,
    "Subject-specific visual defaults (cells, plants) chosen for an unrelated subject.",
  ],
  evaluationCases: [
    ...storyboardPromptV2.evaluationCases,
    "storyboard-v3-subject-neutrality",
  ],
  changelog:
    "v3 (ST-104): Adds the {{focus}} and {{audience}} slots and replaces the science-leaning shape preference with a subject-neutral default. Layout budgeting rules are unchanged from v2.",
  system:
    storyboardPromptV2.system +
    " Keep on-screen wording at the register of the audience described in the request, and keep visuals " +
    "centred on the lesson focus when one is given. Never assume a subject; the lesson configuration names it.",
  userTemplate:
    "Audience: {{audience}}\n\n" +
    "Lesson focus (\"none\" means storyboard the approved narration as a whole):\n{{focus}}\n\n" +
    storyboardPromptV2.userTemplate.replace(
      scienceShapeGuidance,
      neutralShapeGuidance,
    ),
};
