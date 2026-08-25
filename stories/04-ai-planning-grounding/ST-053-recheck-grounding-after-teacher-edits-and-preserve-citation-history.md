---
story_id: ST-053
title: "Recheck Grounding After Teacher Edits and Preserve Citation History"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E19", "E20"]
prd_user_stories: ["E19-US2"]
depends_on: ["ST-049", "ST-051", "ST-052", "ST-043"]
---

# ST-053 — Recheck Grounding After Teacher Edits and Preserve Citation History

## Story

As a teacher, I want citation accuracy checked after edits while preserving the history of what supported earlier versions.

## Outcome

A grounding recheck classifies edited claims as supported, unsupported, generated addition, or needs review and stores results with the lesson revision.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E19-US2
- `docs/reference/epic-technical-implementation-guide.md` — E19, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-049
- ST-051
- ST-052
- ST-043

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define grounding-check input/output schema and prompt/rule version.
- [ ] Segment edited narration/on-screen claims into bounded claim units.
- [ ] Use existing source refs first, then approved-snapshot candidate retrieval.
- [ ] Run deterministic source-ID validation and optional model-assisted entailment classification.
- [ ] Allow teacher edits to retain citations but flag unsupported changed claims.
- [ ] Persist grounding results by content hash and lesson revision.
- [ ] Display grounding status and correction actions.
- [ ] Preserve citation/grounding history in versions.

## Technical Implementation Requirements

- Retrieval candidates are not proof; the checker must classify support.
- Model-assisted checks are advisory/validation and are recorded with provider metadata.
- Teacher-added analogy/example can be labelled generated rather than falsely cited.
- Do not mutate older version citations.
- Blocking policy is enforced later by quality validation.

## Contracts and Persistence

- Grounding result/claim.
- Grounding status enum.
- Citation history snapshot.

## Interfaces

- `POST /projects/:id/scenes/:sceneId/grounding-check` or background trigger.
- Grounding status UI.

## Acceptance Criteria

- [ ] Unchanged cited content retains valid references.
- [ ] Edited unsupported claims are flagged.
- [ ] Generated additions can be explicitly labelled.
- [ ] Grounding results are tied to exact content and source snapshot hashes.
- [ ] Older versions retain their original citation history.

## Required Tests

- [ ] Claim segmentation tests.
- [ ] Deterministic source validation tests.
- [ ] Mock entailment classification tests.
- [ ] Content-hash cache test.
- [ ] Version-history preservation test.
- [ ] UI status test.

## Out of Scope

- Guaranteeing truth beyond the uploaded source.
- Web research or external fact checking.

## Story-Specific Notes

- Technical guide references: E19 and AI pipeline standard.

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

- **Agent:** Kilo (deepseek/deepseek-v4-flash-0731) — `next-story` skill
- **Started:** 2026-08-21
- **Completed:** 2026-08-21 (corrective pass from product code review applied; human review approved → marked Done)
- **Branch/PR:** `story/st-052` working tree (local only; no PR opened — not authorized to publish)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-053 grounding contracts (`groundingStatusSchema`, `groundingClaimSchema`, `groundingClaimResultSchema`, `groundingCheckSchema`, `citationHistorySnapshotSchema`, `groundingCheckRequestSchema`/`Response`, `groundingCheckResultResponseSchema`, `groundingCheckParamsSchema`, `groundingClaimOutputSchema`, `groundingOutputSchema`, `groundingCompatibilitySchema`/`currentGroundingCompatibility` = grounding@v2). `groundingCheckResponseSchema` gained a `cached` flag; claim result/output span schemas enforce `start < end`.
  - `packages/schemas/src/grounding.test.ts` — 32 schema tests (added span-bound and cached-response tests).
  - `packages/database/src/schema.ts` — `grounding_checks` and `citation_history_snapshots` tables (tenant-scoped, idempotency-key unique). `grounding_checks.scene_id` references `scenes.stable_scene_id` (new `scenes_stable_scene_id_unique`); no redundant `status`/`error_code` columns; `citation_history_snapshots` tenant-version unique index.
  - `packages/database/drizzle/0038_blushing_ender_wiggin.sql` + `meta/_journal.json` + `meta/0038_snapshot.json` + `0038_blushing_ender_wiggin.compatibility.md` — single regenerated migration.
  - `packages/provider-adapters/src/prompts/grounding/v2.ts` — batch grounding judge prompt.
  - `packages/provider-adapters/src/prompts/index.ts` — register `groundingPromptV2`.
  - `apps/pipeline-worker/src/grounding-check-job.ts` — new `grounding.check` job: `splitSentences`, `normalizeClaimText`, `isGeneratedAdditionSentence`, `claimIdFor`, `segmentClaims`, `segmentOnScreenTextClaims`, `loadGroundingCheckContext` (deterministic source-ID validation), `assertGroundingChecks` (now also enforces results completeness and span bounds), `persistGroundingCheck` (idempotent), `createGroundingCheckJobHandler`.
  - `apps/pipeline-worker/src/grounding-check-job.test.ts` — 29 tests (added completeness, span-bounds, edited-analogy, on-screen text, and scene-scoped persist tests).
  - `apps/pipeline-worker/src/runtime.ts` — register handler under `ai.grounding` quota (20/hr).
  - `apps/api/src/grounding.ts` — `PostgresGroundingService` (`check` enqueues an idempotent job with a content-hash cache + outbox + audit; `current` reads latest check + job).
  - `apps/api/src/grounding.test.ts` — 7 route tests; `apps/api/src/grounding-service.test.ts` — 11 service tests (added content-hash cache tests).
  - `apps/api/src/citation-history.ts` — new `PostgresCitationHistoryService` (`snapshotForVersion` + `persistSnapshot`) preserving citation history per lesson version; `apps/api/src/citation-history.test.ts` — 4 tests (version-history preservation).
  - `docs/adr/ADR-002-citation-history-version-wiring.md` — documents that ST-053 ships the snapshot writer and ST-060 wires it to version creation.
  - `apps/api/src/app.ts` — routes `POST /projects/:id/grounding-checks` (202), `GET /projects/:id/grounding-checks/latest`, `GROUNDING_SERVICE` symbol, unavailable stub, wiring.
  - `apps/api/src/runtime.ts` — `PostgresGroundingService` wiring.
  - `apps/web/app/workspace/[projectId]/storyboard/grounding-panel.tsx` — `SceneGrounding` status panel + recheck button; `grounding-input.ts` status label + test; wired into `storyboard-panel.tsx` per scene.
  - `e2e/workspace-mock-api.mjs` — grounding check + latest mock endpoints; `e2e/storyboard.spec.ts` — 2 Playwright tests.
  - `STORY_INDEX.md` + `stories/.../ST-053-...md` — status `Ready` → `In Review`.
- **Migrations:** `0038_blushing_ender_wiggin` — `grounding_checks` (lesson spec id/revision/content hash, source snapshot id/content hash, scope, scene_id FK → `scenes.stable_scene_id`, claims/results/summary jsonb, model_call_ids, tenant-unique idempotency key) and `citation_history_snapshots` (tenant-version unique index, scene_citations jsonb, grounding_check_id FK). `lesson_version_id` stays a plain UUID until ST-060 adds the `lesson_versions` table.
- **Contracts changed:**
  - New public schemas: `GroundingStatus`, `GroundingClaim`, `GroundingClaimResult`, `GroundingCheck`, `CitationHistorySnapshot`, `GroundingCheckParams`, `GroundingCheckRequest/Response` (with `cached`), `GroundingCheckResultResponse`, `GroundingClaimOutput`/`GroundingOutput`.
  - New jobType `grounding.check` (operationType `ai.grounding`, outbox event `grounding.check_requested.v1`, prompt `grounding@v2`).
  - New endpoints `POST /projects/:id/grounding-checks` (202) and `GET /projects/:id/grounding-checks/latest`.
  - New DB tables `grounding_checks` and `citation_history_snapshots`; new unique index on `scenes.stable_scene_id`.
  - New `PostgresCitationHistoryService` with `snapshotForVersion`/`persistSnapshot`.
- **Commands/tests run (after review corrections):**
  - `pnpm --filter @avlp/schemas lint typecheck test build` — 235 pass.
  - `pnpm --filter @avlp/database db:generate`, `lint typecheck test build` — 8 pass, 3 skipped.
  - `pnpm --filter @avlp/provider-adapters lint typecheck test build` — 37 pass.
  - `pnpm --filter @avlp/pipeline-worker lint typecheck test build` — 181 pass, 20 skipped.
  - `pnpm --filter @avlp/api lint typecheck test build` — 308 pass, 61 skipped.
  - `pnpm --filter @avlp/web lint typecheck test build` — 60 pass; `next build` compiles `/workspace/[projectId]/storyboard`.
  - `node --check e2e/workspace-mock-api.mjs` — clean.
- **Screenshots or representative output:** Grounding job tests confirm sentence segmentation with inherited refs, robust generated-addition matching (including teacher-edited analogies), on-screen text claims, deterministic source-ID validation, results-completeness, span bounds, idempotent persistence, and the full model-call lifecycle. API tests confirm the content-hash cache (identical content reuses the existing check without a new job/outbox/audit row) and idempotent enqueue. Citation-history tests confirm immutable, tenant-scoped snapshots that preserve scene citations + grounding check id per version and dedupe on retry.
- **Decisions and assumptions:**
  - Claim segmentation is sentence-based; narration and on-screen text both produce claims. Generated-addition detection uses a normalized word-overlap heuristic (≥50% of significant addition tokens) so teacher edits retain the generated label instead of being falsely re-cited.
  - Deterministic source-ID validation and results-completeness are mandatory; model-assisted entailment is the paid `ai.grounding` operation with quota guard, model-call records, usage metering, and audit (explicit user action + idempotency key).
  - Results are tied to exact `lessonSpecId`/`lessonSpecRevision`/`lessonSpecContentHash` and `sourceSnapshotId`/`sourceSnapshotContentHash`. A content-hash cache returns the existing completed check for identical content without paying again.
  - Older-version citation history is preserved by the immutable `citation_history_snapshots` writer (ADR-002); ST-060 wires version creation to it.
  - Blocking policy is not enforced here; ST-066 consumes grounding status as a validation input.
- **Deviations from story/technical guide:**
  - The guide's `grounding_checks` table is realized as `grounding_checks` + `citation_history_snapshots` with the ST-043 model-call lifecycle.
  - No approved-snapshot "candidate retrieval" (embedding similarity) is implemented; existing cited blocks plus the bounded package are used, and unsupported claims are reported rather than silently re-cited (per E19).
  - Citation-history wiring to version creation is deferred to ST-060, now recorded as ADR-002; the snapshot writer and its version-history preservation tests ship here.
- **Known risks or follow-up:**
  - The word-overlap generated-addition heuristic is a deterministic approximation; unusual rewrites may still re-cite an analogy (mitigated by the model's classification and the deterministic rules).
  - ST-060 must call `PostgresCitationHistoryService.persistSnapshot` when creating lesson versions.
  - The mock provider is the default in runtime; production pricing/model config for `ai.grounding` must be set before paid calls.
  - e2e Playwright specs were added but not executed (require a running web + mock API).
