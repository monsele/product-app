---
story_id: ST-019
title: "Implement the Analogy Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11", "E19"]
prd_user_stories: ["E11-US1", "E11-US2", "E19-US1"]
depends_on: ["ST-010", "ST-011"]
---

# ST-019 — Implement the Analogy Scene Template

## Story

As a learner, I want an unfamiliar concept mapped to a familiar example without confusing the analogy with source fact.

## Outcome

The analogy template renders source concept, familiar analogy, and explicit mapping while supporting generated-addition labels.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US1, E11-US2, E19-US1
- `docs/reference/epic-technical-implementation-guide.md` — E11, E19 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-010
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define analogy visual schema with concept, familiar system, and bounded mapping pairs.
- [ ] Implement side-by-side or bridge layout selected by content density.
- [ ] Display an unobtrusive generated-addition indicator when the analogy is AI-added rather than sourced.
- [ ] Animate correspondence between mapping pairs.
- [ ] Add sourced and generated analogy fixtures.

## Technical Implementation Requirements

- Generated analogies must be represented in `generatedAdditions`.
- The scene must not imply every analogy detail is literally equivalent.
- Mapping count and text are bounded.
- Use accessible non-color mapping cues.

## Contracts and Persistence

- `AnalogyVisual`.
- Mapping pair schema.
- Generated-addition display metadata.

## Interfaces

- Scene registry analogy implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Concept and analogy sides are visually distinct.
- [ ] Mapping pairs remain readable at maximum valid density.
- [ ] Generated additions are visibly labelled.
- [ ] Invalid or empty mappings fail validation.

## Required Tests

- [ ] Schema tests.
- [ ] Generated-addition indicator test.
- [ ] Visual regressions.
- [ ] Render smoke test.

## Out of Scope

- AI generation of analogies.
- Grounding review service.

## Story-Specific Notes

- Technical guide references: E11 and E19.

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
- **Started:** 2026-08-12
- **Completed:** 2026-08-12
- **Approved:** 2026-08-12
- **Branch/PR:** Existing local branch; no branch or PR published.
- **Files changed:** LessonSpec schema, generated JSON Schema, compatibility notes and tests; analogy scene, fixtures, registry, exports, and focused tests; this story and `STORY_INDEX.md`.
- **Migrations:** LessonSpec 1.6 to 1.7 rejects legacy free-text analogies for teacher-led migration; non-analogy documents upgrade automatically.
- **Contracts changed:** `AnalogyVisual` now requires a bounded source concept, familiar system, and one to four explicit mapping pairs. AI-added analogies use the existing `generatedAdditions` contract with `kind: analogy`.
- **Commands/tests run:** Passed: LessonSpec JSON Schema generation; schemas test (34 tests), lint, typecheck, and build; scene-library test (33 tests, including 1920x1080 Playwright caption-safe bounds and deterministic Remotion PNG smoke), lint, typecheck, and build; scoped Prettier check and `git diff --check`.
- **Screenshots or representative output:** Playwright bounds test covers the 1920x1080 maximum-density fixture above the caption-safe area.
- **Decisions and assumptions:** The generated label is rendered only when a scene includes a `generatedAdditions` entry of kind `analogy`; it explicitly states that the comparison is a learning aid rather than a source fact.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Legacy analogy payloads must be explicitly remapped by a teacher rather than inferred or silently altered.
