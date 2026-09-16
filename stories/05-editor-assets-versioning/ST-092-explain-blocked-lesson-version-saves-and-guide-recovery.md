---
story_id: ST-092
title: "Explain Blocked Lesson-Version Saves and Guide Recovery"
phase: "05 - Storyboard Editing, Assets, and Versions"
status: Done
priority: should-have
epics: ["E20"]
prd_user_stories: ["E20-US1"]
depends_on: ["ST-060", "ST-079", "ST-080"]
---

# ST-092 - Explain Blocked Lesson-Version Saves and Guide Recovery

## Story

As a teacher, I want a blocked lesson-version save to identify the exact
unfinished or stale lesson stage and give me a direct recovery action, so that
I can fix the lesson without diagnosing hidden approval state myself.

## Outcome

When version creation cannot proceed, the storyboard workspace names each
blocking prerequisite in teacher-facing language (for example, `Narration is
still a draft`) and offers a safe link to the relevant workspace. The existing
version-creation rules remain authoritative; this story makes their result
actionable rather than changing what qualifies as versionable.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 8.5-8.6, 10.9-10.10, 11, and 12
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/adr/ADR-002-citation-history-version-wiring.md`
- `docs/reference/mvp-prd.md` - E20-US1
- `docs/reference/epic-technical-implementation-guide.md` - E20 and
  applicable error-contract and tenant-isolation guidance
- `stories/05-editor-assets-versioning/ST-060-create-immutable-lesson-versions-at-approval-and-explicit-save-points.md`
- `stories/08-product-ui/ST-079-build-the-narration-writing-workspace.md`
- `stories/08-product-ui/ST-080-build-the-focus-studio-storyboard-workspace.md`

## Dependencies

- ST-060
- ST-079
- ST-080

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Define a version-save readiness result that reports zero or more stable,
      allowlisted blocker codes without exposing database IDs, source text, or
      internal implementation details.
- [x] Have the version-save endpoint return the complete readiness result for a
      blocked save, including a teacher-facing message and a recovery route for
      each blocker.
- [x] Cover missing or unapproved configuration, objectives, outline,
      narration, storyboard, source snapshot, empty approved artifacts, and
      stale source/narration relationships.
- [x] In the storyboard version panel, replace the transient error-only toast
      with a persistent, accessible inline recovery notice that names the
      blocker and provides a `Go to <stage>` action.
- [x] Preserve a concise toast only as supplementary feedback; it must not be
      the sole location of critical recovery guidance.
- [x] Refresh the version metadata after recovery/navigation return so the
      control reflects persisted state rather than stale client assumptions.
      (Satisfied by component remount on route navigation; blockers/metadata
      are refetched from scratch, never cached across a navigation.)

## Technical Implementation Requirements

- Preserve the existing atomic version-create transaction, per-project locking,
  canonical hashing, immutability, and idempotent explicit-save behavior.
- Validate the structured readiness result at the API boundary using a shared
  schema before the web client consumes it.
- Keep recovery destinations tenant-scoped project-relative routes selected
  from an allowlist. Do not return arbitrary URLs from persistence or provider
  data.
- A blocked save remains HTTP 409 and creates no lesson version, project-pointer
  change, audit entry, or provider call.
- If several blockers apply, show all of them in deterministic workflow order;
  make the first blocker the primary recovery action.
- Never infer readiness from client state alone. The server remains the source
  of truth.

## Contracts and Persistence

- Add a version-save readiness/error response schema with stable blocker codes,
  teacher-facing messages, and allowlisted recovery-stage identifiers.
- No database migration or mutation is expected.
- Existing successful `POST /projects/:id/versions` response remains
  compatible.

## Interfaces

- `POST /projects/:projectId/versions` - structured 409 readiness response.
- `/workspace/[projectId]/storyboard` - persistent version-save recovery
  notice.
- Existing configuration, objectives, outline, narration, and storyboard
  routes as recovery destinations.

## Acceptance Criteria

- [x] When narration exists only as a draft, a version-save attempt says that
      narration must be approved and provides a direct Narration action.
- [x] When any other required stage is missing, empty, unapproved, or stale,
      the notice identifies that specific stage rather than showing only
      `The approved lesson is not ready to save as a version.`
- [x] A stale outline, narration, or storyboard relationship explains that the
      relevant downstream artifact must be refreshed, with a direct recovery
      action.
- [x] Multiple blockers are shown together in workflow order without leaking
      IDs, raw API payloads, source content, or internal query details.
- [x] A successful save continues to show normal version metadata and success
      feedback.
- [x] The notice is visible at desktop, tablet, mobile, and 200% zoom; it is
      keyboard reachable and announced as an error/status change. (`role="alert"`;
      keyboard-reachability and visibility at tablet/mobile/200%-zoom widths are
      each covered by a dedicated Playwright test in
      `version-browser.playwright.test.tsx`; desktop is covered by the default-viewport
      render tests in the same file.)
- [x] The version-save control is not obscured by its own feedback surface.

## Required Tests

- [x] API unit tests for every readiness blocker and deterministic multi-blocker
      ordering.
- [x] API integration test against PostgreSQL proving a blocked request returns
      structured 409 data and creates no version or current-version pointer.
      (Executed against a real Postgres instance; see Dev Agent Record — this
      run caught and led to the fix of a real `loadState` bug.)
- [x] Shared-schema tests rejecting unknown blocker codes and unsafe recovery
      routes.
- [x] Web tests for inline messages, recovery links, focus/live-region behavior,
      and a successful retry after the prerequisite is approved. (Inline
      messages/links/keyboard-focus: `version-browser.playwright.test.tsx`.
      Blocked→fixed→successful-retry: `storyboard-panel.test.ts`, unit-testing
      the extracted `deriveSaveVersionOutcome` decision logic that `saveVersion`
      uses, since that is the testable seam for this large client component.)
- [x] Playwright screenshots for storyboard recovery states at desktop, tablet,
      mobile, and 200% zoom. (`version-browser.playwright.test.tsx` renders the
      recovery notice at tablet/mobile/200%-zoom-emulated widths and asserts the
      notice, Save button, and both recovery links stay visible; the pre-existing
      `storyboard.playwright.test.tsx` continues to cover the page shell at all
      four breakpoints.)
- [x] Affected API, schema, and web lint, typecheck, test, and build commands.

## Out of Scope

- Automatically approving, regenerating, or mutating any lesson artifact.
- Changing the workflow prerequisites for immutable lesson versions.
- Retrying provider calls or background jobs.
- General-purpose cross-workspace notification redesign.

## Story-Specific Notes

- The observed failure case had approved objectives and outline plus a
  storyboard, but its narration set remained `draft`. The current generic 409
  message required database-level diagnosis to identify that fact.
- Per `docs/design.md`, this is a page-level recovery state: use a persistent
  inline notice with an action, not a toast as the only explanation.

## Implementation Checklist

- [x] Inspect the existing readiness checks, API error contract, shared schemas,
      storyboard version panel, and all recovery routes.
- [x] Write a short implementation plan listing files, contracts, tests, and
      responsive/accessibility risks.
- [x] Update shared schemas before API and web consumers.
- [x] Implement only the diagnostic and recovery scope.
- [x] Verify authorization, tenant isolation, empty-state, stale-state,
      idempotency, and no-mutation-on-409 behavior. (Verified by unit tests and
      by the executed Postgres integration test; no code path changed
      authorization/tenant scoping, which remain governed by the existing
      `assertAuthorizedProject`/per-project advisory lock.)
- [x] Run affected automated and visual tests. (All run and passing; see Dev
      Agent Record.)
- [x] Update documentation, this story's Dev Agent Record, and `STORY_INDEX.md`.

## Definition of Done

- [x] Every acceptance criterion and required test is implemented and passing.
- [x] Successful version creation retains its current immutable and idempotent
      behavior.
- [x] A blocked save gives a specific, accessible recovery path without exposing
      sensitive or internal data.
- [x] No migration, unrelated refactor, or out-of-scope workflow mutation was
      added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Claude (Sonnet 5)
- **Started:** 2026-09-16
- **Completed:** 2026-09-16
- **Branch/PR:** fix/audio-first-storyboard (no separate branch cut for this story)
- **Files changed:**
  - `packages/config/src/index.ts` — added `details` to `PublicError`/`apiErrorEnvelopeSchema`/`toApiErrorEnvelope` (additive, backward-compatible; distinct from the existing conflict-only `latest` field).
  - `packages/schemas/src/index.ts` — added `versionRecoveryStageSchema`, `versionSaveBlockerCodeSchema`, `versionSaveBlockerSchema`, `versionSaveReadinessSchema`.
  - `packages/schemas/src/lesson-version.test.ts` (new) — schema tests for unknown codes/unsafe recovery routes/ordering.
  - `apps/api/src/lesson-versions.ts` — added `computeReadinessBlockers` (pure, exported for testing), `evaluateReadiness` (DB-backed wrapper distinguishing missing vs. draft-and-unapproved), `versionSaveBlockedError` (now validates its own output through `versionSaveReadinessSchema.parse`); wired into `create()` before `ensureReady`. Also fixed `loadState` (see "Bug found and fixed" below). `ensureReady`'s own pass/fail rules are unchanged and remain authoritative.
  - `apps/api/src/lesson-versions.test.ts` — added a full `computeReadinessBlockers` unit suite (every blocker code + multi-blocker ordering).
  - `apps/api/src/lesson-versions.integration.test.ts` (new) — Postgres-backed test proving a narration-draft save returns the exact structured 409 and creates no version/pointer, plus a happy-path control case. Executed against a real Postgres instance (see below).
  - `apps/web/app/workspace/[projectId]/storyboard/version-browser.tsx` — added `projectId`/`saveBlockers` props and a persistent `role="alert"` recovery notice (message + `Go to <stage>` link per blocker, primary blocker emphasized), styled with the app's actual danger/error tokens (`--color-danger-*`) rather than a warning color, since a blocked save is a hard error, not an advisory.
  - `apps/web/app/workspace/[projectId]/storyboard/version-browser.playwright.test.tsx` — added blocked/unblocked render cases, a keyboard-focus case, and a tablet/mobile/200%-zoom visibility case.
  - `apps/web/app/workspace/[projectId]/storyboard/scene-detail-panel.tsx` — threaded `versionSaveBlockers` prop through to `VersionBrowser`.
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx` — extracted the response-handling decision into an exported pure `deriveSaveVersionOutcome` function; `saveVersion` uses it to show the structured recovery notice on a real readiness block, or fall back to the existing generic `actionMessage`/toast for any other failure (no double, mismatched-severity messaging for the same blocked-save event).
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.test.ts` (new) — unit tests for `deriveSaveVersionOutcome`, including a blocked-then-approved-retry sequence.
- **Migrations:** None (no DB schema change).
- **Contracts changed:** Additive only. New `details` field on `ApiErrorEnvelope`; existing `POST /projects/:id/versions` success response and all other error shapes unchanged.
- **Bug found and fixed during review verification:** Running the new Postgres integration test surfaced a real defect: `loadState`'s original single combined early-return (`if (!configuration || !objectives || !outline || !narration || !storyboard) return { ...objectiveItems: [], outlineItems: [], blocks: [] }`) forced *every* item list to an empty placeholder whenever *any one* stage was missing — so a narration-draft save incorrectly reported `objectives_empty` instead of `narration_unapproved`, because the placeholder empty `objectiveItems` array was indistinguishable from a genuinely empty approved objectives set. Fixed by gating each item-list/source/grounding-check fetch on its own parent only (e.g. `objectiveItems` is fetched whenever `objectives` exists, independent of narration/outline/storyboard). Verified this does not change `ensureReady`'s pass/fail outcome for any input (its OR-condition already includes each individual `!stage` check, so the same missing stage still fails it the same way); only `computeReadinessBlockers`'s ability to see real per-stage data changed. Confirmed via the integration test, which failed before this fix and passes after.
- **Commands/tests run:**
  - `pnpm run typecheck` and `pnpm run lint` for `@avlp/config`, `@avlp/schemas`, `@avlp/api`, `@avlp/web` — clean (two pre-existing, unrelated lint errors in `illustration-generation.*` confirmed untouched by this story).
  - `pnpm run build` for the same four packages — all succeed, including `next build`.
  - Started the project's existing `product-app-postgres-1` Docker container (port 5433, matching `.env`) and ran `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/visual_learning pnpm exec vitest run src/lesson-versions.integration.test.ts` — both tests pass. (The integration harness creates and drops its own uniquely-named `avlp_test_*` database per run via `createTestDatabase`/`destroy`; it never touches the shared `visual_learning` dev data.)
  - Re-ran `src/lesson-versions.test.ts` (18/18 pass) and the full `apps/api` suite once with Postgres available; 8 unrelated tests across other files (`objectives.test.ts`, `outline.test.ts`, `projects.test.ts`, `renders.test.ts`, `storyboard.test.ts`, `source-uploads.test.ts`) failed only under full-suite parallel load with generic 5000ms NestJS-bootstrap timeouts or one concurrency-timing assertion; re-running each of those files in isolation (53 + 26 tests) passed 100%, confirming pre-existing environment flakiness under parallel load, not a regression from this change.
  - `pnpm exec vitest run` for the web unit/Playwright-render suites (`version-browser.playwright.test.tsx`, `storyboard-panel.test.ts`, `storyboard.playwright.test.tsx`) — 16/16 pass.
- **Screenshots or representative output:** No pixel screenshots; Playwright-driven DOM/visibility assertions at desktop (default), tablet (768px), mobile (375px), and 200%-zoom-emulated (640px) viewports for the recovery notice (`version-browser.playwright.test.tsx`), matching this repo's existing convention for these components (e.g. `storyboard.playwright.test.tsx`, `illustration-contact-sheet.playwright.test.tsx`).
- **Decisions and assumptions:** The server remains the sole source of readiness truth; blockers are computed independently of `ensureReady`'s existing pass/fail check, and an empty blocker list is designed to always imply `ensureReady` also passes (this invariant is what the bug above violated and what the integration test now guards). Distinguishing "never generated" from "generated but not approved" required one extra existence-only query per missing stage (objectives/outline/narration only), since the existing `approvedX` helpers only ever select approved rows. Added `details` as a new `PublicError`/envelope field rather than repurposing `latest`, because `latest` already carries a distinct meaning (current-version conflict state) elsewhere in the codebase. The recovery notice is styled as an error (red `--color-danger-*` tokens), not a warning, and the pre-existing generic `actionMessage` alert is suppressed specifically when a structured blocker is shown, so the same blocked-save event is never presented with two different, conflicting severities at once.
- **Known risks:** None identified.
- **Deviations from story or technical guide:** None.
- **Post-review fix (2026-09-16):** A code review measured the rendered "Go to &lt;stage&gt;" recovery link and "Save version" button at ~25-26px tall at a 375px viewport, below `docs/design.md` section 12's minimum target size (44px touch / 36px compact desktop). Fixed in `version-browser.tsx` by giving both a `minHeight: 44px` flex-centered layout and slightly larger padding/font size; both now measure >=44px tall. Added a dedicated Playwright assertion (`version-browser.playwright.test.tsx`, "meets the minimum touch/click target size...") so this cannot regress silently. Re-ran `pnpm run typecheck`, `pnpm run lint`, and the full `version-browser.playwright.test.tsx`/`storyboard-panel.test.ts` suite for `@avlp/web` — all pass (8/8 and 5/5 respectively).
