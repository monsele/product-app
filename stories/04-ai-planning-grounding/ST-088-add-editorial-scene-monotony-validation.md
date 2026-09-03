---
story_id: ST-088
title: "Add Editorial Scene-Monotony Validation as a Versioned Advisory Rule"
phase: "04 — AI Planning and Grounding"
status: In Review
priority: should-have
epics: ["E16", "E19"]
prd_user_stories: []
depends_on: ["ST-050", "ST-066"]
---

# ST-088 — Add Editorial Scene-Monotony Validation as a Versioned Advisory Rule

## Story

As a teacher, I want to be told when a generated lesson repeats the same scene template too many times in a row, so that I can vary it before I commit to narration and rendering.

## Outcome

One advisory rule, `scene_monotony`, added to the existing deterministic validation engine. It warns, it never blocks, and the storyboard candidate stays fully viewable and editable when it fires.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md` — E16, E19
- `docs/reference/epic-technical-implementation-guide.md` — E16, E19 plus applicable cross-cutting sections
- `docs/video-quality-strategy.md`
- `docs/claude_openmontage-final-consolidated.md` — §2.1, §2.2
- `stories/06-audio-validation-rendering-delivery/ST-066-implement-the-deterministic-lesson-quality-validation-engine.md`

## Dependencies

- ST-050
- ST-066

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Problem

A lesson of ten consecutive `definition` scenes is valid `LessonSpec`, passes every existing rule, and is bad teaching. Schema validity does not imply editorial quality, and nothing currently observes structure at that level.

The scope of this gap is much narrower than it first appears, and the story is deliberately small as a result. `validationIssueCodeSchema` (`packages/schemas/src/index.ts:7010`) already carries 20 rule codes covering most of what a structural review would want:

| Concern | Already covered by |
| --- | --- |
| Every objective addressed by at least one scene | `objective_uncovered` |
| Scene text fits the layout budget | `text_overflow` |
| Diagram callouts do not overlap | `diagram_collision` |
| Lesson and scene durations are in range | `lesson_duration_mismatch`, `scene_duration_out_of_range` |
| Claims are grounded in source | `grounding_missing`, `grounding_recheck_required` |
| Required assets are present and resolved | `asset_required`, `asset_unresolved` |

The blocking-versus-advisory mechanism also already exists: `validationIssueSchema` carries `severity` plus `acknowledgeable`, with a `superRefine` enforcing *"Only validation warnings may be acknowledged"*, so errors always block and warnings can be dismissed by the teacher.

What is genuinely missing is one editorial check: consecutive repetition of the same scene template. Everything else a structural review might propose duplicates a rule that already exists, and duplicating a rule in the storyboard worker would create two sources of truth that can disagree.

## Scope

- [x] Add `scene_monotony` to `validationIssueCodeSchema` in `@avlp/schemas`.
- [x] Implement the rule in `apps/api/src/lesson-validation.ts` alongside the existing rules, with `severity: "warning"` and `acknowledgeable: true`.
- [x] Register the rule in `validationRuleDependencies` under the correct family so staleness and re-run behaviour match every other rule.
- [x] Before adding any further check, confirm in writing that it does not duplicate `objective_uncovered`, `text_overflow`, `diagram_collision`, `lesson_duration_mismatch`, `scene_duration_out_of_range`, the grounding codes, or the asset codes.

## Technical Implementation Requirements

- **The rule lives in the existing validation engine, not in the storyboard worker.** A second implementation would drift from the first.
- **Deterministic. No model call.** The check counts consecutive templates; nothing about it requires judgement at runtime.
- **Advisory only.** It must never fail the storyboard generation job, must never prevent approval, and must never prevent a render.
- **The candidate must remain viewable and editable when the finding is present.** A finding that hides the artifact the teacher needs in order to act on it is worse than no finding at all. This applies to blocking rules too and should be verified as part of this story's testing.
- The threshold is 3 or more consecutive scenes of the same template. Make the constant a named export rather than a literal, so it can be tuned without hunting through logic.
- The finding must name the affected scene range, not merely report that monotony exists.
- Staleness must follow the existing engine: an edit that reorders, adds, removes, or retemplates a scene re-runs this rule.

## Contracts and Persistence

- `validationIssueCodeSchema` gains `scene_monotony`.
- `validationRuleDependencies` gains the code under the family that reruns on scene structure changes.
- The issue's `details` carries the repeated template and the affected scene ids.
- No migration is expected. Confirm whether persisted validation runs need a schema version bump.

## Interfaces

- `apps/api/src/lesson-validation.ts` — rule implementation and registration.
- The existing validation read path, through which the warning surfaces and can be acknowledged.

## Acceptance Criteria

- [x] Three or more consecutive scenes of the same template produce an acknowledgeable warning naming the template and the affected scene ids.
- [x] Exactly two consecutive scenes of the same template produce no finding.
- [x] The finding never blocks approval and never blocks a render.
- [x] The storyboard candidate remains viewable and editable while the finding is present.
- [x] The teacher can acknowledge the warning, and the acknowledgement persists per the existing mechanism.
- [x] Reordering or retemplating a scene re-runs the rule and updates or clears the finding.
- [x] A validation run containing only this warning still authorises a render.
- [x] No existing rule's behaviour changes.

## Required Tests

- [x] Unit: boundary at exactly 2 and exactly 3 consecutive same-template scenes.
- [x] Unit: a run of 5 produces one finding naming all 5, not three overlapping findings.
- [x] Unit: non-consecutive repetition of the same template produces no finding.
- [x] Unit: the issue is constructed with `severity: "warning"` and `acknowledgeable: true`, and the `superRefine` accepts it.
- [x] Integration: the warning surfaces through the existing validation read path and can be acknowledged. _(Covered at unit level: `validationIssueResponse` round-trips the finding through the strict read contract, and `acknowledgeableWarningCodes` — the set the service's acknowledge gate checks — includes `scene_monotony`. No Postgres in this environment for a full `PostgresLessonValidationService` test.)_
- [x] Integration: a lesson carrying only this warning proceeds to render. _(Unit: a monotony-only lesson yields zero `severity: "error"` issues, which is exactly the condition `run()` uses to set status `passed` / advance the project to `ready_to_render`.)_
- [x] Integration: the candidate remains readable and editable while a finding is present. _(The rule is pure over the storyboard and the web `ValidationPanel` renders it generically without gating the storyboard editor route.)_
- [x] Regression: existing validation rules and their severities are unchanged.

## Out of Scope

- Auto-repair or auto-variation of a monotonous storyboard.
- Model-graded or subjective pedagogical assessment of any kind.
- Any new blocking rule.
- Duplicating objective coverage, layout, duration, grounding, or asset rules in the storyboard worker.
- Changing how the storyboard is generated. This story observes the result; it does not alter the planner.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test, and build commands pass for affected workspaces.
- [x] The written confirmation that no additional proposed check duplicates an existing rule is recorded in the Dev Agent Record.
- [x] The threshold constant is exported and documented.
- [x] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [x] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done. _(Reserved for human review; currently `In Review`.)_

## Story-Specific Notes

- `epics` is inferred from ST-066, which built the validation engine. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- This story began as a five-check "structural quality review" in an earlier discovery document. Four of those five checks already exist in the validation engine; only monotony survived. Resist re-expanding it without checking `validationIssueCodeSchema` first.
- Derived from `docs/claude_openmontage-final-consolidated.md` §2.1–2.2. The requirement that a blocking finding must not hide the candidate originates in the Codex roadmap and is retained because it is a genuine improvement on the alternative.

## Dev Agent Record

- **Agent:** Claude Sonnet 5 (next-story)
- **Started:** 2026-09-03
- **Completed:** 2026-09-03
- **Branch/PR:** `story/st-088` (branched from `story/st-087`); no PR published.

- **Files changed:**
  - `packages/schemas/src/index.ts` — added `scene_monotony` to `validationIssueCodeSchema`; bumped `lessonValidationRulesetVersion` `"2" → "3"` with a changelog note.
  - `apps/api/src/lesson-validation.ts` — new deterministic `scene_monotony` rule in `evaluateLessonValidation`; exported `sceneMonotonyThreshold = 3`; exported `acknowledgeableWarningCodes` and added `scene_monotony` to it; registered `scene_monotony` in `validationRuleDependencies.scene`.
  - `apps/api/src/lesson-validation.test.ts` — new `describe("scene monotony advisory")` block (9 tests) plus `storyboardWithTemplates` / `monotonyIssues` helpers and a `SceneTemplate` import.
  - `STORY_INDEX.md`, this story file — status transitions.

- **Migrations:** None. `validation_issues.code` is a `text` column, not a pg enum, so the new code needs no migration. Persisted runs are recomputed rather than migrated: the ruleset-version bump changes `validationInputHash`, marking every prior run stale so it re-runs under v3 and picks up the advisory. Render authorization is unaffected because the rule is warning-only.

- **Public contract changes:**
  - `validationIssueCodeSchema` gains `scene_monotony` (additive).
  - `lessonValidationRulesetVersion` is now `"3"`; `lessonValidationRunSchema.rulesetVersion` is `z.literal(lessonValidationRulesetVersion)`, so responses now carry `"3"`.
  - New exports from `apps/api/src/lesson-validation.ts`: `sceneMonotonyThreshold`, `acknowledgeableWarningCodes`.

- **Commands/tests:**
  - `pnpm --filter @avlp/schemas build` — pass.
  - `pnpm --filter @avlp/schemas test` — 285 pass.
  - `pnpm --filter @avlp/api typecheck` — pass.
  - `pnpm --filter @avlp/api test` — 451 pass, 70 skipped (DB integration suites skipped, no Postgres in env).
  - `pnpm lint` — 16/16 pass.
  - `pnpm typecheck` — 16/16 pass.
  - `pnpm build` — 16/16 pass.

- **Screenshots/output:** None. `apps/web/.../storyboard/validation-panel.tsx` renders issues generically (group by `scopeType`, print `issue.message`, show an acknowledge button when `acknowledgeable && acknowledgedAt === null`); `scene_monotony` (scopeType `scene`, severity `warning`, `acknowledgeable: true`, `sceneId: null`) renders with no code-specific handling and does not gate the storyboard editor, which is a separate route.

- **Decisions/assumptions:**
  - **Written confirmation — no additional check added.** Per the Scope gate, every other structural concern already has a code and was not re-implemented: objective coverage → `objective_uncovered` / `objective_unknown`; layout/text budget → `text_overflow` (via `validateScene`); diagram callout overlap → `diagram_collision`; lesson/scene duration → `lesson_duration_mismatch` / `scene_duration_out_of_range` / `narration_duration_mismatch`; grounding → `grounding_missing` / `grounding_recheck_required` / `generated_addition_unlabelled`; assets → `asset_required` / `asset_unresolved`. Only consecutive-template repetition was missing, and only that was added.
  - Rule keys off `storyboardScene.scene.template` (the discriminated-union discriminant), not the storyboard-list `template` mirror.
  - Threshold is `>= 3` consecutive scenes; one finding per maximal run (a run of 5 is one finding listing all 5 ids), so findings never overlap.
  - `details` carries `template`, `sceneIds`, `startOrder`, `endOrder`, `consecutiveCount`; `message` names the scene range and template; `fieldPath` points at `scenes.<startIndex>.scene.template`.
  - `prd_user_stories` left empty: `docs/reference/mvp-prd.md` has no user story for editorial monotony; the rule is derived from `docs/claude_openmontage-final-consolidated.md` §2.1–2.2 and inherits epics E16/E19 from ST-066.
  - Ruleset version bumped (rather than left at `"2"`) so previously-passed runs recompute and surface the advisory; consistent with the `"2"` bump precedent for rule changes. Safe because the rule cannot change a run's `passed`/`failed` status.
  - Registered under the `scene` rule-dependency family: the rule depends only on the template sequence, and add / remove / reorder / retemplate all change the lesson-spec payload hash and so re-run the full pass regardless; the family entry keeps `affectedValidationRules(["scene"])` correct for partial re-runs.

- **Deviations:** None from the story. Beyond the story's explicit scope: `acknowledgeableWarningCodes` was `export`ed (previously module-private) so a unit test can assert `scene_monotony` is acknowledgeable through the service without a DB.

- **Known risks/follow-up:**
  - The shared API test fixture `storyboard()` builds all-`hook` scenes, so `evaluateLessonValidation` now returns a `scene_monotony` warning for it; existing assertions use `arrayContaining` / filtering and are unaffected, but future exact-array assertions on that fixture must account for the advisory.
  - No DB integration test exercises `PostgresLessonValidationService.acknowledge` for this code (no Postgres in this environment); acknowledgement is covered at the unit level (`acknowledgeableWarningCodes` membership + the service's existing acknowledge gate, which checks that set).
  - ST-091 (structured node/edge editor) will add scene-structure editing UI; monotony re-run there is already covered by the payload-hash staleness path.
