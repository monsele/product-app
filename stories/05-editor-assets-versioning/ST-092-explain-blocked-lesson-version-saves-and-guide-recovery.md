---
story_id: ST-092
title: "Explain Blocked Lesson-Version Saves and Guide Recovery"
phase: "05 - Storyboard Editing, Assets, and Versions"
status: Ready
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

- [ ] Define a version-save readiness result that reports zero or more stable,
      allowlisted blocker codes without exposing database IDs, source text, or
      internal implementation details.
- [ ] Have the version-save endpoint return the complete readiness result for a
      blocked save, including a teacher-facing message and a recovery route for
      each blocker.
- [ ] Cover missing or unapproved configuration, objectives, outline,
      narration, storyboard, source snapshot, empty approved artifacts, and
      stale source/narration relationships.
- [ ] In the storyboard version panel, replace the transient error-only toast
      with a persistent, accessible inline recovery notice that names the
      blocker and provides a `Go to <stage>` action.
- [ ] Preserve a concise toast only as supplementary feedback; it must not be
      the sole location of critical recovery guidance.
- [ ] Refresh the version metadata after recovery/navigation return so the
      control reflects persisted state rather than stale client assumptions.

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

- [ ] When narration exists only as a draft, a version-save attempt says that
      narration must be approved and provides a direct Narration action.
- [ ] When any other required stage is missing, empty, unapproved, or stale,
      the notice identifies that specific stage rather than showing only
      `The approved lesson is not ready to save as a version.`
- [ ] A stale outline, narration, or storyboard relationship explains that the
      relevant downstream artifact must be refreshed, with a direct recovery
      action.
- [ ] Multiple blockers are shown together in workflow order without leaking
      IDs, raw API payloads, source content, or internal query details.
- [ ] A successful save continues to show normal version metadata and success
      feedback.
- [ ] The notice is visible at desktop, tablet, mobile, and 200% zoom; it is
      keyboard reachable and announced as an error/status change.
- [ ] The version-save control is not obscured by its own feedback surface.

## Required Tests

- [ ] API unit tests for every readiness blocker and deterministic multi-blocker
      ordering.
- [ ] API integration test against PostgreSQL proving a blocked request returns
      structured 409 data and creates no version or current-version pointer.
- [ ] Shared-schema tests rejecting unknown blocker codes and unsafe recovery
      routes.
- [ ] Web tests for inline messages, recovery links, focus/live-region behavior,
      and a successful retry after the prerequisite is approved.
- [ ] Playwright screenshots for storyboard recovery states at desktop, tablet,
      mobile, and 200% zoom.
- [ ] Affected API, schema, and web lint, typecheck, test, and build commands.

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

- [ ] Inspect the existing readiness checks, API error contract, shared schemas,
      storyboard version panel, and all recovery routes.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      responsive/accessibility risks.
- [ ] Update shared schemas before API and web consumers.
- [ ] Implement only the diagnostic and recovery scope.
- [ ] Verify authorization, tenant isolation, empty-state, stale-state,
      idempotency, and no-mutation-on-409 behavior.
- [ ] Run affected automated and visual tests.
- [ ] Update documentation, this story's Dev Agent Record, and `STORY_INDEX.md`.

## Definition of Done

- [ ] Every acceptance criterion and required test is implemented and passing.
- [ ] Successful version creation retains its current immutable and idempotent
      behavior.
- [ ] A blocked save gives a specific, accessible recovery path without exposing
      sensitive or internal data.
- [ ] No migration, unrelated refactor, or out-of-scope workflow mutation was
      added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Unassigned
- **Started:** Not started
- **Completed:** Not started
- **Branch/PR:** Not started
- **Files changed:** Not started
- **Migrations:** None expected
- **Contracts changed:** Not started
- **Commands/tests run:** Not started
- **Screenshots or representative output:** Not started
- **Decisions and assumptions:** The server owns readiness evaluation; the UI
  only presents an allowlisted, structured result.
- **Known risks:** The existing generic `PublicError` shape may need a
  backward-compatible structured-details extension.
- **Deviations from story or technical guide:** None.
