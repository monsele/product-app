import type { PronunciationOverride, VoiceConfiguration } from "@avlp/schemas";

export const maxPronunciationOverrides = 20;
export function selectVoice(current: VoiceConfiguration | null, voiceId: VoiceConfiguration["voiceId"]): VoiceConfiguration["voiceId"] {
  return voiceId ?? current?.voiceId ?? "english-aria";
}
export function addPronunciationOverride(entries: readonly PronunciationOverride[]): PronunciationOverride[] {
  return entries.length >= maxPronunciationOverrides ? [...entries] : [...entries, { phrase: "", replacement: "" }];
}
