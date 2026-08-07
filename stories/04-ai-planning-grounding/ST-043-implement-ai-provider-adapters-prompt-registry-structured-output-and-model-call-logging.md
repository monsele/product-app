---
story_id: ST-043
title: "Implement AI Provider Adapters, Prompt Registry, Structured Output, and Model-Call Logging"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E7", "E8", "E9", "E10", "E19", "E21"]
prd_user_stories: ["E7-US1", "E8-US1", "E9-US1", "E10-US1", "E21-US2"]
depends_on: ["ST-005", "ST-006", "ST-007", "ST-008", "ST-009", "ST-042"]
---

# ST-043 — Implement AI Provider Adapters, Prompt Registry, Structured Output, and Model-Call Logging

## Story

As the engineering team, we need one governed model-call lifecycle so each generation story is structured, traceable, retryable, testable, and replaceable.

## Outcome

The pipeline worker can execute versioned prompts through provider-neutral adapters, validate output schemas, meter usage, and persist complete model-call metadata.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E7-US1, E8-US1, E9-US1, E10-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E7, E8, E9, E10, E19, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-005
- ST-006
- ST-007
- ST-008
- ST-009
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create language-model provider interfaces and at least one configured adapter.
- [ ] Create a versioned prompt repository layout for objectives, outline, narration, storyboard, and grounding.
- [ ] Implement structured-output parsing with Zod validation and bounded repair/retry policy.
- [ ] Implement the standard model-call lifecycle: authorize inputs, quota guard, source package, job, provider call, schema validation, deterministic checks, persistence, usage record.
- [ ] Create model-call metadata persistence.
- [ ] Create mock/fixture provider for tests and local development.
- [ ] Add per-operation token/unit and estimated cost recording.

## Technical Implementation Requirements

- No model calls from React components or HTTP route handlers.
- Provider response types do not enter domain contracts.
- Prompt ID/version, model, input hash, output validation, latency, retries, cost, and correlation ID are mandatory.
- Prompt changes must run relevant evaluation cases.
- Do not automatically keep repairing unbounded invalid outputs.
- Paid operations require explicit user action and quota checks.

## Contracts and Persistence

- LLM adapter interface.
- Prompt definition/registry.
- Model-call record.
- Structured generation result/error.
- Quota guard interface.

## Interfaces

- Pipeline worker base generation handler.
- No specific product generation endpoint yet.

## Acceptance Criteria

- [ ] A mock provider produces a validated typed output and complete metadata record.
- [ ] Invalid structured output follows bounded retry then classified failure.
- [ ] Usage and cost metadata are persisted.
- [ ] Changing prompt versions changes the input-version/idempotency key.
- [ ] Default CI does not require live provider credentials.

## Required Tests

- [ ] Provider contract tests.
- [ ] Structured-output retry tests.
- [ ] Model-call metadata tests.
- [ ] Quota rejection test.
- [ ] Prompt-version/evaluation hook test.

## Out of Scope

- Choosing multiple production models.
- Objectives/outline/narration/storyboard prompts themselves.
- Human quality UI.

## Story-Specific Notes

- Technical guide references: section 9.1 and 9.2.

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
