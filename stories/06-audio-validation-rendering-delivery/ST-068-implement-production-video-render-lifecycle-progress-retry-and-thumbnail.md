---
story_id: ST-068
title: "Implement Production Video Render Lifecycle, Progress, Retry, and Thumbnail"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
priority: must-have
epics: ["E17", "E21"]
prd_user_stories: ["E17-US1", "E17-US2", "E17-US3", "E21-US1", "E21-US2"]
depends_on: ["ST-024", "ST-060", "ST-066", "ST-067", "ST-005", "ST-006"]
---

# ST-068 — Implement Production Video Render Lifecycle, Progress, Retry, and Thumbnail

## Story

As a teacher, I want to render an approved, validated lesson version and understand queued, rendering, completed, or failed status.

## Outcome

An authorized idempotent render command snapshots exact inputs, queues a production render, reports progress, verifies outputs, retries classified failures, and stores media metadata.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E17-US1, E17-US2, E17-US3, E21-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E17, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-024
- ST-060
- ST-066
- ST-067
- ST-005
- ST-006

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create production render job and rendered-video entities linked to immutable lesson version and validation result hash.
- [x] Implement render eligibility guard: current exact validation, no blocking issues, required artifacts current.
- [x] Implement idempotent start-render endpoint with explicit teacher action.
- [x] Build immutable render manifest with signed/internal object references and scene library version.
- [x] Extend worker progress, timeout, cancellation, output verification, thumbnail, and cleanup behavior.
- [x] Persist queued/running/completed/failed states and understandable public failure codes.
- [x] Build render status/retry UI.
- [x] Record duration, file size, codec, resolution, storage key, thumbnail, cost/compute time, and correlation ID.

## Technical Implementation Requirements

- Repeated requests for the same version/options reuse the existing logical job.
- A render always references an immutable LessonVersion, never mutable current editor state.
- Output is 1920×1080, 30 fps, H.264/AAC.
- Do not mark complete until output verification succeeds.
- Thumbnail failure is non-blocking.
- Late results for cancelled/deleted projects are ignored or retained without reactivation.

## Contracts and Persistence

- Render job.
- Rendered video.
- Render manifest/result.
- Render error codes.

## Interfaces

- `POST /projects/:id/renders`.
- `GET /projects/:id/renders` and `/:renderId`.
- `POST /projects/:id/renders/:renderId/retry`.
- Render progress/status UI.

## Acceptance Criteria

- [x] Only an eligible validated immutable version can render.
- [x] Duplicate requests do not create duplicate authoritative renders.
- [x] Progress and final status survive refresh.
- [x] Verified output meets required media settings and metadata is stored.
- [x] Classified failures can retry; terminal failures show actionable messages.
- [x] Thumbnail is generated when possible without invalidating a successful video.

## Required Tests

- [x] Eligibility guard tests.
- [x] Idempotency/concurrency tests.
- [x] Manifest immutability test.
- [x] Progress/status tests.
- [x] Retry/cancellation/timeout tests.
- [x] Media verification test.
- [x] Thumbnail failure test.
- [x] Cross-user API tests.

## Out of Scope

- Autoscaling policy beyond documented deployment.
- Direct YouTube/LMS publishing.
- 4K rendering.

## Story-Specific Notes

- Technical guide references: E17.

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
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-25
- **Completed:** Approved after implementation and code review: 2026-08-25
- **Branch/PR:** `story/st-068` (not published)
- **Files changed:** Render API command/query service and routes; production renderer manifest/lifecycle persistence; render workspace UI; shared schemas and database schema.
- **Migrations:** `0053_render_lifecycle.sql` adds `render_jobs`, `rendered_videos`, `render_thumbnails`, and a nullable verified checksum for `scene_audio`; the Drizzle journal and compatibility note are included.
- **Contracts changed:** Added strict render request/status, media metadata, error-code, and lifecycle contracts. Production manifests now contain checksum-bound narration, captions, source/catalog visual assets, the profile, and versioned snapshot data.
- **Commands/tests run:** API, renderer, and web lint/typecheck/build; render API tests (5); renderer tests (17); schema tests (252); config tests (13); jobs tests (14; 8 DB integration cases skipped without `TEST_DATABASE_URL`); and database tests (8; 3 integration cases skipped without `TEST_DATABASE_URL`). `git diff --check` also passed.
- **Screenshots or representative output:** `next build` completed successfully and includes the render workspace route.
- **Decisions and assumptions:** Generic `jobs` remains the sole lease/progress/retry authority. `render_jobs` persists the immutable manifest and verified outputs. The API uses a project advisory lock plus the tenant idempotency constraint; client request tokens cannot create a second logical render. Output is staged, verified, then promoted; a cancellation race deletes orphaned outputs.
- **Deviations from story/technical guide:** The generic job record provides `idempotency_key`, worker/lease, start, retry, and correlated-status fields rather than duplicating them in `render_jobs`; this is the existing repository job architecture.
- **Known risks or follow-up:** Apply migration `0053` before deployment. Existing scene audio needs regeneration before rendering because pre-migration rows lack the storage checksum. An end-to-end FFmpeg/Remotion smoke render remains environment-gated on the provisioned renderer image, Chromium, FFprobe, Redis, PostgreSQL, and private object store.
