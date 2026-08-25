---
story_id: ST-071
title: "Complete End-to-End MVP Acceptance, Security, Cost, and Recovery Hardening"
phase: "07 \u2014 MVP Release"
status: Done
priority: must-have
epics:
  [
    "E1",
    "E2",
    "E3",
    "E4",
    "E5",
    "E6",
    "E7",
    "E8",
    "E9",
    "E10",
    "E11",
    "E12",
    "E13",
    "E14",
    "E15",
    "E16",
    "E17",
    "E18",
    "E19",
    "E20",
    "E21",
  ]
prd_user_stories: ["E21-US1", "E21-US2", "E21-US3"]
depends_on:
  [
    "ST-026",
    "ST-029",
    "ST-032",
    "ST-036",
    "ST-041",
    "ST-045",
    "ST-047",
    "ST-051",
    "ST-053",
    "ST-056",
    "ST-059",
    "ST-061",
    "ST-065",
    "ST-067",
    "ST-068",
    "ST-069",
    "ST-070",
  ]
---

# ST-071 — Complete End-to-End MVP Acceptance, Security, Cost, and Recovery Hardening

## Story

As the product team, we need proof that the complete five-page science workflow is secure, recoverable, supportable, cost-bounded, and ready for MVP validation.

## Outcome

The full teacher journey passes automated and manual acceptance checks from account creation through upload, grounded editing, audio, validation, render, download, sharing, and version restore.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US2, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12, E13, E14, E15, E16, E17, E18, E19, E20, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-026
- ST-029
- ST-032
- ST-036
- ST-041
- ST-045
- ST-047
- ST-051
- ST-053
- ST-056
- ST-059
- ST-061
- ST-065
- ST-067
- ST-068
- ST-069
- ST-070

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create the canonical end-to-end five-page science fixture and automated happy-path test.
- [ ] Exercise registration, project creation, upload, validation, ingestion, review corrections, configuration, all AI approval gates, storyboard editing, asset selection, TTS/captions, preview, validation, render, export, share, and restore.
- [ ] Add cross-user authorization tests for every project-owned endpoint family.
- [ ] Add failure/recovery scenarios for ingestion, invalid AI output, one-scene TTS failure, stale edit conflict, missing asset, render failure, revoked share, and deleted project.
- [ ] Enforce configured page, duration, scene, regeneration, provider-call, upload, and render concurrency quotas.
- [ ] Verify unchanged source, audio, captions, assets, previews, and renders are reused by content hash.
- [ ] Complete retention/deletion cleanup tests and malware/security checklist.
- [ ] Complete prompt evaluation and visual regression release gates.
- [ ] Create operational runbooks for stuck jobs, provider outage, retry, storage cleanup, and render diagnostics.
- [ ] Record final MVP metrics events required by the PRD.

## Technical Implementation Requirements

- No release with a known tenant-isolation failure.
- Default test suites mock paid providers; a controlled staging acceptance run may use live providers.
- The first validation target is one well-parsed five-page science chapter producing a coherent editable approximately three-minute lesson.
- Every asynchronous operation must expose recovery without corrupting completed stages.
- All architecture checklist items in the technical guide must be checked or explicitly waived by ADR.
- MVP scope exclusions remain excluded.

## Contracts and Persistence

- End-to-end test fixture/seed.
- Quota policy configuration.
- Release acceptance report.
- Runbooks and final traceability matrix.

## Interfaces

- Full Playwright/API/worker acceptance pipeline.
- Internal operational commands/runbooks.
- No new user-facing feature unless required to close a documented acceptance gap.

## Acceptance Criteria

- [ ] A teacher can complete all 17 PRD definition-of-done steps.
- [ ] The final output is a coherent, editable, grounded, captioned, visually useful 1080p lesson.
- [ ] All required automated suites and evaluation thresholds pass.
- [ ] Cross-user access, unsafe upload, stale validation, duplicate costly command, and revoked share scenarios are secure.
- [ ] Failures at each asynchronous stage can be retried independently.
- [ ] Usage/cost and product success metrics are recorded.
- [ ] All story files are marked Done and the traceability matrix has no uncovered MVP requirement.

## Required Tests

- [ ] Full end-to-end happy path.
- [ ] Cross-user endpoint matrix.
- [ ] Async failure/recovery suite.
- [ ] Quota and cost-meter tests.
- [ ] Prompt evaluation suite.
- [ ] Visual regression and render smoke suite.
- [ ] Deletion/retention/security tests.
- [ ] Manual pedagogical review checklist.

## Out of Scope

- Student accounts.
- Interactive simulations.
- Multiple languages.
- LMS integrations.
- Direct YouTube publishing.
- Marketplace.
- 3D or unrestricted generative video.
- Documents over 20 pages.
- Multiple source documents.

## Story-Specific Notes

- Technical guide references: sections 15 and 16 plus the PRD Definition of Done.
- Inherited ST-026 approval follow-ups:
  - Require `WEB_ORIGIN` to use HTTPS in production so reset tokens cannot be emitted in insecure links; retain an explicit loopback-only development exception.
  - Remove the account-existence timing distinction between known and unknown password-reset requests, including synchronous email-adapter latency, and add regression coverage.
  - Enforce or operationally verify shared production password-reset rate limiting by account and network signal rather than relying only on process-local state.
  - Update forgot-password and reset-password screens to the approved Studio Daylight authentication design, including visible password requirements, loading/error/success behavior, responsive layout, and browser coverage.
  - Execute the PostgreSQL-backed password-reset expiry, reuse, and concurrency tests with `TEST_DATABASE_URL` and retain the results in the release acceptance evidence.

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
