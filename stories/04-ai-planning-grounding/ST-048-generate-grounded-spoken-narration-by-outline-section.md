---
story_id: ST-048
title: "Generate Grounded Spoken Narration by Outline Section"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E9"]
prd_user_stories: ["E9-US1"]
depends_on: ["ST-047", "ST-043", "ST-042"]
---

# ST-048 — Generate Grounded Spoken Narration by Outline Section

## Story

As a teacher, I want an age-appropriate spoken script that explains one idea at a time and fits the selected lesson duration.

## Outcome

An asynchronous operation generates sectioned narration with source references, speech-oriented style, objective coverage, and word-count/duration validation.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E9-US1
- `docs/reference/epic-technical-implementation-guide.md` — E9 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-047
- ST-043
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define narration block and generation schemas.
- [ ] Create a versioned narration prompt from approved outline, objectives, configuration, and narrowed source packages.
- [ ] Generate spoken sentences by outline item or scene group.
- [ ] Enforce duration-based word-count targets and per-block estimates.
- [ ] Resolve source references for claims.
- [ ] Detect long copied passages, unsupported block IDs, excessive sentence length, and missing objective coverage.
- [ ] Persist draft narration revision and generation metadata.
- [ ] Expose job status and narration review UI state.

## Technical Implementation Requirements

- Narration should paraphrase rather than copy long source passages.
- AI-added analogies/examples must be represented as generated additions.
- The output remains a draft until editing/approval workflow.
- No TTS call occurs in this story.
- A claim can have multiple SourceRefs.

## Contracts and Persistence

- Narration revision/block.
- Narration source links.
- Generated additions.
- Narration generation job.

## Interfaces

- `POST /projects/:id/narration/generate`.
- `GET /projects/:id/narration`.
- Narration review route.

## Acceptance Criteria

- [ ] Generated narration is divided by approved outline structure.
- [ ] Word count and estimated duration fit configured tolerances.
- [ ] Claims resolve to valid source references or are labelled generated additions.
- [ ] Long source copying and unsupported claims are blocked/flagged.
- [ ] The job follows standard authorization, quota, metering, retry, and idempotency behavior.

## Required Tests

- [ ] Schema and duration tests.
- [ ] Source copying heuristic tests.
- [ ] Citation/generated-addition tests.
- [ ] Objective coverage tests.
- [ ] Job/API tests.
- [ ] Evaluation cases for clarity and age appropriateness.

## Out of Scope

- Narration editor actions.
- TTS and captions.
- Storyboard generation.

## Story-Specific Notes

- Technical guide references: E9.

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
