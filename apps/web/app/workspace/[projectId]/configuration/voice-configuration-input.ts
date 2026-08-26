import type { PronunciationOverride, VoiceCatalogEntry, VoiceConfiguration } from "@avlp/schemas";

export const maxPronunciationOverrides = 20;

export interface VoiceFormState {
  voiceId: VoiceCatalogEntry["id"];
  speakingRate: number;
  pronunciationOverrides: PronunciationOverride[];
}

export function defaultVoiceFormState(): VoiceFormState {
  return {
    voiceId: "english-aria",
    speakingRate: 1.0,
    pronunciationOverrides: [],
  };
}

export function formStateFromVoiceConfiguration(
  config: VoiceConfiguration,
): VoiceFormState {
  return {
    voiceId: config.voiceId,
    speakingRate: config.speakingRate,
    pronunciationOverrides: [...config.pronunciationOverrides],
  };
}

export function selectVoice(
  current: VoiceConfiguration | null,
  voiceId: VoiceConfiguration["voiceId"],
): VoiceConfiguration["voiceId"] {
  return voiceId ?? current?.voiceId ?? "english-aria";
}

export function addPronunciationOverride(
  entries: readonly PronunciationOverride[],
): PronunciationOverride[] {
  return entries.length >= maxPronunciationOverrides
    ? [...entries]
    : [...entries, { phrase: "", replacement: "" }];
}

export function formatSpeakingRate(rate: number): string {
  const rounded = Number(rate.toFixed(2));
  if (rounded === 1.0) return "1.00× (Standard)";
  if (rounded < 1.0) return `${rounded.toFixed(2)}× (Slower)`;
  return `${rounded.toFixed(2)}× (Faster)`;
}

export function hasVoiceChanges(
  saved: VoiceConfiguration | null,
  current: VoiceFormState,
): boolean {
  if (saved === null) {
    return (
      current.voiceId !== "english-aria" ||
      current.speakingRate !== 1.0 ||
      current.pronunciationOverrides.length > 0
    );
  }
  if (saved.voiceId !== current.voiceId || saved.speakingRate !== current.speakingRate) {
    return true;
  }
  const cleanSaved = saved.pronunciationOverrides.filter(
    (e) => e.phrase.trim() && e.replacement.trim(),
  );
  const cleanCurrent = current.pronunciationOverrides.filter(
    (e) => e.phrase.trim() && e.replacement.trim(),
  );
  if (cleanSaved.length !== cleanCurrent.length) return true;
  return cleanSaved.some(
    (item, idx) =>
      item.phrase !== cleanCurrent[idx]?.phrase ||
      item.replacement !== cleanCurrent[idx]?.replacement,
  );
}

export const fallbackVoices: VoiceCatalogEntry[] = [
  {
    id: "english-aria",
    displayName: "Aria",
    description: "Warm, clear, and natural English delivery.",
    language: "en-US",
    previewUrl: "/voices/english-aria/preview",
  },
  {
    id: "english-james",
    displayName: "James",
    description: "Calm, steady, and conversational tone.",
    language: "en-US",
    previewUrl: "/voices/english-james/preview",
  },
  {
    id: "english-luna",
    displayName: "Luna",
    description: "Bright, engaging, and expressive narrative pacing.",
    language: "en-US",
    previewUrl: "/voices/english-luna/preview",
  },
];
