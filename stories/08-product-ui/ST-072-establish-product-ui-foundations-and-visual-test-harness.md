---
story_id: ST-072
title: "Establish Product UI Foundations and Visual Test Harness"
phase: "08 - Product UI"
status: Ready
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

- [ ] Audit current routes, form names, test selectors, UI dependencies, and
      existing browser coverage before changing shared presentation.
- [ ] Add one accessible React component foundation and document the decision.
      The approved direction is Radix Themes unless repository constraints found
      during implementation require a small ADR-backed change.
- [ ] Add Phosphor Icons as the only product icon family and standardize weight,
      size, accessible names, and tooltip behavior.
- [ ] Add Motion for React as the product interaction-motion dependency, but use
      it only in small client leaves and only for motivated state transitions.
- [ ] Define application-level semantic tokens for color, spacing, typography,
      radius, elevation, motion, focus, and z-index using CSS variables.
- [ ] Implement Studio Daylight and Focus Studio theme roots with the values and
      usage rules in `docs/design.md`.
- [ ] Self-host Geist Sans Variable through `next/font/local` when an approved
      font asset is present. Until then, retain the documented Arial fallback
      without loading a remote font at runtime.
- [ ] Create reusable product primitives for buttons, icon buttons, fields,
      choices, status labels, notices, skeletons, dialogs, drawers, menus,
      tooltips, and tabs.
- [ ] Create reusable layout primitives for page containers, application header,
      project pipeline rail, information rail, and editor shell.
- [ ] Add an internal `/ui-design-preview` route with deterministic fixtures for
      normal, hover, focus, disabled, loading, empty, warning, error, and success
      states in both page modes.
- [ ] Add screenshot fixtures or equivalent visual-regression coverage at
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

- [ ] Studio Daylight and Focus Studio render from one documented semantic token
      system and preserve hierarchy in both modes.
- [ ] The approved component, icon, and motion dependencies are installed,
      documented, and used without a second competing system.
- [ ] Every required primitive is keyboard usable and displays a visible focus
      state, accessible name, and valid disabled state where applicable.
- [ ] The component preview demonstrates all required interaction and status
      states without fake project data or decorative product screenshots.
- [ ] Product UI tokens and components do not change the Remotion video design
      system or rendered lesson output.
- [ ] Visual fixtures are stable at desktop, tablet, and mobile widths.

## Required Tests

- [ ] Primitive interaction and keyboard tests.
- [ ] Accessible-name, focus-order, and contrast checks.
- [ ] Theme token and reduced-motion tests.
- [ ] Component preview Playwright smoke test.
- [ ] Desktop, tablet, and mobile screenshot baselines.
- [ ] Affected web lint, typecheck, test, and build commands.

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

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, dependencies, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve existing user behavior, route structure, and test selectors.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Capture representative screenshots in both modes and all target widths.
- [ ] Self-review accessibility, reduced motion, responsive behavior, and bundle
      impact.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No unapproved contract, route, or product behavior change was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None expected.
- **Contracts changed:** Internal product UI contracts only.
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Known risks or follow-up:**
- **Deviations from story or technical guide:**
