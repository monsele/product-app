# Reconciled OpenMontage Learnings and Video-Quality Roadmap

**Author:** Codex  
**Date:** 2026-09-02  
**Status:** Discovery and story-planning input; no implementation is authorized by this document.

## 1. Purpose

This document reconciles two comparative reviews of [OpenMontage](https://github.com/calesthio/OpenMontage) with the current AI Visual Learning Platform (AVLP) architecture:

- `docs/reference/codex_openmontage_asset-generation-discovery.md`
- `docs/claude_openmontage-comparative-findings.md`

It is intended to be the single planning input for later story authoring. It records the architecture boundary, the most valuable transferable patterns, corrected candidate stories, and the recommended order of delivery.

## 2. Reconciled conclusion

AVLP should **not** become an agent-operated general video-production studio. Its differentiated product promise is a teacher-uploaded document becoming a grounded, editable, visually useful lesson.

The correct architecture remains:

```text
Approved document
  → normalized, cited source package
  → approved, versioned LessonSpec
  → deterministic scene templates and Remotion timeline
  → validated immutable render manifest
  → MP4
```

OpenMontage provides useful production patterns, especially asset planning, explicit approval, provider discovery, immutable manifests, and post-production QA. Those patterns should be adapted inside AVLP's typed application, tenant-safe job platform, and versioned contracts.

The key rule is:

> Remotion remains AVLP's compositor and timeline. External AI models may produce bounded, validated assets upstream of composition; they do not replace the lesson renderer.

## 3. What AVLP should preserve

The following are strengths of the existing product architecture and must not be weakened while adopting OpenMontage-inspired improvements.

| Preserve | Why it matters |
| --- | --- |
| The teacher's approved document as source of truth | The lesson must be faithful and citable; agent web research is not an equivalent source. |
| `NormalizedDocument` and `LessonSpec` as versioned contracts | Browser preview, editor, worker, and renderer need the same stable representation. |
| Whitelisted scene templates | AI must not emit arbitrary animation code or pixel coordinates. |
| Deterministic Remotion composition | Gives exact timing, captions/audio synchronization, scene-level regeneration, reproducible rendering, and render parity tests. |
| Immutable lesson versions and render manifests | A completed render must always identify the exact lesson, citations, assets, and configuration it used. |
| Tenant-scoped state, storage, and jobs | A local-filesystem project workspace is not appropriate for a multi-tenant product. |
| Explicit paid-action approval, quota checks, and usage records | Visual generation must not become an unbounded or hidden cost path. |
| Deterministic validation as render authority | Model-assisted quality signals may advise, but cannot be the sole reason a lesson is renderable or blocked. |

## 4. What to learn from OpenMontage

### 4.1 Adopt

1. **Visual asset planning before generation.** Every storyboard scene should identify the needed visual, educational purpose, source connection, acquisition approach, fallback, and estimated cost.
2. **Capability discovery at runtime.** Provider availability, supported outputs, configuration state, quota requirements, and estimates must be typed runtime facts, not hard-coded assumptions.
3. **Teacher approval before consequential work.** Teacher approval must cover the selected provider/model, bounded visual brief, output type, estimated cost, and any change from the approved plan.
4. **Verified asset manifests.** Composition receives private, checksummed, validated assets pinned to the exact lesson version; it never fetches provider content during rendering.
5. **Representative visual QA.** Contact sheets and representative frame inspection make outputs reviewable, but deterministic media/layout/provenance checks remain the authoritative gate.
6. **Production decision audit.** When AVLP evaluates more than one provider option, record the selected option, viable alternatives, selection rationale, approval, and resulting quality/cost metadata.
7. **Motion as a first-class visual system.** Different content treatments can have distinct, deliberate motion behaviour rather than one uniform slide-transition feel.

### 4.2 Reject

1. YAML pipeline manifests or Markdown agent skills as AVLP runtime orchestration.
2. Freeform agent research as a replacement for document grounding.
3. Generic loose scene/cut objects in place of AVLP discriminated scene contracts.
4. Arbitrary provider fallback after a teacher approves a provider/model/cost path.
5. Generative video as a primary renderer for factual learning content.
6. Filesystem state as the source of truth for project history, approvals, costs, or tenancy.

## 5. Visual roles and non-negotiable content boundaries

Every visual request must be classified before acquisition or generation.

| Visual role | Permitted first-release approaches | Not permitted in first release |
| --- | --- | --- |
| `grounding_critical` — labelled diagrams, charts, factual figures, exact instructional text | Source figure, teacher-supplied asset, deterministic diagram/template | Generated image or generated motion as the factual visual |
| `source_derived` — a visual interpretation tied to cited source material | Source crop/cleanup, deterministic composition, teacher-approved generated illustration | Uncited or misleading transformation presented as source fact |
| `decorative` — texture, atmosphere, contextual background, non-factual establishing visual | Existing asset, licensed catalog, teacher-approved generated image | Required labels, factual assertions, or timing-critical instruction |

Generated motion clips are deferred. They may be considered only after the generated-image path has production evidence for cost, quality, privacy, moderation, storage, approval, and operational recovery.

## 6. Proposed contract direction

Contract naming and exact schema shapes must be finalized in a contract-first story. The concepts below are not permission to add unversioned fields to current contracts.

### 6.1 `VisualAssetRequest`

A versioned, tenant-scoped request for one scene visual.

Required concepts:

- Stable request and revision ID; tenant, project, working LessonSpec, and stable scene ID.
- Visual role and acquisition mode.
- Educational purpose and bounded visual brief.
- Required source references for grounding-critical or source-derived work.
- Selected provider/model contract version, only where generation is selected.
- Target media constraints: type, dimensions, duration cap if applicable, and accessibility metadata.
- Estimate, approval revision, state, correlation ID, idempotency key, and safe failure metadata.

Lifecycle states should distinguish planning, approval, queued/running work, validation, rejection, failure, and supersession.

### 6.2 `AssetManifest`

An immutable, content-hashed lesson-version input containing only verified assets.

For each asset it must capture:

- Asset ID, checksum, private storage key, media type, dimensions, and duration.
- Provenance: source reference, rights/catalog record, or generation operation ID.
- Request revision, provider/model contract version where applicable, and usage record ID.
- Validation outcome/rule version and scene binding.

The final render manifest may refer only to this verified manifest. It must not contain raw provider payloads, secrets, signed URLs, mutable public URLs, or a request to fetch new media.

### 6.3 Binary asset provider adapter

Do not overload the structured-text adapter contract. Binary asset generation needs its own typed adapter boundary for:

- Capability/availability reporting and input validation.
- A preflight estimate and quota requirement.
- A teacher-approved, idempotent generation operation.
- Staged private output and normalized media metadata.
- Safe retryable/terminal failure classification.
- Correlated, idempotent usage/cost record creation.

The adapter must fail closed if the exact approved provider/model is unavailable. A provider or model swap requires a changed request revision and explicit teacher approval.

## 7. Story-planning corrections from the comparative reviews

### Theme seam

The finding is valid: video scenes import the default `videoTheme` directly while `VideoThemeProvider` is currently unable to inject an alternative value. A second theme would therefore cause preview/render/layout divergence unless the theme is threaded through scene rendering and measurement.

This is a **deferred refactor**, not the first video-quality story. Start it only when AVLP has a confirmed second theme, per-lesson visual treatment, or theme-dependent scene library requirement. It has no direct teacher outcome on its own.

### Chart palette tokens

Defer until a data-bearing chart scene is committed. Token-only work without a consumer is speculative. When planned, define an accessible palette with a documented contrast and colour-vision testing method; do not rely on an unavailable skill reference.

### Storyboard structural review

The finding that a schema-valid storyboard can still be monotonous or pedagogically weak is valid. However, objective coverage, layout safety, duration, asset presence, citations, and media freshness already belong to AVLP's deterministic validation architecture.

Do not duplicate these rules in the storyboard worker. Instead:

- Add only genuinely editorial/structural checks, such as repeated-scene monotony, as a versioned validation-rule extension.
- Persist an editable candidate and actionable findings; do not fail a generation job in a way that hides the candidate from the teacher.
- Make a candidate unapprovable when a deterministic blocking rule fails. The teacher must still be able to inspect, edit, and regenerate it.
- Keep subjective/model-assisted pedagogical assessments advisory only.

### Provider allow-lists and selection audit

Provider capability allow-lists are good governance, but introduce them with the first binary-asset adapter instead of refactoring all existing jobs prematurely. Enforce the allow-list at adapter resolution, before any external call.

Record rejected alternatives only after AVLP truly evaluates alternative providers. In a single-provider first release, record the provider/model/version, reason, approval, estimate, and actual cost; a synthetic list of alternatives would create audit noise.

### Local filesystem asset-path support

This is conditional operational hardening, not planned product work. Create a story only if the renderer intentionally starts accepting local absolute paths or `file://` inputs. Existing private signed-URL/catalog paths do not need this expansion.

## 8. Recommended delivery order

This is the sequence expected to improve lesson quality most safely and quickly.

```text
1. Deterministic graph motion pilot
2. Asset request/manifest contracts
3. Provider capability + governance boundary
4. Teacher visual-plan approval and cost gate
5. One generated-image job and private asset validation
6. Deterministic asset binding in preview/render
7. Contact-sheet review and advisory visual QA
8. Optional theme seam, when a second treatment is planned
9. Generated motion/video only after the image vertical slice proves out
```

### Why this order

**1. Deterministic graph motion first.** The immediate quality gap is moving explanatory diagrams, not a missing video-generation model. Spring motion, graph nodes/edges, animated paths, and narration-aligned emphasis improve factual learning content now, remain groundable, and cost no per-second provider fee.

**2–6. A narrow generated-image vertical slice second.** This creates enrichment while preserving AVLP's core guarantees. It validates the new operational concerns—approval, cost, quota, provider failure, staging, asset provenance, versioning, render parity—without also taking on nondeterministic video.

**7. QA after real assets exist.** Contact-sheet and representative-frame UX should be designed against actual failure modes rather than hypothetical ones.

**8. Theme extensibility later.** It is a sound enabling refactor, but not a substitute for richer motion or assets.

**9. Generated video last.** It creates the greatest risks to factual fidelity, timing, regeneration, costs, moderation, and validation. It needs a distinct ADR before implementation.

## 9. Candidate story sequence

The following IDs are placeholders only. Confirm the next available story ID and cite applicable PRD/technical-guide sections before creating files under `stories/`.

### OM-1 — Pilot deterministic graph-based instructional motion

**Priority:** First  
**Depends on:** Existing visual runtime/scene registry/validation foundation.

**Outcome:** `process` and `cause-effect` scenes use structured nodes and edges, automatic layout, narration-aligned emphasis, and deterministic spring/path animation.

**Scope:**

- Extend only required scene contracts with graph data; retain discriminated scene types.
- Use automatic layout; do not accept AI-authored pixel coordinates.
- Add animated edges and active-node emphasis in the Remotion scene library.
- Preserve preview/final-render parity and existing scene compatibility.

**Acceptance criteria:**

- Graph nodes and edges are validated and source-grounded where they carry factual meaning.
- No arbitrary animation code or coordinate fields enter `LessonSpec`.
- Representative graph scenes pass layout, frame-safety, preview, and full-render parity tests.
- Existing fixtures render unchanged.

**Out of scope:** Generated imagery, 3D worlds, a generalized scene-library redesign, generated video.

### OM-2 — Define versioned visual asset request and manifest contracts

**Priority:** First asset-generation prerequisite  
**Depends on:** Existing versioning, job, schema, and source-provenance foundations.

**Outcome:** AVLP has a strict, tenant-scoped, immutable contract for planned/verified visual assets and their lesson-version bindings.

**Acceptance criteria:**

- Requests reject raw provider payloads, unvalidated URLs, arbitrary code/coordinates, invalid visual-role/acquisition combinations, and missing required source references.
- Manifests are reproducible, immutable, content-hashed, and reference only verified assets.
- Lesson versions use asset-manifest snapshots; cross-tenant access is rejected.
- Schema, migration, revision, ownership, and hash tests pass.

**Out of scope:** Calling a provider, teacher UI, or rendering a generated asset.

### OM-3 — Introduce binary-asset provider preflight and governance

**Priority:** Required before paid generation  
**Depends on:** OM-2 and existing configuration/usage foundations.

**Outcome:** One typed registry reports allowed binary-asset provider capabilities, availability, safe estimate metadata, and quota requirements.

**Acceptance criteria:**

- Capability reporting reveals no secrets, signed URLs, raw configuration, or provider payloads.
- Each supported job has a declared adapter allow-list enforced before an external call.
- An unavailable approved provider/model fails with a typed error and no silent fallback.
- Tests cover malformed configuration, denied adapters, unavailable providers, and no external call on denial.

**Out of scope:** A live paid provider and any automatic selection among providers.

### OM-4 — Add teacher visual-plan approval and cost gate

**Priority:** Required before paid generation  
**Depends on:** OM-2, OM-3, storyboard/versioning/editor foundations.

**Outcome:** Teachers can review per-scene visual requests, their provenance/role, selected provider/model, fallback, and estimated cost before authorizing chargeable work.

**Acceptance criteria:**

- Teachers approve/reject individual requests and an aggregate plan.
- Grounding-critical requests expose deterministic/source-derived paths only.
- Any provider/model, visual brief, output constraint, or estimate change creates a revised request requiring reapproval.
- Explicit teacher action and quota validation are required before job enqueue.
- Cross-user, stale revision, and invalidation tests pass.

**Out of scope:** Executing provider calls.

### OM-5 — Implement one generated-image asset job

**Priority:** Narrow production proof  
**Depends on:** OM-2 through OM-4 and shared job/storage/usage infrastructure.

**Outcome:** One teacher-approved `decorative` image request produces a staged, verified, private asset through an idempotent background job.

**Acceptance criteria:**

- Duplicate work converges on one logical operation and authoritative asset.
- Paid invocation requires approved revision, quota, correlation ID, and usage record.
- Binary output is staged, type/size/dimension/checksum validated, then promoted to private storage.
- Retryable/terminal provider errors, invalid output, quota errors, and cleanup are safe and classified.
- Authorization, concurrency, idempotency, retry, metering, and logging-safety tests pass.

**Out of scope:** Generated motion, grounding-critical generated assets, public URLs, and automatic fallback.

### OM-6 — Bind verified visual assets to deterministic previews and renders

**Priority:** Complete the image vertical slice  
**Depends on:** OM-2, OM-5, preview/render/validation foundations.

**Outcome:** Whitelisted scene bindings reference verified asset IDs and use the same immutable asset manifest in preview and final render.

**Acceptance criteria:**

- Preview and final render consume the same verified manifest and retain parity.
- Render is blocked for stale, missing, unverified, or cross-tenant assets.
- Optional-asset failure/rejection selects a deterministic approved fallback.
- Asset-binding changes invalidate only affected preview, validation, and render dependencies.
- Scene-level change leaves other scene bindings intact.

**Out of scope:** New arbitrary scene props and remote provider fetches during render.

### OM-7 — Add contact-sheet review and advisory visual QA

**Priority:** Follow production asset evidence  
**Depends on:** OM-5, OM-6.

**Outcome:** Teachers can compare visual candidates and final representative frames with clear provenance, cost, and status.

**Acceptance criteria:**

- Candidate review links every asset to its scene/request/provenance/cost/status.
- Corrupt or unreadable media blocks use deterministically.
- Any model-assisted visual review is recorded with a version and appears only as an advisory warning.
- Validation issues identify exact asset/scene paths and become stale when relevant inputs change.

**Out of scope:** Automatic candidate selection or model-only render authorization.

### OM-8 — Add editorial storyboard-structure validation

**Priority:** Useful quality guard; schedule after checking existing validation coverage  
**Depends on:** Existing deterministic validation engine.

**Outcome:** AVLP flags structural/pedagogical issues not covered by base schema, source grounding, or current deterministic validation.

**Initial candidate checks:**

- Three or more consecutive scenes of the same type: advisory.
- Other checks only after confirming they do not duplicate existing objective coverage, layout, duration, grounding, or asset rules.

**Acceptance criteria:**

- A generated storyboard candidate remains viewable/editable with actionable findings.
- Deterministic blocking findings prevent approval/render but do not erase or hide the candidate.
- Advisory findings never fail the generation job.
- Rules, severity, paths, staleness, and ownership are versioned and tested through the established validation service.

**Out of scope:** Auto-repair and subjective model judgement as a blocking rule.

### OM-9 — Introduce a video-theme seam (conditional)

**Trigger:** A second theme or a confirmed per-lesson visual-treatment requirement.

**Outcome:** Scene components, layout measurement, timing, preview, and server rendering resolve the same injected theme rather than a frozen module singleton.

**Acceptance criteria:**

- Default-theme output remains unchanged.
- A non-default test theme is used consistently in preview, measurement, and final render.
- Larger typography reliably triggers the current layout-overflow checks.
- Existing parity/smoke tests pass.

**Out of scope:** Authoring a theme picker or a second theme unless separately planned.

## 10. Deferred decisions requiring product-owner input

1. Is paid image generation in the next product phase, and what are the per-project/user budget caps?
2. Is the first supported category decorative imagery only (recommended), source-derived images, or licensed catalog assets?
3. Must each generated asset be approved individually, or may a teacher approve a bounded batch plan with later exception review?
4. Which provider satisfies product privacy, regional availability, retention, pricing, and terms requirements?
5. Should deterministic graph motion be funded before visual asset generation (recommended for educational value), or is visual enrichment the immediate priority?
6. Is a second visual theme a real product requirement? If not, OM-9 remains deferred.

## 11. Non-negotiable cross-cutting implementation requirements

- Update shared schemas before API, worker, renderer, or UI consumers.
- Maintain strict TypeScript and boundary validation; no `any` without written justification.
- Preserve tenant isolation in every project query, job, object key, signed URL, and provider operation.
- Keep original uploads, parser output, normalized versions, approved asset records, lesson versions, and render manifests immutable.
- Use background jobs for all costly operations; jobs must be idempotent, correlated, retryable where appropriate, and metered.
- Do not hold a database transaction open while calling a provider, storage, or renderer.
- Require explicit teacher action, quota checks, and usage records before paid provider calls.
- Never log source text beyond approved policy, tokens, secrets, signed URLs, or raw provider responses.
- Never fetch an external asset while rendering; renders use only the immutable manifest.
- Preserve deterministic validation as render authority; subjective/model-assisted review is advisory.
- Add authorization, failure-path, concurrency, idempotency, safe-error, and stale-version tests to every applicable story.
- Use a clean-room implementation: OpenMontage is AGPL-3.0, so do not copy its source, schemas, prompts, or derived implementation without explicit license review.

## 12. Story-authoring checklist

Before creating any story file from this roadmap:

- [ ] Confirm the next story ID and dependency statuses in `STORY_INDEX.md`.
- [ ] Cite the precise PRD user story, technical-guide epic, and current ADRs; create an ADR if the work is a material architecture change.
- [ ] Read `docs/design.md` before proposing user-facing visual-plan or candidate-review UI.
- [ ] Identify any overlap with completed validation, versioning, asset, provider, or rendering stories.
- [ ] State exact contracts, migrations, worker/API/UI boundaries, tests, and out-of-scope exclusions.
- [ ] Confirm no OpenMontage code or material derivative is being incorporated.

## 13. Sources

- [OpenMontage repository](https://github.com/calesthio/OpenMontage)
- [OpenMontage animated-explainer pipeline](https://github.com/calesthio/OpenMontage/blob/main/pipeline_defs/animated-explainer.yaml)
- [OpenMontage tool registry](https://github.com/calesthio/OpenMontage/blob/main/tools/tool_registry.py)
- [OpenMontage license](https://github.com/calesthio/OpenMontage/blob/main/LICENSE)
- `docs/video-quality-strategy.md`
- `docs/reference/epic-technical-implementation-guide.md`
- `docs/claude_openmontage-comparative-findings.md`
- `docs/reference/codex_openmontage_asset-generation-discovery.md`
