---
story_id: ST-017
title: "Implement the Cause-and-Effect Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-017 — Implement the Cause-and-Effect Scene Template

## Story

As a learner, I want a cause, mechanism, and result shown as a connected chain.

## Outcome

The template renders bounded causal relationships with arrows and progressive explanation.

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

- [ ] Define cause-effect visual schema supporting one or more causes, an optional mechanism, and one or more effects within limits.
- [ ] Implement chain or branching layout rules.
- [ ] Implement progressive reveal and connection emphasis.
- [ ] Support optional per-node icons/assets.
- [ ] Add simple and branching fixtures.

## Technical Implementation Requirements

- Causal direction must be visually explicit.
- The renderer does not invent missing mechanisms.
- Branching is bounded to prevent diagram congestion.
- Use shared arrow and node primitives.

## Contracts and Persistence

- `CauseEffectVisual`.
- Causal node and connection schemas.

## Interfaces

- Scene registry cause-effect implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Simple and bounded branching chains render without ambiguous direction.
- [ ] Invalid empty causes/effects fail.
- [ ] Overly complex graphs fail validation rather than auto-compressing.
- [ ] Key frames pass visual regression.

## Required Tests

- [ ] Schema tests.
- [ ] Branch-layout unit tests.
- [ ] Visual regressions.
- [ ] Render smoke test.

## Out of Scope

- General graph visualization.
- Causal inference or truth validation.

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
- **Branch/PR:** Existing local branch `story/st-005-job-platform`; no branch or PR was created because the worktree already contained unrelated in-progress scene-template work.
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/src/lesson-spec.test.ts`, `packages/schemas/lesson-spec-v1.schema.json`, `packages/schemas/LESSONSPEC_COMPATIBILITY.md`, `packages/scene-library/src/cause-effect-scene.tsx`, `packages/scene-library/src/cause-effect-scene.fixtures.ts`, `packages/scene-library/src/scene-registry.tsx`, `packages/scene-library/src/index.ts`, `packages/scene-library/src/index.test.ts`, `packages/scene-library/src/scene-preview-render-smoke.test.ts`, this story, and `STORY_INDEX.md`.
- **Migrations:** None. LessonSpec migration `1.4` to `1.5` adapts prior cause/effect label arrays into bounded node IDs and explicit directed connections without persistence changes.
- **Contracts changed:** Added `CauseEffectVisual`, causal-node, and connection schemas; LessonSpec `1.5`; registry metadata, default scene, and asset slots for the `cause-effect` template.
- **Commands/tests run:** `pnpm --filter @avlp/schemas generate:lesson-spec-json-schema`; focused schema and scene-library tests; final `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check` all passed.
- **Screenshots or representative output:** Deterministic Remotion 1080p smoke render passed for the branching fixture, with a SHA-256 frame snapshot. Playwright confirms the maximum-density fixture stays above the caption-safe area.
- **Decisions and assumptions:** Causal diagrams allow 1–3 causes and 1–3 effects, one optional mechanism, and only complete directed chain connections. The renderer never supplies a mechanism or infers extra relationships.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** No known in-scope risks. Existing unrelated worktree changes remain unmodified.
