import type { PromptDefinition } from "../../prompts.js";

/**
 * v1 (ST-104): infers a subject and a lesson title from the user's focus
 * prompt plus the document title and section headings. The call is small by
 * design: body text never enters it (ADR-013), so the result is a label, not a
 * grounded claim, and it is never cited.
 */
export const lessonIntentPromptV1: PromptDefinition = {
  kind: "lesson-intent",
  promptId: "lesson-intent",
  version: "v1",
  purpose:
    "Infer the subject area and a short lesson title from the focus prompt and the document outline.",
  inputSchema: "Focus prompt + LessonIntentDocumentOutline (title and headings only)",
  outputSchema: "LessonIntentOutputV1",
  allowedSourceContext:
    "The focus prompt, the document title, and section headings only. Never body text.",
  templateCatalogVersion: null,
  examples: [],
  knownFailureModes: [
    "Subject copied verbatim from a heading instead of naming the discipline.",
    "Title longer than a short phrase or phrased as a question.",
    "Title that ignores the focus prompt.",
  ],
  evaluationCases: ["lesson-intent-v1-basic"],
  changelog:
    "v1 (ST-104): First version. Returns { subject, lessonTitle } from the focus prompt and the document outline.",
  system:
    "You name lessons. Given what a learner wants to focus on and the outline of their document, return the " +
    "subject area (the discipline, in a few words, for example 'Civil engineering', 'Modern history', " +
    "'Cell biology') and a short, specific lesson title (at most ten words, not a question) that reflects the " +
    "focus. Use only the information supplied. Return ONLY a JSON object matching the requested schema.",
  userTemplate:
    "What the learner wants the lesson to focus on:\n{{focus}}\n\n" +
    "Document outline (title and section headings only, JSON):\n{{documentOutline}}\n\n" +
    'Return a JSON object with a schemaVersion of "lesson-intent-v1", a subject, and a lessonTitle. Return JSON only.',
};
