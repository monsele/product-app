---
story_id: ST-067
title: "Build Validation Issue Resolution UI and Warning Acknowledgment"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
priority: must-have
epics: ["E16"]
prd_user_stories: ["E16-US2"]
depends_on: ["ST-066", "ST-054", "ST-056"]
---

# ST-067 — Build Validation Issue Resolution UI and Warning Acknowledgment

## Story

As a teacher, I want each quality issue to explain what is wrong and take me directly to the affected scene or lesson setting.

## Outcome

The validation screen groups blocking errors and warnings, deep links to fixes, reruns after relevant changes, and stores permitted warning acknowledgments.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E16-US2
- `docs/reference/epic-technical-implementation-guide.md` — E16 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-066
- ST-054
- ST-056

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Build lesson validation summary with counts and readiness state.
- [ ] Group issues by lesson, scene, audio, caption, asset, and grounding categories.
- [ ] Implement deep links/focus to affected storyboard fields or configuration.
- [ ] Implement explicit rerun and adaptive polling for asynchronous checks if any.
- [ ] Implement acknowledgment only for allowlisted warning codes and exact validation hash.
- [ ] Clear acknowledgments when relevant input changes.
- [ ] Display render-disabled reason until all blocking issues are resolved.

## Technical Implementation Requirements

- Acknowledgment never converts a blocking issue to a warning.
- A stale validation report is visibly unusable for render.
- Issue copy is actionable and non-technical where possible.
- Navigation must work with keyboard and screen readers.
- The UI does not recalculate authoritative validation rules locally.

## Contracts and Persistence

- Warning acknowledgment record.
- Validation readiness projection.

## Interfaces

- `GET /projects/:id/validation`.
- `POST /projects/:id/validation/run`.
- `POST /projects/:id/validation/issues/:issueId/acknowledge`.
- Validation route/panel.

## Acceptance Criteria

- [ ] Every issue identifies the affected entity and offers a valid navigation target when applicable.
- [ ] Blocking issues prevent render actions.
- [ ] Allowed warnings can be acknowledged for the exact validation hash.
- [ ] Edits clear stale reports/acknowledgments and rerun relevant checks.
- [ ] Resolved issues disappear after a new successful validation.

## Required Tests

- [ ] Issue grouping/deep-link tests.
- [ ] Blocking render guard test.
- [ ] Acknowledgment policy/hash tests.
- [ ] Stale report test.
- [ ] Accessibility/Playwright tests.

## Out of Scope

- Automatic fixing of every issue.
- Administrative override of blocking safety rules.

## Story-Specific Notes

- Technical guide references: E16.

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
- **Started:** 2026-08-25
- **Completed:** 2026-08-25
- **Branch/PR:** `story/st-067` (local branch; no PR published)
- **Files changed:** Validation API/service, shared acknowledgement boundary schema, storyboard validation panel, API/unit/Playwright tests, and story index.
- **Migrations:** None; ST-066 already created acknowledgement persistence fields.
- **Contracts changed:** Added `GET /projects/:id/validation`, `POST /projects/:id/validation/run`, `POST /projects/:id/validation/issues/:issueId/acknowledge`, and an exact-input-hash acknowledgement payload.
- **Commands/tests run:** `pnpm --filter @avlp/schemas build`; API and web typechecks; API validation tests (13 passing); validation-panel unit test (1 passing); API and web lint; focused Playwright validation-panel test (1 passing).
- **Screenshots or representative output:** Accessible panel reports readiness/staleness, groups issues, and exposes scene navigation and warning acknowledgement controls.
- **Decisions and assumptions:** Existing validation issue rows are the acknowledgement record; acknowledgement is allowed only for persisted advisory warnings and is rejected when the report hash is stale.
- **Deviations from story/technical guide:** Existing ST-066 routes remain supported alongside story-specified aliases.
- **Known risks or follow-up:** Render execution is introduced by ST-068; this story supplies the readiness/error projection that ST-068 must enforce at render initiation.
