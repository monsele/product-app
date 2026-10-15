import type { PromptDefinition } from "../../prompts.js";
import { sceneRegenerationPromptV2 } from "./v2.js";

/**
 * v3 (ST-114): the v2 regeneration contract plus data charts. The request
 * lists the approved tables with a numeric column (`{{tables}}`); the
 * catalogue offers `data-chart` only when one is listed, and a chart visual
 * references cells by index without ever carrying a number. v1 and v2 are
 * unchanged.
 */
export const sceneRegenerationPromptV3: PromptDefinition = {
  ...sceneRegenerationPromptV2,
  version: "v3",
  inputSchema:
    "Current scene + neighbors + narration blocks + outline items + SourcePackage + chart-eligible tables + LessonConfiguration + mode",
  knownFailureModes: [
    ...sceneRegenerationPromptV2.knownFailureModes,
    "Numbers written into a chart visual instead of column and row references.",
    "A chart over a non-numeric column, or over a table that was not listed.",
  ],
  evaluationCases: [
    ...sceneRegenerationPromptV2.evaluationCases,
    "scene-regeneration-v3-chart-fit-table",
    "scene-regeneration-v3-chart-non-fit-table",
  ],
  changelog:
    "v3 (ST-114): Adds the {{tables}} slot and the data-chart template, which references table cells by index and never carries numbers. Everything else is unchanged from v2.",
  system:
    sceneRegenerationPromptV2.system +
    " A data-chart scene may chart only a listed table: choose bar to compare categories and line for a trend; its visual " +
    "holds only tableId, column and row indexes, an optional highlighted row index and a unit label without digits.",
  userTemplate:
    sceneRegenerationPromptV2.userTemplate.replace(
      "Lesson configuration (JSON):\n{{configuration}}",
      "Approved source tables you may chart (indexed grids; an empty list means no data-chart scene):\n{{tables}}\n\n" +
        "Lesson configuration (JSON):\n{{configuration}}",
    ),
};

if (!sceneRegenerationPromptV3.userTemplate.includes("{{tables}}"))
  throw new Error(
    "scene-regeneration/v3 expects the v2 configuration slot it extends; update v3 when v2 changes.",
  );
