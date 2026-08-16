---
story_id: ST-041
title: "Capture and Validate Lesson Configuration"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Done
priority: must-have
epics: ["E6"]
prd_user_stories: ["E6-US1", "E6-US2", "E6-US3"]
depends_on: ["ST-028", "ST-038", "ST-039", "ST-040"]
---

# ST-041 — Capture and Validate Lesson Configuration

## Story

As a teacher, I want to set learner level, difficulty, title, subject, duration, tone, visual style, and recall preference before generation.

## Outcome

A versioned configuration form saves all required generation inputs and advances the project only when valid.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E6-US1, E6-US2, E6-US3
- `docs/reference/epic-technical-implementation-guide.md` — E6 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-028
- ST-038
- ST-039
- ST-040

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create lesson configuration persistence and revision handling.
- [ ] Support age bands, difficulty, subject, lesson title, 3/5/7-minute target, friendly/academic/conversational tone, MVP theme, and recall-question preference.
- [ ] Allow suggested subject/title values while preserving teacher edits.
- [ ] Define duration-to-narration target ranges.
- [ ] Implement form validation, save, conflict, and next-step behavior.
- [ ] Include effective selected-source version in configuration context.

## Technical Implementation Requirements

- MVP product target remains introductory science for ages 10–16 even if schema contains future-safe enums.
- Only one visual theme is selectable in MVP.
- Generation cannot proceed until required fields and source review are complete.
- Changing configuration later invalidates only affected unapproved or derived outputs according to dependency rules.

## Contracts and Persistence

- Lesson configuration entity/DTO.
- Age, difficulty, duration, tone, theme enums.
- Narration word-count target helper.

## Interfaces

- `GET /projects/:id/configuration`.
- `PUT /projects/:id/configuration`.
- Configuration route/form.

## Acceptance Criteria

- [ ] A valid configuration persists and is returned after refresh.
- [ ] Required fields and allowed values are enforced client and server side.
- [ ] Duration produces a documented target word-count range.
- [ ] The project cannot advance without confirmed source content and valid configuration.
- [ ] Stale updates show a conflict.

## Required Tests

- [ ] Configuration schema tests.
- [ ] API validation and concurrency tests.
- [ ] Duration-target tests.
- [ ] Workflow guard test.
- [ ] Form Playwright test.

## Out of Scope

- Multiple languages.
- Custom themes.
- Arbitrary video durations.
- Student profiles.

## Story-Specific Notes

- Technical guide references: E6.

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
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Kilo (deepseek/deepseek-v4-flash)
- **Started:** 2026-08-16
- **Completed:** 2026-08-16
- **Branch/PR:** `story/st-041` (local; no PR opened — not authorized to publish)
- **Files changed:**
  - `packages/schemas/src/index.ts` — lesson configuration enums, DTO schemas, narration word-count target helper
  - `packages/schemas/src/lesson-configuration.test.ts` — schema + duration-target tests
  - `packages/database/src/schema.ts` — `lesson_configurations` table, `lesson.configuration_saved` audit event
  - `packages/database/drizzle/0027_lumpy_spitfire.sql` + `0027_lumpy_spitfire.compatibility.md` + `meta/0027_snapshot.json` + `meta/_journal.json`
  - `apps/api/src/lesson-configuration.ts` — service (GET/PUT, workflow guard, optimistic concurrency, audit)
  - `apps/api/src/lesson-configuration.test.ts` — route-level authorization/validation/concurrency tests
  - `apps/api/src/lesson-configuration.integration.test.ts` — Postgres integration tests (skipped without TEST_DATABASE_URL)
  - `apps/api/src/app.ts` — `GET/PUT /projects/:id/configuration` routes + service wiring
  - `apps/api/src/runtime.ts` — `PostgresLessonConfigurationService` wiring
  - `apps/web/app/workspace/[projectId]/configuration/page.tsx`, `lesson-configuration-form.tsx`, `lesson-configuration-input.ts`, `lesson-configuration-input.test.ts`
  - `e2e/lesson-configuration.spec.ts` — Playwright form test
  - `e2e/workspace-mock-api.mjs` — mock GET/PUT configuration routes (additive)
  - `STORY_INDEX.md`, `stories/.../ST-041-...md` — status to `In Review`
- **Migrations:** `0027_lumpy_spitfire` (creates `lesson_configurations`, adds `lesson.configuration_saved` audit enum value).
- **Contracts changed:** New public DTOs `lessonConfigurationSchema`, `lessonConfigurationInputSchema`, `lessonConfigurationResponseSchema`, `narrationWordCountRange`, enums (`ageBand`, `difficulty`, `tone`, `visualTheme`), endpoints `GET/PUT /projects/:id/configuration`.
- **Commands/tests run:**
  - `pnpm --filter @avlp/schemas typecheck lint test build` — 47 tests pass
  - `pnpm --filter @avlp/database typecheck lint test build` + `db:generate` — 8 tests pass
  - `pnpm --filter @avlp/api typecheck lint test build` — 75 pass, 40 skipped (no TEST_DATABASE_URL)
  - `pnpm --filter @avlp/web typecheck lint test build` — 25 tests pass
  - `pnpm exec playwright test e2e/lesson-configuration.spec.ts` — 2/2 pass
- **Screenshots or representative output:** e2e output `2 passed`; web build route table includes `/workspace/[projectId]/configuration`.
- **Decisions and assumptions:**
  - One current-draft row per project with a monotonic `version`; optimistic concurrency returns 409 on stale `expectedVersion`. Immutable approved configuration versions are deferred to ST-042+.
  - Age bands, difficulty, tone, and theme values align with `LessonSpec` to avoid enum translation; only `mvp-default` theme is accepted.
  - Narration budget: `target = minutes × 140 wpm × (1 − 0.2 pause reservation)` with a documented ±15% range.
  - PUT requires confirmed source content (ingestion quality `ready`); a successful first save advances the project stage `ingestion_review → lesson_configuration`.
  - No idempotency key on PUT; version-based concurrency covers retries.
- **Deviations from story/technical guide:** Technical guide lists an optional approve endpoint and config version/hash snapshots; per the story's Interfaces (GET/PUT only) those are deferred to ST-042+ and recorded as follow-up. The required "Form Playwright test" is implemented; the repo also gained a vitest unit test for form input building.
- **Known risks or follow-up:**
  - Integration tests need a live Postgres (`TEST_DATABASE_URL`) to execute; skipped locally.
  - Pre-existing e2e failures unrelated to ST-041: `ingestion-review.spec.ts` (mock API never served `/source-sections`) and a flaky `workspace.spec.ts` upload completion — reported, not fixed (out of scope).
  - Config version snapshots referenced by generated artifacts (ST-042+) are not yet materialized.
