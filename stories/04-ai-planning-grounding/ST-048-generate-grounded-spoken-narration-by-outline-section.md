---
story_id: ST-048
title: "Generate Grounded Spoken Narration by Outline Section"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E9"]
prd_user_stories: ["E9-US1"]
depends_on: ["ST-047", "ST-043", "ST-042"]
---

# ST-048 — Generate Grounded Spoken Narration by Outline Section

## Story

As a teacher, I want an age-appropriate spoken script that explains one idea at a time and fits the selected lesson duration.

## Outcome

An asynchronous operation generates sectioned narration with source references, speech-oriented style, objective coverage, and word-count/duration validation.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E9-US1
- `docs/reference/epic-technical-implementation-guide.md` — E9 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-047
- ST-043
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define narration block and generation schemas.
- [ ] Create a versioned narration prompt from approved outline, objectives, configuration, and narrowed source packages.
- [ ] Generate spoken sentences by outline item or scene group.
- [ ] Enforce duration-based word-count targets and per-block estimates.
- [ ] Resolve source references for claims.
- [ ] Detect long copied passages, unsupported block IDs, excessive sentence length, and missing objective coverage.
- [ ] Persist draft narration revision and generation metadata.
- [ ] Expose job status and narration review UI state.

## Technical Implementation Requirements

- Narration should paraphrase rather than copy long source passages.
- AI-added analogies/examples must be represented as generated additions.
- The output remains a draft until editing/approval workflow.
- No TTS call occurs in this story.
- A claim can have multiple SourceRefs.

## Contracts and Persistence

- Narration revision/block.
- Narration source links.
- Generated additions.
- Narration generation job.

## Interfaces

- `POST /projects/:id/narration/generate`.
- `GET /projects/:id/narration`.
- Narration review route.

## Acceptance Criteria

- [ ] Generated narration is divided by approved outline structure.
- [ ] Word count and estimated duration fit configured tolerances.
- [ ] Claims resolve to valid source references or are labelled generated additions.
- [ ] Long source copying and unsupported claims are blocked/flagged.
- [ ] The job follows standard authorization, quota, metering, retry, and idempotency behavior.

## Required Tests

- [ ] Schema and duration tests.
- [ ] Source copying heuristic tests.
- [ ] Citation/generated-addition tests.
- [ ] Objective coverage tests.
- [ ] Job/API tests.
- [ ] Evaluation cases for clarity and age appropriateness.

## Out of Scope

- Narration editor actions.
- TTS and captions.
- Storyboard generation.

## Story-Specific Notes

- Technical guide references: E9.

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

## Review Record

- **Reviewer:** Kilo product code review; human approval on 2026-08-19.
- **Disposition:** Approved with follow-ups. ST-048 marked **Done** on 2026-08-19.
- **Review findings (tracked follow-ups):**
  - **M1 — Required "Evaluation cases for clarity and age appropriateness" are not runnable.** The prompt declares `narration-v1-clarity`/`narration-v1-age-appropriateness` (`prompts/narration/v2.ts:32-36`) but no fixture-based cases exist in `@avlp/evals`; only deterministic heuristics verify the criteria. Same gap already tracked for ST-044 M2. Add narration eval fixtures or defer to ST-053.
  - **M2 — Long-copied-passage detection only compares a sentence against the blocks it cites** (`narration-job.ts:290-305`), not the full bounded source package. A sentence copying a long passage from an uncited block can pass. Compare against the whole package (or cited block's section) and add an uncited-copy test.
  - **L1 — Review-route word-count status uses the configured target duration** (`narration.ts:364-373`) while the worker validates against covered outline seconds (`narration-job.ts:327-332`); a valid narration can show a spurious under/over warning. Align the budget basis.
  - **L2 — Duration status uses strict equality against the target** (`narration.ts:355`) with no outline tolerance band; spurious "under" warning when the approved outline total differs within tolerance.
  - **L3 — Output-schema bounds exceed persisted-schema bounds** for joined block text (40 × 1000 chars vs `boundedText(10_000)`) and generated additions (up to 40 sentences vs `max(20)`); latent `CANDIDATE_PERSIST_FAILED` risk. Align bounds or add a deterministic cap (same pattern tracked for ST-046 L2).
  - **L4 — `longestCopiedWordRun` over-counts run length** using single-word membership (`narration-job.ts:222-224`); cosmetic, pass/fail unaffected. Extend contiguously for accurate messages.
  - **L5 — Narration panel renders all warnings with `role="alert"`** (`narration-panel.tsx:190-194`); duration/word-count warnings are informational. Mirror the outline panel's status-vs-alert distinction.

## Dev Agent Record

- **Agent:** Kilo (deepseek/deepseek-v4-flash)
- **Started:** 2026-08-18
- **Completed:** 2026-08-18
- **Branch/PR:** `story/st-048` (local; not pushed)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-048 narration schemas (`narrationSentenceOutputSchema`, `narrationBlockOutputSchema`, `narrationOutputV1Schema`, `lessonNarrationSetSchema`, `lessonNarrationBlockSchema`, `narrationGenerationParamsSchema`, `narrationResponseSchema`, `narrationValidationSchema`, job-status/state/budget schemas, `currentNarrationGenerationCompatibility = narration@v2`) and constants (`narrationBlockMaximumSentences`, `narrationSentenceMaximumWords`, `narrationCopiedPassageMinimumRun`).
  - `packages/schemas/src/narration.test.ts` — new schema tests (20 tests).
  - `packages/database/src/schema.ts` — `narrationSets` + `narrationBlocks` tables with tenant-unique idempotency and tenant-scoped indexes.
  - `packages/database/drizzle/0034_natural_franklin_storm.sql` + `meta/_journal.json` + `meta/0034_snapshot.json` — migration.
  - `packages/provider-adapters/src/prompts/narration/v2.ts` — whole-set grounded narration prompt (new file).
  - `packages/provider-adapters/src/prompts/index.ts` — registers `narrationPromptV2`.
  - `apps/pipeline-worker/src/narration-job.ts` — job handler, `loadApprovedOutlineSet`, `computeOutlineSetContentHash`, `assertNarrationDeterministicChecks` (item coverage, sentence length, word-count budgets, long-copied-passage n-gram heuristic, unsupported blocks), idempotent `persistNarrationSet`.
  - `apps/pipeline-worker/src/narration-job.test.ts` — job tests (21 tests).
  - `apps/pipeline-worker/src/runtime.ts` — registers `narration.generate` handler + `ai.narration` quota (20/hr).
  - `apps/api/src/narration.ts` — `PostgresNarrationService` (`generate`, `current`).
  - `apps/api/src/narration-service.test.ts` — service tests (12 tests).
  - `apps/api/src/narration.test.ts` — route-level API tests incl. cross-tenant and origin checks (5 tests).
  - `apps/api/src/app.ts` + `runtime.ts` — `GET/POST /projects/:id/narration` + `/narration/generate` routes, DI wiring.
  - `apps/web/app/workspace/[projectId]/narration/` — read-only narration review page/panel (`page.tsx`, `narration-panel.tsx`, `narration-input.ts`, `narration-input.test.ts`).
  - `apps/web/app/workspace/page.tsx` — "Review narration" link for stages from `narration_storyboard_review`.
- **Migrations:** `0034_natural_franklin_storm` — `narration_set_status` enum, `narration_sets`, `narration_blocks`.
- **Contracts changed:**
  - New jobType `narration.generate`, operationType `ai.narration`, outbox event `narration.generate_requested.v1`.
  - `currentNarrationGenerationCompatibility = { promptId: "narration", promptVersion: "v2", model: "mock-model-1" }`.
  - Public schemas `NarrationOutputV1`, `LessonNarrationSet`, `LessonNarrationBlock`, `NarrationResponse`, `NarrationValidation`, `NarrationGenerationParams`.
- **Commands/tests run:**
  - `pnpm --filter @avlp/schemas test` (146 passed), `typecheck`, `lint`, `build`.
  - `pnpm --filter @avlp/database db:generate`, `test` (8 passed), `typecheck`, `lint`, `build`.
  - `pnpm --filter @avlp/provider-adapters test` (34 passed), `typecheck`, `lint`, `build`.
  - `pnpm --filter @avlp/pipeline-worker test` (88 passed), `typecheck`, `lint`, `build`.
  - `pnpm --filter @avlp/api test` (209 passed), `typecheck`, `lint`, `build`.
  - `pnpm --filter @avlp/web test` (43 passed), `typecheck`, `lint`, `build` (`next build` OK, `/workspace/[projectId]/narration` route compiled).
  - `pnpm --filter @avlp/evals eval` (fixture suite passed).
  - `pnpm run ci` — all passes except `@avlp/scene-library` Remotion headless-Chromium tests that time out under parallel load; the full scene-library suite passes when run alone (environmental, no scene-library files changed).
- **Screenshots or representative output:** Job handler e2e-style test produces a validated draft narration set (`candidateId` present); web build lists `/workspace/[projectId]/narration` route.
- **Decisions and assumptions:**
  - One model call per narration set producing `NarrationOutputV1` (blocks by outline item), matching the objectives/outline lifecycle exactly (quota, metering, model-call record, audit all standard).
  - Prompt v2 renders the whole approved outline + per-item word budgets; v1 stays registered but unused by the compatibility constant.
  - Word-count budgets derive from each outline item's `estimatedSeconds` via the existing `narrationWordCountRange`; the set total is validated against the sum of covered outline seconds.
  - "Missing objective coverage" is enforced as coverage of the approved outline structure (every approved outline item gets exactly one block), since objective coverage is already validated at outline approval.
  - Long-copied-passage detection is a deterministic word n-gram heuristic (minimum 8-word verbatim run vs cited source block text).
  - Review UI is read-only (no edit/approve controls); editing/approval/transforms are ST-049 scope.
- **Deviations from story/technical guide:**
  - Technical guide E9 suggests `POST /projects/{id}/narration-generations` and `GET /projects/{id}/narration/current`; the story's Interfaces list `POST /projects/:id/narration/generate` and `GET /projects/:id/narration`, which were implemented (story refines the guide; consistent with objectives/outline route naming).
  - `narration_operations` table deferred to ST-049 (transforms are out of scope here).
  - Evaluation cases are declarative prompt-registry metadata + deterministic heuristics (word budget, sentence length, copying) with tests, matching how objectives/outline stories satisfied the evaluation-cases requirement in this repo.
- **Known risks or follow-up:**
  - Real provider outputs will be much larger than the mock fixture; bounded repair + deterministic checks may reject whole sets more often until per-block regeneration (ST-049) lands.
  - Narration approval is not implemented (ST-049); `canApprove` is always `false` in the response.
