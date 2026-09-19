---
story_id: ST-099
title: "Compose Creative Styles with Demonstration-Led Explanation"
phase: "08 - Product UI"
status: Done
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-094", "ST-095", "ST-096", "ST-097", "ST-098"]
---

# ST-099 - Compose Creative Styles with Demonstration-Led Explanation

## Story

As a teacher, I want a demonstration-led lesson to be told in my chosen creative style, so that explanatory movement and visual identity are one video rather than two separate product modes.

## Scope and Architecture Decision

ADR-009 resolves this join. The demonstration event plan remains the sole owner of instructional objects, values, event anchors and frame timing. A registered demonstration presentation is a bounded member of a style pack: it may change renderer-owned palette, typography, caption treatment, decorative assets and safe presentation regions, but it cannot provide coordinates, paths, easing, JSX, CSS, or an event plan. The resolved presentation is immutable and part of variant identity.

The initial pilot matrix is the existing `savings` and `evaporation` recipes with `essential`, `editorial`, and `everyday` versions. Requests outside this matrix receive a structured, teacher-actionable rejection; there is no fallback to `mvp-default`.

An approach comparison freezes one resolved style for both variants. The standard variant uses the selected creative-design manifest and the demonstration variant uses the matching registered presentation. A changed design or approach creates a new variant.

## Acceptance Criteria

- [x] **AC1 - Bounded contract:** only registered recipe/style presentations are accepted. Invalid combinations reject at the API boundary without a provider call, arbitrary renderer instruction, or fallback.
- [x] **AC2 - Immutable tenant-scoped identity:** comparison variants retain resolved design and presentation inputs, whose canonical identity includes approach, plan, design and presentation hashes but excludes signed URLs. Legacy comparisons remain readable as historical `mvp-default` artefacts.
- [x] **AC3 - Controlled semantics:** every supported presentation retains ST-095's plan, measured narration, state evaluation, timing, captions, values, anchors and readable holds. It changes only bounded appearance.
- [x] **AC4 - Renderer/preflight:** preview and worker consume the same resolved presentation. Missing/changed assets, invalid presentation, timing/layout conflicts or unavailable releases fail actionably before publication, without substituting a style.
- [x] **AC5 - Teacher workflow:** eligible teachers can select a supported style before comparison creation, see it for both variants, and receive a visible recovery explanation for unsupported combinations.
- [x] **AC6 - Evidence:** schema, API, ownership, idempotency, renderer-state, rendered-frame and UI tests cover the supported matrix, rejection, stale inputs, legacy comparison and backward/out-of-order frames.

## Required Reading

- `docs/video-style-templates-brainstorm.md` - proposals 1 and 2 and the per-style savings example.
- `docs/controlled-rendering-versioning-contract.md` - CR-01, CR-02, CR-04, CR-05 and CR-06.
- ST-094 through ST-098, their records, evaluations and ADRs.
- `AGENTS.md`, `STORY_INDEX.md` and current ADRs.

## Required Tests

- [x] Schema capability and canonical-hash mutation tests.
- [x] API/database ownership, persistence, idempotency, stale completion and legacy-compatibility tests.
- [x] Renderer/browser frame-state and timing invariance, preflight and actual rendered-frame tests.
- [x] Focus Studio and comparison accessibility/workflow tests.
- [x] Affected lint, typecheck, test, build and `git diff --check`.

## Out of Scope

- New recipes, new styles, or new semantic scene types.
- Arbitrary-topic demonstration support.
- Any change to ST-095's verified instructional event semantics.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-09-19
- **Completed:** 2026-09-19
- **Status:** In review.
- **Files changed:** bounded demonstration-presentation schemas, comparison creation/identity, production hydration, shared demonstration composition/primitives/recipes, comparison UI, ADR-009, story and index.
- **Migrations:** None. The resolved demonstration presentation is stored in the existing immutable demonstration-variant plan JSON; existing plans without it retain `mvp-default`.
- **Public contracts:** `DemonstrationPresentation` and the optional immutable `presentation` on a variant plan; comparison `themeId` now admits the three registered packs. Unknown packs, a mismatched presentation/theme, or a creative theme without its resolved presentation are rejected.
- **Commands and evidence:** schema test (25), API pilot test (13), renderer contracts test (5), scene-library demonstration contract test (34), comparison-style UI test (1), package typechecks, web lint/typecheck, targeted Prettier check, and `git diff --check` passed. The full repository Prettier check reports pre-existing formatting violations under checked-in tool/worktree directories outside this story's diff.
- **Decisions:** ADR-009 keeps all semantic objects and timing in ST-095's event plan. A saved ST-097 creative design is frozen by the baseline lesson version, projected into the demonstration variant, and never resolved from a current draft or URL.
- **Known risks:** This is deliberately a two-recipe, three-pack pilot. New recipes/styles require an authored registered presentation and evidence; no arbitrary style or layout instruction is accepted.
- **Deviations:** No migration was needed because the existing immutable `plan` record is the appropriate variant-owned persistence boundary.
- **Code review:** **Approved.** The review fixed an in-scope legacy-style fallback regression and found no remaining blocking, high or medium issue.
- **Repository-owner approval:** Approved 2026-09-19; story marked Done.
