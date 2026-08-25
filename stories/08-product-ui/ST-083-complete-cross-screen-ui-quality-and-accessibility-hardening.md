---
story_id: ST-083
title: "Complete Cross-Screen UI Quality and Accessibility Hardening"
phase: "08 - Product UI"
status: Ready
priority: must-have
epics: []
prd_user_stories: []
depends_on: ["ST-082"]
---

# ST-083 - Complete Cross-Screen UI Quality and Accessibility Hardening

## Story

As a teacher, I want the complete application workflow to remain coherent,
accessible, responsive, and stable so that visual polish never compromises my
work or security.

## Outcome

The full Product UI phase passes cross-screen visual, accessibility, responsive,
performance, behavior, and regression checks using the real MVP workflow and
representative failure states.

## Required Reading

- `AGENTS.md`
- `docs/design.md` in full
- `docs/ui-design-brief.md`
- All accepted ADRs in `docs/adr/`
- `docs/reference/mvp-prd.md` sections 5-7
- `docs/reference/epic-technical-implementation-guide.md` sections 5, 6, 11,
  14, and 16
- ST-072 through ST-082 Dev Agent Records and screenshots

## Dependencies

- ST-082

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Build a route-and-state quality matrix covering authentication, workspace,
      upload, review, configuration, objectives, outline, narration, storyboard,
      preview, delivery, and public playback.
- [ ] Run the complete five-page science fixture through the teacher workflow and
      capture representative happy-path output at each route.
- [ ] Verify loading, empty, warning, error, stale, conflict, disabled, success,
      blocked, and unauthorized states where each route supports them.
- [ ] Add or finalize automated accessibility scanning with a single documented
      test-only tool after verifying the current dependencies.
- [ ] Verify keyboard-only completion, visible focus, focus restoration, live
      regions, headings, landmarks, labels, dialogs, drawers, menus, tabs, media
      controls, and drag alternatives.
- [ ] Verify WCAG AA control and body contrast, AAA long-form reading contrast,
      text resize, and 200 percent zoom.
- [ ] Verify the documented `1440px`, `1024px`, and `390px` responsive layouts,
      plus narrow-height and long-content stress cases.
- [ ] Verify reduced motion, theme boundaries, no pure black or white, one icon
      family, radius consistency, semantic status, and truthful data display.
- [ ] Run visual-regression comparison for all approved baseline fixtures and
      repair in-scope UI regressions.
- [ ] Measure route-level performance, player mounting, layout shift, and
      interaction responsiveness; fix in-scope Product UI regressions.
- [ ] Re-run authorization, signed-media, token-minimization, paid-action,
      idempotency, concurrency, and immutable-data tests affected by the UI work.
- [ ] Complete a final copy review for concrete labels, correct grammar, safe
      errors, and consistent teacher-facing stage names.

## Technical Implementation Requirements

- This story may fix Product UI defects found by the quality matrix but may not
  introduce new product behavior, routes, domain contracts, or broad refactors.
- Visual fixtures use deterministic, token-safe, tenant-safe data. Never store
  raw source text, reset tokens, share tokens, signed URLs, or private identifiers
  in screenshots.
- Automated accessibility scanning supplements, but does not replace, keyboard,
  screen-reader semantics, zoom, contrast, and live-region review.
- Visual differences are approved intentionally. Do not update baselines merely
  to make a failing test pass.
- Performance checks include Core Web Vitals where applicable, with targets of
  LCP below `2.5s`, INP below `200ms`, and CLS below `0.1` in the documented test
  environment.
- Any product or architecture conflict discovered here is documented and routed
  to a new story or ADR rather than silently resolved outside scope.

## Contracts and Persistence

- No contract or persistence changes expected.
- Final visual fixture and quality-matrix contracts for the Product UI phase.

## Interfaces

- Every current customer-facing route under `apps/web/app`.
- Internal `/ui-design-preview` and `/video-design-preview` routes as development
  verification surfaces.

## Acceptance Criteria

- [ ] The complete teacher workflow is visually coherent and behaviorally
      functional from account access through secure public playback.
- [ ] Every route has verified loading, empty, error, success, and additional
      domain states that apply to it.
- [ ] Keyboard-only users can complete the workflow, use editor alternatives,
      operate media, and recover from dialogs or drawers with logical focus.
- [ ] Automated accessibility checks report no unaccepted serious or critical
      issues, and manual zoom, contrast, semantics, and live-region checks pass.
- [ ] Approved visual baselines pass at desktop, tablet, and mobile widths in
      Studio Daylight and Focus Studio.
- [ ] Reduced motion preserves the complete product and stops non-essential
      continuous animation.
- [ ] Performance targets are met or any environment-bound exception is measured,
      documented, and accepted with a follow-up owner.
- [ ] Functional security, authorization, immutable-data, cost, concurrency, and
      idempotency suites affected by the UI phase remain passing.

## Required Tests

- [ ] Full end-to-end teacher workflow with the approved science fixture.
- [ ] Route-and-state visual-regression matrix at `1440px`, `1024px`, and
      `390px`.
- [ ] Automated accessibility scan plus documented manual keyboard, zoom,
      contrast, focus, and live-region review.
- [ ] Reduced-motion and theme-boundary tests.
- [ ] Long-content, maximum-scene-count, buffering, polling, and narrow-height
      stress tests.
- [ ] Lighthouse or equivalent route-level performance checks.
- [ ] Affected security, authorization, signed-media, token, paid-action,
      concurrency, idempotency, and immutable-data suites.
- [ ] Repository lint, typecheck, test, and build commands.
- [ ] `git diff --check`.

## Out of Scope

- New product features, marketing pages, admin dashboards, or collaboration.
- Rewriting domain services, contracts, providers, or the video theme.
- Silently accepting or regenerating visual baselines for known regressions.

## Story-Specific Notes

- This is the Product UI phase gate. It verifies ST-072 through ST-082 as one
  workflow and does not replace each story's focused testing.

## Implementation Checklist

- [ ] Inspect the current repository, all Product UI stories, and their Dev Agent
      Records.
- [ ] Write a short implementation plan listing the route matrix, fixtures,
      tools, commands, risks, and pass criteria.
- [ ] Implement only this story's scope.
- [ ] Keep visual fixtures deterministic and free of secrets or private content.
- [ ] Run every required automated and manual check.
- [ ] Record every accepted exception with evidence and a follow-up owner.
- [ ] Self-review the complete diff for scope creep and baseline laundering.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing or has an explicitly
      accepted environment-bound exception.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] No unresolved serious accessibility, visual, responsive, performance,
      security, or data-integrity regression remains in Product UI scope.
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
