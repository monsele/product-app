---
story_id: ST-010
title: "Create the MVP Video Design System and Motion Tokens"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US2"]
depends_on: ["ST-001", "ST-007"]
---

# ST-010 — Create the MVP Video Design System and Motion Tokens

## Story

As a teacher, I want every generated scene to look like one coherent lesson rather than a collection of unrelated animations.

## Outcome

The scene library exposes one approved visual theme with shared typography, spacing, safe areas, colors, caption zones, and deterministic motion presets.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US2
- `docs/reference/epic-technical-implementation-guide.md` — E11 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-007

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create video-specific design tokens separate from the web UI theme.
- [ ] Define the 1920×1080 coordinate space, safe areas, title/body/caption regions, and responsive scaling rules.
- [ ] Define typography hierarchy and font loading for browser preview and server rendering.
- [ ] Define one MVP color system and accessible contrast rules.
- [ ] Define motion presets for enter, exit, emphasize, reveal, and the allowed cut/fade/slide transitions.
- [ ] Create caption styling and lower-third avoidance rules.
- [ ] Create a design-system preview composition.

## Technical Implementation Requirements

- Animations must be deterministic by frame and must not depend on wall-clock time.
- The same fonts and assets must load in the Remotion Player and renderer.
- Do not permit scene templates to introduce ad hoc spacing, colors, or motion curves.
- Important status or meaning must not rely on color alone.
- Respect one visual theme for MVP.

## Contracts and Persistence

- `VideoTheme`.
- `MotionPreset`.
- `SafeArea`.
- Typography and spacing token exports.

## Interfaces

- Theme provider/context consumed by scenes.
- Preview composition showing representative text, shapes, captions, and transitions.

## Acceptance Criteria

- [ ] The design-system preview renders identically in browser and render smoke tests.
- [ ] Typography and captions remain inside safe areas.
- [ ] All tokens are importable by every scene package.
- [ ] No template-specific business data is introduced.

## Required Tests

- [ ] Token unit tests.
- [ ] Font-loading smoke test.
- [ ] Representative frame regression test.
- [ ] Contrast/readability checks where automatable.

## Out of Scope

- Web application design system.
- Multiple themes.
- Teacher theme customization.

## Story-Specific Notes

- Technical guide references: E11 and section 11.3.

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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Contracts changed:**
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Deviations from story/technical guide:**
- **Known risks or follow-up:**
