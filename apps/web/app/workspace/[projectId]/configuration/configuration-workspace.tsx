"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  lessonConfigurationResponseSchema,
  voiceCatalogEntrySchema,
  voiceConfigurationResponseSchema,
  type LessonConfiguration,
  type LessonConfigurationResponse,
  type PronunciationOverride,
  type VoiceCatalogEntry,
  type VoiceConfiguration,
  type VoiceConfigurationResponse,
} from "@avlp/schemas";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Globe,
  Info,
  Microphone,
  Palette,
  Play,
  Plus,
  SpeakerHigh,
  Stop,
  Trash,
  User,
} from "@phosphor-icons/react";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import { toast } from "../../../../components/ui/toast-provider";
import { StatusLabel } from "../../../../components/ui/status-label";
import { useStageNavigation } from "../../../../lib/use-stage-navigation";
import {
  ageBandLabels,
  ageBandOptions,
  buildConfigurationSaveInput,
  difficultyLabels,
  difficultyOptions,
  durationOptions,
  emptyConfigurationFormState,
  formStateFromConfiguration,
  hasConfigurationChanges,
  isConfigurationFormComplete,
  narrationWordCountRange,
  toneLabels,
  toneOptions,
  type ConfigurationFormState,
} from "./lesson-configuration-input";
import {
  addPronunciationOverride,
  defaultVoiceFormState,
  fallbackVoices,
  formatSpeakingRate,
  formStateFromVoiceConfiguration,
  hasVoiceChanges,
  maxPronunciationOverrides,
  type VoiceFormState,
} from "./voice-configuration-input";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

export interface ConfigurationWorkspaceProps {
  projectId: string;
  projectTitle: string;
}

type LoadingState =
  | { kind: "loading" }
  | {
      kind: "ready";
      lessonResponse: LessonConfigurationResponse;
      voiceResponse: VoiceConfigurationResponse;
      catalog: VoiceCatalogEntry[];
    }
  | { kind: "failed"; message: string };

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; message?: string | undefined }
  | { kind: "failed"; message: string; isConflict?: boolean | undefined };

export const ConfigurationWorkspace: React.FC<ConfigurationWorkspaceProps> = ({
  projectId,
  projectTitle,
}) => {
  const router = useRouter();
  const [loadingState, setLoadingState] = useState<LoadingState>({
    kind: "loading",
  });
  const [lessonForm, setLessonForm] = useState<ConfigurationFormState>(
    emptyConfigurationFormState(),
  );
  const [savedLessonConfig, setSavedLessonConfig] =
    useState<LessonConfiguration | null>(null);

  const [voiceForm, setVoiceForm] = useState<VoiceFormState>(
    defaultVoiceFormState(),
  );
  const [savedVoiceConfig, setSavedVoiceConfig] =
    useState<VoiceConfiguration | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });
  const stageNavigation = useStageNavigation();

  // Audio preview state
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [audioLoadingVoiceId, setAudioLoadingVoiceId] = useState<string | null>(
    null,
  );
  const [audioErrorVoiceId, setAudioErrorVoiceId] = useState<string | null>(
    null,
  );
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Field validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const subjectInputId = useId();
  const titleInputId = useId();
  const speakingRateInputId = useId();

  const loadData = useCallback(async () => {
    try {
      setLoadingState({ kind: "loading" });
      const [lessonRes, voiceConfigRes, catalogRes] = await Promise.all([
        fetch(apiUrl(`/projects/${encodeURIComponent(projectId)}/configuration`), {
          credentials: "include",
          cache: "no-store",
        }),
        fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/voice-configuration`,
          ),
          { credentials: "include", cache: "no-store" },
        ),
        fetch(apiUrl("/voices"), { credentials: "include", cache: "no-store" }),
      ]);

      if (!lessonRes.ok || !voiceConfigRes.ok) {
        throw new Error("Unable to load lesson configuration settings.");
      }

      const lessonPayload: unknown = await lessonRes.json();
      const voiceConfigPayload: unknown = await voiceConfigRes.json();
      const catalogPayload: unknown = catalogRes.ok
        ? await catalogRes.json().catch(() => null)
        : null;

      const parsedLesson =
        lessonConfigurationResponseSchema.safeParse(lessonPayload);
      const parsedVoiceConfig =
        voiceConfigurationResponseSchema.safeParse(voiceConfigPayload);

      if (!parsedLesson.success || !parsedVoiceConfig.success) {
        throw new Error("Invalid configuration response received from server.");
      }

      let catalog: VoiceCatalogEntry[] = fallbackVoices;
      if (
        catalogPayload &&
        typeof catalogPayload === "object" &&
        "voices" in catalogPayload &&
        Array.isArray(catalogPayload.voices)
      ) {
        const validatedCatalog = catalogPayload.voices.flatMap((entry) => {
          const res = voiceCatalogEntrySchema.safeParse(entry);
          return res.success ? [res.data] : [];
        });
        if (validatedCatalog.length > 0) {
          catalog = validatedCatalog;
        }
      }

      setLoadingState({
        kind: "ready",
        lessonResponse: parsedLesson.data,
        voiceResponse: parsedVoiceConfig.data,
        catalog,
      });

      const currentConfig = parsedLesson.data.configuration;
      setSavedLessonConfig(currentConfig);
      if (currentConfig !== null) {
        setLessonForm(formStateFromConfiguration(currentConfig));
      } else {
        // Suggested initial title if none is set
        setLessonForm((prev) => ({
          ...prev,
          lessonTitle: prev.lessonTitle || projectTitle,
        }));
      }

      const currentVoice = parsedVoiceConfig.data.configuration;
      setSavedVoiceConfig(currentVoice);
      if (currentVoice !== null) {
        setVoiceForm(formStateFromVoiceConfiguration(currentVoice));
      }

      setSaveStatus({ kind: "idle" });
      setFieldErrors({});
    } catch (err) {
      setLoadingState({
        kind: "failed",
        message:
          err instanceof Error
            ? err.message
            : "We could not load the lesson setup. Please try again.",
      });
    }
  }, [projectId, projectTitle]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle audio stop on unmount
  useEffect(() => {
    return () => {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.src = "";
      }
    };
  }, []);

  const handleTogglePlayAudio = (voice: VoiceCatalogEntry) => {
    if (playingVoiceId === voice.id) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      setPlayingVoiceId(null);
      return;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    setAudioLoadingVoiceId(voice.id);
    setAudioErrorVoiceId(null);

    if (typeof window === "undefined") return;
    const audio = new window.Audio();
    audioElementRef.current = audio;

    let previewSrc = voice.previewUrl;
    try {
      if (previewSrc.startsWith("http://") || previewSrc.startsWith("https://")) {
        const parsedUrl = new URL(previewSrc);
        previewSrc = apiUrl(parsedUrl.pathname);
      } else {
        previewSrc = apiUrl(previewSrc);
      }
    } catch {
      previewSrc = apiUrl(previewSrc);
    }

    audio.src = previewSrc;
    audio.preload = "auto";

    audio.oncanplay = () => {
      setAudioLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
      void audio.play().catch(() => {
        setPlayingVoiceId(null);
        setAudioErrorVoiceId(voice.id);
      });
    };

    audio.onended = () => {
      setPlayingVoiceId(null);
      setAudioLoadingVoiceId(null);
    };

    audio.onerror = () => {
      setPlayingVoiceId(null);
      setAudioLoadingVoiceId(null);
      setAudioErrorVoiceId(voice.id);
    };

    audio.load();
  };

  const validateLocalForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!lessonForm.ageBand) errors.ageBand = "Please select an age band.";
    if (!lessonForm.difficulty)
      errors.difficulty = "Please select a difficulty level.";
    if (!lessonForm.subject.trim())
      errors.subject = "Subject is required (e.g. Science, Biology).";
    if (!lessonForm.lessonTitle.trim())
      errors.lessonTitle = "Lesson title is required.";
    if (!lessonForm.targetDurationSeconds)
      errors.targetDurationSeconds = "Please select a target duration.";
    if (!lessonForm.tone) errors.tone = "Please select an instructional tone.";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!validateLocalForm()) {
      const message = "Please fill out all required fields before saving.";
      setSaveStatus({ kind: "failed", message });
      toast.error(message);
      return;
    }

    const lessonInput = buildConfigurationSaveInput(
      savedLessonConfig,
      lessonForm,
    );
    if (!lessonInput) return;

    setSaveStatus({ kind: "saving" });
    const pendingToastId = toast.loading("Saving configuration...");

    try {
      // 1. Save Lesson Configuration
      const lessonRes = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/configuration`),
        {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(lessonInput),
        },
      );

      const lessonPayload: unknown = await lessonRes.json().catch(() => null);
      if (!lessonRes.ok) {
        const isConflict = lessonRes.status === 409;
        throw {
          message: extractErrorMessage(
            lessonPayload,
            "Unable to save lesson configuration.",
          ),
          isConflict,
        };
      }

      const parsedLesson =
        lessonConfigurationResponseSchema.safeParse(lessonPayload);
      if (!parsedLesson.success || !parsedLesson.data.configuration) {
        throw { message: "Invalid response saving lesson configuration." };
      }

      // 2. Save Voice Configuration
      const cleanOverrides = voiceForm.pronunciationOverrides
        .filter((entry) => entry.phrase.trim() && entry.replacement.trim())
        .map((entry) => ({
          phrase: entry.phrase.trim(),
          replacement: entry.replacement.trim(),
        }));

      const voiceInput = {
        expectedVersion: savedVoiceConfig?.version ?? 0,
        voiceId: voiceForm.voiceId,
        speakingRate: voiceForm.speakingRate,
        pronunciationOverrides: cleanOverrides,
      };

      const voiceRes = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/voice-configuration`,
        ),
        {
          method: "PUT",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(voiceInput),
        },
      );

      const voicePayload: unknown = await voiceRes.json().catch(() => null);
      if (!voiceRes.ok) {
        const isConflict = voiceRes.status === 409;
        throw {
          message: extractErrorMessage(
            voicePayload,
            "Unable to save voice settings.",
          ),
          isConflict,
        };
      }

      const parsedVoice =
        voiceConfigurationResponseSchema.safeParse(voicePayload);
      if (!parsedVoice.success || !parsedVoice.data.configuration) {
        throw { message: "Invalid response saving voice configuration." };
      }

      // Update state
      setSavedLessonConfig(parsedLesson.data.configuration);
      setLessonForm(
        formStateFromConfiguration(parsedLesson.data.configuration),
      );

      setSavedVoiceConfig(parsedVoice.data.configuration);
      setVoiceForm(
        formStateFromVoiceConfiguration(parsedVoice.data.configuration),
      );

      setSaveStatus({
        kind: "saved",
        message: "Lesson and voice configuration saved successfully.",
      });
      setFieldErrors({});
      toast.update(
        pendingToastId,
        "success",
        "Lesson and voice configuration saved.",
      );
    } catch (err: unknown) {
      const errorObj = err as { message?: string; isConflict?: boolean };
      const message =
        errorObj.message ??
        "An error occurred while saving. Please check your connection and try again.";
      setSaveStatus({
        kind: "failed",
        message,
        ...(errorObj.isConflict ? { isConflict: true } : {}),
      });
      // A version conflict is recoverable by reloading, so offer that inline.
      toast.update(
        pendingToastId,
        "error",
        message,
        errorObj.isConflict === true
          ? { action: { label: "Reload", onClick: () => router.refresh() } }
          : undefined,
      );
    }
  };

  const handleUpdateOverride = (
    index: number,
    field: keyof PronunciationOverride,
    val: string,
  ) => {
    setVoiceForm((prev) => ({
      ...prev,
      pronunciationOverrides: prev.pronunciationOverrides.map((item, i) =>
        i === index ? { ...item, [field]: val } : item,
      ),
    }));
  };

  const handleRemoveOverride = (index: number) => {
    setVoiceForm((prev) => ({
      ...prev,
      pronunciationOverrides: prev.pronunciationOverrides.filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const handleAddOverride = () => {
    setVoiceForm((prev) => ({
      ...prev,
      pronunciationOverrides: addPronunciationOverride(
        prev.pronunciationOverrides,
      ),
    }));
  };

  if (loadingState.kind === "loading") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "32px 24px",
          maxWidth: "1140px",
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h1
            id="configuration-heading"
            style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}
          >
            Lesson & voice setup
          </h1>
          <p
            role="status"
            style={{ color: "var(--color-text-muted)", fontSize: "14px", margin: 0 }}
          >
            Loading lesson configuration and voice settings…
          </p>
        </div>
      </div>
    );
  }

  if (loadingState.kind === "failed") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          padding: "32px 24px",
          maxWidth: "760px",
          margin: "0 auto",
        }}
      >
        <h1
          id="configuration-heading"
          style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}
        >
          Lesson & voice setup
        </h1>
        <Notice
          type="error"
          title="Could not load configuration"
          message={loadingState.message}
          actionLabel="Try again"
          onAction={() => void loadData()}
        />
      </div>
    );
  }

  const { lessonResponse, catalog } = loadingState;
  const isFormComplete = isConfigurationFormComplete(lessonForm);
  const isFormDirty =
    hasConfigurationChanges(savedLessonConfig, lessonForm) ||
    hasVoiceChanges(savedVoiceConfig, voiceForm);
  const isSaving = saveStatus.kind === "saving";
  const isSavedAndClean =
    savedLessonConfig !== null && !isFormDirty && !isSaving;

  const durationTarget =
    lessonForm.targetDurationSeconds === ""
      ? null
      : narrationWordCountRange(lessonForm.targetDurationSeconds);

  const selectedVoice =
    catalog.find((v) => v.id === voiceForm.voiceId) ?? catalog[0];

  const sourceReviewComplete = lessonResponse.source.sourceReviewComplete;
  const parsedDocVersion = lessonResponse.source.parsedDocumentVersion;

  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px 20px 80px 20px",
      }}
    >
      {/* Page Header */}
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1
              id="configuration-heading"
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--color-text)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              Lesson & voice setup
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-muted)",
                margin: "4px 0 0 0",
              }}
            >
              Define your audience, instructional framing, duration target, and
              voice delivery for {projectTitle}.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {sourceReviewComplete ? (
              <StatusLabel
                status="success"
                label={`Source confirmed (v${parsedDocVersion ?? 1})`}
              />
            ) : (
              <StatusLabel
                status="blocked"
                label="Source review pending"
              />
            )}
            {savedLessonConfig && (
              <StatusLabel
                status="info"
                label={`Saved rev #${savedLessonConfig.version}`}
              />
            )}
          </div>
        </div>

        {/* Source confirmation banner if pending */}
        {!sourceReviewComplete && (
          <div style={{ marginTop: "8px" }}>
            <Notice
              type="warning"
              title="Source confirmation recommended"
              message="Review and confirm the extracted source content before generating lessons to ensure grounded instruction."
              actionLabel="Go to review"
              onAction={() => {
                stageNavigation.navigate(`/workspace/${projectId}/review`);
              }}
            />
          </div>
        )}

        {/* Global Save Error / Conflict Notice */}
        {saveStatus.kind === "failed" && (
          <div style={{ marginTop: "8px" }}>
            <Notice
              type="error"
              title={
                saveStatus.isConflict
                  ? "Configuration Changed (Conflict)"
                  : "Save Failed"
              }
              message={
                saveStatus.isConflict
                  ? "Another update was made to this project. Please refresh to load the latest revision before saving."
                  : saveStatus.message
              }
              {...(saveStatus.isConflict
                ? {
                    actionLabel: "Refresh setup",
                    onAction: () => void loadData(),
                  }
                : {})}
            />
          </div>
        )}

        {/* Global Save Success Notice (hidden again as soon as the form is edited) */}
        {saveStatus.kind === "saved" && !isFormDirty && (
          <div style={{ marginTop: "8px" }}>
            <Notice
              type="success"
              title="Setup saved"
              message={
                saveStatus.message ??
                "Lesson configuration and voice preferences have been persisted."
              }
              actionLabel="Continue to objectives"
              onAction={() => {
                stageNavigation.navigate(`/workspace/${projectId}/objectives`);
              }}
            />
          </div>
        )}
      </header>

      {/* Main Two-Column Layout (Form + Sticky Summary) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "32px",
          alignItems: "start",
        }}
        className="configuration-grid-container"
      >
        {/* Left Column: Form Sections */}
        <form
          onSubmit={(e) => void handleSave(e)}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            maxWidth: "760px",
          }}
        >
          {/* Section 1: Learner Profile */}
          <fieldset
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              padding: "20px",
              backgroundColor: "var(--color-surface)",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <legend
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <User size={18} weight="bold" style={{ color: "var(--color-brand)" }} />
              Learner profile
            </legend>

            {/* Age Band */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Target age band
                </label>
                {fieldErrors.ageBand && (
                  <span
                    role="alert"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-error-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {fieldErrors.ageBand}
                  </span>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label="Target age band"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "8px",
                }}
              >
                {ageBandOptions.map((band) => {
                  const isSelected = lessonForm.ageBand === band;
                  const info = ageBandLabels[band];
                  return (
                    <button
                      key={band}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setLessonForm((prev) => ({ ...prev, ageBand: band }));
                        setFieldErrors((prev) => ({ ...prev, ageBand: "" }));
                      }}
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        backgroundColor: isSelected
                          ? "var(--color-surface-brand)"
                          : "var(--color-surface-subtle)",
                        border: isSelected
                          ? "1.5px solid var(--color-brand)"
                          : "1px solid var(--color-border)",
                        borderRadius: "var(--radius-control)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        transition:
                          "all var(--motion-quick) var(--motion-easing)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected
                            ? "var(--color-brand)"
                            : "var(--color-text)",
                        }}
                      >
                        {info.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                          lineHeight: "14px",
                        }}
                      >
                        {info.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Difficulty */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Difficulty level
                </label>
                {fieldErrors.difficulty && (
                  <span
                    role="alert"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-error-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {fieldErrors.difficulty}
                  </span>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label="Difficulty level"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, 1fr)",
                  gap: "8px",
                }}
              >
                {difficultyOptions.map((diff) => {
                  const isSelected = lessonForm.difficulty === diff;
                  const info = difficultyLabels[diff];
                  return (
                    <button
                      key={diff}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setLessonForm((prev) => ({ ...prev, difficulty: diff }));
                        setFieldErrors((prev) => ({ ...prev, difficulty: "" }));
                      }}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        backgroundColor: isSelected
                          ? "var(--color-surface-brand)"
                          : "var(--color-surface-subtle)",
                        border: isSelected
                          ? "1.5px solid var(--color-brand)"
                          : "1px solid var(--color-border)",
                        borderRadius: "var(--radius-control)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        transition:
                          "all var(--motion-quick) var(--motion-easing)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected
                            ? "var(--color-brand)"
                            : "var(--color-text)",
                        }}
                      >
                        {info.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                          lineHeight: "14px",
                        }}
                      >
                        {info.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>

          {/* Section 2: Lesson Details */}
          <fieldset
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              padding: "20px",
              backgroundColor: "var(--color-surface)",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <legend
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Globe size={18} weight="bold" style={{ color: "var(--color-brand)" }} />
              Lesson details & pacing
            </legend>

            {/* Subject */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  htmlFor={subjectInputId}
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Subject area
                </label>
                {fieldErrors.subject && (
                  <span
                    role="alert"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-error-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {fieldErrors.subject}
                  </span>
                )}
              </div>
              <input
                id={subjectInputId}
                type="text"
                name="subject"
                value={lessonForm.subject}
                maxLength={200}
                placeholder="e.g. Science, Cell Biology, Classical Physics"
                onChange={(e) => {
                  setLessonForm((prev) => ({ ...prev, subject: e.target.value }));
                  setFieldErrors((prev) => ({ ...prev, subject: "" }));
                }}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "var(--radius-control)",
                  border: fieldErrors.subject
                    ? "1.5px solid var(--color-error-fg)"
                    : "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Lesson Title */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  htmlFor={titleInputId}
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Lesson title
                </label>
                {fieldErrors.lessonTitle && (
                  <span
                    role="alert"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-error-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {fieldErrors.lessonTitle}
                  </span>
                )}
              </div>
              <input
                id={titleInputId}
                type="text"
                name="lessonTitle"
                value={lessonForm.lessonTitle}
                maxLength={200}
                placeholder="e.g. Cellular Respiration and Energy Production"
                onChange={(e) => {
                  setLessonForm((prev) => ({
                    ...prev,
                    lessonTitle: e.target.value,
                  }));
                  setFieldErrors((prev) => ({ ...prev, lessonTitle: "" }));
                }}
                style={{
                  padding: "10px 14px",
                  fontSize: "14px",
                  borderRadius: "var(--radius-control)",
                  border: fieldErrors.lessonTitle
                    ? "1.5px solid var(--color-error-fg)"
                    : "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  color: "var(--color-text)",
                  fontFamily: "inherit",
                }}
              />
              {projectTitle && lessonForm.lessonTitle !== projectTitle && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "2px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Suggested from project: {projectTitle}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLessonForm((prev) => ({
                        ...prev,
                        lessonTitle: projectTitle,
                      }))
                    }
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--color-brand)",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      padding: 0,
                      textDecoration: "underline",
                    }}
                  >
                    Use suggested title
                  </button>
                </div>
              )}
            </div>

            {/* Target Duration & Word Calculation */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Target duration
                </label>
                {fieldErrors.targetDurationSeconds && (
                  <span
                    role="alert"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-error-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {fieldErrors.targetDurationSeconds}
                  </span>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label="Target duration"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                }}
              >
                {durationOptions.map((opt) => {
                  const isSelected =
                    lessonForm.targetDurationSeconds === opt.seconds;
                  return (
                    <button
                      key={opt.seconds}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setLessonForm((prev) => ({
                          ...prev,
                          targetDurationSeconds: opt.seconds,
                        }));
                        setFieldErrors((prev) => ({
                          ...prev,
                          targetDurationSeconds: "",
                        }));
                      }}
                      style={{
                        padding: "12px",
                        textAlign: "left",
                        backgroundColor: isSelected
                          ? "var(--color-surface-brand)"
                          : "var(--color-surface-subtle)",
                        border: isSelected
                          ? "1.5px solid var(--color-brand)"
                          : "1px solid var(--color-border)",
                        borderRadius: "var(--radius-control)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        transition:
                          "all var(--motion-quick) var(--motion-easing)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected
                            ? "var(--color-brand)"
                            : "var(--color-text)",
                        }}
                      >
                        {opt.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {opt.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              {durationTarget && (
                <p
                  data-narration-target
                  style={{
                    fontSize: "13px",
                    color: "var(--color-brand)",
                    fontWeight: 500,
                    margin: "4px 0 0 0",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Clock size={16} />
                  Narration target: {durationTarget.min}–{durationTarget.max}{" "}
                  words (midpoint {durationTarget.target} words).
                </p>
              )}
            </div>

            {/* Tone */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Instructional tone
                </label>
                {fieldErrors.tone && (
                  <span
                    role="alert"
                    style={{
                      fontSize: "12px",
                      color: "var(--color-error-fg)",
                      fontWeight: 500,
                    }}
                  >
                    {fieldErrors.tone}
                  </span>
                )}
              </div>
              <div
                role="radiogroup"
                aria-label="Instructional tone"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "8px",
                }}
              >
                {toneOptions.map((t) => {
                  const isSelected = lessonForm.tone === t;
                  const info = toneLabels[t];
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setLessonForm((prev) => ({ ...prev, tone: t }));
                        setFieldErrors((prev) => ({ ...prev, tone: "" }));
                      }}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        backgroundColor: isSelected
                          ? "var(--color-surface-brand)"
                          : "var(--color-surface-subtle)",
                        border: isSelected
                          ? "1.5px solid var(--color-brand)"
                          : "1px solid var(--color-border)",
                        borderRadius: "var(--radius-control)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                        transition:
                          "all var(--motion-quick) var(--motion-easing)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: isSelected ? 600 : 500,
                          color: isSelected
                            ? "var(--color-brand)"
                            : "var(--color-text)",
                        }}
                      >
                        {info.label}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                          lineHeight: "14px",
                        }}
                      >
                        {info.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Extras: Recall Question */}
            <div
              style={{
                paddingTop: "8px",
                borderTop: "1px solid var(--color-surface-subtle)",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  name="includeRecallQuestions"
                  checked={lessonForm.includeRecallQuestions}
                  onChange={(e) =>
                    setLessonForm((prev) => ({
                      ...prev,
                      includeRecallQuestions: e.target.checked,
                    }))
                  }
                  style={{
                    width: "18px",
                    height: "18px",
                    marginTop: "2px",
                    accentColor: "var(--color-brand)",
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 500,
                      color: "var(--color-text)",
                    }}
                  >
                    Include a recall question at the end of the lesson
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    Adds a closing check scene with a prompt and delayed visual
                    resolution.
                  </span>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Section 3: Visual Theme */}
          <fieldset
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              padding: "20px",
              backgroundColor: "var(--color-surface)",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <legend
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Palette size={18} weight="bold" style={{ color: "var(--color-brand)" }} />
              Visual theme
            </legend>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                backgroundColor: "var(--color-surface-brand)",
                border: "1.5px solid var(--color-brand)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-brand)",
                  }}
                >
                  Warm editorial (Daylight Standard)
                </span>
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-muted)",
                  }}
                >
                  High-legibility typography, clear hierarchy, and daylight warm
                  accents for visual instruction.
                </span>
              </div>
              <StatusLabel status="success" label="Active MVP Theme" />
            </div>
          </fieldset>

          {/* Section 4: Narrator Voice & Delivery */}
          <fieldset
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              padding: "20px",
              backgroundColor: "var(--color-surface)",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <legend
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <Microphone size={18} weight="bold" style={{ color: "var(--color-brand)" }} />
              Narrator voice & delivery
            </legend>

            {/* Voice Catalog Selector */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <label
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                }}
              >
                Choose English narrator
              </label>
              <div
                role="radiogroup"
                aria-label="Narrator voice"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {catalog.map((voice) => {
                  const isSelected = voiceForm.voiceId === voice.id;
                  const isPlaying = playingVoiceId === voice.id;
                  const isLoadingAudio = audioLoadingVoiceId === voice.id;
                  const isErrorAudio = audioErrorVoiceId === voice.id;

                  return (
                    <div
                      key={voice.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 16px",
                        borderRadius: "var(--radius-control)",
                        backgroundColor: isSelected
                          ? "var(--color-surface-brand)"
                          : "var(--color-surface-subtle)",
                        border: isSelected
                          ? "1.5px solid var(--color-brand)"
                          : "1px solid var(--color-border)",
                        gap: "12px",
                      }}
                    >
                      {/* Left: Radio & Info */}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          flex: 1,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="radio"
                          name="voice"
                          value={voice.id}
                          checked={isSelected}
                          onChange={() =>
                            setVoiceForm((prev) => ({
                              ...prev,
                              voiceId: voice.id,
                            }))
                          }
                          style={{
                            accentColor: "var(--color-brand)",
                            width: "18px",
                            height: "18px",
                            cursor: "pointer",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "2px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: isSelected
                                ? "var(--color-brand)"
                                : "var(--color-text)",
                            }}
                          >
                            {voice.displayName}
                          </span>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--color-text-muted)",
                            }}
                          >
                            {voice.description}
                          </span>
                        </div>
                      </label>

                      {/* Right: Audio Preview Control */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                        }}
                      >
                        {isErrorAudio && (
                          <span
                            role="alert"
                            style={{
                              fontSize: "12px",
                              color: "var(--color-error-fg)",
                              fontWeight: 500,
                            }}
                          >
                            Preview failed
                          </span>
                        )}
                        <Button
                          type="button"
                          variant={isPlaying ? "primary" : "secondary"}
                          size="compact"
                          isLoading={isLoadingAudio}
                          leftIcon={
                            isPlaying ? (
                              <Stop size={14} weight="fill" />
                            ) : (
                              <Play size={14} weight="fill" />
                            )
                          }
                          onClick={() => handleTogglePlayAudio(voice)}
                          aria-label={
                            isPlaying
                              ? `Stop preview of ${voice.displayName}`
                              : `Preview ${voice.displayName} voice`
                          }
                        >
                          {isPlaying ? "Stop" : "Preview"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Speaking Rate Range */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <label
                  htmlFor={speakingRateInputId}
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--color-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <SpeakerHigh size={16} />
                  Speaking rate
                </label>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--color-brand)",
                  }}
                >
                  {formatSpeakingRate(voiceForm.speakingRate)}
                </span>
              </div>
              <input
                id={speakingRateInputId}
                aria-label="Speaking rate"
                type="range"
                min="0.75"
                max="1.25"
                step="0.05"
                value={voiceForm.speakingRate}
                onChange={(e) =>
                  setVoiceForm((prev) => ({
                    ...prev,
                    speakingRate: Number(e.target.value),
                  }))
                }
                style={{
                  width: "100%",
                  accentColor: "var(--color-brand)",
                  cursor: "pointer",
                }}
              />
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                }}
              >
                <span>0.75× (Deliberate)</span>
                <span>1.00× (Natural pace)</span>
                <span>1.25× (Brisk)</span>
              </div>
            </div>
          </fieldset>

          {/* Section 5: Pronunciation Overrides */}
          <fieldset
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              padding: "20px",
              backgroundColor: "var(--color-surface)",
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <legend
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  padding: "0 8px",
                }}
              >
                Pronunciation overrides
              </legend>
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                }}
              >
                {voiceForm.pronunciationOverrides.length} /{" "}
                {maxPronunciationOverrides} overrides
              </span>
            </div>
            <p
              style={{
                fontSize: "13px",
                color: "var(--color-text-muted)",
                margin: 0,
                lineHeight: "18px",
              }}
            >
              Specify phonetic spelling for domain-specific terminology, proper
              nouns, or symbols to guide speech synthesis.
            </p>

            {voiceForm.pronunciationOverrides.length === 0 ? (
              <div
                style={{
                  padding: "16px",
                  borderRadius: "var(--radius-control)",
                  backgroundColor: "var(--color-surface-subtle)",
                  border: "1px dashed var(--color-border)",
                  textAlign: "center",
                  fontSize: "13px",
                  color: "var(--color-text-muted)",
                }}
              >
                No pronunciation overrides defined.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {voiceForm.pronunciationOverrides.map((entry, index) => (
                  <div
                    key={`override-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: "10px",
                      alignItems: "end",
                      padding: "12px",
                      backgroundColor: "var(--color-surface-subtle)",
                      borderRadius: "var(--radius-control)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "var(--color-text)",
                        }}
                      >
                        Phrase
                      </label>
                      <input
                        type="text"
                        value={entry.phrase}
                        maxLength={80}
                        placeholder="e.g. Mitochondria"
                        onChange={(e) =>
                          handleUpdateOverride(index, "phrase", e.target.value)
                        }
                        style={{
                          padding: "8px 10px",
                          fontSize: "13px",
                          borderRadius: "6px",
                          border: "1px solid var(--color-border)",
                          backgroundColor: "var(--color-surface)",
                          color: "var(--color-text)",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 500,
                          color: "var(--color-text)",
                        }}
                      >
                        Say it as (phonetic)
                      </label>
                      <input
                        type="text"
                        value={entry.replacement}
                        maxLength={120}
                        placeholder="e.g. my-toh-KON-dree-uh"
                        onChange={(e) =>
                          handleUpdateOverride(
                            index,
                            "replacement",
                            e.target.value,
                          )
                        }
                        style={{
                          padding: "8px 10px",
                          fontSize: "13px",
                          borderRadius: "6px",
                          border: "1px solid var(--color-border)",
                          backgroundColor: "var(--color-surface)",
                          color: "var(--color-text)",
                        }}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="tertiary"
                      size="compact"
                      onClick={() => handleRemoveOverride(index)}
                      aria-label={`Remove pronunciation override for ${entry.phrase || "row " + (index + 1)}`}
                      style={{ height: "36px" }}
                    >
                      <Trash size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                disabled={
                  voiceForm.pronunciationOverrides.length >=
                  maxPronunciationOverrides
                }
                leftIcon={<Plus size={14} />}
                onClick={handleAddOverride}
              >
                Add pronunciation override
              </Button>
            </div>
          </fieldset>
        </form>

        {/* Right Column: Sticky Summary Rail */}
        <aside
          aria-label="Setup summary"
          style={{
            position: "sticky",
            top: "24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "24px",
            boxShadow: "var(--shadow-elevation)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid var(--color-surface-subtle)",
              paddingBottom: "12px",
            }}
          >
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              Setup summary
            </h2>
            {isFormDirty ? (
              <span
                aria-live="polite"
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-warning-fg)",
                  backgroundColor: "var(--color-warning-bg)",
                  border: "1px solid var(--color-warning-border)",
                  borderRadius: "var(--radius-pill)",
                  padding: "2px 8px",
                }}
              >
                Unsaved changes
              </span>
            ) : savedLessonConfig ? (
              <span
                aria-live="polite"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "var(--color-success-fg)",
                  backgroundColor: "var(--color-success-bg)",
                  border: "1px solid var(--color-success-border)",
                  borderRadius: "var(--radius-pill)",
                  padding: "2px 8px",
                }}
              >
                <CheckCircle size={12} weight="fill" aria-hidden="true" />
                All changes saved
              </span>
            ) : null}
          </div>

          {/* Key metrics list */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              fontSize: "13px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Target duration:</span>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--color-text)",
                  textAlign: "right",
                }}
              >
                {lessonForm.targetDurationSeconds
                  ? `${lessonForm.targetDurationSeconds / 60} mins (~${durationTarget?.target ?? 0} words)`
                  : "Not set"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Learner Level:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text)",
                  textAlign: "right",
                }}
              >
                {lessonForm.ageBand && lessonForm.difficulty
                  ? `${lessonForm.ageBand} · ${lessonForm.difficulty}`
                  : "Incomplete"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Delivery Tone:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text)",
                  textAlign: "right",
                  textTransform: "capitalize",
                }}
              >
                {lessonForm.tone ? toneLabels[lessonForm.tone].label : "Not set"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Narrator Voice:</span>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--color-brand)",
                  textAlign: "right",
                }}
              >
                {selectedVoice?.displayName ?? "Aria"} (
                {voiceForm.speakingRate.toFixed(2)}×)
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Visual Theme:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text)",
                  textAlign: "right",
                }}
              >
                Warm editorial
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Recall Check:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text)",
                  textAlign: "right",
                }}
              >
                {lessonForm.includeRecallQuestions ? "Included" : "None"}
              </span>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
              }}
            >
              <span style={{ color: "var(--color-text-muted)" }}>Overrides:</span>
              <span
                style={{
                  fontWeight: 500,
                  color: "var(--color-text)",
                  textAlign: "right",
                }}
              >
                {voiceForm.pronunciationOverrides.filter(
                  (o) => o.phrase.trim() && o.replacement.trim(),
                ).length}{" "}
                active
              </span>
            </div>
          </div>

          {/* Dependency Impact Note */}
          <div
            style={{
              padding: "12px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-info-bg)",
              border: "1px solid var(--color-info-border)",
              color: "var(--color-info-fg)",
              fontSize: "12px",
              lineHeight: "16px",
              display: "flex",
              gap: "8px",
            }}
          >
            <Info size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <span>
              Saving setup establishes the instructional boundary. Existing
              downstream outlines or audio are marked out of date without
              automatic re-generation.
            </span>
          </div>

          {/* Primary Action Button */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Button
              type="button"
              variant="primary"
              size="large"
              isLoading={isSaving}
              disabled={!isFormComplete || !isFormDirty || isSaving}
              onClick={() => void handleSave()}
              style={{ width: "100%" }}
              {...(isSavedAndClean
                ? { leftIcon: <CheckCircle size={18} weight="fill" /> }
                : {})}
            >
              {isSaving
                ? "Saving setup…"
                : isSavedAndClean
                  ? "Saved"
                  : savedLessonConfig === null
                    ? "Save setup"
                    : "Save changes"}
            </Button>

            {savedLessonConfig !== null && (
              <Button
                type="button"
                variant="secondary"
                size="large"
                isLoading={stageNavigation.isNavigating}
                disabled={isSaving || stageNavigation.isNavigating}
                {...(stageNavigation.isNavigating
                  ? {}
                  : { rightIcon: <ArrowRight size={16} /> })}
                onClick={() => {
                  stageNavigation.navigate(`/workspace/${projectId}/objectives`);
                }}
                style={{
                  width: "100%",
                  ...(isSavedAndClean
                    ? {
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-brand)",
                        borderColor: "var(--color-brand)",
                      }
                    : {}),
                }}
              >
                {stageNavigation.isNavigating
                  ? "Opening objectives…"
                  : "Continue to objectives"}
              </Button>
            )}

            <span
              aria-live="polite"
              style={{
                fontSize: "12px",
                // Colour follows the message that actually renders, so the
                // "fill in required fields" nudge stays neutral.
                color: !isFormComplete
                  ? "var(--color-text-muted)"
                  : isFormDirty
                    ? "var(--color-warning-fg)"
                    : isSavedAndClean
                      ? "var(--color-success-fg)"
                      : "var(--color-text-muted)",
                textAlign: "center",
                minHeight: "16px",
              }}
            >
              {!isFormComplete
                ? "Fill all required fields to save setup."
                : isSaving
                  ? "Saving your changes…"
                  : isFormDirty
                    ? "You have unsaved changes."
                    : isSavedAndClean
                      ? "Everything on this page is saved."
                      : ""}
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
};
