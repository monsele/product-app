---
story_id: ST-043
title: "Implement AI Provider Adapters, Prompt Registry, Structured Output, and Model-Call Logging"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E7", "E8", "E9", "E10", "E19", "E21"]
prd_user_stories: ["E7-US1", "E8-US1", "E9-US1", "E10-US1", "E21-US2"]
depends_on: ["ST-005", "ST-006", "ST-007", "ST-008", "ST-009", "ST-042"]
---

# ST-043 — Implement AI Provider Adapters, Prompt Registry, Structured Output, and Model-Call Logging

## Story

As the engineering team, we need one governed model-call lifecycle so each generation story is structured, traceable, retryable, testable, and replaceable.

## Outcome

The pipeline worker can execute versioned prompts through provider-neutral adapters, validate output schemas, meter usage, and persist complete model-call metadata.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E7-US1, E8-US1, E9-US1, E10-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E7, E8, E9, E10, E19, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-005
- ST-006
- ST-007
- ST-008
- ST-009
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create language-model provider interfaces and at least one configured adapter.
- [ ] Create a versioned prompt repository layout for objectives, outline, narration, storyboard, and grounding.
- [ ] Implement structured-output parsing with Zod validation and bounded repair/retry policy.
- [ ] Implement the standard model-call lifecycle: authorize inputs, quota guard, source package, job, provider call, schema validation, deterministic checks, persistence, usage record.
- [ ] Create model-call metadata persistence.
- [ ] Create mock/fixture provider for tests and local development.
- [ ] Add per-operation token/unit and estimated cost recording.

## Technical Implementation Requirements

- No model calls from React components or HTTP route handlers.
- Provider response types do not enter domain contracts.
- Prompt ID/version, model, input hash, output validation, latency, retries, cost, and correlation ID are mandatory.
- Prompt changes must run relevant evaluation cases.
- Do not automatically keep repairing unbounded invalid outputs.
- Paid operations require explicit user action and quota checks.

## Contracts and Persistence

- LLM adapter interface.
- Prompt definition/registry.
- Model-call record.
- Structured generation result/error.
- Quota guard interface.

## Interfaces

- Pipeline worker base generation handler.
- No specific product generation endpoint yet.

## Acceptance Criteria

- [ ] A mock provider produces a validated typed output and complete metadata record.
- [ ] Invalid structured output follows bounded retry then classified failure.
- [ ] Usage and cost metadata are persisted.
- [ ] Changing prompt versions changes the input-version/idempotency key.
- [ ] Default CI does not require live provider credentials.

## Required Tests

- [ ] Provider contract tests.
- [ ] Structured-output retry tests.
- [ ] Model-call metadata tests.
- [ ] Quota rejection test.
- [ ] Prompt-version/evaluation hook test.

## Out of Scope

- Choosing multiple production models.
- Objectives/outline/narration/storyboard prompts themselves.
- Human quality UI.

## Story-Specific Notes

- Technical guide references: section 9.1 and 9.2.

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

- **Agent:** Kilo
- **Started:** 2026-08-17
- **Completed:** 2026-08-17 (handed to review as In Review)
- **Branch/PR:** `story/st-043` (local; no PR opened).
- **Files changed:**
  - New package `packages/provider-adapters/` (`package.json`, `tsconfig.json`, `src/index.ts`, `src/contracts.ts`, `src/mock-provider.ts`, `src/structured-output.ts`, `src/prompts.ts`, `src/quota.ts`, `src/cost.ts`, `src/prompts/{objectives,outline,narration,storyboard,grounding}/v1.ts`, `src/prompts/index.ts`) with unit tests for contracts, mock provider, structured output, prompts/registry, quota, and cost.
  - `packages/schemas/src/index.ts` — model-call contracts (operation enum, validation status, `modelCallRecordSchema`, `modelCallParamsSchema`, `modelCallJobPayloadSchema`, structured generation result/error); `packages/schemas/src/model-call.test.ts`.
  - `packages/database/src/schema.ts` — `model_calls` table and `ai.grounding` usage-operation enum value; migration `0029_lush_quicksilver` + compatibility note.
  - `apps/pipeline-worker/src/model-call.ts` — `PostgresModelCallRepository`, `PostgresGenerationQuotaGuard`, `loadApprovedSourceSnapshot`, `createModelCallGenerationHandler` (the base generation handler lifecycle); `apps/pipeline-worker/src/model-call.test.ts`; `apps/pipeline-worker/src/model-call.integration.test.ts`.
  - `apps/pipeline-worker/package.json`, `pnpm-lock.yaml` — workspace dependency on `@avlp/provider-adapters`.
  - `STORY_INDEX.md` and this story — status transitions.
- **Migrations:** `packages/database/drizzle/0029_lush_quicksilver.sql` (adds `ai.grounding` to `usage_operation_type`; creates `model_calls` with tenant-unique idempotency key and project/correlation indexes) plus `0029_lush_quicksilver.compatibility.md`.
- **Contracts changed:** Added `ModelCallOperation` (`ai.objectives|ai.outline|ai.narration|ai.storyboard|ai.scene_regeneration|ai.grounding`), `ModelCallValidationStatus`, `ModelCallRecord`, `ModelCallParams`, `ModelCallJobPayload`, `StructuredGenerationResult`, `StructuredGenerationError` in `@avlp/schemas`; `LanguageModelProvider`, `PromptDefinition`/`PromptRegistry`, `QuotaGuard`, cost/pricing types, and `StructuredOutputError` in `@avlp/provider-adapters`.
- **Commands/tests run:** `pnpm install --frozen-lockfile`; per-workspace `lint`, `typecheck`, `test`, `build` for `@avlp/provider-adapters`, `@avlp/schemas`, `@avlp/database`, `@avlp/observability`, `@avlp/jobs`, `@avlp/evals`, `@avlp/pipeline-worker`; repository-wide `pnpm lint` (16/16), `pnpm typecheck` (16/16), `pnpm build` (16/16), `pnpm test` (affected workspaces green; scene-library Remotion render tests are environment-heavy and timed out under full parallel turbo runs but pass in isolation after clearing the webpack cache — unrelated to this story's changes). Tests added: provider-adapters 32, schemas 70 (incl. 10 model-call), pipeline-worker 28 passing + 20 skipped integration (incl. 10 model-call unit + 2 Postgres integration), database 8, observability 7, jobs 14, evals 7 + deterministic baseline `passed: true`.
- **Screenshots or representative output:** `pnpm --filter @avlp/evals eval` emits `"passed": true`; `pnpm --filter @avlp/provider-adapters test` → 32/32; `pnpm --filter @avlp/pipeline-worker test` → 28 pass / 20 skip (Postgres integration skipped without `TEST_DATABASE_URL`).
- **Decisions and assumptions:** Provider-adapters is a new workspace package so provider response types never enter domain contracts and CI needs no credentials (mock provider is the default adapter). Prompt registry is a static, in-memory versioned layout with duplicate-version rejection and exposed evaluation cases (the evaluation hook); real prompt copy is out of scope (ST-044+). Model-call idempotency key is a stable hash of job idempotency key + attempt + operation to stay within column limits. `inputVersion` is a SHA-256 over operation, prompt id/version, model, snapshot id/content hash, and params hash, so any prompt-version change changes the idempotency key. Failed and repaired calls are still persisted and metered so cost is never hidden. The base generation handler is not registered to a specific product job type (no product generation endpoint yet).
- **Deviations from story/technical guide:** None material. The base generation handler is implemented as a factory (`createModelCallGenerationHandler`) rather than a registered product job, matching the interface requirement that no specific product generation endpoint exists yet. Postgres-backed integration tests are present but skipped locally because `TEST_DATABASE_URL`/Docker Postgres is unavailable in this environment; CI supplies Postgres 16 and the tests run there.
- **Known risks or follow-up:** The mock provider pricing is illustrative; production pricing must be configured per model before paid calls. `model_calls` and usage recording run in the same job attempt and are idempotent by key; a mid-call provider failure records a failed call with zero usage/cost for the attempt that never returned. Scene-library render tests were observed timing out under full parallel turbo runs due to webpack cache corruption from install churn; clearing `packages/scene-library/node_modules/.cache` restores them and the failure is unrelated to this story.
- **Approved with follow-ups (code review, 2026-08-17):**
  1. Quota-rejection classification: `quotaGuard.assertCanGenerate` runs outside the handler's try block (`apps/pipeline-worker/src/model-call.ts:290` vs `try` at line 330), so the intended `QuotaExceededError → JobExecutionError("terminal", "AI_QUOTA_EXCEEDED")` mapping (lines 419-424) is dead code; a quota rejection currently escapes as a raw error that `classifyJobError` reports as retryable `UNEXPECTED_JOB_FAILURE`. Move the guard call into the try (or wrap it) and add a worker-level test asserting the classified terminal code.
  2. Wire the `structuredGenerationResultSchema`/`structuredGenerationErrorSchema` contracts (currently defined and tested but unconsumed) into the lifecycle or remove them until a consumer exists; document them as reserved for the operation-specific generation stories (ST-044+).
  3. Decide whether `deterministicChecks` should be required (or a named default no-op) so the deterministic-check lifecycle step cannot be silently skipped, and add a test for the deterministic-check-failure path.
  4. Run the Postgres-backed integration suite (`model-call.integration.test.ts`, quota guard, usage metering, audit write) in CI against PostgreSQL 16 — skipped locally without `TEST_DATABASE_URL`.
  5. Note that outline/narration/storyboard/grounding prompt templates reference operation-specific variables the base handler does not supply; they render only via per-operation `renderVariables` in ST-044+. Failed provider calls record zero usage/cost for the attempt; consider carrying partial usage on `ProviderCallError` for accurate metering.

