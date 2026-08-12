---
story_id: ST-021
title: "Implement the Summary Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-021 — Implement the Summary Scene Template

## Story

As a learner, I want the lesson’s central model rebuilt concisely at the end.

## Outcome

The summary template renders a bounded set of key takeaways and optional central visual.

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

- [x] Define summary visual schema.
- [x] Support lesson title/summary heading, bounded takeaway items, and optional central asset/model.
- [x] Implement sequential recall/rebuild animation.
- [x] Support optional objective-linked badges without displaying internal IDs.
- [x] Add text-only and visual-assisted fixtures.

## Technical Implementation Requirements

- The summary is concise and does not become a transcript.
- Takeaway order comes from LessonSpec.
- Use the same visual vocabulary established earlier in the lesson where possible.
- Keep caption space clear.

## Contracts and Persistence

- `SummaryVisual`.
- Takeaway item schema.

## Interfaces

- Scene registry summary implementation.
- Preview composition.

## Acceptance Criteria

- [x] All valid takeaways render without overflow.
- [x] The template supports text-only rendering.
- [x] Excessive items/text fail with field-specific errors.
- [x] The final frame is suitable for thumbnail selection if chosen.

## Required Tests

- [x] Schema tests.
- [x] Visual regression tests.
- [x] Final-frame render test.
- [x] Caption safe-area test.

## Out of Scope

- Recall-question template, which is outside the ten required MVP templates unless added later by ADR.
- Automatic summary generation.

## Story-Specific Notes

- Technical guide references: E11.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-12
- **Completed:** 2026-08-12; ready for review.
- **Branch/PR:** `story/st-020` (pre-existing working branch)
- **Files changed:** Summary schema, registry, renderer, fixtures, schema and render tests, generated JSON schema, and compatibility notes.
- **Migrations:** LessonSpec 1.7 to 1.8 upgrades concise string takeaways to structured items; summaries with more than four takeaways require teacher migration.
- **Contracts changed:** `SummaryVisual` now has 1–4 structured takeaways, optional `centralModel`, optional approved `central-visual` asset slot, and optional call to action.
- **Commands/tests run:** schemas build and test (36 passing); scene-library typecheck and lint passing; full scene-library test (41 passing, including full Remotion smoke); summary unit/safe-area test (3 passing); deterministic three-frame Remotion render-regression test passing.
- **Screenshots or representative output:** SHA-256 visual regression frames at initial, recall, and thumbnail frames in `summary-scene-render.test.ts`.
- **Decisions and assumptions:** Objective badges deliberately show only the generic label `OBJECTIVE`, never internal identifiers. Central assets reuse the existing approved image-source policy and block final render when unresolved.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** The full scene-library suite takes about 87 seconds because its visual smoke test renders every template; run it in CI or a background process rather than a short interactive command window.
