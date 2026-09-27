"use client";

/**
 * ST-103 — the background sound-bed picker.
 *
 * Follows the ST-102 style-pack selector: a real radio group whose first
 * option ("No background music") is the default and the value every lesson
 * configured before ST-103 reads back as. Each catalog track can be auditioned
 * from its short-lived signed URL; one shared audio element plays at a time.
 * The choice only takes effect for a lesson version saved after it, which
 * pins the exact track.
 */

import React, { useEffect, useRef, useState } from "react";
import type { SoundBedCatalogItem, SoundBedChoice } from "@avlp/schemas";

export function soundBedLabel(
  value: SoundBedChoice,
  tracks: readonly Pick<SoundBedCatalogItem, "trackId" | "title">[],
): string {
  if (value === "none") return "No background music";
  return tracks.find((track) => track.trackId === value)?.title ?? value;
}

const moodLabels: Record<SoundBedCatalogItem["moodTags"][number], string> = {
  bright: "Bright",
  calm: "Calm",
  focused: "Focused",
  playful: "Playful",
  reflective: "Reflective",
  warm: "Warm",
};

export function SoundBedSelector({
  tracks,
  value,
  disabled,
  catalogUnavailable = false,
  onChange,
}: {
  tracks: readonly SoundBedCatalogItem[];
  value: SoundBedChoice;
  disabled: boolean;
  catalogUnavailable?: boolean;
  onChange: (value: SoundBedChoice) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [auditionError, setAuditionError] = useState<string | null>(null);

  useEffect(
    () => () => {
      audioRef.current?.pause();
    },
    [],
  );

  const audition = (track: SoundBedCatalogItem): void => {
    const audio = audioRef.current;
    if (audio === null) return;
    setAuditionError(null);
    if (playing === track.trackId) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = track.auditionUrl;
    audio.currentTime = 0;
    setPlaying(track.trackId);
    void audio.play().catch(() => {
      setPlaying(null);
      setAuditionError(track.trackId);
    });
  };

  const options: readonly {
    value: SoundBedChoice;
    title: string;
    detail: string;
    track?: SoundBedCatalogItem;
  }[] = [
    {
      value: "none",
      title: "No background music",
      detail: "Narration only, exactly as before.",
    },
    ...tracks.map((track) => ({
      value: track.trackId,
      title: track.title,
      detail: `${track.moodTags.map((mood) => moodLabels[mood]).join(" · ")} · plays quietly and dips under narration`,
      track,
    })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <audio
        data-testid="sound-bed-audition"
        onEnded={() => setPlaying(null)}
        preload="none"
        ref={audioRef}
      />
      <div
        aria-label="Background sound"
        role="radiogroup"
        style={{ display: "flex", flexDirection: "column", gap: "8px" }}
      >
        {options.map((option) => {
          const isSelected = value === option.value;
          const isPlaying =
            option.track !== undefined && playing === option.track.trackId;
          return (
            <div
              key={option.value}
              style={{
                alignItems: "stretch",
                display: "flex",
                gap: "8px",
              }}
            >
              <button
                aria-checked={isSelected}
                aria-disabled={disabled}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onChange(option.value);
                }}
                role="radio"
                style={{
                  backgroundColor: isSelected
                    ? "var(--color-surface-brand)"
                    : "var(--color-surface-subtle)",
                  border: isSelected
                    ? "1.5px solid var(--color-brand)"
                    : "1px solid var(--color-border)",
                  borderRadius: "var(--radius-control)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  display: "flex",
                  flex: 1,
                  flexDirection: "column",
                  gap: "3px",
                  opacity: disabled ? 0.6 : 1,
                  padding: "12px 14px",
                  textAlign: "left",
                  transition: "all var(--motion-quick) var(--motion-easing)",
                }}
                type="button"
              >
                <span
                  style={{
                    color: isSelected
                      ? "var(--color-brand)"
                      : "var(--color-text)",
                    fontSize: "13px",
                    fontWeight: isSelected ? 600 : 500,
                  }}
                >
                  {option.title}
                </span>
                <span
                  style={{
                    color: "var(--color-text-muted)",
                    fontSize: "11px",
                    lineHeight: "15px",
                  }}
                >
                  {option.detail}
                </span>
              </button>
              {option.track === undefined ? null : (
                <button
                  aria-label={`${isPlaying ? "Stop" : "Play"} a preview of ${option.title}`}
                  aria-pressed={isPlaying}
                  onClick={() => audition(option.track!)}
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-control)",
                    color: "var(--color-text)",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 500,
                    minWidth: "72px",
                    padding: "0 12px",
                  }}
                  type="button"
                >
                  {isPlaying ? "Stop" : "Play"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {auditionError === null ? null : (
        <p
          role="alert"
          style={{ color: "var(--color-danger-text)", fontSize: "12px", margin: 0 }}
        >
          That preview could not be played. Reload the page to refresh it.
        </p>
      )}
      {catalogUnavailable ? (
        <p
          role="status"
          style={{ color: "var(--color-text-muted)", fontSize: "12px", margin: 0 }}
        >
          The music catalog is unavailable right now. Your saved choice is
          kept.
        </p>
      ) : null}
      <p
        style={{ color: "var(--color-text-muted)", fontSize: "12px", margin: 0 }}
      >
        Saved lesson versions keep the music they were saved with.
      </p>
    </div>
  );
}
