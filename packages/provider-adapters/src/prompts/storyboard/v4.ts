import type { PromptDefinition } from "../../prompts.js";
import { storyboardPromptV3 } from "./v3.js";

/**
 * v4 (ST-114): the v3 storyboard contract plus animated data charts. The
 * request now lists the approved tables that have a numeric column as
 * indexed grids (`{{tables}}`), and the catalogue includes `data-chart` only
 * when at least one is listed. A chart scene names a table, columns and rows
 * by index; the application copies every value from the table cells and
 * refuses a selection that is not numeric. v1–v3 are unchanged.
 */
export const storyboardPromptV4: PromptDefinition = {
  ...storyboardPromptV3,
  version: "v4",
  purpose:
    "Convert the approved narration into a validated, ordered LessonSpec storyboard for any subject, charting numeric source tables as animated bar or line charts where that teaches the comparison or trend best.",
  inputSchema:
    "Template catalog (+ data-chart) + narration blocks + outline + SourcePackage + chart-eligible tables + LessonConfiguration (+ focus, audience)",
  knownFailureModes: [
    ...storyboardPromptV3.knownFailureModes,
    "Numbers written into a chart visual instead of column and row references.",
    "A chart over a non-numeric column, or over a table that was not listed.",
    "A chart chosen for a table that is not narrated, or for data without a comparison or trend to show.",
  ],
  evaluationCases: [
    ...storyboardPromptV3.evaluationCases,
    "storyboard-v4-chart-fit-table",
    "storyboard-v4-chart-non-fit-table",
  ],
  changelog:
    "v4 (ST-114): Adds the {{tables}} slot (approved tables with a numeric column, as indexed grids) and the data-chart template, which references cells by index and never carries numbers. Everything else is unchanged from v3.",
  system:
    storyboardPromptV3.system +
    " When the narration explains numbers that appear in a listed table, you may show them with a data-chart scene: " +
    "choose bar to compare categories and line for a trend across ordered rows. A chart visual contains only references " +
    "(tableId, column indexes, row indexes) and an optional short unit label without digits; never write a number into it.",
  userTemplate:
    storyboardPromptV3.userTemplate.replace(
      "Lesson configuration (JSON):\n{{configuration}}",
      "Approved source tables you may chart (indexed grids; an empty list means no data-chart scenes):\n{{tables}}\n\n" +
        "Lesson configuration (JSON):\n{{configuration}}",
    ) +
    "\n\nData charts (only when a table is listed): use a data-chart scene only for a table the narration discusses. " +
    "valueColumns must be columns marked numeric, rowIndexes must be rows whose cells in those columns are numbers, " +
    "categoryColumn names the label column, and the scene must still cite the source blocks that explain the data. Return JSON only.",
};

if (!storyboardPromptV4.userTemplate.includes("{{tables}}"))
  throw new Error("storyboard/v4 expects the v3 configuration slot it extends; update v4 when v3 changes.");
