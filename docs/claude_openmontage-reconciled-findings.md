---
title: "OpenMontage Learnings — Reconciled Findings and Candidate Stories"
author: Claude (Opus 5)
date: 2026-09-02
status: Discovery — no implementation authorized by this document
supersedes:
  - docs/claude_openmontage-comparative-findings.md
  - docs/reference/codex_openmontage_asset-generation-discovery.md
source: https://github.com/calesthio/OpenMontage @ main (sparse clone of remotion-composer/, pipeline_defs/, schemas/)
---

# OpenMontage Learnings — Reconciled Findings and Candidate Stories

Single reconciled successor to two earlier discovery documents:

- `docs/claude_openmontage-comparative-findings.md` (Claude) — renderer, theming, and stage-gate comparison.
- `docs/reference/codex_openmontage_asset-generation-discovery.md` (Codex) — asset-generation architecture and boundary.

Both are superseded. Sections 2 and 4 below are adapted from the Codex document,
which stated them better than the Claude original; Section 3 is new and is the
reason this reconciliation was necessary.

**Evidence grading.** `[verified]` = checked against files in this repository during
this review, with the path given. `[judgement]` = design opinion, arguable.
`[unconfirmed]` = plausible but not established; must be checked before the relevant
story is written.

---

## 1. Purpose and scope

Convert a comparative review of [OpenMontage](https://github.com/calesthio/OpenMontage)
into story-ready work for AVLP. The aim is better visual and pedagogical quality in
document-derived lessons. It is explicitly **not** to replace AVLP's source-grounded,
deterministic pipeline with an agentic video-production workflow.

---

## 2. Product and architecture decision

*(Adapted from the Codex document, §2. This framing is correct and is retained.)*

### Decision

Retain Remotion as AVLP's deterministic compositor and timeline. External image or video
models may be introduced only as upstream **asset providers**. Every generated asset is
validated, stored privately, versioned, costed, and explicitly referenced by the immutable
lesson version that uses it.

### Rationale

AVLP's promise is a faithful, editable explainer derived from a teacher's document.
Grounding-critical educational content must preserve exact labels, timing, citations,
scene-level regeneration, and reproducible rendering. Generative video cannot guarantee
these properties and is therefore unsuitable as the primary renderer.

This is consistent with `docs/video-quality-strategy.md`: the quality bottleneck is the
motion and scene system, not Remotion.

### Boundary

| AVLP continues to own | Optional provider may contribute |
| --- | --- |
| Document source of truth and provenance | Decorative illustrations, backgrounds, textures, non-factual B-roll |
| `NormalizedDocument`, `LessonSpec`, citations, versions | Source-derived visual candidates subject to approval |
| Scene selection, timing, captions, audio sync, final composition | A validated image or bounded short clip asset |
| Render readiness and deterministic blocking validation | Advisory visual-quality metadata only |
| Tenant access control, quotas, usage records, storage | Provider-specific generation capability |

---

## 3. Audit of shipped state — read this before proposing asset work

This section is the correction that motivated the reconciliation. The Codex document
proposed a six-story greenfield sequence (VG-001 through VG-006) for a governed
asset-generation layer. **Most of it is already built and marked Done.**

`[verified]` [ST-059 — Generate Limited Scene Illustrations with Review and Cost Controls](../stories/05-editor-assets-versioning/ST-059-generate-limited-scene-illustrations-with-review-and-cost-controls.md)
is **Done**, alongside ST-057 (approved reusable asset catalog and scene asset picker) and
ST-058 (teacher replacement assets).

### 3.1 What exists

| Proposed as new | Already present |
| --- | --- |
| VG-002: provider registry, capability + failure contracts | `IllustrationProvider` — `packages/provider-adapters/src/contracts.ts:89`; `MockIllustrationProvider`, `TogetherIllustrationProvider` |
| VG-002: "separate binary-asset adapter family, do not expand the structured-text adapter" | Already separate — `IllustrationProvider` is distinct from the structured-output path |
| VG-004: idempotent queued generation, staging, validation, storage promotion, usage records | `apps/pipeline-worker/src/illustration-generation-job.ts` (253 LOC) — status claim via conditional `UPDATE`, `sharp` format/dimension validation, SHA-256 checksum, `storageKeys.assetOriginal`, `usageRecords` with `idempotencyKey`, retryable/terminal classification via `ProviderCallError` |
| VG-003: approval gate before an asset becomes active | The job's own docblock: *"Generates no active asset: successful output remains a moderated candidate for an explicit teacher decision."* Statuses `queued`/`generating`/`pending_review`/`accepted`/`rejected`/`failed` |
| VG-004: moderation before preview | `result.moderation.status !== "approved"` path writes a failed usage record and rejects |
| VG-001: tenant-scoped request/asset persistence | `illustrationGenerationCandidates`, `projectAssets` (`packages/database/src/schema.ts:800`) with `provenance`, `sha256`, `status`, `validationCode`, soft-delete and cleanup columns |
| VG-001: immutable render manifest with content hash | `renderAssetManifestSchema` — `apps/renderer/src/contracts.ts:51`, `schemaVersion` literal, unique-storage-key `superRefine`; `renderJobPayloadSchema.manifest` carries `lessonVersionId`, `lessonVersionContentHash`, `validationRunId`, commented *"A versioned production manifest contains only immutable snapshot data"* |
| VG-001: provenance taxonomy | `assetProvenanceSchema` = `catalog` / `source_figure` / `teacher_uploaded` / `ai_generated` (`packages/schemas/src/index.ts:6610`) |
| §9: prompts must not carry unnecessary source text | `illustrationPrompt()` is bounded to a 160-char title and 400-char narration, with the comment *"Bounded scene context only; approved source text is never sent to images."* |

`[judgement]` The recommendation in the Codex §5.3 to create a separate binary-asset
adapter family is correct — and was correct when it was implemented for ST-059.

### 3.2 What is genuinely missing

`[verified]` **`visualRole` does not exist.** `grep -rn "visualRole\|grounding_critical\|groundingCritical" packages` returns zero matches. AVLP models *provenance* (where an asset came from) but not *epistemic role* (what the asset is allowed to be trusted for). This is the single best idea in the Codex document and it is genuinely absent. See story R3.

`[verified]` **No structural quality review of the storyboard.** A lesson of ten
consecutive `definition-scene`s is valid Zod and bad pedagogy. `grounding-check-job.ts`
applies this instinct to factual grounding only. See story R2.

`[verified]` **Diagram layout is a fixed anchor table.** `packages/scene-library/src/diagram-layout.ts` maps nine named anchors to hardcoded pixel coordinates, and `planDiagramCallouts` only *detects* collisions — it returns `collisionLabelIds` and does not resolve them. See story R1.

`[unconfirmed]` **Contact-sheet candidate comparison UI.** The candidate records exist; whether a comparison surface exists in `apps/web` was not checked. Confirm before writing R4.

`[unconfirmed]` **Render-time provenance display for `ai_generated` assets.** `productionVisualAssetSchema` discriminates on `source: "library" | "source"`, which is a load-location axis, not a provenance axis. An accepted AI-generated asset most likely rides the `source` variant and renders correctly, but whether required provenance labelling reaches the frame was not established.

### 3.3 Process lesson

The Codex document's own §12 review checklist does not include a step for auditing
shipped state, which is how six stories were proposed for work substantially complete.
Add to any future discovery checklist:

- [ ] Grep the codebase for the proposed contract names before proposing them.
- [ ] Check `STORY_INDEX.md` for Done stories covering the proposed outcome.
- [ ] Cite a file path for every claimed gap.

---

## 4. Licensing constraint

*(Adapted from the Codex document, §4. Retained in full — it is stronger than the Claude original.)*

OpenMontage is licensed under **AGPL-3.0**. Do not copy its source code, pipeline files,
schemas, prompts, or materially derived implementations into AVLP unless the product owner
intentionally accepts the resulting licensing obligations.

This discovery describes independently implementable architectural ideas only. Any
implementation must be clean-room, use AVLP naming and contracts, and be reviewed for
licensing before merging.

Sources: [repository](https://github.com/calesthio/OpenMontage) ·
[animated-explainer pipeline](https://github.com/calesthio/OpenMontage/blob/main/pipeline_defs/animated-explainer.yaml) ·
[tool registry](https://github.com/calesthio/OpenMontage/blob/main/tools/tool_registry.py) ·
[license](https://github.com/calesthio/OpenMontage/blob/main/LICENSE)

---

## 5. What OpenMontage actually demonstrates

`[verified]` The transferable idea is its **three-way stage gate**:

| Layer | Form | Enforcement |
| --- | --- | --- |
| `schemas/artifacts/*.schema.json` | JSON Schema | validator, hard fail |
| `success_criteria` | checkable prose | reviewer, hard gate |
| `review_focus` | fuzzy prose | self-critique, soft |

Verbatim from `pipeline_defs/animated-explainer.yaml`, stage `scene_plan`:

```yaml
review_focus:
  - Full script duration covered with no gaps
  - "Visual variety: no 3+ consecutive scenes of same type"
  - Asset feasibility - every required_asset uses a tool from the production plan
success_criteria:
  - Schema-valid scene_plan with required_assets per scene
  - At least 3 different scene types used
```

`[verified]` AVLP's layer 1 is **stronger** than theirs: `@avlp/schemas` plus the
`superRefine` cross-validation in `full-lesson.tsx` (narration tracks against timeline
segments, caption cues against scene bounds). Their JSON Schemas do not cross-validate.
Layer 3 is where AVLP has nothing — hence R2.

**Convergence worth noting.** Both source documents independently arrived at the same
principle: *deterministic checks are the only blocking authority; model-assisted
assessment may only advise.* Treat this as settled and apply it to every story below.

### Theming comparison

`[verified]` Across the ten scene components in `packages/scene-library/src/`:
21–34 `videoTheme.` references each (~300 total), and **zero hardcoded hex colors**
outside fixtures. OpenMontage cannot match this: its demo props carry per-cut
`"backgroundColor"` and components accept cut-level color overrides, so a generated plan
can silently defeat the theme.

`[verified]` Our `videoTheme` also models what theirs does not: four named safe areas plus
`lowerThirdAvoidance`, four named motion presets, and `measureSceneContent()` overflow
measurement. Theirs has one `springConfig` and no safe areas.

`[verified]` The one structural advantage they have is **selectable themes** (4 vs 1).
Every AVLP scene imports the frozen `videoTheme` singleton directly;
`VideoThemeProvider`/`useVideoTheme` exist in `packages/design-system/src/video-theme-provider.tsx`
but are unused (`grep -rn "useVideoTheme" packages/scene-library/` returns nothing) and the
provider hardcodes `value={videoTheme}` with no `theme` prop. `[judgement]` This only
matters if a second theme is planned — see R6, which is deliberately deferred.

### Patterns intentionally excluded

Agent-led internet research as the content source; a local-filesystem project workspace as
product persistence; agent-selected provider substitution after approval; generative video
as the final renderer; arbitrary animation code, coordinates, or provider payloads in
`LessonSpec`.

---

## 6. Reconciled story sequence

Story IDs are **proposed** — `ST-084` is the current maximum in `STORY_INDEX.md`, with 83
rows Done. Confirm IDs, `epics`, and `prd_user_stories` against `docs/reference/mvp-prd.md`
before creating any file. Every story must follow `AGENTS.md`: required reading, plan,
tests, security checks, Dev Agent Record, and `STORY_INDEX.md` update.

| # | Proposed | Story | Priority | Origin |
| --- | --- | --- | --- | --- |
| R1 | ST-085 | Graph-based deterministic diagram motion | **must-have** | Codex VG-007 |
| R2 | ST-086 | Structural quality review for the storyboard job | **must-have** | Claude Story C |
| R3 | ST-087 | `visualRole` epistemic contract for scene visuals | should-have | Codex VG-001 (residue) |
| R4 | ST-088 | Contact-sheet candidate review surface | should-have | Codex VG-006 (residue) |
| R5 | ST-089 | Per-job provider envelope with no silent fallback | should-have | Claude E + Codex §5.3 |
| R6 | ST-090 | Theme seam for the scene library | deferred | Claude Story A |
| R7 | ST-091 | Chart and dataviz tokens | deferred | Claude Story B |
| R8 | ST-092 | Asset path resolution hardening | conditional | Claude Story D |
| R9 | ST-093 | Rejected alternatives in provider decisions | could-have | Claude Story F |

---

### R1 — Pilot Graph-Based Deterministic Diagram Motion

```yaml
story_id: ST-085          # proposed
title: "Pilot Graph-Based Deterministic Diagram Motion"
phase: "01 — Visual Runtime Proof"          # proposed; extends an existing phase
status: Draft
priority: must-have
epics: []                 # confirm against docs/reference/mvp-prd.md
prd_user_stories: []
depends_on: ["ST-011", "ST-014", "ST-017"]  # scene registry, process, cause-effect
```

**Story.** As a teacher, I want process and cause-effect diagrams laid out and animated from
their structure rather than from fixed positions, so that explanations with more than a few
steps stay legible and animate in step with the narration.

**Outcome.** Selected deterministic diagram scenes describe nodes and edges; layout is
computed by an automatic engine; nodes and edges animate on the narration timeline. The
model never supplies pixel coordinates.

**Required reading.** `AGENTS.md`; `docs/video-quality-strategy.md`;
`docs/reference/epic-technical-implementation-guide.md`;
`stories/01-visual-runtime-proof/ST-011-implement-the-scene-registry-runtime-contract-and-layout-validation.md`.

**Problem evidence.** `[verified]` `packages/scene-library/src/diagram-layout.ts` maps nine
named anchors (`top-left`, `top`, `right`, …) to hardcoded pixel coordinates, and
`planDiagramCallouts` detects overlaps but only reports them as `collisionLabelIds` — there
is no resolution step. Content that collides today simply collides.

**Scope.**
- [ ] Extend the relevant scene contracts in `@avlp/schemas` from fixed anchors to nodes and edges.
- [ ] Introduce an automatic layout engine; render with Remotion path and spring animation.
- [ ] Pilot on `process` and `cause-effect` scenes only.
- [ ] Resolve, rather than merely report, label collisions.

**Technical implementation requirements.**
- Layout is derived from structure. The schema must reject arbitrary pixel coordinates from a model.
- Layout must be deterministic: the same input produces the same output, or preview and render will diverge.
- Node and edge reveals bind to the narration timeline via the existing `timing.ts` presets.

**Acceptance criteria.**
- [ ] Diagram scenes are data-driven; the schema rejects caller-supplied coordinates.
- [ ] Nodes and edges animate in sync with the narration timeline.
- [ ] A node count that collides under the current fixed-anchor table lays out without overlap.
- [ ] Layout is deterministic across repeated runs for identical input.
- [ ] Existing scene templates continue to render unchanged.

**Required tests.**
- [ ] Unit — layout determinism, and collision resolution at representative node counts.
- [ ] Unit — schema rejects coordinate input.
- [ ] Render parity — `full-lesson-render-parity.test.ts` passes; preview and render agree.
- [ ] Integration — representative documents from `packages/test-fixtures`.

**Out of scope.** 3D. A general scene-library rewrite. Generated video. Other scene templates.

---

### R2 — Add a Structural Quality Review Layer to the Storyboard Job

```yaml
story_id: ST-086          # proposed
title: "Add a Structural Quality Review Layer to the Storyboard Job"
phase: "04 — AI Planning and Grounding"     # proposed; extends an existing phase
status: Draft
priority: must-have
epics: []
prd_user_stories: []
depends_on: ["ST-050", "ST-066"]
```

**Story.** As a teacher, I want a generated storyboard checked for structural and
pedagogical quality and not only for schema validity, so that a lesson which is well-formed
but monotonous or incomplete is caught before narration and rendering spend.

**Outcome.** `storyboard-job` emits a structured review alongside the storyboard. Hard
violations block; soft findings are recorded and surfaced without blocking.

**Required reading.** `AGENTS.md`; `docs/reference/mvp-prd.md`;
`docs/reference/epic-technical-implementation-guide.md`; `docs/video-quality-strategy.md`;
`apps/pipeline-worker/src/grounding-check-job.ts`; `apps/pipeline-worker/src/ingestion-quality.ts`.

**Scope.**
- [ ] Define a `storyboard_review` contract in `@avlp/schemas`: per-check id, severity (`blocking` | `advisory`), outcome, human-readable detail, ruleset version.
- [ ] Implement deterministic checks in `apps/pipeline-worker/`, following the `ingestion-quality.ts` pattern.
- [ ] Persist the review and expose it on the storyboard read path.

**Candidate checks** — finalize during story authoring:

| Check | Severity | Rationale |
| --- | --- | --- |
| No 3+ consecutive scenes of the same template | advisory | Monotony: valid Zod, bad pedagogy |
| Every learning objective addressed by ≥1 scene | blocking | Incomplete lesson |
| Every scene passes `measureSceneContent` without overflow | blocking | Guaranteed visual defect |
| Total duration within the configured target band | advisory | Drift from author intent |
| Analogy scenes reference source material | advisory | Overlaps `grounding-check-job` — confirm ownership first |

**Technical implementation requirements.**
- Checks are deterministic and unit-testable. No model call in this story.
- Severity is data, not code: changing a check's severity must not require redeploying the blocking decision.
- Advisory findings never fail the job.

**Acceptance criteria.**
- [ ] 3+ consecutive same-template scenes produce an advisory finding and the job still completes.
- [ ] A missing objective produces a blocking finding and an actionable typed error.
- [ ] Scene text overflowing the layout budget produces a blocking finding.
- [ ] The review is persisted and readable through the existing storyboard read path.
- [ ] Audit and observability events follow `packages/observability` conventions.

**Required tests.**
- [ ] Unit — one test per check, positive and negative.
- [ ] Integration — storyboard job end to end, blocking and advisory paths.
- [ ] Failure — a blocking finding surfaces a typed API error, not a generic 500.

**Out of scope.** Auto-repair. Model-graded checks. UI beyond making the review readable.

---

### R3 — Introduce `visualRole` as an Epistemic Contract for Scene Visuals

```yaml
story_id: ST-087          # proposed
title: "Introduce Visual Role as an Epistemic Contract for Scene Visuals"
phase: "05 — Storyboard Editing, Assets, and Versions"   # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: ["ST-057", "ST-058", "ST-059"]
```

**Story.** As a teacher, I want the system to distinguish visuals that carry factual weight
from visuals that are decorative, so that generated imagery can never stand in for content
a learner is expected to trust.

**Outcome.** Every scene visual carries a `visualRole`. Generation is structurally
impossible for grounding-critical visuals — enforced by the schema, not by convention.

**Problem evidence.** `[verified]` `grep -rn "visualRole\|grounding_critical" packages`
returns zero matches. `assetProvenanceSchema` (`packages/schemas/src/index.ts:6610`) records
*where an asset came from* (`catalog` / `source_figure` / `teacher_uploaded` / `ai_generated`)
but nothing records *what it is allowed to be trusted for*. Those are different axes and
today only the first exists.

**Scope.**
- [ ] Add `visualRole` (`grounding_critical` | `source_derived` | `decorative`) to the relevant scene visual contracts in `@avlp/schemas`.
- [ ] Enforce at the schema boundary that a `grounding_critical` visual cannot resolve to an `ai_generated` asset.
- [ ] Require a source reference for `grounding_critical` and `source_derived` roles.
- [ ] Backfill existing scenes with a conservative default and a migration note.

**Technical implementation requirements.**
- The constraint is a schema refinement, not a runtime check at the call site — a future caller must be unable to bypass it.
- Backfill must default to the safest role for existing data; document the chosen default.
- Additive and versioned; existing consumers must keep working.

**Acceptance criteria.**
- [ ] A scene binding a `grounding_critical` visual to an `ai_generated` asset fails validation with a typed error.
- [ ] `grounding_critical` and `source_derived` visuals without a source reference fail validation.
- [ ] Existing lesson versions remain valid after backfill.
- [ ] The illustration generation entry point rejects a request whose target visual is `grounding_critical`.

**Required tests.**
- [ ] Unit — every role/provenance combination, permitted and rejected.
- [ ] Integration — generation request refused for a grounding-critical target.
- [ ] Migration — existing fixtures validate post-backfill.

**Out of scope.** Generated motion. Licensed catalog retrieval. UI for editing the role.

---

### R4 — Add Contact-Sheet Candidate Review

```yaml
story_id: ST-088          # proposed
title: "Add Contact-Sheet Candidate Review for Generated Illustrations"
phase: "08 — Product UI"                    # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: ["ST-059", "ST-087"]
```

**Precondition.** `[unconfirmed]` Confirm no comparison surface already exists in `apps/web`
before writing this story. ST-059 shipped accept/reject/regenerate; only side-by-side
comparison is believed missing.

**Story.** As a teacher, I want to compare generated illustration candidates side by side
with their cost and provenance, so that I can choose confidently rather than one at a time.

**Outcome.** Candidates for a scene are presented together with request, scene, provenance,
cost, moderation status, and visual role.

**Scope.**
- [ ] Add a read path returning candidates grouped by scene and slot.
- [ ] Build the comparison surface in `apps/web`.
- [ ] Surface the advisory findings from R2 where they apply to the scene.

**Acceptance criteria.**
- [ ] Each candidate identifies request, scene, provenance, cost, status, and visual role.
- [ ] A corrupt or unreadable candidate is blocked from selection with a clear reason.
- [ ] Subjective visual quality signals, if shown, are labelled advisory and never gate selection.
- [ ] Cross-tenant and cross-project access is rejected.

**Required tests.**
- [ ] Integration — grouped read path with authorization cases.
- [ ] UI — comparison renders candidate metadata; blocked candidates cannot be selected.

**Out of scope.** Automatic acceptance on the teacher's behalf. Generation itself.

---

### R5 — Constrain Provider Adapters per Job with No Silent Fallback

```yaml
story_id: ST-089          # proposed
title: "Constrain Provider Adapters per Pipeline Job with No Silent Fallback"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: ["ST-006"]
```

Merges Claude Story E (enforcement mechanism) with the Codex §5.3 rule (*"No adapter is
permitted to choose a different provider/model silently. A fallback requires a new teacher
approval and a new decision/usage record."*). The rule is the *what*; the envelope is the
*how*.

**Story.** As an operator, I want each pipeline job restricted to the provider adapters it
legitimately needs, and any provider substitution to be impossible without a new approval,
so that cost attribution is exact by construction and an approved plan cannot be quietly
executed with a different model.

**Scope.**
- [ ] Declare a per-job adapter allow-list in `packages/provider-adapters`.
- [ ] Enforce at adapter resolution time, not at call sites.
- [ ] Make substitution of an approved provider or model a typed failure requiring re-approval.
- [ ] Emit an audit event on violation.

**Acceptance criteria.**
- [ ] A job requesting an adapter outside its envelope fails with a typed error before any external call.
- [ ] The envelope is declared in one place per job and discoverable by reading that declaration alone.
- [ ] A generation whose approved provider or model is unavailable fails closed; it does not substitute.
- [ ] Violations appear in the audit stream with job id and requested adapter.

**Required tests.**
- [ ] Unit — allowed and denied resolution per job.
- [ ] Integration — no external call is issued on a denied resolution; unavailable approved provider fails closed.

**Out of scope.** Budget caps. Runtime reconfiguration of envelopes.

---

### R6 — Theme Seam for the Video Scene Library (deferred)

```yaml
story_id: ST-090          # proposed
title: "Introduce a Theme Seam for the Video Scene Library"
phase: "10 — Design System Extensibility"   # proposed; new phase directory
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: ["ST-010", "ST-011", "ST-022"]
```

**Defer unless a second theme is on the roadmap.** This is a refactor with no user-visible
outcome. R1 delivers educational value for comparable effort and should go first.

**Outcome.** `VideoThemeProvider` accepts a `theme` prop; scene components and the
layout/timing helpers resolve tokens from the active theme. Default-theme rendering unchanged.

**Scope.**
- [ ] Add an optional `theme` prop to `VideoThemeProvider`, defaulting to `videoTheme`.
- [ ] Replace direct `videoTheme` imports with `useVideoTheme()` in the ten scene components.
- [ ] Thread the active theme into `layout.ts` and `timing.ts` as an explicit parameter.
- [ ] Mount the provider on both preview and render paths.

**The trap.** `[judgement]` `measureSceneText` and `measureSceneContent` close over the
singleton. Under a second theme with a different `bodySize` they would report `fits: true`
for content that overflows — silently. That risk, not the import churn, is the real cost.

**Acceptance criteria.**
- [ ] No scene component imports `videoTheme` directly.
- [ ] Zero hardcoded hex colors remain outside fixtures.
- [ ] Default-theme render output is identical to the pre-change baseline.
- [ ] An injected theme with a larger `bodySize` causes `measureSceneContent` to report `fits: false` with a populated `firstOverflowPath`.

**Required tests.** Unit (measurement and timing under an injected theme); render parity;
`scene-preview-render-smoke.test.ts` with the provider mounted.

**Out of scope.** Authoring a second theme. A user-facing theme picker.

---

### R7 — Chart and Dataviz Tokens (deferred)

```yaml
story_id: ST-091          # proposed
title: "Add Chart and Data-Visualisation Tokens to the Video Theme"
phase: "10 — Design System Extensibility"   # proposed
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: ["ST-090"]
```

**Defer until a data-bearing scene type is actually planned.** Without a consumer this ships
tokens nothing reads.

**Scope.** Add `chartColors: readonly string[]` to `VideoTheme`; document ordering in
`docs/design.md`.

**Acceptance criteria.**
- [ ] At least 6 entries, each clearing the documented contrast threshold against `colors.background`.
- [ ] Entries remain distinguishable under common colour-vision deficiencies.
- [ ] `video-theme.test.ts` fails if a future edit introduces a failing colour.

Follow the contrast method in the `dataviz` skill; validate, do not eyeball.

**Out of scope.** Chart scene components.

---

### R8 — Asset Path Resolution Hardening (conditional)

```yaml
story_id: ST-092          # proposed
title: "Harden Asset Path Resolution for Local Filesystem Sources"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: []
```

**Trigger condition — do not schedule otherwise.** `[verified]` Today all asset sources are
signed HTTPS, `/catalog/*.svg`, or the loopback-HTTP dev pattern. There is no live defect.
Write this story only if the renderer gains a local-filesystem read path.

**Scope.** Handle absolute filesystem paths, `file://` URLs, and Windows drive-letter forms
including the `/C:/...` shape; extend the `full-lesson.tsx` accepted-source union to match.

**Acceptance criteria.**
- [ ] Every accepted source shape resolves to a loadable source; unrecognised shapes are rejected with a typed error rather than passed through.

**Prior art.** `remotion-composer/src/lib/resolveAsset.ts` solves this in 28 lines. AGPL-3.0
— read for approach, do not copy.

---

### R9 — Record Rejected Alternatives in Provider Decisions

```yaml
story_id: ST-093          # proposed
title: "Record Rejected Alternatives in Provider Selection Decisions"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: ["ST-089"]
```

**Story.** As an operator debugging output quality, I want each provider selection to record
the alternatives considered and rejected, so that a change in model choice is diagnosable
after the fact.

**Scope.** Extend the decision/audit event shape in `packages/observability` with
`alternatives_rejected`; populate it at the selection site.

**Acceptance criteria.**
- [ ] Every selection event carries the chosen adapter and a rejection reason per considered alternative.
- [ ] Additive only; existing consumers continue to work.

**Out of scope.** A scoring model. UI for browsing decisions.

---

## 7. Considered and rejected

| Idea | Why rejected |
| --- | --- |
| YAML pipeline manifests replacing worker code | Their manifests exist because there is no orchestrator. AVLP has `apps/pipeline-worker/` with 26 typed handlers. This trades type safety for nothing. |
| Markdown "director skills" driving runtime behaviour | Same reason. Right for an agent-operated repo, wrong for a product runtime. |
| Governance rules as prose | A workaround for having no type system. AVLP has one — encode the constraint (R3, R5). |
| Their `orchestration:` block (budget, send-backs, wall time) | Belongs in per-tenant database configuration, not a checked-in file. |
| Their flat `Cut` interface (~50 optional fields, `chartData?: any[]`) | Strictly worse than the discriminated `sceneSpecSchema`. It exists so an LLM can emit props loosely. |
| A generic single-composition renderer | Semantically named pedagogical scenes plus `scene-registry.tsx` are correct for this domain. |
| A pipeline dependency-DAG manifest | Already covered by `story-manifest.json` and `TRACEABILITY_MATRIX.md`. |
| Agent-led web research as content source | The teacher's approved document is the source of truth. Any future enrichment must be opt-in, visibly separated, and citation-backed. |
| Generative video as final renderer | Cannot guarantee labels, timing, citations, or reproducibility. |
| VG-001/2/3/4 as greenfield work | Substantially shipped in ST-059. See §3. |

---

## 8. Explicitly deferred

**Generated motion clips.** Consider only after the image slice has operational cost,
quality, and approval evidence. Limit early use to bounded decorative B-roll with no labels,
factual claims, or timing-critical explanation. **A separate ADR is required** — it changes
cost, storage, moderation, validation, and runtime characteristics.

**Licensed catalog or archive retrieval.** Needs a rights and provenance contract, metadata
retention, attribution policy, and terms review. Not a simple extension of image generation.

**Presenter/avatar video.** A distinct product direction. It does not solve diagram or
pedagogical-motion quality.

**Web research enrichment.** Any future enrichment must be opt-in, visibly separated from
document claims, citation-backed, and governed by its own source-grounding policy.

---

## 9. Cross-cutting requirements for every implementation story

*(Retained from the Codex document, §9 — this list is correct and complete.)*

- Preserve tenant isolation in every query, object key, signed URL, job, and provider call.
- Use strict TypeScript; validate every boundary.
- Keep `NormalizedDocument`, `LessonSpec`, and asset contracts versioned.
- Preserve immutability for uploads, parser output, approved assets, lesson versions, and render manifests; teacher changes create overlays or revisions.
- Run expensive work only in idempotent, correlated, metered background jobs with a defined retry policy.
- Do not hold database transactions open across provider, storage, or rendering calls.
- Require explicit teacher action, quota checks, and usage records before paid calls.
- Never log secrets, signed URLs, raw provider payloads, or source content beyond approved logging policy.
- Validate assets before rendering; never allow an external provider fetch during a render.
- Make deterministic validation authoritative; model-assisted assessment may only advise.
- Update shared contracts before API, worker, renderer, or UI consumers.

---

## 10. Open questions for the product owner

1. **Is a second video theme on the roadmap?** If not, R6 and R7 stay deferred indefinitely and the singleton stays.
2. **Does R3's `grounding_critical` restriction match product intent** — that generated imagery may never carry factual weight, permanently, not just in the first release?
3. **Who owns pedagogical grounding?** R2's analogy check may overlap `grounding-check-job.ts`. Resolve before implementing.
4. **Phase placement for R6/R7.** Open `stories/10-design-system-extensibility/` or fold into `01-visual-runtime-proof`.
5. **Is the ST-059 illustration slice considered production-proven?** R4 and any future motion work depend on the answer.
6. Confirm `epics` and `prd_user_stories` for every story above against `docs/reference/mvp-prd.md`.

---

## 11. Review checklist before story kickoff

- [ ] **Shipped state audited**: greped for the proposed contract names; checked `STORY_INDEX.md` for Done stories covering the outcome; every claimed gap cites a file path.
- [ ] The story names the exact PRD and technical-guide sections it changes or extends.
- [ ] Source-of-truth, provenance, versioning, and retention rules are explicit.
- [ ] The contract or migration story precedes each consumer story.
- [ ] Provider and model changes require explicit approval; no silent fallback is possible.
- [ ] Authorization, quota, idempotency, retries, concurrency, safe errors, and metering are covered.
- [ ] The render always consumes a complete immutable manifest.
- [ ] A deterministic fallback exists if an optional asset is unavailable or rejected.
- [ ] Tests cover cross-tenant access and stale-version render behaviour.
- [ ] Licensing review confirms no OpenMontage code, prompts, schemas, or derived assets are copied.

---

## Provenance

Reviewed at `main` of `calesthio/OpenMontage` (last pushed 2026-08-22) via sparse clone
limited to `remotion-composer/`, `pipeline_defs/`, and `schemas/`. Repository claims in §3
and §5 were verified against working-tree files at the paths cited, on 2026-09-02. Items
marked `[unconfirmed]` were not verified and must be checked before the dependent story is
written.
