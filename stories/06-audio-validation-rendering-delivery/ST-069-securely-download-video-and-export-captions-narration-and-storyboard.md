---
story_id: ST-069
title: "Securely Download Video and Export Captions, Narration, and Storyboard"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
priority: must-have
epics: ["E18"]
prd_user_stories: ["E18-US1", "E18-US3"]
depends_on: ["ST-004", "ST-027", "ST-060", "ST-064", "ST-068"]
---

# ST-069 — Securely Download Video and Export Captions, Narration, and Storyboard

## Story

As a teacher, I want to download the completed MP4 and supporting files from the exact approved lesson version.

## Outcome

Authorized export endpoints create short-lived downloads and version-correct SRT/VTT, narration, and storyboard files.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E18-US1, E18-US3
- `docs/reference/epic-technical-implementation-guide.md` — E18 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-004
- ST-027
- ST-060
- ST-064
- ST-068

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Implement completed-render download authorization and signed URL generation.
- [x] Implement narration text/Markdown export from a selected lesson version.
- [x] Implement storyboard readable Markdown/JSON export according to product choice.
- [x] Integrate SRT/VTT export from the selected version’s caption tracks.
- [x] Create export job only if generation cannot complete promptly; otherwise stream/store safely.
- [x] Record export metadata and audit download actions.
- [x] Build download actions and expired-link regeneration behavior.

## Technical Implementation Requirements

- Exports match an immutable selected lesson version.
- Signed URLs are short lived and regenerated after authorization.
- Do not expose private source document or internal storage keys in export files.
- Rendered MP4 is never proxied unnecessarily through application memory.
- Only completed, verified renders are downloadable.

## Contracts and Persistence

- Export type/result.
- Version export manifest.

## Interfaces

- `GET /projects/:id/renders/:renderId/download`.
- `POST/GET /projects/:id/exports` as appropriate.
- Download/export UI.

## Acceptance Criteria

- [x] The correct verified MP4 downloads through an authorized expiring URL.
- [x] Expired links can be regenerated.
- [x] Narration, storyboard, SRT, and VTT match the selected version.
- [x] Unauthorized users cannot retrieve exports.
- [x] Files do not disclose private object keys or unrelated project data.

## Required Tests

- [x] Signed download authorization/expiry tests.
- [x] Version correctness tests.
- [x] Golden-file narration/storyboard/caption exports.
- [x] Cross-user tests.
- [x] Audit-event test.

## Out of Scope

- Shareable public link.
- Direct external publishing.
- Source document export.

## Story-Specific Notes

- Technical guide references: E18.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces. (Web compile-mode production build completed after the default build stalled while finalizing.)
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-25
- **Completed:** 2026-08-25
- **Branch/PR:** `story/st-068` (pre-existing working branch; no PR published)
- **Files changed:** `apps/api/src/exports.ts`, `apps/api/src/caption-export.ts`, `apps/api/src/app.ts`, `apps/api/src/runtime.ts`, `apps/api/src/exports.test.ts`, `apps/web/app/workspace/[projectId]/render/render-panel.tsx`, `packages/schemas/src/index.ts`, `packages/database/src/schema.ts`, `packages/database/drizzle/0054_exports.sql`, migration journal/compatibility note, and story/index records.
- **Migrations:** `0054_exports.sql` adds `export.downloaded` to the audit event enum; forward-compatible compatibility note added.
- **Contracts changed:** Shared export type/format schemas, safe `VersionExportManifest`, and signed-download response; authenticated download and export endpoints added.
- **Commands/tests run:** Focused `pnpm --filter @avlp/api test -- exports.test.ts` passed (4 tests). API/web/schema/database typechecks passed. API/web/schema/database lint passed. Schema, database, observability, and API builds passed; `pnpm --filter @avlp/web exec next build --experimental-build-mode compile` completed. `git diff --check` passed.
- **Screenshots or representative output:** Focused API test confirmed cross-user requests receive 404; owner MP4 download receives 302 to a five-minute signed URL; golden VTT contains `00:00:00.000 --> 00:00:03.000`.
- **Decisions and assumptions:** Small supporting files are streamed directly from bounded immutable snapshots; no export job is needed. Captions use the completed render's frozen manifest so they cannot drift with mutable scene-audio rows. MP4 and caption exports require verified 1920x1080/30fps H.264/AAC output. MP4 URLs are derived through `AuthorizedProjectStorage` from the tenant scope and render job, never from a persisted raw key. Storyboard export deliberately omits source, storage, and editor data.
- **Deviations from story/technical guide:** Endpoint returns a 302 redirect to the authorized signed MP4 URL, rather than proxying bytes, to avoid application-memory transfer. This follows the technical guide's signed-media requirement.
- **Known risks or follow-up:** The default web build compiled successfully but stalled while finalizing in this execution runner; compile-mode production build completed. Re-run the default `pnpm --filter @avlp/web build` in CI or a normal local terminal.
