---
story_id: ST-046
title: "Generate a Grounded Duration-Aware Lesson Outline"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E8"]
prd_user_stories: ["E8-US1"]
depends_on: ["ST-045", "ST-043", "ST-042"]
---

# ST-046 — Generate a Grounded Duration-Aware Lesson Outline

## Story

As a teacher, I want AI to propose a logical instructional sequence that covers approved objectives within the selected duration.

## Outcome

An asynchronous operation creates a structured outline with hook, concept sequence, examples, summary, optional recall question, objective mappings, duration budgets, and citations.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E8-US1
- `docs/reference/epic-technical-implementation-guide.md` — E8 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-045
- ST-043
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define outline item and generation schemas.
- [ ] Create a versioned outline prompt using approved objectives, configuration, and bounded source packages.
- [ ] Generate required structural elements and optional recall question according to configuration.
- [ ] Map every item to one or more approved objectives.
- [ ] Allocate estimated time and enforce total duration tolerance.
- [ ] Resolve source block IDs to SourceRefs.
- [ ] Run deterministic coverage, citation, order, and duration checks.
- [ ] Persist a draft outline revision and generation metadata.

## Technical Implementation Requirements

- Do not generate narration or scenes yet.
- Every approved objective must be covered or explicitly reported as uncovered.
- Outline items are bounded and structured.
- The output is a draft until teacher approval.
- Source packages should narrow using objective links where useful.

## Contracts and Persistence

- Lesson outline revision.
- Outline item.
- Objective-to-outline mapping.
- Outline generation job.

## Interfaces

- `POST /projects/:id/outline/generate`.
- `GET /projects/:id/outline`.
- Outline review route states.

## Acceptance Criteria

- [ ] The generated outline contains the required instructional sequence.
- [ ] Every item maps to objectives and valid source references.
- [ ] Total estimated duration fits the configured target tolerance.
- [ ] Uncovered objectives or invalid citations block candidate acceptance.
- [ ] The job is authorized, metered, retryable, and idempotent.

## Required Tests

- [ ] Structured output tests.
- [ ] Objective coverage tests.
- [ ] Duration allocator tests.
- [ ] Citation tests.
- [ ] Job/API tests.
- [ ] Evaluation cases for sequence quality.

## Out of Scope

- Teacher outline editing/approval.
- Narration text.
- Scene template choice.

## Story-Specific Notes

- Technical guide references: E8.

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
