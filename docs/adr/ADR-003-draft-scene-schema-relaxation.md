# ADR-003: Draft Storyboard Scene Schema Relaxation

## Status
Accepted

## Context

The MVP requires teachers to add, duplicate, reorder, and delete storyboard scenes during the editing phase (E12-US2, E12-US3). A newly added scene starts without narration blocks or source citations — the teacher grounds it later during scene editing (ST-056).

The existing `LessonSpec` contract (v1.8) enforces:
- `sceneBaseShape.sourceRefs`: `.min(1)` — every scene must cite ≥1 source block
- `lessonStoryboardSceneSchema.narrationBlockIds`: `.min(1)` — every scene must cover ≥1 narration block

These constraints are correct for the *final approved LessonSpec* but prevent persisting a valid draft scene that is still being authored.

## Decision

Relax the draft-scene constraints while preserving the grounding rule at the versioned `LessonSpec` level:

1. **`sceneBaseShape.sourceRefs`**: change `.min(1).max(100)` → `.max(100)` (allow empty for draft)
2. **`lessonStoryboardSceneSchema.narrationBlockIds`**: change `.min(1).max(100)` → `.max(100)` (allow empty for draft)
3. **`lessonSpecSchema`**: add a `superRefine` that enforces ≥1 `sourceRefs` per scene — this preserves the grounding rule at the versioned `LessonSpec` contract (v1.8) level.

The `LessonSpec` version remains **1.8**; no version bump is needed because the effective contract for consumers of `LessonSpec` is unchanged — the superRefine rejects any LessonSpec with uncited scenes.

## Consequences

**Positive**
- Teachers can add/duplicate scenes without pre-filling citations.
- No LessonSpec version bump; existing pipeline worker, citations, grounding, and renderer code paths are unaffected.
- Single source of truth for the grounding rule: `lessonSpecSchema` superRefine.

**Negative**
- `sceneSpecSchema` (used by both draft and final) now permits empty `sourceRefs` in isolation. Consumers that validate a *standalone* `SceneSpec` (e.g., `scene-registry.tsx`'s `validateScene`) will accept uncited scenes. This is acceptable because:
  - The renderer does not require citations.
  - The grounding service and citations UI handle uncited scenes gracefully (showing "unsupported").
  - The final LessonSpec validation catches uncited scenes before approval/render.

**Risks**
- If a new consumer reads `LessonStoryboard` scenes directly and assumes `sourceRefs` is non-empty, it may misbehave. Mitigation: document the invariant in the schema JSDoc.

## Alternatives Considered

1. **Keep min(1) and require placeholder citations**: Rejected — placeholder IDs would pollute citation resolution and grounding checks.
2. **Introduce a separate `DraftSceneSpec` schema**: Rejected — adds schema duplication and divergence; the single superRefine on `lessonSpecSchema` is simpler.
3. **Bump LessonSpec to v1.9**: Rejected — the effective contract for `LessonSpec` consumers is unchanged; version bump would require migration tooling without benefit.

## Implementation

- `packages/schemas/src/index.ts`:
  - Line 85: `sourceRefs: z.array(sourceRefSchema).max(100)` (removed `.min(1)`)
  - Line 4994: `narrationBlockIds: z.array(identifierSchema).max(100)` (removed `.min(1)`)
  - Lines 561-565: `lessonSpecSchema.superRefine` enforces ≥1 `sourceRefs` per scene

## Related
- ST-055 (Reorder, Add, Duplicate, and Delete Storyboard Scenes)
- ST-056 (Schema-Driven Scene Editing and Template Switching) — will edit these draft scenes
- ST-053 (Grounding Recheck) — handles uncited scenes
- ADR-001 (TypeScript-First MVP Stack)