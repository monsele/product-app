# Premium interface refinement - 6 October 2026

## Scope and plan

Product-owner requested visual and interaction refinement of the existing app using
[apple-design](../.agents/skills/apple-design/SKILL.md). This is one maintenance
increment against ST-083, on `fix/premium-app-design`; ST-082 is Done. Historical
story completion records remain unchanged.

Plan, recorded before implementation: audit the existing routes and approved design
system; refine shared chrome, typography and controls; adjust page-specific reading
and canvas compositions; verify desktop/phone layouts and keyboard interactions;
run web checks and record any remaining failures.

## Design decisions

- Retain the approved Geist family, violet accent, 16px major surfaces, and separate
  Studio Daylight and Focus Studio modes. No product renaming or lesson-video theme changes.
- Use restrained translucent material for sticky chrome and temporary drawers.
  Forms, source material and scripts remain opaque. Reduced transparency and increased
  contrast preferences switch chrome to solid material.
- Use size-specific tracking and rem-based shared type roles. Distinguish quiet
  resting surfaces from elevated overlays with two separate shadow tokens.
- Keep feedback immediate on press. Dialogs and drawers use critically damped springs
  with symmetric entry and exit; reduced motion uses opacity changes. The root motion
  provider also honours the preference for existing auth and board animations.
- Give reading/writing surfaces a wide content column and a compact contextual rail,
  then stack them on smaller screens. Keep the storyboard canvas dominant.
- Preserve actual workflow states, form actions, labels, validations and API contracts.
  The pipeline exposes its current step and completion states to assistive technology.

## Route review matrix

| Routes | Presentation and interaction work |
| --- | --- |
| Sign in, register, forgot/reset password | Shared reassurance material, quieter controls and tighter heading typography; existing illustrations retained. |
| Workspace | Lighter card borders, quieter icon treatment, restrained elevation and faster arrival hierarchy. |
| Source upload | Flexible source column and compact requirements rail; eliminate fixed minimum-width overflow. |
| Source review | Narrower section/inspector rails with more document space; tablet fallback begins before the three regions become cramped. |
| Setup | Prominent title, single form column with compact desktop summary; responsive stacking. |
| Objectives, outline, narration | Shared responsive scaffold, stronger headings, wider reading column, sticky compact context, single main landmark. |
| Storyboard and candidate review | Less boxed header, refined panels and stage elevation; candidate components retain their existing design and domain controls. |
| Preview | Stronger title, consistent control radii and quieter action elevation; retain all media and validation controls. |
| Render/delivery | Stronger title, restrained elevation and dynamic viewport height; existing download/share behavior retained. |
| Shared lesson | Match product typography and heading tracking; dark theater canvas rather than pure black. |
| Prompt-to-video | Match page and card typography, borders/elevation and phone spacing; existing request, budget, approval and delivery states retained. |
| Compare and internal proof previews | Audited existing compositions; receive shared typography/control/chrome refinements where used; no changes inside generated lesson output. |

## Shared interaction repairs

Dialogs and drawers contain keyboard focus, lock background scrolling, have unique
accessible title IDs, dismiss with Escape and restore focus to the invoking control.
Project menus support arrow keys, Home/End and Escape; tabs use arrow-key selection
and one tab stop. Pipeline links close the mobile drawer when selected. Add a
keyboard-visible skip-to-content link.

Two small existing defects found by validation were repaired: missing React imports
in the shared illustrations under the component-test JSX transform, and an
unqualified browser timer in prompt-to-video retries.

## Completion record

- Files changed: global product tokens/styles; root motion provider; application
  header, shell, page container and pipeline; review scaffold; shared buttons,
  choices, menus, tabs, overlays and focus hook; shared authentication illustrations;
  workspace/auth/public-share CSS; source intake/review, configuration, storyboard,
  preview, delivery and prompt-to-video presentation; focused browser regressions.
- Migrations: none.
- Public/domain contract changes: none. No dependency changes or paid provider calls.
- Representative output: `output/playwright/premium-*.png` (deterministic mock data).
- Validation so far: web lint and TypeScript checks pass; the 17-test cross-screen
  accessibility, responsive, zoom and theme matrix passes after repairing the
  illustration imports. Additional results are recorded below.
- Build performance: optimized Phosphor package imports in Next configuration.
  Development compilation previously traversed over 10,000 modules on initial
  routes; the optimized UI harness reports 4,867. This is a compilation observation,
  not a production Core Web Vitals measurement.
- Risks: translucent materials depend on browser support and have opaque fallbacks.
  Development-server timings are unsuitable for production Web Vitals conclusions.
- Deviation: owner-authorized cross-page maintenance increment, rather than a new
  feature story. Existing story statuses are not used to imply new release approval.


## Verification results

- `pnpm --filter @avlp/web lint` - passed.
- `pnpm --filter @avlp/web typecheck` - passed after the final layout adjustments.
- `pnpm --filter @avlp/web exec vitest run --exclude '**/*.playwright.test.tsx'
  --exclude '**/*.e2e.test.ts' --maxWorkers=2 --fileParallelism=false` - 39 files,
  254 tests passed, including storyboard version-save recovery.
- `pnpm --filter @avlp/web exec vitest run app/cross-screen-quality.playwright.test.tsx
  --maxWorkers=1 --fileParallelism=false` - all 17 tests passed: accessibility,
  desktop/tablet/phone, zoom and theme coverage.
- `pnpm exec playwright test --config output/playwright/premium.config.ts
  --reporter=line` - all four hydrated UI-harness tests passed, including focus
  containment/restoration and reduced-motion keyboard tab navigation. This local
  QA config reuses the running app to avoid starting a second dev server.
- Focused Prettier checks - passed.
- `git -c core.whitespace=cr-at-eol diff --check` - passed. The repository contains
  mixed Windows line endings; unchanged line endings were preserved.

The initial unrestricted web test run was stopped after substantial host contention;
its cross-screen failures from missing React imports were corrected and verified in
isolation. A first broader hydrated run encountered cold-compilation timeouts and
older expectations (for example, old setup/password headings and a strict 500 status
for streamed Next errors). That broader suite is not reported as passing. The current
mock API also lacks some newer setup/share endpoints, so several live page captures
represent loading, unavailable or failure states. Successful component-state coverage
comes from the passing cross-screen/fixture suites. No real provider generation or
production deployment was performed. No production Web Vitals claim is made.

A delivery layout defect found during review was repaired: the information rail now
stacks below the delivery board at tablet/phone widths rather than squeezing it into
a narrow horizontal region. The setup summary sits below the sticky header.


- `pnpm --filter @avlp/web build --no-lint` - passed: optimized compilation,
  type validation, all 16 static pages and final build traces completed. Lint was
  run separately and passed. The build includes every existing application route.

## Changed files

- `STORY_INDEX.md`
- `apps/web/app/auth-aside.tsx`
- `apps/web/app/auth.module.css`
- `apps/web/app/globals.css`
- `apps/web/app/layout.tsx`
- `apps/web/app/share/[token]/page.module.css`
- `apps/web/app/workspace/[projectId]/configuration/configuration-workspace.tsx`
- `apps/web/app/workspace/[projectId]/one-shot/one-shot-workspace.tsx`
- `apps/web/app/workspace/[projectId]/one-shot/one-shot.module.css`
- `apps/web/app/workspace/[projectId]/preview/preview-player.tsx`
- `apps/web/app/workspace/[projectId]/render/render-panel.tsx`
- `apps/web/app/workspace/[projectId]/review/ingestion-review-viewer.tsx`
- `apps/web/app/workspace/[projectId]/storyboard/storyboard.module.css`
- `apps/web/app/workspace/[projectId]/upload/source-intake-workspace.tsx`
- `apps/web/app/workspace/create-lesson-art.tsx`
- `apps/web/app/workspace/workspace.module.css`
- `apps/web/components/layout/app-header.module.css`
- `apps/web/components/layout/app-shell.tsx`
- `apps/web/components/layout/information-rail.tsx`
- `apps/web/components/layout/page-container.tsx`
- `apps/web/components/layout/project-pipeline-rail.module.css`
- `apps/web/components/layout/project-pipeline-rail.tsx`
- `apps/web/components/review-editor/review-editor-scaffold.module.css`
- `apps/web/components/review-editor/review-editor-scaffold.tsx`
- `apps/web/components/ui/button.module.css`
- `apps/web/components/ui/choices.tsx`
- `apps/web/components/ui/dialog.tsx`
- `apps/web/components/ui/drawer.tsx`
- `apps/web/components/ui/menu.tsx`
- `apps/web/components/ui/motion-preferences.tsx`
- `apps/web/components/ui/overlay.module.css`
- `apps/web/components/ui/tabs.module.css`
- `apps/web/components/ui/tabs.tsx`
- `apps/web/components/ui/use-modal-focus.ts`
- `apps/web/next.config.ts`
- `docs/design.md`
- `docs/premium-app-design-review.md`
- `e2e/ui-design-preview.spec.ts`
- `stories/08-product-ui/ST-083-complete-cross-screen-ui-quality-and-accessibility-hardening.md`
