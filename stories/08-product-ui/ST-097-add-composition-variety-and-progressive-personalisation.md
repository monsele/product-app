---
story_id: ST-097
title: "Add Composition Variety and Progressive Personalisation"
phase: "08 — Product UI"
status: In Review
priority: must-have
epics: ["E6", "E10", "E11", "E12", "E15", "E20"]
prd_user_stories: ["E11-US2", "E15-US2", "E20-US1"]
depends_on:
  [
    "ST-041",
    "ST-043",
    "ST-050",
    "ST-056",
    "ST-057",
    "ST-060",
    "ST-065",
    "ST-066",
    "ST-068",
    "ST-077",
    "ST-084",
    "ST-087",
    "ST-094",
  ]
---

# ST-097 — Add Composition Variety and Progressive Personalisation

## Story

As a teacher, I want varied compositions and a reusable visual identity applied to my own lesson, so that videos feel intentional and personal while remaining clear, accurate, and readable.

## Outcome

An experimental design workflow selects compatible compositions across a lesson, lets the teacher preview and lock alternatives, and applies bounded colour, font, logo, motion, imagery, and caption settings. Teachers can save versioned personal styles and describe supported changes in plain language, review the resulting settings, and apply them to a draft.

Implement the four increments below in order. All four are required for this story to be Done. Reference uploads, learned preferences, and full coverage of all ten semantic scene types are later extensions, not hidden completion requirements.

## Required Reading

- `docs/controlled-rendering-versioning-contract.md` — shared CR-01–CR-08 requirements for resolved selections, versioned presets/assets, motion-energy invariants, and render identity. Implement applicable requirements here and record evidence for ST-098 without adding it as a dependency.

- `AGENTS.md`, `STORY_INDEX.md`, and `docs/design.md`.
- `docs/video-style-templates-brainstorm.md` — composition families and personalisation levels.
- `docs/creative-styles-technical-research.md` — style/treatment contracts, assets, fonts, layout validation, and immutable versions.
- ST-094 and its completed proof evaluation, pack contracts, and architecture recommendations.
- ST-095 and ST-096 for boundaries between video approach, explanatory events, and controlled comparisons; neither is a dependency.
- Current PRD/technical-guide sections on configuration, generation, scene editing, asset ownership, preview, validation, rendering, and versioning.
- All current ADRs, particularly ADR-001 and ADR-004, and dependency Dev Agent Records.

## Dependencies and Rollout Boundary

Do not start until all `depends_on` stories are Done in `STORY_INDEX.md`. Blocked by ST-094 at creation. Its proof is necessary but is not a production multi-style implementation; this story owns the bounded integration, schema evolution, persistence, and render identity needed below.

Initially support Essential, Editorial, and Everyday for `hook`, `definition`, `process`, and `comparison`. Provide at least two materially different treatments per combination: 3 styles × 4 scene types × 2 treatments = 24 supported combinations. Reuse suitable ST-094 treatments; implement missing process support and alternatives here.

Enable the workflow for a configured pilot cohort and only lessons whose entire scene sequence passes the style/treatment capability check. Legacy and unsupported lessons retain their current saved appearance; explain why the new workflow is unavailable. Do not silently mix unsupported scenes into a new style or advertise full ten-scene coverage.

Keep video approach independent of style, composition, and user preferences. Initial support is the standard approach. If ST-095/ST-096 is already available, incompatible demonstration scenes must explicitly fail capability checks; do not alter their semantic event plans to make a visual preference fit. Preserve the fixed design identity of any existing controlled comparison.

Record the requested scope expansion and compatibility/versioning decision through an ADR and relevant PRD/technical-guide updates before changing consumers. Use the next available ADR number and repository decision conventions. Do not silently promote ST-094's proposed production architecture to an accepted decision.

## Increment 1 — Composition Catalogue and Lesson Planning

### Treatment requirements

Each registered treatment declares ID/version, style/version, semantic scene type, supported approach, required content/assets, text/item limits, typography/layout constraints, minimum readable intervals, density, motion intensity, and composition-family tags. It owns a renderer and validation metadata.

Example families to implement or refine during design:

| Scene      | Candidate alternatives                                |
| ---------- | ----------------------------------------------------- |
| Hook       | Full-frame question; subject beside question          |
| Definition | Term/object split; annotated subject with explanation |
| Process    | Connected path; staged panels using the same steps    |
| Comparison | Paired subjects; aligned attribute rows               |

Author style-specific hierarchy, framing, imagery, and motion for those families. Changing only colours does not create another composition. Process support must account for the existing legacy and graph schemas: implement validated rendering of each claimed form, or return explicit unsupported reasons. Do not infer a physical transformation from generic process steps.

### Deterministic sequence planning

Filter candidates by factual-content coverage, required assets, scene schema, text fit, approach compatibility, and available duration. Rank only valid candidates using instructional suitability, nearby scene families, repeated composition, density, and pacing. Record named score components and use stable tie-breaking with a versioned planner.

Avoid monotonous repetition where equally suitable alternatives exist, but allow deliberate repetition for continuity. Never select an unsuitable treatment just to increase variety. Consider both previous and upcoming scene metadata without depending on renderer-side randomness.

Persist resolved treatment selections. Reopening a lesson or rerendering a snapshot must not run the latest planner implicitly.

### Pacing and teacher control

Represent establish/explain/hold/exit intervals within the existing scene timeline. Preserve narration and caption timing under ADR-004. If a composition cannot provide a readable hold, select another valid candidate or report a fit issue; do not speed speech, remove facts, or split content automatically.

Add **Try another layout** to supported scene editing. Show two or three compatible treatments using that scene's actual content; show fewer with an explanation when necessary. The chosen layout becomes a persisted teacher lock. Replanning must preserve locks. If edits invalidate a lock, surface a conflict and ask the teacher to choose an available correction rather than silently replacing it.

## Increment 2 — Bounded Personalisation and Own-Content Preview

Add controls separate from video approach:

| Control            | Behaviour                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colours            | Role-based background, surface, text, accent, and diagram emphasis; validate readable combinations and preserve factual colour coding                            |
| Fonts              | Small catalogue of pinned, tested heading/body pairings and weights; revalidate layout after changes                                                             |
| Logo               | Optional tenant-owned image in tested opening/closing positions; no caption or evidence overlap                                                                  |
| Motion energy      | Calm, balanced, lively adjust decorative distance/easing/emphasis within treatment limits; preserve event order, narration speed, readable holds, and quantities |
| Imagery preference | Photography, illustration, diagrams, compatible mix; a preference among suitable assets/treatments, never permission to replace required evidence                |
| Captions           | Tested size/background/emphasis presets with enforced readability and safe areas                                                                                 |

Reuse secure asset-upload/storage patterns for logos, including file/size validation and ownership checks. Bound formats to the existing safe pipeline; do not inject uploaded SVG/HTML into the page. Use an existing pinned font catalogue, not arbitrary user font uploads in this increment.

Preview settings on the user's own supported scene immediately where practical. Offer a short selection of text-heavy, image/diagram, and process scenes from their lesson when available. Do not substitute a generic demo without labelling it, and do not require a full paid render for every control change.

Treat settings as an unsaved preview draft until **Apply to lesson**. Validate the full supported lesson before applying atomically against its current revision. Cancel discards preview changes. If some scenes fail, report them and keep the existing saved design intact. Do not silently apply partial styling.

Font-ready browser measurement must inspect actual wrapped content; retain fast schema checks in the API. Run expensive full-lesson preflight in existing background tooling. Fix violations through valid alternatives or explicit teacher edits, not indefinite font shrinking or hidden text truncation.

## Increment 3 — Versioned Saved Personal Styles

Allow **Save as personal style**, list/select a saved style, and create a new version through editing. Store the base pack/version, bounded overrides, logo/font asset identities, and optional supported composition preferences. Validate settings against the referenced pack; preferences never bypass hard eligibility constraints.

Applying a preset to another lesson creates a resolved design snapshot after validation. Existing approved lessons and completed renders retain their original pack, treatment, preset, font, and asset versions. Editing a preset must never mutate those snapshots or automatically restyle draft lessons elsewhere.

Use tenant-owned records, version history, bounded names, and optimistic concurrency. Archive a preset without breaking versions that already reference it; follow existing project/asset retention conventions. Organisation sharing, brand locks, and public preset marketplaces are outside this story.

## Increment 4 — Natural-Language Requests to Supported Settings

Provide an explicit **Describe the changes** action. Example: “Make this calmer, use forest-green accents, and give diagrams more space.”

Translate the request into a strict structured patch containing only supported settings and compatible treatment preferences. Use the existing provider/prompt/schema infrastructure. Validate provider output at the boundary; no model-supplied CSS, code, coordinates, arbitrary asset URLs, or unregistered fonts/treatments are allowed.

Present the proposed changes, unsupported portions of the request, and an own-content preview before Apply. Cancellation leaves the saved draft untouched. Tie the response to its original draft revision; a delayed response cannot overwrite newer settings. Provider failure preserves manual controls and does not silently apply another interpretation.

“Less text” may reduce simultaneous text density or choose a compatible layout while preserving all content. Deleting, summarising, or rewriting educational text is a separate content-edit request and must not occur inside a styling operation. Likewise, a request for another imagery type does not authorise new paid asset generation.

Paid interpretation calls require the explicit action, quota checks, usage records, and existing retry/idempotency behaviour. Tests use deterministic provider fixtures; do not incur charges automatically. Do not log prompts, source lesson text, or raw provider responses.

## Contracts, Persistence, and Render Identity

Keep these concepts separate: semantic scene; video approach; versioned creative style; selected treatment; personalisation overrides; saved preset. Define shared schemas before consumers.

Inspect existing snapshot/render consumers and settle design-manifest versus LessonSpec placement in the ADR. Implement a versioned read/write contract and additive migrations with a legacy `mvp-default` compatibility reader. Never rewrite immutable old snapshots to add defaults.

Persist pack/treatment/planner versions, per-scene selections and locks, resolved overrides, preset version, asset/font identities, and validation input identity. Include all rendering-affecting values in preview, preflight, job idempotency, and output cache hashes. Signed URLs are transient credentials, not stable asset identity.

Applying design changes invalidates affected layout validation and renders, while reusing unchanged narration/audio and citations. Changing content can invalidate treatment fit and locks; changing narration invalidates relevant timing. Background completion must check input revisions/hashes before publishing results.

Reuse the same resolved design manifest, asset resolution, fonts, and composition implementations in browser preview and server rendering. Do not rely on a live preset lookup during rendering. Retain the implementation/assets needed by old approved versions or return an explicit unavailable-version error; never substitute the newest pack.

All configuration, preset, logo, preview/preflight, and model operations require existing ownership/tenant checks, including worker-side checks. Use existing background jobs/outbox/metering conventions; no transactions across provider/storage calls. Exact endpoints and tables belong in the implementation plan, with migrations and deletion behaviour documented.

## Acceptance Criteria

- [ ] **AC1 — Catalogue:** All 24 style/type/treatment combinations render with visibly different compositions. Capability checks correctly handle legacy/graph process forms and reject unsupported scenes or approaches.
- [ ] **AC2 — Planning:** Identical inputs/planner version produce identical selections. Tests show invalid candidates rejected, unnecessary repetition reduced, and justified repetition retained. Resolved choices survive reload without replanning.
- [ ] **AC3 — Teacher choice:** Alternative previews use actual scene content; selection persists as a lock. Replanning preserves valid locks and exposes invalidated-lock conflicts without replacing teacher choices.
- [ ] **AC4 — Controls:** Every listed control affects preview as described, validates its limits, and preserves content, narration, captions, and required evidence. Application UI branding remains governed by `docs/design.md`.
- [ ] **AC5 — Full validation:** Apply validates all scenes and saves atomically. Overflow, poor contrast, missing fonts/assets, unsupported settings, or stale revisions leave the prior saved design intact with actionable issues. Cancel changes nothing saved.
- [ ] **AC6 — Presets:** A teacher can save, reopen, version, apply, and archive a personal style. Cross-tenant access is denied; older lesson/preset versions retain their appearance after preset edits.
- [ ] **AC7 — Language requests:** Supported requests return validated settings and own-content previews. Unsupported requests are explained, facts are not rewritten, stale responses do not overwrite edits, and explicit Apply is required.
- [ ] **AC8 — Reproduction:** Preview/render comparisons and repeated-frame checks pass under documented tolerances. Changes to any render-affecting design input invalidate the correct cached results.
- [ ] **AC9 — Compatibility:** Old configuration, scene, lesson-version, preview, render, and restore fixtures continue to work with their original appearance. Feature-disabled/non-pilot behaviour remains standard; unsupported lessons cannot enter a partial new-style state.
- [ ] **AC10 — Evidence:** Demonstrate the four increments end to end on two different user-owned test lessons, including process scenes, long-text boundaries, a locked layout, preset revision, and a natural-language request. Provide actual clips/screenshots, preflight/render measurements, and an honest visual review.

## Required Tests

- [ ] Contract/migration tests for legacy reads, new design snapshots, invalid overrides, unsupported treatments/versions, process shape compatibility, and preset revisions.
- [ ] Planner tests for suitability, neighbouring scenes, stable tie-breaks, pacing bounds, intentional repetition, and locks.
- [ ] Browser layout checks after font loading for wrapping, overflow, safe areas, captions, logo placement, and validated colour combinations.
- [ ] API/database/worker tests for ownership, logo/preset access, optimistic concurrency, atomic application, stale jobs, immutable versions, retention, and cache identity.
- [ ] Provider contract tests for schema-invalid output, unsupported requests, content-preserving behaviour, failure, retries, quotas, and stale response handling.
- [ ] Browser workflow/accessibility tests for alternatives, controls, Cancel/Apply, full-lesson failures, saved styles, natural-language proposals, and feature eligibility.
- [ ] Actual render tests and visual review across the 24 combinations, representative full lessons, and old `mvp-default` fixtures. Do not substitute static markup equality for rendered-frame evidence.
- [ ] Affected workspace lint, typecheck, tests, build, database integration, and relevant browser/render suites; record commands and results.

## Out of Scope and Later Extensions

- Full support for the remaining six semantic scene types, Systems/Field Notes/Prism, and unrestricted custom layouts.
- Demonstration engine work or changes to its instructional event semantics; ST-095 owns that foundation.
- Reference-image/brand-guide uploads and extraction, automatic preference learning, and exact imitation of reference videos.
- Organisation-wide presets/brand locks, arbitrary font uploads, public preset sharing, and general timeline editing.
- Automatic educational-content rewriting, audio regeneration, new image generation, or paid calls from passive preview changes.

Choosing among scene-treatment previews is included in Increment 1. Learning a user's long-term preferences from those choices is deferred. Record these extensions in the handoff rather than presenting this story as the entire personalisation roadmap.

## Implementation Checklist

- [ ] Verify ST-094 and other dependencies; inspect the actual pack and persistence contracts.
- [ ] Write a plan with files, migration/compatibility strategy, APIs, jobs, tests, and risks.
- [ ] Record scope/architecture decisions; implement schemas before consumers.
- [ ] Complete Increment 1: catalogue, sequence planner, alternatives, and locks.
- [ ] Complete Increment 2: controls, own-content previews, full preflight, atomic Apply.
- [ ] Complete Increment 3: immutable saved-style versions and application.
- [ ] Complete Increment 4: validated natural-language proposals and review.
- [ ] Verify security, compatibility, actual renders, and all acceptance criteria.
- [ ] Update technical documentation, Dev Agent Record, and story index.

## Definition of Done

- [ ] All four increments, acceptance criteria, and required checks are complete.
- [ ] User-owned lesson previews and final renders demonstrate variety and personalisation while preserving instructional content.
- [ ] No unresolved tenant, versioning, stale-update, layout, provider-cost, or legacy-render regression remains in scope.
- [ ] Migrations, contracts, rollout limits, decisions, test commands, and representative output locations are documented.
- [ ] Story/index become Done only after the Dev Agent Record and evidence are complete.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-09-19
- **Completed:** Implementation complete; code-review approved, awaiting repository-owner review.
- **Branch/PR:** Current workspace branch; no PR published.
- **Files changed:** Versioned creative-design schema/catalogue, tenant-owned drafts/snapshots/presets/proposals and migrations, API/worker/render/preview wiring, bounded pilot UI, provider prompt, renderer treatments and focused tests; ADR-008 and product/technical-guide updates.
- **Migrations:** `0063_creative_design_manifests`, `0064_creative_design_provider_metering`, and `0065_creative_design_snapshot_revision_identity`. All are additive/compatibility documented; 0065 corrects retry uniqueness to include lesson revision.
- **Public contract changes:** Cohort-gated creative-design draft, plan, alternatives, apply, preset, and describe endpoints; versioned resolved design manifests in lesson-version, preview, and render payloads; `ai.creative_design` metering operation. Legacy readers retain `mvp-default` when no manifest is present.
- **Commands/tests run:** Schema/database/API/worker/renderer/scene-library/web typechecks; web lint; database tests (8 passed, 3 integration tests skipped by suite); focused schema (6), API (12), worker (2), provider prompt (13), and renderer contract/media (5) tests passed. The 24-combination Chromium real-frame matrix passed before the final render-affecting control refinement; its direct post-refinement rerun completed in the local test process but the terminal parent detached before the result could be collected. `git diff --check` passed.
- **Screenshots or representative output:** The 24 real rendered treatment frames produced distinct deterministic hashes in `creative-design-render.test.ts`; legacy full-lesson deterministic frames pass in `full-lesson-render.test.ts`. Live project screenshots/clips could not be captured because Docker Desktop's Linux engine was unavailable locally.
- **Decisions and assumptions:** ADR-008 keeps presentation manifests parallel to immutable semantic LessonSpec records. Pilot scope is Essential, Editorial, and Everyday over hook, definition, process, and comparison only. Style requests never alter factual content, source evidence, narration, or timing.
- **Known risks or follow-up:** Docker Desktop was unavailable (`docker ps` could not connect), so migration execution and the two-user-owned-lesson live capture remain for CI/review environment verification. Browser font-wrap measurement is additionally covered by renderer frame evidence and static manifest limits; ST-098 remains the cross-feature reproducibility follow-up. Remaining semantic-scene coverage and reference-based styling remain later stories.
- **Code review:** **Approved.** No high, major, or medium implementation finding remains after fixes for active-logo validation, resolved preview/render parity, stale language proposals, snapshot revision identity, imagery/diagram rendering, and explicit alternative selection.
