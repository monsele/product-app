---
story_id: ST-085
title: "Introduce Visual Role and Enforce Provenance at Asset Binding"
phase: "05 — Storyboard Editing, Assets, and Versions"
status: Ready
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

- [ ] Add `visualRole` (`grounding_critical` | `source_derived` | `decorative`) to the slot-requirement contract in `@avlp/schemas`, and assign a role to every slot in `templateAssetSlotRequirements`.
- [ ] Add provenance to `sceneAssetBindingSchema` and to `ResolvedSceneAsset` so the constraint is expressible and visible at render time.
- [ ] Enforce, as a schema refinement, that a `grounding_critical` slot cannot resolve to an `ai_generated` asset.
- [ ] Require a source reference for `grounding_critical` and `source_derived` slots.
- [ ] Exclude non-`decorative` slots from `generateMissing()` (`apps/api/src/illustration-generation.ts:94`).
- [ ] Reject a single-slot generation request whose target slot is not `decorative`, in `request()` alongside the existing template/slot check.
- [ ] Backfill existing scenes and bindings with a conservative default; document the default and ship the migration.

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
- A migration assigning `visualRole` to persisted scene asset requirements, with the documented conservative default.
- No new table is required.

## Interfaces

- API: `request()` and `generateMissing()` in `apps/api/src/illustration-generation.ts` reject or skip non-decorative slots.
- API: the asset binding path rejects a grounding-critical slot bound to an `ai_generated` asset.
- Schemas: `sceneAssetSlotRequirement()` returns the role alongside the existing requirement.
- Scene library: `scene-registry.tsx` validation may read provenance.

## Acceptance Criteria

- [ ] Binding an `ai_generated` asset to a `grounding_critical` slot fails validation with a typed error naming the scene and slot.
- [ ] `generateMissing()` on a lesson containing an unbound `labelled-diagram.diagram` slot queues no work for that slot, and reports it as skipped rather than failing the run.
- [ ] A single-slot generation request targeting a non-`decorative` slot is rejected with a typed 400, not a generic validation failure.
- [ ] A `grounding_critical` or `source_derived` slot without a source reference fails validation.
- [ ] An asset generated before this story cannot be bound to a grounding-critical slot after it.
- [ ] Every existing lesson version remains valid after backfill, and every existing fixture still renders.
- [ ] Provenance is available to the scene layer at render time.
- [ ] A cross-tenant binding attempt is rejected.

## Required Tests

- [ ] Unit: every `visualRole` × provenance combination, permitted and rejected.
- [ ] Unit: the schema refinement cannot be bypassed by constructing a binding directly.
- [ ] Unit: backfill default is applied to ambiguous slots and fails closed.
- [ ] Integration: `generateMissing()` on a lesson with an unbound labelled-diagram slot queues nothing for it.
- [ ] Integration: single-slot request refused for a grounding-critical target with the correct error code.
- [ ] Integration: binding an already-generated asset to a grounding-critical slot is refused.
- [ ] Migration: existing fixtures and lesson versions validate after backfill.
- [ ] Authorization: cross-tenant binding and cross-tenant generation request are rejected.

## Out of Scope

- Generated motion clips.
- Licensed catalog or archive retrieval.
- Teacher-facing UI for editing a visual role. ST-089 displays the role; nothing in this release lets a teacher change it.
- Relaxing the restriction for `source_derived` slots. This story permits teacher-approved generated illustrations there per the table, but building that approval flow is ST-089's concern.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] Migration is written, reversible where practical, and applied cleanly to a database seeded from existing fixtures.
- [ ] The chosen backfill default is documented in the migration and in the Dev Agent Record.
- [ ] Shared contracts in `@avlp/schemas` are updated and versioned before API, worker, renderer, and UI consumers.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-059, which this story directly extends. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md` before implementation.
- An interim mitigation is available and much smaller than this story: filter `generateMissing`'s `missing` list to exclude slots whose `bindingRole` is `"diagram"`. If the full contract work cannot be scheduled promptly, apply that first and note it here.
- Derived from `docs/claude_openmontage-final-consolidated.md` §4.1–4.2. The visual-role table originates in the Codex roadmap and is retained because it states the boundary more clearly than the alternative.

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
