---
story_id: ST-032
title: "Detect Duplicate Source Uploads and Reuse Safe Ingestion Results"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Done
priority: must-have
epics: ["E3", "E21"]
prd_user_stories: ["E3-US3", "E21-US2"]
depends_on: ["ST-030", "ST-031"]
---

# ST-032 — Detect Duplicate Source Uploads and Reuse Safe Ingestion Results

## Story

As a teacher, I want repeated uploads recognized so I do not spend time or cost processing the same file unnecessarily.

## Outcome

The system calculates a checksum, detects same-project duplicates, and can reuse a compatible successful ingestion result without exposing other users’ files.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E3-US3, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E3, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-030
- ST-031

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Calculate and persist SHA-256 for each completed source object.
- [ ] Detect duplicates within the same owner/project scope.
- [ ] Present a reuse/replace decision or apply the documented default.
- [ ] Define compatibility checks for parser version, normalized schema version, and validation status.
- [ ] Link or clone ingestion metadata safely without sharing mutable review overlays.
- [ ] Ensure duplicate lookup never reveals cross-user existence.

## Technical Implementation Requirements

- Checksum alone does not authorize access.
- Reuse only immutable parser artifacts and create project-specific review/edit overlays.
- A parser/schema version change may require reprocessing.
- Duplicate completion requests remain idempotent.

## Contracts and Persistence

- Checksum fields/index.
- Ingestion reuse decision/result.

## Interfaces

- Duplicate status returned during upload completion.
- Reuse or reprocess command/UI prompt where required.

## Acceptance Criteria

- [ ] Uploading the same file in one project is detected.
- [ ] A compatible successful parse can be reused without another Docling job.
- [ ] Teacher corrections from another project are not copied as parser truth.
- [ ] Cross-user duplicate information is never disclosed.

## Required Tests

- [ ] Checksum calculation test.
- [ ] Same-project detection test.
- [ ] Version incompatibility test.
- [ ] Cross-user non-disclosure test.
- [ ] Mutable overlay isolation test.

## Out of Scope

- Global deduplication for storage billing.
- Near-duplicate content detection.

## Story-Specific Notes

- Technical guide references: E3 and immutable-output principle 2.3.

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
- **Started:** 2026-08-14
- **Completed:** 2026-08-14
- **Branch/PR:** `story/st-032` (not published)
- **Files changed:** Upload API/repository and tests; validation worker and integration tests; upload UI checksum/reuse status; shared schemas; database schema and Drizzle migration; story index and this record.
- **Migrations:** `0017_fixed_pride.sql` adds immutable ingestion-artifact and project-local reuse-reference tables, completion-time duplicate status, and `document.ingestion_reused` audit event.
- **Contracts changed:** Upload completion adds `duplicateDetected`; source-document status adds a reuse status; shared ingestion compatibility requires parser and normalized-schema versions.
- **Commands/tests run:** API source-upload suite: 10/10 passed against isolated Docker PostgreSQL; pipeline-worker document-validation integration suite: 8/8 passed; full affected database suite: 11/11 passed; API suite: 41/41 passed; pipeline-worker suite: 18/18 passed. Workspace `lint`, workspace `typecheck`, workspace `build`, scoped Prettier, and diff check pass. Workspace `test` remains blocked by an unrelated existing `@avlp/evals` baseline-fixture failure; workspace `format:check` reports pre-existing warnings outside this story.
- **Screenshots or representative output:** No visual change requiring a screenshot. The upload UI reports when a compatible parsing result was reused.
- **Decisions and assumptions:** The documented default is automatic reuse after source validation, only for the same owner, exact SHA-256, active/safe source, and matching `docling-v1` plus `NormalizedDocument` v1.0. Reuse stores a project-local reference to immutable parser artifacts and never copies review overlays.
- **Deviations from story/technical guide:** No intentional deviation. The actual artifact writer belongs to the subsequent Docling-ingestion story; this story defines and consumes the immutable reuse contract without adding parser execution.
- **Known risks or follow-up:** ST-033 must persist artifacts using the shared compatibility fields once parsing succeeds. The local Docker PostgreSQL container is named `avlp-st032-postgres` and remains available on port 5433 for further test runs.
- **Review record:** Final scoped code review found all ST-032 acceptance criteria met, no technical-guide or ADR deviation, and no remaining blocking/high/medium/low finding. Conclusion: approve.
