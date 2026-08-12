---
story_id: ST-013
title: "Implement the Definition Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: In Review
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-013 — Implement the Definition Scene Template

## Story

As a learner, I want a new term explained with a concise definition and visual example.

## Outcome

The definition template renders a term, a short explanation, and an optional example/asset within strict density limits.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US1, E11-US2
- `docs/reference/epic-technical-implementation-guide.md` — E11 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-010
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define the definition visual schema and form metadata.
- [ ] Support term, concise definition, optional example label/text, and optional visual asset.
- [ ] Implement term reveal, definition build, and example emphasis timing.
- [ ] Implement deterministic layout variants for text-only and visual-assisted scenes.
- [ ] Add fixtures and preview composition.

## Technical Implementation Requirements

- Do not display paragraph-length source text.
- Use shared typography and safe-area tokens.
- The example must be visually secondary to the term and definition.
- Missing optional asset must not break layout.

## Contracts and Persistence

- `DefinitionVisual`.
- Definition template field and asset metadata.

## Interfaces

- Scene registry definition implementation.
- Preview composition.

## Acceptance Criteria

- [ ] The term and definition are readable and do not overlap captions.
- [ ] Maximum-length valid input renders without overflow.
- [ ] Inputs above schema limits fail with field errors.
- [ ] Text-only and asset-assisted layouts pass frame regression.

## Required Tests

- [ ] Schema tests.
- [ ] Visual regression tests.
- [ ] Render smoke test.
- [ ] Caption safe-area test.

## Out of Scope

- Narration generation.
- Vocabulary extraction UI.

## Story-Specific Notes

- Technical guide references: E11.

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
- **Started:** 2026-08-11
- **Completed:** 2026-08-11
- **Branch/PR:** Pre-existing `story/st-005-job-platform`; no PR created.
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/src/lesson-spec.test.ts`, `packages/schemas/LESSONSPEC_COMPATIBILITY.md`, `packages/schemas/lesson-spec-v1.schema.json`, `packages/scene-library/src/definition-scene.tsx`, `packages/scene-library/src/definition-scene.fixtures.ts`, `packages/scene-library/src/scene-registry.tsx`, `packages/scene-library/src/index.ts`, `packages/scene-library/src/index.test.ts`, and `packages/scene-library/src/scene-preview-render-smoke.test.ts`.
- **Migrations:** Added in-memory `LessonSpec 1.0 -> 1.1` migration; compatible documents upgrade automatically, while unsafe definition-density changes require teacher migration.
- **Contracts changed:** Added versioned `DefinitionVisual`: bounded term (80), definition (120), and optional paired example label/text (48 each). LessonSpec 1.1 and its generated JSON Schema now explicitly migrate compatible 1.0 inputs; over-limit legacy definitions require teacher migration rather than being truncated. Registry metadata exposes matching limits and an optional `visual-example` asset slot.
- **Commands/tests run:** Passed: schemas build/lint/typecheck/test (24 tests), generated LessonSpec JSON Schema, evals test (2 tests), and scene-library build/lint/typecheck/test (16 tests, including deterministic 30fps Remotion PNG smoke for text-only and asset-assisted fixtures and 1920x1080 caption-safe-area browser checks); `git diff --check`. Workspace `pnpm typecheck` remains blocked by the pre-existing missing `packageBoundary` export consumed by `@avlp/test-fixtures`.
- **Screenshots or representative output:** The max-density browser layout test verified every definition content element remains inside 1920x1080 bounds and above the caption safe area. Existing Remotion smoke produced deterministic valid PNG frames at 30fps.
- **Decisions and assumptions:** A visual asset is represented by an approved existing `assetBinding` and rendered as a deterministic placeholder; resolving catalog media is out of scope. Definition density limits were tightened from the inherited generic limits to values proven by the 1080p layout test. The explicit 1.0-to-1.1 migration preserves compatible content and rejects unsafe conversion rather than silently changing source meaning.
- **Deviations from story/technical guide:** No material deviations.
- **Known risks or follow-up:** The optional visual remains a placeholder until the asset catalog/resolver story provides approved media. Repository-wide gates may be affected by the unrelated pre-existing ST-012 worktree changes.
