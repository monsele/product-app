---
story_id: ST-012
title: "Implement the Hook or Question Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-012 — Implement the Hook or Question Scene Template

## Story

As a learner, I want an opening question or surprising fact to focus my attention on the lesson.

## Outcome

The hook template accepts bounded structured data and renders a polished deterministic opening scene.

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

- [ ] Define the hook visual schema and editor metadata.
- [ ] Support a short question or fact, optional subject illustration/icon, and optional supporting elements.
- [ ] Implement layout variants selected by deterministic content rules.
- [ ] Implement entrance, emphasis, and exit timing using shared motion tokens.
- [ ] Add valid, maximum-density, and invalid fixtures.
- [ ] Add a Remotion preview composition.

## Technical Implementation Requirements

- Keep the main hook readable at a glance.
- Limit on-screen text and supporting elements in schema.
- Use asset bindings rather than provider-specific image URLs.
- Narration duration controls scene duration; visual timing derives from frames.

## Contracts and Persistence

- `HookVisual` added/finalized in LessonSpec.
- Hook form metadata and asset-slot rules.

## Interfaces

- Scene registry hook implementation.
- Preview fixture and frame snapshots.

## Acceptance Criteria

- [ ] Valid hook scenes render at 1920×1080 with no overflow.
- [ ] Excessive question length or too many supporting elements fail validation.
- [ ] The scene can render with text/shapes only and with an optional asset.
- [ ] The same fixture is deterministic across repeated renders.

## Required Tests

- [ ] Schema limit tests.
- [ ] Visual regression at key frames.
- [ ] Short render smoke test.
- [ ] Missing optional asset behavior test.

## Out of Scope

- AI hook generation.
- Asset search.
- Audio generation.

## Story-Specific Notes

- Technical guide references: E11 and the MVP template catalog.

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
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/src/lesson-spec.test.ts`, `packages/scene-library/package.json`, `pnpm-lock.yaml`, `packages/scene-library/src/hook-scene.tsx`, `packages/scene-library/src/hook-scene.fixtures.ts`, `packages/scene-library/src/scene-registry.tsx`, `packages/scene-library/src/remotion-root.tsx`, `packages/scene-library/src/index.ts`, `packages/scene-library/src/index.test.ts`, and `packages/scene-library/src/scene-preview-render-smoke.test.ts`.
- **Migrations:** None.
- **Contracts changed:** Finalized the backward-compatible `HookVisual` v1 fields: required `question` (80 chars), optional `prompt` (48 chars), and up to three 12-character `supportingElements`; hook editor metadata exposes these limits and one optional `subject` asset slot. Existing `assetBindings` remain the asset contract.
- **Commands/tests run:** Passed: `pnpm install`, `pnpm --filter @avlp/schemas build`, `pnpm --filter @avlp/schemas test` (21 tests), `pnpm --filter @avlp/scene-library typecheck`, `pnpm --filter @avlp/scene-library lint`, `pnpm --filter @avlp/scene-library test` (13 tests, including 30fps Remotion PNG smoke and a 1920×1080 maximum-density bounds check), scoped Prettier check, and `git diff --check`. Workspace `typecheck`, `test`, and `build` remain blocked by the unrelated missing `packageBoundary` export consumed by `@avlp/test-fixtures`; repository-wide formatting reports pre-existing unrelated files.
- **Screenshots or representative output:** The hook Remotion smoke test emitted valid 1920×1080 PNGs at 30fps. SHA-256 baselines cover entrance and fully entered key frames; repeated frame-zero rendering produces the same PNG. Key animation-frame states, no-asset rendering, and optional-asset rendering are covered by automated tests.
- **Decisions and assumptions:** The initial optional subject illustration is represented only by an approved `assetBinding` and a deterministic placeholder treatment; no remote/provider URL or asset lookup was added because asset management is out of scope. The existing generic scene preview composition now uses the hook default fixture.
- **Deviations from story/technical guide:** No material deviations. The `HookVisual` bounds are intentionally conservative to guarantee a readable title layout; the Remotion root now bundles the declared approved font deterministically.
- **Known risks or follow-up:** The optional asset treatment is intentionally a placeholder until the asset catalog/resolver story supplies approved asset media. Resolve the unrelated `packageBoundary` contract inconsistency before relying on workspace-wide quality gates.
