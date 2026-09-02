# OpenMontage Learnings: Asset Generation Discovery

**Author:** Codex  
**Date:** 2026-09-02  
**Status:** Discovery / proposed post-MVP work; no implementation is authorized by this document.

## 1. Purpose

This document converts a comparative review of [OpenMontage](https://github.com/calesthio/OpenMontage) into story-ready work for the AI Visual Learning Platform (AVLP).

The goal is to raise the visual quality and variety of document-derived lessons by adding a governed asset-generation layer. It does **not** propose replacing AVLP's source-grounded, deterministic lesson pipeline with OpenMontage's freeform agentic video-production workflow.

## 2. Product and architecture decision

### Decision

Retain Remotion as AVLP's deterministic compositor and timeline. External image or video models may be introduced only as upstream **asset providers**. Every generated asset is validated, stored privately, versioned, costed, and explicitly referenced by the immutable lesson version that uses it.

### Rationale

AVLP's MVP promise is a faithful, editable explainer derived from a teacher's document. Grounding-critical educational content must preserve exact labels, timing, citations, scene-level regeneration, and reproducible rendering. Generative video is unsuitable as the primary renderer for that promise because it cannot reliably guarantee these properties.

This is consistent with `docs/video-quality-strategy.md`: the immediate quality bottleneck is the motion/scene system, rather than Remotion itself.

### Boundary

| AVLP continues to own | Optional provider may contribute |
| --- | --- |
| Document source of truth and provenance | Decorative illustrations, backgrounds, textures, and non-factual B-roll |
| `NormalizedDocument`, `LessonSpec`, citations, and versions | Source-derived visual candidates subject to approval |
| Scene selection, timing, captions, audio synchronization, and final composition | A validated image or bounded short clip asset |
| Render readiness and deterministic blocking validation | Advisory visual-quality metadata only |
| Tenant access control, quotas, usage records, and storage | Provider-specific generation capability |

## 3. What OpenMontage demonstrates

OpenMontage is an instruction-driven, agentic production system. Its pipeline definitions declare stage inputs/outputs, approval gates, tool requirements, cost budgets, and review criteria. Its tool registry discovers available providers and exposes capability, availability, and setup information at runtime. Its proposed asset stage creates an asset manifest before composition.

Patterns worth adapting:

1. **Asset plan before generation.** A scene plan should say what visual is needed, why, how it will be acquired, and whether generation is necessary.
2. **Runtime provider capability discovery.** Product decisions should use configured provider capabilities and current pricing/configuration rather than a hard-coded preferred model.
3. **Explicit cost and creative approval.** Paid generation happens only after a teacher sees the plan, estimated cost, and visual tradeoffs.
4. **Immutable asset manifests.** Rendering consumes a snapshot of verified assets, not mutable external links or a provider's transient output.
5. **Production QA after rendering.** Probe media and inspect representative output frames, while keeping deterministic rules as the only blocking authority.

Patterns intentionally excluded:

1. Agent-led internet research as the lesson's content source.
2. A freeform local-filesystem project workspace as product persistence.
3. Agent-selected provider substitution after teacher approval.
4. Generative video as the final renderer.
5. Arbitrary animation code, coordinates, or provider payloads in `LessonSpec`.

## 4. Licensing constraint

OpenMontage is licensed under AGPL-3.0. Do not copy its source code, pipeline files, schemas, prompts, or materially derived implementations into AVLP unless the product owner intentionally accepts the resulting licensing obligations.

This discovery describes independently implementable architectural ideas only. Any implementation must be clean-room, use AVLP naming/contracts, and be reviewed for licensing before merging.

Sources:

- [OpenMontage repository](https://github.com/calesthio/OpenMontage)
- [OpenMontage animated-explainer pipeline](https://github.com/calesthio/OpenMontage/blob/main/pipeline_defs/animated-explainer.yaml)
- [OpenMontage tool registry](https://github.com/calesthio/OpenMontage/blob/main/tools/tool_registry.py)
- [OpenMontage license](https://github.com/calesthio/OpenMontage/blob/main/LICENSE)

## 5. Proposed AVLP domain model

The following contract direction is intentionally conceptual. A schema story must finalize names, versioning, fields, and migration choices before consumers are implemented.

### 5.1 `VisualAssetRequest` (working draft only)

One request represents a teacher-approved need for a visual asset in one scene.

Required concepts:

- Stable request ID, tenant/project ID, draft LessonSpec ID and stable scene ID.
- `visualRole`: `grounding_critical`, `source_derived`, or `decorative`.
- `acquisitionMode`: `existing_source`, `deterministic_template`, `licensed_catalog`, `generated_image`, or `generated_motion`.
- A short educational purpose and a bounded visual brief.
- Source references for `grounding_critical` and `source_derived` roles.
- Proposed provider/model only when generation is selected, including provider contract/version and price estimate.
- Exact dimensions, duration bound where applicable, accessible-alt-text draft, and target placement/binding.
- Lifecycle state: `planned`, `awaiting_approval`, `queued`, `generating`, `validated`, `rejected`, `failed`, or `superseded`.

Rules:

- `grounding_critical` requests may not select `generated_image` or `generated_motion` in the first release.
- A request never embeds a raw provider result, API key, signed URL, or unvalidated public URL.
- A request is immutable once submitted for generation. A change produces a new revision/request.

### 5.2 `AssetManifest` (working draft only)

An immutable render input associated with a `LessonVersion`.

For every used asset, capture:

- Asset ID, content checksum, private storage key, MIME type, dimensions, and duration.
- Source/provenance: source document reference, licensed catalog record, or generation operation ID.
- Request ID/revision, provider/model contract version where applicable, and usage record ID.
- Validation status and validation-rule versions.
- Scene bindings and a stable content hash.

The render manifest must include only these verified references. Renderers must never fetch new remote provider content while rendering.

### 5.3 Provider adapter boundary

Create a separate binary-asset adapter family; do not expand the existing structured-text generation adapter until a dedicated contract exists.

The common interface should support:

- Provider capability and availability reporting.
- Input validation and a normalized generation request.
- Preflight cost estimate and quota requirement.
- Explicit generation invocation with correlation and idempotency keys.
- Provider result normalization into a private staged object.
- Classified retryability/failure reporting.
- Usage/cost record creation without storing raw provider payloads.

No adapter is permitted to choose a different provider/model silently. A fallback requires a new teacher approval and a new decision/usage record.

## 6. Proposed workflow

```text
Approved document and approved lesson plan
  → storyboard identifies visual roles and candidate requests
  → teacher reviews visual asset plan and cost estimate
  → explicit approval and quota check
  → idempotent background generation/acquisition job
  → private staging + malware/media/provenance validation
  → asset approval/rejection (where required)
  → immutable AssetManifest included in LessonVersion
  → deterministic preview/render using Remotion
  → deterministic validation + advisory visual QA
```

### Teacher experience

1. The storyboard identifies visuals as existing document figures, deterministic diagrams, catalog media, or optional generated enrichment.
2. Before chargeable work, the teacher sees per-scene purpose, source connection, provider/model, output type, and estimated cost.
3. The teacher can approve all proposed non-source assets, reject one, or keep the current deterministic fallback.
4. Asset jobs show normal project job status and a safe, actionable failure state.
5. The teacher can compare approved candidate assets in a contact sheet and regenerate only the selected decorative/source-derived asset within rate and cost limits.
6. A final render always ties to the exact approved lesson and asset versions.

## 7. Candidate story sequence

These stories are deliberately ordered. Do not start a later story before its dependencies are Done. Each story must follow `AGENTS.md`, including product/architecture reading, plan, tests, security checks, Dev Agent Record, and `STORY_INDEX.md` update.

### VG-001 — Define visual asset request and manifest contracts

**Outcome:** Shared, versioned schemas and persistence design for requested, generated, and verified visual assets.

**Dependencies:** Existing completed contracts and versioning work: ST-007, ST-008, ST-050, ST-060.

**Scope:**

- Define versioned schema contracts for `VisualAssetRequest`, `AssetManifest`, visual roles, acquisition modes, provider selection, and safe public status/error shapes.
- Add tenant-scoped persistence with revisions/immutability rules.
- Define the lesson-version snapshot representation and content hash rules.
- Add migration and forward/backward compatibility notes.

**Acceptance criteria:**

- Schema rejects raw URLs, arbitrary animation code/coordinates, unknown provider configuration, and invalid source references.
- A manifest can be reproduced from approved request/asset records and produces a stable content hash.
- Cross-tenant reads/writes are rejected.
- An immutable lesson version can reference only verified assets.
- Unit and integration tests cover schema versions, ownership, revisions, and content hashing.

**Out of scope:** Calling an external provider, UI, rendering the assets.

### VG-002 — Implement asset provider registry and preflight contract

**Outcome:** AVLP can discover which image-generation providers are configured and safely report capability/cost information without exposing secrets.

**Depends on:** VG-001; ST-005, ST-006; existing config/usage foundations.

**Scope:**

- Create typed provider capability, availability, estimate, and failure contracts.
- Implement registry and one non-production/mock provider for contract tests.
- Validate provider configuration at the boundary.
- Add provider/model version to generation request metadata and usage-record plan.

**Acceptance criteria:**

- Capability summary reports configured/unavailable providers without tokens, raw configuration, or setup secrets.
- A request fails closed when the approved provider/model is unavailable.
- The registry returns a bounded, typed result and does not make a paid call.
- Tests cover unavailable configuration, malformed config, tenant-safe estimate/usage input, and no silent fallback.

**Out of scope:** A real paid provider and teacher-facing approval UI.

### VG-003 — Add storyboard visual asset planning and approval gate

**Outcome:** The teacher can review the visual approach and cost before any paid generation.

**Depends on:** VG-001, VG-002, ST-050, ST-054, ST-060.

**Scope:**

- Extend storyboard/planning output with proposed visual asset requests.
- Add a teacher-facing plan view with scene, purpose, visual role, source citation, provider/model, fallback, and estimate.
- Persist explicit approval/rejection and invalidate affected downstream state when changed.
- Require explicit teacher action before chargeable generation.

**Acceptance criteria:**

- Teachers can approve/reject individual requests and the total plan.
- Grounding-critical visual requests have only deterministic/source-derived options.
- Approval is tied to the exact request revision and estimate/configuration version.
- A changed provider, model, prompt/bounded brief, or cost requires reapproval.
- Cross-user/tenant and stale-edit tests pass.

**Out of scope:** External generation and automatic catalog retrieval.

### VG-004 — Implement one image-generation provider as an asset job

**Outcome:** A teacher-approved decorative image request creates a verified private asset through the shared job platform.

**Depends on:** VG-001 through VG-003; ST-004, ST-005, ST-006; asset validation foundations.

**Scope:**

- Implement exactly one provider adapter behind the registry.
- Create idempotent queued generation, staging, output validation, storage promotion, usage records, and safe failures.
- Support decorative images only; no generated motion and no grounding-critical content.
- Bind approved assets to their request revision.

**Acceptance criteria:**

- Duplicate requests converge on one logical generation operation and one authoritative asset.
- A provider timeout/retry, invalid binary output, quota failure, and terminal provider failure are safely classified.
- Provider output is staged, verified (type/size/dimensions/checksum), then promoted to private storage.
- Paid calls require approved request, quota check, correlation ID, and usage record.
- Logs exclude prompt source text when prohibited, secrets, signed URLs, and raw provider payloads.
- Authorization, concurrency, idempotency, retry, and asset-cleanup tests pass.

**Out of scope:** Image-to-video, arbitrary provider fallback, public media URLs.

### VG-005 — Render approved visual assets deterministically

**Outcome:** Verified generated/source-derived image assets can be used by whitelisted scene bindings in preview and final render.

**Depends on:** VG-001, VG-004, ST-065, ST-066, ST-068.

**Scope:**

- Extend whitelisted `LessonSpec` scene bindings to reference manifest assets by ID.
- Load only verified, version-bound private assets in preview/render manifests.
- Add deterministic fallback behavior for rejected/failed optional assets.
- Update validation and render hashing.

**Acceptance criteria:**

- Preview and final render use the same asset manifest and preserve render parity.
- Changing an asset binding invalidates the necessary preview/validation/render dependencies only.
- A render cannot start with an absent, stale, unverified, or cross-tenant asset.
- Current assets and generated assets preserve source/provenance display where required.
- Scene-level changes do not modify other scene bindings.

**Out of scope:** Generative video clips and broad scene-library redesign.

### VG-006 — Add contact-sheet review and advisory visual QA

**Outcome:** Teachers can assess generated visual candidates and final output more confidently without making subjective AI review a render blocker.

**Depends on:** VG-004, VG-005, ST-066, ST-068.

**Scope:**

- Create candidate/contact-sheet preview artifacts and safe UI.
- Add deterministic media/frame checks for generated assets and representative render frames.
- Optionally add model-assisted visual quality signals as warnings only, with recorded model/ruleset versions.

**Acceptance criteria:**

- Candidate comparison identifies request/scene, provenance, cost, and status.
- Deterministic failures such as corrupt/unreadable assets block use.
- Subjective visual checks are warnings, never the sole authority for renderability.
- The final validation record identifies exact asset/scene paths and becomes stale on relevant changes.

**Out of scope:** Automated acceptance of a candidate on behalf of the teacher.

### VG-007 — Pilot a graph-based motion system before generated motion

**Outcome:** AVLP improves educational motion where it has the highest factual and pedagogical value.

**Depends on:** Existing visual-runtime foundation; independent of VG-001 through VG-006.

**Scope:**

- Extend appropriate deterministic diagram scene contracts from fixed positions to nodes and edges.
- Use an automatic graph layout engine and Remotion path/spring animation.
- Pilot with `process` and `cause-effect` scenes.

**Acceptance criteria:**

- Diagrams are data-driven and do not accept arbitrary pixel coordinates from the model.
- Nodes/edges animate in sync with the narration timeline.
- Layout, validation, and preview/render parity tests cover representative documents.
- Existing templates continue to render unchanged.

**Out of scope:** 3D worlds, a generalized scene-library rewrite, generated video.

## 8. Future work explicitly deferred

### Generated motion clips

Consider only after VG-005 is production-proven. Limit early use to bounded decorative B-roll with no required labels, factual claims, or timing-critical explanation. A separate ADR is required before implementation because it changes cost, storage, moderation, validation, and runtime considerations.

### Licensed catalog or archive retrieval

Potentially valuable for historically grounded lessons, but must have a rights/provenance contract, metadata retention, attribution policy, and source/provider terms review. It is not a simple extension of image generation.

### Presenter/avatar video

This is a distinct product direction. It should be considered only if a presenter presence becomes a validated user need; it does not solve diagram or pedagogical-motion quality.

### Web research enrichment

The teacher's approved document remains AVLP's source of truth. Any later enrichment must be opt-in, visibly separated from document claims, citation-backed, and subject to its own source-grounding policy.

## 9. Cross-cutting requirements for every implementation story

- Preserve tenant isolation in every query, object key, signed URL, job, and provider call.
- Use strict TypeScript and validate every boundary.
- Keep `NormalizedDocument`, `LessonSpec`, `VisualAssetRequest`, and `AssetManifest` versioned.
- Preserve immutability for uploads, parser output, approved assets, lesson versions, and render manifests; teacher changes create overlays/revisions.
- Run expensive work only in idempotent, correlated, metered background jobs with a defined retry policy.
- Do not hold database transactions open across provider, storage, or rendering calls.
- Require explicit teacher action, quota checks, and usage records before paid calls.
- Never log secrets, signed URLs, raw provider payloads, or source content beyond existing approved logging policy.
- Validate assets before rendering, and never allow an external provider fetch during a render.
- Make deterministic validation authoritative; model-assisted visual assessment can only advise.
- Update shared contracts before API, worker, renderer, or UI consumers.

## 10. Decisions that need product-owner input before VG-001

1. Is paid generated imagery in scope for the next product phase, and what per-project/per-user budget caps apply?
2. Which first visual category should be supported: decorative illustrations only (recommended), source-derived illustrations, or licensed catalog assets?
3. Does the first release require teachers to approve every generated asset, or can they approve a bounded batch plan and later review exceptions?
4. Which provider is acceptable for the first adapter after privacy, regional availability, pricing, retention, and terms review?
5. Is the initial goal visual enrichment of existing templates, or should VG-007 (deterministic graph motion) be prioritized first for maximum educational value?

## 11. Recommended sequencing

1. Implement **VG-007** first if the immediate objective is visibly better explainers with exact educational fidelity.
2. In parallel planning only, refine VG-001 and make the paid-provider/product decisions above.
3. Implement VG-001 → VG-005 as the narrow, safe generated-image vertical slice.
4. Add VG-006 after actual assets are in the product.
5. Do not schedule generated motion/video until this vertical slice has operational cost, quality, and teacher-approval evidence.

## 12. Review checklist before story kickoff

- [ ] The story names the exact PRD/technical-guide sections it changes or extends.
- [ ] The source-of-truth, provenance, versioning, and retention rules are explicit.
- [ ] The contract/migration story precedes each consumer story.
- [ ] Provider/model changes require explicit approval and no silent fallback is possible.
- [ ] The story covers authorization, quota, idempotency, retries, concurrency, safe errors, and metering.
- [ ] The render always consumes a complete immutable manifest.
- [ ] The story contains a deterministic fallback if an optional asset is unavailable or rejected.
- [ ] The story contains tests for cross-tenant access and stale-version/render behavior.
- [ ] Licensing review confirms no OpenMontage code, prompts, schemas, or derived assets are copied.
