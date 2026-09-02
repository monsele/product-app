---
story_id: ST-088
title: "Add Editorial Scene-Monotony Validation as a Versioned Advisory Rule"
phase: "04 — AI Planning and Grounding"
status: Draft
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

- [ ] Add `scene_monotony` to `validationIssueCodeSchema` in `@avlp/schemas`.
- [ ] Implement the rule in `apps/api/src/lesson-validation.ts` alongside the existing rules, with `severity: "warning"` and `acknowledgeable: true`.
- [ ] Register the rule in `validationRuleDependencies` under the correct family so staleness and re-run behaviour match every other rule.
- [ ] Before adding any further check, confirm in writing that it does not duplicate `objective_uncovered`, `text_overflow`, `diagram_collision`, `lesson_duration_mismatch`, `scene_duration_out_of_range`, the grounding codes, or the asset codes.

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

- [ ] Three or more consecutive scenes of the same template produce an acknowledgeable warning naming the template and the affected scene ids.
- [ ] Exactly two consecutive scenes of the same template produce no finding.
- [ ] The finding never blocks approval and never blocks a render.
- [ ] The storyboard candidate remains viewable and editable while the finding is present.
- [ ] The teacher can acknowledge the warning, and the acknowledgement persists per the existing mechanism.
- [ ] Reordering or retemplating a scene re-runs the rule and updates or clears the finding.
- [ ] A validation run containing only this warning still authorises a render.
- [ ] No existing rule's behaviour changes.

## Required Tests

- [ ] Unit: boundary at exactly 2 and exactly 3 consecutive same-template scenes.
- [ ] Unit: a run of 5 produces one finding naming all 5, not three overlapping findings.
- [ ] Unit: non-consecutive repetition of the same template produces no finding.
- [ ] Unit: the issue is constructed with `severity: "warning"` and `acknowledgeable: true`, and the `superRefine` accepts it.
- [ ] Integration: the warning surfaces through the existing validation read path and can be acknowledged.
- [ ] Integration: a lesson carrying only this warning proceeds to render.
- [ ] Integration: the candidate remains readable and editable while a finding is present.
- [ ] Regression: existing validation rules and their severities are unchanged.

## Out of Scope

- Auto-repair or auto-variation of a monotonous storyboard.
- Model-graded or subjective pedagogical assessment of any kind.
- Any new blocking rule.
- Duplicating objective coverage, layout, duration, grounding, or asset rules in the storyboard worker.
- Changing how the storyboard is generated. This story observes the result; it does not alter the planner.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] The written confirmation that no additional proposed check duplicates an existing rule is recorded in the Dev Agent Record.
- [ ] The threshold constant is exported and documented.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-066, which built the validation engine. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- This story began as a five-check "structural quality review" in an earlier discovery document. Four of those five checks already exist in the validation engine; only monotony survived. Resist re-expanding it without checking `validationIssueCodeSchema` first.
- Derived from `docs/claude_openmontage-final-consolidated.md` §2.1–2.2. The requirement that a blocking finding must not hide the candidate originates in the Codex roadmap and is retained because it is a genuine improvement on the alternative.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
