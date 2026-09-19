---
story_id: ST-100
title: "Extend Composition Variety to the Remaining Semantic Scene Types"
phase: "08 — Product UI"
status: In Review
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-097", "ST-098"]
---

# ST-100 — Extend Composition Variety to the Remaining Semantic Scene Types

## Story

As a teacher, I want every scene type in my lesson to carry my chosen style, so that a video does not revert to the default appearance partway through or get rejected during style application.

## Outcome

Extends the creative style catalogue from the initial 4 pilot scene types (`hook`, `definition`, `process`, `comparison`) to cover all 10 semantic scene types in the registry. Each of the remaining 6 scene types (`input-process-output`, `cause-effect`, `labelled-diagram`, `analogy`, `worked-example`, `summary`) gains at least two registered, visually distinct treatments (`primary` and `alternate`) across the 3 established style packs (`essential`, `editorial`, `everyday`), adding 36 new treatment combinations for a total catalogue of 60 treatments.

The deterministic planner incorporates a full-lesson rhythm arc (energetic opening, clear concept delivery, focused pause for high-density diagrams/examples, and structured recap). Lessons containing any sequence of the 10 semantic scene types become eligible for creative styles, eliminating partial-coverage rejections while strictly preserving the prohibition on mixed styled and unstyled scenes.

## Architecture and Scope Decisions

1. **Per-Type Treatment Count:** Adopts the ST-097 standard floor of two distinct treatments (`primary` and `alternate`) per pack for each of the 6 remaining types: 3 packs × 6 types × 2 treatments = 36 new combinations. Combined with the 24 pilot treatments from ST-097, the complete catalogue spans 60 treatments.
2. **Registry-Aligned Scene Types:** The 6 remaining types strictly match the canonical `@avlp/schemas` registry:
   - `input-process-output`
   - `cause-effect` (supporting both legacy causal chains and graph node/edge schemas)
   - `labelled-diagram` (supporting asset-backed and shapes-only diagrams)
   - `analogy`
   - `worked-example`
   - `summary`
3. **High-Density Constraints & Asset Containment:** `labelled-diagram` and `worked-example` enforce strict layout boundaries. Diagram callouts use automated collision-free anchor layouts per ST-086 without coordinate drift. Diagram assets and mathematical/stepwise cards follow contain-fit sizing and safe areas per CR-05 and CR-07.
4. **No Mixed-Style Rollout:** Retains ADR-008's invariant: a lesson is either fully styled with a valid resolved creative design manifest or retains `mvp-default`. Mixed styled and unstyled scenes are rejected at preflight and API boundaries. With all 10 scene types covered, any standard-approach lesson can now be styled.
5. **Lesson-Level Rhythm Arc:** The deterministic planner expands beyond local anti-monotony to enforce a global lesson rhythm:
   - *Opening:* energetic, uncluttered framing (`hook`).
   - *Exposition:* balanced concept progression (`definition`, `analogy`, `process`, `input-process-output`).
   - *Deep Focus:* calm, stable layout with extended hold intervals for high information density (`labelled-diagram`, `worked-example`, `cause-effect`).
   - *Resolution:* grounded, high-contrast synthesis with clear takeaways and CTA framing (`summary`).

## Required Reading

- `docs/video-style-templates-brainstorm.md` — proposals 1, 2, and 3.
- `docs/controlled-rendering-versioning-contract.md` — CR-01, CR-02, CR-04, CR-05, CR-07.
- `docs/adr/ADR-005-versioned-style-packs-for-multi-style-video.md` and `docs/adr/ADR-008-resolved-creative-design-manifests.md`.
- ST-094, ST-097, and ST-098 Dev Agent Records, contracts, and test suites.
- `AGENTS.md`, `STORY_INDEX.md`, and current ADRs.

## Increment 1 — Schema and Catalogue Expansion for 6 Remaining Types

1. **Schema Definitions:**
   - Expand `creativeDesignSceneTypes` in `packages/schemas/src/creative-design.ts` to include all 10 semantic types (`input-process-output`, `cause-effect`, `labelled-diagram`, `analogy`, `worked-example`, `summary`).
   - Expand `creativeDesignTreatmentIds` and `creativeDesignTreatmentIdSchema` to the full 60-treatment enum.
   - Update `CreativeDesignCandidate` family union with new layout families: `flow`, `staged`, `chain`, `divergent`, `annotated`, `focused`, `parallel`, `metaphor`, `stepwise`, `walkthrough`, `recap-cards`, `central-takeaway`.
2. **Catalogue Metadata:**
   - Register all 36 new treatments in `creativeDesignCatalogue`.
   - Specify per-treatment metadata: minimum duration seconds, required content, text limits, safe insets, timing frames (establish/explain/hold/exit), and density tiers.
   - Define exact density and timing limits for high-density scenes (e.g. minimum 6-8s duration, >=90 hold frames for `labelled-diagram` and `worked-example`).

## Increment 2 — Renderer Treatments and Visual Signatures

1. **Implement Scene Treatments:**
   - Implement pack-specific rendering for all 6 new scene types across `essential`, `editorial`, and `everyday` in `packages/scene-library`:
     - **Input–Process–Output:** `flow` (horizontal directional pipeline) and `staged` (converging input containers transforming into outputs).
     - **Cause-and-Effect:** `chain` (directional linear causal flow) and `divergent` (branched network / split causal impact). Supports both legacy causes/effects and graph schemas.
     - **Labelled Diagram:** `annotated` (radial / perimeter diagram callouts on asset or shape) and `focused` (two-column split with hero diagram and structured callout cards).
     - **Analogy:** `parallel` (side-by-side conceptual comparison rows) and `metaphor` (relational bridge cards connecting concept to familiar domain).
     - **Worked Example:** `stepwise` (vertical progressive calculation cards) and `walkthrough` (split problem statement with highlighted resolution phases).
     - **Summary:** `recap-cards` (takeaway card grid with CTA footer) and `central-takeaway` (central model / asset visual flanked by synthesis takeaways).
2. **Design Tokens & Invariants:**
   - Respect resolved settings: surface and background colors, font pairings, caption presets, and motion energy.
## Increment 1 — Schema Expansion & 60-Treatment Catalogue

1. **Scene Type Expansion:**
   - Update `creativeDesignSceneTypes` in `packages/schemas/src/creative-design.ts` to include all 10 semantic scene types.
2. **Candidate Families:**
   - Introduce candidate layout families for the 6 new scene types (e.g. `flow`, `staged`, `chain`, `divergent`, `annotated`, `focused`, `parallel`, `metaphor`, `stepwise`, `walkthrough`, `recap-cards`, `central-takeaway`).
3. **60-Treatment Catalogue:**
   - Populate `creativeDesignCatalogue` with metadata for all 60 combinations across Essential, Editorial, and Everyday packs.
   - Define typography, borders, framing, timing constraints, and hold-frame minimums for every treatment.
   - Export all 60 IDs in `creativeDesignTreatmentIds`.

## Increment 2 — Layout Framing and Asset Containment

1. **Diagram and Example Visual Safety:**
   - Design layouts for `labelled-diagram` and `worked-example` that guarantee callouts and steps remain within safe title/caption bounds.
   - Ensure asset-backed diagrams use contain-fit scaling to prevent diagram clipping or label overlap.
2. **Pack-Specific Personality:**
   - Essential: Clean geometric structure, high-contrast borders, minimal distraction for technical diagrams.
   - Editorial: Generous whitespace, refined serif headers, asymmetric framing, elegant step dividers.
   - Everyday: Friendly rounded containers, warm card backgrounds, approachable step badges.

## Increment 3 — Paced Sequence Planning

1. **Rhythm-Aware `planCreativeDesign`:**
   - Update planner algorithm in `packages/schemas/src/creative-design.ts` to consider full-lesson narrative arc:
     - Opening scene (`hook`): Higher motion/visual energy.
     - Core exposition (`definition`, `process`, `ipo`, `cause-effect`): Clear, steady rhythm.
     - Deep focus (`labelled-diagram`, `worked-example`): Extended hold frames for cognitive processing.
     - Closing (`summary`): High-salience recap cards or central takeaway layout.
   - Maintain stable tie-breaking and absolute determinism: identical inputs and planner version produce identical selections.
2. **Teacher Locks and Alternatives:**
   - Ensure teacher layout locks persist across replanning for all 10 scene types.
   - Provide "Try another layout" alternatives (primary vs alternate) for all 10 scene types in the Focus Studio UI.

## Increment 4 — Preflight Validation and Full-Lesson Parity

1. **Preflight Capability:**
   - Update full-lesson preflight checks to validate lessons containing any of the 10 scene types.
   - Remove temporary scene-type eligibility gates so standard-approach lessons with diagrams, examples, analogies, summaries, IPO, or cause-effect can apply creative designs.
2. **Parity and Render Evidence:**
   - Update `packages/scene-library/src/full-lesson.tsx` and runtime composition handlers to render all 60 treatments.
   - Update `creative-design-render.test.ts` to verify deterministic rendering across all 60 registered treatments, confirming distinct frame hashes without visual regressions.

## Acceptance Criteria

- [x] **AC1 — Complete 60-Treatment Catalogue:** All 60 style/scene/treatment combinations (3 packs × 10 scene types × 2 treatments) are registered in schema and catalogue. Each treatment specifies valid families, text limits, timing, and density.
- [x] **AC2 — Visual Distinction and Pack Fidelity:** Every newly added treatment renders with visually distinct, pack-appropriate framing, typography, borders, and decorative treatments across Essential, Editorial, and Everyday.
- [x] **AC3 — High-Density Diagram and Example Containment:** `labelled-diagram` and `worked-example` treatments maintain readable hold durations, contain-fit asset rendering, and collision-free callouts without text clipping or overlapping safe areas.
- [x] **AC4 — Lesson-Level Rhythm Planning:** `planCreativeDesign` produces deterministic selections across lessons combining any of the 10 scene types, observing lesson rhythm (energetic opener, paced body, quiet pause for complex diagrams, structured closing recap) and respecting teacher locks.
- [x] **AC5 — Full-Lesson Preflight & Application:** Lessons containing any combination of the 10 semantic scene types pass capability checks and can atomically apply creative styles without partial-styling fallbacks or unsupported scene errors.
- [x] **AC6 — Reproducibility and Frame Parity:** Preview and production render workers produce identical frame output from the same resolved creative design manifest across all 60 treatments.

## Required Tests

- [x] Schema tests verifying `creativeDesignSceneTypes`, all 60 `creativeDesignTreatmentIds`, catalogue completeness, and candidate family mappings.
- [x] Planner unit tests proving deterministic sequence selection, lesson rhythm scoring, hold-frame validation, and teacher lock retention across lessons with diverse scene types.
- [x] Layout and safe-area tests for `labelled-diagram` and `worked-example` ensuring callouts and step cards do not breach safe margins or caption bounds.
- [x] API and preflight integration tests ensuring lessons with all 10 scene types successfully validate and apply creative styles.
- [x] Real-frame render tests in `packages/scene-library` (e.g. extending `creative-design-render.test.ts`) validating deterministic, distinct output hashes for all 60 treatments.
- [x] Workspace lint, typecheck, tests, and `git diff --check`.

## Out of Scope

- New style packs beyond Essential, Editorial, and Everyday (deferred to ST-101).
- Demonstration-led event runtime modifications (governed by ST-095 and ST-099).
- Arbitrary CSS/JSX user overrides or unconstrained canvas layout editing.
- Automatic instructional content modification or text summarisation during styling.

## Dev Agent Record

- **Agent:** Antigravity
- **Started:** 2026-09-19
- **Completed:** 2026-09-19
- **Status:** In Review
- **Files changed:**
  - `packages/schemas/src/creative-design.ts`
  - `packages/schemas/src/creative-design.test.ts`
  - `apps/api/src/creative-design.ts`
  - `apps/api/src/creative-design.test.ts`
  - `packages/scene-library/src/full-lesson.tsx`
  - `packages/scene-library/src/creative-design-render.test.ts`
  - `stories/08-product-ui/ST-100-extend-composition-variety-to-remaining-scene-types.md`
  - `STORY_INDEX.md`
- **Migrations:** None (creative design plans are deterministic derived manifests, backward compatible with existing lesson versions)
- **Public contracts:**
  - `creativeDesignSceneTypes` expanded from 4 pilot types to all 10 semantic scene types (`input-process-output`, `cause-effect`, `labelled-diagram`, `analogy`, `worked-example`, `summary`).
  - `creativeDesignTreatmentIds` expanded to 60 unique IDs (3 packs × 10 scene types × 2 variants).
  - `CreativeDesignCandidate["family"]` union expanded with 12 new layout families (`flow`, `staged`, `chain`, `divergent`, `annotated`, `focused`, `parallel`, `metaphor`, `stepwise`, `walkthrough`, `recap-cards`, `central-takeaway`).
  - `planCreativeDesign` enhanced with lesson rhythm arc scoring (energetic opening, steady exposition, deep focus pause, structured recap) and variable hold frames (60-105 frames) for complex scenes.
- **Commands and evidence:**
  - `pnpm --filter @avlp/schemas build` (clean)
  - `pnpm --filter @avlp/schemas test` (18 files, 346 tests passed in 3.15s)
  - `pnpm --filter @avlp/api exec vitest run src/creative-design.test.ts src/creative-design-route.test.ts` (6 tests passed in 2.8s)
  - `pnpm --filter @avlp/scene-library exec vitest run src/creative-design-render.test.ts` (60 real Remotion frames rendered with 60 distinct SHA-256 digests in 99.7s)
  - `pnpm --filter web lint` (clean, 0 errors/warnings)
  - `git diff --check` (clean, 0 whitespace/diff errors)
- **Decisions:**
  - Maintained ST-097 standard floor of 2 treatments (`primary` and `alternate`) per pack for each of the 6 newly supported scene types, reaching a complete 60-treatment catalogue.
  - Preserved ADR-008 invariant: atomic styling across all scenes with zero mixed styled and default scenes.
  - Implemented dynamic hold frames (60-105 frames / 2.0-3.5s) in rhythm planning for `labelled-diagram` and `worked-example` to prevent visual rush on high-density diagrams.
- **Known risks:**
  - New style packs in ST-101 (Systems, Field Notes, Prism) will need corresponding treatments across all 10 scene types.
- **Deviations:** None.
- **Code review:** Ready for review against PRD, technical guide, and ADRs.
- **Repository-owner approval:** Pending
