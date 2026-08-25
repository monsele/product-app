---
story_id: ST-007
title: "Define LessonSpec v1 and Scene Discriminated Unions"
phase: "00 \u2014 Foundation"
status: Done
priority: must-have
epics: ["E10", "E11", "E12", "E14", "E15", "E16", "E17", "E19", "E20"]
prd_user_stories: ["E10-US1", "E11-US1", "E12-US4", "E19-US1", "E20-US1"]
depends_on: ["ST-001", "ST-002"]
---

# ST-007 — Define LessonSpec v1 and Scene Discriminated Unions

## Story

As the product system, we need a versioned LessonSpec contract so AI generation, teacher editing, preview, validation, and rendering all operate on the same data.

## Outcome

A strict Zod schema and generated JSON Schema describe lesson metadata, audience, objectives, voice, scenes, assets, transitions, and provenance.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US1, E11-US1, E12-US4, E19-US1, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E10, E11, E12, E14, E15, E16, E17, E19, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-002

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create LessonSpec v1 using Zod as the runtime source of truth.
- [x] Define lesson metadata, audience, duration, tone, theme, objectives, and voice configuration.
- [x] Define `SceneBase` and a discriminated union for the ten supported templates.
- [x] Define source references and generated-addition markers.
- [x] Define asset-binding placeholders and transition enums.
- [x] Generate TypeScript types and JSON Schema.
- [x] Create valid and invalid fixtures and schema changelog.

## Technical Implementation Requirements

- The AI cannot emit arbitrary code, coordinates, or unsupported template names.
- Use schema version `1.0` and document compatibility rules.
- Use stable scene IDs and explicit order.
- Represent target duration as 180, 300, or 420 seconds.
- Apply template-level limits in the specific template stories; base schema enforces common limits.
- Consumers must parse unknown external JSON before use.

## Contracts and Persistence

- `LessonSpec`.
- `SceneBase`.
- `SceneSpec` discriminated union.
- `SourceRef`.
- `GeneratedAddition`.
- `SceneAssetBinding`.

## Interfaces

- Package exports for API, web, pipeline worker, renderer, and tests.
- Schema-to-JSON-Schema generation command.

## Acceptance Criteria

- [x] Valid fixtures parse and retain their exact typed shape.
- [x] Unknown schema versions and scene templates fail clearly.
- [x] Invalid durations, tone, age band, transition, or missing provenance fail.
- [x] No package maintains a duplicate hand-written LessonSpec type.

## Required Tests

- [x] Schema unit tests.
- [x] Round-trip serialization test.
- [x] Unknown-version compatibility test.
- [x] Consumer import smoke tests.

## Out of Scope

- Template-specific layout implementation.
- Database persistence.
- AI generation.

## Story-Specific Notes

- Technical guide references: sections 2.1 and 4.3.

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
- **Started:** 2026-08-08
- **Completed:** 2026-08-08
- **Branch/PR:** `story/st-005-job-platform` (existing dirty branch preserved; no branch or PR published)
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/src/lesson-spec.test.ts`, `packages/schemas/LESSONSPEC_COMPATIBILITY.md`, package manifests and lockfile for consumers, this story, and `STORY_INDEX.md`.
- **Migrations:** None.
- **Contracts changed:** Added strict `LessonSpec` v1, `SceneSpec`, `SceneBase`, `SourceRef`, `GeneratedAddition`, `SceneAssetBinding`, JSON Schema export, and `parseLessonSpec`.
- **Commands/tests run:** `pnpm install`; `pnpm --filter @avlp/config build`; `pnpm --filter @avlp/schemas generate:lesson-spec-json-schema`; `test` (13 passed); `typecheck`; `lint`; `build`; Prettier and diff checks; package-import smoke checks from API, web, pipeline worker, and renderer.
- **Screenshots or representative output:** Schema test suite passed: 1 file, 13 tests.
- **Decisions and assumptions:** Base contract requires provenance for every scene, uses only the one approved theme, and leaves template-specific layout limits to the template stories as directed.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** The reusable `SceneBase` is a derived TypeScript type; later template stories should refine template-level field limits without duplicating the root LessonSpec contract.
