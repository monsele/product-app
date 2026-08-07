---
story_id: ST-068
title: "Implement Production Video Render Lifecycle, Progress, Retry, and Thumbnail"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Ready
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

- [ ] Create production render job and rendered-video entities linked to immutable lesson version and validation result hash.
- [ ] Implement render eligibility guard: current exact validation, no blocking issues, required artifacts current.
- [ ] Implement idempotent start-render endpoint with explicit teacher action.
- [ ] Build immutable render manifest with signed/internal object references and scene library version.
- [ ] Extend worker progress, timeout, cancellation, output verification, thumbnail, and cleanup behavior.
- [ ] Persist queued/running/completed/failed states and understandable public failure codes.
- [ ] Build render status/retry UI.
- [ ] Record duration, file size, codec, resolution, storage key, thumbnail, cost/compute time, and correlation ID.

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

- [ ] Only an eligible validated immutable version can render.
- [ ] Duplicate requests do not create duplicate authoritative renders.
- [ ] Progress and final status survive refresh.
- [ ] Verified output meets required media settings and metadata is stored.
- [ ] Classified failures can retry; terminal failures show actionable messages.
- [ ] Thumbnail is generated when possible without invalidating a successful video.

## Required Tests

- [ ] Eligibility guard tests.
- [ ] Idempotency race test.
- [ ] Manifest immutability test.
- [ ] Progress/status tests.
- [ ] Retry/cancellation/timeout tests.
- [ ] Media verification test.
- [ ] Thumbnail failure test.
- [ ] Cross-user API tests.

## Out of Scope

- Autoscaling policy beyond documented deployment.
- Direct YouTube/LMS publishing.
- 4K rendering.

## Story-Specific Notes

- Technical guide references: E17.

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
