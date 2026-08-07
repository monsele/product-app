---
story_id: ST-041
title: "Capture and Validate Lesson Configuration"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E6"]
prd_user_stories: ["E6-US1", "E6-US2", "E6-US3"]
depends_on: ["ST-028", "ST-038", "ST-039", "ST-040"]
---

# ST-041 — Capture and Validate Lesson Configuration

## Story

As a teacher, I want to set learner level, difficulty, title, subject, duration, tone, visual style, and recall preference before generation.

## Outcome

A versioned configuration form saves all required generation inputs and advances the project only when valid.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E6-US1, E6-US2, E6-US3
- `docs/reference/epic-technical-implementation-guide.md` — E6 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-028
- ST-038
- ST-039
- ST-040

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create lesson configuration persistence and revision handling.
- [ ] Support age bands, difficulty, subject, lesson title, 3/5/7-minute target, friendly/academic/conversational tone, MVP theme, and recall-question preference.
- [ ] Allow suggested subject/title values while preserving teacher edits.
- [ ] Define duration-to-narration target ranges.
- [ ] Implement form validation, save, conflict, and next-step behavior.
- [ ] Include effective selected-source version in configuration context.

## Technical Implementation Requirements

- MVP product target remains introductory science for ages 10–16 even if schema contains future-safe enums.
- Only one visual theme is selectable in MVP.
- Generation cannot proceed until required fields and source review are complete.
- Changing configuration later invalidates only affected unapproved or derived outputs according to dependency rules.

## Contracts and Persistence

- Lesson configuration entity/DTO.
- Age, difficulty, duration, tone, theme enums.
- Narration word-count target helper.

## Interfaces

- `GET /projects/:id/configuration`.
- `PUT /projects/:id/configuration`.
- Configuration route/form.

## Acceptance Criteria

- [ ] A valid configuration persists and is returned after refresh.
- [ ] Required fields and allowed values are enforced client and server side.
- [ ] Duration produces a documented target word-count range.
- [ ] The project cannot advance without confirmed source content and valid configuration.
- [ ] Stale updates show a conflict.

## Required Tests

- [ ] Configuration schema tests.
- [ ] API validation and concurrency tests.
- [ ] Duration-target tests.
- [ ] Workflow guard test.
- [ ] Form Playwright test.

## Out of Scope

- Multiple languages.
- Custom themes.
- Arbitrary video durations.
- Student profiles.

## Story-Specific Notes

- Technical guide references: E6.

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
