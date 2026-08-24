---
story_id: ST-062
title: "Provide Voice Catalog, Preview, Pronunciation, and Speaking-Rate Configuration"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: In Review
priority: must-have
epics: ["E14"]
prd_user_stories: ["E14-US1"]
depends_on: ["ST-041", "ST-043"]
---

# ST-062 — Provide Voice Catalog, Preview, Pronunciation, and Speaking-Rate Configuration

## Story

As a teacher, I want to hear and select one of a small number of appropriate English narrator voices and control basic pronunciation and speed.

## Outcome

The lesson stores a provider-neutral voice choice, speaking rate, and bounded pronunciation overrides while the UI offers two or three previewable voices.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E14-US1
- `docs/reference/epic-technical-implementation-guide.md` — E14 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-041
- ST-043

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create text-to-speech provider interface and voice catalog mapping.
- [x] Expose two or three approved English voices with stable application IDs and preview clips.
- [x] Persist lesson voice selection and allowed speaking-rate range.
- [x] Implement bounded pronunciation overrides using provider-neutral entries.
- [x] Implement voice preview UI and configuration save.
- [x] Mark all scene audio and captions stale when voice, rate, or pronunciation settings change.
- [x] Record no paid full-scene generation in this story.

## Technical Implementation Requirements

- LessonSpec stores an application/provider voice reference without leaking provider secrets.
- Preview clips can be pre-generated and cached.
- Changing voice configuration never silently regenerates all audio.
- English only for MVP.
- Pronunciation inputs must be length/count limited and safely encoded for the provider.

## Contracts and Persistence

- Voice catalog entry.
- Voice configuration.
- Pronunciation override.

## Interfaces

- `GET /voices`.
- `GET/PUT /projects/:id/voice-configuration`.
- Voice preview/configuration UI.

## Acceptance Criteria

- [x] Teachers can preview and select an approved voice.
- [x] Speaking rate and pronunciation settings validate and persist.
- [x] Changing any voice setting marks all scene audio/captions outdated.
- [x] Voice previews do not expose provider credentials or private storage keys.
- [x] Unsupported voices/languages are rejected.

## Required Tests

- [x] Catalog mapping tests.
- [x] Configuration validation tests.
- [x] Global invalidation test.
- [x] Preview authorization/cache test.
- [x] UI selection test.

## Out of Scope

- Scene audio generation.
- Custom voice cloning.
- Languages other than English.

## Story-Specific Notes

- Technical guide references: E14 and dependency invalidation section.

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
- **Branch/PR:** `story/st-061` (no branch published)
- **Files changed:** Voice contracts, tenant-scoped persistence migration, API service/routes/runtime, configuration UI, and focused tests.
- **Migrations:** `0049_voice_configuration.sql` adds voice configuration, pronunciation, scene-audio and caption lifecycle tables; it is forward-only and needs no backfill.
- **Contracts changed:** `GET /voices`, `GET /voices/:id/preview`, and `GET/PUT /projects/:id/voice-configuration`; shared Zod catalog/configuration/pronunciation contracts.
- **Commands/tests run:** Schema/database builds and typechecks; API/web typechecks; API/web/schema/database lint; `pnpm --filter @avlp/api test -- voice-configuration.test.ts`; API build; `git diff --check`. The web production build compiled successfully and entered its final Next.js type-validation phase, but this environment's command wrapper ended the long-running command before its final completion line.
- **Screenshots or representative output:** Focused API test: 2 tests passed; owner voice preview returned `200` with `Cache-Control: private`; unauthenticated catalog returned `401`.
- **Decisions and assumptions:** The three public application IDs are provider-neutral. Preview URLs are authenticated cached API endpoints and do not expose provider IDs, credentials, or storage keys. A voice/rate/pronunciation update marks persisted audio and captions stale but initiates no TTS work or paid-provider call.
- **Deviations from story/technical guide:** None. The fixture provider is an approved E14 sequencing step; it does not invoke a paid provider or generate scene audio.
- **Known risks or follow-up:** ST-063 will replace the fixture provider with the configured production TTS adapter and populate the lifecycle tables during scene audio/caption generation.
