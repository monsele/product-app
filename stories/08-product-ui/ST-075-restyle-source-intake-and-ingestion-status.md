---
story_id: ST-075
title: "Restyle Source Intake and Ingestion Status"
phase: "08 - Product UI"
status: Ready
priority: must-have
epics: ["E3", "E4", "E21"]
prd_user_stories: ["E3-US1", "E3-US2", "E3-US3", "E4-US1", "E4-US4", "E21-US1", "E21-US3"]
depends_on: ["ST-030", "ST-031", "ST-032", "ST-033", "ST-034", "ST-035", "ST-036", "ST-074"]
---

# ST-075 - Restyle Source Intake and Ingestion Status

## Story

As a teacher, I want upload and processing states to remain in one clear visual
context so that I know what the system accepted, what it is doing, and what I
can do next.

## Outcome

The source route provides a focused Studio Daylight intake surface that
transforms into truthful validation and ingestion status without losing the
project or file context.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.4, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E3, E4, and E21
- `docs/reference/epic-technical-implementation-guide.md` E3, E4, E21,
  sections 5.1-5.2, 6, and 11

## Dependencies

- ST-030
- ST-031
- ST-032
- ST-033
- ST-034
- ST-035
- ST-036
- ST-074

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Restyle the project source route inside the Studio Daylight project shell
      and highlight the current `Source` pipeline stage.
- [ ] Make the drop target and browse action the visual focus while preserving
      the existing direct-to-storage upload flow.
- [ ] Show accepted types, configured size limit, page limit, and English-only
      boundary beside the intake surface.
- [ ] Display actual byte upload progress and accessible upload announcements.
- [ ] Transform the intake region into named validation and ingestion states
      after upload, preserving file name and safe metadata.
- [ ] Present duplicate detection as a clear reuse or replace decision using the
      existing supported actions.
- [ ] Design queued, running, retry-wait, failed, succeeded, stale, and refresh
      states from authoritative job and document data.
- [ ] Provide the exact safe recovery action for interrupted upload, validation
      rejection, parser failure, stale status, and success.
- [ ] Make `Review source` the success action only when the workflow permits it.

## Technical Implementation Requirements

- Do not invent percentage progress for validation or ingestion. Only upload
  byte progress may use a percentage when it is measured.
- Preserve signed-upload constraints, immutable originals, idempotent
  completion, malware and type checks, duplicate safeguards, job polling, and
  tenant isolation.
- Previously selected file context survives every recoverable error.
- Status announcements use restrained live regions and do not repeat on every
  polling refresh.
- Motion communicates the change from intake to processing state and collapses
  to an instant state change under reduced motion.
- No raw provider payload, object key, signed URL, or stack detail appears in the
  UI.

## Contracts and Persistence

- No source-document, upload-session, ingestion, or job contract changes
  expected.

## Interfaces

- `/workspace/[projectId]/upload`
- Existing source-upload, validation, duplicate, and ingestion-status APIs.

## Acceptance Criteria

- [ ] A teacher can select or drop a supported file, see measured upload
      progress, and recover from an interrupted upload.
- [ ] Requirements and validation failures are understandable before and after
      submission, and the selected file name is preserved when recovery is safe.
- [ ] Ingestion shows named backend states without invented percentages or
      success assumptions.
- [ ] Duplicate detection presents only contract-supported decisions and does
      not appear as a generic error.
- [ ] The route exposes `Review source` only when the project is eligible.
- [ ] Desktop, tablet, mobile, keyboard, and reduced-motion behavior remain
      complete.

## Required Tests

- [ ] Existing upload, validation, duplicate, ingestion, idempotency, and
      authorization suites remain passing.
- [ ] Browser upload progress and retry test.
- [ ] Ingestion state projection and live-region tests.
- [ ] Duplicate decision and failure-recovery Playwright tests.
- [ ] Desktop, tablet, mobile, and reduced-motion screenshots.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New file types, multiple source documents, or source replacement behavior not
  already approved.
- Parser or worker changes.
- Invented progress estimates or background-job controls.

## Story-Specific Notes

- Technical guide references: E3, E4, E21, job state machine 5.2, storage 6.2,
  and frontend server-state guidance 11.2.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve immutable-source, security, idempotency, and job-state behavior.
- [ ] Run required automated and visual tests.
- [ ] Self-review live-region noise, truthful status, error recovery, and mobile
      behavior.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No upload, storage, job, or tenant-isolation regression remains.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None expected.
- **Contracts changed:** None expected.
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Known risks or follow-up:**
- **Deviations from story or technical guide:**
