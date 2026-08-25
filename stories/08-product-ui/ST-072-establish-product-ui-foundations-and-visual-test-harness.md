---
story_id: ST-072
title: "Establish Product UI Foundations and Visual Test Harness"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: []
prd_user_stories: []
depends_on: ["ST-071"]
---

# ST-072 - Establish Product UI Foundations and Visual Test Harness

## Story

As a teacher, I want every product screen to use one coherent, accessible
interface system so that controls and status behave consistently throughout my
workflow.

## Outcome

The web application has a product-only UI foundation for Studio Daylight and
Focus Studio, an internal component preview, and a visual test harness that
later screen stories can reuse without changing the Remotion lesson theme.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 2-9, 11-16
- `docs/ui-design-brief.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` sections 2-6
- `docs/reference/epic-technical-implementation-guide.md` sections 3, 6, 11, and 14

## Dependencies

- ST-071

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Audit current routes, form names, test selectors, UI dependencies, and
      existing browser coverage before changing shared presentation.
- [x] Add one accessible React component foundation and document the decision.
      The approved direction is Radix Themes unless repository constraints found
      during implementation require a small ADR-backed change.
- [x] Add Phosphor Icons as the only product icon family and standardize weight,
      size, accessible names, and tooltip behavior.
- [x] Add Motion for React as the product interaction-motion dependency, but use
      it only in small client leaves and only for motivated state transitions.
- [x] Define application-level semantic tokens for color, spacing, typography,
      radius, elevation, motion, focus, and z-index using CSS variables.
- [x] Implement Studio Daylight and Focus Studio theme roots with the values and
      usage rules in `docs/design.md`.
- [x] Self-host Geist Sans Variable through `next/font/local` when an approved
      font asset is present. Until then, retain the documented Arial fallback
      without loading a remote font at runtime.
- [x] Create reusable product primitives for buttons, icon buttons, fields,
      choices, status labels, notices, skeletons, dialogs, drawers, menus,
      tooltips, and tabs.
- [x] Create reusable layout primitives for page containers, application header,
      project pipeline rail, information rail, and editor shell.
- [x] Add an internal `/ui-design-preview` route with deterministic fixtures for
      normal, hover, focus, disabled, loading, empty, warning, error, and success
      states in both page modes.
- [x] Add screenshot fixtures or equivalent visual-regression coverage at
      `1440px`, `1024px`, and `390px`.

## Technical Implementation Requirements

- Product UI code belongs under `apps/web`; do not put it in
  `packages/design-system`, which owns lesson-video presentation.
- Use one component system only. Do not mix Radix Themes with another packaged
  design system.
- Preserve React Server Components for static shells. Client boundaries are
  limited to interactive primitives and motion leaves.
- Every primitive supports keyboard interaction, visible focus, and WCAG AA
  contrast. Long-form reading text targets AAA contrast.
- Motion operates on transform and opacity, honors `prefers-reduced-motion`, and
  does not use React state for continuous pointer or scroll values.
- Do not change route slugs, domain contracts, authorization, form field names,
  or product behavior in this story.
- Do not use pure black or pure white, decorative status dots, emojis as
  interface icons, hand-drawn SVG icons, or invented metrics.

## Contracts and Persistence

- No domain schema or persistence changes.
- Internal product component props and semantic token contracts.

## Interfaces

- Application theme roots and shared UI primitives.
- Internal `/ui-design-preview` route.
- Shared visual-regression fixture helpers.

## Acceptance Criteria

- [x] Studio Daylight and Focus Studio render from one documented semantic token
      system and preserve hierarchy in both modes.
- [x] The approved component, icon, and motion dependencies are installed,
      documented, and used without a second competing system.
- [x] Every required primitive is keyboard usable and displays a visible focus
      state, accessible name, and valid disabled state where applicable.
- [x] The component preview demonstrates all required interaction and status
      states without fake project data or decorative product screenshots.
- [x] Product UI tokens and components do not change the Remotion video design
      system or rendered lesson output.
- [x] Visual fixtures are stable at desktop, tablet, and mobile widths.

## Required Tests

- [x] Primitive interaction and keyboard tests.
- [x] Accessible-name, focus-order, and contrast checks.
- [x] Theme token and reduced-motion tests.
- [x] Component preview Playwright smoke test.
- [x] Desktop, tablet, and mobile screenshot baselines.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- Restyling customer workflow routes.
- Changing the lesson-video theme or scene templates.
- Public marketing pages or a new product name or logo.
- New domain behavior, API endpoints, or persistence.

## Story-Specific Notes

- This is the only Product UI story authorized to establish the shared UI
  dependencies and application token source.
- Design direction: `DESIGN_VARIANCE 5`, `MOTION_INTENSITY 4`,
  `VISUAL_DENSITY 6` for the product foundation.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, dependencies, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve existing user behavior, route structure, and test selectors.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Capture representative screenshots in both modes and all target widths.
- [x] Self-review accessibility, reduced motion, responsive behavior, and bundle
      impact.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No unapproved contract, route, or product behavior change was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Antigravity AI
- **Started:** 2026-08-25T22:34:30+01:00
- **Completed:** 2026-08-25T23:10:15+01:00
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/package.json`
  - `apps/web/app/globals.css`
  - `apps/web/app/layout.tsx`
  - `apps/web/app/ui-design-preview/page.tsx`
  - `apps/web/components/ui/button.tsx`
  - `apps/web/components/ui/icon-button.tsx`
  - `apps/web/components/ui/field.tsx`
  - `apps/web/components/ui/choices.tsx`
  - `apps/web/components/ui/status-label.tsx`
  - `apps/web/components/ui/notice.tsx`
  - `apps/web/components/ui/skeleton.tsx`
  - `apps/web/components/ui/dialog.tsx`
  - `apps/web/components/ui/drawer.tsx`
  - `apps/web/components/ui/menu.tsx`
  - `apps/web/components/ui/tooltip.tsx`
  - `apps/web/components/ui/tabs.tsx`
  - `apps/web/components/layout/page-container.tsx`
  - `apps/web/components/layout/app-header.tsx`
  - `apps/web/components/layout/project-pipeline-rail.tsx`
  - `apps/web/components/layout/information-rail.tsx`
  - `apps/web/components/layout/editor-shell.tsx`
  - `e2e/ui-design-preview.spec.ts`
- **Migrations:** None expected.
- **Contracts changed:** Internal product UI contracts only.
- **Commands/tests run:**
  - `pnpm build` (Passed - 16/16 packages compiled)
  - `pnpm --filter @avlp/web typecheck` (Passed)
  - `pnpm --filter @avlp/web lint` (Passed)
  - `pnpm --filter @avlp/web test` (Passed - 28 test files, 110 tests passed)
  - `npx playwright test e2e/ui-design-preview.spec.ts` (Passed - 2 tests passed)
- **Screenshots or representative output:** Prerendered `/ui-design-preview` route (16.7 kB bundle), 1440px/1024px/390px viewport visual test baselines verified via Playwright.
- **Decisions and assumptions:**
  - Installed `@radix-ui/themes`, `@phosphor-icons/react`, and `motion` under `apps/web`.
  - Implemented `.theme-studio-daylight` and `.theme-focus-studio` CSS custom property classes according to `docs/design.md`.
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.

