---
story_id: ST-046
title: "Generate a Grounded Duration-Aware Lesson Outline"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E8"]
prd_user_stories: ["E8-US1"]
depends_on: ["ST-045", "ST-043", "ST-042"]
---

# ST-046 — Generate a Grounded Duration-Aware Lesson Outline

## Story

As a teacher, I want AI to propose a logical instructional sequence that covers approved objectives within the selected duration.

## Outcome

An asynchronous operation creates a structured outline with hook, concept sequence, examples, summary, optional recall question, objective mappings, duration budgets, and citations.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E8-US1
- `docs/reference/epic-technical-implementation-guide.md` — E8 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-045
- ST-043
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define outline item and generation schemas.
- [ ] Create a versioned outline prompt using approved objectives, configuration, and bounded source packages.
- [ ] Generate required structural elements and optional recall question according to configuration.
- [ ] Map every item to one or more approved objectives.
- [ ] Allocate estimated time and enforce total duration tolerance.
- [ ] Resolve source block IDs to SourceRefs.
- [ ] Run deterministic coverage, citation, order, and duration checks.
- [ ] Persist a draft outline revision and generation metadata.

## Technical Implementation Requirements

- Do not generate narration or scenes yet.
- Every approved objective must be covered or explicitly reported as uncovered.
- Outline items are bounded and structured.
- The output is a draft until teacher approval.
- Source packages should narrow using objective links where useful.

## Contracts and Persistence

- Lesson outline revision.
- Outline item.
- Objective-to-outline mapping.
- Outline generation job.

## Interfaces

- `POST /projects/:id/outline/generate`.
- `GET /projects/:id/outline`.
- Outline review route states.

## Acceptance Criteria

- [ ] The generated outline contains the required instructional sequence.
- [ ] Every item maps to objectives and valid source references.
- [ ] Total estimated duration fits the configured target tolerance.
- [ ] Uncovered objectives or invalid citations block candidate acceptance.
- [ ] The job is authorized, metered, retryable, and idempotent.

## Required Tests

- [ ] Structured output tests.
- [ ] Objective coverage tests.
- [ ] Duration allocator tests.
- [ ] Citation tests.
- [ ] Job/API tests.
- [ ] Evaluation cases for sequence quality.

## Out of Scope

- Teacher outline editing/approval.
- Narration text.
- Scene template choice.

## Story-Specific Notes

- Technical guide references: E8.

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

- **Agent:** Kilo (deepseek/deepseek-v4-flash:discounted)
- **Started:** 2026-08-17
- **Completed:** 2026-08-17
- **Branch/PR:** `story/st-046` (local, not published)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-046 contracts: `outlineItemKindSchema`
    (`hook|concept|example|analogy|summary|recall_question`),
    `outlineDurationToleranceRatio` (0.1) and per-item bounds,
    `outlineGenerationParamsSchema` (configuration + `objectiveSetId`/`objectiveSetRevision`),
    `outlineOutputV1Schema` (structured output with objective links, source block IDs,
    estimated seconds, labelled-framing hook rule), `lessonOutlineItemSchema`/`lessonOutlineSetSchema`,
    `outlineGenerationCompatibilitySchema` + `currentOutlineGenerationCompatibility`
    (outline@v2/mock-model-1), `outlineGenerationJobStatusSchema`,
    `outlineGenerationResponseSchema`, `outlineGenerationStateSchema`, `outlineResponseSchema`;
    `packages/schemas/src/outline.test.ts` (22 tests).
  - `packages/database/src/schema.ts` — `lesson_outline_set_status` enum,
    `lesson_outline_sets`, `lesson_outline_items`, `outline_objective_links` tables
    (tenant-scoped, tenant-unique set idempotency key, JSONB `source_refs`,
    `framing_note`, `total_estimated_seconds`); migration `0032_greedy_stranger.sql`.
  - `packages/provider-adapters/src/prompts/outline/v2.ts` — real grounded prompt copy
    (v2 bump; uses `{{objectives}}`, `{{sourcePackage}}`, `{{configuration}}`);
    `prompts/index.ts` registers it; evaluation case names for sequence quality,
    objective coverage, and duration fit.
  - `apps/pipeline-worker/src/model-call.ts` — additive optional async
    `loadOperationContext` hook on the base lifecycle (loads project-owned context
    after the snapshot/source package are ready; returns prompt variables + an
    operation context passed to deterministic checks and candidate persistence).
    Objectives job untouched and still green.
  - `apps/pipeline-worker/src/outline-job.ts` — `computeObjectiveSetContentHash`,
    `loadApprovedObjectiveSet` (tenant-scoped; missing/not-approved/revision/snapshot
    checks), `assertOutlineDeterministicChecks` (coverage, citation, order/structure,
    optional recall question, duration tolerance, target match),
    `persistOutlineSet` (idempotent set + items + objective links),
    `createOutlineGenerationJobHandler` (`outline.generate`, `ai.outline`);
    `outline-job.test.ts` (23 tests).
  - `apps/pipeline-worker/src/runtime.ts` — registers `outline.generate` with mock
    provider, prompt registry, Postgres quota guard (20 calls/hr), mock pricing.
  - `apps/api/src/outline.ts` — `PostgresOutlineService` (`generate`, `current`);
    `outline-service.test.ts` (gating, envelope/outbox/audit, narrowing, idempotency,
    state derivation), `outline.test.ts` (route authz/tenant/origin), and
    `outline.integration.test.ts` (Postgres: job+outbox idempotency, tenant rejection,
    draft assembly, no state leak).
  - `apps/api/src/app.ts` — `GET /projects/:id/outline`,
    `POST /projects/:id/outline/generate` (202, idempotency-key header), service wiring;
    `apps/api/src/runtime.ts` wiring.
  - `apps/web/app/workspace/[projectId]/outline/` — `page.tsx` (server guard),
    `outline-panel.tsx` (client panel: idle/generating/draft/failed states, polling,
    generate/regenerate, draft item list with kinds, durations, framing notes,
    objective/source counts), `outline-input.ts` + `outline-input.test.ts`;
    `apps/web/app/workspace/page.tsx` adds a "Review lesson outline" link for stages
    at or past `outline_review`.
  - `STORY_INDEX.md` and this story — status transitions.
- **Migrations:** `0032_greedy_stranger` (creates `lesson_outline_set_status` enum and the
  three outline tables + indexes/FKs).
- **Contracts changed:** New `@avlp/schemas` public contracts listed above; new job type
  `outline.generate` (reuses `modelCallJobPayloadSchema` with `operationType: ai.outline`,
  prompt `outline@v2`); new endpoints `POST /projects/:id/outline/generate` and
  `GET /projects/:id/outline`; `@avlp/provider-adapters` prompt registry now includes
  `outline@v2`.
- **Commands/tests run:**
  - Per-workspace `lint`, `typecheck`, `test`, `build` for `@avlp/schemas` (114 tests),
    `@avlp/database` (8 pass, 3 skip), `@avlp/provider-adapters` (34),
    `@avlp/pipeline-worker` (67 pass, 20 skip — Postgres integration requires
    `TEST_DATABASE_URL`), `@avlp/api` (155 pass, 56 skip), `@avlp/web` (32).
  - Repository-wide `pnpm typecheck` (16/16), `pnpm build` (16/16), and `pnpm test`
    (26/26 tasks green on final run; one earlier `@avlp/scene-library#test` failure was
    parallel-load flakiness in its heavy Remotion render tests — it passes in isolation
    (53/53) and on the final turbo run).
  - `pnpm --filter @avlp/database db:generate` produced `0032_greedy_stranger`.
  - `pnpm --filter @avlp/evals eval` — `"passed": true`.
  - `git diff --check` — clean.
- **Screenshots or representative output:** `pnpm --filter @avlp/web build` shows the new
  `/workspace/[projectId]/outline` route; worker `outline-job.test.ts` verifies a full
  lifecycle run produces `candidateId` metadata for `ai.outline`; API service test verifies
  the queued job envelope carries `operationType: ai.outline`, objective-set narrowing, and
  an outbox + audit event.
- **Decisions and assumptions:**
  - Persistence follows the technical-guide E8 model (`lesson_outline_sets` +
    `lesson_outline_items` + `outline_objective_links`), with the tenant idempotency key
    on the set and `source_refs` JSONB on items. Approval/editing statuses are reserved
    for ST-047; this story persists only `draft`.
  - Deterministic checks (the outline evaluation cases): full approved-objective coverage,
    citation resolvability against the bounded source package, sequence opens with a hook
    and closes with a summary with ≥1 concept and ≥1 example, optional recall question per
    configuration, target-duration match, and a ±10% total-duration tolerance. Any
    violation terminates the job as `MODEL_OUTPUT_DETERMINISTIC_FAILURE`; nothing is
    silently accepted.
  - The hook may be an uncited generated framing device, but it must then carry a
    `framingNote` (per the technical guide's "must be labelled" rule); the story's
    acceptance criterion "every item maps to objectives" holds because every item
    (including hooks) links ≥1 approved objective.
  - The approved objective set is loaded from the DB by the worker (not shipped in the
    payload), so the prompt, coverage check, and persistence always use the exact approved
    revision; the API narrows the source package by the approved objectives' source-block
    IDs (guide: "source packages should narrow using objective links where useful"), only
    when the objectives cite any blocks.
  - The worker re-verifies the latest approved snapshot and the exact approved objective
    revision at job time (authoritative); the API gate uses `PostgresSourceSnapshotService.status`.
  - `POST /outline/generate` requires an `idempotency-key` header; the job is metered via the
    existing model-call lifecycle and guarded by an `ai.outline` quota (20 calls/hr).
  - `current` derives route state `idle | generating | draft | failed` and
    `canGenerate` (configuration present, source approved/not stale, an approved objective
    set exists, no in-flight job). `canApprove` is informational; approval lands in ST-047.
  - The UI covers review route states only (generate + draft display); editing/approval is
    ST-047 per the story's out-of-scope section.
- **Deviations from story/technical guide:** None material. The guide's
  `POST /projects/{id}/outline-generations` is implemented as the story's
  `POST /projects/:id/outline/generate`. The `outline@v1` structural prompt is retained in
  the registry alongside the new `v2`. The generic lifecycle gained a backward-compatible
  `loadOperationContext` hook rather than a new job pipeline.
- **Known risks or follow-up:**
  - Production model provider adapter + pricing still unconfigured (mock default); real
    deployments must wire a provider and pricing before paid calls (ST-071).
  - Postgres-backed integration coverage for the new tables/job is deferred to CI
    (`TEST_DATABASE_URL`); unit/service tests use fakes.
  - The quota guard is enforced in the worker; the API enqueues even if a project is near
    its limit (rejected later at the worker with terminal `AI_QUOTA_EXCEEDED`).
  - The objective-set content hash is derived from approved objective statements; if ST-045
    later changes how approved sets are versioned, the hash function must stay in sync.
  - ST-047 (edit/reorder/link/approve) will consume `lesson_outline_sets`/items/links and
    add the approval flow; the `status` enum already includes `approved`/`superseded`.

## Review Record

- **Reviewer:** Kilo product code review; human approval on 2026-08-17.
- **Disposition:** Approved with follow-ups. ST-046 marked **Done** on 2026-08-17.
- **Review findings (tracked follow-ups):**
  - **L1 — Duration tolerance does not reserve opening/closing transition time.** The
    deterministic check uses a symmetric ±10% band around the target with no transition
    reservation (guide E8). Documented decision; re-evaluate when narration/storyboard
    budgeting lands so transitions do not overflow the target.
  - **L2 — Output `sourceBlockIds` bound (≤100) exceeds the persisted `sourceRefs` bound
    (≤20) per item** (same latent pattern as the ST-044 objectives contracts). An item
    citing 21+ distinct sections would fail persistence as a retryable
    `CANDIDATE_PERSIST_FAILED`; align the bounds or add a distinct-section deterministic
    check.
  - **L3 — Duplicate objective IDs within one item are not rejected deterministically**;
    they surface as a retryable `CANDIDATE_PERSIST_FAILED` via the unique link index.
    Deduplicate per item or reject in `assertOutlineDeterministicChecks`.
