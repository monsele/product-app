import {
  lessonAgeBandValues,
  lessonDifficultyValues,
  lessonToneValues,
  narrationWordCountRange,
  type LessonAgeBand,
  type LessonConfiguration,
  type LessonConfigurationInput,
  type LessonDifficulty,
  type LessonTone,
} from "@avlp/schemas";

export const durationOptions = [
  { minutes: 3 as const, seconds: 180, label: "3 minutes", description: "Quick concept breakdown" },
  { minutes: 5 as const, seconds: 300, label: "5 minutes", description: "Standard comprehensive lesson" },
  { minutes: 7 as const, seconds: 420, label: "7 minutes", description: "In-depth walkthrough" },
] as const;

export const ageBandOptions = [...lessonAgeBandValues];
export const difficultyOptions = [...lessonDifficultyValues];
export const toneOptions = [...lessonToneValues];

export const ageBandLabels: Record<LessonAgeBand, { label: string; description: string }> = {
  "8-10": { label: "Elementary (8–10)", description: "Simple vocabulary and concrete real-world metaphors" },
  "11-13": { label: "Middle school (11–13)", description: "Balanced depth with structured conceptual steps" },
  "14-16": { label: "High school (14–16)", description: "Formal domain terminology and analytical reasoning" },
  "adult-beginner": { label: "Adult beginner", description: "Mature tone focused on practical application" },
};

export const difficultyLabels: Record<LessonDifficulty, { label: string; description: string }> = {
  introductory: { label: "Introductory", description: "Foundational concepts without assumed prior knowledge" },
  intermediate: { label: "Intermediate", description: "Builds upon standard prerequisite knowledge" },
};

export const toneLabels: Record<LessonTone, { label: string; description: string }> = {
  friendly: { label: "Conversational", description: "Warm, engaging, and approachable explanation" },
  academic: { label: "Academic", description: "Objective, precise, and disciplined delivery" },
  conversational: { label: "Casual dialogue", description: "Natural, interactive question-and-answer flow" },
};

export interface ConfigurationFormState {
  ageBand: LessonAgeBand | "";
  difficulty: LessonDifficulty | "";
  subject: string;
  lessonTitle: string;
  targetDurationSeconds: (typeof durationOptions)[number]["seconds"] | "";
  tone: LessonTone | "";
  includeRecallQuestions: boolean;
}

/** Empty form state used before a saved configuration has loaded. */
export function emptyConfigurationFormState(): ConfigurationFormState {
  return {
    ageBand: "",
    difficulty: "",
    subject: "",
    lessonTitle: "",
    targetDurationSeconds: "",
    tone: "",
    includeRecallQuestions: false,
  };
}

/** Pre-fills the form from a persisted configuration (assumed valid). */
export function formStateFromConfiguration(
  configuration: LessonConfiguration,
): ConfigurationFormState {
  return {
    ageBand: configuration.ageBand,
    difficulty: configuration.difficulty,
    subject: configuration.subject,
    lessonTitle: configuration.lessonTitle,
    targetDurationSeconds: configuration.targetDurationSeconds,
    tone: configuration.tone,
    includeRecallQuestions: configuration.includeRecallQuestions,
  };
}

export function isConfigurationFormComplete(
  state: ConfigurationFormState,
): boolean {
  return (
    state.ageBand !== "" &&
    state.difficulty !== "" &&
    state.subject.trim().length > 0 &&
    state.lessonTitle.trim().length > 0 &&
    state.targetDurationSeconds !== "" &&
    state.tone !== ""
  );
}

/**
 * Checks whether form has unsaved modifications compared to saved config.
 */
export function hasConfigurationChanges(
  saved: LessonConfiguration | null,
  current: ConfigurationFormState,
): boolean {
  if (saved === null) {
    return (
      current.ageBand !== "" ||
      current.difficulty !== "" ||
      current.subject.trim().length > 0 ||
      current.lessonTitle.trim().length > 0 ||
      current.targetDurationSeconds !== "" ||
      current.tone !== "" ||
      current.includeRecallQuestions !== false
    );
  }
  return (
    saved.ageBand !== current.ageBand ||
    saved.difficulty !== current.difficulty ||
    saved.subject !== current.subject.trim() ||
    saved.lessonTitle !== current.lessonTitle.trim() ||
    saved.targetDurationSeconds !== current.targetDurationSeconds ||
    saved.tone !== current.tone ||
    saved.includeRecallQuestions !== current.includeRecallQuestions
  );
}

/**
 * Builds the `PUT /projects/:id/configuration` body, carrying the expected
 * version for optimistic concurrency. Returns `null` while the form is
 * incomplete so the caller can disable submission.
 */
export function buildConfigurationSaveInput(
  current: LessonConfiguration | null,
  state: ConfigurationFormState,
): LessonConfigurationInput | null {
  if (!isConfigurationFormComplete(state)) return null;
  return {
    expectedVersion: current?.version ?? 0,
    ageBand: state.ageBand as LessonAgeBand,
    difficulty: state.difficulty as LessonDifficulty,
    subject: state.subject.trim(),
    lessonTitle: state.lessonTitle.trim(),
    targetDurationSeconds:
      state.targetDurationSeconds as (typeof durationOptions)[number]["seconds"],
    tone: state.tone as LessonTone,
    includeRecallQuestions: state.includeRecallQuestions,
  };
}

export { narrationWordCountRange };
