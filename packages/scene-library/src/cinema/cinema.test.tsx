import {
  cinemaBeatRevealFrames,
  cinemaEstablishFrames,
  creativeDesignContrastRatio,
  creativeDesignPackDefaultSettings,
  creativeDesignPackIds,
  planCinemaDesign,
  resolveCinemaBeatFrames,
  sceneSpecSchema,
  type CinemaBeat,
  type CinemaCaptionCue,
  type CreativeDesignPackId,
  type SceneSpec,
} from "@avlp/schemas";
import { createElement, type JSX } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { assetAssistedDefinitionFixture } from "../definition-scene.fixtures.js";
import { photosynthesisThreeMinuteLesson } from "../full-lesson.fixture.js";
import type { ResolvedSceneAsset } from "../scene-registry.js";
import {
  CinemaBeatProvider,
  createBeatTimeline,
  useCinemaBeats,
  type CinemaBeatTimeline,
} from "./beats.js";
import { cinemaCompositionComponents } from "./cinema-scene.js";
import {
  resolveCinemaHero,
  resolveCinemaItemIcons,
  resolveCinemaSubjectImages,
} from "./content.js";
import { resolveCinemaIdentity, surfaceFill } from "./identity.js";
import { estimateLines, fitText, fitTextGroup } from "./text-fit.js";

const seed = "0123456789abcdef";

describe("ST-109 text fitting", () => {
  const base = { width: 600, maxLines: 2, maxSize: 64, minSize: 24, glyphWidth: 0.56 };

  it("chooses the largest size that fits and reports a miss at the floor", () => {
    const short = fitText({ ...base, text: "Photosynthesis" });
    expect(short).toMatchObject({ fontSize: 64, fits: true });
    const long = fitText({ ...base, text: "word ".repeat(80) });
    expect(long).toMatchObject({ fontSize: 24, fits: false });
    expect(long.lines).toBeGreaterThan(2);
    const sentence = "The process plants use to make glucose using light energy";
    const mid = fitText({ ...base, text: sentence });
    expect(mid.fits).toBe(true);
    expect(mid.fontSize).toBeLessThan(64);
    // One step larger would not fit: the choice is the largest, not merely a fit.
    expect(estimateLines(sentence, mid.fontSize + 2, 600, 0.56)).toBeGreaterThan(2);
  });

  it("respects the height budget", () => {
    const fit = fitText({ ...base, maxLines: 6, text: "word ".repeat(30), maxHeight: 120, lineHeight: 1.2 });
    expect(fit.fits).toBe(true);
    expect(fit.lines * fit.fontSize * 1.2).toBeLessThanOrEqual(120);
  });

  it("shrinks rather than break a long word mid-word", () => {
    // A single serif display word in a narrow column: at the size the line
    // estimate alone allows, the real face overruns and the browser breaks it.
    const request = { text: "Evaporation", width: 430, maxLines: 3, maxSize: 96, minSize: 36, glyphWidth: 0.52 };
    const fit = fitText(request);
    expect(fit.fits).toBe(true);
    expect(estimateLines(request.text, fit.fontSize, request.width, request.glyphWidth)).toBe(1);
    expect(fit.fontSize).toBeLessThan(96);
    // Hyphenated words may break at the hyphen, so they do not force a shrink.
    expect(fitText({ ...request, text: "solar-powered", width: 300 }).fontSize).toBeGreaterThan(
      fitText({ ...request, text: "solarpowered", width: 300 }).fontSize,
    );
  });

  it("wraps no worse as the box widens", () => {
    const text = "Leaves take in carbon dioxide from the air through tiny pores";
    let previous = Number.POSITIVE_INFINITY;
    for (let width = 200; width <= 1600; width += 50) {
      const lines = estimateLines(text, 32, width, 0.56);
      expect(lines).toBeLessThanOrEqual(previous);
      previous = lines;
    }
  });

  it("gives a group one size no larger than any member's own fit", () => {
    const texts = ["Sunlight", "Water", "Carbon dioxide enters the leaf through its pores"];
    const group = fitTextGroup(texts, { ...base, width: 360, maxLines: 3 });
    for (const text of texts)
      expect(group.fontSize).toBeLessThanOrEqual(fitText({ ...base, width: 360, maxLines: 3, text }).fontSize);
    expect(group.fits).toBe(true);
  });
});

// ---------------------------------------------------------------------------

/** Deterministic palettes that pass the manifest's contrast preflight. */
function preflightPalettes(count: number) {
  let state = 0x2545f491;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const hex = () =>
    `#${Array.from({ length: 3 }, () => Math.floor(next() * 256).toString(16).padStart(2, "0")).join("")}`;
  const palettes = [];
  while (palettes.length < count) {
    const colors = { background: hex(), surface: hex(), text: hex(), accent: hex(), diagramEmphasis: hex() };
    if (
      creativeDesignContrastRatio(colors.text, colors.background) >= 4.5 &&
      creativeDesignContrastRatio(colors.text, colors.surface) >= 4.5 &&
      creativeDesignContrastRatio(colors.accent, colors.background) >= 3
    )
      palettes.push(colors);
  }
  return palettes;
}

describe("ST-108 identity contrast", () => {
  const check = (packId: CreativeDesignPackId, colors = creativeDesignPackDefaultSettings[packId].colors) => {
    const identity = resolveCinemaIdentity(packId, { ...creativeDesignPackDefaultSettings[packId], colors });
    const c = identity.colors;
    const label = `${packId} ${JSON.stringify(colors)}`;
    // Muted (secondary) text sits on the page and on cards.
    expect(creativeDesignContrastRatio(c.muted, c.background), label).toBeGreaterThanOrEqual(4.5);
    expect(creativeDesignContrastRatio(c.muted, c.surface), label).toBeGreaterThanOrEqual(4.5);
    expect(creativeDesignContrastRatio(c.text, surfaceFill(identity, "plain")), label).toBeGreaterThanOrEqual(4.5);
    // Text drawn on an accent fill uses onAccent.
    expect(creativeDesignContrastRatio(c.onAccent, c.accent), label).toBeGreaterThanOrEqual(4.5);
    // Accent-coloured text is only ever large (kickers, emphasised display
    // words, 26px+ bold labels), so WCAG's 3:1 large-text threshold applies.
    expect(creativeDesignContrastRatio(c.accent, c.background), label).toBeGreaterThanOrEqual(3);
  };

  it("keeps every default identity readable", () => {
    for (const packId of creativeDesignPackIds) check(packId);
  });

  it("keeps any preflight-valid palette readable in every identity", () => {
    const palettes = preflightPalettes(120);
    for (const packId of creativeDesignPackIds) for (const colors of palettes) check(packId, colors);
  });
});

// ---------------------------------------------------------------------------

const lesson = photosynthesisThreeMinuteLesson;
const scenes = lesson.scenes.map((scene) => ({ ...scene, durationSeconds: 12 }));

/** One scene-relative caption cue per narration sentence, shared by length. */
function sentenceCues(narration: string, durationInFrames: number): CinemaCaptionCue[] {
  const sentences = narration.match(/[^.!?]+[.!?]*/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  let cursor = 0;
  return sentences.map((text, index) => {
    const end = index === sentences.length - 1 ? durationInFrames : cursor + Math.round((durationInFrames * text.length) / total);
    const cue = { startFrame: cursor, endFrame: end, text };
    cursor = end;
    return cue;
  });
}

function timelineAt(beats: readonly CinemaBeat[], frames: readonly number[], frame: number, durationInFrames: number) {
  return createBeatTimeline({ beats, frames, frame, durationInFrames, energy: "balanced" });
}

describe("ST-111 beat timeline", () => {
  it("starts each target at its earliest beat and leaves unanchored targets at establish", () => {
    const beat = (target: string, sentence: number): CinemaBeat => ({
      target: target as CinemaBeat["target"],
      motion: "sequential-reveal",
      anchor: { sentence },
    });
    const timeline = timelineAt([beat("item-1", 0), beat("item-2", 1), beat("item-1", 2)], [30, 90, 20], 0, 300);
    expect(timeline.starts.get("item-1")).toBe(20);
    expect(timeline.starts.get("item-2")).toBe(90);

    const probe: { beats?: ReturnType<typeof useCinemaBeats> } = {};
    const Probe = () => {
      probe.beats = useCinemaBeats();
      return null;
    };
    const at = (frame: number) => {
      renderToStaticMarkup(
        <CinemaBeatProvider timeline={{ ...timeline, frame } as CinemaBeatTimeline}>
          <Probe />
        </CinemaBeatProvider>,
      );
      return probe.beats!;
    };
    expect(at(19).reveal("item-2")).toBe(0);
    expect(at(90).reveal("item-2")).toBe(0);
    expect(at(90 + cinemaBeatRevealFrames).reveal("item-2")).toBe(1);
    expect(at(0).startOf("headline")).toBe(cinemaEstablishFrames);
    expect(at(cinemaEstablishFrames + cinemaBeatRevealFrames).reveal("headline")).toBe(1);
    expect(at(19).activeItem(2)).toBe(0);
    expect(at(40).activeItem(2)).toBe(1);
    expect(at(120).activeItem(2)).toBe(2);
    expect(() => renderToStaticMarkup(createElement(Probe))).toThrow(/CinemaBeatProvider/u);
  });

  for (const packId of ["everyday", "prism"] as const) {
    it(`seeks to any frame exactly as playing reaches it (${packId})`, () => {
      const manifest = planCinemaDesign({ packId, scenes, seed });
      const identity = resolveCinemaIdentity(packId, manifest.settings);
      for (const scene of scenes) {
        const design = manifest.scenes[scene.id]!;
        const durationInFrames = scene.durationSeconds * 30;
        const frames = resolveCinemaBeatFrames({
          beats: design.beats,
          narration: scene.narration,
          cues: sentenceCues(scene.narration, durationInFrames),
          durationInFrames,
        });
        const props = {
          scene,
          design,
          identity,
          hero: resolveCinemaHero({ scene, design, assets: {}, mode: "render" }),
          itemIcons: resolveCinemaItemIcons({ scene, assets: {}, mode: "render" }),
          sequenceIcons: resolveCinemaItemIcons({ scene, assets: {}, mode: "render", forSequence: true }),
          subjects: resolveCinemaSubjectImages({ scene, assets: {}, mode: "render" }),
        };
        const Composition = cinemaCompositionComponents[design.compositionId] as (p: typeof props) => JSX.Element;
        const reveals: Record<string, number>[] = [];
        const Probe = () => {
          const beats = useCinemaBeats();
          reveals.push(Object.fromEntries(design.beats.map((beat) => [beat.target, beats.reveal(beat.target)])));
          return null;
        };
        const render = (frame: number) =>
          renderToStaticMarkup(
            <CinemaBeatProvider timeline={timelineAt(design.beats, frames, frame, durationInFrames)}>
              <Composition {...props} />
              <Probe />
            </CinemaBeatProvider>,
          );
        const played = new Map<number, string>();
        for (let frame = 0; frame < durationInFrames; frame += 5) played.set(frame, render(frame));
        // Every beat target only ever moves forward while playing.
        for (let index = 1; index < reveals.length; index += 1)
          for (const [target, value] of Object.entries(reveals[index]!))
            expect(value, `${scene.id} ${target}`).toBeGreaterThanOrEqual(reveals[index - 1]![target]!);
        // Everything has landed before the scene ends.
        for (const value of Object.values(reveals.at(-1)!)) expect(value).toBe(1);
        // Seeking backwards and out of order reproduces each played frame.
        for (const frame of [295, 0, 150, 45, 240, 5, 120])
          expect(render(frame), `${scene.id} @ ${frame}`).toBe(played.get(frame));
      }
    });
  }
});

// ---------------------------------------------------------------------------

describe("ST-108 picture resolution", () => {
  const scene = sceneSpecSchema.parse(assetAssistedDefinitionFixture) as SceneSpec;
  const heroId = "00000000-0000-7000-8000-00000000beef";
  const pinned = (packId: CreativeDesignPackId) =>
    planCinemaDesign({
      packId,
      scenes: [scene],
      seed,
      imagery: { [scene.id]: { assetId: heroId, origin: "generated", altText: "A puddle drying" } },
    }).scenes[scene.id]!;
  const unpinned = planCinemaDesign({ packId: "everyday", scenes: [scene], seed }).scenes[scene.id]!;
  const picture = (assetId: string): ResolvedSceneAsset => ({
    assetId,
    altText: "Picture",
    source: "library",
    src: "data:image/png;base64,iVBORw0KGgo=",
  });
  const boundAssets = Object.fromEntries(scene.assetBindings.map((binding) => [binding.assetId, picture(binding.assetId)]));

  it("shows the pinned illustration when it resolves", () => {
    const hero = resolveCinemaHero({ scene, design: pinned("everyday"), assets: { ...boundAssets, [heroId]: picture(heroId) }, mode: "render" });
    expect(hero).toMatchObject({ kind: "image", alt: "A puddle drying", evidence: false });
  });

  it("refuses to render a missing pinned illustration but lets preview continue", () => {
    expect(() => resolveCinemaHero({ scene, design: pinned("everyday"), assets: boundAssets, mode: "render" })).toThrow(
      /Scene render blocked for .*pinned illustration/u,
    );
    const preview = resolveCinemaHero({ scene, design: pinned("everyday"), assets: boundAssets, mode: "preview" });
    // Preview falls through to the scene's own bound picture, never a gap.
    expect(preview.kind).toBe("image");
  });

  it("refuses to render a missing bound picture and falls back to the motif in preview", () => {
    expect(() => resolveCinemaHero({ scene, design: unpinned, assets: {}, mode: "render" })).toThrow(/Scene render blocked/u);
    expect(resolveCinemaHero({ scene, design: unpinned, assets: {}, mode: "preview" })).toEqual({
      kind: "motif",
      motif: unpinned.imagery.motif,
    });
    expect(resolveCinemaHero({ scene, design: unpinned, assets: boundAssets, mode: "render" }).kind).toBe("image");
  });
});
