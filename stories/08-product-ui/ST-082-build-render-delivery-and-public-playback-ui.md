---
story_id: ST-082
title: "Build Render, Delivery, and Public Playback UI"
phase: "08 - Product UI"
status: Ready
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

- [ ] Restyle the project render route as a Studio Daylight delivery board with
      the latest render as the dominant record and a contextual information rail.
- [ ] Present not-ready, eligible, queued, running, retry-wait, completed,
      failed, terminal-failure, deleted-project, and refresh states from current
      render and validation data.
- [ ] Display real progress only when the backend supplies it, with clear current
      work and safe next action.
- [ ] Show completed thumbnail, created time, duration, file size, codec,
      resolution, and download actions only when real values exist.
- [ ] Group MP4, captions, narration, and storyboard exports under one Downloads
      section with per-file availability and failure state.
- [ ] Keep older renders in a quieter history region and do not present them as
      equal to the selected latest render.
- [ ] Present share-link creation, copy confirmation, existing links, expiry when
      supported, and revocation in a separate permission-focused section.
- [ ] Require a named confirmation before revocation and show immediate revoked
      state without exposing the raw token again.
- [ ] Restyle `/share/[token]` as a Focus Studio public theater that exposes only
      approved minimal metadata, thumbnail, captions, and video playback.
- [ ] Design missing, malformed, expired, revoked, deleted, media-failure, and
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

- [ ] The latest render and its authoritative state are visually dominant, while
      older renders remain available as history.
- [ ] Start, progress, retry, completion, terminal failure, and refresh states
      survive reload and expose only valid actions.
- [ ] Available downloads use real metadata and signed access without exposing
      storage details.
- [ ] Share creation, copy, list, and revoke behavior remain secure, and
      revocation requires a named confirmation.
- [ ] Public playback shows only approved minimal data and safely handles missing,
      malformed, expired, revoked, deleted, and media-failure states.
- [ ] Desktop, tablet, mobile, keyboard, reduced-motion, and 200 percent zoom
      behavior remains complete for teacher and public surfaces.

## Required Tests

- [ ] Existing render, eligibility, idempotency, progress, retry, download,
      export, share, revocation, rate-limit, public-data-minimization, and
      authorization tests remain passing.
- [ ] Delivery-board state Playwright tests.
- [ ] Download availability and signed-link UI tests.
- [ ] Share creation, copy, revoke-confirmation, and revoked-state tests.
- [ ] Public playback success and unavailable-state tests.
- [ ] Desktop, tablet, mobile, and reduced-motion screenshots for teacher and
      public routes with token-safe fixtures.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New render formats, direct publishing, LMS embedding, passwords, comments, or
  public source citations.
- Changing render, export, token, or retention contracts.
- A generic activity feed or analytics dashboard.

## Story-Specific Notes

- Technical guide references: E17, E18, E21, job state 5.2, API rules 6.1,
  storage rules 6.2, and frontend state guidance 11.2.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests,
      security risks, and token-safe visual fixtures.
- [ ] Implement only this story's scope.
- [ ] Preserve immutable render inputs, signed access, token minimization,
      explicit paid actions, and authorization.
- [ ] Run required automated, security, accessibility, media, and visual tests.
- [ ] Self-review data minimization, action eligibility, failure disclosure, and
      mobile delivery behavior.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No render, export, token, signed-media, cost, or authorization regression
      remains.
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
