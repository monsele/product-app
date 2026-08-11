---
story_id: ST-025
title: "Implement Email Registration, Sign-In, Sign-Out, and Session Protection"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Done
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

- **Agent:** Codex
- **Started:** 2026-08-08
- **Completed:** 2026-08-08
- **Branch/PR:** No branch or PR created.
- **Files changed:** Added `@avlp/auth`, authentication routes and web pages,
  a database migration, and focused tests; updated API/config/database package
  surfaces and `STORY_INDEX.md`.
- **Migrations:** `0006_wise_mystique` adds `users`, `auth_identities`,
  `password_credentials`, and `sessions` with forward-compatibility notes.
- **Contracts changed:** Public `AuthenticatedUser`, `AuthGateway`,
  register/login input schemas, and the `POST /auth/register`, `POST
/auth/login`, `DELETE /auth/session`, and `GET /auth/session` endpoints.
- **Commands/tests run:** Affected package lint, typecheck, test, and build
  commands passed. API route tests cover registration cookie/CORS/CSRF,
  generic invalid credentials, logout revocation; web tests cover protected
  route middleware; Next production build passed. The Postgres auth integration
  suite was also run successfully against a disposable local PostgreSQL 18
  cluster: 6 tests passed, including registration persistence, normalized
  duplicate-email rejection, generic invalid credentials, session lookup, and
  logout revocation.
- **Screenshots or representative output:** Next production build completed
  with `/workspace` as a dynamic protected route.
- **Decisions and assumptions:** Used the application-managed adapter permitted
  by the story, with Argon2id credential hashes, keyed opaque session hashes,
  secure HttpOnly SameSite=Lax cookies, explicit production browser origin,
  audit entries, and bounded per-account/per-network rate limits. API is
  deployed behind the web origin so session cookies stay first-party.
- **Deviations from story/technical guide:** No material deviations. Password
  reset, social login, and roles remain out of scope.
- **Known risks or follow-up:** Configure `AUTH_SESSION_SECRET`, `WEB_ORIGIN`,
  and a same-origin API proxy before deployment. Run the included Postgres
  integration suite where `TEST_DATABASE_URL` is available; add shared edge
  rate limiting before horizontally scaling the API.
- **Review outcome:** Approved after requiring production `WEB_ORIGIN`, adding
  explicit origin/CORS protection and session validation at the workspace
  boundary. Follow-up review fixed Drizzle-wrapped duplicate-key detection and
  safe network/non-JSON error handling in the authentication form, then passed
  the formerly skipped Postgres integration suite.
