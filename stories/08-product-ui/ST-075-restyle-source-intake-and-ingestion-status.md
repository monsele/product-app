---
story_id: ST-075
title: "Restyle Source Intake and Ingestion Status"
phase: "08 - Product UI"
status: Done
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

- [x] Restyle the project source route inside the Studio Daylight project shell
      and highlight the current `Source` pipeline stage.
- [x] Make the drop target and browse action the visual focus while preserving
      the existing direct-to-storage upload flow.
- [x] Show accepted types, configured size limit, page limit, and English-only
      boundary beside the intake surface.
- [x] Display actual byte upload progress and accessible upload announcements.
- [x] Transform the intake region into named validation and ingestion states
      after upload, preserving file name and safe metadata.
- [x] Present duplicate detection as a clear reuse or replace decision using the
      existing supported actions.
- [x] Design queued, running, retry-wait, failed, succeeded, stale, and refresh
      states from authoritative job and document data.
- [x] Provide the exact safe recovery action for interrupted upload, validation
      rejection, parser failure, stale status, and success.
- [x] Make `Review source` the success action only when the workflow permits it.

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

- [x] A teacher can select or drop a supported file, see measured upload
      progress, and recover from an interrupted upload.
- [x] Requirements and validation failures are understandable before and after
      submission, and the selected file name is preserved when recovery is safe.
- [x] Ingestion shows named backend states without invented percentages or
      success assumptions.
- [x] Duplicate detection presents only contract-supported decisions and does
      not appear as a generic error.
- [x] The route exposes `Review source` only when the project is eligible.
- [x] Desktop, tablet, mobile, keyboard, and reduced-motion behavior remain
      complete.

## Required Tests

- [x] Existing upload, validation, duplicate, ingestion, idempotency, and
      authorization suites remain passing.
- [x] Browser upload progress and retry test.
- [x] Ingestion state projection and live-region tests.
- [x] Duplicate decision and failure-recovery Playwright tests.
- [x] Desktop, tablet, mobile, and reduced-motion screenshots.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New file types, multiple source documents, or source replacement behavior not
  already approved.
- Parser or worker changes.
- Invented progress estimates or background-job controls.

## Story-Specific Notes

- Technical guide references: E3, E4, E21, job state machine 5.2, storage 6.2,
  and frontend server-state guidance 11.2.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve immutable-source, security, idempotency, and job-state behavior.
- [x] Run required automated and visual tests.
- [x] Self-review live-region noise, truthful status, error recovery, and mobile
      behavior.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No upload, storage, job, or tenant-isolation regression remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **In Review**.

## Dev Agent Record

- **Agent:** Antigravity
- **Started:** 2026-08-26T13:51:30+01:00
- **Completed:** 2026-08-26T14:09:00+01:00
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/upload/page.tsx`
  - `apps/web/app/workspace/[projectId]/upload/source-upload-form.tsx`
  - `apps/web/app/workspace/[projectId]/upload/ingestion-status-panel.tsx`
  - `apps/web/app/workspace/[projectId]/upload/source-requirements-rail.tsx`
  - `apps/web/app/workspace/[projectId]/upload/source-intake-workspace.tsx`
  - `apps/web/app/workspace/[projectId]/upload/ingestion-status-panel.test.ts`
  - `apps/web/app/workspace/[projectId]/upload/source-upload-form.test.ts`
  - `packages/test-fixtures/src/release-traceability.test.ts`
  - `e2e/workspace.spec.ts`
  - `e2e/workspace-mock-api.mjs`
  - `STORY_INDEX.md`
- **Migrations:** None.
- **Contracts changed:** None.
- **Commands/tests run:**
  - `npm --prefix apps/web test` (all 31 test files, 121 tests passed)
  - `npm run typecheck` (all 16 packages passed strict TypeScript validation)
  - `npm run lint` (all 16 packages passed ESLint with 0 errors)
  - `$env:CI="1"; npx playwright test e2e/workspace.spec.ts` (all 8 tests passed)
  - `npm run build` (all 16 packages built successfully)
- **Screenshots or representative output:**
  - `test-results/source-upload-desktop.png`
  - `test-results/source-upload-tablet.png`
  - `test-results/source-upload-mobile.png`
  - `test-results/source-upload-reduced-motion.png`
- **Decisions and assumptions:**
  - Restyled `/workspace/[projectId]/upload` into Studio Daylight inside `AuthenticatedAppShell` with the active `Source` stage highlighted on the pipeline rail.
  - Implemented 70/30 responsive layout pairing the dropzone intake surface with a clear source requirements rail (formats, 20-page limit, 25MB limit, English scope, tenant safety).
  - Preserved direct-to-storage signed upload flow with byte-measured progress reporting and live region accessibility.
  - Rendered truthful named backend job states without invented progress percentages.
  - Formatted duplicate detection as an explicit reuse confirmation panel providing direct progression to source review.
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.
