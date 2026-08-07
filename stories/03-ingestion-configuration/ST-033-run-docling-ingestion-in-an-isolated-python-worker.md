---
story_id: ST-033
title: "Run Docling Ingestion in an Isolated Python Worker"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E4"]
prd_user_stories: ["E4-US1"]
depends_on: ["ST-005", "ST-008", "ST-030", "ST-031"]
---

# ST-033 — Run Docling Ingestion in an Isolated Python Worker

## Story

As a teacher, I want the uploaded document parsed in the background while I can see progress and recover from failures.

## Outcome

A Python worker consumes validated ingestion jobs, invokes Docling, stores immutable canonical outputs, and publishes a structured completion result.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E4-US1
- `docs/reference/epic-technical-implementation-guide.md` — E4 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-005
- ST-008
- ST-030
- ST-031

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create the Python ingestion service with typed job-envelope parsing.
- [ ] Download the authorized source object to an isolated temporary workspace.
- [ ] Invoke Docling for supported PDF and DOCX inputs.
- [ ] Persist immutable Docling JSON and readable Markdown to private storage.
- [ ] Emit progress/heartbeat updates and structured completion/failure results.
- [ ] Clean temporary files on success and failure.
- [ ] Record parser version, configuration hash, processing time, and warnings.

## Technical Implementation Requirements

- The Python worker does not own teacher edits or lesson generation.
- It must not write arbitrary database rows directly; return results through the approved worker contract or internal API.
- Retry only classified transient failures.
- Use immutable versioned storage paths.
- Do not log full source text.

## Contracts and Persistence

- Ingestion job payload/result.
- Parser metadata.
- Canonical Docling object references.

## Interfaces

- BullMQ-compatible bridge or approved ingestion queue consumer.
- Worker health/heartbeat.
- No teacher review UI in this story.

## Acceptance Criteria

- [ ] A valid supported document creates canonical JSON and Markdown artifacts.
- [ ] The job reports queued/running/succeeded or classified failure states.
- [ ] A duplicated message does not create conflicting parser versions.
- [ ] Temporary source files are removed.
- [ ] Parser metadata is available for reproducibility.

## Required Tests

- [ ] Python unit tests with recorded parser fixtures.
- [ ] Job contract test between TypeScript and Python.
- [ ] Duplicate delivery test.
- [ ] Temporary-file cleanup test.
- [ ] Failure classification test.

## Out of Scope

- Application normalization.
- Figure/table persistence.
- OCR-quality UI.

## Story-Specific Notes

- Technical guide references: E4, service ownership, and immutable-output principle.

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
