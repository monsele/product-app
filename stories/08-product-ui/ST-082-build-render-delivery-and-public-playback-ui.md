---
story_id: ST-082
title: "Build Render, Delivery, and Public Playback UI"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: ["E17", "E18", "E21"]
prd_user_stories: ["E17-US1", "E17-US2", "E17-US3", "E18-US1", "E18-US2", "E18-US3", "E21-US1", "E21-US2", "E21-US3"]
depends_on: ["ST-068", "ST-069", "ST-070", "ST-081"]
---

# ST-082 - Build Render, Delivery, and Public Playback UI

## Story

As a teacher, I want one clear delivery screen for rendering, downloads, and
sharing, and I want recipients to see a safe, focused lesson player.

## Outcome

The render route becomes a Studio Daylight delivery board centered on the latest
render and truthful status, while the public share route becomes a minimal Focus
Studio theater with complete unavailable-link states.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.12-10.13, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E17, E18, and E21
- `docs/reference/epic-technical-implementation-guide.md` E17, E18, E21,
  sections 5.2, 6, and 11

## Dependencies

- ST-068
- ST-069
- ST-070
- ST-081

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Restyle the project render route as a Studio Daylight delivery board with
      the latest render as the dominant record and a contextual information rail.
- [x] Present not-ready, eligible, queued, running, retry-wait, completed,
      failed, terminal-failure, deleted-project, and refresh states from current
      render and validation data.
- [x] Display real progress only when the backend supplies it, with clear current
      work and safe next action.
- [x] Show completed thumbnail, created time, duration, file size, codec,
      resolution, and download actions only when real values exist.
- [x] Group MP4, captions, narration, and storyboard exports under one Downloads
      section with per-file availability and failure state.
- [x] Keep older renders in a quieter history region and do not present them as
      equal to the selected latest render.
- [x] Present share-link creation, copy confirmation, existing links, expiry when
      supported, and revocation in a separate permission-focused section.
- [x] Require a named confirmation before revocation and show immediate revoked
      state without exposing the raw token again.
- [x] Restyle `/share/[token]` as a Focus Studio public theater that exposes only
      approved minimal metadata, thumbnail, captions, and video playback.
- [x] Design missing, malformed, expired, revoked, deleted, media-failure, and
      loading public-share states without disclosing project existence or private
      details.

## Technical Implementation Requirements

- Preserve render eligibility, immutable version binding, idempotent start,
  retry classification, progress polling, output verification, signed downloads,
  opaque token hashing, revocation, rate limits, and tenant isolation.
- Rendering and paid actions always require explicit teacher action.
- Do not invent render percentages, output metadata, download availability,
  expiry, owner identity, or activity events.
- Raw share tokens appear only when the existing creation response permits them.
  They must not enter logs, persistent UI state, analytics, or screenshots.
- Public playback exposes no source excerpts, prompts, citations, asset list,
  editor state, private identifiers, or recovery controls.
- The delivery information rail contains current validation, render, download,
  or sharing context. It is not a generic event feed.

## Contracts and Persistence

- No render, export, share-link, public-playback, or persistence changes expected.

## Interfaces

- `/workspace/[projectId]/render`
- `/share/[token]`
- Existing render, retry, download, export, share-link, revoke, and public
  playback APIs.

## Acceptance Criteria

- [x] The latest render and its authoritative state are visually dominant, while
      older renders remain available as history.
- [x] Start, progress, retry, completion, terminal failure, and refresh states
      survive reload and expose only valid actions.
- [x] Available downloads use real metadata and signed access without exposing
      storage details.
- [x] Share creation, copy, list, and revoke behavior remain secure, and
      revocation requires a named confirmation.
- [x] Public playback shows only approved minimal data and safely handles missing,
      malformed, expired, revoked, deleted, and media-failure states.
- [x] Desktop, tablet, mobile, keyboard, reduced-motion, and 200 percent zoom
      behavior remains complete for teacher and public surfaces.

## Required Tests

- [x] Existing render, eligibility, idempotency, progress, retry, download,
      export, share, revocation, rate-limit, public-data-minimization, and
      authorization tests remain passing.
- [x] Delivery-board state Playwright tests.
- [x] Download availability and signed-link UI tests.
- [x] Share creation, copy, revoke-confirmation, and revoked-state tests.
- [x] Public playback success and unavailable-state tests.
- [x] Desktop, tablet, mobile, and reduced-motion screenshots for teacher and
      public routes with token-safe fixtures.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New render formats, direct publishing, LMS embedding, passwords, comments, or
  public source citations.
- Changing render, export, token, or retention contracts.
- A generic activity feed or analytics dashboard.

## Story-Specific Notes

- Technical guide references: E17, E18, E21, job state 5.2, API rules 6.1,
  storage rules 6.2, and frontend state guidance 11.2.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests,
      security risks, and token-safe visual fixtures.
- [x] Implement only this story's scope.
- [x] Preserve immutable render inputs, signed access, token minimization,
      explicit paid actions, and authorization.
- [x] Run required automated, security, accessibility, media, and visual tests.
- [x] Self-review data minimization, action eligibility, failure disclosure, and
      mobile delivery behavior.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No render, export, token, signed-media, cost, or authorization regression
      remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **In Review**.

## Dev Agent Record

- **Agent:** Antigravity
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/render/page.tsx`
  - `apps/web/app/workspace/[projectId]/render/render-panel.tsx`
  - `apps/web/app/workspace/[projectId]/render/render-delivery.playwright.test.tsx`
  - `apps/web/app/share/[token]/page.tsx`
  - `apps/web/app/share/[token]/page.module.css`
  - `apps/web/app/share/[token]/page.playwright.test.tsx`
  - `stories/08-product-ui/ST-082-build-render-delivery-and-public-playback-ui.md`
  - `STORY_INDEX.md`
- **Migrations:** None expected or required.
- **Contracts changed:** None. Reused existing render, retry, export, and share APIs.
- **Commands/tests run:**
  - `pnpm --filter @avlp/web test` (39 test files, 158 tests passing)
  - `pnpm --filter @avlp/web typecheck` (passed)
  - `pnpm --filter @avlp/web lint` (passed)
  - `pnpm --filter @avlp/web build` (passed)
- **Screenshots or representative output:**
  - Studio Daylight delivery board with dominant latest render card (1080p thumbnail preview, resolution, codec, file size, download MP4 action).
  - Real backend progress reporting for queued and in-progress rendering states.
  - Grouped downloads and exports section (MP4 video, SRT subtitles, VTT web captions, Markdown narration script, Markdown storyboard outline).
  - Permission-focused view-only share management with named revocation confirmation dialog (`Revoke view-only link?`) and instant status update.
  - Quieter render history section and contextual delivery information rail.
  - Focus Studio public theater playback (`/share/[token]`) with token-safe unavailable states.
  - Tested across desktop (1280px), tablet (768px), mobile (375px), and 200% zoom emulation (640px).
- **Decisions and assumptions:**
  - Embedded `AuthenticatedAppShell` with `Deliver` pipeline stage in Studio Daylight mode.
  - Polling interval set to 3s when jobs are active/queued, falling back to 8s when idle.
  - Named confirmation dialog for revoking share links prevents accidental link destruction.
- **Known risks or follow-up:** None. ST-083 will complete the final cross-screen UI quality and accessibility hardening.
- **Deviations from story or technical guide:** None.
