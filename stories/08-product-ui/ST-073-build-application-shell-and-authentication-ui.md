---
story_id: ST-073
title: "Build the Application Shell and Authentication UI"
phase: "08 - Product UI"
status: Ready
priority: must-have
epics: ["E1", "E2"]
prd_user_stories: ["E1-US1", "E1-US2", "E1-US3", "E1-US4"]
depends_on: ["ST-025", "ST-026", "ST-027", "ST-072"]
---

# ST-073 - Build the Application Shell and Authentication UI

## Story

As a teacher, I want clear authentication screens and consistent navigation so
that I always understand where I am and how to continue safely.

## Outcome

Authentication routes use the Studio Daylight composition, and authenticated
routes share a responsive application shell that can host both Studio Daylight
and Focus Studio without changing existing security behavior.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-8, 10.1-10.2, 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E1 and E2
- `docs/reference/epic-technical-implementation-guide.md` E1, E2, sections 5.1,
  6, and 11

## Dependencies

- ST-025
- ST-026
- ST-027
- ST-072

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Build the shared authenticated header, content container, project-context
      slot, account actions, and page-mode boundary from ST-072 primitives.
- [ ] Build the responsive project pipeline rail with completed, current,
      available, and blocked states derived from authoritative project state.
- [ ] Provide a labeled drawer or compact navigation treatment below desktop
      widths while preserving the current route labels.
- [ ] Restyle sign-in, registration, forgot-password, and reset-password routes
      as a two-part Studio Daylight composition at desktop and a focused form at
      mobile widths.
- [ ] Use the existing form fields, password rules, error responses, redirects,
      sessions, and sign-out behavior.
- [ ] Provide loading, invalid-credential, invalid-token, expired-token,
      rate-limit, and successful-completion states without exposing account
      existence or internal details.
- [ ] Keep the root route functionally limited to its existing health purpose.

## Technical Implementation Requirements

- Preserve every authentication field name, action URL, cookie behavior,
  generic error rule, and current test selector unless a compatibility wrapper
  is required.
- The header stays on one line at desktop and does not exceed `80px`.
- Project pipeline state is derived from the project-stage contract. Do not mark
  a stage complete based only on route position.
- Supporting authentication imagery must be an approved real lesson frame or
  approved brand asset. If none exists, use a purposeful atmospheric surface,
  not a fake product screenshot.
- The mobile form is first in reading order and remains usable at 200 percent
  zoom.
- Authentication remains complete with motion disabled.

## Contracts and Persistence

- No authentication, project, or persistence contract changes expected.
- Shared application-shell component contracts.

## Interfaces

- `/sign-in`
- `/register`
- `/forgot-password`
- `/reset-password`
- Authenticated `/workspace` route shell and project-route shell.

## Acceptance Criteria

- [ ] Authentication routes match the Studio Daylight direction and preserve all
      existing security behavior and generic error responses.
- [ ] Authenticated pages render in a consistent shell with product identity,
      project context when present, account actions, and keyboard-accessible
      navigation.
- [ ] The project pipeline accurately distinguishes completed, current,
      available, and blocked stages using text and iconography, not color alone.
- [ ] Desktop, tablet, mobile, and 200 percent zoom layouts keep the primary
      action and recovery messages visible.
- [ ] Sign-out and protected-route redirects continue to work.
- [ ] The root health route is not converted into a marketing page.

## Required Tests

- [ ] Existing authentication and password-reset suites remain passing.
- [ ] Authentication route Playwright tests for success and failure states.
- [ ] Shell keyboard-navigation and responsive-drawer tests.
- [ ] Project-pipeline stage-mapping unit tests.
- [ ] Desktop, tablet, and mobile screenshots for all authentication routes and
      both authenticated page modes.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New authentication methods, email verification, MFA, or profile management.
- Public marketing content.
- Restyling the body content of workflow screens.
- Changing project-stage or authorization contracts.

## Story-Specific Notes

- Technical guide references: E1, E2, project state machine 5.1, and frontend
  route guidance 11.1.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve existing route names, form names, security copy, and selectors.
- [ ] Run required automated and visual tests.
- [ ] Self-review focus order, error disclosure, responsive behavior, and
      tenant-safe project context.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No authentication or tenant-isolation regression remains.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None expected.
- **Contracts changed:** None expected.
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Known risks or follow-up:**
- **Deviations from story or technical guide:**
