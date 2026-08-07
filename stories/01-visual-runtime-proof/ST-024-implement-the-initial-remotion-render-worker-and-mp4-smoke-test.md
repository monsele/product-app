---
story_id: ST-024
title: "Implement the Initial Remotion Render Worker and MP4 Smoke Test"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
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

- [ ] Create a render job type and worker handler using the shared job platform.
- [ ] Load an immutable LessonSpec fixture and asset manifest.
- [ ] Render 1920×1080, 16:9, 30 fps using Remotion.
- [ ] Use FFmpeg/Remotion configuration for H.264 video and AAC audio.
- [ ] Upload MP4 and thumbnail through the storage abstraction.
- [ ] Verify output existence, duration, codec, size, and non-zero file length before success.
- [ ] Record progress when available and classify render failures.

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

- [ ] The manual lesson produces a playable MP4 with required codec/resolution/fps.
- [ ] A successful output and thumbnail are present in private storage.
- [ ] Duplicate delivery does not produce duplicate authoritative outputs.
- [ ] A forced render failure is recorded with retryable/terminal classification.

## Required Tests

- [ ] Short composition render smoke test in a suitable CI tier.
- [ ] Output metadata verification test.
- [ ] Duplicate job test.
- [ ] Temporary-file cleanup test.
- [ ] Thumbnail non-blocking failure test.

## Out of Scope

- Production render authorization and UI.
- User download/share.
- Cloud autoscaling.

## Story-Specific Notes

- Technical guide references: E17 and the first product proof.

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
