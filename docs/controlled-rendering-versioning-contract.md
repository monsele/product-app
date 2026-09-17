# Controlled Rendering and Versioning Contract

Contract revision: 1

Status: Shared implementation target for ST-094–ST-098, requested by the product owner. This document specifies intended behaviour; it does not claim the runtime or migrations are implemented, change an accepted ADR silently, or approve a new production schema version. Follow the repository source hierarchy and record architecture decisions through ADRs during implementation.

## Purpose and Ownership

An approved video must resolve to immutable content, design decisions, media, and renderer inputs. AI may propose supported choices during authoring; rendering consumes validated, resolved choices without new AI decisions.

| Story | Responsibility |
| --- | --- |
| ST-094 | Style/treatment/font versions and deterministic proof compositions |
| ST-095 | Versioned demonstration plans, persistent object state, verified timing, deterministic seeking |
| ST-096 | Immutable comparison variants, approach-sensitive identity, tenant ownership, job lifecycle |
| ST-097 | Resolved composition selections, personalisation/preset snapshots, locks, safe motion-energy changes |
| ST-098 | Consolidate actual shared interfaces, close cross-feature gaps, and verify this contract across supported combinations |

The earlier stories implement applicable requirements in their own scope; they do not wait for ST-098. Proof stories may use local immutable manifests and must not widen production contracts merely to implement this document. ST-098 depends on their completed implementations. This avoids a circular dependency.

Define shared runtime schemas in `packages/schemas`, rendering components in the existing scene/design packages, and job adapters in existing API/renderer infrastructure unless an ADR establishes a different boundary. Keep one authoritative definition per concept. Do not independently invent conflicting manifest, hashing, or version-resolution conventions in each feature.

## CR-01 — Bounded AI and Resolved Choices

AI may select registered style/treatment/recipe IDs and supported semantic parameters or personalisation values. Reject unknown versions, unsupported combinations, arbitrary coordinates, JSX/CSS, executable expressions, and unapproved asset references at the boundary.

Before approval/render, resolve any defaults, presets, layout choices, seeds, and timing plans. Persist the resolved selections, including teacher locks. Rendering and playback must not rerun selection, query the latest preset, interpret a natural-language prompt, or generate replacement assets.

During editing, show proposed compatible alternatives with a preview. Approval does not authorise later automatic substitution if a selected component becomes unavailable.

## CR-02 — Immutable Render Manifest

Exact schema names and nesting must be decided from existing contracts and recorded in an ADR before production consumers change. Do not assume existing `schemaVersion` numbers can be reused. The resulting manifest or linked immutable records must identify:

| Area | Required resolved information |
| --- | --- |
| Content | Lesson/snapshot version and checksum, source references, ordered stable scene IDs, text and structured visual data |
| Approach | Standard/demonstration selection; supported recipe and event-plan versions where applicable |
| Design | Pack/treatment versions, resolved overrides, selected compositions/locks, preset version provenance, planner version, saved random seed if used |
| Timing | Scene frame boundaries, audio identity/duration, caption cues, explanatory event timestamps, timing provenance, required readable holds |
| Media | Immutable asset IDs/versions/checksums, role, crop/derived-asset settings, fonts with weights and file checksums |
| Implementation | Exact rendering bundle/release digest, dependency lock/build identity, browser/encoder identity, relevant environment/profile settings |
| Output profile | Resolution, frame rate, codecs, pixel format, encoding and colour settings that affect output |

Store immutable records or immutable references; a mutable URL is not a snapshot. Signed URLs and temporary paths are resolved at execution time from authorised stable identities and are excluded from content identity.

The database-owned tenant/project scope is authoritative. A manifest checksum is not permission to access its referenced media. Validate ownership and checksum integrity before resolving assets in both preview and workers.

## CR-03 — Version Release and Retention

Publishing a changed style, treatment, recipe, preset, font, or renderer produces a new immutable release. Never overwrite bytes behind a previously published identity. Retain the implementation bundle and dependency/assets needed for the promised historical rendering capability, not just a version string.

Draft users can explicitly preview and apply an upgrade, creating a new design/lesson revision. Previously approved snapshots and outputs remain unchanged. A restore creates a new current version under existing restore semantics without rewriting history or silently selecting the newest style.

If a required old bundle cannot safely execute, is missing, or references deleted/unavailable media, return a specific rerender-unavailable reason. Continue serving the stored approved output where it remains available and authorised. Never silently substitute a newer implementation. Document retention/deletion behaviour using existing project and asset lifecycle rules; retention is not a promise to keep intentionally deleted data forever.

## CR-04 — Frame Determinism

For a fixed validated manifest, implementation, and supported environment, evaluating frame N must yield the same visual/event state independently of playback history or frame order.

Use frame-driven animation. Do not rely on wall-clock time, unseeded randomness, live content, incremental mutable counters, or whether prior frames have rendered. Font loading, media decoding, and asset readiness must complete before capture. Seed/version any permitted decorative randomness.

In demonstration scenes, derive quantities and object states from the validated initial state/event plan. Test intermediate states, including in-transit quantities, as well as final states. Seeking backward and jumping forward must preserve identity and meaning.

Preview and server rendering use the same resolved composition and media/font identities. Display transforms and viewport scaling must not alter the canonical video layout.

## CR-05 — Motion Energy Preserves Instructional Time

Keep narration playback rate/duration, scene boundaries, caption timings, explanatory event anchors/order, factual values, and minimum readable holds invariant when changing only motion energy.

Motion energy may change bounded decorative distance, easing, overshoot, emphasis strength, or secondary movement. Those changes must remain inside authored safe regions and timing intervals. They must not delay arrival of the result into its required inspection interval or make text illegible through continuous movement.

Every relevant treatment declares establish/explain/hold/exit constraints; demonstration recipes additionally declare semantic event anchors. Hold requirements are treatment/content-specific and validated. For comparisons of motion energy alone, freeze the treatment/content and its required holds.

If a requested energy setting cannot satisfy these constraints, report the conflict and propose an explicit compatible correction. Do not accelerate narration, shorten reading time, silently remove facts, or change semantic event timing. ADR-004 remains authoritative for measured narration duration and existing scene bounds.

## CR-06 — Identity, Caching, and Jobs

Use one canonical serialisation/hash policy for render-affecting manifest inputs. Sort object keys, preserve meaningful array order, reject non-finite values, and resolve defaults before hashing. Identify the policy/version so later changes do not reinterpret old hashes.

Changing content, approach, treatment/pack version, motion settings, event plan, media/font bytes, crop, seed, implementation, or output profile must invalidate the appropriate render identity. Credential refresh, temporary paths, and request timestamps must not. Provenance-only metadata changes need an explicitly documented policy rather than accidental cache behaviour.

Keep content identity separate from tenant-scoped job identity and output ownership. Equal hashes do not permit cross-tenant reuse. Reuse existing idempotent outbox/jobs, retry, correlation, and usage patterns. Concurrent equivalent requests must not create multiple authoritative results or duplicate billed work.

A queued job captures its immutable inputs. Worker completion verifies its identity and current job state before publishing; it must not attach an obsolete result to a newer draft or comparison. Rendering must not start a new AI/TTS/image-provider call implicitly.

## CR-07 — Preflight and Postflight

Preflight checks ownership, schema/version support, implementation availability, media checksums, fonts, resolved choices, valid event state, timing, text fit, caption exclusion, and safe areas. Use browser-based measurements after fonts load for actual wrapped layout, alongside fast boundary checks.

Preflight results are tied to manifest identity, validation ruleset, and relevant runtime environment. Reusing a result for changed inputs is invalid. A newer ruleset may prevent a new render of an old manifest, but must not mutate that manifest or historical approval evidence.

Postflight verifies output properties, audio presence/duration, scene coverage, and caption/event timing evidence. Use representative visual frames plus full-clip inspection for the release fixtures. A successful encoder exit alone is insufficient proof of correct content.

Record the immutable input identity, output checksum, render environment, validation result identity, and actual output location. Keep existing privacy rules for logs: no source text, secrets, signed URLs, or raw provider payloads.

## CR-08 — Reproduction Guarantees and Evidence

Distinguish three guarantees:

1. The stored approved output is the historical artefact; its checksum establishes exact byte identity.
2. A retained supported environment can reproduce the approved appearance, timing, and semantic state, using documented comparison criteria.
3. Different browser/encoder environments do not automatically guarantee byte-identical MP4s or pixel-identical frames.

Use exact assertions for semantic state, audio/cue identity, frame boundaries, and pinned parameters. Define visual/audio comparison methods and tolerances before evaluating results; report the chosen frames, metrics, and environment. Do not loosen tolerances merely to hide a regression. Bitwise video equality is required only if an explicitly supported profile claims it.

Keep regression fixtures for legacy output, style/treatment releases, dense text/diagrams, motion-energy settings, both demonstration recipes, saved preset edits, and controlled comparisons. Cover supported capability combinations; unsupported style/approach pairs should produce explicit failures, not require new product features to satisfy the matrix.

## Verification Matrix and Failure Behaviour

| Contract | Minimum evidence |
| --- | --- |
| CR-01 | Invalid AI choice rejected; rendering makes no new selection/provider call |
| CR-02 | Tampered media/manifest rejected; temporary URL refresh leaves identity unchanged |
| CR-03 | Render release A, publish B, then reproduce A; old preset/font identity retained; unavailable release fails without fallback |
| CR-04 | Direct/backward/out-of-order frames agree; browser/server comparisons pass defined criteria |
| CR-05 | Calm/balanced/lively preserve audio, captions, event anchors, values, and readable holds |
| CR-06 | One-field mutation checks; concurrent/retry/stale-result tests; tenant scope enforced |
| CR-07 | Font/layout/timing failure blocks output publication; validation is bound to exact inputs |
| CR-08 | Stored-output checksums and repeat-render evidence recorded separately; limitations documented |

Use stable structured failure categories for unsupported version, missing implementation, missing/changed asset, stale timing, invalid design, layout failure, incompatible motion setting, and unauthorised access. Bind exact API names to existing error conventions during implementation. Clients should show useful recovery actions while preserving the approved artefact and saved inputs.

## Adoption

ST-094–ST-097 must cite the applicable CR requirements in their implementation and completion records, documenting scope-limited gaps for ST-098. Their existing acceptance criteria remain in force. ST-098 owns final cross-feature verification and necessary shared-contract corrections, not retroactive claims that unsupported features exist.
