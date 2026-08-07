---
story_id: ST-021
title: "Implement the Summary Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
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

- [ ] Define summary visual schema.
- [ ] Support lesson title/summary heading, bounded takeaway items, and optional central asset/model.
- [ ] Implement sequential recall/rebuild animation.
- [ ] Support optional objective-linked badges without displaying internal IDs.
- [ ] Add text-only and visual-assisted fixtures.

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

- [ ] All valid takeaways render without overflow.
- [ ] The template supports text-only rendering.
- [ ] Excessive items/text fail with field-specific errors.
- [ ] The final frame is suitable for thumbnail selection if chosen.

## Required Tests

- [ ] Schema tests.
- [ ] Visual regression tests.
- [ ] Final-frame render test.
- [ ] Caption safe-area test.

## Out of Scope

- Recall-question template, which is outside the ten required MVP templates unless added later by ADR.
- Automatic summary generation.

## Story-Specific Notes

- Technical guide references: E11.

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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Contracts changed:**
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Deviations from story/technical guide:**
- **Known risks or follow-up:**
