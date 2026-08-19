---
story_id: ST-049
title: "Edit or Regenerate Individual Narration Blocks with Dependency Invalidation"
phase: "04 \u2014 AI Planning and Grounding"
status: In Review
priority: must-have
epics: ["E9", "E14", "E15", "E16", "E17", "E20"]
prd_user_stories: ["E9-US2"]
depends_on: ["ST-048"]
---

# ST-049 — Edit or Regenerate Individual Narration Blocks with Dependency Invalidation

## Story

As a teacher, I want to directly edit or shorten, simplify, expand, or regenerate one narration block without changing the rest of the lesson.

## Outcome

Block-level editing preserves unaffected content and marks only dependent audio, captions, previews, validation, and renders stale.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E9-US2
- `docs/reference/epic-technical-implementation-guide.md` — E9, E14, E15, E16, E17, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-048

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement direct narration block editing with revision control.
- [ ] Implement shorten, simplify, expand, and regenerate-one-block generation actions.
- [ ] Provide neighboring outline/narration context and bounded source package to regeneration.
- [ ] Re-resolve citations and generated additions for regenerated content.
- [ ] Implement dependency invalidation events and stale markers.
- [ ] Preserve all other narration blocks and teacher edits.
- [ ] Provide UI save, generation, conflict, stale, and restore/candidate states.

## Technical Implementation Requirements

- Direct teacher edits retain existing citations unless removed, but grounding recheck can flag unsupported edits.
- Paid regeneration requires explicit action and idempotency.
- Changing narration invalidates that scene/block audio, captions, preview cache, validation hash, and not-yet-started renders.
- Do not automatically regenerate dependent artifacts.
- Approved snapshots remain immutable.

## Contracts and Persistence

- Narration update command.
- Partial generation job.
- Artifact dependency/staleness record or derived hash policy.

## Interfaces

- Block edit endpoint.
- `POST /projects/:id/narration-blocks/:blockId/regenerate` with mode.
- Narration block editor controls.

## Acceptance Criteria

- [ ] Editing one block leaves all other blocks unchanged.
- [ ] Each regeneration mode produces a candidate for only the selected block.
- [ ] Citations are retained or recalculated according to edit type.
- [ ] Only dependent artifacts become stale.
- [ ] Concurrent edits and duplicate regeneration commands are handled safely.

## Required Tests

- [ ] Block isolation test.
- [ ] Mode prompt fixture tests.
- [ ] Dependency invalidation tests.
- [ ] Citation retention/recalculation tests.
- [ ] Idempotency/concurrency tests.
- [ ] Editor Playwright test.

## Out of Scope

- Whole-narration automatic regeneration.
- TTS generation.
- Full version restore.

## Story-Specific Notes

- Technical guide references: E9 and dependency invalidation section 6.3.

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

- **Agent:** Kilo (deepseek-v4-flash) — `next-story` skill
- **Started:** 2026-08-19
- **Completed:** 2026-08-19 (marked In Review)
- **Branch/PR:** `story/st-049` (local only; no PR opened)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-049 narration editor contracts (`narrationTransformModeSchema` shorten/simplify/expand/regenerate, `narrationBlockUpdateInputSchema`, `narrationBlockTransformInputSchema`, `narrationTransformParamsSchema`, `narrationBlockTransformOutputSchema` (`narration-block-v1`), `narrationTransformResponseSchema`, `narrationCandidateDecisionInputSchema`, `narrationBlockRestoreInputSchema`, `narrationBlockCandidateSchema`, `narrationBlockRevisionSchema`, `narrationBlockRevisionsResponseSchema`, `narrationBlockMaximumActiveCandidates`, `currentNarrationTransformCompatibility = narration-block@v1`); `contentHash` fields on `lessonNarrationBlockSchema`/`lessonNarrationSetSchema`; `NarrationResponse` extended with `canEdit`, `stale`/`staleReason`, `candidates`, `latestTransformJob`. Hash computation moved to `@avlp/config` to keep schemas browser-safe.
  - `packages/schemas/src/narration.test.ts` — content-hash, transform, candidate/revision, and response-schema tests (162 tests).
  - `packages/config/src/index.ts` — `computeNarrationBlockContentHash`, `computeNarrationSetContentHash` (canonical SHA-256, server-only).
  - `packages/database/src/schema.ts` — `narration_block_candidates` (tenant-unique per-block idempotency key), `narration_block_revisions` (rollback history), `narration_blocks.origin` column, new `audit_event_type` values (`narration.edited`, `narration.block_candidate_accepted`, `narration.block_candidate_rejected`, `narration.block_restored`).
  - `packages/database/drizzle/0035_grey_reavers.sql` + `meta/_journal.json` + `meta/0035_snapshot.json` — migration.
  - `packages/provider-adapters/src/prompts/narration-block/v1.ts` — one-block transform prompt (new file) with mode, neighboring narration, outline item, and bounded source package; registered in `prompts/index.ts`.
  - `packages/provider-adapters/src/prompts.test.ts` — mode prompt fixture tests (35 tests).
  - `apps/pipeline-worker/src/narration-transform-job.ts` — new `narration.transform` job (new file): tenant-scoped context load (set/block/neighbors/approved outline with hash binding), single-block deterministic checks (mode match, outline item match, word budget, shorten/expand direction, sentence ceiling, citation resolution, copied-passage), idempotent candidate persistence, terminal error codes (`NARRATION_SET_REVISION_MISMATCH`, etc.).
  - `apps/pipeline-worker/src/narration-transform-job.test.ts` — 22 tests (checks, context loading, idempotent persistence, full job lifecycle).
  - `apps/pipeline-worker/src/narration-job.ts` — `persistNarrationSet` now computes block/set content hashes and writes `origin: "generated"`.
  - `apps/pipeline-worker/src/runtime.ts` — registers the transform handler under the shared `ai.narration` quota (20/hr).
  - `apps/api/src/narration.ts` — `PostgresNarrationService` gains `updateBlock`, `regenerateBlock`, `acceptCandidate`, `rejectCandidate`, `listBlockRevisions`, `restoreBlockRevision`; `current()` computes content hashes, staleness (`stale`/`staleReason`), `canEdit`, `candidates`, `latestTransformJob`; all mutations tenant-scoped with `expectedRevision` optimistic concurrency, revision archiving, set revision bump, and invalidation-scope audit events.
  - `apps/api/src/narration-editor.test.ts` — 24 service tests (editing, citations, concurrency, regenerate queueing/idempotency/cap, accept/reject/restore, staleness, candidates).
  - `apps/api/src/narration.test.ts` — route tests for PATCH block, regenerate, revisions, restore, accept + tenant/origin isolation (11 tests).
  - `apps/api/src/app.ts` — routes `PATCH /projects/:id/narration/blocks/:blockId`, `POST /projects/:id/narration-blocks/:blockId/regenerate`, `GET .../narration/blocks/:blockId/revisions`, `POST .../blocks/:blockId/restore`, `POST .../blocks/:blockId/candidates/:candidateId/accept|reject` + unavailable-service stubs.
  - `apps/web/app/workspace/[projectId]/narration/` — narration-panel block editor (inline edit+save, per-block regenerate modes, candidate accept/reject, previous-versions restore, stale/conflict/in-flight states), input helpers (`narrationTransformModeLabel`, `narrationCandidateStatusLabel`, transform failure messages), tests.
  - `e2e/workspace-mock-api.mjs` — narration state + mock endpoints.
  - `e2e/narration.spec.ts` — 5 editor Playwright tests.
  - `STORY_INDEX.md` — ST-049 row to In Review.
- **Migrations:** `0035_grey_reavers` — `audit_event_type` values, `narration_block_candidates`, `narration_block_revisions`, `narration_blocks.origin`.
- **Contracts changed:**
  - New jobType `narration.transform` (operationType `ai.narration`, outbox event `narration.transform_requested.v1`, prompt `narration-block@v1`).
  - Public schemas: `NarrationTransformMode`, `NarrationBlockCandidate`, `NarrationBlockRevision`, transform params/output, editor inputs; `contentHash` on blocks/sets; `canEdit`, `stale`, `staleReason`, `candidates`, `latestTransformJob` on `NarrationResponse`.
  - New audit event types: `narration.edited`, `narration.block_candidate_accepted`, `narration.block_candidate_rejected`, `narration.block_restored`.
- **Commands/tests run:**
  - `pnpm --filter @avlp/config lint/typecheck/test/build` — pass.
  - `pnpm --filter @avlp/schemas lint/typecheck/test/build` — 162 passed.
  - `pnpm --filter @avlp/database db:generate`, `lint/typecheck/test/build` — 8 passed, 3 skipped (integration).
  - `pnpm --filter @avlp/provider-adapters lint/typecheck/test/build` — 35 passed.
  - `pnpm --filter @avlp/pipeline-worker lint/typecheck/test` — 110 passed, 20 skipped (integration).
  - `pnpm --filter @avlp/api lint/typecheck/test` — 239 passed, 61 skipped (integration).
  - `pnpm --filter @avlp/web lint/typecheck/test/build` — 45 passed; `next build` compiles `/workspace/[projectId]/narration`.
  - `pnpm exec playwright test e2e/narration.spec.ts` — 5 passed. Full e2e suite: 25 passed; 6 pre-existing failures in `ingestion-review.spec.ts`/`workspace.spec.ts` upload flow confirmed failing on the pre-ST-049 baseline (unrelated/environmental).
- **Screenshots or representative output:** Playwright narration spec passes block edit, candidate accept, stale-save 409, and restore flows against the mock API; `next build` lists the narration route.
- **Decisions and assumptions:**
  - Transform candidates are persisted and the teacher explicitly accepts/rejects them; acceptance applies the candidate as a new block revision (never a silent overwrite).
  - Direct teacher edits retain existing citations unless the teacher supplies `sourceBlockIds` (including `[]` to remove them); re-resolved refs are bound to the approved snapshot.
  - Staleness uses the derived-hash policy (`contentHash` on blocks/sets, deterministic and recomputed on every mutation) plus audit invalidation events carrying the affected scope (`audio`, `captions`, `preview`, `validation`, `render`); no downstream artifact tables exist yet, so no automatic invalidation jobs run (also required: "do not automatically regenerate dependent artifacts").
  - Paid regeneration reuses the `ai.narration` quota (20/hr) with explicit idempotency keys, model-call records, usage metering, and `ai.generated` audit events.
  - Optimistic concurrency via `expectedRevision` (409 conflict on stale set), `FOR UPDATE` on the draft set row inside mutations, per-block candidate cap (`narrationBlockMaximumActiveCandidates` = 5), and idempotent candidate persistence keyed by job key.
  - Editing requires a draft narration set (generate first); approved-set cloning is deferred until narration approval lands.
  - Transform prompt `narration-block@v1` gets the selected block, its neighbors, the approved outline item, bounded source package, and mode/instruction.
- **Deviations from story/technical guide:**
  - Technical guide E9 proposes `POST /projects/{id}/narration/blocks/{blockId}/transform`; the story's Interfaces specify `POST /projects/:id/narration-blocks/:blockId/regenerate` with a `mode` body, which was implemented.
  - The guide's `narration_operations` table is realized as the `narration_block_candidates` + `narration_block_revisions` tables (candidate lifecycle + rollback history), which fit the candidate/accept/restore UI states in this story.
  - Evaluation is met declaratively via the prompt registry's `evaluationCases` plus deterministic checks and mode prompt fixture tests, matching the established pattern in this repo.
- **Known risks or follow-up:**
  - Editing an approved narration set is not supported yet (requires approved→draft cloning like objectives/outline once narration approval lands in a later story).
  - A small race remains between the pending-candidate cap check in the API and the job's idempotent insert; a concurrent burst can transiently exceed the cap by one (mitigated by the unique key).
  - Real provider outputs may need the bounded repair/retry path tuned per mode; deterministic mode-direction checks assume the current block already violates the mode direction for shorten/expand.
