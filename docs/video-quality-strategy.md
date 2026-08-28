# Video Quality Strategy: Remotion vs. Generative Video

**Date:** 2026-08-28
**Status:** Recommendation / discussion note
**Question:** Should we adopt generative video tools (Gemini/Veo, HeyGen) to improve output
quality, given that the pipeline currently renders exclusively through Remotion? The desired
outcome is moving diagrams, 3D motion graphics, and a more intuitive viewing experience.

---

## TL;DR

Keep Remotion as the compositor and timeline. The perceived quality gap is caused by the
scene library, not the renderer. Invest in a motion system and graph-based diagrams first,
use `@remotion/three` for the 3D requirement, and introduce generative models strictly as
**asset producers** upstream of the storyboard — never as the renderer.

---

## 1. Diagnosis: the flatness is not Remotion's fault

Remotion is just React → frames. It has no opinion about what the videos look like. The
ceiling we are hitting lives in the scene library:

- Every scene is absolutely-positioned boxes animated with `opacity` + `translateY(20px)`.
  See `packages/scene-library/src/process-scene.tsx` (lines ~147–152).
- "Diagrams" are a hardcoded map of 9 anchor positions plus a rectangle-overlap collision
  check — `packages/scene-library/src/diagram-layout.ts` (lines ~19–32). There are no
  edges, no graph structure, no paths.
- Motion is linear `interpolate` between two values. No springs, no stagger, no camera, no
  continuity across scene boundaries.

That is a slide deck with crossfades. Swapping the renderer will not fix it, because the
content model has nothing in it to animate.

---

## 2. Why Veo/Gemini and HeyGen are the wrong *primary* renderer for this product

The pipeline includes `grounding-check-job`, `document-validation-job`, and
`project-asset-validation-job`. The core product promise is that the video is faithful to
the source document. Generative video breaks that on four axes:

| Axis | Problem |
| --- | --- |
| **Text fidelity** | Veo still cannot reliably render specified text. A mislabeled diagram in a learning product is a factual error, not a cosmetic one. The entire grounding apparatus becomes unverifiable. |
| **Determinism** | `scene-regeneration-job` implies "user tweaks scene 4, re-render scene 4." Generative video returns a different clip on every call — no incremental edit, no diff, and `full-lesson-render-parity.test.ts` could not exist against a generative backend. |
| **Timing** | `timing.ts` and `scene-audio-job` sync visuals to narration frame-by-frame. Veo produces ~8s clips with no frame-level control. |
| **Cost / latency** | Per-second generative pricing on every regeneration, versus rendering on our own box. |

**HeyGen is a different category entirely.** It is a talking-head presenter. It does not
produce moving diagrams. It would be additive — a picture-in-picture presenter over the
Remotion canvas — and is worth doing only if "presenter presence" becomes a product goal.

---

## 3. Recommended work, in leverage order

### 3.1 Build a real motion system (biggest win, lowest risk)

Replace linear `interpolate` with `spring()`, staggered choreography, and — the thing that
most separates 3Blue1Brown from PowerPoint — **continuity**: an element that persists and
transforms across a scene boundary instead of fading out while a new one fades in.

Add a camera abstraction: render onto a canvas larger than 1920×1080 and animate
scale/translate to push into whichever region the narration is currently describing.

Scope: a rewrite of `videoTheme.motion` plus one pilot scene. This alone closes most of the
perceived-quality gap.

### 3.2 Make diagrams actual graphs

Retire the 9-anchor position table. Move to `nodes[] + edges[]` in the schema, lay out with
`elkjs` or `dagre`, then animate:

- Nodes spring in on the narration beat.
- Edges draw via `strokeDasharray` / `strokeDashoffset` using `@remotion/paths`.
- The active node is highlighted in sync with narration.

This is literally the "moving diagrams" requirement, and it is deterministic and groundable.
It applies to `process`, `cause-effect`, `ipo`, and `labelled-diagram` simultaneously.

### 3.3 For 3D, use `@remotion/three`

React Three Fiber, frame-locked to Remotion's timeline, deterministic, composites underneath
the text layer. This is the correct answer to "3D motion graphics" and it retains every
property that would be lost with Veo.

**Ops caveat:** `apps/renderer` will need GPU/ANGLE flags and probably a larger instance
type. Budget for this.

Also worth pulling in: `@remotion/shapes`, `@remotion/motion-blur`, and `@remotion/lottie`
if we ever want designer-authored decorative loops.

### 3.4 Use generative models as *asset producers*, not renderers

This is where Gemini genuinely earns a place, and the hook already exists:
`illustration-generation-job`. Extend it to generate backgrounds, textures, subject
illustrations, and — for hook scenes where exact content does not carry factual load —
short Veo B-roll.

Those outputs land as assets, pass through `project-asset-validation-job`, get cached in
storage, and are then animated deterministically by Remotion. We get generative richness on
the pixels that do not carry factual load, and keep hard guarantees on the pixels that do.

---

## 4. The architectural rule

> **Remotion stays the compositor and timeline. Every external model sits upstream of the
> storyboard as an asset producer, never as the renderer.**

This preserves regeneration, grounding, render parity, and cost control — and it keeps the
door open to promoting Veo later if its text fidelity becomes good enough.

---

## 5. Implementation notes from the current codebase

- **`apps/renderer/src/media.ts`** already wraps ffmpeg/ffprobe, so the plumbing to probe
  and composite externally-generated clips is largely in place.
- **`packages/provider-adapters/src/`** is text-only today: `structured-output.ts` plus
  versioned prompt families (`storyboard/v1`, `grounding/v2`, `narration/v2`, etc.). There
  is no image or video provider shape at all, and `illustration-generation-job` has no real
  adapter behind it.

  Adding Gemini for assets therefore means designing a **second adapter contract** —
  binary output, cost accounting per image or per second, its own quota handling —
  alongside the existing structured-text contract. That is real work, but it is the right
  seam: it is the same seam whether we later add Imagen, Veo, or HeyGen.

---

## 6. Suggested first slice

1. Spring-based choreography module in `@avlp/design-system/video-theme`.
2. Rebuild `process-scene` end-to-end against it as the pilot.
3. SVG path-drawn connectors for `cause-effect` and `process`.

Roughly a week. It will immediately show whether the gap was ever really about Remotion.

---

## 7. Caveat

If the actual product direction shifts toward short-form social explainer content with a
host, HeyGen moves up considerably in priority. It still does not address the diagram
problem.
