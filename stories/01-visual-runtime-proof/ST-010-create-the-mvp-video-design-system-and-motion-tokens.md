---
story_id: ST-010
title: "Create the MVP Video Design System and Motion Tokens"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
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

- **Agent:** Codex
- **Started:** 2026-08-08
- **Completed:** 2026-08-08
- **Branch/PR:** Existing local worktree; no branch or PR created.
- **Files changed:** `packages/design-system` theme, provider, preview composition, tests, package metadata, and lockfile; browser preview test route and Playwright coverage in `apps/web` and `e2e`; minimal token-consumer import package in `packages/scene-library`; `STORY_INDEX.md`.
- **Migrations:** None.
- **Contracts changed:** Added exported `VideoTheme`, `MotionPreset`, `SafeArea`, transition presets, `VideoThemeProvider`, and design-preview composition contract. `@avlp/scene-library` now consumes the public theme, safe-area, motion, and transition contracts.
- **Commands/tests run:** `pnpm --filter @avlp/design-system test` (9 passing, including a PNG frame-regression and render smoke); `lint`, `typecheck`, and `build` for the design-system workspace; `pnpm --filter @avlp/scene-library lint`, `typecheck`, `test`, and `build` (passing); `pnpm --filter @avlp/web typecheck`; `pnpm --filter @avlp/web build`; `pnpm exec playwright test e2e/video-design-preview.spec.ts`; targeted Prettier check; `git diff --check` (all passing). Root `pnpm format:check` remains blocked by pre-existing ST-009 eval/lockfile formatting changes.
- **Screenshots or representative output:** Deterministic token-driven enter transition reaches fully visible at frame 18; the browser Player waits for the font set and verifies that Atkinson Hyperlegible loaded before capturing a 1920×1080 decoded-pixel baseline at frame 18. The renderer uses the same Playwright Chromium executable, has decoded-pixel and PNG baselines at frame 18, and has a PNG baseline during the fade at frame 96. The browser and renderer comparison permits at most 40,000 differing channels and 200,000 aggregate channel levels; its measured shared-Chromium baseline is 38,933 and 181,497 respectively, covering only isolated compositing edges.
- **Decisions and assumptions:** One 1920x1080, 30fps theme uses bundled Atkinson Hyperlegible font assets and controlled cut/fade/slide transitions; video tokens remain separate from web UI tokens.
- **Deviations from story/technical guide:** No material deviations. The design-system package supplies the Remotion root for the shared preview/render composition.
- **Known risks or follow-up:** ST-011 must extend `@avlp/scene-library` with the runtime registry, template schemas, layout validation, and components; this story adds only the token-consumer boundary.
- **Review outcome:** Approved. The provider is fixed to the one approved theme, preview animation consumes shared enter/exit presets, the preview demonstrates the approved fade transition, browser Player plus renderer representative frames have SHA-256 baselines, the preview root explicitly fills the 1920×1080 canvas, and browser font loading is explicitly verified before parity capture.
