---
story_id: ST-076
title: "Build the Ingestion Review Workspace"
phase: "08 - Product UI"
status: Ready
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

- [ ] Compose the desktop review route as section navigation, dominant document
      content, and a contextual details or correction inspector.
- [ ] Show hierarchy, page references, warnings, figures, tables, included or
      excluded state, and selected-item context from the normalized document.
- [ ] Make warning-to-content navigation visible and preserve focus when the
      target is opened.
- [ ] Distinguish immutable original text, teacher correction overlay, excluded
      content, restored content, and unsupported blocks through labels and
      structure, not color alone.
- [ ] Keep include, exclude, rename, reorder, edit, restore, and figure controls
      close to the selected source item without covering the reading surface.
- [ ] Provide `Sections`, `Content`, and `Details` tabs below `768px` and a
      slide-over inspector at tablet widths.
- [ ] Design bounded loading, empty-section, large-section, stale-version,
      unsupported-block, signed-preview failure, conflict, and success states.
- [ ] Keep `Confirm source` visible only when existing workflow guards allow it.

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

- [ ] A teacher can navigate sections and warnings, read extracted content, and
      identify the reviewed parsed version.
- [ ] Original, corrected, restored, included, and excluded states are explicit
      and reversible where the existing behavior permits.
- [ ] Figures and tables remain owner-authorized and do not expose storage keys
      or signed URLs outside their media surface.
- [ ] Desktop, tablet, and mobile layouts preserve the content as the dominant
      region and keep selected-item actions accessible.
- [ ] Loading, empty, unsupported, stale, conflict, and failure states preserve
      unaffected work and provide a safe recovery path.
- [ ] `Confirm source` follows current workflow eligibility and never implies
      approval before persistence succeeds.

## Required Tests

- [ ] Existing source-review, correction, figure, ordering, restore, concurrency,
      and authorization tests remain passing.
- [ ] Three-region selection and focus-navigation Playwright test.
- [ ] Mobile tab and tablet inspector tests.
- [ ] Original-versus-overlay semantic state tests.
- [ ] Large-document rendering and signed-preview failure tests.
- [ ] Desktop, tablet, mobile, and 200 percent zoom screenshots.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- A new PDF side-by-side viewer.
- OCR or parser changes.
- New source mutation behavior or collaborative review.

## Story-Specific Notes

- Technical guide references: E5, E19, immutable overlay principle 2.3, approval
  state 5.3, and frontend server-state guidance 11.2.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve immutable originals, overlays, version binding, and authorization.
- [ ] Run required automated, performance, accessibility, and visual tests.
- [ ] Self-review source readability, focus restoration, large-document cost, and
      mobile controls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No document-integrity, concurrency, signed-media, or authorization
      regression remains.
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
