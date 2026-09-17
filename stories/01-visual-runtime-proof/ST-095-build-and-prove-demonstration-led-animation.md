---
story_id: ST-095
title: "Build and Prove Demonstration-Led Animation"
phase: "01 — Visual Runtime Proof"
status: Ready
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

- [ ] Inspect semantic schemas, graph timing, narration/caption timing sources, asset resolution, full-lesson composition, and rendering interfaces.
- [ ] Define a strict, versioned object/event plan and reusable recipe registry before implementing consumers.
- [ ] Implement state evaluation from immutable inputs and frame time, including deterministic seeking.
- [ ] Author savings allocation/accumulation and evaporation recipes with validated subject-specific rules.
- [ ] Prepare original or licensed, source-grounded fixtures with real local narration audio and reviewed phrase timings.
- [ ] Produce equivalent standard fixtures with matching facts, audio, captions, and timeline for development comparison.
- [ ] Register browser-preview and final-render compositions using the same runtime and resolved inputs.
- [ ] Render both approaches for both subjects and evaluate clarity, accuracy, timing, and natural movement.
- [ ] Document a tested integration contract for ST-096 and remaining limitations.

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

- [ ] **AC1 — Real engine:** Both recipes execute through the shared typed runtime and show transfers/accumulation or state changes beyond text fading or graph-node reveals.
- [ ] **AC2 — Correct meaning:** Savings quantities/balances agree throughout transfers; evaporation preserves the reviewed explanation and water identity. Required facts are neither lost nor invented.
- [ ] **AC3 — Timing:** Events follow reviewed beats, finish within bounds, leave readable holds, and preserve speech/captions. Invalid or stale timing fails explicitly.
- [ ] **AC4 — Natural continuity:** Review complete clips for object continuity, cause-before-effect ordering, focal clarity, destinations, and pacing. Record findings and repair distracting or misleading motion.
- [ ] **AC5 — Determinism:** Direct/backward seeking and repeated/out-of-order frame renders agree for pinned inputs. Preview/server comparisons pass a documented tolerance.
- [ ] **AC6 — Controlled evidence:** Four MP4s play with valid video/audio metadata. Each pair has identical facts, audio, captions, style, and scene boundaries; changed visual behaviour is observable and documented.
- [ ] **AC7 — Handoff:** Catalogue, support query, plan builder/validator, shared composition, and identity contract have a working example consumer and tests. Unsupported inputs return reasons rather than fallback output.
- [ ] **AC8 — Compatibility:** Existing standard schema, preview, full-lesson, and frame regressions pass. Reproduce/document environmental baseline failures instead of accepting new failures.
- [ ] **AC9 — Evaluation:** Document accuracy, clarity, timing, limitations, and comparable render measurements. Identify any human review as performed or pending; do not claim measured learning gains from developer review.

## Required Tests

- [ ] Schema/recipe tests for invalid IDs/versions, object references, amounts/units, transitions, conflicting events, and unsupported inputs.
- [ ] Conservation/final-state tests, including in-transit money and visible quantity/state correspondence.
- [ ] Timing tests for phrase anchors, stale narration/audio, short timelines, event bounds, and preserved audio duration.
- [ ] Deterministic state tests for direct, backward, and out-of-order seeking.
- [ ] Browser checks for fonts/assets, captions, safe areas, and motion boundaries.
- [ ] Actual Remotion renders, FFprobe metadata/audio checks, and preview/server comparisons for both subjects.
- [ ] Integration-contract example tests and legacy standard regressions.
- [ ] Affected workspace lint, typecheck, tests, build, and applicable browser/render suites with exact commands recorded.

## Out of Scope

- Production selector/configuration, cohort flags, comparison records, paired playback controls, and feedback; ST-096 owns these.
- Database migrations, production LessonSpec changes, or approved-version rewrites.
- New creative styles or dependence on ST-094.
- Arbitrary-topic generation, automated forced-alignment service integration, a node editor, universal animation language, or general physics simulation.
- Paid provider calls, external creative-tool integrations, or automatic alternate-video generation.

## Implementation Checklist

- [ ] Inspect code and capture standard regression baselines.
- [ ] Write a plan covering files, contracts, timing sources, fixtures, tests, and risks.
- [ ] Record architecture boundary and define contracts before consumers.
- [ ] Build runtime/recipes and prepare shared factual/audio inputs.
- [ ] Integrate development preview and actual rendering.
- [ ] Run tests, inspect clips, and fix foundational defects.
- [ ] Publish evidence and ST-096 integration documentation.
- [ ] Complete Dev Agent Record and update story/index status.

## Definition of Done

- [ ] Every acceptance criterion and required test is verified.
- [ ] Both demonstration clips and standard equivalents are reviewable and reproducible.
- [ ] No unresolved content/state, timing, determinism, asset, or standard-regression defect remains in scope.
- [ ] ST-096 can consume the tested contract without building a second engine.
- [ ] Evaluation, ADR, commands, outputs, limitations, and Dev Agent Record are complete.
- [ ] Mark this story Done only after verification; then recheck ST-096 dependencies and move it from Blocked to Ready if all are Done.

## Dev Agent Record

- **Agent:** Not started.
- **Started:** Not started.
- **Completed:** Not completed.
- **Branch/PR:** Not created.
- **Files changed:** Pending implementation.
- **Migrations:** None planned.
- **Public contract changes:** Versioned demonstration input/runtime contracts; no production configuration or persisted LessonSpec widening here.
- **Commands/tests run:** Pending implementation.
- **Screenshots or representative output:** Pending implementation.
- **Decisions and assumptions:** Foundation first; two curated recipes, fixed `mvp-default`, verified phrase timing, shared standard/demonstration inputs. ST-096 owns the tester workflow.
- **Deviations from story/technical guide:** None implemented; document the bounded foundation through an ADR.
- **Known risks or follow-up:** Instructional fidelity, natural pacing, timing accuracy, and render cost require real-media evidence. Broad topic support remains future work.
