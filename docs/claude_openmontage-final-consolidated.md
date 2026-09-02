---
title: "OpenMontage Learnings — Final Consolidated Plan"
author: Claude (Opus 5), consolidating work by Claude and Codex
date: 2026-09-02
status: Discovery and story-planning input — no implementation is authorized by this document
supersedes:
  - docs/claude_openmontage-comparative-findings.md
  - docs/claude_openmontage-reconciled-findings.md
  - docs/reference/codex_openmontage_asset-generation-discovery.md
  - docs/reference/codex_openmontage_reconciled-roadmap.md
source: https://github.com/calesthio/OpenMontage @ main (sparse clone of remotion-composer/, pipeline_defs/, schemas/)
---

# OpenMontage Learnings — Final Consolidated Plan

Single successor to four discovery documents written by two authors. All four are superseded.

This document keeps only what survived review: the conclusions both authors reached
independently, the points where the Codex documents were right and the Claude documents were
wrong, and the code-level findings that emerged from verifying both.

**Evidence grading.** `[verified]` = checked against a working-tree file on 2026-09-02, path
cited. `[judgement]` = design opinion, arguable. `[unconfirmed]` = plausible, not established;
check before the dependent story is written.

**Sequencing note.** Section 5 supersedes the delivery order in every prior document. It changed
because of the trace in §4.1, which was completed after all four were written.

---

## 1. What both authors agree on

These were reached independently in separate documents. Treat them as settled.

### 1.1 The architecture decision

AVLP does **not** become an agent-operated video-production studio. The differentiated promise
is a teacher's document becoming a grounded, editable, visually useful lesson.

```text
Approved document
  → normalized, cited source package
  → approved, versioned LessonSpec
  → deterministic scene templates and Remotion timeline
  → validated immutable render manifest
  → MP4
```

> **The rule.** Remotion remains AVLP's compositor and timeline. External AI models may produce
> bounded, validated assets upstream of composition; they do not replace the lesson renderer.

### 1.2 The boundary

| AVLP continues to own | Optional provider may contribute |
| --- | --- |
| Document source of truth and provenance | Decorative illustrations, backgrounds, textures, non-factual B-roll |
| `NormalizedDocument`, `LessonSpec`, citations, versions | Source-derived visual candidates subject to approval |
| Scene selection, timing, captions, audio sync, final composition | A validated image or bounded short clip asset |
| Render readiness and deterministic blocking validation | Advisory visual-quality metadata only |
| Tenant access control, quotas, usage records, storage | Provider-specific generation capability |

### 1.3 The core principle

**Deterministic checks are the only blocking authority; model-assisted assessment may only
advise.** Both authors arrived at this separately — one as a cross-cutting rule, one as a
severity field on a review artifact. `[verified]` AVLP already implements it:
`validationIssueSchema` carries `severity` plus `acknowledgeable`, with a `superRefine`
enforcing *"Only validation warnings may be acknowledged"* — errors always block
(`packages/schemas/src/index.ts:7034`).

### 1.4 Adopt from OpenMontage

1. **Visual asset planning before generation** — the plan states the need, purpose, source
   connection, acquisition path, fallback, and cost.
2. **Runtime capability discovery** — provider availability and estimates are typed runtime
   facts, not hard-coded assumptions.
3. **Approval before consequential work** — covering provider, model, brief, output type, and
   cost; any change requires re-approval.
4. **Verified asset manifests** — composition receives checksummed private assets pinned to a
   lesson version and never fetches provider content mid-render.
5. **Representative visual QA** — contact sheets and frame inspection make output reviewable,
   while deterministic checks stay authoritative.
6. **Production decision audit** — record the selection, its rationale, and its approval.
7. **Motion as a first-class visual system** — deliberate, differentiated motion rather than one
   uniform transition feel.

### 1.5 Reject from OpenMontage

| Rejected | Why |
| --- | --- |
| YAML manifests / Markdown skills as runtime orchestration | Their manifests exist because there is no orchestrator. AVLP has `apps/pipeline-worker/` with 26 typed handlers. Trades type safety for nothing. |
| Agent web research as content source | The teacher's approved document is the source of truth. |
| Loose generic scene/cut objects | Their `Cut` is ~50 optional fields with `chartData?: any[]`, discriminated by `type?: string`. Strictly worse than `sceneSpecSchema`. |
| Arbitrary provider fallback after approval | Silently executes an approved plan with a different model. |
| Generative video as primary renderer | Cannot guarantee labels, timing, citations, or reproducibility. |
| Filesystem state as source of truth | Inappropriate for a multi-tenant product. |
| Governance rules expressed as prose | A workaround for having no type system. AVLP has one — encode the constraint. |
| Their `orchestration:` block (budget, send-backs, wall time) | Belongs in per-tenant database configuration. |
| A pipeline dependency-DAG manifest | Already covered by `story-manifest.json` and `TRACEABILITY_MATRIX.md`. |

### 1.6 The one transferable mechanism

`[verified]` OpenMontage splits every stage gate three ways — JSON Schema (hard fail),
`success_criteria` (checkable, hard gate), `review_focus` (fuzzy, soft). AVLP's layer 1 is
**stronger** than theirs: `@avlp/schemas` plus the `superRefine` cross-validation in
`full-lesson.tsx` checks narration tracks against timeline segments and caption cues against
scene bounds. Their JSON Schemas do not cross-validate.

The soft layer is where AVLP has the least — but far less than the Claude documents claimed.
See §3.1.

---

## 2. Where the Codex documents were right and mine were wrong

Recorded explicitly, because each of these changed the plan.

### 2.1 The storyboard review was largely duplicate work

`[verified]` `validationIssueCodeSchema` (`packages/schemas/src/index.ts:7010`) already contains
20 rule codes. Four of the five checks proposed in the Claude "structural quality review" story
already exist:

| Claude proposed as new | Already exists as |
| --- | --- |
| Every objective addressed by ≥1 scene | `objective_uncovered` |
| Scene text passes `measureSceneContent` | `text_overflow` |
| Duration within target band | `lesson_duration_mismatch`, `scene_duration_out_of_range` |
| Analogy scenes grounded in source | `grounding_missing`, `grounding_recheck_required` |
| No 3+ consecutive same-template scenes | **genuinely absent** |

The blocking/advisory mechanism proposed as new also already exists (§1.3). The Codex position —
add only the genuinely editorial check, as a versioned extension of the existing deterministic
validation engine, not as new logic in the storyboard worker — is correct. The story shrinks
from five checks to one.

### 2.2 A blocking finding must not fail the job

The Codex correction: *"Persist an editable candidate and actionable findings; do not fail a
generation job in a way that hides the candidate from the teacher. Make a candidate unapprovable
when a deterministic blocking rule fails. The teacher must still be able to inspect, edit, and
regenerate it."*

`[judgement]` This is strictly better than the Claude version, which had blocking findings fail
the job — destroying the artifact the teacher needs in order to fix the problem. Adopted.

### 2.3 Rejected alternatives need real alternatives

The Codex correction: in a single-provider release, recording "alternatives rejected" produces
synthetic audit noise. Record provider, model, version, reason, approval, estimate, and actual
cost; add alternatives only once AVLP genuinely evaluates more than one option. Adopted — the
story is gated accordingly.

### 2.4 Do not cite an unavailable skill

The Claude chart-token story cited a `dataviz` skill available to the authoring session but not
necessarily to the implementer. A story must state the contrast and colour-vision method inline.
Adopted.

### 2.5 Better framing worth keeping

`[judgement]` Three Codex artifacts are better than their Claude counterparts and are carried
forward:

- **The visual-role table** (§4.2 here) — three roles × permitted/forbidden approaches, legible
  to a non-engineer. The Claude version had only the enum and one rule.
- **The "what to preserve" framing** — naming existing strengths as things not to weaken is a
  different and useful question from "what is already built."
- **The cross-cutting requirements list** (§7 here) — correct and complete; retained close to
  verbatim.

---

## 3. Where the Claude documents were right and Codex's were wrong

### 3.1 Most of the proposed asset-generation work is already shipped

`[verified]` [ST-059 — Generate Limited Scene Illustrations with Review and Cost Controls](../stories/05-editor-assets-versioning/ST-059-generate-limited-scene-illustrations-with-review-and-cost-controls.md)
is **Done**, alongside ST-057 (asset catalog and picker) and ST-058 (teacher replacement assets).
Both Codex documents proposed this as greenfield work.

| Proposed as new | Already present |
| --- | --- |
| Binary-asset provider registry and capability contract | `IllustrationProvider` — `packages/provider-adapters/src/contracts.ts:89`; `MockIllustrationProvider`, `TogetherIllustrationProvider` |
| "Separate binary-asset adapter family; do not overload the structured-text adapter" | Already separate — and correct when it was implemented |
| Idempotent generation job with staging, validation, promotion, usage records | `apps/pipeline-worker/src/illustration-generation-job.ts` (253 LOC): conditional-`UPDATE` status claim, `sharp` format/dimension validation, SHA-256 checksum, `storageKeys.assetOriginal`, `usageRecords` with `idempotencyKey`, retryable/terminal classification |
| Approval gate before an asset becomes active | The job's docblock: *"Generates no active asset: successful output remains a moderated candidate for an explicit teacher decision."* Statuses `queued`/`generating`/`pending_review`/`accepted`/`rejected`/`failed` |
| Moderation before preview | `result.moderation.status !== "approved"` writes a failed usage record and rejects |
| Immutable content-hashed render manifest | `renderAssetManifestSchema` — `apps/renderer/src/contracts.ts:51`, `schemaVersion` literal, unique-storage-key `superRefine`; `renderJobPayloadSchema.manifest` carries `lessonVersionId`, `lessonVersionContentHash`, `validationRunId`, commented *"A versioned production manifest contains only immutable snapshot data"* |
| Provenance taxonomy | `assetProvenanceSchema` = `catalog` / `source_figure` / `teacher_uploaded` / `ai_generated` (`packages/schemas/src/index.ts:6610`) |
| "Prompts must not carry unnecessary source text" | `illustrationPrompt()` bounded to 160-char title + 400-char narration, commented *"approved source text is never sent to images"* |

`[judgement]` Reframed as a gap analysis against ST-059 rather than a greenfield sequence, the
residue is one substantial story (§4.1) plus one UX story (§4.5).

### 3.2 Process lesson for both authors

Each author audited one half of the codebase and proposed duplicate work in the other half:
Claude audited the asset layer and missed the validation engine; Codex audited validation and
missed the asset layer. The second Codex document added a checklist item to look for overlap but
did not perform the check.

The checklist in §8 now leads with three concrete actions rather than an intention.

---

## 4. Corrections and new findings from verification

Everything in this section post-dates all four source documents.

### 4.1 Generated imagery can currently fill a grounding-critical slot

`[verified]` This is the most consequential finding in this document and it reorders the plan.
Traced end to end; no provenance gate exists at any layer.

1. **`generateMissing()`** (`apps/api/src/illustration-generation.ts:55`) iterates every scene's
   persisted asset requirements and queues generation for **every unbound slot**. Its docstring:
   *"so a teacher does not have to click through each scene."* One call, whole lesson.
2. **`labelled-diagram` declares `slot: "diagram"` with `required: true`**
   (`packages/schemas/src/index.ts:6499`). An unbound diagram slot is exactly what
   `generateMissing` targets.
3. **The only gate checks template/slot support** (`illustration-generation.ts:191`):
   `sceneAssetSlotRequirement(template, slot) === undefined` → reject. For
   `("labelled-diagram", "diagram")` this returns a defined requirement, so it **passes**. The
   check asks whether the template has the slot, never whether the slot may hold generated
   content.
4. `acceptedKinds: ["illustration", "shape"]` constrains *catalog kind*, not provenance.
5. The worker generates with `illustrationPrompt()` — *"Create a simple flat educational
   supporting illustration for: {title}"*, style `flat-educational-vector`. A decorative prompt
   filling a factual slot.
6. The result becomes a `pending_review` candidate with `provenance: "ai_generated"`.
7. On accept it becomes a `projectAssets` row bound to the diagram slot.
8. **`sceneAssetBindingSchema` is `{ assetId, role, altText?, slot? }`**
   (`packages/schemas/src/index.ts:57`) — no provenance. The constraint is not expressible.
9. **`ResolvedSceneAsset` is `{ altText, assetId, source, src }`**
   (`packages/scene-library/src/scene-registry.tsx:80`) — no provenance. The scene and validation
   layer cannot distinguish a generated image from a source figure at render time.

`[verified]` `generated_addition_unlabelled` does not cover this: it fires on
`input.grounding.hasUnlabelledGeneratedAdditions` (`apps/api/src/lesson-validation.ts:586`) —
generated *claims* in the grounding pipeline, not image provenance.

`[verified]` **Real mitigations exist.** Generation produces a candidate, never an active asset;
a teacher must explicitly accept. Moderation runs on the provider result. An hourly rate cap
applies.

`[judgement]` **Those mitigations are weaker than they look here.** `generateMissing` exists to
enable bulk approval, and it presents a grounding-critical diagram slot identically to a
decorative background slot. Nothing in the data or the UI tells the teacher that accepting this
candidate substitutes an invented picture for a factual diagram. This is a product-correctness
gap, not a security hole — but the safe outcome depends on attention the batch flow is designed
to reduce.

### 4.2 Visual roles

`[verified]` `grep -rn "visualRole\|grounding_critical" packages` returns **zero matches**. AVLP
models *provenance* (where an asset came from) but not *epistemic role* (what it may be trusted
for). Different axes; only the first exists.

*(Table adapted from the Codex roadmap §5, which stated this better than the Claude original.)*

| Visual role | Permitted in first release | Not permitted in first release |
| --- | --- | --- |
| `grounding_critical` — labelled diagrams, charts, factual figures, exact instructional text | Source figure, teacher-supplied asset, deterministic diagram/template | Generated image or generated motion as the factual visual |
| `source_derived` — a visual interpretation tied to cited source material | Source crop/cleanup, deterministic composition, teacher-approved generated illustration | Uncited or misleading transformation presented as source fact |
| `decorative` — texture, atmosphere, contextual background | Existing asset, licensed catalog, teacher-approved generated image | Required labels, factual assertions, timing-critical instruction |

### 4.3 Diagram callout collisions block the render today

`[verified]` `packages/scene-library/src/scene-registry.tsx:665`:

```tsx
if (collisionLabelIds.length > 0)
  return [Object.freeze({
    code: "diagram_collision" as const,
    severity: "error" as const,
    suggestedCorrection: "Choose distinct semantic anchors for the affected labels.",
  })];
```

`severity: "error"`, and only warnings are acknowledgeable — so **errors always block**. A
colliding labelled diagram is un-renderable and the only remedy is the teacher manually
re-anchoring labels.

`[verified]` `planDiagramCallouts` maps nine named anchors to hardcoded pixel coordinates and
only *detects* overlap. The nine positions are tuned not to collide with one another, so overlap
means two labels claimed the **same anchor**. `[judgement]` The practical constraints are a hard
ceiling of nine labels per diagram and a blocking failure whenever the planner emits a duplicate
anchor.

### 4.4 Correction to an earlier Claude claim

`[verified]` `planDiagramCallouts` is imported by exactly two files —
`labelled-diagram-scene.tsx:8` and `scene-registry.tsx:39`. **Neither `process-scene.tsx` nor
`cause-effect-scene.tsx` uses it.**

The Claude reconciled document cited `diagram-layout.ts` as evidence for a process/cause-effect
motion story. Wrong file for that story. These are two distinct problems on separate code paths
and are now two stories (§5, items 2 and 3) sharing one layout primitive.

### 4.5 Contact-sheet UX

`[unconfirmed]` Candidate records exist with status, provenance, and cost; whether a comparison
surface exists in `apps/web` was not checked. Confirm before writing the story.

### 4.6 Theming

`[verified]` Across the ten scene components in `packages/scene-library/src/`: 21–34 `videoTheme.`
references each (~300 total) and **zero hardcoded hex colors** outside fixtures. OpenMontage
cannot match this — its demo props carry per-cut `backgroundColor` and components accept
cut-level color overrides, so a generated plan can silently defeat the theme.

`[verified]` AVLP's `videoTheme` also models what theirs does not: four named safe areas plus
`lowerThirdAvoidance`, four named motion presets (frames + cubic-bezier), and
`measureSceneContent()` overflow measurement. Theirs has one `springConfig` and no safe areas.

`[verified]` Their one structural advantage is selectable themes (4 vs 1). Every AVLP scene
imports the frozen singleton; `VideoThemeProvider`/`useVideoTheme` exist
(`packages/design-system/src/video-theme-provider.tsx`) but are unused — `grep -rn "useVideoTheme"
packages/scene-library/` returns nothing — and the provider hardcodes `value={videoTheme}` with no
`theme` prop.

`[judgement]` The trap if this is ever changed: `measureSceneText` and `measureSceneContent` close
over the singleton, so a second theme with a different `bodySize` would report `fits: true` for
content that overflows — silently. That risk, not the import churn, is the real cost. Deferred
(§6) unless a second theme is confirmed.

### 4.7 Asset path resolution

`[verified]` All asset sources today are signed HTTPS, `/catalog/*.svg`, or a loopback-HTTP dev
pattern. There is no local-filesystem read path, so OpenMontage's Windows drive-letter handling
solves a problem AVLP does not currently have. Conditional only (§6).

---

## 5. Delivery order

Supersedes the order in every prior document. Story IDs are **proposed** — `ST-084` is the
current maximum in `STORY_INDEX.md`. Confirm IDs, `epics`, and `prd_user_stories` against
`docs/reference/mvp-prd.md` before creating files.

| # | Proposed | Story | Why here |
| --- | --- | --- | --- |
| 1 | ST-085 | Visual role contract and binding enforcement | §4.1 — live gap on shipped behaviour |
| 2 | ST-086 | Dynamic labelled-diagram callout layout | §4.3 — live blocking error, manual-only fix; builds the layout primitive |
| 3 | ST-087 | Graph motion for process and cause-effect | Highest pedagogical payoff; reuses #2's primitive |
| 4 | ST-088 | Editorial monotony validation | One advisory check (§2.1) |
| 5 | ST-089 | Candidate contact-sheet review | Design against real failure modes; shows `visualRole` from #1 |
| 6 | ST-090 | Provider envelope with no silent fallback | Governance; low marginal risk while single-provider |

Items 1 and 2 both land on `labelled-diagram` from opposite directions — one stops the wrong
asset filling the slot, the other stops correct labels from blocking the render. Sequencing them
adjacently means one pass over that template's contract and tests.

### Immediate mitigation, ahead of story 1

`[judgement]` Story 1 is contract work — new enum, schema refinement, backfill, migration. A much
smaller change closes the batch path now: filter `generateMissing`'s `missing` list to exclude
slots whose `bindingRole` is `"diagram"` (`apps/api/src/illustration-generation.ts:94`).
Single-slot `request()` still allows it — deliberate, one scene, explicit — but the bulk path
stops auto-targeting grounding-critical slots. Recommended as a small fix, not a story.

---

### Story 1 — Visual Role Contract and Binding Enforcement

```yaml
story_id: ST-085          # proposed
title: "Introduce Visual Role and Enforce Provenance at Asset Binding"
phase: "05 — Storyboard Editing, Assets, and Versions"   # proposed
status: Draft
priority: must-have
epics: []                 # confirm against docs/reference/mvp-prd.md
prd_user_stories: []
depends_on: ["ST-057", "ST-058", "ST-059"]
```

**Story.** As a teacher, I want the system to distinguish visuals that carry factual weight from
visuals that are decorative, so that generated imagery can never stand in for content a learner
is expected to trust.

**Outcome.** Every scene visual carries a `visualRole`. Binding a generated asset to a
grounding-critical slot is structurally impossible — enforced by the schema, not by convention.

**Required reading.** `AGENTS.md`; `docs/reference/mvp-prd.md`;
`docs/reference/epic-technical-implementation-guide.md`; ST-057, ST-058, ST-059; §4.1–4.2 above.

**Scope.**
- [ ] Add `visualRole` (`grounding_critical` | `source_derived` | `decorative`) to the scene visual and slot-requirement contracts in `@avlp/schemas`, per the §4.2 table.
- [ ] Add provenance to `sceneAssetBindingSchema` and `ResolvedSceneAsset` so the constraint is expressible and visible at render time.
- [ ] Enforce at the schema boundary that a `grounding_critical` slot cannot resolve to an `ai_generated` asset.
- [ ] Require a source reference for `grounding_critical` and `source_derived` roles.
- [ ] Exclude grounding-critical slots from `generateMissing()`.
- [ ] Reject a single-slot generation request whose target slot is `grounding_critical`.
- [ ] Backfill existing scenes with a conservative default; document the default and the migration.

**Technical implementation requirements.**
- The constraint is a schema refinement, not a call-site check — a future caller must be unable to bypass it.
- Additive and versioned; existing consumers keep working.
- Backfill defaults to the safest role for existing data.

**Acceptance criteria.**
- [ ] A binding of an `ai_generated` asset to a `grounding_critical` slot fails validation with a typed error.
- [ ] `generateMissing()` does not queue work for any grounding-critical slot.
- [ ] A single-slot generation request targeting a grounding-critical slot is rejected with a typed error.
- [ ] `grounding_critical` and `source_derived` visuals without a source reference fail validation.
- [ ] Existing lesson versions remain valid after backfill.
- [ ] Provenance is available to the scene layer at render time.

**Required tests.**
- [ ] Unit — every role/provenance combination, permitted and rejected.
- [ ] Integration — `generateMissing()` on a lesson containing an unbound labelled-diagram slot queues nothing for it.
- [ ] Integration — single-slot request refused for a grounding-critical target.
- [ ] Migration — existing fixtures validate post-backfill.
- [ ] Authorization — cross-tenant binding rejected.

**Out of scope.** Generated motion. Licensed catalog retrieval. UI for editing the role (story 5
displays it).

---

### Story 2 — Dynamic Labelled-Diagram Callout Layout

```yaml
story_id: ST-086          # proposed
title: "Replace Fixed Diagram Callout Anchors with Automatic Layout"
phase: "01 — Visual Runtime Proof"          # proposed
status: Draft
priority: must-have
epics: []
prd_user_stories: []
depends_on: ["ST-011", "ST-018"]
```

**Story.** As a teacher, I want diagram labels placed automatically without overlapping, so that
a diagram with many labels renders instead of blocking on a manual re-anchoring task.

**Outcome.** Callout placement is computed from label content and diagram geometry, resolving
collisions rather than reporting them. The nine-label ceiling is removed.

**Problem evidence.** §4.3 — `diagram_collision` is `severity: "error"`, always blocking, and its
`suggestedCorrection` asks the teacher to *"Choose distinct semantic anchors."*

**Scope.**
- [ ] Replace the fixed anchor table in `packages/scene-library/src/diagram-layout.ts` with an automatic placement algorithm that resolves overlap.
- [ ] Preserve semantic anchor *preference* as a hint where authors supply one; do not accept raw pixel coordinates.
- [ ] Keep `diagram_collision` as a rule for genuinely unsatisfiable cases; it should fire far less often.
- [ ] Update `scene-registry.tsx` validation and `labelled-diagram-scene.tsx` rendering.

**Technical implementation requirements.**
- Layout must be deterministic — identical input yields identical output, or preview and render diverge.
- Placement respects `videoTheme.safeAreas` and `lowerThirdAvoidance`.
- Leader lines must still connect each callout to its target.

**Acceptance criteria.**
- [ ] A diagram with more than nine labels lays out without overlap.
- [ ] Two labels requesting the same semantic anchor are placed without collision rather than blocking.
- [ ] Layout is deterministic across repeated runs for identical input.
- [ ] `diagram_collision` still fires when placement is genuinely impossible.
- [ ] Existing labelled-diagram fixtures render without visual regression.

**Required tests.**
- [ ] Unit — determinism; collision resolution at label counts spanning the old ceiling; duplicate-anchor input.
- [ ] Unit — placement respects safe areas.
- [ ] Render parity — preview and render agree.
- [ ] Regression — existing fixtures.

**Out of scope.** Other scene templates. Graph motion (story 3). Teacher-facing layout controls.

---

### Story 3 — Graph Motion for Process and Cause-Effect

```yaml
story_id: ST-087          # proposed
title: "Pilot Graph-Based Deterministic Motion for Process and Cause-Effect Scenes"
phase: "01 — Visual Runtime Proof"          # proposed
status: Draft
priority: must-have
epics: []
prd_user_stories: []
depends_on: ["ST-011", "ST-014", "ST-017", "ST-086"]
```

**Story.** As a teacher, I want process and cause-effect diagrams laid out and animated from
their structure, so that explanations with more than a few steps stay legible and animate in step
with the narration.

**Outcome.** These scenes describe nodes and edges; layout is computed; nodes and edges animate on
the narration timeline. The model never supplies pixel coordinates.

**Scope.**
- [ ] Extend the `process` and `cause-effect` scene contracts from fixed structure to nodes and edges, retaining discriminated scene types.
- [ ] Generalise story 2's layout primitive to node-edge graphs.
- [ ] Add animated edges and active-node emphasis using Remotion path and spring animation on `videoTheme.motion` presets.

**Technical implementation requirements.**
- The schema must reject caller-supplied coordinates and arbitrary animation code.
- Deterministic layout — same input, same output.
- Node and edge reveals bind to the narration timeline via `timing.ts`.

**Acceptance criteria.**
- [ ] Nodes and edges are validated and source-grounded where they carry factual meaning.
- [ ] The schema rejects coordinate and animation-code fields.
- [ ] Nodes and edges animate in sync with the narration timeline.
- [ ] Layout is deterministic across repeated runs.
- [ ] Existing fixtures render unchanged.

**Required tests.**
- [ ] Unit — layout determinism at representative node counts; schema rejects coordinates.
- [ ] Render parity — preview and final render agree.
- [ ] Integration — representative documents from `packages/test-fixtures`.

**Out of scope.** 3D. A general scene-library rewrite. Generated video. Other templates.

---

### Story 4 — Editorial Monotony Validation

```yaml
story_id: ST-088          # proposed
title: "Add Editorial Scene-Monotony Validation as a Versioned Rule"
phase: "04 — AI Planning and Grounding"     # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: ["ST-066"]
```

**Story.** As a teacher, I want to be told when a generated lesson repeats the same scene template
too many times in a row, so that I can vary it before recording narration.

**Outcome.** One advisory rule added to the existing deterministic validation engine. The
storyboard candidate stays viewable and editable.

**Scope.**
- [ ] Add a `scene_monotony` code to `validationIssueCodeSchema` with `severity: "warning"` and `acknowledgeable: true`.
- [ ] Implement in `apps/api/src/lesson-validation.ts` alongside the existing rules; register its rule-dependency family.
- [ ] Confirm no additional proposed check duplicates `objective_uncovered`, `text_overflow`, `lesson_duration_mismatch`, `scene_duration_out_of_range`, or the grounding codes before adding it.

**Technical implementation requirements.**
- Deterministic; no model call.
- Advisory only — never fails the generation job and never hides the candidate.
- Versioned and stale-aware like every existing rule.

**Acceptance criteria.**
- [ ] 3+ consecutive same-template scenes produce an acknowledgeable warning.
- [ ] The finding never blocks approval or render.
- [ ] The candidate remains viewable and editable when the finding is present.
- [ ] Rule staleness and re-run behaviour match the existing engine.

**Required tests.**
- [ ] Unit — positive and negative, including boundary at exactly 3.
- [ ] Integration — warning surfaces through the existing validation read path and is acknowledgeable.

**Out of scope.** Auto-repair. Model-graded checks. Any new blocking rule.

---

### Story 5 — Candidate Contact-Sheet Review

```yaml
story_id: ST-089          # proposed
title: "Add Contact-Sheet Candidate Review for Generated Illustrations"
phase: "08 — Product UI"                    # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: ["ST-059", "ST-085"]
```

**Precondition.** `[unconfirmed]` Confirm no comparison surface already exists in `apps/web`.

**Story.** As a teacher, I want to compare generated candidates side by side with their role,
provenance, and cost, so that I can choose deliberately rather than one at a time.

**Scope.**
- [ ] Read path returning candidates grouped by scene and slot.
- [ ] Comparison surface in `apps/web`, reading `docs/design.md` first.
- [ ] Display `visualRole` from story 1 alongside provenance, cost, and moderation status.

**Acceptance criteria.**
- [ ] Each candidate identifies request, scene, visual role, provenance, cost, and status.
- [ ] Corrupt or unreadable media is blocked from selection with a clear reason.
- [ ] Any model-assisted quality signal is labelled advisory, recorded with its version, and never gates selection.
- [ ] Cross-tenant and cross-project access is rejected.

**Required tests.**
- [ ] Integration — grouped read path with authorization cases.
- [ ] UI — metadata renders; blocked candidates cannot be selected.

**Out of scope.** Automatic acceptance on the teacher's behalf. Generation itself.

---

### Story 6 — Provider Envelope with No Silent Fallback

```yaml
story_id: ST-090          # proposed
title: "Constrain Provider Adapters per Job and Forbid Silent Fallback"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: ["ST-006", "ST-059"]
```

Merges the Claude enforcement mechanism with the Codex rule: *"No adapter is permitted to choose a
different provider/model silently. A fallback requires a new teacher approval and a new
decision/usage record."*

**Scope.**
- [ ] Declare a per-job adapter allow-list in `packages/provider-adapters`.
- [ ] Enforce at adapter resolution, before any external call.
- [ ] Make substitution of an approved provider or model a typed failure requiring re-approval.
- [ ] Emit an audit event on violation.
- [ ] Record provider, model, version, reason, approval, estimate, and actual cost on each selection. **Do not** record synthetic "alternatives rejected" while a single provider is configured — add that only when AVLP genuinely evaluates alternatives.

**Acceptance criteria.**
- [ ] A job requesting an adapter outside its envelope fails with a typed error before any external call.
- [ ] The envelope is declared in one place per job.
- [ ] An unavailable approved provider or model fails closed; it does not substitute.
- [ ] Violations appear in the audit stream with job id and requested adapter.

**Required tests.**
- [ ] Unit — allowed and denied resolution per job.
- [ ] Integration — no external call on denial; unavailable approved provider fails closed.

**Out of scope.** Budget caps. Runtime reconfiguration. A provider scoring model.

---

## 6. Deferred and conditional

| Item | Status | Trigger |
| --- | --- | --- |
| **Video theme seam** | Deferred | A confirmed second theme or per-lesson visual treatment. No teacher outcome alone. Mind the `layout.ts` silent-mis-measurement trap (§4.6). |
| **Chart/dataviz tokens** | Deferred | A committed data-bearing scene type. State the contrast and colour-vision method inline in the story. |
| **Local filesystem asset paths** | Conditional | The renderer intentionally accepts local absolute or `file://` inputs (§4.7). Prior art: `remotion-composer/src/lib/resolveAsset.ts` — AGPL, read for approach only. |
| **Rejected-alternatives audit** | Gated | AVLP genuinely evaluates more than one provider (§2.3). |
| **Generated motion clips** | Deferred | Image slice production-proven for cost, quality, privacy, moderation, storage, approval, recovery. **Requires its own ADR.** |
| **Licensed catalog / archive retrieval** | Deferred | Rights and provenance contract, metadata retention, attribution policy, terms review. Not an extension of image generation. |
| **Presenter / avatar video** | Deferred | A validated user need. Does not solve diagram or pedagogical-motion quality. |
| **Web research enrichment** | Deferred | Must be opt-in, visibly separated from document claims, citation-backed, with its own grounding policy. |

---

## 7. Cross-cutting requirements for every story

*(Retained from the Codex documents, which stated this list correctly and completely.)*

- Update shared schemas before API, worker, renderer, or UI consumers.
- Strict TypeScript and boundary validation; no `any` without written justification.
- Preserve tenant isolation in every query, job, object key, signed URL, and provider call.
- Keep original uploads, parser output, normalized versions, approved asset records, lesson versions, and render manifests immutable; teacher changes create overlays or revisions.
- Run costly work only in idempotent, correlated, metered background jobs with a defined retry policy.
- Do not hold a database transaction open across a provider, storage, or renderer call.
- Require explicit teacher action, quota checks, and usage records before paid provider calls.
- Never log source text beyond approved policy, tokens, secrets, signed URLs, or raw provider responses.
- Never fetch an external asset during a render; renders use only the immutable manifest.
- Deterministic validation is render authority; model-assisted review is advisory.
- Add authorization, failure-path, concurrency, idempotency, safe-error, and stale-version tests to every applicable story.
- **Licensing:** OpenMontage is AGPL-3.0. Do not copy its source, pipeline files, schemas, prompts, or materially derived implementations. Any implementation must be clean-room, use AVLP naming and contracts, and pass a licensing review before merge.

---

## 8. Story-authoring checklist

Lead with the audit. Both source authors proposed already-shipped work by skipping it.

- [ ] **Grep for the proposed contract names before proposing them.**
- [ ] **Check `STORY_INDEX.md` for Done stories covering the outcome.**
- [ ] **Cite a file path for every claimed gap.**
- [ ] Confirm the next story ID and that every dependency is Done.
- [ ] Cite the precise PRD user story, technical-guide epic, and applicable ADRs; create an ADR for a material architecture change.
- [ ] Read `docs/design.md` before proposing user-facing UI.
- [ ] State exact contracts, migrations, worker/API/UI boundaries, tests, and out-of-scope exclusions.
- [ ] Confirm no OpenMontage code or material derivative is incorporated.

---

## 9. Open questions for the product owner

1. **Does §4.1 warrant the interim mitigation now**, ahead of story 1? It is a small change to `generateMissing`.
2. **Is the `grounding_critical` restriction permanent** — generated imagery may never carry factual weight — or first-release only?
3. **Is paid image generation in the next phase**, and what per-project and per-user budget caps apply?
4. **Is a second video theme a real requirement?** If not, the theme seam stays deferred indefinitely.
5. **Is ST-059's illustration slice considered production-proven?** Story 5 and any future motion work depend on the answer.
6. **Phase placement** for stories 2 and 3 — extend `01-visual-runtime-proof` or open a new phase.
7. Confirm `epics` and `prd_user_stories` for all six stories against `docs/reference/mvp-prd.md`.

---

## 10. Sources and provenance

Superseded inputs: `docs/claude_openmontage-comparative-findings.md`,
`docs/claude_openmontage-reconciled-findings.md`,
`docs/reference/codex_openmontage_asset-generation-discovery.md`,
`docs/reference/codex_openmontage_reconciled-roadmap.md`.

Upstream: [OpenMontage repository](https://github.com/calesthio/OpenMontage) ·
[animated-explainer pipeline](https://github.com/calesthio/OpenMontage/blob/main/pipeline_defs/animated-explainer.yaml) ·
[tool registry](https://github.com/calesthio/OpenMontage/blob/main/tools/tool_registry.py) ·
[license](https://github.com/calesthio/OpenMontage/blob/main/LICENSE)

Reviewed at `main` of `calesthio/OpenMontage` (last pushed 2026-08-22) via sparse clone limited to
`remotion-composer/`, `pipeline_defs/`, and `schemas/`. All `[verified]` repository claims were
checked against working-tree files at the cited paths on 2026-09-02. Items marked `[unconfirmed]`
were not verified and must be checked before the dependent story is written.
