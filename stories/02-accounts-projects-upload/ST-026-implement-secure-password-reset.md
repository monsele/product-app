---
story_id: ST-026
title: "Implement Secure Password Reset"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Done
priority: must-have
epics: ["E1"]
prd_user_stories: ["E1-US3"]
depends_on: ["ST-025"]
---

# ST-026 — Implement Secure Password Reset

## Story

As a teacher, I want to reset my password when I cannot sign in.

## Outcome

A teacher can request a reset message and use an expiring single-use flow without revealing account existence.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E1-US3
- `docs/reference/epic-technical-implementation-guide.md` — E1 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-025

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement reset-request and reset-completion flows through the authentication/email adapters.
- [ ] Use secure random, expiring, single-use provider tokens or equivalent.
- [ ] Create request and completion UI pages.
- [ ] Return a generic request response whether or not the email exists.
- [ ] Invalidate or rely on provider invalidation for used/expired tokens.
- [ ] Audit reset requests and successful password changes without logging tokens.

## Technical Implementation Requirements

- Do not store full reset tokens in application logs or plain database fields.
- Rate-limit reset requests by safe identifiers.
- New password must satisfy the configured policy.
- Reset links must use approved application origins.

## Contracts and Persistence

- Password reset adapter operations.
- Rate-limit key and audit event types.

## Interfaces

- Request reset endpoint/action.
- Complete reset endpoint/action.
- Forgot-password and reset-password UI.

## Acceptance Criteria

- [ ] A valid reset flow changes the password and allows sign-in.
- [ ] Expired, malformed, and reused tokens are rejected.
- [ ] The request response does not reveal account existence.
- [ ] Rate limits prevent unbounded requests.

## Required Tests

- [ ] Valid reset integration test.
- [ ] Expired/reused token tests.
- [ ] Enumeration-resistance test.
- [ ] Rate-limit test.

## Out of Scope

- Account recovery by support staff.
- Multi-factor authentication.

## Story-Specific Notes

- Technical guide references: E1 failure and security behavior.

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
- **Started:** 2026-08-10
- **Completed:** 2026-08-10
- **Branch/PR:** Current worktree; no branch or PR created.
- **Files changed:** `packages/auth`, `packages/config`, `packages/database`, `apps/api`, and `apps/web` password-reset contracts, persistence, API, email adapter, and UI; `STORY_INDEX.md`.
- **Migrations:** Added `0007_steep_preak` to create `password_reset_tokens`, plus compatibility notes and Drizzle metadata.
- **Contracts changed:** Added password-reset request/confirm inputs and `AuthGateway` operations; added `PasswordResetEmailSender` and an HTTPS webhook adapter; added reset email configuration.
- **Commands/tests run:** Generated migration with `pnpm --filter @avlp/database db:generate`; affected package builds, lint, typechecks, and tests passed. `pnpm typecheck`, `pnpm test`, and `pnpm build` remain blocked by unrelated `@avlp/test-fixtures` imports of a missing `@avlp/schemas` `packageBoundary` export. `git diff --check` passed.
- **Screenshots or representative output:** API tests verify generic reset-request responses, 429 rate limiting, and invalid-token rejection; the UI supplies `/forgot-password` and `/reset-password` pages.
- **Decisions and assumptions:** Reset tokens are 32-byte random values stored only as HMAC hashes, expire after 15 minutes by default, are consumed atomically, and revoke all active sessions. Production requires an HTTPS transactional-email webhook and uses `WEB_ORIGIN` for reset links.
- **Deviations from story/technical guide:** Human review accepted the current implementation with follow-ups. Production configuration does not yet require an HTTPS `WEB_ORIGIN`; synchronous account-dependent email delivery creates a potential enumeration timing signal; rate limiting is process-local unless a shared edge control is deployed; and the password-recovery pages predate the current `docs/design.md` authentication-screen direction. No ADR waives these requirements; corrective work is carried into ST-071.
- **Known risks or follow-up:** ST-071 must require HTTPS reset-link origins in production, remove the account-existence timing distinction, enforce or verify shared production rate limiting, and bring password-recovery screens into the approved Studio Daylight design with browser coverage. Database integration tests, including expiry/reuse/concurrency coverage, still require `TEST_DATABASE_URL`. Configure `PASSWORD_RESET_EMAIL_WEBHOOK_URL` (and optional bearer token) before production startup.

## Approval Review

- **Reviewed:** 2026-08-25
- **Conclusion:** Approved with accepted follow-ups.
- **Risk acceptance:** The repository owner explicitly approved ST-026 without requiring the documented review findings to be fixed in this story.
- **Follow-up owner:** ST-071 release hardening.
- **Review evidence:** Affected lint, typecheck, and build commands passed. Auth tests passed 8 with 5 PostgreSQL cases skipped; the targeted API auth suite passed 4; web passed 110; config passed 13; database passed 8 with 3 skipped; observability passed 7 with 2 skipped. `git diff --check` passed. The skipped database suites require `TEST_DATABASE_URL` and are configured to run in CI.
