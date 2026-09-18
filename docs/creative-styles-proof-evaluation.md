# Creative styles proof: evaluation

Story: ST-094 — Prove Three Distinct Video Style Packs
Date: 2026-09-17
Status: Development proof. **This is not production multi-style support.** Saved
lessons still render with the single `mvp-default` theme. The proposed
architecture is ADR-005, status **Proposed**.

## What this proves, and what it does not

| Claim | Status |
| --- | --- |
| Three style packs can present the same lesson content through nine authored treatments | Proven |
| Those treatments render identically in browser preview and server render | Proven, within a pre-registered tolerance; measured far inside it |
| Complete 1080p/30 H.264/AAC MP4s render from the proof's pinned inputs | Proven |
| The same nine treatments carry a second, unrelated subject without a component fork | Proven |
| Layout, caption, font and asset failures are caught and reported, not absorbed | Proven |
| The three styles are visually distinct when paused | Proven, by developer review of the contact sheet |
| The three styles are distinguishable in motion alone | **Mechanically demonstrated; the blind human attribution review is pending** |
| Instructional clarity is equal across the three styles | **Developer rating only; see AC3 below** |
| Editorial's photographic quality is acceptable | **Not proven** — the proof has no licensed photographs; see Limitations |
| All ten semantic scene types support all three styles | Not attempted, out of scope |

## How to reproduce

From the repository root:

```bash
pnpm --filter @avlp/design-system build
pnpm --filter @avlp/schemas build
pnpm --filter @avlp/scene-library build

# Regenerate the bundled media (seeded; byte-identical on re-run)
pnpm --filter @avlp/scene-library run generate:style-proof-assets
pnpm --filter @avlp/scene-library run generate:style-proof-narration

# Three MP4s, the contact sheet, manifests, ffprobe and measurements
pnpm --filter @avlp/scene-library run render:style-proof

# Blind motion excerpts and their movement descriptors
pnpm --filter @avlp/scene-library run analyse:style-proof-motion

# The proof test suites
pnpm --filter @avlp/scene-library exec vitest run src/style-proof/

# The development gallery
pnpm --filter @avlp/web dev   # then open /style-proof-preview
```

Output lands in `artifacts/st-094/` at the repository root. That directory is
git-ignored: the generated binaries are reproducible from checked-in inputs and
are deliberately not committed. Absolute local paths for this run are recorded
in the story's Dev Agent Record.

## The fixture

One 28-second lesson, inside the 20–30s requirement:

| Order | Scene | Duration | Content |
| --- | --- | --- | --- |
| 1 | hook | 7s | "Why does ice melt faster on metal than on wood?" |
| 2 | definition | 11s | Conduction — thermal energy moving between materials in contact |
| 3 | comparison | 10s | Metal block against wooden block; 3 differences, 2 shared facts |

Scene content, order, narration, caption cues and durations are defined once and
shared byte-identically by all three styles; a contract test asserts their
canonical serialisations are equal and that only the resolved `selection`
differs. The second subject (leaf adaptation, 24s) exercises the same nine
treatments on unrelated material.

## AC1 — Complete proof

All nine combinations preview and render. The three complete clips:

| Clip | Duration | Video | Audio | Size |
| --- | --- | --- | --- | --- |
| `conduction-essential.mp4` | 28.05s | h264 1920x1080 @30 | aac, 28.05s | 1.70 MiB |
| `conduction-editorial.mp4` | 28.05s | h264 1920x1080 @30 | aac, 28.05s | 9.11 MiB |
| `conduction-everyday.mp4` | 28.05s | h264 1920x1080 @30 | aac, 28.05s | 2.38 MiB |

Second-subject evidence: `leaf-everyday.mp4`, 24.04s, same profile.

FFprobe output for every clip is in `artifacts/st-094/ffprobe.json`, and the
render script fails rather than writing a clip that misses the profile.

The encoder path is also covered automatically, not only by that script:
`style-proof-media.test.ts` encodes a 2-second range of each style through the
same `renderMedia` call and probes codec, dimensions, pixel format, frame rate,
duration and **audio presence** — the check a still render cannot make. It also
asserts that a composition failing preflight cannot be encoded at all.

One observation from writing it: the encoder is asked for `yuv420p` and emits
full-range 4:2:0, which FFmpeg tags `yuvj420p` (`color_range: pc`). The existing
`mvp-default` baseline probes identically, so this is the repository's normal
output, not something the proof introduced. It is worth noting only because
`renderProfileSchema` in `apps/renderer/src/contracts.ts` declares
`pixelFormat: "yuv420p"` while `verifyRenderedVideo` never probes `pix_fmt`, so
the discrepancy has never surfaced. Out of scope here; flagged for ST-098.

## AC2 — Distinct when paused

`artifacts/st-094/contact-sheet.png` is a 3×3 sheet: rows are scenes, columns
are styles, each cell captured at that scene's hold frame (fully settled, all
required content readable). Developer review of that sheet:

**Row 1 (hook).** Essential sets a 104px question across the left two thirds
with an isolated cutout in open space on a warm paper ground. Editorial puts a
serif headline block against a full-bleed photographic panel that runs to the
canvas edge on near-black. Everyday puts a short question on an outlined rounded
card above a wide illustrated situation with chip labels at the right. Three
different compositions, three different image treatments, three different
hierarchies.

**Row 2 (definition).** Essential centres term, rule, subject and explanation on
one vertical axis. Editorial splits 52/48 into photograph and an annotated
column whose rules point back into the image, with a source line. Everyday pairs
an illustration card with a tag-and-card explanation.

**Row 3 (comparison).** Essential isolates two cutouts either side of a centred
difference list. Editorial runs two full-height photographic panels with
overlaid labels and a numbered difference strip. Everyday pairs two outlined
scenario cards over a chip row.

Each style holds its identity across all three rows: Essential's inset centred
pages, Editorial's edge-to-edge asymmetry on dark, Everyday's outlined rounded
containers. **Assessment: pass.** This is developer review, not a reviewer panel.

## AC3 — Meaning preserved and equally clear

The fixture's fact inventory is declared explicitly in
`conductionFactInventory` and asserted present in the shared scene content by
contract test. Because all three styles consume the same `scenes` array, no
style can drop a fact without failing that test:

- Question: "Why does ice melt faster on metal than on wood?"
- Definition: "Conduction"; "Thermal energy moving between materials in contact,
  as particles collide and pass energy on."
- Subjects: "Metal block"; "Wooden block"
- Comparison facts: metal conducts quickly; wood conducts slowly; the cube on
  metal melts first; both start at room temperature; both receive the same cube.

Every one of these is visible on screen in all three styles — none is
narration-only — and the browser preflight confirms each is inside its container
and clear of the caption region.

**Clarity ratings.** The criterion was agreed before viewing: for each clip,
(a) is the principal subject identifiable, (b) is the basis of the comparison
apparent, (c) is required text readable for its full interval. Ratings are
**developer review, not measured learning outcomes**:

| Style | Subject identifiable | Comparison basis apparent | Text readable throughout | Note |
| --- | --- | --- | --- | --- |
| Essential | Yes | Yes | Yes | Sparsest; relies most on the cutout being good |
| Editorial | Yes | Partly | Yes | See finding F1 |
| Everyday | Yes | Yes | Yes | Clearest of the three on the comparison |

**Finding F1 (recorded, not waived).** In Editorial's comparison, the *visual*
basis of the comparison — meltwater pooling widely on metal and barely at all on
wood — is not legible in the generated imagery. The comparison still reads,
because the three difference statements are set beside the panels, but Editorial
is the one style whose whole premise is that the photograph carries the
argument, and here it does not. This is a consequence of the photography
limitation below, and is carried into ADR-005 as an open question rather than
repaired by weakening the criterion.

## AC4 — Valid layout

Two validation layers. Fast checks (declared content limits, asset slots, motion
intervals) run anywhere. Actual wrapped-text and container measurement runs in
Chromium with the pinned fonts loaded, in `style-proof-layout.test.ts`, which
measures every `data-proof-fit` box for real overflow, every required-content
box against the caption exclusion region and the canvas bounds, and every bound
image for successful decode — at five frames per scene covering the entrance
boundary, mid-explanation, the hold start and the last frame before the exit.

The preflight found four real defects during implementation, all fixed:

| Defect | Cause | Fix |
| --- | --- | --- |
| Descenders clipped in every display heading | tight display line-heights plus `overflow: hidden` | explicit descender reserve in the shared fit box |
| Editorial's comparison text sat behind the caption plate | full-bleed composition with no caption reserve | the treatment now reserves the caption band |
| Editorial's difference list laid out past the canvas edge | CSS multi-column overflow | explicit grid |
| Everyday's difference chips entered the caption region *during the entrance* | entrance travel distance exceeded the safe gap | travel bounded to 44px, inside the safe area at every frame |

Boundary cases, all passing: an 80-character heading at the schema ceiling; the
densest comparison every treatment claims to lay out (4 differences, 3 shared
facts); portrait media in a landscape cover-fit slot; an extended 24s scene.

Cases that must block, and do, with field-specific issues and actionable
corrections: a missing required evidence asset
(`missing_required_asset`), media below the slot's minimum useful resolution
(`asset_resolution_too_low`), a scene too short for its required hold
(`invalid_motion_interval`), a treatment/scene-type mismatch
(`treatment_scene_type_mismatch`), a vector asset in a raster-only slot
(`unsupported_asset_kind`), and a bind to an undeclared slot
(`unsupported_design_instruction`).

Nothing shrinks text, crops an evidence label, drops a comparison point or
rewrites narration to make a layout fit; the corrections say so explicitly.

## AC5 — Timing and playback

Entrance and exit are authored constants; a longer scene extends the explanation
interval only. Asserted at 3s, 7s, 11s, 24s and 60s: intervals stay ordered, and
the extended-scene fixture keeps the same entrance and exit lengths while the
explanation grows.

Measured narration is the timing authority (ADR-004). Every narration track's
duration equals its scene's duration, asserted by contract test; the fixture
builder throws if they ever diverge. Caption cues are derived from the narration
and are identical across styles at identical frames; each cue is asserted inside
its own scene's frame range. No style shortens, accelerates or truncates
narration — a scene that cannot afford its readable hold is reported instead.

FFprobe confirms audio present at full duration on every clip.

## AC6 — Shared rendering

Preview and render use the same resolved inputs and the same treatment
components. Comparison criteria were fixed **before** evaluating any output:

- repeat server renders of one frame from pinned inputs: **byte-identical**
  (exact, no tolerance);
- browser preview against server render: mean absolute per-channel difference
  ≤ 3.5, and ≤ 3% of pixels differing by more than 24/255.

Measured: **0.041 mean absolute difference, 0.02% outlier pixels**, roughly two
orders of magnitude inside the registered tolerance. The tolerance is left as
registered rather than tightened after the fact.

**This test found a real bug.** The first parity run measured 7.9–17.5 mean
difference. The cause was not antialiasing: the pinned font stylesheets were
imported with `void import(...)`, so `document.fonts.load()` could run before
the `@font-face` rules existed, resolve immediately with nothing to load, and
let frames be captured against a fallback face — a ~3% text-width drift between
preview and render. The stylesheets are now eagerly bundled and awaited, and the
font gate throws if a pinned face is still unavailable, rather than rendering
against a substitute. Byte equality of static markup would never have caught
this.

Frame determinism (CR-04): the motion model is a pure function of frame, with no
wall-clock time, unseeded randomness or mutable state. Rendering frame 300 after
frame 700 is byte-identical to rendering it first, and every frame of the hold
is exactly equal to the hold's first frame in Essential.

## AC7 — Compatibility

The proof is isolated by construction:

- separate contract subpath `@avlp/schemas/style-proof`, never re-exported from
  the package index, so no production lesson validation can widen to accept a
  pack;
- separate tokens at `@avlp/design-system/style-proof-tokens`; `videoTheme` is
  not read, wrapped or altered;
- separate treatment components under `@avlp/scene-library/style-proof`, never
  re-exported from the package index;
- a separate Remotion root, so the render worker's bundle and
  `renderImplementationVersion` are untouched;
- a development-only route, outside the workspace auth matcher, with no API
  call and no persistence.

Contract tests assert `videoTheme.id` is still `mvp-default` and that
`lessonConfigurationSchema` still rejects a proof pack ID as a theme. The
existing `mvp-default` suites were run before and after; results are in the
story's Dev Agent Record, including any environment-related baseline failures
reproduced on the base commit rather than recorded as new regressions.

No migration was added and no lesson version was rewritten.

## AC8 — Reuse demonstrated

The second-subject fixture (cactus against fern; transpiration) resolves through
exactly the same nine treatment IDs — asserted by comparing the treatment sets
of both subjects — with no subject-specific component. Its assets differ; its
code path does not. The browser layout preflight passes on all nine
second-subject scenes, and `leaf-everyday.mp4` is rendered evidence.

Limitation: the second subject is a second *science* subject with a similar
shape (a question, a term, two contrasting organisms). It does not exercise an
abstract or quantitative topic.

## AC9 — Reproducible evidence

Every input is checked in or generated by a seeded script. `measurements.json`
records, per clip, on this environment:

| Clip | Frames | Wall clock | ms/frame | Peak RSS | Asset bytes | Output | Layout preflight |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Essential | 840 | 71.1s | 84.6 | 759 MB | 1.2 KB | 1.70 MiB | 549ms |
| Editorial | 840 | 81.6s | 97.1 | 277 MB | 811 KB | 9.11 MiB | 450ms |
| Everyday | 840 | 67.0s | 79.8 | 307 MB | 2.6 KB | 2.38 MiB | 379ms |
| `mvp-default` baseline, same 840 frames | 840 | 65.7s | 78.2 | 664 MB | — | 1.39 MiB | n/a |
| Second subject (`leaf-everyday`) | 720 | 59.7s | 82.9 | — | 2.6 KB | 2.19 MiB | — |

Read: the proof costs **2–24% more per frame** than the existing `mvp-default`
composition over the same 840 frames, with Editorial most expensive because of
its raster imagery and full-bleed compositing, and Everyday and Essential close
to baseline. Peak RSS here is the *harness* process, sampled while the render
runs, and varies with what else the machine was doing; it is reported as
collected rather than presented as a controlled measurement. Editorial's output
is **6.5× the baseline's bytes at equal duration** — photographic content
compresses far worse than flat vector artwork, which is a storage and delivery
consideration for production and is the most decision-relevant number here.

The browser layout preflight costs 379–549ms for a three-scene lesson, so it is
affordable as a per-save check rather than only a pre-render one.

These are measurements on one machine, not budgets. Budgets should be set from
them, per the research recommendation.

Each clip's manifest (`conduction-<pack>.manifest.json`) records the hashed
resolved input, hash policy, resolved treatments, asset checksums and byte
counts, audio checksums and durations, pinned font faces with weights and file
checksums, motion parameters, the frame timeline, the output profile and the
renderer identity. Hashing is canonical: object keys sorted, array order
preserved, non-finite values rejected. A one-field motion change or a pack
change produces a different hash; re-ordering the same object's keys does not.

## AC10 — Planning handoff

ADR-005 (**Proposed**) records the proposed production architecture, the
affected PRD and technical-guide provisions, the versioning and migration
recommendation, and the follow-up work. It explicitly does not grant the scope
change the PRD would need.

## AC11 — Distinct in motion

Each pack declares one motion signature, and every treatment in that pack
inherits it (asserted by test):

| Pack | Signature | Declared behaviour |
| --- | --- | --- |
| Essential | `masked-reveal` | Content is uncovered behind a single-axis clip and then stops dead; nothing moves during the hold |
| Editorial | `image-push-annotation` | The evidence image drifts and scales continuously for the whole scene while annotation rules draw out from it; text never drifts |
| Everyday | `object-settle` | Whole illustrated objects travel a short distance and settle with one damped overshoot; labels travel with their object |

**Mechanical evidence.** `analyse:style-proof-motion` renders four consecutive
frames per pack per interval (entrance, explanation, exit) and computes a
descriptor from the *absolute difference between consecutive frames*. Palette,
typography and imagery are identical between the two frames of a pair, so they
cancel to zero: only movement survives. A style therefore cannot score as
distinct by being a different colour. Excerpts are written with IDs that do not
name their pack (`excerpts.json`), with the mapping held separately
(`excerpt-key.json`), so the human review can be run blind.

Excerpts are rendered as **muted 1.5-second MP4s**, one per pack per interval,
over the window a reviewer would actually watch. An earlier version sampled
adjacent frames instead, which under-read Editorial's slow drift to near zero
even though it is plainly visible over a second — a measurement artefact, not a
property of the style.

Measured over that window (mean across scenes, movement only):

| Pack | Entrance moving fraction | Entrance column concentration | Explanation | Exit |
| --- | --- | --- | --- | --- |
| Essential | 0.005 | 0.73 (narrow travelling edge) | exactly 0 (static) | fade only |
| Editorial | 0.021 | 0.23 (broad) | non-zero throughout (drift) | fade plus drift |
| Everyday | 0.087 | 0.13 (spread, compact clusters) | exactly 0 (static) | objects exit |

The three are separated on both axes, and by different mechanisms: Essential is
the only pack whose movement is a narrow travelling edge, Everyday moves an
order of magnitude more canvas than Essential, and Editorial is the only pack
that moves at all during the explanation hold.

**A defect this analysis found.** Editorial's first implementation drifted 3.5%
scale and 22px across a scene — about one pixel per frame, and effectively
frozen in a one-second excerpt. A motion signature a reviewer cannot see is not
a signature, so the drift was raised to 12% scale and 70px. This was the only
motion change made for AC11, and note that the other change made during
implementation *reduced* travel (Everyday's entrance), to keep it inside its
safe region.

Automated assertions in `style-proof-motion.test.ts`:

- Essential's hold is **byte-identical** across 8 frames — completely static, as
  declared.
- Editorial's identical window is **not** static, and its movement is broad
  (>5% of the canvas) rather than concentrated in a narrow column band —
  a drift, not a travelling edge.
- The three entrance profiles separate by more than 2x in moving fraction and
  are strictly ordered in column concentration — two independent axes.

**The blind human attribution review is PENDING.** It has not been performed and
no result is claimed for it. The excerpts and the key are generated and ready;
the review needs a reviewer who has not seen the style boards. Until it is run,
AC11's human criterion is unmet, and this is recorded as such rather than
inferred from the mechanical evidence above.

No decorative movement was added to any treatment to pass this criterion; the
one motion change made during implementation *reduced* travel distance, to keep
Everyday's entrance inside its safe region.

## Regression baselines (AC7)

Every failure below was reproduced on the base tree (`git stash` of this
branch's changes, same machine, same command) and is therefore **pre-existing,
not introduced by this story**:

| Suite | Failures on this branch | Failures on base tree | Verdict |
| --- | --- | --- | --- |
| `@avlp/schemas` | 2 (`lesson-spec` JSON-schema sync, `visual-role` provenances) | same 2 | pre-existing |
| `@avlp/design-system` | 1 (`video-preview-render-smoke` snapshot) | 1 | pre-existing |
| `@avlp/scene-library` | 3 snapshot suites (`full-lesson-render`, `scene-preview-render-smoke`, `summary-scene-render`) | same 3 | pre-existing font-hash drift in this environment |
| `apps/pipeline-worker` lint | 1 (`no-ex-assign`) | 1 | pre-existing |
| `@avlp/test-fixtures`, `@avlp/renderer` | 0 | 0 | clean |
| `e2e/video-design-preview.spec.ts` | 2 | same 2 | pre-existing |
| `e2e/style-proof-preview.spec.ts` | 0 (6 passed) | n/a (new) | clean |
| `@avlp/scene-library` `style-proof-media` (new) | 0 (4 passed) | n/a (new) | clean |

**Three defects this story introduced and fixed.**

First, `manifest.ts` hashes resolved inputs with `node:crypto` and was
re-exported from the `style-proof` index, so the development gallery's client
bundle could not compile and the route returned 500. Every package test still
passed, because they all run in Node — only loading the page in a browser
exposed it. The manifest now sits behind its own `./style-proof/manifest`
subpath, off the browser-safe surface.

Third, the gallery imported the proof fixtures statically, which put ~2.5 MB of
base64 media into the route's client chunk (2.64 MB, against 4 KB for the
comparable `/video-design-preview`) and prerendered a publicly reachable route
into the production build. The route now refuses outside development and loads
the gallery through a dynamic import inside a production-dead branch:
`next build` emits a 4.0 KB chunk and a genuine HTTP 404 for the route, with no
gallery content in the HTML.

Playwright's shared `webServer` readiness timeout of 60s was also too low for a
cold `next dev` start of this app, timing the whole e2e suite out before any
test ran. It is now 180s. That is pre-existing repository configuration rather
than a property of this route, but the route made it easy to hit.

Second, adding four
browser-heavy proof suites to `@avlp/scene-library` made its parallel test run
oversubscribe the machine, and four unrelated suites (`analogy-scene`,
`index`, `worked-example-scene`, `preview-playback`) began failing on timeout.
They passed in isolation, confirming contention rather than a real defect. The
package's Vitest config now runs test files sequentially, since most files here
bundle a Remotion entry point and launch a browser.

## Limitations and findings

**L1 — No licensed photographs.** This repository has no photograph library and
no licensing route, so Editorial's image slots carry original raster imagery
generated by a seeded script. What this genuinely exercises: cover-fit crop
policy, portrait and landscape framing, minimum-resolution rejection, tonal
treatment, overlay gradients, annotation anchoring, decode verification, byte
checksums and the ~7× compression cost of raster content. What it does not
establish: whether Editorial looks good with real photography, or whether
photographic evidence can carry a factual claim (see finding F1). **Editorial
should not be judged ready on this evidence.**

**L2 — Synthetic narration.** The narration tracks are original, seeded,
formant-shaped audio beds at the authored scene durations, not recorded speech.
No paid TTS was called. They prove duration authority, caption alignment, audio
presence through to AAC and the absence of acceleration. They cannot prove
prosody, intelligibility or how a voice sits against a particular style.

**L3 — Bundled media size.** The proof's assets and narration are base64 data
URIs in two generated TypeScript modules, ~2.1 MB and ~0.6 MB. This was chosen
so preview, server render and Node tests consume byte-identical media with no
path resolution or static-file server, which is what makes the AC6 comparison
meaningful. Production must not adopt this approach; it should use the existing
tenant-scoped asset resolution.

**L4 — One motion-energy setting.** CR-05's calm/balanced/lively axis is
expressible in the proof's motion parameters, but only the authored default was
exercised. The invariants CR-05 requires are asserted structurally (entrance and
exit fixed, explanation extends, hold enforced), not across energy settings.

**L5 — Three scene types, not ten.** Nine treatments of a possible thirty.
Process, cause-effect, labelled-diagram, analogy, worked-example, IPO and summary
are untouched by this proof.

**L6 — Single environment.** All measurements and the parity comparison come
from one machine, one Chromium build and one FFmpeg build. Per CR-08, different
browser or encoder environments are not claimed to produce byte-identical MP4s
or pixel-identical frames.

## Recommended next work

1. Decide the photography sourcing and licensing route before Editorial is
   treated as production-ready (blocks finding F1 and L1).
2. Run the blind muted attribution review for AC11 with the generated excerpts.
3. Complete the `LessonSpec` consumer compatibility audit ADR-005 requires
   before choosing a schema version.
4. Refactor the ten scene components off their direct `videoTheme` import onto
   an injected resolved pack, with the default appearance preserved exactly.
5. Extend render identity, preflight and retention to cover pack, treatment and
   font versions.
6. Set render-cost budgets from the measurements above rather than inventing
   them.
