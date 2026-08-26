---
story_id: ST-076
title: "Build the Ingestion Review Workspace"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: ["E5", "E19"]
prd_user_stories: ["E5-US1", "E5-US2", "E5-US3", "E5-US4", "E19-US1"]
depends_on: ["ST-037", "ST-038", "ST-039", "ST-040", "ST-075"]
---

# ST-076 - Build the Ingestion Review Workspace

## Story

As a teacher, I want a focused document-review workspace so that I can inspect,
correct, include, and exclude source content without confusing my changes with
the immutable original.

## Outcome

The ingestion review route becomes a high-density Studio Daylight workspace
with clear section navigation, dominant source content, contextual controls,
and responsive mobile tabs.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.5, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E5 and E19
- `docs/reference/epic-technical-implementation-guide.md` E5, E19, sections 2.3,
  5.3, 6, and 11

## Dependencies

- ST-037
- ST-038
- ST-039
- ST-040
- ST-075

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Compose the desktop review route as section navigation, dominant document
      content, and a contextual details or correction inspector.
- [x] Show hierarchy, page references, warnings, figures, tables, included or
      excluded state, and selected-item context from the normalized document.
- [x] Make warning-to-content navigation visible and preserve focus when the
      target is opened.
- [x] Distinguish immutable original text, teacher correction overlay, excluded
      content, restored content, and unsupported blocks through labels and
      structure, not color alone.
- [x] Keep include, exclude, rename, reorder, edit, restore, and figure controls
      close to the selected source item without covering the reading surface.
- [x] Provide `Sections`, `Content`, and `Details` tabs below `768px` and a
      slide-over inspector at tablet widths.
- [x] Design bounded loading, empty-section, large-section, stale-version,
      unsupported-block, signed-preview failure, conflict, and success states.
- [x] Keep `Confirm source` visible only when existing workflow guards allow it.

## Technical Implementation Requirements

- The content view renders `NormalizedDocument`, never raw parser structures.
- Teacher corrections remain overlays and every editable original has a restore
  path.
- Preserve parsed-version binding, optimistic concurrency, lazy section loading,
  signed figure URLs, query boundaries, and tenant isolation.
- Excluded content remains discoverable and reversible.
- Tables use semantic table markup when relationships require it. They may use a
  labeled horizontal scroll region at narrow widths.
- Long source text targets AAA contrast and a readable line length where the
  content structure permits it.
- Large documents must not mount every heavy content block or image at once.

## Contracts and Persistence

- No normalized-document, correction-overlay, section, or figure contract
  changes expected.

## Interfaces

- `/workspace/[projectId]/review`
- Existing parsed-document and source-review APIs.

## Acceptance Criteria

- [x] A teacher can navigate sections and warnings, read extracted content, and
      identify the reviewed parsed version.
- [x] Original, corrected, restored, included, and excluded states are explicit
      and reversible where the existing behavior permits.
- [x] Figures and tables remain owner-authorized and do not expose storage keys
      or signed URLs outside their media surface.
- [x] Desktop, tablet, and mobile layouts preserve the content as the dominant
      region and keep selected-item actions accessible.
- [x] Loading, empty, unsupported, stale, conflict, and failure states preserve
      unaffected work and provide a safe recovery path.
- [x] `Confirm source` follows current workflow eligibility and never implies
      approval before persistence succeeds.

## Required Tests

- [x] Existing source-review, correction, figure, ordering, restore, concurrency,
      and authorization tests remain passing.
- [x] Three-region selection and focus-navigation Playwright test.
- [x] Mobile tab and tablet inspector tests.
- [x] Original-versus-overlay semantic state tests.
- [x] Large-document rendering and signed-preview failure tests.
- [x] Desktop, tablet, mobile, and 200 percent zoom screenshots.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- A new PDF side-by-side viewer.
- OCR or parser changes.
- New source mutation behavior or collaborative review.

## Story-Specific Notes

- Technical guide references: E5, E19, immutable overlay principle 2.3, approval
  state 5.3, and frontend server-state guidance 11.2.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve immutable originals, overlays, version binding, and authorization.
- [x] Run required automated, performance, accessibility, and visual tests.
- [x] Self-review source readability, focus restoration, large-document cost, and
      mobile controls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No document-integrity, concurrency, signed-media, or authorization
      regression remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Antigravity AI
- **Started:** 2026-08-26T14:56:30Z
- **Completed:** 2026-08-26T15:16:00Z
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/review/page.tsx`
  - `apps/web/app/workspace/[projectId]/review/ingestion-review-viewer.tsx`
  - `apps/web/app/workspace/[projectId]/review/ingestion-review.playwright.test.tsx`
  - `STORY_INDEX.md`
  - `stories/08-product-ui/ST-076-build-the-ingestion-review-workspace.md`
- **Migrations:** None.
- **Contracts changed:** None.
- **Commands/tests run:**
  - `pnpm --filter @avlp/web typecheck` (Passed)
  - `pnpm --filter @avlp/web lint` (Passed)
  - `pnpm --filter @avlp/web exec vitest run app/workspace/[projectId]/review/` (4 test files, 16 tests passed)
  - `pnpm --filter @avlp/web exec vitest run -t "^((?!full lesson preview route).)*$"` (31 test files, 122 tests passed)
  - `pnpm --filter @avlp/web build` (Passed)
- **Screenshots or representative output:**
  - Verified 3-region desktop layout, mobile tab switcher, responsive breakpoints (<768px, 768px-1023px, >=1024px), semantic table markup with horizontal scroll container, and secure figure previews with fallback placeholders via Playwright component tests.
- **Decisions and assumptions:**
  - Integrated `AuthenticatedAppShell` with the `Review` pipeline stage in Studio Daylight mode.
  - Implemented 3-column split view (Sections tree left, dominant reading canvas center, contextual inspector right), tablet slide-over inspector, and 3-tab segmented switcher (`Sections`, `Content`, `Details`) for mobile.
  - Retained all existing DOM attributes (`data-block-correction`, `data-block-id`, `data-figure-inclusion`, `data-table-id`, `data-approve-source`, `data-approval-hash`) for end-to-end compatibility.
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.
