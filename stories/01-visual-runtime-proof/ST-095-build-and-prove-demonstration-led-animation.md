---
story_id: ST-095
title: "Build and Prove Demonstration-Led Animation"
phase: "01 — Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E15-US2"]
depends_on: ["ST-011", "ST-023", "ST-024", "ST-063", "ST-064", "ST-084", "ST-087"]
---

# ST-095 — Build and Prove Demonstration-Led Animation

## Story

As the product team, we want narration-aligned animation that shows objects moving and changing state, so that we can verify whether the experimental approach explains a lesson clearly before building tester selection and comparison workflows.

## Outcome

A shared deterministic demonstration runtime and two authored recipes produce playable savings and evaporation videos. Each has an equivalent standard version using the same factual content, recorded narration, captions, scene boundaries, and `mvp-default` appearance. A development preview and evaluation report make the differences reviewable.

ST-096 consumes this proven runtime to implement approach selection, tenant-owned variants, comparison playback, and feedback. Deliver a usable integration contract and actual rendered media, not just fixtures, interfaces, or animation plans.

## Required Reading

- `docs/controlled-rendering-versioning-contract.md` — shared CR-01–CR-08 requirements, especially event-plan identity, narration timing, deterministic frame state, and unavailable-version behaviour. Apply within this proof's scope and record evidence for ST-098 without depending on it.

- `AGENTS.md` and `STORY_INDEX.md`.
- `docs/video-style-templates-brainstorm.md` — Make motion explain the subject.
- `docs/creative-styles-technical-research.md` — separation of appearance from explanatory behaviour and subject-specific models.
- `docs/reference/mvp-prd.md` and `docs/reference/epic-technical-implementation-guide.md` — E11, E15, scene contracts, asset validation, captions, preview/render parity, and immutable inputs.
- Current ADRs, especially ADR-001 and ADR-004.
- Dependency stories and their Dev Agent Records, including ST-087's graph timing implementation and known font/render regression limitations.
- `docs/design.md` when extending the development preview shell.

## Dependencies and Boundary

Do not start until every `depends_on` story is Done in `STORY_INDEX.md`. All seven are Done at story creation; recheck before starting.

ST-094 is independent. Hold appearance to `mvp-default` so this experiment isolates explanatory motion from creative-style changes.

This is a bounded development proof for two curated subjects. Keep production configuration, lesson validation, and saved lessons on their existing path. Define an explicit versioned demonstration composition contract without silently widening the production LessonSpec union or selectable modes.

Record the user-authorised proof boundary, event-plan ownership, timing provenance, and production handoff in an ADR using the next available number and repository decision conventions. Distinguish the implemented foundation from production migration proposals owned by ST-096. No database migration is planned here.

## Scope

- [x] Inspect semantic schemas, graph timing, narration/caption timing sources, asset resolution, full-lesson composition, and rendering interfaces.
- [x] Define a strict, versioned object/event plan and reusable recipe registry before implementing consumers.
- [x] Implement state evaluation from immutable inputs and frame time, including deterministic seeking.
- [x] Author savings allocation/accumulation and evaporation recipes with validated subject-specific rules.
- [x] Prepare original or licensed, source-grounded fixtures with real local narration audio and reviewed phrase timings.
- [x] Produce equivalent standard fixtures with matching facts, audio, captions, and timeline for development comparison.
- [x] Register browser-preview and final-render compositions using the same runtime and resolved inputs.
- [x] Render both approaches for both subjects and evaluate clarity, accuracy, timing, and natural movement.
- [x] Document a tested integration contract for ST-096 and remaining limitations.

## Recipe Requirements

### Savings: transfer and accumulate

Ten tokens labelled as ₦1,000 each represent ₦10,000. Two tokens move from income into savings, leaving eight. Further explicitly labelled weekly deposits accumulate toward a stated goal. Show where subsequent deposits originate and identify the passage of weeks; do not imply funds appear or multiply without a source.

Keep object identity through transfers. Update displayed balances from the same validated state as token movement. Declare how in-transit amounts are represented so funds are neither counted twice nor lost. Validate units, positive amounts, source availability, and final totals. These are illustrative lesson facts, not personalised financial recommendations.

### Evaporation: explanatory state change

Use an authored water-surface scene and a clearly labelled magnified particle view. Particles leave the surface and become more dispersed while retaining their identity as water. Explain the model's simplification; avoid implying water disappears, changes chemical identity, or must boil for evaporation to occur.

Ground the explanation in reviewed educational source material and record the accuracy review. Rendering mist or fading the water image is insufficient evidence of an explanatory state change. This is a bounded educational model, not a general fluid simulation.

### Natural movement

Preserve objects as they move, show cause before consequence, and leave a clear resulting state. Focus attention on one principal change at a time. Give movement meaningful origins/destinations, restrained easing, and inspection time after key events. Use subject-appropriate behaviour instead of universal bouncing. Keep captions readable and explanatory objects outside caption exclusion areas.

## Technical Implementation Requirements

### Event and object model

Define stable object IDs, initial state, typed allowlisted actions, source/target references, quantities/units where relevant, narration-beat references, and explicit event timing. Validate nonexistent objects, invalid quantities, impossible transitions, conflicting events, and non-finite/out-of-range values before rendering.

The renderer owns paths, layout coordinates, easing, and appearance. External inputs supply supported semantic parameters, never JSX, CSS, executable animation expressions, or arbitrary positions. Share only mechanics needed by these recipes; a universal animation language is out of scope.

Derive state at frame N directly from validated initial state and the event plan. Do not depend on having rendered earlier frames. Replaying, backward scrubbing, and out-of-order server rendering must agree. Any visual randomness must be seeded and versioned.

### Audio and timing

Use one real prepared narration recording per scene, shared between approaches. Local original/licensed recordings are sufficient; do not automatically call paid TTS or image providers.

Resolve stable narration beats to reviewed phrase timestamps from actual audio. Manual alignment is acceptable for this proof with explicit provenance. Character-count estimates may not be reported as accurate alignment. Bind plans to narration, audio, and cue identities/checksums; stale or unmatched timing is an actionable validation failure.

Respect ADR-004: measured audio determines duration; never accelerate or clip speech to fit motion. Preserve supported scene bounds. If a plan cannot finish with readable holds, fail explicitly instead of overlapping incompatible events or changing narration.

### Shared rendering and assets

Retain the pinned Remotion/FFmpeg profile and frame-driven animation. Use the same resolved composition in preview and final render. Reuse caption, asset-resolution, and safe-area abstractions where applicable.

Bundle original/licensed assets and pinned fonts with provenance. Required assets/fonts must load before layout checks or frame capture; do not silently replace educational assets. Use explicit development commands or existing worker tooling for expensive renders, outside normal HTTP handlers.

Keep standard templates and production entry points intact. Shared changes must preserve `mvp-default` regressions. No new general-purpose model calls or topic detection are required.

## Integration Contract for ST-096

Export tested interfaces using existing package ownership conventions; settle exact names in the implementation plan:

| Capability | Required behaviour |
| --- | --- |
| Recipe catalogue | Stable ID/version, supported semantic inputs, required assets, timing requirements |
| Support query | Validate recipe/content compatibility and return actionable reasons; do not infer support from a title keyword |
| Plan builder | Produce an immutable validated plan from supported content, audio/cue references, and recipe version |
| Plan validation | Reject stale media/timings, unsupported versions, invalid transitions, and impossible quantities |
| Shared composition | Render the same resolved plan in browser/server without recomputing recipe selection |
| Input identity | Cover content, media/cues, assets/fonts, appearance, recipe/event-plan versions, and renderer implementation |

Provide an example consumer and contract tests so ST-096 can adapt tenant-owned records without importing fixture-specific internals or duplicating recipe logic. The support query is a pure capability check; cohort/tenant authorisation and persistence belong to ST-096.

## Interfaces and Deliverables

- Validated demonstration contract, event runtime, and two recipe implementations.
- Source-grounded fixtures, prepared audio, reviewed timings, assets, and equivalent standard inputs.
- Development preview entry and documented rendering commands.
- Four playable MP4s: standard and demonstration for each subject, with matched timelines/audio.
- `docs/demonstration-animation-proof-evaluation.md`: frames, output paths, accuracy/timing review, visual findings, comparable render time/memory measurements, and integration instructions.
- ADR documenting the bounded foundation and remaining production decisions.

Use existing artifact conventions for generated media; avoid committing large binaries by default. Completion evidence must name usable output locations and reproduction commands.

## Acceptance Criteria

- [x] **AC1 — Real engine:** Both recipes execute through the shared typed runtime and show transfers/accumulation or state changes beyond text fading or graph-node reveals.
- [x] **AC2 — Correct meaning:** Savings quantities/balances agree throughout transfers; evaporation preserves the reviewed explanation and water identity. Required facts are neither lost nor invented.
- [x] **AC3 — Timing:** Events follow reviewed beats, finish within bounds, leave readable holds, and preserve speech/captions. Invalid or stale timing fails explicitly.
- [x] **AC4 — Natural continuity:** Review complete clips for object continuity, cause-before-effect ordering, focal clarity, destinations, and pacing. Record findings and repair distracting or misleading motion.
- [x] **AC5 — Determinism:** Direct/backward seeking and repeated/out-of-order frame renders agree for pinned inputs. Preview/server comparisons pass a documented tolerance.
- [x] **AC6 — Controlled evidence:** Four MP4s play with valid video/audio metadata. Each pair has identical facts, audio, captions, style, and scene boundaries; changed visual behaviour is observable and documented.
- [x] **AC7 — Handoff:** Catalogue, support query, plan builder/validator, shared composition, and identity contract have a working example consumer and tests. Unsupported inputs return reasons rather than fallback output.
- [x] **AC8 — Compatibility:** Existing standard schema, preview, full-lesson, and frame regressions pass. Reproduce/document environmental baseline failures instead of accepting new failures.
- [x] **AC9 — Evaluation:** Document accuracy, clarity, timing, limitations, and comparable render measurements. Identify any human review as performed or pending; do not claim measured learning gains from developer review.

## Required Tests

- [x] Schema/recipe tests for invalid IDs/versions, object references, amounts/units, transitions, conflicting events, and unsupported inputs.
- [x] Conservation/final-state tests, including in-transit money and visible quantity/state correspondence.
- [x] Timing tests for phrase anchors, stale narration/audio, short timelines, event bounds, and preserved audio duration.
- [x] Deterministic state tests for direct, backward, and out-of-order seeking.
- [x] Browser checks for fonts/assets, captions, safe areas, and motion boundaries.
- [x] Actual Remotion renders, FFprobe metadata/audio checks, and preview/server comparisons for both subjects.
- [x] Integration-contract example tests and legacy standard regressions.
- [x] Affected workspace lint, typecheck, tests, build, and applicable browser/render suites with exact commands recorded.

## Out of Scope

- Production selector/configuration, cohort flags, comparison records, paired playback controls, and feedback; ST-096 owns these.
- Database migrations, production LessonSpec changes, or approved-version rewrites.
- New creative styles or dependence on ST-094.
- Arbitrary-topic generation, automated forced-alignment service integration, a node editor, universal animation language, or general physics simulation.
- Paid provider calls, external creative-tool integrations, or automatic alternate-video generation.

## Implementation Checklist

- [x] Inspect code and capture standard regression baselines.
- [x] Write a plan covering files, contracts, timing sources, fixtures, tests, and risks.
- [x] Record architecture boundary and define contracts before consumers.
- [x] Build runtime/recipes and prepare shared factual/audio inputs.
- [x] Integrate development preview and actual rendering.
- [x] Run tests, inspect clips, and fix foundational defects.
- [x] Publish evidence and ST-096 integration documentation.
- [x] Complete Dev Agent Record and update story/index status.

## Definition of Done

- [x] Every acceptance criterion and required test is verified.
- [x] Both demonstration clips and standard equivalents are reviewable and reproducible.
- [x] No unresolved content/state, timing, determinism, asset, or standard-regression defect remains in scope.
- [x] ST-096 can consume the tested contract without building a second engine.
- [x] Evaluation, ADR, commands, outputs, limitations, and Dev Agent Record are complete.
- [x] Mark this story Done only after verification; then recheck ST-096 dependencies and move it from Blocked to Ready if all are Done. **Accepted by the repository owner on 2026-09-18, after a spec-compliance review whose nine findings were fixed and re-verified (see Review fixes). ST-096's other eleven dependencies — ST-041, ST-050, ST-060, ST-063, ST-064, ST-065, ST-066, ST-068, ST-077, ST-079, ST-084 — were rechecked in `STORY_INDEX.md` and are all Done, so ST-096 moves Blocked → Ready.**

## Dev Agent Record

- **Agent:** Claude Opus 5 (Claude Code) via `/next-story`
- **Started:** 2026-09-18
- **Completed:** 2026-09-18
- **Branch/PR:** `feat/st-095-demonstration-led-animation`, branched from `feat/st-094-prove-three-distinct-video-style-packs` @ `9c83491`. No PR opened.

### Files changed

**Contract — `@avlp/schemas`**

- `packages/schemas/src/demonstration-proof.ts` *(new)* — the whole demonstration contract: the typed object model (`container`, `token`, `readout`, `particle`, `region`, `period-marker`, `note`), the seven allowlisted actions, `demonstrationPlanSchema` with its structural refinements, the measured-timing types including the closed `demonstrationTimingMethod` enum, composition props, the 21 structured issue codes, the CR-02 manifest, and `canonicalDemonstrationJson`.
- `packages/schemas/package.json` — adds the `./demonstration-proof` subpath export **only**. The module is deliberately not re-exported from the package index, so `lessonSpecSchema` / `sceneSpecSchema` / `lessonConfigurationSchema` cannot widen to accept a demonstration plan.

**Runtime and recipes — `@avlp/scene-library`**

- `src/demonstration-proof/state.ts` *(new)* — `compileDemonstrationPlan` (stable slot assignment) and `evaluateDemonstrationState` (the deterministic runtime), plus `seededJitter`. Pure functions of plan and frame.
- `src/demonstration-proof/validation.ts` *(new)* — the semantic replay: unknown references, object-kind mismatches, source availability, impossible transitions, conflicting events, beat drift, stale narration binding, insufficient holds, declared-end-state agreement, and conservation checked at every event boundary.
- `src/demonstration-proof/registry.ts` *(new)* — the two recipes as data: supported object kinds and actions, asset slots with what each must depict, timing floors, and the subject accuracy rules.
- `src/demonstration-proof/plan-builder.ts` *(new)* — `queryDemonstrationSupport` (pure structural capability check), `profileInitialState`, `buildDemonstrationPlan` (resolves frames from measured beats), `listDemonstrationRecipes`.
- `src/demonstration-proof/geometry.ts` and `primitives.tsx` *(new)* — all layout arithmetic, and the shared presentation pieces carrying the `data-demo-*` preflight attributes.
- `src/demonstration-proof/recipes/savings.tsx` and `recipes/evaporation.tsx` *(new)* — the two authored recipes.
- `src/demonstration-proof/composition.tsx` *(new)* — `prepareDemonstrationComposition` (the single "is this renderable?" decision), `DemonstrationComposition`, the hook-free `DemonstrationSceneAtFrame` and its Remotion wrapper, and the timeline helpers. Render mode throws on any blocking issue.
- `src/demonstration-proof/fixtures.ts` *(new)* — six demonstration scenes across two subjects, the fact inventories, and the standard equivalents parsed through the production `sceneSpecSchema` and `fullLessonCompositionPropsSchema`.
- `src/demonstration-proof/narration.ts`, `fonts.tsx`, `manifest.ts`, `remotion-root.tsx`, `preview-player.tsx`, `layout-harness.tsx`, `harness-server.ts`, `index.ts` *(new)*.
- `src/demonstration-proof/assets.generated.ts` and `narration.generated.ts` *(new, generated)* — 4 original SVGs (2.8 KB) and 6 narration tracks (~11 MB of base64 WAV).
- `scripts/generate-demonstration-assets.mjs`, `generate-demonstration-narration.mjs`, `synthesize-phrases.ps1`, `render-demonstration-proof.mjs` *(new)*.
- `packages/scene-library/package.json` — the two new exports and three new scripts. **No new dependencies**: the proof uses the Atkinson Hyperlegible face `videoTheme` already pins.

**Tests**

- `src/demonstration-proof/demonstration-contract.test.ts` *(new)* — schema and validation rejection cases, each asserting the structured code.
- `src/demonstration-proof/demonstration-state.test.ts` *(new)* — determinism, conservation, object continuity, emphasis coverage.
- `src/demonstration-proof/demonstration-timing.test.ts` *(new)* — measured duration authority, beat anchoring, stale binding, holds, captions.
- `src/demonstration-proof/demonstration-integration.test.ts` *(new)* — the ST-096 example consumer, plus the standard-equivalence assertions.
- `src/demonstration-proof/demonstration-layout.test.ts` *(new)* — the browser geometry preflight, as a test rather than only inside the evidence script.
- `src/demonstration-proof/demonstration-media.test.ts` *(new)* — real encodes, FFprobe postflight, browser/server parity, repeat-render determinism.
- `e2e/demonstration-proof-preview.spec.ts` *(new)*.

**Development gallery**

- `apps/web/app/demonstration-proof-preview/page.tsx`, `gallery-loader.tsx`, `gallery.tsx` *(new)* — a development-only route that calls `notFound()` outside development, with the gallery behind a dynamic import inside a production-dead branch, exactly as ST-094's is.

**Docs**

- `docs/demonstration-animation-proof-evaluation.md` *(new)*
- `docs/adr/ADR-006-demonstration-event-plans-for-explanatory-animation.md` *(new, **Proposed**)*

### Migrations

None. No database migration, no schema version bump, no lesson-version rewrite.

### Public contract changes

Two **additive subpath exports**, neither reachable from its package's index:
`@avlp/schemas/demonstration-proof` and `@avlp/scene-library/demonstration-proof`
(plus `.../demonstration-proof/manifest` for the Node-only hashing module).

No production contract changed. `git diff 9c83491` over
`packages/schemas/src/index.ts`, `apps/renderer/src/contracts.ts`,
`packages/design-system/src/video-theme.ts` and
`packages/scene-library/src/{index.ts,remotion-root.tsx,scene-registry.tsx,full-lesson.tsx}`
is **empty**. `lessonConfigurationSchema` still accepts only `mvp-default`, and
the production render worker's bundle and `renderImplementationVersion` are
untouched.

### Commands and tests run

| Command | Result |
| --- | --- |
| `pnpm --filter @avlp/{schemas,scene-library,web} exec tsc --noEmit` | clean |
| `pnpm --filter @avlp/{schemas,scene-library,web} run lint` | clean |
| `vitest run src/demonstration-proof/demonstration-{contract,state,timing,integration}.test.ts` | **84 passed** |
| `vitest run src/demonstration-proof/demonstration-layout.test.ts` | **9 passed** — browser geometry preflight at the real 1920x1080 canvas |
| `vitest run src/demonstration-proof/demonstration-media.test.ts` | **7 passed** — real encodes + FFprobe, browser/server parity, repeat-render determinism |
| `pnpm --filter @avlp/scene-library run test` (full package) | 302 passed, 3 failed |
| `pnpm --filter @avlp/schemas run test` | 312 passed, 2 failed |
| `npx playwright test e2e/demonstration-proof-preview.spec.ts` | **6 passed** |
| `pnpm --filter @avlp/scene-library run generate:demonstration-assets` | 4 original SVGs, 2.6 KB |
| `pnpm --filter @avlp/scene-library run generate:demonstration-narration` | 6 tracks, 20 phrases, ~11 MB |
| `pnpm --filter @avlp/scene-library run render:demonstration-proof` | 4 MP4s, 2 manifests, 6 hold frames, measurements, ffprobe — every postflight check passed |
| `pnpm build` | **16/16 tasks successful** |

**Every failure above is pre-existing and was verified as such, not assumed.**
The three `@avlp/scene-library` failures were confirmed by `git stash push -u`,
re-running the suite on the clean base tree, and popping: the base tree fails the
same three (`full-lesson-render`, `scene-preview-render-smoke`,
`summary-scene-render` — rendered-frame hash snapshots, font-hash drift in this
environment) at 202 passed / 3 failed. This branch runs the same three failures
against 290 passes. The two `@avlp/schemas` failures are ST-093 debt in files
this story does not touch: `visual-role.test.ts` expects four asset provenances
where the source now has five, and `lesson-spec.test.ts` finds the committed
`lesson-spec-v1.schema.json` out of sync with the Zod source.

**Production route gating.** `next build` prerenders
`/demonstration-proof-preview` as **HTTP 404** with a **4.0 KB** client chunk —
the same size as the comparable `/video-design-preview` — and neither the gallery
markup nor any bundled `data:` media appears anywhere in the production output.

### Screenshots and representative output

Absolute local paths for this run (git-ignored, reproducible from checked-in
inputs via the commands above):

- `<repo>/artifacts/st-095/savings-demonstration.mp4` — 71.06s, 5.83 MiB
- `<repo>/artifacts/st-095/savings-standard.mp4` — 71.06s, 3.88 MiB
- `<repo>/artifacts/st-095/evaporation-demonstration.mp4` — 63.06s, 4.39 MiB
- `<repo>/artifacts/st-095/evaporation-standard.mp4` — 63.06s, 3.47 MiB
- `<repo>/artifacts/st-095/frame-{savings,evaporation}-scene{1,2,3}.png` — the six hold frames
- `<repo>/artifacts/st-095/{savings,evaporation}-demonstration.manifest.json`
- `<repo>/artifacts/st-095/{measurements,ffprobe}.json`

`<repo>` is `D:/Eronmonsele/Documents/SoundMinds/product-app` on this machine.

FFprobe on all four: `h264`/`aac`, 1920x1080, 30 fps, audio duration equal to
video duration to the millisecond. Within each subject the two approaches have
**identical** duration — 71.062s for savings, 63.062s for evaporation — which is
the mechanical half of the AC6 claim that the pair shares a timeline.

**Render cost cannot be claimed from this hardware.** The same four clips
rendered three times from identical inputs gave 99.3 / 93.0 / 88.1 / 89.5 ms per
frame in the first run, 94.3 / 127.8 / 156.8 / 100.2 in the second, and
99.0 / 92.6 / 88.8 / 88.1 in the third. The spread within a
single clip across runs (88.1 → 156.8) is larger than any difference between the
approaches in any run, and the ordering reverses. The honest statement is
that both approaches cost the same order of magnitude per frame and this machine
cannot resolve finer than that; a capacity answer needs a quiet machine and
repeated runs, and belongs to ST-096/ST-098. A third run, on a quieter machine,
gave 99.0 / 92.6 / 88.8 / 88.1 — much tighter, and consistent with the earlier
spread being contention rather than composition. Output size is the one stable
measurement: the demonstration clips are **1.50x** (savings) and **1.27x**
(evaporation) their standard counterparts' bytes at equal duration and encoder
settings. (An earlier draft of this record and of the evaluation gave both
ratios as ~1.27x; the savings figure was wrong.)

Full detail, including the seven-defect clip review, is in
`docs/demonstration-animation-proof-evaluation.md`.

### Decisions and assumptions

- **Isolation over integration**, following ST-094. Separate contract subpath, separate Remotion root, separate development route, no production file modified. That is what makes the "nothing production changed" claim checkable rather than asserted.
- **The audio is built around the beat boundaries rather than aligned to them afterwards.** Each phrase is synthesized to its own WAV by the local Windows Speech API and the scene track is assembled by concatenation, so a beat's start is an exact cumulative sample offset. `demonstrationTimingMethod` is a closed enum with no member for an estimate, so an estimated track cannot be expressed in this contract at all.
- **The plan declares its own end state and validation replays it.** Without this the runtime would faithfully animate an arithmetic mistake. Conservation is checked at every event boundary, not only at the end, so money cannot be created and destroyed again in the middle.
- **In-transit money belongs to neither container** and is drawn on screen as such. Attributing it to the destination early shows a balance the learner has no reason to believe yet; leaving it in the source makes arrival look like duplication.
- **Slots are assigned once, at compile time**, from the set of objects that ever occupy a holder — not from current occupancy, which would make the remaining notes shuffle sideways every time one left.
- **The standard equivalents are the real `FullLessonComposition`**, not a reimplementation, and their scenes pass the production `validateScene`. A comparison against a strawman would not be worth showing a tester.
- **Comparison tolerances were registered before evaluation** (`PARITY_TOLERANCE_MEAN_ABS_DIFF = 3.5`) and left as registered afterwards.

### Review fixes

A spec-compliance review of this branch raised nine findings. All nine are
fixed here; the code changes are in `@avlp/scene-library`'s
`demonstration-proof` module and its tests, and no production file is touched.

1. **`high` — the savings recipe placed containers by hard-coded fixture IDs.**
   `holderRect` mapped the literals `income` and `savings` to stage rectangles
   and fell back to the origin strip for anything else, so a plan using
   different IDs for the same roles was reported **supported**, validated
   cleanly, and then drew every container in one rectangle with tokens
   overlapping — while the readouts went on stating the correct balances. The
   support query and the plan builder both accepted it. Fixed on both sides:
   - The recipes now resolve geometry through the **role** a container or
     region declares, never its ID (`roleRect` in `recipes/savings.tsx`, a role
     lookup in `recipes/evaporation.tsx`). Emphasis, the in-transit line and
     the preflight's object attribute follow the declared container too.
   - `registry.ts` gains `placements`: how many objects of each role the recipe
     has a drawn place for. `demonstrationPlacementOverflows` is shared by
     `queryDemonstrationSupport` (new reason code `too_many_for_recipe`) and
     `validateDemonstrationPlan` (`unsupported_content`), so content the stage
     cannot lay out is refused with a reason at both doors rather than stacked
     silently.
   - Regression test: `demonstration-layout.test.ts` renames every container in
     the savings fixture (`income`→`wages`, `savings`→`pot`, `cash-origin`→
     `payday`), leaves every role untouched, and requires the measured boxes to
     be identical. Confirmed to fail against the old ID-keyed geometry and pass
     against the fix.

2. **`medium` — ADR-006 stated a render-cost conclusion its own evidence
   refutes.** It read "materially above the `mvp-default` baseline (see the
   evaluation)", while the evaluation says the numbers *do not* support that
   and `measurements.json` shows the standard savings clip slower than the
   demonstration one in the recorded run. The ADR open question and this
   record's Known Risks now both say the cost is unresolved on this hardware.

3. **`medium` — declared asset minimums were recorded and never enforced.**
   `validateDemonstrationScene` checked only that a slot was bound and the ID
   existed, so a 16×16 image bound to `vessel` passed. It now takes the asset
   library rather than a set of IDs and rejects artwork below the slot's
   `minWidth`/`minHeight`, naming the actual dimensions and what the slot must
   depict — matching what ST-094's `style-proof/resolver.ts` already did.

4. **`medium` — the size of the committed narration module was understated.**
   `narration.generated.ts` is 16,020,854 bytes (15.3 MiB); this record said
   "~11 MB", which is the audio before base64. The real figure, and the reason
   the bundled-`data:` choice is worth it, are now recorded in ADR-006's
   consequences and the evaluation's L3. **The file itself is unchanged** —
   reducing it means moving the WAVs to bundler-inlined binary assets, which
   changes the media pipeline this proof's byte-identity guarantee rests on and
   is a design decision rather than a review fix.

5. **`low` — two declared issue codes were never emitted, and a third depended
   on which entry point you used.** `object_kind_mismatch` is now emitted when
   a field names a real object of the wrong kind (a transfer listing a
   container in `tokenIds`), distinct from `unknown_object_reference` for one
   that does not exist. `caption_collision` is now emitted when two cues are on
   screen together — the overlay draws the first match, so an overlap silently
   dropped a caption line the audio still spoke. And `classifySchemaIssue` /
   `correctionFor` moved into `validation.ts` as
   `demonstrationSchemaIssues`, shared by `prepareDemonstrationComposition` and
   `buildDemonstrationPlan`; the builder previously reported every schema
   failure as `invalid_composition_input` where the preflight said
   `event_out_of_bounds`. Path patterns are anchored to a segment boundary so
   both prefixes classify alike.

6. **`low` — `data-demo-region` was applied to every region frame and measured
   by nothing.** Both preflights queried only the object and content
   attributes, so a tray crossing the caption band would not have been
   reported. `demonstrationPreflightSelector` is now a single exported constant
   used by the vitest preflight and the evidence script.

7. **`low` — the caption overlay existed twice.** The harness carried a copy of
   the composition's markup, so the layout preflight measured one and the
   render drew the other. Both now mount the same
   `DemonstrationCaptionAtFrame`; the Remotion wrapper only supplies the frame.

8. **`low` — an unstated model simplification.** Stable particle slots mean an
   escaping particle leaves an empty cell and the liquid does not close up,
   which a viewer may read as holes in the water. The layout is unchanged —
   reflowing reintroduces the shuffle that stable slots exist to prevent, and
   object continuity is an acceptance criterion where lattice realism is not —
   but the trade is now in the evaluation's simplification list and in the
   fixture's accuracy review instead of being left to be noticed.

9. **`low` — narration regeneration was Windows-only with no guard.**
   `generate-demonstration-narration.mjs` now checks `process.platform` and
   explains the constraint, rather than failing on a missing `powershell.exe`.
   Only regeneration is affected; the tracks are committed, so renders and
   tests reproduce anywhere.

**Verification after the fixes.** `tsc --noEmit` and `lint` clean across
`@avlp/{schemas,scene-library,web}`. The demonstration suite is **100 passed**
(was 88): 33 contract, 26 state, 18 timing, 7 integration, 9 layout, 7 media.
The full `@avlp/scene-library` package is 302 passed / 3 failed and
`@avlp/schemas` 312 passed / 2 failed — the same pre-existing failures as
before, in files this story does not touch. The four clips were re-rendered
with the widened preflight and pass their postflight unchanged.

### Deviations from the story or technical guide

1. **Synthesized speech, not a recorded human voice.** The repository has no recording route. The Windows Speech API is local, free and offline — no paid provider is called — and it produces intelligible words at measured durations. This proves duration authority, beat anchoring, caption correspondence and audio presence; it cannot prove the prosody of a professional read. Limitation L2 in the evaluation.
2. **The magnified-view asset was redesigned mid-implementation.** The first version was a circular magnifier drawn across both particle regions; rendering it showed the lens ring cutting through the particles and its "MAGNIFIED MODEL" label sitting on top of them — the thing meant to say "this is a model" was obscuring the model. It is now a frame the regions sit inside. Recorded because the circular version is the more obvious design and only the render showed it did not work.
3. **The evaporation hook scene carries two supporting elements, not three.** The production scene runtime's layout capacity check rejected a third alongside that question and prompt. The standard fixture is held to the production contract like any lesson, so the fixture changed rather than the check.
4. **No human instructional review.** Whether the demonstration approach explains better than the standard one is ST-096's question, to be answered with testers. This story establishes accuracy, determinism and reproducibility. No learning-gain claim is made anywhere.

### Known risks and follow-up

- **Two subjects, two recipes, and nothing generalises for free.** A third subject means a third authored recipe with its own actions, validation rules and accuracy review. This is the deliberate cost of refusing a general animation DSL, and it is the most important planning number in the evaluation.
- **Render cost per frame is unresolved, not elevated.** The measurements in the evaluation cannot separate the two approaches: the run-to-run spread for a single clip from identical inputs (88 → 157 ms/frame) exceeds any difference between them, and the ordering reverses between runs — in one run the *standard* savings clip was the slower of the pair, and on a quieter run the two land within 7% (savings) and 1% (evaporation). Output size is the one stable measurement: the demonstration clips are 1.50x (savings) and 1.27x (evaporation) their standard counterparts' bytes at equal duration and encoder settings. A capacity answer needs a quiet machine and repeated runs, and belongs to ST-096/ST-098.
- **Bundled `data:` media is not a production pattern** (L3). Production must resolve media through the existing tenant-scoped asset path. The development route is gated to 404 outside development for the same reason ST-094's is.
- **Two defects were found by the browser preflight rather than by reading the code**: particles pushed off canvas at full dispersion, and the savings goal readout crossing the caption band. Both are fixed, and the preflight now also runs as a vitest suite (`demonstration-layout.test.ts`) rather than only inside the evidence script — which is the gap ST-094's review raised as its finding #2.
- **An `emphasise` event naming a container or region validated cleanly and then drew nothing.** Tokens and particles carried their own emphasis, but containers and regions appear in neither list, so an authored beat had no visible effect. Fixed by `state.emphasisByObjectId`, with a regression test.
- Only one motion-energy setting was exercised (L4). CR-05's calm/balanced/lively axis is expressible — `durationFrames` and `holdFrames` are per-event — but untested across settings. ST-097 owns it.
- All measurements come from one machine, one Chromium build and one FFmpeg build (L5). Per CR-08, no cross-environment byte-identity is claimed.
- Two `@avlp/schemas` tests fail on this branch **and on its base**: `visual-role.test.ts` expects four asset provenances where the source has five, and `lesson-spec.test.ts` finds the committed `lesson-spec-v1.schema.json` out of sync with the Zod source. Both are ST-093 debt in files this story does not touch; refreshing them is independent work.
