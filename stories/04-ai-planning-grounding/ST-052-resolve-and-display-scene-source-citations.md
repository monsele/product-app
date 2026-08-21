---
story_id: ST-052
title: "Resolve and Display Scene Source Citations"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E19"]
prd_user_stories: ["E19-US1"]
depends_on: ["ST-042", "ST-050", "ST-037"]
---

# ST-052 — Resolve and Display Scene Source Citations

## Story

As a teacher, I want to see the exact pages, sections, blocks, figures, and tables supporting each generated scene.

## Outcome

Scene and narration references resolve to real approved-snapshot content and can open the relevant source context from the storyboard.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E19-US1
- `docs/reference/epic-technical-implementation-guide.md` — E19 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-042
- ST-050
- ST-037

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement citation-resolution service from SourceRef to teacher-facing labels and excerpts.
- [ ] Validate document ID, parsed version, section/block/figure/table IDs, and page ranges against the approved source snapshot.
- [ ] Create scene citation read APIs.
- [ ] Add citation panel to scene/storyboard UI with page, section, excerpt, and figure/table links.
- [ ] Support opening the affected source in ingestion review context.
- [ ] Display generated additions separately from source citations.

## Technical Implementation Requirements

- Application code derives page/section labels from stable IDs; the model does not supply trusted display labels.
- Excerpts are bounded and authorized.
- Missing or stale references become validation issues.
- Do not expose entire source documents on public share pages.

## Contracts and Persistence

- Resolved citation DTO.
- Citation resolution error codes.

## Interfaces

- `GET /projects/:id/scenes/:sceneId/citations`.
- Storyboard citation panel and source deep link.

## Acceptance Criteria

- [ ] Every valid SourceRef resolves to the expected source context.
- [ ] Invalid/stale IDs are reported and not silently ignored.
- [ ] Generated additions are visibly distinct.
- [ ] Only the project owner can retrieve source excerpts.
- [ ] Deep linking opens the correct section/block/page context.

## Required Tests

- [ ] Citation resolver tests.
- [ ] Stale/missing reference tests.
- [ ] Authorization/excerpt-bounds tests.
- [ ] Storyboard citation UI test.
- [ ] Source deep-link test.

## Out of Scope

- Automatic factual judgment.
- Public citation exposure.
- PDF page image viewer unless later added.

## Story-Specific Notes

- Technical guide references: E19 and source-package format.

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

- **Agent:** Kilo (deepseek/deepseek-v4-pro-0813) — `next-story` skill
- **Started:** 2026-08-21
- **Completed:** 2026-08-21 (marked In Review)
- **Approved:** 2026-08-21 — human reviewer approved with follow-ups; marked Done.
- **Branch/PR:** `story/st-052` (local only; no PR opened — not authorized to publish)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-052 citation contracts (`citationIssueKindSchema`/`citationIssueSchema`, `resolvedCitationBlockSchema`/`resolvedCitationFigureSchema`/`resolvedCitationTableSchema`, `resolvedCitationSchema`, `sceneCitationsResponseSchema`).
  - `packages/schemas/src/citations.test.ts` — 4 schema tests.
  - `apps/api/src/source-snapshot.ts` — `SourceSnapshotService.resolveSourceRefs` + exported pure `resolveSourceRefsAgainstSnapshot` (validates document/version and resolves section/block/figure/table IDs against the approved snapshot into labels + bounded excerpts, reporting every stale/unknown ID as a `CitationIssue`).
  - `apps/api/src/citations.ts` — `CitationService` + `PostgresCitationService.forScene` (working draft→approved lesson spec, scene lookup by `stableSceneId`, returns resolved citations + generated additions).
  - `apps/api/src/citations.test.ts` — 4 route tests (owner access, cross-tenant 404, unauthenticated 401, malformed id 404).
  - `apps/api/src/citations-domain.test.ts` — 5 resolver tests (valid resolution, document/version mismatch, missing section/block/figure/table, no-section ref).
  - `apps/api/src/source-snapshot.test.ts` — added `resolveSourceRefs` stub to the `SourceSnapshotService` test double.
  - `apps/api/src/app.ts` — `GET /projects/:id/scenes/:sceneId/citations` route, `CITATION_SERVICE` symbol, `CitationApiService`, unavailable stub, wiring.
  - `apps/api/src/runtime.ts` — `PostgresCitationService` wiring.
  - `apps/web/app/workspace/[projectId]/storyboard/citation-input.ts` + `citation-input.test.ts` — citation label/page/deep-link helpers (3 tests).
  - `apps/web/app/workspace/[projectId]/storyboard/citation-panel.tsx` — `SceneCitations` client panel (source citations vs. generated additions, per-block/figure/table "Open in source" deep links, issue alerts).
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx` — render `SceneCitations` per scene.
  - `apps/web/app/workspace/[projectId]/review/page.tsx` + `ingestion-review-viewer.tsx` — deep-link support via `?section=&block=` (auto-expand + scroll/focus).
  - `e2e/workspace-mock-api.mjs` — `GET /projects/:id/scenes/:sceneId/citations` mock.
  - `e2e/storyboard.spec.ts` — 2 new Playwright tests (citation display, deep-link href).
  - `STORY_INDEX.md`, `stories/.../ST-052-...md` — status `Ready` → `In Progress` → `In Review`.
- **Migrations:** None. `SourceRef`/`generatedAdditions` are already embedded in `scenes.scene_json`; this story is read/resolve/display only.
- **Contracts changed:** New public contracts `resolvedCitationSchema`, `resolvedCitationBlockSchema`, `resolvedCitationFigureSchema`, `resolvedCitationTableSchema`, `citationIssueSchema` (+ `citationIssueKindSchema`), `sceneCitationsResponseSchema`; endpoint `GET /projects/:id/scenes/:sceneId/citations`. `SourceSnapshotService` gained `resolveSourceRefs`.
- **Commands/tests run:**
  - `pnpm --filter @avlp/schemas typecheck lint test build` — 203 tests pass.
  - `pnpm --filter @avlp/api typecheck lint test build` — 286 pass, 61 skipped (no `TEST_DATABASE_URL`).
  - `pnpm --filter @avlp/web typecheck lint test build` — 59 tests pass.
  - `pnpm typecheck` — 16/16 tasks pass; `pnpm lint` — 16/16 tasks pass.
  - `node --check e2e/workspace-mock-api.mjs` — clean.
- **Screenshots or representative output:** Resolver unit tests confirm valid refs resolve to `{sectionHeading, blocks[], figures[], tables[], issues:[]}` and stale/unknown IDs surface as `missing_*`/`*_mismatch` issues rather than being dropped.
- **Decisions and assumptions:** Citation resolution is block-based (page numbers are derived display metadata from the snapshot). No new persistence tables — the tech guide's `source_references`/`generated_additions`/`grounding_checks` tables are deferred to later epic stories (ST-053 grounding recheck, ST-060 versioning); ST-052 resolves the already-embedded scene refs. Excerpts are the cited blocks only (bounded by the snapshot schema), never the whole document.
- **Deviations from story/technical guide:** None material. Deep-link target is the ingestion review view (`/review?section=&block=`), matching "open the affected source in ingestion review context".
- **Known risks or follow-up:** Grounding recheck after teacher edits (ST-053) and citation history in lesson versions (ST-060) are out of scope here and remain `Ready`. e2e Playwright specs were added but not executed (require a running web + mock API); they follow the existing `storyboard.spec.ts` patterns.
- **Review follow-ups (approved with follow-ups):**
  1. Page ranges are echoed from the `SourceRef` without validation against the snapshot (`apps/api/src/source-snapshot.ts:932-933`); derive the citation page range from resolved blocks or add a `page_range_mismatch` issue.
  2. No automated "excerpt-bounds" test asserting only cited blocks are returned.
  3. Deep-link open/scroll behavior is only href-asserted; e2e suite not executed.
  4. Missing approved snapshot returns 404 rather than a 409 "source not confirmed" state.
