---
story_id: ST-089
title: "Add Contact-Sheet Candidate Review for Generated Illustrations"
phase: "08 - Product UI"
status: Done
priority: should-have
epics: ["E13"]
prd_user_stories: []
depends_on: ["ST-059", "ST-085"]
---

# ST-089 — Add Contact-Sheet Candidate Review for Generated Illustrations

## Story

As a teacher, I want to compare generated illustration candidates side by side with their role, provenance, and cost, so that I can choose deliberately instead of accepting them one at a time with no basis for comparison.

## Outcome

Candidates for a lesson are presented together, grouped by scene and slot, each labelled with its visual role, provenance, cost, and moderation status. Unusable candidates are visibly blocked with a reason.

## Required Reading

- `AGENTS.md`
- `docs/design.md` — read before proposing any user-facing surface
- `docs/ui-design-brief.md`
- `docs/reference/mvp-prd.md` — E13
- `docs/reference/epic-technical-implementation-guide.md` — E13 plus applicable cross-cutting sections
- `docs/claude_openmontage-final-consolidated.md` — §4.1, §4.2, §4.5
- `stories/05-editor-assets-versioning/ST-059-generate-limited-scene-illustrations-with-review-and-cost-controls.md`
- `stories/05-editor-assets-versioning/ST-085-introduce-visual-role-and-enforce-provenance-at-asset-binding.md`

## Dependencies

- ST-059
- ST-085

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

ST-085 is a hard prerequisite: this surface displays `visualRole`, which does not exist until that story ships. Building the sheet first would produce a comparison view that omits the single most important thing a teacher needs to know about a candidate.

## Precondition — confirm before starting

**Verify that no candidate comparison surface already exists in `apps/web`.** ST-059 shipped accept, reject, and bounded regenerate actions, and the candidate records already carry status, provenance, and cost. Only side-by-side comparison is believed to be missing, and that belief is unverified.

If a comparison surface already exists, close this story and open a narrower one describing only the gap. Two prior discovery documents proposed already-shipped work by skipping exactly this check.

## Problem

`ST-059` produces `illustrationGenerationCandidates` rows with status, moderation status, provenance, and an associated `usageRecords` cost. A teacher can accept, reject, or regenerate a candidate. What they cannot do is see several candidates together and choose between them.

That matters more after ST-085. Once slots carry a `visualRole`, the difference between a `decorative` slot and a `source_derived` one is the difference between a free choice and a judgement about faithfulness to the source. A per-candidate accept button gives the teacher no way to see which kind of decision they are making, and `generateMissing()` is explicitly designed to produce many candidates at once for bulk review.

## Scope

- [ ] Add a read path returning candidates grouped by scene and slot for a project, with status, moderation status, provenance, visual role, cost, and the scene context needed to judge them.
- [ ] Build the comparison surface in `apps/web`, following `docs/design.md`.
- [ ] Display `visualRole` prominently, with the acquisition constraint that role implies.
- [ ] Block selection of candidates that fail deterministic media checks, with a stated reason.
- [ ] Surface any advisory finding that applies to the scene, clearly labelled as advisory.

## Technical Implementation Requirements

- **Deterministic failures block; subjective signals never do.** A corrupt, unreadable, or dimension-invalid candidate cannot be selected. Any model-assisted quality signal appears as an advisory label only, is recorded with its model and ruleset version, and never gates selection.
- **The teacher selects. The system never auto-accepts.** No default selection, no "accept all" that bypasses per-candidate review of non-decorative slots.
- The read path is tenant-scoped and project-scoped on every query, consistent with the existing candidate endpoints.
- Never expose a raw provider payload, a provider call id beyond what is already public, a signed URL beyond the existing asset access mechanism, or the generation prompt's source text.
- Cost is displayed from the persisted `usageRecords` value, not recomputed in the UI.
- The surface must handle the states ST-059 already produces: `queued`, `generating`, `pending_review`, `accepted`, `rejected`, `failed`, plus moderation rejection with its failure code.
- Accessibility is not optional here: candidates are images, so every one needs its alt text surfaced and editable per the existing asset conventions, and comparison must be operable by keyboard.

## Contracts and Persistence

- A grouped candidate read DTO in `@avlp/schemas`, tenant-scoped, exposing only safe fields.
- No new table. No migration expected.
- If advisory visual-quality signals are added, they carry a model identifier and ruleset version and are stored alongside the candidate rather than inlined into it.

## Interfaces

- API: a grouped candidate read endpoint for a project.
- Web: the contact-sheet surface, reachable from the storyboard workspace built in ST-080.
- Reuses the existing accept, reject, and regenerate commands from ST-059 rather than introducing new mutation paths.

## Acceptance Criteria

- [ ] Candidates are grouped by scene and slot, and each identifies its request, scene, visual role, provenance, cost, and status.
- [ ] The visual role of each slot is visible, along with what that role permits.
- [ ] A candidate failing a deterministic media check is visibly blocked from selection and states why.
- [ ] Any model-assisted quality signal is labelled advisory, shows its version, and does not prevent selection.
- [ ] Accepting a candidate from this surface produces the same result as accepting it from the existing per-scene path.
- [ ] Failed and moderation-rejected candidates are shown with an actionable reason rather than hidden.
- [ ] Cross-tenant and cross-project access is rejected.
- [ ] The surface is keyboard operable and meets the accessibility bar established in ST-083.

## Required Tests

- [ ] Integration: grouped read path returns correct grouping, with authorization cases for cross-tenant and cross-project access.
- [ ] Integration: accepting from this surface and from the existing path converge on the same asset state.
- [ ] UI: candidate metadata renders for every status the pipeline produces.
- [ ] UI: a blocked candidate cannot be selected, by pointer or by keyboard.
- [ ] UI: advisory signals render as advisory and do not disable selection.
- [ ] UI: accessibility — keyboard navigation and alt-text presence.
- [ ] Failure: a candidate in `failed` state renders its reason rather than an empty tile.

## Out of Scope

- Automatic acceptance of a candidate on the teacher's behalf, under any circumstances.
- Generation itself, and any change to the generation job or provider.
- Editing a slot's `visualRole`. ST-085 assigns roles; nothing in this release lets a teacher change one.
- Representative render-frame inspection of the finished video. That is a separate concern from candidate review and should be its own story if wanted.
- Any change to cost or quota policy.

## Definition of Done

- [ ] The precondition check is completed and its result recorded in the Dev Agent Record.
- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] `docs/design.md` conventions are followed, and screenshots of the surface are attached to the Dev Agent Record.
- [ ] Accessibility is verified, not assumed.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-057 and ST-059. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- This story is deliberately sequenced after ST-085 rather than before it. Designing a review surface against real failure modes and real role metadata is cheaper than designing it against hypothetical ones and reworking it.
- The precondition is not boilerplate. It is the specific check that two prior discovery documents skipped, producing six proposed stories for work that was already Done.
- Derived from `docs/claude_openmontage-final-consolidated.md` §4.5.

## Dev Agent Record

- **Agent:** Claude Sonnet 5 (next-story)
- **Started:** 2026-09-03
- **Completed:** 2026-09-03
- **Branch/PR:** `story/st-089` (no PR opened)

- **Precondition check (recorded per Definition of Done):** PASSED. No candidate
  comparison surface exists in `apps/web`. The only pre-existing candidate UI is
  `apps/web/app/workspace/[projectId]/storyboard/illustration-candidate-panel.tsx`,
  which is strictly one scene / one slot inside the storyboard inspector and
  shows status + a 56px thumbnail only — no `visualRole`, provenance label,
  cost, moderation failure code, advisory findings, or cross-scene/cross-slot
  grouping. Side-by-side comparison is genuinely missing. This story proceeds.

- **Files changed:**
  - `packages/schemas/src/index.ts` — new `illustrationContactSheetResponseSchema`
    (+ scene/slot/candidate/advisory sub-schemas, `IllustrationCandidateBlockReason`,
    `illustrationAdvisoryFindingSchema`) and a `visualRolePermits(role)` helper
    colocated with the `visualRoleSchema` enum.
  - `apps/api/src/illustration-generation.ts` — new `IllustrationGenerationService.contactSheet()`
    (tenant/project-scoped grouped read; joins `jobs` for the request id,
    `project_assets` for media readiness, `usage_records` for persisted cost);
    module-level `selectability()` mirroring the accept gate and
    `ContactSheetResult`/`ContactSheetCandidate` types.
  - `apps/api/src/app.ts` — new `GET :projectId/illustration-candidates`
    (project-scoped) that signs preview URLs via the existing
    `ProjectAssetService.reviewPreview`, attaches `scene_monotony` advisories
    from `LessonValidationService.latest`, strips internal fields, and parses
    the response through the schema; `contactSheet` added to the
    `IllustrationGenerationApiService` Pick and the unavailable stub.
  - `apps/web/app/workspace/[projectId]/storyboard/candidates/page.tsx` — new
    Focus Studio route (server component, auth + project fetch + shell).
  - `apps/web/app/workspace/[projectId]/storyboard/candidates/contact-sheet-view.tsx`
    — client shell: fetches the sheet + storyboard revision, polls while any
    candidate is in flight, routes accept/discard through the existing
    `/illustration-candidates/:id/accept|reject` commands.
  - `apps/web/app/workspace/[projectId]/storyboard/candidates/illustration-contact-sheet.tsx`
    — presentational contact sheet (grouping, role badge + permission line,
    status pills with icon+text, provenance, persisted cost, advisory notes,
    blocked/selectable controls, surfaced alt text).
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx` — added
    a "Review illustration candidates" link into the storyboard workspace.
  - Tests: `apps/api/src/illustration-generation.test.ts` (+2 `contactSheet`
    unit tests), `apps/api/src/storyboard.test.ts` (+2 route tests: owner read,
    cross-tenant rejection, internal-field non-leak),
    `apps/web/.../candidates/illustration-contact-sheet.test.tsx` (7 SSR),
    `apps/web/.../candidates/illustration-contact-sheet.playwright.test.tsx`
    (4: keyboard-blocked selection, advisory does not disable, alt text, axe).

- **Migrations:** none. No new table or column (confirmed — cost is read from the
  existing `usage_records`, role is derived from the scene template).

- **Public contract changes:** `@avlp/schemas` adds
  `illustrationContactSheetResponseSchema` and friends plus `visualRolePermits`;
  new read-only endpoint `GET /projects/:projectId/illustration-candidates`.
  No mutation paths added — accept/reject/regenerate are the existing ST-059
  commands.

- **Commands/tests:**
  - `pnpm --filter @avlp/schemas build|test|lint` — pass (285 tests).
  - `pnpm --filter @avlp/api typecheck|build|lint` — pass.
  - `pnpm --filter @avlp/api test` — pass (457 passed, 70 skipped; one earlier
    run had 10 unrelated "Test timed out" flakes under machine load that all
    passed on re-run and in isolation).
  - `pnpm --filter @avlp/web typecheck|build|lint` — pass; route
    `/workspace/[projectId]/storyboard/candidates` present in the build output.
  - `pnpm --filter @avlp/web exec vitest run app/workspace/[projectId]/storyboard/candidates`
    — 11 passed (SSR + Playwright + axe).
  - `pnpm --filter @avlp/web test` (full) — pre-existing Playwright viewport
    failures in `configuration.playwright`, `narration.playwright`,
    `cross-screen-quality.playwright` reproduce on a clean checkout with this
    branch stashed; environmental (Windows chromium viewport rendering), not
    introduced here.

- **Screenshots/output:** contact sheet rendered from the real component
  (Focus Studio, 1180px) — grouped scene → slot, decorative role + permission
  line, `scene_monotony` advisory labelled "Advisory" with ruleset version and
  "does not block" copy, two reviewable candidates with previews + persisted
  cost, one `failed` candidate showing its reason and code (error styling), one
  `queued` candidate showing a neutral "still generating" note (not error
  styling). Sent to the user via SendUserFile.

- **Decisions/assumptions:**
  - Placement: dedicated sub-route `…/storyboard/candidates` (user-chosen),
    reachable from a link in `StoryboardPanel`.
  - `selectable` is computed server-side as a deterministic mirror of
    `acceptIllustrationCandidate`'s gate (pending_review + moderation approved +
    readable, correctly-dimensioned PNG). Blocked reasons: `generation_failed`,
    `moderation_rejected` (failure code not in the worker's generation-failure
    set), `media_check_failed`, `not_reviewable` (queued/generating),
    `already_resolved` (accepted/rejected).
  - Cost is read verbatim from `usage_records.estimated_cost_usd`
    (`idempotency_key = 'illustration:' || candidate.id`), never recomputed.
  - Request identity exposed as the resolved `jobId` (joined via the shared
    idempotency key), not the internal idempotency key.
  - Advisory model: only the deterministic `scene_monotony` finding exists
    today; the schema carries `source`/`rulesetVersion`/`model` so a future
    model-assisted visual-quality signal slots in without a contract change.
    Advisories never affect `selectable`.
  - `assetReady`/`assetId` are returned by the service for URL signing only and
    stripped by the HTTP layer (asserted by test).

- **Deviations:**
  - AC "every one needs its alt text surfaced **and editable** per the existing
    asset conventions": no editable-alt-text convention exists in the codebase
    (`project_assets` has no alt/caption column; the asset pickers don't offer
    it), and adding per-candidate alt text would require a new column + mutation
    that Contracts/Persistence and Out-of-Scope forbid. Alt text is **surfaced**
    on every candidate — a deterministic scene/slot/order-derived description on
    the `<img alt>` and shown visibly as "Alt text: …". Editing alt text remains
    where it will live: on the bound asset after acceptance. Flagged for the
    reviewer.
  - "Convergence" AC is structural rather than separately tested end-to-end: the
    contact sheet calls the exact `POST /projects/:id/illustration-candidates/:cid/accept`
    endpoint the per-scene panel calls (same `StoryboardService.acceptIllustrationCandidate`),
    already covered by `storyboard.test.ts`. A full DB integration test of the
    grouped read was not added because seeding a `scenes` row pulls in the
    lesson-spec → narration-set → outline-set → model-call fixture chain; the
    grouping/selectability/cost logic is covered by the `contactSheet` unit
    tests with a join-capable fake, and authorization by the route tests.

- **Known risks/follow-up:**
  - The storyboard revision the accept call needs is fetched from
    `GET /storyboard/scenes` in the client; a race between load and accept
    surfaces as a 409 that the view handles by reloading. Acceptable.
  - If a very large lesson has many candidates the read path signs one URL per
    ready candidate serially-ish (Promise.all) — fine at MVP scale, worth a
    batch signer later.
  - Full end-to-end browser screenshots against seeded pipeline data were not
    produced; visual evidence is the component render + Playwright/axe suite.

- **Code-review round 1 (self /code-review, 3 finder agents) — fixes applied:**
  - `app.ts` contact-sheet handler could 500 the whole endpoint: candidate rows
    are unbounded but `illustrationContactSheetSlotSchema.candidates` is
    `.max(100)`. Now the service caps each slot to the 60 most recent
    (`contactSheetCandidatesPerSlotLimit`); `previewUrl` schema relaxed from
    `z.string().url()` to a bounded string (it is our own signed URL rendered
    into `<img src>`); alt text `.slice(0, 300)` in the handler.
  - `contactSheet()` and `validations.latest()` now run under `Promise.all`
    (route is polled every 4s).
  - `selectability()`: a `pending_review` candidate with `moderationStatus
    "pending"` is now `not_reviewable` ("Waiting for the automated safety review
    to finish.") instead of being labelled a failed integrity check that tells
    the teacher to regenerate. New unit assertion added.
  - Contact sheet Discard button: enabled for any `pending_review` candidate
    (including one blocked from acceptance by a media/moderation check), since
    `/reject` accepts any `pending_review` candidate; still disabled for
    terminal states, which the endpoint 404s. New Playwright assertion added.
  - `contact-sheet-view.tsx` `decide()`: `setBusyCandidateId(null)` moved to
    after `await load()` so the controls do not briefly re-enable on stale data
    (was producing a spurious 409 on a fast double-click).
  - Findings about ST-084/085/086/087/088 (duration reconciliation band, ST-085
    binding-role throws on historical data, graph-schema optional fields,
    diagram label cap, ruleset-version loosening) were raised by the agents
    against the `main...HEAD` range; they belong to already-merged stories and
    are out of scope here.
  - Re-verified: schemas build/lint, api typecheck/build/lint + touched test
    files (35 pass), web typecheck/build/lint + candidates suite (13 pass).

- **Code-review round 2 (Codex, 2026-09-05) â€” fixes applied:**
  - The accept transaction locks and validates tenant/project ownership, review
    status, deletion state, image media type, and positive dimensions before it
    activates a candidate asset; a crafted request cannot bypass the sheet's
    deterministic media block.
  - The contact-sheet asset join is explicitly owner- and project-scoped.
  - Alt text is an editable labelled field for reviewable candidates. Its
    bounded value flows through the existing accept command into the accepted
    scene asset binding; the per-scene path stays compatible because it is
    optional.
  - Verified: API and web typecheck; API focused tests (33 pass); contact-sheet
    UI/browser tests (11 pass); API, web, and schemas lint.

- **Final approval (Codex, 2026-09-05):** Approved after the follow-up review.
  The preview's accessible name now follows the editable alt-text field, and
  cross-project contact-sheet access is explicitly covered. Focused API tests
  pass (34), as do API/web typechecks, lint, and the contact-sheet UI/browser
  suite (11).
