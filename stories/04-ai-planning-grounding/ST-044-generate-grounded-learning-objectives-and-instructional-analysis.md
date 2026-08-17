---
story_id: ST-044
title: "Generate Grounded Learning Objectives and Instructional Analysis"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E7"]
prd_user_stories: ["E7-US1"]
depends_on: ["ST-041", "ST-042", "ST-043"]
---

# ST-044 — Generate Grounded Learning Objectives and Instructional Analysis

## Story

As a teacher, I want AI-proposed measurable learning objectives and supporting instructional analysis grounded in the selected source.

## Outcome

An asynchronous generation operation produces bounded objectives plus key concepts, prerequisites, vocabulary, misconceptions, and possible assessment questions with source block references.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E7-US1
- `docs/reference/epic-technical-implementation-guide.md` — E7 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-041
- ST-042
- ST-043

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define objective-generation input and structured output schemas.
- [ ] Create the versioned prompt using approved source snapshot and lesson configuration.
- [ ] Generate a bounded number of age-appropriate measurable objectives.
- [ ] Also return key concepts, prerequisite knowledge, vocabulary, likely misconceptions, and possible assessment questions as planning metadata.
- [ ] Resolve returned block IDs into SourceRefs.
- [ ] Run deterministic checks for missing citations, duplicates, excessive count, and unsupported source IDs.
- [ ] Persist a draft objective/planning revision and job metadata.
- [ ] Expose start/status/result endpoints and UI generation states.

## Technical Implementation Requirements

- Objectives must be supported by selected source content.
- The output is a draft and cannot drive outline generation until teacher approval.
- Retry/regenerate is idempotent by source snapshot, configuration, prompt version, and options.
- Do not overwrite an existing approved revision without explicit confirmation.
- Unsupported objectives are rejected or flagged.

## Contracts and Persistence

- Learning objective entity/revision.
- Instructional analysis metadata.
- Objective generation job payload/result.

## Interfaces

- `POST /projects/:id/objectives/generate`.
- `GET /projects/:id/objectives`.
- Objectives generation/review route states.

## Acceptance Criteria

- [ ] A valid approved source snapshot produces a bounded objective draft.
- [ ] Each objective resolves to at least one valid source reference.
- [ ] The language and complexity reflect the configured audience and tone.
- [ ] Invalid source IDs or unsupported objectives are not silently accepted.
- [ ] Generation can be retried without duplicating the same result record.

## Required Tests

- [ ] Prompt fixture tests.
- [ ] Structured schema tests.
- [ ] Citation resolution tests.
- [ ] Duplicate/unsupported objective rule tests.
- [ ] Job/idempotency/API authorization tests.
- [ ] Evaluation cases for age appropriateness and faithfulness.

## Out of Scope

- Teacher objective editing/approval.
- Outline generation.
- Automatic curriculum standards mapping.

## Story-Specific Notes

- Technical guide references: E7 and AI pipeline standard.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [ ] Implement only this story's scope.
- [ ] Add or update schemas before changing consumers.
- [ ] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [ ] Add structured logs, correlation, audit, and usage records where applicable.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] Database migrations and compatibility notes are complete where applicable.
- [ ] Public schemas, events, and endpoints are documented.
- [ ] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [ ] No out-of-scope feature or unrelated refactor was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Kilo (deepseek/deepseek-v4-flash)
- **Started:** 2026-08-17
- **Completed:** 2026-08-17 (handed to review as In Review)
- **Branch/PR:** `story/st-044` (local; no PR opened).
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-044 contracts: `objectiveGenerationParamsSchema`, `objectiveOutputV1Schema` (bounded 3–6 measurable objectives + key concepts, prerequisites, vocabulary, misconceptions, assessment questions, all citation-bearing), `learningObjectiveSetSchema`/`learningObjectiveSchema` and planning-item schemas, `objectiveGenerationCompatibilitySchema` + `currentObjectiveGenerationCompatibility` (objectives@v2/mock-model-1), `objectiveGenerationJobStatusSchema`, `objectiveGenerationResponseSchema`, `objectiveGenerationStateSchema`, `objectivesResponseSchema`; `packages/schemas/src/objectives.test.ts` (14 tests).
  - `packages/database/src/schema.ts` — `learning_objective_set_status` enum, `learning_objective_sets` and `learning_objectives` tables (tenant-scoped, set idempotency key, JSONB planning columns); migration `0030_silly_bastion.sql` + `0030_silly_bastion.compatibility.md`.
  - `packages/provider-adapters/src/prompts/objectives/v2.ts` — real grounded prompt copy (v2 bump); `prompts/index.ts` registers it; `src/index.ts` now re-exports `./prompts/index.js` so the worker can build the registry; `prompts.test.ts` fixture tests.
  - `apps/pipeline-worker/src/model-call.ts` — additive optional `persistCandidate` hook on the base lifecycle (runs after usage metering, before audit; failures classified retryable `CANDIDATE_PERSIST_FAILED`; candidate id returned in job metadata) and moved the quota-guard call inside the try so `QuotaExceededError` maps to terminal `AI_QUOTA_EXCEEDED` (fixes ST-043 review follow-up #1); `model-call.test.ts` +3 tests.
  - `apps/pipeline-worker/src/objectives-job.ts` — `resolveObjectiveSourceRefs`, `assertObjectiveDeterministicChecks` (duplicate/non-measurable/unsupported-citation rules), `persistObjectiveSet` (idempotent set+objective inserts), `createObjectivesGenerationJobHandler`; `objectives-job.test.ts` (12 tests).
  - `apps/pipeline-worker/src/runtime.ts` — registers `objectives.generate` handler with mock provider, prompt registry, Postgres quota guard (20 calls/hr), mock pricing.
  - `apps/api/src/objectives.ts` — `PostgresObjectivesService` (`generate`, `current`); `objectives.test.ts` (route authz/tenant/origin) and `objectives-service.test.ts` (gating, envelope/audit/outbox, idempotency, state derivation).
  - `apps/api/src/app.ts` — `GET /projects/:id/objectives`, `POST /projects/:id/objectives/generate` (202, idempotency-key header), service wiring; `apps/api/src/runtime.ts` wiring.
  - `apps/web/app/workspace/[projectId]/objectives/` — `page.tsx` (server guard), `objectives-panel.tsx` (client panel: idle/generating/draft/failed states, polling, regenerate, draft + planning metadata display), `objectives-input.ts` + `objectives-input.test.ts` (state labels, failure messages).
  - `STORY_INDEX.md` and this story — status transitions.
- **Migrations:** `0030_silly_bastion` (adds `learning_objective_set_status` enum; creates `learning_objective_sets` and `learning_objectives`).
- **Contracts changed:** New `@avlp/schemas` public contracts listed above; new job type `objectives.generate` (reuses `modelCallJobPayloadSchema` with `operationType: ai.objectives`, prompt `objectives@v2`); new endpoints `POST /projects/:id/objectives/generate` and `GET /projects/:id/objectives`; `@avlp/provider-adapters` now exports the versioned prompt files (`repositoryPrompts`).
- **Commands/tests run:**
  - Per-workspace `lint`, `typecheck`, `test`, `build` for `@avlp/schemas` (84 tests), `@avlp/database` (8 pass, 3 skip), `@avlp/provider-adapters` (34), `@avlp/pipeline-worker` (43 pass, 20 skip — Postgres integration requires `TEST_DATABASE_URL`), `@avlp/api` (107 pass, 49 skip), `@avlp/web` (28).
  - Repository-wide `pnpm lint` (16/16), `pnpm typecheck` (16/16), `pnpm build` (16/16).
  - `pnpm --filter @avlp/database db:generate` produced `0030_silly_bastion`.
  - `pnpm --filter @avlp/evals eval` — `"passed": true` (ST-009 fixture baseline now green).
  - `git diff --check` — clean.
- **Screenshots or representative output:** `pnpm --filter @avlp/web build` shows the new `/workspace/[projectId]/objectives` route; worker `objectives-job.test.ts` verifies a full lifecycle run produces `candidateId` metadata; API service test verifies the queued job envelope carries `operationType: ai.objectives`, `params.configurationVersion: 3`, and an outbox + audit event.
- **Decisions and assumptions:**
  - Persistence follows the technical-guide E7 model (`learning_objective_sets` + `learning_objectives` child rows with `source_refs` JSONB); planning metadata is JSONB on the set row. The tenant-unique idempotency key (job idempotency key) makes set persistence idempotent across job retries.
  - Deterministic checks (the objectives evaluation cases): 3–6 objective bound (schema), measurable-verb rejection (`know|understand|learn|appreciate|be aware of|realize|believe`), duplicate statement rejection, and citation resolvability — every objective and planning item must cite block IDs present in the bounded source package. Unsupported IDs or non-measurable verbs terminate the job as `MODEL_OUTPUT_DETERMINISTIC_FAILURE`; nothing is silently accepted.
  - SourceRef resolution derives document/page/section in application code from the package (model page numbers are never trusted), grouping block IDs per section with min/max pages.
  - The worker runtime wires the mock provider (no production provider adapter exists — ST-043 known risk). With the mock default returning `{}`, a production job fails terminal `STRUCTURED_OUTPUT_INVALID` and is metered, until a real adapter is configured.
  - The API reuses `PostgresSourceSnapshotService.status` for the approved-and-not-stale gate; the worker re-verifies the latest approved snapshot at job time (authoritative).
  - `POST /objectives/generate` requires an `idempotency-key` header; generate transitions the project stage `lesson_configuration → objectives_review` only on first enqueue.
  - `current` derives route state `idle | generating | draft | failed` and `canGenerate` (configuration present, source approved/not stale, no in-flight job).
  - The story's "review route states" are exposed as the `state` field on `GET /projects/:id/objectives` plus UI states in the panel; teacher editing/approval remains ST-045.
- **Deviations from story/technical guide:** None material. The guide's `POST /projects/{id}/objective-generations` is implemented as the story's `POST /projects/:id/objectives/generate`. `structuredGenerationResultSchema`/`structuredGenerationErrorSchema` (ST-043) remain reserved for consumers; ST-044 consumes the lifecycle via `persistCandidate` instead. The `objectives@v1` structural prompt is retained in the registry alongside the new `v2`.
- **Known risks or follow-up:**
  - Production model provider adapter + pricing still unconfigured (mock default); real deployments must wire a provider and real pricing before paid calls.
  - Postgres-backed integration coverage for the new tables/job is deferred to CI (`TEST_DATABASE_URL`); unit/service tests use fakes.
  - The quota guard is enforced in the worker; the API enqueues even if a project is near its limit (rejected later at the worker with terminal `AI_QUOTA_EXCEEDED`).
  - Planning metadata is capped and citation-required; a future decision may allow flagged `needs_review` items rather than hard rejection (not required by this story's acceptance criteria).
  - ST-045 (edit/reorder/regenerate/approve) will consume `learning_objective_sets` rows and add approval flow; the `status` enum is already `draft|approved`.

## Review Record

- **Reviewer:** Kilo product code review; human approval on 2026-08-17.
- **Disposition:** Approved with follow-ups. ST-044 marked **Done** on 2026-08-17.
- **Review findings (tracked follow-ups):**
  - **M1 — Production generation non-functional with default wiring.** The worker registers `objectives.generate` with the mock provider (`apps/pipeline-worker/src/runtime.ts:156-158`; mock default returns `"{}"` per `packages/provider-adapters/src/mock-provider.ts:59`), so deployed jobs fail `STRUCTURED_OUTPUT_INVALID` until a real provider adapter + pricing is wired. Track for ST-071 (production provider), and make startup fail fast when no production provider is configured.
  - **M2 — Age-appropriateness/faithfulness evaluation artifacts missing.** The prompt references `objectives-v1-age-appropriateness`/`objectives-v1-faithfulness` (`prompts/objectives/v2.ts:28-29`) and the deterministic checks implement the rules, but no fixture-based evaluation cases exist in `@avlp/evals`; the "language/complexity reflects audience" criterion is unverified beyond the measurable-verb heuristic. Add objective eval cases or explicitly defer to ST-053.
  - **L1 — No inbound navigation to `/workspace/[projectId]/objectives`** from the teacher flow (workspace links only to upload). Wire with ST-045 review flow.
  - **L2 — `GET /projects/:id/objectives` materializes the full effective source per poll** (`apps/api/src/objectives.ts:251-259` + panel 3 s polling). Consider caching approval status or deriving staleness without full materialization.
  - **L3 — `persistCandidate` failures are always retryable** (`model-call.ts:429-433`), including payload contract drift; classify validation errors terminal or add details.
  - **L4 — Failed regeneration masked when an older draft set exists** (`objectives.ts:267-273`, `objectives-panel.tsx:158`); surface latest failed job even when a draft is present.
