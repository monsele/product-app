"use client";

import { useCallback, useEffect, useState } from "react";
import { voiceConfigurationResponseSchema, type PronunciationOverride, type VoiceCatalogEntry } from "@avlp/schemas";
import { addPronunciationOverride, maxPronunciationOverrides, selectVoice } from "./voice-configuration-input";

const api = (path: string) => `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

export function VoiceConfigurationForm({ projectId }: { projectId: string }) {
  const [voices, setVoices] = useState<VoiceCatalogEntry[]>([]);
  const [voiceId, setVoiceId] = useState("english-aria");
  const [rate, setRate] = useState(1);
  const [version, setVersion] = useState(0);
  const [overrides, setOverrides] = useState<PronunciationOverride[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [catalogResponse, configResponse] = await Promise.all([fetch(api("/voices"), { credentials: "include" }), fetch(api(`/projects/${encodeURIComponent(projectId)}/voice-configuration`), { credentials: "include" })]);
    const catalog: unknown = await catalogResponse.json(); const config: unknown = await configResponse.json();
    if (!catalogResponse.ok || !configResponse.ok || typeof catalog !== "object" || catalog === null || !("voices" in catalog) || !Array.isArray(catalog.voices)) throw new Error("Unable to load voice settings.");
    setVoices(catalog.voices as VoiceCatalogEntry[]);
    const parsed = voiceConfigurationResponseSchema.safeParse(config);
    if (parsed.success && parsed.data.configuration) { setVoiceId(selectVoice(parsed.data.configuration, parsed.data.configuration.voiceId)); setRate(parsed.data.configuration.speakingRate); setVersion(parsed.data.configuration.version); setOverrides(parsed.data.configuration.pronunciationOverrides); }
  }, [projectId]);
  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to load voice settings.")); }, [load]);
  async function save() {
    const pronunciationOverrides = overrides.filter((entry) => entry.phrase.trim() && entry.replacement.trim()).map((entry) => ({ phrase: entry.phrase.trim(), replacement: entry.replacement.trim() }));
    const response = await fetch(api(`/projects/${encodeURIComponent(projectId)}/voice-configuration`), { method: "PUT", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: version, voiceId, speakingRate: rate, pronunciationOverrides }) });
    const payload: unknown = await response.json(); const parsed = voiceConfigurationResponseSchema.safeParse(payload);
    if (!response.ok || !parsed.success || !parsed.data.configuration) throw new Error("Unable to save voice settings.");
    setVersion(parsed.data.configuration.version); setMessage("Voice settings saved. Existing audio and captions are marked out of date; nothing was regenerated.");
  }
  const updateOverride = (index: number, field: keyof PronunciationOverride, value: string) => setOverrides((current) => current.map((entry, entryIndex) => entryIndex === index ? { ...entry, [field]: value } : entry));
  return <section aria-labelledby="voice-heading"><h2 id="voice-heading">Narrator voice</h2><p>Choose an English narrator and preview each approved voice.</p>{voices.map((voice) => <label key={voice.id}><input type="radio" name="voice" checked={voiceId === voice.id} onChange={() => setVoiceId(selectVoice(null, voice.id))} />{voice.displayName} — {voice.description}<audio controls preload="none" src={api(new URL(voice.previewUrl).pathname)} /></label>)}<label>Speaking rate <input aria-label="Speaking rate" type="range" min="0.75" max="1.25" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} /> {rate.toFixed(2)}×</label><fieldset><legend>Pronunciation overrides</legend>{overrides.map((entry, index) => <div key={`${index}-${entry.phrase}`}><label>Phrase <input value={entry.phrase} maxLength={80} onChange={(event) => updateOverride(index, "phrase", event.target.value)} /></label><label>Say it as <input value={entry.replacement} maxLength={120} onChange={(event) => updateOverride(index, "replacement", event.target.value)} /></label><button type="button" onClick={() => setOverrides((current) => current.filter((_, entryIndex) => entryIndex !== index))}>Remove</button></div>)}<button type="button" disabled={overrides.length >= maxPronunciationOverrides} onClick={() => setOverrides(addPronunciationOverride)}>Add pronunciation override</button></fieldset><button type="button" onClick={() => void save().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Unable to save voice settings."))}>Save voice settings</button>{message ? <p role="status">{message}</p> : null}</section>;
}
