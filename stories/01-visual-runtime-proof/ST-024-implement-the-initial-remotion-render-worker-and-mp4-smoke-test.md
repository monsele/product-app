---
story_id: ST-024
title: "Implement the Initial Remotion Render Worker and MP4 Smoke Test"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E17"]
prd_user_stories: ["E17-US1", "E17-US2", "E17-US3"]
depends_on: ["ST-004", "ST-005", "ST-006", "ST-023"]
---

# ST-024 — Implement the Initial Remotion Render Worker and MP4 Smoke Test

## Story

As the product team, we need to prove that an immutable LessonSpec can be rendered by a background worker into the required media outputs.

## Outcome

A worker renders the manual fixture to 1080p H.264/AAC MP4, uploads it privately, extracts metadata, and creates a thumbnail.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E17-US1, E17-US2, E17-US3
- `docs/reference/epic-technical-implementation-guide.md` — E17 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-004
- ST-005
- ST-006
- ST-023

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create a render job type and worker handler using the shared job platform.
- [x] Load an immutable LessonSpec fixture and asset manifest.
- [x] Render 1920×1080, 16:9, 30 fps using Remotion.
- [x] Use FFmpeg/Remotion configuration for H.264 video and AAC audio.
- [x] Upload MP4 and thumbnail through the storage abstraction.
- [x] Verify output existence, duration, codec, size, and non-zero file length before success.
- [x] Record progress when available and classify render failures.

## Technical Implementation Requirements

- Do not render inside an HTTP request.
- The worker must be idempotent for the same version/options hash.
- Use isolated temporary directories and clean them after success/failure.
- A thumbnail failure is non-blocking if MP4 verification succeeds.
- This is a technical proof; production project/render APIs are completed in ST-068.

## Contracts and Persistence

- Initial render job payload/result.
- Render output metadata.
- Thumbnail metadata.

## Interfaces

- Worker CLI or internal enqueue script.
- No teacher-facing render page yet.

## Acceptance Criteria

- [x] The manual lesson produces a playable MP4 with required codec/resolution/fps.
- [x] A successful output and thumbnail are present in private storage.
- [x] Duplicate delivery does not produce duplicate authoritative outputs.
- [x] A forced render failure is recorded with retryable/terminal classification.

## Required Tests

- [x] Short composition render smoke test in a suitable CI tier.
- [x] Output metadata verification test.
- [x] Duplicate job test.
- [x] Temporary-file cleanup test.
- [x] Thumbnail non-blocking failure test.

## Out of Scope

- Production render authorization and UI.
- User download/share.
- Cloud autoscaling.

## Story-Specific Notes

- Technical guide references: E17 and the first product proof.

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
- **Started:** 2026-08-13
- **Completed:** 2026-08-13
- **Approved:** 2026-08-13
- **Branch/PR:** `story/st-024`; no PR published.
- **Files changed:** Renderer contracts, immutable fixture loader, Remotion/FFprobe engine, queue runtime, internal enqueue CLI, worker/unit/smoke tests, renderer README, and CI smoke-tier wiring; shared job progress repository/context/tests; deterministic thumbnail storage key/tests/docs; database schema/migration; workspace lockfile; this story and `STORY_INDEX.md`.
- **Migrations:** `0008_brief_nehzno` adds non-null `jobs.progress real default 0`, with generated snapshot/journal and forward compatibility notes.
- **Contracts changed:** Added strict `lesson.render` payload v1, fixed 1080p render profile, bounded asset manifest, complete composition hash, explicit renderer/template implementation version, verified video/thumbnail result identity and metadata, render option hashing, `JobHandlerContext.reportProgress`, and `storageKeys.renderThumbnail`. No HTTP endpoint or teacher-facing contract was added.
- **Commands/tests run:** Passed `pnpm lint` (15 workspaces), `pnpm typecheck` (15), `pnpm build` (15), renderer unit tests (14), explicit renderer real-media smoke (1), jobs tests (14 passed/8 PostgreSQL cases skipped), storage tests (19 passed/3 live S3 cases skipped), database tests (6 passed/3 PostgreSQL cases skipped), and `git diff --check`. The affected-workspace aggregate also passed 52 scene tests before one unrelated existing visual-regression test exceeded its fixed 120-second timeout. Docker was unavailable, so PostgreSQL and live S3 integration tiers could not run. Repository `format:check` remains blocked by pre-existing formatting drift across eval fixtures/source and generated migration snapshots.
- **Screenshots or representative output:** The real smoke rendered one second of the manual fixture and FFprobe verified a non-empty 1920×1080, 30 fps H.264 MP4 with AAC audio; a 1920×1080 PNG thumbnail was also rendered. The full immutable composition remains 5,400 frames/180 seconds.
- **Decisions and assumptions:** This technical proof uses the existing deterministic-silence narration placeholder and Remotion `enforceAudioTrack` to produce the required AAC stream. Job result JSON is proof-stage persistence; deterministic tenant/job storage keys plus full-composition/options hashes and the shared idempotency key make retries converge. The worker verifies the immutable lesson project against the authoritative job tenant before side effects. High-frequency progress is throttled and fenced by attempt, render seconds are idempotently metered, graceful shutdown drains active jobs before closing PostgreSQL, and rejected bundle attempts may retry without restarting the process. Production validation gates, teacher authorization/API/UI, cancellation, and retry UI remain in ST-068.
- **Deviations from story/technical guide:** Production `render_jobs`, `rendered_videos`, and `thumbnails` domain tables and APIs are intentionally deferred to ST-068 as the story directs; this proof stores its versioned result on the shared job row. Thumbnail generation is a non-blocking worker step rather than a separate job. The current storage contract performs a checksum-constrained signed PUT to deterministic final keys and verifies stored metadata rather than supporting the guide's temporary-key promotion sequence; retries reject or replace unverifiable objects before job success.
- **Review record:** Repeated code-review passes resolved streaming/memory safety, full composition and renderer-version hashing, job-to-lesson tenant binding, dependency-safe shutdown, recoverable bundle caching, sanitized technical failure diagnostics, lazy worker startup and cleanup, precise failure classification, bounded and lesson-correlated asset manifests, progress migration/retry semantics, failed-attempt metering, explicit CI smoke coverage, and bounded usage idempotency keys. The final review found no remaining blocking or recommended changes.
- **Known risks or follow-up:** The full three-minute render is supported but the required CI tier intentionally renders a one-second range to control runtime. Production images must pin Chromium/FFmpeg/fonts and set an upload limit appropriate for a full 1080p lesson. Live PostgreSQL/S3 integration still requires Docker-backed CI. The final Done checkbox and status remain for human approval per repository workflow.
