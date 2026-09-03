---
story_id: ST-089
title: "Add Contact-Sheet Candidate Review for Generated Illustrations"
phase: "08 - Product UI"
status: Ready
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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
