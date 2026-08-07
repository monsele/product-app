---
story_id: ST-050
title: "Generate a Valid LessonSpec Storyboard from Approved Narration"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E10"]
prd_user_stories: ["E10-US1"]
depends_on: ["ST-007", "ST-021", "ST-047", "ST-048", "ST-043", "ST-042"]
---

# ST-050 — Generate a Valid LessonSpec Storyboard from Approved Narration

## Story

As a teacher, I want AI to convert the approved lesson plan and narration into supported scene-by-scene visual decisions.

## Outcome

An asynchronous storyboard operation returns a validated LessonSpec draft with ordered scenes, template inputs, durations, assets, transitions, objective links, and citations.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US1
- `docs/reference/epic-technical-implementation-guide.md` — E10 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-007
- ST-021
- ST-047
- ST-048
- ST-043
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define storyboard generation input/output and prompt version.
- [ ] Provide the ten-template catalog with field limits and examples to the model.
- [ ] Generate ordered scenes with narration assignments, on-screen text, visual data, estimated duration, asset requirements, transitions, source refs, and generated additions.
- [ ] Allocate scene durations to match target lesson duration.
- [ ] Validate output against LessonSpec v1 and scene registry validators.
- [ ] Resolve source block IDs and reject unsupported templates/coordinates.
- [ ] Persist a storyboard draft and generation metadata.
- [ ] Expose start/status/result APIs and review route state.

## Technical Implementation Requirements

- The model selects structured templates; it never writes Remotion code.
- Pixel layout is owned by deterministic template code.
- Only approved outline/objectives and the selected narration revision are inputs.
- Invalid scenes are rejected before persistence.
- Missing asset requirements become planned slots, not invented public URLs.

## Contracts and Persistence

- Storyboard/LessonSpec draft record.
- Scene planning output.
- Storyboard generation job.

## Interfaces

- `POST /projects/:id/storyboard/generate`.
- `GET /projects/:id/storyboard`.
- Storyboard generation/review route.

## Acceptance Criteria

- [ ] The output is a valid LessonSpec with supported templates only.
- [ ] Scene durations sum within target tolerance.
- [ ] Every scene includes required narration, visual data, transition, and provenance fields.
- [ ] Objective coverage and narration assignment are complete.
- [ ] Invalid template or over-limit scene content cannot be saved.

## Required Tests

- [ ] Structured output and schema tests.
- [ ] Duration allocation tests.
- [ ] Template catalog/limit tests.
- [ ] Citation resolution tests.
- [ ] Objective/narration coverage tests.
- [ ] Job/API/idempotency tests.
- [ ] Evaluation cases for template suitability and visual variety.

## Out of Scope

- Storyboard editor operations.
- Asset generation.
- Audio and rendering.

## Story-Specific Notes

- Technical guide references: E10 and central LessonSpec principle.

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
