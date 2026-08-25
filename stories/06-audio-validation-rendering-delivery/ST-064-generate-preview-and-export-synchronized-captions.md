---
story_id: ST-064
title: "Generate, Preview, and Export Synchronized Captions"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
priority: must-have
epics: ["E14", "E18"]
prd_user_stories: ["E14-US3", "E18-US3"]
depends_on: ["ST-063", "ST-049"]
---

# ST-064 — Generate, Preview, and Export Synchronized Captions

## Story

As a teacher, I want readable captions synchronized with narration and exportable as SRT or VTT.

## Outcome

Caption cues are derived from approved narration and TTS timing, segmented for readability, previewed with scenes, and exported from the exact lesson version.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E14-US3, E18-US3
- `docs/reference/epic-technical-implementation-guide.md` — E14, E18 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-063
- ST-049

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create caption track/cue persistence by scene and content hash.
- [ ] Use provider word/sentence timings when present; implement an approved alignment fallback when absent.
- [ ] Segment cues by line length, reading speed, punctuation, and maximum duration.
- [ ] Ensure monotonic non-overlapping timings within scene audio duration.
- [ ] Display captions through the shared preview overlay and safe area.
- [ ] Implement SRT and VTT serializers.
- [ ] Mark captions stale when narration, audio, voice, or rate changes.

## Technical Implementation Requirements

- Sentence-level timing is required; word-level is preferred.
- Caption text is derived from approved narration, not a separate generative rewrite.
- Exports reference a chosen current/approved lesson version.
- Invalid timing is blocking for final validation.
- Caption lines must not cover important visual safe zones.

## Contracts and Persistence

- Caption track/cue.
- SRT/VTT export result.

## Interfaces

- Caption generation/status endpoints or automatic post-TTS worker step.
- Caption preview controls.
- Export endpoints completed with ST-069.

## Acceptance Criteria

- [ ] Every current audio scene has readable timed cues.
- [ ] Cue timings are monotonic, bounded, and aligned to audio.
- [ ] Captions display in scene preview without leaving safe areas.
- [ ] SRT and VTT files parse and match the approved narration/version.
- [ ] Narration/audio changes mark captions outdated.

## Required Tests

- [ ] Segmentation tests.
- [ ] Timing monotonicity tests.
- [ ] Alignment fallback tests.
- [ ] SRT/VTT golden-file tests.
- [ ] Preview safe-area visual test.
- [ ] Invalidation tests.

## Out of Scope

- Manual word-level caption editor unless later required.
- Translation.
- Separate subtitle languages.

## Story-Specific Notes

- Technical guide references: E14 and E18.

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
- **Started:** 2026-08-24
- **Completed:** 2026-08-24
- **Branch/PR:** `story/st-064` (not published)
- **Files changed:** Caption segmentation/serializers and tests; scene-audio worker and API status service; storyboard invalidation; shared API schema; scene preview input/panel; database schema and migration; story index/record.
- **Migrations:** `0051_caption_tracks.sql` adds content-addressed caption tracks and tenant-owned ordered cues; compatibility note included.
- **Contracts changed:** Internal caption track/cue persistence contract, including `content_hash`, `language`, cue order/timing/text, and deterministic SRT/VTT serializers. Existing shared preview caption overlay continues to render bounded caption cues in its safe area.
- **Commands/tests run:** `pnpm --filter @avlp/schemas build`; `pnpm --filter @avlp/database build`; `pnpm --filter @avlp/pipeline-worker build`; `pnpm --filter @avlp/api build`; `pnpm --filter @avlp/web build`; affected API, pipeline-worker, web, and scene-library tests; affected API, pipeline-worker, and web typechecks/lint; `git diff --check`.
- **Screenshots or representative output:** Caption test verifies `00:00:01,250 --> 00:00:02,500` SRT and the equivalent VTT timestamp; existing scene-preview safe-area test passes.
- **Decisions and assumptions:** Provider sentence timestamps are used whenever valid and monotonic; proportional sentence alignment is the fallback. Captions derive exclusively from approved scene narration stored with the audio job. Caption writes occur only after the audio completion hash remains current and use a unique audio/content hash for retry idempotency. The tenant-scoped audio-status response supplies cues to the shared safe-area preview overlay.
- **Deviations from story/technical guide:** SRT/VTT are implemented as internal serializers; authenticated download endpoints are intentionally deferred to ST-069 as this story specifies.
- **Known risks or follow-up:** ST-065 extends this selected-scene integration to full-lesson timeline seeking. Final validation/export-download endpoint integration remains ST-066/ST-069.
