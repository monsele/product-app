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
  { minutes: 3 as const, seconds: 180 },
  { minutes: 5 as const, seconds: 300 },
  { minutes: 7 as const, seconds: 420 },
] as const;

export const ageBandOptions = [...lessonAgeBandValues];
export const difficultyOptions = [...lessonDifficultyValues];
export const toneOptions = [...lessonToneValues];

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
