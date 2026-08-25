"use client";

import { useCallback, useEffect, useState } from "react";
import {
  lessonConfigurationResponseSchema,
  type LessonConfiguration,
  type LessonConfigurationResponse,
} from "@avlp/schemas";
import {
  ageBandOptions,
  buildConfigurationSaveInput,
  difficultyOptions,
  durationOptions,
  emptyConfigurationFormState,
  formStateFromConfiguration,
  isConfigurationFormComplete,
  narrationWordCountRange,
  toneOptions,
  type ConfigurationFormState,
} from "./lesson-configuration-input";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: LessonConfigurationResponse }
  | { kind: "failed"; message: string };

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "failed"; message: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  return typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
    ? payload.error.message
    : fallback;
}

export function LessonConfigurationForm({
  projectId,
}: {
  projectId: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [form, setForm] = useState<ConfigurationFormState>(
    emptyConfigurationFormState(),
  );
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [savedConfiguration, setSavedConfiguration] =
    useState<LessonConfiguration | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/configuration`),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("configuration");
      const parsed = lessonConfigurationResponseSchema.safeParse(payload);
      if (!parsed.success) throw new Error("configuration");
      setState({ kind: "ready", value: parsed.data });
      const configuration = parsed.data.configuration;
      setSavedConfiguration(configuration);
      if (configuration !== null)
        setForm(formStateFromConfiguration(configuration));
    } catch {
      setState({
        kind: "failed",
        message: "We could not load the lesson configuration. Please try again.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    if (!isConfigurationFormComplete(form)) return;
    const input = buildConfigurationSaveInput(savedConfiguration, form);
    if (input === null) return;
    setSaveState({ kind: "saving" });
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/configuration`),
        {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          extractErrorMessage(payload, "Unable to save the lesson configuration."),
        );
      const parsed = lessonConfigurationResponseSchema.safeParse(payload);
      if (!parsed.success || parsed.data.configuration === null)
        throw new Error("Unable to read the saved configuration.");
      setState({ kind: "ready", value: parsed.data });
      setSavedConfiguration(parsed.data.configuration);
      setForm(formStateFromConfiguration(parsed.data.configuration));
      setSaveState({ kind: "saved" });
    } catch (error) {
      setSaveState({
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save the lesson configuration.",
      });
    }
  }, [form, projectId, savedConfiguration]);

  if (state.kind === "loading")
    return (
      <section aria-labelledby="configuration-heading">
        <h2 id="configuration-heading">Lesson configuration</h2>
        <p role="status">Loading lesson configuration.</p>
      </section>
    );

  if (state.kind === "failed")
    return (
      <section aria-labelledby="configuration-heading">
        <h2 id="configuration-heading">Lesson configuration</h2>
        <p role="alert">{state.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const complete = isConfigurationFormComplete(form);
  const narrationTarget =
    form.targetDurationSeconds === ""
      ? null
      : narrationWordCountRange(form.targetDurationSeconds);

  return (
    <section aria-labelledby="configuration-heading">
      <h2 id="configuration-heading">Lesson configuration</h2>

      {state.value.source.sourceReviewComplete ? (
        <p>
          Source content confirmed — parsed version{" "}
          {state.value.source.parsedDocumentVersion}.
        </p>
      ) : (
        <p role="alert">
          Review and confirm the extracted source content before configuring the
          lesson.
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset>
          <legend>Learner profile</legend>
          <div>
            <span>Age band</span>
            {ageBandOptions.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="ageBand"
                  value={option}
                  checked={form.ageBand === option}
                  onChange={() =>
                    setForm((prev) => ({ ...prev, ageBand: option }))
                  }
                />
                {option}
              </label>
            ))}
          </div>
          <div>
            <span>Difficulty</span>
            {difficultyOptions.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="difficulty"
                  value={option}
                  checked={form.difficulty === option}
                  onChange={() =>
                    setForm((prev) => ({ ...prev, difficulty: option }))
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Lesson details</legend>
          <label>
            Subject
            <input
              type="text"
              name="subject"
              value={form.subject}
              maxLength={200}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, subject: event.target.value }))
              }
            />
          </label>
          <label>
            Lesson title
            <input
              type="text"
              name="lessonTitle"
              value={form.lessonTitle}
              maxLength={200}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  lessonTitle: event.target.value,
                }))
              }
            />
          </label>
          <div>
            <span>Target duration</span>
            {durationOptions.map((option) => (
              <label key={option.seconds}>
                <input
                  type="radio"
                  name="targetDurationSeconds"
                  value={option.seconds}
                  checked={form.targetDurationSeconds === option.seconds}
                  onChange={() =>
                    setForm((prev) => ({
                      ...prev,
                      targetDurationSeconds: option.seconds,
                    }))
                  }
                />
                {option.minutes} minutes
              </label>
            ))}
          </div>
          <div>
            <span>Tone</span>
            {toneOptions.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name="tone"
                  value={option}
                  checked={form.tone === option}
                  onChange={() =>
                    setForm((prev) => ({ ...prev, tone: option }))
                  }
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Extras</legend>
          <label>
            <input
              type="checkbox"
              name="includeRecallQuestions"
              checked={form.includeRecallQuestions}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  includeRecallQuestions: event.target.checked,
                }))
              }
            />
            Include a recall question at the end of the lesson
          </label>
        </fieldset>

        {narrationTarget !== null ? (
          <p data-narration-target>
            Narration target: {narrationTarget.min}–{narrationTarget.max} words
            (midpoint {narrationTarget.target}).
          </p>
        ) : null}

        {saveState.kind === "saved" ? (
          <p role="status">Lesson configuration saved.</p>
        ) : null}
        {saveState.kind === "failed" ? (
          <p role="alert">{saveState.message}</p>
        ) : null}

        <button type="submit" disabled={!complete || saveState.kind === "saving"}>
          {saveState.kind === "saving"
            ? "Saving…"
            : savedConfiguration === null
              ? "Save configuration"
              : "Save changes"}
        </button>
      </form>

      {state.value.canProceed ? (
        <p>
          This configuration is ready — generation can proceed.
        </p>
      ) : (
        <p role="status">
          Complete every required field and confirm the source content to
          proceed.
        </p>
      )}
    </section>
  );
}
