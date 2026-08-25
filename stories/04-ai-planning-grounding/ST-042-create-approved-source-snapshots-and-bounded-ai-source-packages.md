---
story_id: ST-042
title: "Create Approved Source Snapshots and Bounded AI Source Packages"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E5", "E7", "E8", "E9", "E10", "E19", "E20"]
prd_user_stories: ["E5-US2", "E5-US3", "E7-US1", "E19-US1", "E20-US1"]
depends_on: ["ST-038", "ST-039", "ST-040", "ST-041", "ST-008"]
---

# ST-042 — Create Approved Source Snapshots and Bounded AI Source Packages

## Story

As the AI pipeline, I need an immutable approved source snapshot so every generation can be reproduced and cited against exactly what the teacher confirmed.

## Outcome

Confirming ingestion review creates a versioned source snapshot and reusable bounded source-package builder with stable block, page, section, figure, and table IDs.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US2, E5-US3, E7-US1, E19-US1, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E5, E7, E8, E9, E10, E19, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-038
- ST-039
- ST-040
- ST-041
- ST-008

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create source snapshot persistence containing parsed document version, section overlays, block corrections, figure selections, and content hash.
- [ ] Implement confirm-source-review command and approval state.
- [ ] Build deterministic source packages from effective selected content.
- [ ] Support package narrowing by section/objective/outline links while retaining stable IDs.
- [ ] Store snapshot JSON in object storage or JSONB with queryable metadata.
- [ ] Prevent later overlay edits from mutating the approved snapshot.
- [ ] Expose source-block lookup for citation resolution.

## Technical Implementation Requirements

- A snapshot is immutable and versioned.
- Generation jobs reference a snapshot ID and content hash.
- For a maximum 20-page document, use hierarchy-aware selection; embeddings are optional and not proof of support.
- Source packages include explicit machine-readable boundaries.
- A later source correction creates a new draft/snapshot path rather than changing existing generated versions.

## Contracts and Persistence

- Approved source snapshot.
- Source package.
- Source lookup/resolver.
- Source approval state.

## Interfaces

- `POST /projects/:id/source-review/approve`.
- `GET /projects/:id/source-snapshots/:snapshotId` metadata.
- Pipeline package-builder interface.

## Acceptance Criteria

- [ ] Approval captures exactly the effective reviewed source.
- [ ] Changing overlays after approval does not alter the snapshot hash/content.
- [ ] Every packaged block includes stable provenance.
- [ ] The same snapshot and selection parameters produce the same source package.
- [ ] Generation cannot start from an unapproved source draft.

## Required Tests

- [ ] Snapshot immutability test.
- [ ] Deterministic hash/package test.
- [ ] Correction-after-approval test.
- [ ] Source lookup test.
- [ ] Authorization test.

## Out of Scope

- Embedding index implementation unless needed by a later ADR.
- AI generation itself.

## Story-Specific Notes

- Technical guide references: principles 2.2 and 2.3, sections 9.3 and 9.4.

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
- **Started:** 2026-08-16
- **Completed:** 2026-08-16
- **Branch/PR:** `story/st-042` (local; no PR opened — not authorized to publish)
- **Files changed:**
  - `packages/schemas/src/index.ts` — `SourceSnapshot` v1 contracts (sections/blocks/figures/tables), metadata, approval-status, block-lookup, package-narrowing DTOs, `buildSourcePackage` deterministic builder, `sourceSnapshotBlockText`
  - `packages/schemas/src/source-snapshot.test.ts` — 13 schema/package tests
  - `packages/database/src/schema.ts` — `source_snapshots` table, `source.review_approved` audit event
  - `packages/database/drizzle/0028_gigantic_lockheed.sql` + `0028_gigantic_lockheed.compatibility.md` + `meta/0028_snapshot.json` + `meta/_journal.json`
  - `apps/api/src/source-snapshot.ts` — domain functions (`materializeEffectiveSource`, `computeSourceSnapshotHash`) and `PostgresSourceSnapshotService` (approve/metadata/status/lookupBlocks)
  - `apps/api/src/source-snapshot.test.ts` — 9 route-level authorization/validation tests
  - `apps/api/src/source-snapshot-domain.test.ts` — 7 materialization/hash round-trip tests
  - `apps/api/src/source-snapshot.integration.test.ts` — 9 Postgres integration tests (skipped without `TEST_DATABASE_URL`)
  - `apps/api/src/app.ts` — routes `POST /projects/:id/source-review/approve`, `GET /projects/:id/source-review`, `GET /projects/:id/source-snapshots/:snapshotId` + wiring
  - `apps/api/src/runtime.ts` — `PostgresSourceSnapshotService` wiring
  - `apps/web/app/workspace/[projectId]/review/ingestion-review-viewer.tsx` — confirm-source-content panel (status + approve/re-confirm)
  - `STORY_INDEX.md`, `stories/.../ST-042-...md` — status to `In Review`
- **Migrations:** `0028_gigantic_lockheed` (creates `source_snapshots`, adds `source.review_approved` audit enum value before `share.created`).
- **Contracts changed:** New public contracts `sourceSnapshotSchema` (immutable v1 snapshot), `sourceSnapshotMetadataSchema`, `sourceApprovalStatusSchema`, `sourceApprovalResponseSchema`, `sourceBlockLookupEntrySchema`, `sourcePackageNarrowingSchema`, `buildSourcePackage` pipeline package-builder interface; endpoints `POST /projects/:id/source-review/approve`, `GET /projects/:id/source-snapshots/:snapshotId`, plus `GET /projects/:id/source-review` (approval-state surface used by the review UI).
- **Commands/tests run:**
  - `pnpm --filter @avlp/schemas typecheck lint test build` — 60 tests pass
  - `pnpm --filter @avlp/database typecheck lint test build` + `db:generate` — 8 tests pass, 3 skipped
  - `pnpm --filter @avlp/api typecheck lint test build` — 91 pass, 49 skipped (no `TEST_DATABASE_URL`)
  - `pnpm --filter @avlp/web typecheck lint test build` — 25 tests pass
  - `pnpm lint` and `pnpm typecheck` — 15/15 tasks pass
  - `pnpm test` — 8 tasks pass; `@avlp/evals` fails on pre-existing ST-009 baseline fixtures (`figure`, `low-quality` fail `lesson-spec-schema`; ST-009 is In Review)
  - `git diff --check` — clean
- **Screenshots or representative output:** Domain hash/package determinism verified; integration coverage: idempotent re-approval, snapshot versioning after correction, immutability after overlay edits, stale-status transitions, cross-tenant 404s.
- **Decisions and assumptions:**
  - Snapshot body is stored as JSONB (`payload`) with queryable metadata columns (`parsed_document_id`, `parsed_document_version`, `snapshot_version`, `content_hash`, `approved_by`, `approved_at`); object storage was not needed and keeps approval atomic in one transaction.
  - Content hash covers the effective source content only (schema version, document/parsed-version ids, sections/blocks/figures/tables), excluding approval metadata, so the same reviewed content always yields the same hash and re-approval is idempotent (latest snapshot with same hash is returned, no duplicate row).
  - Unsupported parser blocks are excluded from snapshots/packages (they cannot be packaged into a `SourcePackage`); section include/exclude follows the existing per-section overlay semantics from ST-038 (children of an excluded parent are not auto-excluded).
  - Approval requires a parsed document and at least one included section (409 otherwise); it does not gate on ingestion quality status, which remains the ST-041 configuration gate. Generation consumes only approved snapshots via `buildSourcePackage`/lookup.
  - Added `GET /projects/:id/source-review` as the approval-state surface (story lists "Source approval state" as a contract); it reports `stale` when the latest snapshot hash no longer matches the current effective content.
  - Source-block lookup is a service interface (`lookupBlocks`) used by future citation work (ST-052); no new lookup HTTP route was invented beyond the story's three interfaces.
- **Deviations from story/technical guide:** Technical guide E5 lists `POST /projects/{id}/ingestion-review/approve`; the story's Interfaces specify `POST /projects/:id/source-review/approve`, which is implemented. Technical guide mentions `effective_source_snapshots` as optional — implemented as the `source_snapshots` table. No other deviations.
- **Known risks or follow-up:**
  - Integration tests require a live Postgres (`TEST_DATABASE_URL`) and are skipped locally.
  - `@avlp/evals` baseline failure is pre-existing (ST-009 In Review), unrelated to this story.
  - Pre-existing prettier violations in `apps/api/src/app.ts`, `apps/api/src/runtime.ts`, and `packages/schemas/src/index.ts` (lines from earlier stories) were left untouched; only this story's additions were formatted.
  - Later stories (ST-043+) should consume `source_snapshots` for generation and gate on `sourceApprovalStatus.approved && !stale`; the pipeline package-builder interface (`buildSourcePackage`) is exported from `@avlp/schemas` for the pipeline worker.
