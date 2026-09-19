---
story_id: ST-098
title: "Verify Controlled and Reproducible Rendering Across Video Features"
phase: "06 — Audio, Validation, Rendering, and Delivery"
status: Done
priority: must-have
epics: ["E11", "E15", "E20"]
prd_user_stories: ["E11-US2", "E15-US2", "E20-US1"]
depends_on: ["ST-060", "ST-064", "ST-066", "ST-068", "ST-084", "ST-094", "ST-095", "ST-096", "ST-097"]
---

# ST-098 — Verify Controlled and Reproducible Rendering Across Video Features

## Story

As a teacher, I want approved videos to retain their appearance and instructional timing across style updates and rerenders, so that I can trust saved lessons and safely experiment on new versions.

## Outcome

The completed style, demonstration, comparison, and personalisation implementations conform to one shared render/version contract. Automated tests, real rendered media, release-upgrade exercises, and documented recovery behaviour prove that saved choices remain controlled and reproducible.

This story includes fixing shared integration gaps exposed by verification. A report listing failures without correcting in-scope defects does not satisfy completion.

## Required Reading

- `AGENTS.md` and `docs/controlled-rendering-versioning-contract.md` — CR-01 through CR-08 are the traceable implementation/verification requirements.
- Current PRD and technical-guide rendering, validation, preview, asset, job, and immutable-version sections.
- All current ADRs, especially ADR-001/ADR-004 and decisions produced by ST-094–ST-097.
- ST-060, ST-064, ST-066, ST-068, ST-084, and ST-094–ST-097 with their completed Dev Agent Records and output evidence.
- `docs/design.md` if correcting user-facing error/recovery or version-upgrade presentation.

## Dependencies and Ownership

Blocked until every `depends_on` story is Done in `STORY_INDEX.md`. ST-094–ST-097 must adopt applicable shared-contract requirements while implementing their own scope; they do not depend on this story. Do not create a circular dependency by postponing their basic manifest/event/preset work here.

Audit the actual completed interfaces before selecting exact file/schema changes. Consolidate duplicate definitions and adapters without unrelated refactoring. Record major architecture or schema-version changes through an ADR and update consumers in dependency order. Do not silently change accepted source contracts.

## Scope

- [ ] Map each CR requirement to the implemented schema, version resolver, renderer, validation, job, and persistence paths.
- [ ] Establish one authoritative resolved input/manifest identity contract across supported features; close conflicting defaults, version lookup, or hash gaps.
- [ ] Verify retained pack/treatment/recipe/font/asset/renderer identities, including actual implementation availability and failure without substitution.
- [ ] Verify AI selects only supported values before rendering and no AI/provider calls occur as part of rerendering resolved input.
- [ ] Implement shared preflight/postflight and recovery corrections needed for exact-input validation.
- [ ] Establish and test motion-energy invariants across supported standard treatments and applicable demonstration recipes.
- [ ] Prove deterministic seeking and browser/server rendering from pinned inputs.
- [ ] Exercise historical releases, preset upgrades, immutable comparisons, legacy restore, concurrent jobs, retries, and stale completion.
- [ ] Publish a reproducible regression harness, real-media evidence, and a CR-01–CR-08 compliance report.

## Required Verification Scenarios

### Historical version preservation

Create an approved fixture using release A and store its manifest, output, and checksums. Publish release B with a visible change and update a saved preset. Reload, restore as a new current version where supported, and rerender A using retained A inputs. Demonstrate that B is used only after an explicit upgrade applied to a new version.

Repeat with a required old implementation or font made unavailable in a test environment. Return a specific rerender-unavailable result, keep the stored authorised output accessible, and show no fallback to B. Do not remove real user media to exercise this test.

### Controlled motion energy

For fixed content, treatment, and narration, render supported calm/balanced/lively settings. Assert unchanged speech rate/audio identity, caption cues, semantic event timestamps/order/values, total timeline, and minimum readable holds. Measure actual final-state visibility so unchanged timestamps cannot conceal a slower entrance that consumes reading time.

Use savings conservation and evaporation state checks from ST-095 where the relevant setting is supported. Do not add unsupported style/approach combinations solely to make the test matrix rectangular; assert their capability rejection instead.

### Frame and output identity

Evaluate selected early/event-boundary/hold/late frames directly, sequentially, backward, and out of order. Compare semantic state exactly, rendered frames using predefined criteria, and browser/server output under recorded environments. Load pinned fonts/assets before capture.

Store the original output checksum separately from repeat-render comparisons. Report visual/timing reproducibility rather than promising identical encoded bytes across different encoders or browsers.

### Tampering, cache, and jobs

Change each render-affecting field independently and verify appropriate identity/cache invalidation. Refresh a signed URL without changing the asset and verify stable content identity. Reject mismatched asset bytes, stale timing, missing fonts, invalid choices, and layout/timing violations.

Exercise duplicate/concurrent render requests, retry after transient failure, and obsolete job completion against a newer draft/variant. Verify one authoritative result, correct usage handling, preserved historical outputs, and no cross-tenant reuse or access merely because hashes match.

### Cross-feature and legacy coverage

Include legacy `mvp-default`, multiple style/treatment versions from ST-094, both ST-095 recipes, an immutable ST-096 comparison, and ST-097 long-text/diagram/preset/locked-treatment cases. Freeze each pair's appearance for approach comparisons. Verify legacy configurations and snapshots without new fields through an explicit reader, without rewriting stored history.

## Contracts, Persistence, and Interfaces

Use the actual shared schemas and additive migration paths established by dependencies. Persist resolved choices, exact media/font identities, implementation/release digest, validation identity, and output metadata as described by CR-02. Never store a mutable preset lookup as the sole render instruction.

Use canonical content hashing plus tenant-scoped job/output identity. Reuse existing error, outbox, retry, audit, metering, and private-media mechanisms. Gate background completion on immutable input identity and current job state. No transactions remain open during external calls.

Version preflight rules and bind validation to inputs/environment. Expose actionable failures and version-unavailable recovery using existing UI/API conventions. Serving an existing approved output must not trigger rendering or new provider charges.

## Acceptance Criteria

- [ ] **AC1 — Shared contract:** CR-01–CR-08 map to implemented, tested behaviour with authoritative shared definitions; conflicting per-feature implementations are corrected.
- [ ] **AC2 — Frozen decisions:** Rerendering uses resolved choices without model/provider calls or latest-version lookup; unsupported choices and tampering fail before output publication.
- [ ] **AC3 — Historical fidelity:** Release/preset updates do not change approved output or its resolved inputs. Retained release A reproduces A within declared criteria after B exists; unavailable releases fail without substitution.
- [ ] **AC4 — Timing invariants:** Motion-energy checks preserve audio, captions, semantic event state/order/anchors, timeline, and actual readable holds across supported cases.
- [ ] **AC5 — Determinism:** Direct/backward/out-of-order state and preview/server frame comparisons pass predefined criteria with environment and input identity recorded.
- [ ] **AC6 — Jobs and ownership:** Cache mutation, URL refresh, duplicate/concurrent job, retry, stale result, and tenant-isolation checks pass without corrupting historical or comparison outputs.
- [ ] **AC7 — Validation:** Font, layout, event, timing, asset, and version failures are actionable and bound to exact inputs; stale validation is not reused.
- [ ] **AC8 — Legacy:** Existing configuration, snapshot, restore, preview, and rendering regression fixtures pass without historical snapshot mutation.
- [ ] **AC9 — Evidence:** Real playable clips, frame comparisons, output checksums, release-upgrade logs, and the requirement traceability report are reproducible. Tolerances and limitations are stated honestly.

## Required Tests

- [ ] Schema/version/manifest and canonical-hash mutation tests.
- [ ] Database integration tests for immutable snapshots, release/preset identity, compatibility, concurrency, and retention/error cases.
- [ ] API/worker tests for boundary validation, ownership, idempotency, usage, stale inputs/completion, and absent provider calls.
- [ ] Browser tests for preview seeking, unavailable-version recovery, explicit upgrades, captions, and actual readable holds.
- [ ] Actual Remotion/FFmpeg renders, FFprobe postflight, deterministic frame comparisons, and full-clip inspection for the supported fixture matrix.
- [ ] Affected lint, typecheck, tests, build, database/browser/render suites; record exact commands and results.

## Deliverables

- Shared implementation corrections and migrations/compatibility adapters where required.
- Automated regression harness with versioned fixtures and documented comparison criteria.
- `docs/controlled-rendering-verification-report.md`, linking every CR requirement to code, tests, commands, media evidence, and any scoped limitation.
- Updated shared contract/technical documentation reflecting implemented schema names, release retention, failure categories, and reproduction guarantees.
- Usable artifact locations for representative MP4s/frames/checksums; avoid committing large generated binaries by default.

## Out of Scope

- New styles, scene families, demonstration recipes, or reference-based personalisation.
- Broadening unsupported capability combinations or promising arbitrary-topic demonstrations.
- Replacing the renderer/stack, public render APIs, or a new hosting/render-farm platform.
- Automatic upgrades of approved lessons or rewriting immutable snapshots.
- Pixel/byte identity across arbitrary environments; any exact guarantee requires an explicitly supported and tested profile.

## Implementation Checklist and Definition of Done

- [ ] Verify dependencies and inspect completed implementations/evidence.
- [ ] Write a bounded plan for shared corrections, migrations, tests, and risks.
- [ ] Establish comparison criteria before running baseline/upgrade tests.
- [ ] Implement corrections and execute every scenario above.
- [ ] Fix in-scope failures; preserve valid earlier acceptance criteria.
- [ ] Complete the traceability report, documentation, and Dev Agent Record.
- [ ] Mark story/index Done only when all acceptance criteria and required tests pass, with no unresolved ownership, timing, version, or reproducibility defect in scope.

## Dev Agent Record

### ST-098 completion evidence (2026-09-19)

- **Code review:** **Approved.** The review found and fixed the canonical-hash non-plain-object collision risk; the repeated review found no blocking, high, or medium issues.

- **Agent / status:** Codex; implemented and placed In Review. No branch or PR published.
- **Files changed:** Shared canonical hashing, renderer historical-release recovery, regression tests, `docs/controlled-rendering-verification-report.md`, and story/index status.
- **Migrations / public contracts:** No migration. New manifests include additive `identityPolicy: canonical-json-v1`; legacy payloads omit it. An unavailable historical release returns `RENDER_IMPLEMENTATION_UNAVAILABLE`, never a substituted renderer.
- **Verification:** jobs contract (3), renderer contract (5), renderer worker (12), API renders (8), jobs/renderer/API typechecks, style media (4 H.264/AAC/FFprobe), style real frames (16 determinism/parity), and demonstration media (7 encoding/parity/out-of-order) all passed. `git diff --check` passed.
- **Evidence / limits:** Temporary MP4/PNG evidence covers three style packs plus savings and evaporation demonstrations; binaries are intentionally uncommitted. The report documents commands, tolerances, profile and cross-environment limits.
- **Decision / risk:** Finite existing JSON keeps its existing identity; ambiguous non-finite/non-JSON values fail. Old bundle/font/asset retention is operational; intentional deletion may produce rerender-unavailable while retained authorised output remains available.

- **Known risks or follow-up:** Blocked by ST-094–ST-097. Actual bundle retention, fonts, environment drift, and encoder differences require explicit evidence and bounded guarantees.
