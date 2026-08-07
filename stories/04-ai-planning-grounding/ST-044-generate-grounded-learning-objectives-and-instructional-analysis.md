---
story_id: ST-044
title: "Generate Grounded Learning Objectives and Instructional Analysis"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E7"]
prd_user_stories: ["E7-US1"]
depends_on: ["ST-041", "ST-042", "ST-043"]
---

# ST-044 — Generate Grounded Learning Objectives and Instructional Analysis

## Story

As a teacher, I want AI-proposed measurable learning objectives and supporting instructional analysis grounded in the selected source.

## Outcome

An asynchronous generation operation produces bounded objectives plus key concepts, prerequisites, vocabulary, misconceptions, and possible assessment questions with source block references.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E7-US1
- `docs/reference/epic-technical-implementation-guide.md` — E7 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-041
- ST-042
- ST-043

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define objective-generation input and structured output schemas.
- [ ] Create the versioned prompt using approved source snapshot and lesson configuration.
- [ ] Generate a bounded number of age-appropriate measurable objectives.
- [ ] Also return key concepts, prerequisite knowledge, vocabulary, likely misconceptions, and possible assessment questions as planning metadata.
- [ ] Resolve returned block IDs into SourceRefs.
- [ ] Run deterministic checks for missing citations, duplicates, excessive count, and unsupported source IDs.
- [ ] Persist a draft objective/planning revision and job metadata.
- [ ] Expose start/status/result endpoints and UI generation states.

## Technical Implementation Requirements

- Objectives must be supported by selected source content.
- The output is a draft and cannot drive outline generation until teacher approval.
- Retry/regenerate is idempotent by source snapshot, configuration, prompt version, and options.
- Do not overwrite an existing approved revision without explicit confirmation.
- Unsupported objectives are rejected or flagged.

## Contracts and Persistence

- Learning objective entity/revision.
- Instructional analysis metadata.
- Objective generation job payload/result.

## Interfaces

- `POST /projects/:id/objectives/generate`.
- `GET /projects/:id/objectives`.
- Objectives generation/review route states.

## Acceptance Criteria

- [ ] A valid approved source snapshot produces a bounded objective draft.
- [ ] Each objective resolves to at least one valid source reference.
- [ ] The language and complexity reflect the configured audience and tone.
- [ ] Invalid source IDs or unsupported objectives are not silently accepted.
- [ ] Generation can be retried without duplicating the same result record.

## Required Tests

- [ ] Prompt fixture tests.
- [ ] Structured schema tests.
- [ ] Citation resolution tests.
- [ ] Duplicate/unsupported objective rule tests.
- [ ] Job/idempotency/API authorization tests.
- [ ] Evaluation cases for age appropriateness and faithfulness.

## Out of Scope

- Teacher objective editing/approval.
- Outline generation.
- Automatic curriculum standards mapping.

## Story-Specific Notes

- Technical guide references: E7 and AI pipeline standard.

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
