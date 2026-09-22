# ADR-005: Versioned style packs for multi-style video

## Status

**Accepted** — 2026-09-22, by ST-102. The product owner directed teacher-facing
style selection for all teachers, not a pilot cohort, superseding the PRD's
one-production-theme constraint (E11-US2). ADR-010 (2026-09-20) had already
matured the pack catalogue to production quality for this transition; this
entry records the scope decision that makes it teacher-facing. The known
Editorial photographic-supply gap (see Open Questions) is not resolved by this
acceptance — a scene that needs a photograph the catalogue cannot supply still
fails explicitly rather than substituting a different design.

## Context

`docs/creative-styles-technical-research.md` recommended versioned style packs
inside the existing TypeScript/Remotion architecture, and recommended proving
three of them on identical content before committing to production work.
ST-094 built that proof.

The current production contracts assume exactly one visual design:

| Surface | Current state |
| --- | --- |
| `packages/design-system/src/video-theme.ts` | `id: "mvp-default"` as a literal type; colour, typography, layout and motion in one frozen object |
| `packages/design-system/src/video-theme-provider.tsx` | Always provides that singleton |
| `packages/scene-library/src/scene-registry.tsx` | Ten semantic scene types, one component each |
| `packages/schemas/src/index.ts` | Lesson configuration constrains `theme` to `mvp-default` |
| `apps/renderer/src/contracts.ts` | Render identity hashes composition, assets, profile and `renderImplementationVersion` — no design version |

All ten scene components import `videoTheme` directly, so a provider-only change
would leave every consumer unchanged. This is the compatibility problem any
production rollout has to solve.

ST-094 deliberately did **not** solve it. It built an isolated proof:
`@avlp/schemas/style-proof`, `@avlp/design-system/style-proof-tokens` and
`@avlp/scene-library/style-proof`, with its own Remotion root, its own
development route and its own bundled fixtures. No production schema, theme
enum, composition or render identity changed, and the production render worker's
bundle is untouched.

## Decision (proposed)

### 1. Keep the semantic model; version the presentation around it

Continue to separate three concepts, as the proof does:

- **Semantic scene** — what the lesson explains (`SceneSpec`, unchanged).
- **Style pack** — a coherent visual direction plus its version.
- **Treatment** — one authored way a pack presents one semantic scene type.

The proof confirms this is workable: nine treatments over three semantic types
required no new scene type, no change to `sceneSpecSchema`, and no per-subject
component fork (a second subject rendered through the same nine treatments).

### 2. Persist the resolved design in the LessonSpec, not a side manifest

Resolution happens once, at authoring time; rendering consumes the resolved
selection and never re-resolves. The proof's `styleProofSelectionSchema` shape
is the recommended starting point:

```json
{
  "design": {
    "pack": { "id": "editorial", "version": "1.0.0" },
    "sceneDesigns": {
      "<sceneId>": {
        "treatmentId": "comparison.evidence-panels",
        "treatmentVersion": "1.0.0",
        "assetBySlot": { "evidence-left": "<assetId>" }
      }
    }
  }
}
```

Putting this directly in a new `LessonSpec` version is preferred over a separate
design manifest, per the research recommendation, **but the schema-version number
must not be chosen until a compatibility audit of every `LessonSpec` consumer is
complete.** That audit is production work this ADR does not perform.

Existing lessons without a `design` block read as `mvp-default` through an
explicit legacy path. Immutable approved versions are never rewritten.

### 3. Reject rather than substitute

The proof's resolver behaviour should carry into production unchanged: unknown
pack, unknown treatment, unsupported version, cross-pack treatment, scene-type
mismatch, missing required asset, unsupported asset kind and
below-minimum-resolution media each produce a structured, field-specific failure
with an actionable correction. The newest version is never selected
automatically, and no alternative design is ever substituted for an approved one.

### 4. Retain implementations, not just version strings

A pack version string does not reproduce a render. The proof's manifest records
the hashed resolved input, resolved treatments, asset checksums, audio
checksums, pinned font faces with weights and file checksums, motion parameters,
the frame timeline, the output profile and the renderer identity. Production
must retain the implementation bundle and its dependencies for any version it
promises to reproduce (CR-03), and return a specific rerender-unavailable reason
when it cannot.

### 5. Extend render identity to cover design

`renderImplementationVersion` in `apps/renderer/src/contracts.ts` must gain the
resolved pack/treatment versions, font file checksums and asset transformation
settings, so changing a treatment invalidates the correct render identity.
Credential refresh and temporary paths must continue not to.

## Consequences if accepted

**Scope update required.** The PRD's E11-US2 and the epic technical guide state
one theme. Accepting this decision requires an explicit, recorded scope change;
this ADR does not grant it.

**Production follow-up work**, none of which ST-094 performed:

1. Compatibility audit of every `LessonSpec` consumer, then a schema version.
2. Legacy read path mapping absent `design` to `mvp-default`.
3. Refactor the ten scene components off their direct `videoTheme` import onto
   an explicitly injected resolved pack, preserving default appearance exactly.
4. Full coverage: three packs across all ten semantic types (thirty
   combinations), not the three proved here.
5. Render identity, preflight and retention changes above.
6. Teacher-facing selection, preview and upgrade flows (ST-096, ST-097).

**Costs measured in the proof** are recorded in
`docs/creative-styles-proof-evaluation.md` and should set budgets; they are not
invented here.

## Open questions this ADR does not settle

- **Photographic supply for Editorial.** The proof used original generated
  raster imagery because no licensed photograph library exists in this
  repository. Editorial's composition, crop policy, tonal treatment and
  annotation anchoring are proven; its photographic quality is not. Production
  needs a decided licensing and sourcing route before Editorial ships.
- **Narration realism.** The proof used a synthetic narration bed at the
  authored duration, not recorded speech. Timing, caption alignment and audio
  presence are proven; prosody and intelligibility against a style are not.
- **Whether three packs is the right first set.** Systems, Field Notes and
  Prism remain unbuilt (ST-101).
- **Motion-energy controls.** CR-05's calm/balanced/lively axis is declared in
  the proof's motion parameters but only exercised at one setting.

## Alternatives considered

**A shared component with style flags.** Rejected. The research and the proof
both show the three styles differ in composition and hierarchy, not only in
colour and type; a single component with dozens of flags would make each style
worse and would not survive adding Systems or Prism.

**A separate versioned design manifest referenced by the lesson snapshot.**
Deferred rather than rejected. It is the fallback if the compatibility audit
finds a concrete reason direct `LessonSpec` integration is unsafe.

**Importing Canva templates, PSD layer trees or Fusion macros at runtime.**
Rejected for this milestone, per the research: no demonstrated general bridge
preserves editable layout, typography, effects and motion in our renderer, and
Canva's content licence should not be assumed to cover redistribution inside our
template system.
