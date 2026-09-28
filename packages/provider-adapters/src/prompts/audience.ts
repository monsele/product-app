import type { PromptRenderVariables } from "../prompts.js";

/**
 * ST-104. Deterministic, subject-neutral audience wording for the focus-aware
 * prompt versions. The prompt copy never hardcodes an age range or a subject:
 * both come from the lesson configuration through these variables.
 */
const ageBandGuidance: Readonly<Record<string, string>> = {
  "8-10":
    "learners aged 8-10: short sentences, everyday words, concrete examples",
  "11-13":
    "learners aged 11-13: clear structured steps, key terms defined when first used",
  "14-16":
    "learners aged 14-16: formal subject terminology and analytical reasoning",
  "adult-beginner":
    "adult learners new to the subject: mature tone, practical relevance, no assumed background",
  "adult-intermediate":
    "adult learners with working familiarity: build on common background knowledge and connect ideas",
  "adult-professional":
    "professional practitioners: precise technical vocabulary, practical implications, no simplification of core ideas",
};

const difficultyGuidance: Readonly<Record<string, string>> = {
  introductory: "introductory depth: foundations first, no assumed prior knowledge",
  intermediate: "intermediate depth: builds on standard prerequisite knowledge",
  advanced:
    "advanced depth: assumes solid prior knowledge; go beyond definitions to mechanisms, trade-offs, and edge cases",
};

/** Plain-language audience description for the `{{audience}}` slot. */
export function describePromptAudience(params: {
  ageBand?: unknown;
  difficulty?: unknown;
}): string {
  const age =
    typeof params.ageBand === "string"
      ? (ageBandGuidance[params.ageBand] ?? params.ageBand)
      : "a general audience";
  const depth =
    typeof params.difficulty === "string"
      ? (difficultyGuidance[params.difficulty] ?? params.difficulty)
      : "introductory depth";
  return `${age}; ${depth}.`;
}

/**
 * The `{{focus}}` slot. `renderPrompt` rejects unfilled variables, so a lesson
 * without a focus renders the literal `none` rather than an empty slot.
 */
export function describePromptFocus(params: { focusPrompt?: unknown }): string {
  return typeof params.focusPrompt === "string" &&
    params.focusPrompt.trim().length > 0
    ? params.focusPrompt.trim()
    : "none";
}

/**
 * ST-107. The `{{briefCoverage}}` slot: the confirmed brief's coverage points
 * (one per line in the job params) as a numbered list, or the literal `none`
 * when the job has no brief.
 */
export function describeBriefCoverage(params: {
  briefCoverage?: unknown;
}): string {
  const lines =
    typeof params.briefCoverage === "string"
      ? params.briefCoverage.split("\n")
      : Array.isArray(params.briefCoverage)
        ? params.briefCoverage
        : [];
  const points = lines.filter(
    (point): point is string =>
      typeof point === "string" && point.trim().length > 0,
  );
  return points.length === 0
    ? "none"
    : points.map((point, index) => `${index + 1}. ${point.trim()}`).join("\n");
}

/** The focus-aware variables, derived from a job's generation params. */
export function focusAudienceVariables(params: {
  ageBand?: unknown;
  difficulty?: unknown;
  focusPrompt?: unknown;
  briefCoverage?: unknown;
}): PromptRenderVariables {
  return {
    focus: describePromptFocus(params),
    audience: describePromptAudience(params),
    briefCoverage: describeBriefCoverage(params),
  };
}
