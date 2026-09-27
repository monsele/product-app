/**
 * ST-103 — the optional background sound bed.
 *
 * The bed is audio only: it never changes scene timing (ADR-004), and it is
 * absent unless the composition props carry a resolved `soundBed`. Its volume
 * is a pure function of the frame and the narration segment timeline that the
 * composition already holds — the caption cues, which are aligned to the
 * measured narration — so preview and render produce the same envelope for the
 * same props (CR-04).
 */
import { Audio, Sequence } from "remotion";
import React, { type JSX } from "react";
import { z } from "zod";
import { videoTheme } from "@avlp/design-system/video-theme";

const LOOPBACK_HTTP_URL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/[^\s]*$/i;

export const soundBedCompositionPropSchema = z
  .object({
    trackId: z.string().regex(/^[a-z][a-z0-9-]{2,63}$/),
    /** A short-lived signed URL resolved at execution time; never persisted. */
    src: z
      .string()
      .url()
      .refine(
        (value) =>
          /^https:\/\/[^\s]+$/i.test(value) ||
          LOOPBACK_HTTP_URL_PATTERN.test(value),
        "A sound bed must be a signed HTTPS URL.",
      ),
    /** Exact media duration in frames. A looping track is repeated on this
     * boundary, which the catalog guarantees is a whole number of frames. */
    durationInFrames: z.number().int().positive(),
    loops: z.boolean(),
  })
  .strict();
export type SoundBedCompositionProp = z.infer<
  typeof soundBedCompositionPropSchema
>;

export type SoundBedMixTokens = Readonly<{
  level: number;
  duckedLevel: number;
  duckRampMs: number;
  fadeInMs: number;
  fadeOutMs: number;
}>;

export type NarrationSegment = Readonly<{
  startFrame: number;
  endFrameExclusive: number;
}>;

/**
 * The spans in which narration is speaking, from the caption cues. Cues closer
 * together than two duck ramps are merged, because the bed could not return
 * to its full level between them anyway and would only pump.
 */
export function narrationSegmentsFromCaptions(
  captions: readonly Readonly<{ startFrame: number; endFrame: number }>[],
  fps: number,
  tokens: SoundBedMixTokens = videoTheme.audio.soundBed,
): readonly NarrationSegment[] {
  const bridgeFrames = (2 * tokens.duckRampMs * fps) / 1_000;
  const sorted = [...captions].sort(
    (left, right) =>
      left.startFrame - right.startFrame || left.endFrame - right.endFrame,
  );
  const segments: { startFrame: number; endFrameExclusive: number }[] = [];
  for (const cue of sorted) {
    const previous = segments.at(-1);
    if (
      previous !== undefined &&
      cue.startFrame - previous.endFrameExclusive < bridgeFrames
    )
      previous.endFrameExclusive = Math.max(
        previous.endFrameExclusive,
        cue.endFrame,
      );
    else
      segments.push({
        startFrame: cue.startFrame,
        endFrameExclusive: cue.endFrame,
      });
  }
  return Object.freeze(segments.map((segment) => Object.freeze(segment)));
}

/**
 * The bed's linear gain at `frame`.
 *
 * - Full level is `tokens.level`; during a narration segment it is exactly
 *   `tokens.duckedLevel`. The ramp down *ends* on the segment's first frame
 *   and the ramp up *starts* on its exclusive end frame, so the bed is fully
 *   ducked for every narrated frame.
 * - Overlapping ramps take the lower gain.
 * - A linear fade-in from the first frame and a fade-out that reaches silence
 *   on the last frame multiply the result.
 */
export function soundBedVolumeAtFrame(input: {
  frame: number;
  fps: number;
  totalFrames: number;
  segments: readonly NarrationSegment[];
  tokens?: SoundBedMixTokens;
}): number {
  const tokens = input.tokens ?? videoTheme.audio.soundBed;
  const msPerFrame = 1_000 / input.fps;
  const at = input.frame * msPerFrame;
  let gain = tokens.level;
  for (const segment of input.segments) {
    const start = segment.startFrame * msPerFrame;
    const end = segment.endFrameExclusive * msPerFrame;
    let segmentGain = tokens.level;
    if (at >= start && at < end) segmentGain = tokens.duckedLevel;
    else if (at < start && at >= start - tokens.duckRampMs)
      segmentGain =
        tokens.level -
        ((tokens.level - tokens.duckedLevel) *
          (at - (start - tokens.duckRampMs))) /
          tokens.duckRampMs;
    else if (at >= end && at < end + tokens.duckRampMs)
      segmentGain =
        tokens.duckedLevel +
        ((tokens.level - tokens.duckedLevel) * (at - end)) /
          tokens.duckRampMs;
    gain = Math.min(gain, segmentGain);
  }
  const lastFrameMs = Math.max(0, input.totalFrames - 1) * msPerFrame;
  const fadeIn = Math.min(1, Math.max(0, at / tokens.fadeInMs));
  const fadeOut = Math.min(
    1,
    Math.max(0, (lastFrameMs - at) / tokens.fadeOutMs),
  );
  return gain * fadeIn * fadeOut;
}

/**
 * The bed track. Looping is explicit — one `Sequence` per repeat — rather
 * than delegated to the media element, so every repeat starts on a known
 * frame and the volume callback can be written against the lesson timeline.
 */
export function SoundBedTrack({
  bed,
  captions,
  fps,
  onAudioError,
  totalFrames,
}: Readonly<{
  bed: SoundBedCompositionProp;
  captions: readonly Readonly<{ startFrame: number; endFrame: number }>[];
  fps: number;
  /** Lets the preview renew an expired signed URL, as it does for narration. */
  onAudioError?: () => void;
  totalFrames: number;
}>): JSX.Element {
  const segments = narrationSegmentsFromCaptions(captions, fps);
  const repeatFrames = bed.loops ? bed.durationInFrames : totalFrames;
  const repeats = bed.loops ? Math.ceil(totalFrames / repeatFrames) : 1;
  return (
    <>
      {Array.from({ length: repeats }, (_, index) => {
        const from = index * repeatFrames;
        return (
          <Sequence
            durationInFrames={Math.min(repeatFrames, totalFrames - from)}
            from={from}
            key={`sound-bed-${index}`}
            layout="none"
            name={`Sound bed ${index + 1}`}
          >
            <Audio
              onError={onAudioError}
              src={bed.src}
              volume={(localFrame) =>
                soundBedVolumeAtFrame({
                  fps,
                  frame: from + localFrame,
                  segments,
                  totalFrames,
                })
              }
            />
          </Sequence>
        );
      })}
    </>
  );
}
