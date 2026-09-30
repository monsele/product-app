import {
  captionMsToFrame,
  cinemaCaptionsSha256,
  narrationSentences,
  planCinemaDesign,
  resolveCinemaBeatFrames,
  resolveCinemaTiming,
  type CinemaCaptionMs,
} from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import {
  calculateLessonTimeline,
  fullLessonCompositionPropsSchema,
  sceneCaptionCues,
  type FullLessonCaptionCue,
} from "../full-lesson.js";
import { photosynthesisThreeMinuteLesson } from "../full-lesson.fixture.js";
import { getSceneFrameTiming } from "../timing.js";
import { cinemaSceneBeatFrames } from "./cinema-scene.js";

const scenes = photosynthesisThreeMinuteLesson.scenes;
const manifest = planCinemaDesign({ packId: "everyday", scenes, seed: "0123456789abcdef" });

/**
 * Half-frame boundaries where `round(ms / 1000 × 30)` and `round(ms × 30 /
 * 1000)` disagree; the preview player used the second until ST-111.
 */
const awkwardMs = [2050, 8450, 16150, 16650];

/** One cue per narration sentence, starting on the awkward boundaries. */
function sceneCaptionsMs(narration: string, durationSeconds: number): CinemaCaptionMs[] {
  const sentences = narrationSentences(narration);
  const span = (durationSeconds * 1_000 - 2_050) / Math.max(1, sentences.length);
  return sentences.map((text, index) => {
    const startMs = index < awkwardMs.length ? Math.min(awkwardMs[index]!, 2_050 + index * span) : Math.round(2_050 + index * span);
    return { startMs, endMs: Math.round(2_050 + (index + 1) * span) - 50, text };
  });
}

const captionsBySceneId = Object.fromEntries(
  scenes.map((scene) => [scene.id, sceneCaptionsMs(scene.narration, scene.durationSeconds)]),
);

describe("ST-111 preview/render/version timing parity (AC5)", () => {
  it("converts caption times with the render's arithmetic", () => {
    expect(captionMsToFrame(2050)).toBe(61);
    // The formula the preview player used until ST-111 lands a frame later.
    expect(Math.round((2050 * 30) / 1_000)).toBe(62);
  });

  it("resolves identical beat frames for the saved version, the render and the preview", () => {
    const pinned = resolveCinemaTiming({ manifest, scenes, captionsBySceneId });

    // Render: lesson-absolute cues as the render API builds them, re-split
    // per scene by the full-lesson composition.
    const renderCaptions: FullLessonCaptionCue[] = [];
    let offset = 0;
    for (const scene of scenes) {
      for (const cue of captionsBySceneId[scene.id]!)
        renderCaptions.push({
          sceneId: scene.id,
          startFrame: offset + captionMsToFrame(cue.startMs),
          endFrame: offset + captionMsToFrame(cue.endMs),
          text: cue.text,
        });
      offset += scene.durationSeconds * 30;
    }
    const timeline = calculateLessonTimeline({ scenes });

    for (const scene of scenes) {
      const design = manifest.scenes[scene.id]!;
      const segment = timeline.find((entry) => entry.sceneId === scene.id)!;
      const rendered = resolveCinemaBeatFrames({
        beats: design.beats,
        narration: scene.narration,
        cues: sceneCaptionCues(renderCaptions, segment),
        durationInFrames: segment.durationInFrames,
      });
      // Scene preview: scene-relative cues straight from the milliseconds.
      const previewed = resolveCinemaBeatFrames({
        beats: design.beats,
        narration: scene.narration,
        cues: captionsBySceneId[scene.id]!.map((cue) => ({
          startFrame: captionMsToFrame(cue.startMs),
          endFrame: captionMsToFrame(cue.endMs),
          text: cue.text,
        })),
        durationInFrames: getSceneFrameTiming(scene.durationSeconds).durationInFrames,
      });
      expect(rendered, scene.id).toEqual(pinned.scenes[scene.id]!.beatFrames);
      expect(previewed, scene.id).toEqual(pinned.scenes[scene.id]!.beatFrames);
      expect(pinned.scenes[scene.id]!.captionsSha256).toBe(
        cinemaCaptionsSha256(captionsBySceneId[scene.id]!),
      );
    }
  });

  it("draws the pinned frames of a saved version, and re-resolves only when they no longer fit", () => {
    const scene = scenes[0]!;
    const design = manifest.scenes[scene.id]!;
    const input = {
      beats: design.beats,
      narration: scene.narration,
      cues: [],
      durationInFrames: scene.durationSeconds * 30,
    };
    const pinned = design.beats.map((_, index) => 10 + index);
    expect(cinemaSceneBeatFrames({ ...input, pinned })).toEqual(pinned);
    expect(cinemaSceneBeatFrames({ ...input, pinned: pinned.slice(1) })).toEqual(
      resolveCinemaBeatFrames(input),
    );
  });

  it("accepts pinned timing only for a v2 design whose beats it matches", () => {
    const timing = resolveCinemaTiming({ manifest, scenes, captionsBySceneId });
    const props = {
      captions: [],
      lesson: { scenes },
      narrationTracks: scenes.map((scene) => ({ kind: "deterministic-silence" as const, sceneId: scene.id })),
    };
    expect(
      fullLessonCompositionPropsSchema.safeParse({ ...props, creativeDesign: manifest, cinemaTiming: timing }).success,
    ).toBe(true);
    expect(fullLessonCompositionPropsSchema.safeParse({ ...props, cinemaTiming: timing }).success).toBe(false);
    const first = scenes[0]!.id;
    const short = {
      ...timing,
      scenes: {
        ...timing.scenes,
        [first]: { ...timing.scenes[first]!, beatFrames: timing.scenes[first]!.beatFrames.slice(1) },
      },
    };
    expect(
      fullLessonCompositionPropsSchema.safeParse({ ...props, creativeDesign: manifest, cinemaTiming: short }).success,
    ).toBe(false);
  });
});
