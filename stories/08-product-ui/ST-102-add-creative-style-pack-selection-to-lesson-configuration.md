---
story_id: ST-102
title: "Add Creative Style Pack Selection to Lesson Configuration"
phase: "08 — Product UI"
status: Done
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2"]
depends_on: ["ST-096", "ST-097", "ST-100", "ST-101"]
---

# ST-102 — Add Creative Style Pack Selection to Lesson Configuration

> **Completed 2026-09-22.** This story removes the `CREATIVE_DESIGN_PILOT_ENABLED`
> cohort gate and wires the existing, already-proven six-pack creative-design
> catalogue (ADR-005, ADR-010; ST-094, ST-097, ST-100, ST-101) into the
> lesson-configuration screen and the automatic storyboard-generation pipeline,
> so any teacher can choose a visual style and have it flow into their
> generated video. It does not add new packs, new scene-type coverage, or
> change the demonstration-approach matrix (ADR-009).

## Story

As a teacher, I want to choose the video's visual style when I configure my lesson, so the generated video actually looks the way I picked instead of always defaulting to the one legacy appearance.

## Gap This Closes

The lesson-configuration screen's "Visual theme" card was a hardcoded, non-interactive display of `mvp-default`. Separately, `apps/api/src/creative-design.ts` already had a mature, fully-tested six-pack manifest resolver (`essential`, `editorial`, `everyday`, `systems`, `field-notes`, `prism`, all proven across all ten semantic scene types with real H.264/AAC MP4 render evidence per ST-098 and ST-101) — but it was reachable only through a manual, per-scene editor in the storyboard step, gated behind `CREATIVE_DESIGN_PILOT_ENABLED` and a hardcoded user-ID allowlist, and never invoked by the automatic lesson-generation pipeline. No teacher could pick a style and have it show up in their video.

ADR-005 (the ADR that would formally lift the PRD's one-production-theme constraint, E11-US2) was still status **Proposed**: "the PRD's one-production-theme constraint remains in force until a product owner accepts this decision." The product owner gave that direction in this story.

## Scope and Decisions

- A new, independent `creativeStylePack: CreativeDesignPackId | null` field on
  lesson configuration — deliberately **not** a repurposing of the existing
  `visualTheme`/`themeId` axis, which stays pinned to the legacy frozen
  `mvp-default` design-token set it has always meant. `null` (the default,
  and every pre-existing lesson) keeps that legacy appearance.
- The pipeline worker resolves the configured pack into a creative-design
  manifest automatically when a storyboard is generated (a fresh read of the
  configuration at persist time, not threaded through the AI generation
  `params`/idempotency key, so switching only the style never forces a new
  paid model call) and writes both a draft and a snapshot row in the same
  transaction as the storyboard's scenes.
- The `CREATIVE_DESIGN_PILOT_ENABLED`/`CREATIVE_DESIGN_PILOT_USER_IDS` cohort
  gate is deleted outright from `PostgresCreativeDesignService`, not merely
  defaulted to enabled — every method it gated is now unconditionally
  available to the request's own tenant scope.
- An unresolvable manifest (a scene/pack combination the catalogue cannot
  cover) fails the storyboard-persist job as a terminal `JobExecutionError`
  rather than silently falling back to `mvp-default` or substituting a
  different pack (ADR-005, CR-01).
- Editorial's known photographic-supply gap (ADR-005) is not resolved here;
  the pack stays offered because the system already fails a missing-asset
  treatment explicitly rather than degrading silently.
- The demonstration-approach style matrix (ADR-009: `essential`/`editorial`/
  `everyday` for the `savings`/`evaporation` recipes only) is untouched.

## Acceptance Criteria

- [x] The lesson-configuration screen shows a real, interactive theme
      selector (seven options: the legacy default plus the six registered
      packs) in place of the hardcoded display card.
- [x] Saving a lesson configuration with a chosen pack persists it; omitting
      the field on a later save keeps the stored choice; an explicit `null`
      reverts to the legacy appearance.
- [x] Generating a storyboard for a lesson configured with a chosen pack
      automatically creates a resolved creative-design draft and snapshot for
      that lesson spec, with no manual per-scene action required.
- [x] A lesson with no chosen pack, and every lesson generated before this
      story, is unaffected and continues to render as `mvp-default`.
- [x] The creative-design API (`getDraft`, `plan`, `alternatives`, `apply`,
      presets) is available to any authenticated owner for their own tenant
      scope, with no pilot allowlist.
- [x] An unresolvable manifest fails the storyboard job explicitly (a
      terminal, reported error) rather than silently omitting the style or
      substituting a different pack.

## Required Tests

- [x] Schema validation: omitted/null/each registered pack accepted, an
      unregistered value rejected.
- [x] API save/read round-trip and omission-keeps-existing-value semantics
      for `creativeStylePack`.
- [x] Pipeline-worker: a configured pack produces a draft and snapshot row
      matching the storyboard's lesson spec; no pack produces neither; an
      unresolvable pack fails as a terminal job error.
- [x] Creative-design service: any authenticated owner can call it for their
      own tenant scope (no pilot cohort check).
- [x] UI: the selector renders all seven options, reflects the saved value,
      calls back with the right value including `null`, and disables while a
      save is in flight.
- [x] Affected lint, typecheck, and targeted test suites.

## Out of Scope

- New style packs, new scene-type coverage, or resolving Editorial's
  photographic-supply gap.
- Any change to the demonstration approach or its ADR-009 recipe matrix.
- Manually re-styling an already-generated storyboard without regenerating
  it — that remains the existing (now ungated) per-scene creative-design
  editor's job, unchanged by this story.

## Required Reading

- `AGENTS.md`, `STORY_INDEX.md`, current ADRs (especially ADR-005, ADR-009,
  ADR-010).
- `docs/reference/mvp-prd.md` — E11-US2.
- `docs/video-style-templates-brainstorm.md` and
  `docs/creative-styles-proof-evaluation.md` for the pack catalogue and its
  known limitations.

## Dev Agent Record

- **Agent:** Claude Sonnet 5
- **Started:** 2026-09-22
- **Completed:** 2026-09-22
- **Status:** Done.
- **Files changed:** `packages/schemas/src/creative-design.ts` (moved
  `createDefaultCreativeDesignManifest`, `canonicalCreativeDesignJson`,
  `creativeDesignHash` here from the API so the pipeline worker can call them
  directly, using `sha256` instead of `node:crypto` — see Bugs below);
  `packages/config/src/index.ts` (newly exports the existing browser-safe
  `sha256` helper); `packages/schemas/src/index.ts` (new `creativeStylePack`
  field on the lesson-configuration schemas); `packages/database/src/schema.ts` and
  migration `0066_lesson_configuration_creative_style_pack` (new nullable
  `text` column); `apps/api/src/lesson-configuration.ts` (persist/read the new
  field, mirroring the `videoApproach` pattern); `apps/api/src/creative-design.ts`
  (deleted `assertPilot`/`CreativeDesignCohort`/the cohort constructor
  parameter and all eleven call sites; re-exports the moved functions);
  `apps/api/src/runtime.ts` and `packages/config/src/index.ts` (removed the
  two pilot env vars and their wiring); `apps/pipeline-worker/src/storyboard-job.ts`
  (reads the configured pack fresh inside `persistLessonStoryboardDraft` and
  writes a creative-design draft + snapshot); new
  `apps/web/app/workspace/[projectId]/configuration/creative-style-pack-selector.tsx`
  and its wiring into `configuration-workspace.tsx` and
  `lesson-configuration-input.ts`; `docs/adr/ADR-005-versioned-style-packs-for-multi-style-video.md`
  (status Proposed → Accepted); `docs/reference/mvp-prd.md` (E11-US2's
  approved-extension note updated); this story and `STORY_INDEX.md`.
- **Migrations:** `0066_lesson_configuration_creative_style_pack.sql` —
  additive nullable `text` column on `lesson_configurations`. See its
  `.compatibility.md`.
- **Public contracts:** `LessonConfiguration`/`LessonConfigurationInput` gain
  `creativeStylePack: CreativeDesignPackId | null`. The creative-design API's
  request/response contracts are unchanged; only its authorization gate is
  removed.
- **Commands/tests run:** targeted Vitest runs (isolated per suite against the
  local Postgres container, per this session's established pattern) for
  `packages/schemas/src/lesson-configuration.test.ts` (13/13),
  `apps/api/src/lesson-configuration.integration.test.ts` (10/10),
  `apps/api/src/creative-design.test.ts` (6/6),
  `apps/api/src/creative-design-route.test.ts` (3/3), new
  `apps/api/src/creative-design.integration.test.ts` (1/1),
  `apps/pipeline-worker/src/storyboard-job.test.ts` (28/28, 3 new),
  `apps/api/src/lesson-versions.test.ts` (17/18 — see Known risks),
  `apps/api/src/lesson-versions.integration.test.ts`,
  `apps/api/src/outline.integration.test.ts`,
  `apps/api/src/storyboard.integration.test.ts` (all passing), new
  `apps/web/app/workspace/[projectId]/configuration/creative-style-pack-selector.playwright.test.tsx`
  (3/3). `tsc --noEmit` clean for `apps/api`, `apps/pipeline-worker`,
  `apps/web`, `packages/schemas`, `packages/database`. Additionally verified
  live: the full stack was started (`run-app` skill), a real session cookie
  used to load `/workspace/:id/configuration` in a headless browser confirmed
  all 7 options render, clicking a pack updates both the control's
  `aria-checked` state and the sidebar's "Visual Theme" summary line.
- **Decisions and assumptions:** `creativeStylePack` is an independent field,
  not a repurposing of `visualTheme`/`themeId` (see Scope). The configured
  pack is read fresh by the pipeline worker rather than threaded through
  `StoryboardGenerationParams`/the paid AI model-call payload, so a
  style-only change never forces a new paid generation. The pilot gate is
  deleted outright, not defaulted to enabled, since a dead gate that still
  looks like it restricts something is worse than no gate.
- **Bugs found and fixed during this story's own verification (not
  pre-existing):**
  1. Moving `creativeDesignHash`/`canonicalCreativeDesignJson` into
     `packages/schemas` (needed so the pipeline worker could call them) used
     `node:crypto`, which `apps/web`'s webpack build cannot bundle — this
     broke the whole configuration page (`UnhandledSchemeError` on
     `node:crypto`), only caught by the live-browser check, not by `tsc` or
     Vitest. Fixed by using the repository's existing browser-safe pure-JS
     `sha256()` (`packages/config/src/crypto.ts`, already used for the same
     reason elsewhere) instead, newly exported from `@avlp/config`'s main
     barrel. Same algorithm, byte-identical output — no stored `manifestHash`
     is invalidated.
  2. The configuration sidebar's "Visual Theme" summary row was hardcoded to
     the literal string `"Warm editorial"`, unlike every other summary row
     (narrator voice, duration, etc.), which read live form state. Since the
     theme was previously always exactly that one value, this was invisible;
     now it silently lied whenever a teacher picked a different pack. Fixed
     to look up the selected option's label, matching the other rows.
- **Known risks:** `apps/api/src/lesson-versions.test.ts` has one pre-existing
  failing test unrelated to this story (`ENOENT` reading
  `0045_orange_scourge.sql`, a `process.cwd()`-relative path issue reproducible
  on `main` before this story's changes) — not touched or caused by this work.
  `apps/pipeline-worker/src/duration-reconciliation.integration.test.ts` has
  two pre-existing failing assertions (a 33-vs-34-second rounding mismatch)
  in code this story does not touch. The repository's `packages/database/drizzle/meta/`
  snapshot files for migrations 0049–0065 are missing from the repo (a
  pre-existing gap discovered while generating this story's migration, not
  introduced by it); `drizzle-kit generate` will misbehave until that gap is
  backfilled, so this story's migration was hand-verified against the live
  schema and written by hand rather than trusting the generated diff.
- **Deviations:** None from the approved plan.
