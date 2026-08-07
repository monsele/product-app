---
story_id: ST-025
title: "Implement Email Registration, Sign-In, Sign-Out, and Session Protection"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Ready
priority: must-have
epics: ["E1"]
prd_user_stories: ["E1-US1", "E1-US2"]
depends_on: ["ST-001", "ST-002", "ST-003", "ST-006"]
---

# ST-025 — Implement Email Registration, Sign-In, Sign-Out, and Session Protection

## Story

As a teacher, I want to create an account and securely sign in so my lesson projects are saved and private.

## Outcome

Email/password authentication creates a user profile, establishes a secure session, protects application routes, and supports sign-out.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E1-US1, E1-US2
- `docs/reference/epic-technical-implementation-guide.md` — E1 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-002
- ST-003
- ST-006

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Choose and integrate the approved authentication provider or implement the application auth adapter.
- [ ] Create the application user/profile record and external-auth identifier mapping.
- [ ] Implement registration, sign-in, sign-out, and current-user endpoints/actions.
- [ ] Enforce email format, duplicate-email handling, and minimum password policy through the provider.
- [ ] Protect teacher routes and redirect unauthenticated users.
- [ ] Add generic invalid-credential responses.
- [ ] Audit registration, sign-in failures where appropriate, and sign-out.

## Technical Implementation Requirements

- Passwords are never stored or logged by application code when using a managed provider.
- Sessions use secure, HttpOnly cookies or an approved token flow.
- CSRF and CORS configuration must match the chosen browser-to-API model.
- The application user ID is the ownership key for all later project resources.
- Do not reveal whether an email exists through sign-in errors.

## Contracts and Persistence

- `AuthenticatedUser`.
- User/profile table.
- Auth adapter interface.

## Interfaces

- Register, sign-in, sign-out, and current-session routes.
- Protected Next.js route/layout.
- Registration and login UI states.

## Acceptance Criteria

- [ ] A new valid email can register and reaches the workspace shell.
- [ ] A duplicate email is rejected clearly without exposing internals.
- [ ] Valid credentials create a persistent session according to policy.
- [ ] Invalid credentials return a generic error.
- [ ] Signing out prevents access to protected routes.

## Required Tests

- [ ] Auth adapter tests.
- [ ] Registration integration test.
- [ ] Invalid credential test.
- [ ] Protected route test.
- [ ] Cookie/token security configuration test.

## Out of Scope

- Email verification unless explicitly enabled by ADR.
- Social login.
- Organizations and roles beyond teacher/admin support.

## Story-Specific Notes

- Technical guide references: E1.

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
