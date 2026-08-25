---
story_id: ST-063
title: "Generate and Retry Text-to-Speech Audio Per Scene"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
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

- [x] Create scene audio persistence and status model.
- [x] Define TTS job payload using scene narration hash, voice configuration hash, and provider options.
- [x] Call the TTS adapter from a worker, not HTTP.
- [x] Store audio by scene/content hash and extract duration/format metadata.
- [x] Capture provider sentence timing from the fixture provider.
- [x] Implement scene-level generation commands. Batch generation remains optional.
- [x] Implement independent retry and reuse unchanged compatible audio.
- [x] Compare audio duration to planned scene duration and create fit warnings.
- [x] Record usage/cost and enforce quotas.

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

- [x] Approved/current scene narration can generate audio independently.
- [x] Audio duration and storage metadata are recorded.
- [x] Unchanged audio is reused.
- [x] Failed scenes can retry without regenerating successful scenes.
- [x] Stale job results are rejected and cost/usage is recorded.

## Required Tests

- [x] TTS adapter tests.
- [x] Content-hash reuse test.
- [x] Scene isolation/retry test.
- [x] Stale completion race test.
- [x] Duration-fit warning test.
- [x] Quota/idempotency/authorization tests.
- [x] Audio file metadata test.

## Out of Scope

- Human voice recording.
- Background music and sound effects mixing beyond placeholder support.
- Automatic duration rewriting.

## Story-Specific Notes

- Technical guide references: E14 and E21.

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
- **Started:** 2026-08-24
- **Completed:** 2026-08-24
- **Branch/PR:** `story/st-063` (not published)
- **Files changed:** API scene-audio commands, pipeline-worker TTS handler, storyboard status/retry panel, shared schemas, storage key support, and focused tests.
- **Migrations:** `0050_scene_audio_generation` (additive scene-audio lifecycle, hashes, immutable metadata, and content-address index).
- **Contracts changed:** Versioned scene-audio generation payload/status schemas, including server-selected provider ID/output format; `POST /projects/:projectId/scenes/:sceneId/audio/generate`; `GET /projects/:projectId/scenes/:sceneId/audio-status`.
- **Commands/tests run:** Focused API command tests (queue, failed-scene retry, quota/concurrency), worker handler tests (ready, retryable failure, stale completion), storyboard status/retry tests, and storage-key tests. API/worker/web/storage lint, typecheck, and build pass. The full web suite passes with its browser-test timeout set to 30 seconds; its default five-second timeout is insufficient for two existing Playwright tests.
- **Screenshots or representative output:** Scene detail exposes Narration audio status, duration/fit warning, and Generate/Retry control.
- **Decisions and assumptions:** The MVP uses a deterministic offline WAV fixture behind an injectable worker-only provider boundary. Provider ID and output format are carried in the versioned job payload, so a production adapter can emit MP3 without changing the job/API contract. The fixture records a sentence timing span; captions will consume/extend this in ST-064.
- **Deviations from story/technical guide:** Batch command omitted because the story declares it optional; scene-level explicit generation is implemented. The earlier fixed `.mp3` storage-key example was generalized to reflect the documented WAV fixture output.
- **Known risks or follow-up:** Replace the fixture with the selected production TTS adapter and pricing when credentials/provider selection are authorized.
