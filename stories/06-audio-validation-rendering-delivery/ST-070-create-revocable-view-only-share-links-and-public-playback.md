---
story_id: ST-070
title: "Create Revocable View-Only Share Links and Public Playback"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
priority: must-have
epics: ["E18", "E21"]
prd_user_stories: ["E18-US2", "E21-US3"]
depends_on: ["ST-027", "ST-068", "ST-004"]
---

# ST-070 — Create Revocable View-Only Share Links and Public Playback

## Story

As a teacher, I want to create and revoke a view-only lesson link without exposing editor data or the private source document.

## Outcome

An opaque share token grants minimal public playback access to one verified rendered lesson and can be disabled immediately.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E18-US2, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E18, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-027
- ST-068
- ST-004

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create share-link entity with hashed opaque token, render/version target, created/revoked/expiry metadata, and optional access settings allowed by MVP.
- [ ] Implement create, list, and revoke commands.
- [ ] Create public share resolution endpoint/page with title, thumbnail, and video playback only.
- [ ] Generate media access without exposing private storage keys or editor/source APIs.
- [ ] Handle revoked, expired, missing, and deleted-project states.
- [ ] Audit create/revoke actions and apply safe rate limits.

## Technical Implementation Requirements

- Store only a token hash where feasible; display the raw token only at creation/share time.
- A share link is a distinct capability, not a bypass of project authorization.
- Public page exposes minimal lesson metadata and no source excerpts, prompts, citations, assets list, or editor state unless explicitly approved.
- Revocation takes effect immediately for new access.
- Use opaque unguessable tokens.

## Contracts and Persistence

- Share link entity.
- Public playback DTO.

## Interfaces

- `POST /projects/:id/share-links`.
- `GET /projects/:id/share-links`.
- `DELETE /projects/:id/share-links/:shareLinkId`.
- `GET /share/:token` resolution and public page.

## Acceptance Criteria

- [ ] A teacher can create and copy a working view-only link.
- [ ] The public page plays the intended verified render and shows only approved minimal metadata.
- [ ] Revocation disables the link.
- [ ] Random, expired, deleted, or malformed tokens do not disclose project existence.
- [ ] Private source/editor APIs remain inaccessible.

## Required Tests

- [ ] Token generation/hash tests.
- [ ] Create/revoke tests.
- [ ] Public data-minimization test.
- [ ] Deleted/expired state tests.
- [ ] Rate-limit and enumeration tests.
- [ ] Public playback Playwright test.

## Out of Scope

- Password-protected shares unless later approved.
- Public source citations.
- Embeddable LMS player.

## Story-Specific Notes

- Technical guide references: E18 and E21.

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
- **Started:** 2026-08-25
- **Completed:** 2026-08-25
- **Branch/PR:** `story/st-070` (local branch; no PR published)
- **Files changed:** Share-link schema/migration, API service/routes/runtime, render sharing controls, public playback page, and focused API/browser tests.
- **Migrations:** `0055_share_links` adds `share_links` and its tenant/public lookup indexes. It does not alter existing renders or lesson versions.
- **Contracts changed:** `POST/GET/DELETE /projects/:id/share-links`, `GET /share/:token`, create/list share-link DTOs, and a minimal public-playback DTO. Create requires a completed `renderId`; only the creation response contains the raw opaque token.
- **Commands/tests run:** `pnpm --filter @avlp/schemas build`; `pnpm --filter @avlp/database build`; API and web `typecheck`/`lint`; `pnpm --filter @avlp/api test -- share-links.test.ts` (6 passing); `pnpm --filter @avlp/web test` (110 passing); affected schema/database test suites passed (252 schema tests; 8 database tests, 3 integration tests skipped without a database); `pnpm --filter @avlp/web build`; `git diff --check` passed.
- **Screenshots or representative output:** Headless-browser test renders the public page with one labelled video element, no controls or source/editor data, and a signed playback URL.
- **Decisions and assumptions:** Tokens are 32 random bytes encoded base64url and stored only as SHA-256 hashes. The create command explicitly selects one verified completed render. Public playback URLs are regenerated for each resolution, expire after five minutes, and response caching is disabled. A local network limiter protects public lookup; deployment should retain the existing edge rate limit when horizontally scaled.
- **Deviations from story/technical guide:** None. The database migration was written as a focused forward migration because the repository's current Drizzle snapshot set is behind the existing manual migrations; a generated migration incorrectly attempted to recreate old tables and was discarded before it could be applied.
- **Review findings fixed:** Removed duplicate pre-existing share audit enum entries from the generated schema/migration draft; the final migration adds only the share-link table and indexes. Added a named revocation confirmation and converted the public route to the Focus Studio theater treatment with the thumbnail as the video poster.
- **Known risks or follow-up:** Apply the migration before deploying the API. End-to-end database integration coverage remains contingent on the optional test database environment.
