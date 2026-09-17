---
story_id: ST-096
title: "Select and Compare Standard and Demonstration Videos"
phase: "08 — Product UI"
status: Blocked
priority: must-have
epics: ["E6", "E10", "E11", "E15", "E20"]
prd_user_stories: ["E6-US1", "E15-US2", "E20-US1"]
depends_on: ["ST-041", "ST-050", "ST-060", "ST-063", "ST-064", "ST-065", "ST-066", "ST-068", "ST-077", "ST-079", "ST-084", "ST-095"]
---

# ST-096 — Select and Compare Standard and Demonstration Videos

## Story

As a teacher or tester, I want to choose between the current video approach and an experimental demonstration-led approach, then compare both using the same lesson and narration, so that I can judge whether explanatory movement improves clarity and engagement.

## Outcome

Eligible testers select a video approach during lesson configuration, before storyboard generation. A supported lesson produces real demonstration animation or the existing standard output. After one output is ready, an explicit comparison action creates the alternative as a separate variant. Both remain available with matched scene navigation and saved feedback.

The comparison holds content, narration audio, captions, scene boundaries, and visual style constant. Only the approach to visual explanation changes. Existing lessons continue to behave as standard videos.

## Required Reading

- `docs/controlled-rendering-versioning-contract.md` — shared CR-01–CR-08 requirements for immutable variants, media identity, authorised caching, validation, and job completion. Implement applicable requirements here and record evidence for ST-098; it is a later verification story, not a prerequisite.

- `AGENTS.md`, `STORY_INDEX.md`, and `docs/design.md`.
- `docs/reference/mvp-prd.md` and `docs/reference/epic-technical-implementation-guide.md` — lesson configuration, storyboard generation, visual runtime, preview, validation, rendering, and immutable versions.
- All current ADRs, especially ADR-001, ADR-002, ADR-003, and ADR-004.
- `docs/video-style-templates-brainstorm.md` — Make motion explain the subject.
- `docs/creative-styles-technical-research.md` — distinction between appearance and subject-specific explanation; treat its recommendations as research, not approved production contracts.
- ST-041, ST-050, ST-060, ST-065, ST-068, ST-077, ST-079, ST-084, and ST-087 and their Dev Agent Records.
- `stories/01-visual-runtime-proof/ST-095-build-and-prove-demonstration-led-animation.md`, its completed Dev Agent Record, integration contract, and evaluation report.

## Dependencies and Pilot Boundary

Do not start until all `depends_on` stories are Done in `STORY_INDEX.md`. This story is Blocked by ST-095, which must first deliver and verify the demonstration runtime and both recipes. Change this story and its index entry to Ready when that prerequisite is Done; do not treat a mock renderer as satisfying the dependency.

ST-094 is not a dependency. Use `mvp-default` for both approaches in this experiment so creative-style changes do not confound the comparison. Future style-pack integration is separate.

ST-095 owns the typed event runner, narration timing validation, curated fixtures, and savings/evaporation recipes. This story integrates those proven capabilities into the tester workflow. Consume its versioned recipe support query, plan builder/validator, shared composition, and input identity contract; do not build a second engine or duplicate recipe logic. A selector backed by identical output for both choices does not satisfy this story.

The pilot is restricted to curated, validated savings and evaporation test lessons. It does not promise demonstration generation for arbitrary uploaded content. Record this user-requested experimental expansion, versioning choices, and variant ownership in a new ADR using the next available number; update affected product/technical documentation without claiming unimplemented functionality. Resolve those contracts before implementing their consumers, following repository decision conventions.

## User Experience

### Video approach selector

Place an accessible radio group in the existing lesson configuration flow before storyboard generation. It is separate from visual theme/style and voice settings.

| Value | Label | Description |
| --- | --- | --- |
| `standard` | Standard explanation | Explains the lesson using the current scene templates, text, images, and diagrams. |
| `demonstration` | Demonstration-led explanation · Experimental | Shows the explanation through objects moving, accumulating, splitting, or changing state alongside narration. |

Standard is selected for new lessons by default. Legacy lessons resolve to standard through the compatibility reader. Persist an explicit choice for new configuration revisions.

Expose the experimental choice only to the configured pilot cohort. For an eligible tester with unsupported content, show it disabled with a specific reason and a link/action to open a supported test lesson. Server-side eligibility is authoritative; UI hiding alone is insufficient.

Support must be based on a registered recipe and validated source/content requirements, not a subject/title keyword. Recheck after narration/storyboard preparation and edits. A failed eligibility check must never silently change the chosen approach to standard.

### Create comparison version

After a supported, validated output exists, show **Create comparison version**. Identify which alternative will be produced, that approved narration/audio will be reused, and any render usage before the explicit action.

Create the alternative from the exact immutable baseline snapshot. Do not replace the current project configuration, storyboard, approved lesson, or first output. If the opposite variant already exists for the same baseline, open it instead of generating it again.

Show both approaches with clear labels, independent generation/progress/failure states, and matched scene navigation. Switching approaches preserves the selected baseline scene and relative playhead position. Only one player may emit audio at a time. Show both rendered output links when ready.

### Feedback

Provide optional 1–5 ratings for clarity, engagement, and narration synchronisation for each approach, plus a preference of Standard / Demonstration / No preference and an optional comment. Define scale endpoints, allow feedback to be updated, and persist it against the exact comparison and output versions. Treat responses as qualitative pilot evidence, not proof of learning gains.

Follow the existing Studio Daylight configuration and Focus Studio preview conventions, with keyboard access, visible focus, readable labels, and useful empty/error/retry states.

## Scope

- [ ] Inspect configuration, generation, immutable lesson snapshots, audio/caption identity, preview, render manifests, and current project-state assumptions.
- [ ] Define versioned approach, eligibility, comparison, variant, and feedback contracts before their consumers.
- [ ] Persist approach selection and implement the pilot cohort/recipe eligibility rules in UI and API.
- [ ] Make ST-095's source-grounded savings and evaporation fixtures available as tenant-owned test lessons through the existing source-review, configuration, and versioning workflow, preserving their asset provenance and timing identities.
- [ ] Integrate ST-095's versioned demonstration runtime and recipes without changing their verified instructional behaviour.
- [ ] Route standard through the existing path and demonstration through its registered supported recipe.
- [ ] Create immutable paired variants with reusable audio/captions and isolated asynchronous generation/render jobs.
- [ ] Provide comparison previews, matching navigation, failure/retry handling, and persisted feedback.
- [ ] Verify actual output differences, legacy compatibility, timing, tenant isolation, and idempotency.
- [ ] Document the pilot, ADR, migrations, contracts, and representative outputs.

## Demonstration Integration Contract

The savings and evaporation recipes are implemented and verified in ST-095. Invoke its support query before enabling generation and revalidate the exact source, narration, audio, and cue identities when building each variant. Persist the resolved plan and recipe version returned by the foundation; never regenerate the plan implicitly during playback.

Use ST-095's equivalent standard fixtures as the starting point for controlled test lessons. Eligibility remains restricted to validated pilot inputs. A changed narration or unsupported lesson must produce the foundation's actionable validation response, not a guessed recipe selected from a title.

### Timing and natural movement

- Preserve ST-095's stable object IDs, validated event timings, authored motion, and frame-derived state during preview/render integration.
- Preserve phrase-timing provenance. An edited narration or replaced audio invalidates the plan; do not silently replace verified timing with character-count estimates.
- Respect ADR-004: do not accelerate, trim, or resynthesise narration to force an animation to fit. Reject an invalid timing plan with an actionable issue.
- Reuse the existing Remotion/FFmpeg, asset, caption, validation, and job infrastructure. No paid provider call is necessary for the curated proof.

## Contracts and Persistence

### Approach configuration

Define `videoApproach: "standard" | "demonstration"` in the versioned configuration contract. Unknown explicit values are errors. Old snapshots without the field read as standard without rewriting their immutable stored JSON. Persist the effective approach in all new variant snapshots and render inputs.

Audit configuration invalidation rules: an approach-only change invalidates the affected visual plan and derived output, not approved source facts or reusable audio. Changes to narration invalidate its timing plan. Preserve approved historical outputs.

### Comparison and variant identity

Add additive tenant/project-owned comparison and variant records, or an equivalent explicit model established in the ADR. Do not emulate a comparison by restoring an alternative into the project's current lesson state.

Record baseline lesson-version ID/hash, source snapshot, scene correspondence, narration/audio/caption identities, fixed style identity, approach, recipe/event-plan versions, render manifest/output identity, and lifecycle state. Reuse immutable media references inside the authorised project scope; signed URLs are delivery credentials, not stable asset identities.

Enforce uniqueness for a baseline and experiment/recipe version, with one variant per approach. Standard and demonstration must have different cache/idempotency identities even when their narration is identical. Include all render-affecting inputs in validation and render hashes.

Compare hashes before generation, on completion, and when presenting a controlled pair. If baseline content, audio, captions, style, or scene timing no longer match, do not present the pair as equivalent. Keep completed historical pairs viewable; current edits require a new comparison baseline rather than mutating the old pair.

### API and jobs

Extend existing configuration endpoints and add bounded commands/queries for eligibility, creating/loading a comparison, requesting/retrying a variant, and saving feedback. Settle exact routes in the implementation plan using existing API conventions.

All operations require project ownership/cohort checks as applicable. Both referenced variants and the baseline must belong to the same authorised scope. Validate again in workers. Feature-flag changes prevent new experimental jobs while preserving authorised access to completed outputs; document how already queued work is handled.

Use the existing outbox/background-job, metering, and correlation patterns. Repeated clicks or concurrent requests reuse the same active/completed variant. Completion uses compare-and-set or equivalent checks so obsolete jobs cannot overwrite a newer baseline or variant. Do not hold database transactions open across provider/storage calls.

Feedback records include comparison/output IDs, tester identity, bounded ratings/preference/comment, timestamps, and revision semantics. Keep free-text comments out of routine logs and expose them only within authorised scope. Reuse existing project deletion/retention behaviour for the new records.

## Acceptance Criteria

- [ ] **AC1 — Selection:** An eligible tester can select either approach before generation; selection survives reload. Existing lessons and non-pilot users retain standard behaviour.
- [ ] **AC2 — Eligibility:** Unsupported lessons show a useful reason. Direct API attempts and stale selections are rejected. No silent fallback occurs.
- [ ] **AC3 — Real demonstration:** Both pilot subjects render meaningful object/state changes aligned to their narration, with validated amounts/scientific explanation. Standard retains its current scene behaviour.
- [ ] **AC4 — Controlled pair:** Both variants share exact approved content, audio, captions, style, and scene boundaries. The UI identifies the approach on each preview/output and makes the difference observable.
- [ ] **AC5 — Isolation:** Creating or retrying a comparison does not modify the baseline, current storyboard, original render, or approved versions. Changing the current lesson does not mutate a historical pair.
- [ ] **AC6 — Playback:** Scene selection and relative playhead position transfer between variants, seeking gives correct animation state, and simultaneous speech from both players cannot occur.
- [ ] **AC7 — Lifecycle:** Queued, running, complete, stale/incompatible, and failed states are truthful. Retrying one variant preserves the other; repeated/concurrent requests produce no duplicate authoritative variant or incorrect cache reuse.
- [ ] **AC8 — Feedback:** Ratings, preference, and comments survive reload, attach to the exact pair/output versions, and can be updated without cross-project access.
- [ ] **AC9 — Compatibility:** Legacy configuration, LessonSpec, snapshots, standard preview/render, and version restore remain supported through an explicit compatibility path. Database migration tests include existing rows.
- [ ] **AC10 — Evidence:** Record two controlled pairs (savings and evaporation), actual playable MP4s, preview screenshots, synchronisation/accuracy review, and relevant test results. A selector mock-up or static markup comparison is not completion.

## Required Tests

- [ ] Shared schema and compatibility tests: missing legacy field, explicit standard/demonstration, invalid values, unsupported recipes, and malformed event plans.
- [ ] API/database tests: persistence, stale revisions, cohort/ownership checks, cross-tenant baseline/variant/feedback access, migration compatibility, and immutable baseline preservation.
- [ ] Job tests: concurrent creation, repeat requests, retry isolation, stale completion rejection, approach-sensitive cache keys, and no automatic audio/provider regeneration.
- [ ] Runtime integration tests: pass through recipe precondition/timing errors, preserve cue/audio identity, and verify deterministic seeking and correct final state through the actual preview/render adapters. Reuse ST-095's conservation and recipe tests rather than duplicating the engine suite.
- [ ] Browser tests: radio group accessibility, reload, unsupported explanation, comparison action, progress/retry, matched navigation, single audible player, and feedback persistence.
- [ ] Actual Remotion/MP4 verification for both subjects and approaches, caption/audio checks, and standard visual regression. Inspect differences in complete clips, not just first frames.
- [ ] Affected workspace lint, typecheck, tests, build, applicable database integration tests, and browser/render suites; record exact commands and outcomes.

## Out of Scope

- Broad demonstration support for arbitrary lessons or unrestricted AI-generated animation.
- Full scientific simulation, a general node editor, and an open-ended animation vocabulary.
- New demonstration engine or recipe implementations; these belong to ST-095. Fix any foundation defect in its owning implementation rather than bypassing its contract in this workflow.
- New creative styles, personalisation, or mixing styles between members of a controlled pair.
- Automatic generation of both approaches for every lesson, paid provider integration, and silent source/audio regeneration.
- Statistical experimentation infrastructure, public comparison sharing, or claims of measured learning improvement.

## Implementation Checklist

- [ ] Inspect existing code and write a plan with files, versioned contracts, migrations, ADR/scope changes, and tests.
- [ ] Establish baseline/variant ownership and backward compatibility before implementation.
- [ ] Implement contracts and persistence, then eligibility/configuration and adapters to ST-095's completed runtime.
- [ ] Integrate immutable variants, background rendering, paired preview, and feedback.
- [ ] Run integration and real-media checks; inspect the two controlled pairs.
- [ ] Update documentation, Dev Agent Record, and story index.

## Definition of Done

- [ ] Every acceptance criterion and required test is satisfied with reproducible evidence.
- [ ] Both pilot subjects can be compared through the actual tester workflow.
- [ ] No unresolved tenant-isolation, baseline mutation, duplicate-job, false fallback, timing, or standard-regression defect remains.
- [ ] Migrations, contract/version changes, experiment eligibility, and architecture decisions are documented.
- [ ] Dev Agent Record is complete; story and index are marked Done only after verification.

## Dev Agent Record

- **Agent:** Not started.
- **Started:** Not started.
- **Completed:** Not completed.
- **Branch/PR:** Not created.
- **Files changed:** Pending implementation.
- **Migrations:** Planned additive approach/comparison/variant/feedback persistence; exact design pending inspection and ADR.
- **Public contract changes:** Planned versioned configuration, eligibility, variant, and feedback contracts with legacy compatibility; reuse ST-095's event-plan contract.
- **Commands/tests run:** Pending implementation.
- **Screenshots or representative output:** Pending implementation.
- **Decisions and assumptions:** Curated pilot only; fixed `mvp-default` appearance. ST-095 must prove the engine and recipes before this story integrates selection, persistence, comparison, and feedback.
- **Deviations from story/technical guide:** None implemented. Record the explicitly requested experimental expansion through repository product/architecture documentation.
- **Known risks or follow-up:** Blocked until ST-095 is Done. Verify that integration preserves its timing and scientific accuracy while isolating variants. Arbitrary-topic support and additional creative styles require subsequent stories.
