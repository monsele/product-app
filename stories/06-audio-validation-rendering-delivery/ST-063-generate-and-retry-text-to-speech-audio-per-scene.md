---
story_id: ST-063
title: "Generate and Retry Text-to-Speech Audio Per Scene"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Ready
priority: must-have
epics: ["E14", "E21"]
prd_user_stories: ["E14-US2", "E21-US1", "E21-US2"]
depends_on: ["ST-005", "ST-006", "ST-049", "ST-060", "ST-062"]
---

# ST-063 — Generate and Retry Text-to-Speech Audio Per Scene

## Story

As a teacher, I want narration audio generated per scene so a changed or failed scene can be regenerated independently.

## Outcome

Explicit asynchronous TTS jobs create content-addressed private audio, duration/timing metadata, and scene-level status with retries and cost metering.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E14-US2, E21-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E14, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-005
- ST-006
- ST-049
- ST-060
- ST-062

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create scene audio persistence and status model.
- [ ] Define TTS job payload using scene narration hash, voice configuration hash, and provider options.
- [ ] Call the TTS adapter from a worker, not HTTP.
- [ ] Store audio by scene/content hash and extract duration/format metadata.
- [ ] Capture provider sentence/word timestamps when available.
- [ ] Implement scene-level and batch-explicit generation commands.
- [ ] Implement independent retry and reuse unchanged compatible audio.
- [ ] Compare audio duration to planned scene duration and create fit warnings.
- [ ] Record usage/cost and enforce quotas/concurrency.

## Technical Implementation Requirements

- One failed scene must not invalidate successful audio for other scenes.
- Idempotency key includes narration and voice hashes.
- Do not mark audio current if the source narration or voice changes during the job.
- Audio objects are private.
- Paid batch generation still requires explicit teacher action.

## Contracts and Persistence

- Scene audio entity.
- TTS job/result.
- Audio timing metadata.
- Audio-fit warning.

## Interfaces

- `POST /projects/:id/scenes/:sceneId/audio/generate`.
- Optional explicit `POST /projects/:id/audio/generate` batch command.
- Audio status/retry UI.

## Acceptance Criteria

- [ ] Approved/current scene narration can generate audio independently.
- [ ] Audio duration and storage metadata are recorded.
- [ ] Unchanged audio is reused.
- [ ] Failed scenes can retry without regenerating successful scenes.
- [ ] Stale job results are rejected and cost/usage is recorded.

## Required Tests

- [ ] TTS adapter tests.
- [ ] Content-hash reuse test.
- [ ] Scene isolation/retry test.
- [ ] Stale completion race test.
- [ ] Duration-fit warning test.
- [ ] Quota/idempotency/authorization tests.
- [ ] Audio file metadata test.

## Out of Scope

- Human voice recording.
- Background music and sound effects mixing beyond placeholder support.
- Automatic duration rewriting.

## Story-Specific Notes

- Technical guide references: E14 and E21.

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
