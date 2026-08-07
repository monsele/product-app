# AGENTS.md — AI Visual Learning Platform

## Purpose

These rules apply to every AI coding agent working on the MVP.

## Source hierarchy

1. `docs/reference/mvp-prd.md` defines required product behavior and MVP scope.
2. `docs/adr/` defines approved architecture decisions.
3. The assigned story file defines the bounded implementation increment.
4. `docs/reference/epic-technical-implementation-guide.md` defines the shared technical approach.
5. `docs/reference/mvp-features.md` and `mvp-plan.md` provide supporting product context.

A story may refine implementation detail but may not silently remove PRD acceptance criteria. Record a conflict or architecture change through an ADR.

## Story execution rules

1. Work on one story at a time.
2. Do not start until every `depends_on` story is Done.
3. Read the assigned story, its cited epics, the relevant technical-guide section, and current ADRs.
4. Inspect existing code before proposing changes.
5. Write a short implementation plan before modifying files.
6. Do not implement work listed as out of scope.
7. Keep one branch or pull request per story unless the repository owner directs otherwise.
8. Update the story's Dev Agent Record and `STORY_INDEX.md` when complete.
9. Do not mark a story Done unless all acceptance criteria and required tests pass.
10. Do not make unrelated refactors.

## Engineering rules

- TypeScript strict mode is mandatory; do not use `any` without a written justification.
- Validate all external data at the boundary.
- `LessonSpec` and `NormalizedDocument` are versioned contracts.
- The AI cannot emit arbitrary animation code or pixel coordinates.
- Preserve tenant isolation in every project-owned query and signed URL.
- Original uploads, canonical parser output, normalized versions, and lesson versions are immutable.
- Teacher corrections are overlays.
- Expensive work runs in background jobs.
- Jobs must be idempotent, retryable where appropriate, correlated, and metered.
- Do not hold database transactions open while calling storage or external providers.
- Do not log source text, passwords, tokens, signed URLs, secrets, or raw provider payloads.
- Paid provider calls require explicit user action, quota checks, and usage records.
- Add authorization, failure-path, concurrency, and idempotency tests where applicable.
- Update shared schemas before their consumers.
- A major architecture change requires an ADR.

## Required completion report

At the end of a story, record:

- Files changed
- Migrations
- Public contract changes
- Commands and tests run
- Screenshots or representative output where relevant
- Decisions and assumptions
- Known risks
- Deviations from the story or technical guide
