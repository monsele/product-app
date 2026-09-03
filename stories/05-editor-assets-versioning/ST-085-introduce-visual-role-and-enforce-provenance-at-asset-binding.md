---
story_id: ST-085
title: "Introduce Visual Role and Enforce Provenance at Asset Binding"
phase: "05 — Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E13", "E21"]
prd_user_stories: []
depends_on: ["ST-057", "ST-058", "ST-059"]
---

# ST-085 — Introduce Visual Role and Enforce Provenance at Asset Binding

## Story

As a teacher, I want the system to distinguish visuals that carry factual weight from visuals that are decorative, so that generated imagery can never stand in for content a learner is expected to trust.

## Outcome

Every scene visual slot declares a `visualRole`. Binding an `ai_generated` asset to a grounding-critical slot becomes structurally impossible, enforced by the schema rather than by convention, and the bulk generation path no longer targets those slots.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E13, E21
- `docs/reference/epic-technical-implementation-guide.md` — E13, E21 plus applicable cross-cutting sections
- `docs/claude_openmontage-final-consolidated.md` — §4.1 (the trace this story closes) and §4.2 (the role table)
- `stories/05-editor-assets-versioning/ST-059-generate-limited-scene-illustrations-with-review-and-cost-controls.md`

## Dependencies

- ST-057
- ST-058
- ST-059

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Problem

An AI-generated illustration can today be bound into the most grounding-critical slot in the product. Traced end to end, no provenance gate exists at any layer:

1. `generateMissing()` (`apps/api/src/illustration-generation.ts:55`) iterates every scene's persisted asset requirements and queues generation for **every unbound slot**. Its docstring states the intent: *"so a teacher does not have to click through each scene."* One call covers a whole lesson.
2. `labelled-diagram` declares `slot: "diagram"` with `required: true` (`packages/schemas/src/index.ts:6499`). An unbound diagram slot is therefore exactly what `generateMissing` targets.
3. The only gate is a template/slot support check (`apps/api/src/illustration-generation.ts:191`): `sceneAssetSlotRequirement(template, slot) === undefined` rejects. For `("labelled-diagram", "diagram")` this returns a defined requirement, so it **passes**. The check asks whether the template has the slot, never whether the slot may hold generated content.
4. `acceptedKinds: ["illustration", "shape"]` constrains catalog *kind*, not provenance.
5. The worker generates from `illustrationPrompt()` — *"Create a simple flat educational supporting illustration for: {title}"*, style `flat-educational-vector`. A decorative prompt filling a factual slot.
6. The result becomes a `pending_review` candidate carrying `provenance: "ai_generated"`.
7. On acceptance it becomes a `projectAssets` row bound to the diagram slot.
8. `sceneAssetBindingSchema` is `{ assetId, role, altText?, slot? }` (`packages/schemas/src/index.ts:57`). No provenance field, so the constraint is not expressible.
9. `ResolvedSceneAsset` is `{ altText, assetId, source, src }` (`packages/scene-library/src/scene-registry.tsx:80`). No provenance, so the scene and validation layer cannot distinguish a generated image from a source figure at render time.

`generated_addition_unlabelled` does not cover this: it fires on `input.grounding.hasUnlabelledGeneratedAdditions` (`apps/api/src/lesson-validation.ts:586`), which concerns generated *claims* in the grounding pipeline, not image provenance.

Real mitigations exist — generation produces a candidate rather than an active asset, a teacher must accept it, moderation runs, and an hourly cap applies. They are weaker than they look here: `generateMissing` exists to enable bulk approval, and it presents a grounding-critical diagram slot identically to a decorative background slot. Nothing tells the teacher that accepting this candidate substitutes an invented picture for a factual diagram.

AVLP models *provenance* — where an asset came from — but not *epistemic role*, what it may be trusted for. `grep -rn "visualRole\|grounding_critical" packages` returns zero matches.

## Visual role table

| Visual role | Permitted acquisition in this release | Not permitted in this release |
| --- | --- | --- |
| `grounding_critical` — labelled diagrams, charts, factual figures, exact instructional text | Source figure, teacher-supplied asset, deterministic diagram or template | Generated image or generated motion as the factual visual |
| `source_derived` — a visual interpretation tied to cited source material | Source crop or cleanup, deterministic composition, teacher-approved generated illustration | Uncited or misleading transformation presented as source fact |
| `decorative` — texture, atmosphere, contextual background, non-factual establishing visual | Existing asset, licensed catalog, teacher-approved generated image | Required labels, factual assertions, timing-critical instruction |

## Scope

- [x] Add `visualRole` (`grounding_critical` | `source_derived` | `decorative`) to the slot-requirement contract in `@avlp/schemas`, and assign a role to every slot in `templateAssetSlotRequirements`.
- [x] Add provenance to `sceneAssetBindingSchema` and to `ResolvedSceneAsset` so the constraint is expressible and visible at render time.
- [x] Enforce, as a schema refinement, that a `grounding_critical` slot cannot resolve to an `ai_generated` asset.
- [x] Require a source reference for `grounding_critical` and `source_derived` slots.
- [x] Exclude non-`decorative` slots from `generateMissing()` (`apps/api/src/illustration-generation.ts`).
- [x] Reject a single-slot generation request whose target slot is not `decorative`, in `request()` alongside the existing template/slot check.
- [x] ~~Backfill existing scenes and bindings with a conservative default; document the default and ship the migration.~~ **Deviation — no migration.** Visual role is derived from the immutable template registry, never read from persisted rows, so there is nothing to backfill. Persisted bindings written before this story carry no `provenance` and are grandfathered at the contract boundary; they can still be read and rendered but can never be re-bound to a non-decorative slot (enforced at write time against the asset's real provenance). Shipping a data migration that writes `visualRole` into `scenes.asset_requirements` was rejected because that column's contract (`storyboardAssetRequirementSchema`) is `.strict()` and no code consumes the field. See the Dev Agent Record.

## Technical Implementation Requirements

- The constraint is a schema refinement, not a call-site check. A future caller must be unable to bypass it by writing a new endpoint.
- Assign `visualRole` per **slot requirement**, not per scene. `labelled-diagram.diagram` is grounding-critical; `analogy.central-visual` is not. The role belongs to the slot's meaning, which the template already knows.
- Changes are additive and versioned. Existing consumers must continue to work against the previous contract version until migrated.
- Backfill defaults to the safest role for existing data. Any slot whose role is ambiguous at migration time defaults to `grounding_critical`, which fails closed.
- Provenance reaching `ResolvedSceneAsset` must not widen what the renderer fetches. It is metadata for validation and display only.
- Enforcement must hold on both the single-slot and bulk generation paths, and again at binding time, so an asset generated before this story cannot be bound afterwards.

## Contracts and Persistence

- `visualRoleSchema` enum exported from `@avlp/schemas`.
- `sceneAssetSlotRequirementSchema` gains `visualRole`.
- `sceneAssetBindingSchema` gains asset provenance, or a validated derivation of it.
- `ResolvedSceneAsset` gains provenance.
- ~~A migration assigning `visualRole` to persisted scene asset requirements~~ — not shipped; visual role is derived from the template registry, not persisted. See Scope and the Dev Agent Record.
- No new table is required.

## Interfaces

- API: `request()` and `generateMissing()` in `apps/api/src/illustration-generation.ts` reject or skip non-decorative slots.
- API: the asset binding path rejects a grounding-critical slot bound to an `ai_generated` asset.
- Schemas: `sceneAssetSlotRequirement()` returns the role alongside the existing requirement.
- Scene library: `scene-registry.tsx` validation may read provenance.

## Acceptance Criteria

- [x] Binding an `ai_generated` asset to a `grounding_critical` slot fails validation with a typed error naming the scene and slot. (`aiGeneratedAssetInGroundingSlot` in `apps/api/src/storyboard.ts`; schema refinement on `sceneSpecSchema`.)
- [x] `generateMissing()` on a lesson containing an unbound `labelled-diagram.diagram` slot queues no work for that slot, and reports it as skipped rather than failing the run. (`illustration-generation.ts`; existing test "never queues generation for a grounding-critical diagram slot".)
- [x] A single-slot generation request targeting a non-`decorative` slot is rejected with a typed 400, not a generic validation failure. (`request()` in `illustration-generation.ts`; test added.)
- [x] A `grounding_critical` or `source_derived` slot without a source reference fails validation. (`assetBindingComplianceIssues` / `assetBindingRoleViolations`; `missingSourceReferenceForSlot` for catalog/teacher-uploaded assets. A **source figure** resolves to an extracted figure in this project's parsed document, so it is a citation to source material by construction and satisfies the requirement without a `sourceRef` field; the source-figure binding path still validates binding role and rejects a non-`source_figure` declared provenance — see `assertAuthorizedAssetBindings`.)
- [x] An asset generated before this story cannot be bound to a grounding-critical slot after it. (`assertAuthorizedAssetBindings` checks the asset's real `projectAssets.provenance`; test added.)
- [x] Every existing lesson version remains valid, and every existing fixture still renders. New binding fields are `.optional()`; legacy bindings (no `provenance`) are grandfathered by `assetBindingComplianceIssues`. All existing schema/storyboard/scene tests pass unchanged.
- [x] Provenance is available to the scene layer at render time. (`ResolvedSceneAsset.provenance`, populated by `PreviewManifestService` and passed through `preview-player.tsx` → runtime.)
- [x] A cross-tenant binding attempt is rejected. (Pre-existing tenant scoping in `assertAuthorizedAssetBindings` preserved; existing test "does not reveal the asset binding endpoint across tenants".)

## Required Tests

- [x] Unit: every `visualRole` × provenance combination, permitted and rejected. (`packages/schemas/src/visual-role.test.ts` — `assetBindingRoleViolations` is a pure `slotRole × provenance × hasSourceRef` function tested across all 3 × 4 combinations; `assetBindingComplianceIssues` maps its result onto scene bindings.)
- [x] Unit: the schema refinement cannot be bypassed by constructing a binding directly. (`visual-role.test.ts` — "cannot be bypassed by omitting visualRole on the binding", plus the standalone `sceneAssetBindingSchema` guard.)
- [x] Unit: default role fails closed. (`slotRequirement` defaults to `grounding_critical`; `sceneAssetSlotRequirementSchema` rejects a missing `visualRole`; test added.)
- [x] Integration: `generateMissing()` on a lesson with an unbound labelled-diagram slot queues nothing for it. (`illustration-generation.test.ts`.)
- [x] Integration: single-slot request refused for a grounding-critical target with the correct error code. (`illustration-generation.test.ts` — typed `validation_failed` 400.)
- [x] Integration: binding an already-generated asset to a grounding-critical slot is refused. (`storyboard-scene-editor.test.ts` — plus positive/negative source-figure coverage: an included figure is allowed in the diagram slot, a role-mismatched figure is rejected.)
- [x] ~~Migration: existing fixtures and lesson versions validate after backfill.~~ No migration (see Scope). Covered instead by `visual-role.test.ts` — "still parses a legacy scene whose bindings predate provenance" — and the unchanged storyboard/scene-editor suites.
- [x] Authorization: cross-tenant binding and cross-tenant generation request are rejected. (Pre-existing `storyboard.test.ts` coverage; behaviour unchanged.)

## Out of Scope

- Generated motion clips.
- Licensed catalog or archive retrieval.
- Teacher-facing UI for editing a visual role. ST-089 displays the role; nothing in this release lets a teacher change it.
- Relaxing the restriction for `source_derived` slots. This story permits teacher-approved generated illustrations there per the table, but building that approval flow is ST-089's concern.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, and test commands pass for affected workspaces. `apps/web` typecheck/build to be confirmed in CI (no direct references to changed symbols).
- [x] ~~Migration is written…~~ No migration — visual role is derived, not persisted. Repository owner ratified this on review (2026-09-03); Contracts/Persistence updated accordingly.
- [x] The chosen role assignment and fail-closed default are documented in the Dev Agent Record.
- [x] Shared contracts in `@avlp/schemas` are updated (additively) before API, worker, renderer, and UI consumers.
- [x] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-059, which this story directly extends. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md` before implementation.
- ~~An interim mitigation is available…~~ Superseded: the full contract work landed. `generateMissing` and `request` now gate on `visualRole`, not `bindingRole === "diagram"`.
- Derived from `docs/claude_openmontage-final-consolidated.md` §4.1–4.2. The visual-role table originates in the Codex roadmap and is retained because it states the boundary more clearly than the alternative.

## Dev Agent Record

- **Agent:** Claude Sonnet 5 (code review + fixes)
- **Started:** 2026-09-03
- **Completed:** 2026-09-03
- **Branch/PR:** `story/st-085`
- **Files changed:**
  - `packages/schemas/src/index.ts` — `visualRoleSchema`, `assetProvenanceSchema` (moved earlier for use by the binding schema); `sceneAssetSlotRequirementSchema.visualRole` (required); `sceneAssetBindingSchema` gains `provenance`/`visualRole`/`sourceRef` (all optional) + a template-independent self-guard; `sceneSpecSchema` gains a `.superRefine` calling the new exported `assetBindingComplianceIssues(template, bindings)`; `slotRequirement()` default role is now `grounding_critical` (fail closed) with every decorative slot assigned `decorative` explicitly; `previewManifestSchema` asset entries gain optional `provenance`.
  - `apps/api/src/illustration-generation.ts` — `generateMissing()` skips any slot whose `visualRole !== "decorative"`; `request()` rejects a non-decorative target with a typed 400 naming scene/slot.
  - `apps/api/src/storyboard.ts` — `bindCatalogAsset()` rejects any non-decorative slot (catalog is decorative-only) instead of fabricating a `sourceRef`; `assertAuthorizedAssetBindings()` enforces role rules against the asset's *real* `projectAssets.provenance` and emits typed, scene/slot-naming errors (`aiGeneratedAssetInGroundingSlot`, `nonDecorativeSlotRejectsGeneratedOrCatalog`, `missingSourceReferenceForSlot`); scene reference threaded through for the messages; a dedicated source-figure loop validates binding role and rejects a non-`source_figure` declared provenance (a resolved figure is a citation by construction, so no `sourceRef` field is demanded).
  - `apps/api/src/preview-manifest.ts` — resolves and emits `provenance` for each asset.
  - `packages/scene-library/src/scene-registry.tsx` — `ResolvedSceneAsset.provenance` (optional).
  - Tests: `packages/schemas/src/visual-role.test.ts` (new, incl. the pure `assetBindingRoleViolations` 3 × 4 matrix), additions to `apps/api/src/illustration-generation.test.ts` and `apps/api/src/storyboard-scene-editor.test.ts` (catalog rejection, pre-generated-asset rejection, source-figure allow + role-mismatch reject).
- **Migrations:** None. See Decisions. `_journal.json` is unchanged from `main`.
- **Commands/tests:**
  - `tsc --noEmit` — `packages/schemas`, `apps/api`, `packages/scene-library`, `apps/pipeline-worker`: pass.
  - `eslint` on all changed source/test files: pass.
  - `vitest run packages/schemas` — 281 pass (263 existing + 18 new in `visual-role.test.ts`).
  - `vitest run apps/api/src/{illustration-generation,storyboard,storyboard-scene-editor,storyboard-service,storyboard-scene-regeneration-service,approved-assets,lesson-validation,preview-manifest}.test.ts` — all pass (`illustration-generation` +1, `storyboard-scene-editor` +4).
  - `vitest run apps/pipeline-worker/src/{storyboard-job,scene-regeneration-job}.test.ts` — pass.
  - Known pre-existing, unrelated failures on this machine: 3 `packages/scene-library` render-hash snapshot tests (`summary-scene-render` and two others) fail identically on `main` (`git stash` confirmed) — environment-specific canvas/font rendering, not touched by this story.
- **Screenshots/output:** n/a (no user-facing UI in scope).
- **Decisions/assumptions:**
  - **Enforcement is a schema refinement on `sceneSpecSchema`, keyed off the immutable template registry**, not a per-binding field or a call-site check. `assetBindingComplianceIssues()` recomputes the slot's role from `sceneAssetSlotRequirement(template, slot)` for every binding, so a binding constructed without `visualRole` cannot bypass it. The write-time check in `assertAuthorizedAssetBindings()` is a second, DB-authoritative layer that resolves the asset's real provenance.
  - **Only `labelled-diagram.diagram` is `grounding_critical`.** It carries the scene's factual labelled visual. Every other declared slot is a supporting/establishing visual with no required labels or factual assertions and is `decorative`. No slot is `source_derived` this release (the teacher-approved generated-illustration flow for those is ST-089). Ambiguity fails closed: `slotRequirement()` now defaults to `grounding_critical`.
  - **No migration.** Visual role is derived from code, never persisted-and-read, so there is no data to backfill. Persisted bindings from before this story have no `provenance` and are grandfathered by `assetBindingComplianceIssues` (they render; they cannot be re-bound to a non-decorative slot). A migration writing `visualRole` into `scenes.asset_requirements` was rejected: that column's contract `storyboardAssetRequirementSchema` is `.strict()` (only `slot`, `purpose`), the strict-parsed authoritative copy lives in `lessonSpecs.payload`, and nothing consumes the field.
  - Contract changes are additive: `sceneAssetBindingSchema` and `previewManifestSchema` gain only optional fields; `sceneAssetSlotRequirementSchema.visualRole` is required but that schema is only ever built from code (`slotRequirement()`), never parsed from stored data.
- **Deviations:**
  - Story Scope / Contracts / Required Tests call for a migration and a migration test; shipped without one (rationale above). **Ratified by the repository owner on review (2026-09-03).** No ADR required — no persisted contract version changed and no PRD criterion is dropped. Contracts/Persistence and Definition of Done updated to match.
- **Review follow-ups (tracked, not blocking Done):**
  - `apps/web` typecheck/build to be confirmed in CI. No direct references to the changed symbols; `sceneSpecSchema` (now `ZodEffects`) is consumed only via `.parse`/`.safeParse`, manifest `provenance` is optional. Low risk, unverified here.
  - A catalog asset can no longer be bound to `labelled-diagram.diagram` (previously possible). Matches the visual-role table (catalog = decorative-only); ST-089's UI should surface the alternatives (source figure / teacher upload / shapes).
  - Self-declared `provenance: "ai_generated"` on a client `PUT` is rejected by the schema refinement (slot-named message) before the scene-named `aiGeneratedAssetInGroundingSlot` error can fire. The realistic path (undeclared provenance → DB check) produces the fully-typed error. Optional: hoist the friendly error to the route handler for the parse-failure case.
  - The 3 pre-existing `packages/scene-library` render-snapshot failures and the cwd-relative path bug in `apps/api/src/lesson-versions.test.ts` ("enforces immutable version rows", references migration `0045`) fail identically on `main` and should be triaged separately.
- **Known risks:**
  - Source-figure bindings to non-decorative slots are accepted as self-citing (no `sourceRef` field). Correct per the visual-role table, and binding role / declared provenance are still validated, but ST-089's approval/display work should keep this consistent.
