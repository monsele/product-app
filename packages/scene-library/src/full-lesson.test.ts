import { describe, expect, it } from "vitest";
import { lessonSpecSchema } from "@avlp/schemas";
import {
  calculateLessonTimeline,
  fullLessonCompositionPropsSchema,
  getLessonDurationInFrames,
  getTimelineSegmentAtFrame,
} from "./full-lesson.js";
import {
  fivePagePhotosynthesisSourceFixture,
  photosynthesisThreeMinuteLesson,
  photosynthesisThreeMinutePreview,
} from "./full-lesson.fixture.js";

describe("three-minute photosynthesis full lesson", () => {
  it("validates the source-grounded LessonSpec and original five-page fixture", () => {
    expect(lessonSpecSchema.parse(photosynthesisThreeMinuteLesson)).toEqual(
      photosynthesisThreeMinuteLesson,
    );
    expect(fivePagePhotosynthesisSourceFixture.license).toMatch(/Original/);
    expect(fivePagePhotosynthesisSourceFixture.pages).toHaveLength(5);
    expect(
      photosynthesisThreeMinuteLesson.scenes.map((scene) => scene.template),
    ).toEqual(
      expect.arrayContaining([
        "hook",
        "definition",
        "input-process-output",
        "summary",
      ]),
    );
    expect(
      photosynthesisThreeMinuteLesson.scenes.every(
        (scene) => scene.sourceRefs.length > 0,
      ),
    ).toBe(true);
  });

  it("calculates a contiguous 30fps timeline that exactly matches three minutes", () => {
    const timeline = calculateLessonTimeline(photosynthesisThreeMinuteLesson);
    expect(timeline).toHaveLength(6);
    expect(timeline[0]).toMatchObject({ durationInFrames: 900, startFrame: 0 });
    expect(timeline.at(-1)).toMatchObject({ endFrameExclusive: 5400 });
    expect(getLessonDurationInFrames(photosynthesisThreeMinuteLesson)).toBe(
      180 * 30,
    );
    expect(getTimelineSegmentAtFrame(timeline, 900)?.sceneId).toBe(
      photosynthesisThreeMinuteLesson.scenes[1]?.id,
    );
  });

  it("uses continuous captions and one deterministic silence track per scene", () => {
    const parsed = fullLessonCompositionPropsSchema.parse(
      photosynthesisThreeMinutePreview,
    );
    expect(parsed.narrationTracks).toHaveLength(parsed.lesson.scenes.length);
    expect(
      parsed.narrationTracks.every(
        (track) => track.kind === "deterministic-silence",
      ),
    ).toBe(true);
    for (const [index, cue] of parsed.captions.entries()) {
      const previous = parsed.captions[index - 1];
      expect(cue.startFrame).toBe(
        previous === undefined ? 0 : previous.endFrame,
      );
    }
    expect(parsed.captions.at(-1)?.endFrame).toBe(
      getLessonDurationInFrames(parsed.lesson),
    );
  });

  it("rejects caption timing that could drift from its scene", () => {
    const unsafe = {
      ...photosynthesisThreeMinutePreview,
      captions: [
        {
          ...photosynthesisThreeMinutePreview.captions[0]!,
          endFrame: 899,
        },
        ...photosynthesisThreeMinutePreview.captions.slice(1),
      ],
    };
    expect(fullLessonCompositionPropsSchema.safeParse(unsafe).success).toBe(
      false,
    );
  });
});
