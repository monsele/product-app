---
story_id: ST-016
title: "Implement the Comparison Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-016 — Implement the Comparison Scene Template

## Story

As a learner, I want two concepts displayed side by side so similarities and differences are easy to understand.

## Outcome

The comparison template renders two subjects, shared traits, and bounded differences using a stable split-screen layout.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US1, E11-US2
- `docs/reference/epic-technical-implementation-guide.md` — E11 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-010
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define comparison visual schema.
- [ ] Support left/right subjects, optional images, similarities, and differences.
- [ ] Implement split-screen layout and common-center/shared-traits area.
- [ ] Animate subjects first, then similarities and differences.
- [ ] Create fixtures for text-only, image-assisted, and maximum-density cases.

## Technical Implementation Requirements

- Limit the number and length of comparison items.
- Maintain equal visual weight unless data explicitly identifies a primary subject.
- Do not use red/green alone to communicate contrast.
- Asset aspect ratios must be normalized through shared media components.

## Contracts and Persistence

- `ComparisonVisual`.
- Comparison item and asset metadata.

## Interfaces

- Scene registry comparison implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Both subjects remain readable and visually balanced.
- [ ] Similarities and differences are clearly distinguishable.
- [ ] Maximum valid input does not overflow.
- [ ] Too many difference items produce the documented field error.

## Required Tests

- [ ] Schema limit tests.
- [ ] Visual regression tests.
- [ ] Asset missing/error fallback test.
- [ ] Render smoke test.

## Out of Scope

- Multi-way comparison.
- Chart-based numerical comparison.

## Story-Specific Notes

- Technical guide references: E11 and API error example in section 4.5.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [ ] Implement only this story's scope.
- [ ] Add or update schemas before changing consumers.
- [ ] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [ ] Add structured logs, correlation, audit, and usage records where applicable.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] Database migrations and compatibility notes are complete where applicable.
- [ ] Public schemas, events, and endpoints are documented.
- [ ] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [ ] No out-of-scope feature or unrelated refactor was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-11
- **Completed:** 2026-08-11
- **Branch/PR:** `story/st-005-job-platform` (pre-existing branch; no PR created)
- **Files changed:** schemas contract, compatibility docs/JSON Schema/tests; comparison scene, fixtures, registry, exports, smoke and layout tests; status records.
- **Migrations:** None. Compatibility migration added from 1.3 comparison labels to 1.4 structured subjects.
- **Contracts changed:** `LessonSpec` 1.4; `ComparisonVisual` has bounded left/right subjects, optional image slots, and at most four similarities or differences.
- **Commands/tests run:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all passed.
- **Screenshots or representative output:** Deterministic Remotion PNG smoke render for the image-assisted comparison fixture passed.
- **Decisions and assumptions:** Fixed two-column layout using shared tokens; missing image bindings use text-only subject cards.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Human review is required to transition In Review to Done.
