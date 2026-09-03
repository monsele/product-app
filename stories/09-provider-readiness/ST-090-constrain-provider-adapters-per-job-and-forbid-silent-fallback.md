---
story_id: ST-090
title: "Constrain Provider Adapters per Job and Forbid Silent Fallback"
phase: "09 — Provider Readiness"
status: Ready
priority: should-have
epics: ["E21"]
prd_user_stories: []
depends_on: ["ST-006", "ST-059"]
---

# ST-090 — Constrain Provider Adapters per Job and Forbid Silent Fallback

## Story

As an operator, I want each pipeline job restricted to the provider adapters it legitimately needs, and any provider substitution to be impossible without a new approval, so that cost attribution is exact by construction and an approved plan cannot be quietly executed with a different model.

## Outcome

Every job handler resolves adapters through a declared allow-list, enforced before any external call. An unavailable approved provider fails closed rather than substituting. Each selection is recorded with enough detail to explain it later.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md` — E21
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/claude_openmontage-final-consolidated.md` — §1.4 items 2, 3 and 6; §2.3
- `stories/00-foundation/ST-006-add-structured-observability-audit-events-and-usage-metering.md`
- `stories/05-editor-assets-versioning/ST-059-generate-limited-scene-illustrations-with-review-and-cost-controls.md`

## Dependencies

- ST-006
- ST-059

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Problem

`packages/provider-adapters` exposes several adapter families — structured text via `together-provider.ts` and `structured-output.ts`, binary assets via `IllustrationProvider` (`packages/provider-adapters/src/contracts.ts:89`) — and job handlers in `apps/pipeline-worker/src/` receive an adapter by construction. Nothing declares which adapters a given job is entitled to use, and nothing prevents a future handler, or a future edit to an existing one, from reaching a family it has no business calling.

Two consequences follow:

- **Cost attribution is conventional rather than structural.** A job's spend is correct because its wiring is correct today, not because anything enforces it.
- **Provider substitution is undetectable.** Once a teacher approves a provider, model, and cost estimate, nothing in the type system prevents the work from being executed against a different one. The failure mode is silent: the render succeeds, the cost differs, and the approval record no longer describes what happened.

The second point is the sharper one. The system already requires explicit teacher approval before paid work, so approval carries real weight; nothing currently guarantees the approval and the execution refer to the same provider.

## Scope

- [ ] Declare a per-job adapter allow-list in `packages/provider-adapters`, one declaration per job type.
- [ ] Enforce at adapter resolution time, before any external call is issued.
- [ ] Make substitution of an approved provider or model a typed failure requiring re-approval, rather than a fallback.
- [ ] Emit an audit event on any envelope violation, per the conventions in `packages/observability`.
- [ ] Record provider, model, contract version, selection reason, approval reference, estimate, and actual cost on each selection.

## Technical Implementation Requirements

- **Enforce at resolution, not at call sites.** A call-site check is bypassed by the next call site. The resolution boundary is the only place the constraint holds for callers that do not yet exist.
- **Fail closed.** If the approved provider or model is unavailable, the job fails with a typed error naming what was approved and what was found. It does not select an alternative, and it does not silently downgrade.
- The allow-list is declared in one place per job and must be readable without tracing the wiring. An operator should be able to answer "what can this job call?" by reading one declaration.
- The envelope covers adapter families, not individual models. Model-level approval is already enforced through the approval record; this story prevents a job from reaching an entirely different capability.
- Introducing the envelope must not require reworking existing handlers' logic. Prefer wrapping the resolution path over editing 26 job handlers.
- Violation is an operational signal, not a user-facing error. Audit it with the job id, the requested adapter, and the correlation id; surface a safe generic error to the caller.
- **Do not record synthetic "alternatives rejected".** With a single configured provider per capability there are no genuine alternatives, and inventing a list produces audit noise that will be trusted later. Record the actual selection and its rationale. Add alternatives only when AVLP genuinely evaluates more than one option; that is a separate story.

## Contracts and Persistence

- A per-job adapter allow-list declaration, typed, colocated with the adapter contracts.
- A typed envelope-violation error, distinct from `ProviderCallError`.
- The selection record extends the existing `usageRecords` metadata or the audit event shape from ST-006. Prefer extending an existing shape additively over introducing a new table.
- No migration is expected. Confirm during implementation.

## Interfaces

- `packages/provider-adapters` — allow-list declaration and enforced resolution.
- `apps/pipeline-worker/src/` — job handlers resolve through the enforced path.
- `packages/observability` — audit event on violation and on selection.

## Acceptance Criteria

- [ ] A job requesting an adapter outside its envelope fails with a typed error before any external call is made.
- [ ] No network call is issued when resolution is denied. This is asserted by test, not by inspection.
- [ ] The envelope for any job is discoverable by reading one declaration.
- [ ] A job whose approved provider or model is unavailable fails closed with a typed error naming the approved and found values; it does not substitute.
- [ ] Envelope violations appear in the audit stream with job id, requested adapter, and correlation id.
- [ ] Each provider selection records provider, model, contract version, reason, approval reference, estimate, and actual cost.
- [ ] No selection record contains a fabricated alternatives list.
- [ ] Existing job behaviour is unchanged for every legitimate call.

## Required Tests

- [ ] Unit: allowed and denied resolution for each declared job type.
- [ ] Unit: the typed envelope-violation error is distinct from a provider call failure.
- [ ] Integration: no external call is issued on a denied resolution, verified against a spy or fake transport.
- [ ] Integration: an unavailable approved provider fails closed and does not fall back.
- [ ] Integration: the audit event is emitted with the expected fields on violation.
- [ ] Regression: every existing job continues to resolve its legitimate adapters and complete successfully.

## Out of Scope

- Budget caps and spend enforcement.
- Runtime reconfiguration of envelopes, or an admin surface for editing them.
- A provider scoring or ranking model of any kind.
- Recording rejected alternatives. Gated on AVLP actually evaluating more than one provider.
- Adding or changing any provider adapter.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass, including the assertion that a denied resolution issues no network call.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] Every existing job type has a declared envelope; none is left implicitly unrestricted.
- [ ] Audit events follow `packages/observability` conventions and contain no secrets, signed URLs, or raw provider payloads.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-006. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- This story merges two proposals: the enforcement mechanism from one discovery document and the no-silent-fallback rule from another. The rule is the *what*; the envelope is the *how*. Neither is complete alone.
- An earlier proposal suggested introducing allow-lists alongside the first binary-asset adapter rather than as standalone work. That adapter has already shipped in ST-059, so the moment has passed and this is now the only available shape.
- Sequenced last of the current set. Its marginal risk reduction is small while a single provider is configured per capability, but the cost of adding it grows with every new job handler, so "last" should not become "never".
- Derived from `docs/claude_openmontage-final-consolidated.md` §2.3 and §5.

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
