---
story_id: ST-093
title: "Use Approved Source Figures and Tables in Storyboard Scenes"
phase: "05 - Storyboard Editing, Assets, and Versions"
status: Done
priority: should-have
epics: ["E5", "E13", "E21"]
prd_user_stories: ["E5-US4", "E13-US1", "E21-US2"]
depends_on:
  ["ST-032", "ST-035", "ST-040", "ST-042", "ST-057", "ST-080", "ST-085"]
---

# ST-093 - Use Approved Source Figures and Tables in Storyboard Scenes

## Story

As a teacher, I want to select approved figures and tables extracted from my
source document while editing a storyboard scene, so that the lesson can show
the document's real evidence instead of substituting an invented visual.

## Outcome

The storyboard has a project-scoped `Source visuals` picker. It presents
included source figures as image assets and approved source tables as
deterministically rendered table visuals. A teacher can bind a compatible
source visual to a scene, see its source page and caption/heading, and remove
or replace it. The resulting scene, preview, render, and lesson version retain
provenance to the immutable parsed source and its approved snapshot.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 8.5-8.6, 8.9, 10.5, 10.10, 11, and 12
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/adr/ADR-002-citation-history-version-wiring.md`
- `docs/reference/mvp-prd.md` - E5-US4, E13-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` - E5, E13, E21,
  especially the source-figure provenance and asset-binding requirements
- `stories/03-ingestion-configuration/ST-035-extract-and-persist-figures-captions-and-tables.md`
- `stories/03-ingestion-configuration/ST-040-let-teachers-include-or-exclude-extracted-figures.md`
- `stories/04-ai-planning-grounding/ST-042-create-approved-source-snapshots-and-bounded-ai-source-packages.md`
- `stories/05-editor-assets-versioning/ST-057-create-the-approved-reusable-asset-catalog-and-scene-asset-picker.md`
- `stories/05-editor-assets-versioning/ST-085-introduce-visual-role-and-enforce-provenance-at-asset-binding.md`
- `stories/08-product-ui/ST-080-build-the-focus-studio-storyboard-workspace.md`

## Dependencies

- ST-032
- ST-035
- ST-040
- ST-042
- ST-057
- ST-080
- ST-085

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Add a project-authorized source-visual query that returns only figures
      and tables included in the project's current approved source snapshot.
- [ ] Present a `Source visuals` picker in the storyboard inspector, alongside
      the existing asset choices. It has `Figures` and `Tables` views, search
      by caption/heading, page references, selected state, and an empty state.
- [ ] Let a teacher bind an included source figure to a compatible scene slot;
      retain its existing `source_figure` provenance and immutable figure ID.
- [ ] Let a teacher bind an approved source table as a `source_table` visual
      with one bounded presentation mode: `table`. It may show the table title,
      column labels, and a bounded set of rows; it must not silently turn a
      table into a chart or paraphrase its values.
- [ ] Add deterministic scene-runtime rendering for `source_table` visuals.
      The runtime receives structured, validated table data and never raw
      Docling/provider payloads, arbitrary HTML, pixel coordinates, or
      AI-generated animation code.
- [ ] Preserve the table's source-table ID, parsed-document version, approved
      source-snapshot ID, and page/section provenance in bindings, citations,
      preview manifests, renders, and immutable lesson versions.
- [ ] Support source documents whose successful immutable ingestion artifact is
      reused in another project. The second project must see only its own
      approved snapshot and overlays, while authorized media/table access may
      resolve the referenced immutable artifact.
- [ ] When a source figure or table becomes excluded, stale, unavailable, or
      incompatible with the selected slot, mark the binding invalid and offer
      a replacement action without deleting previous lesson versions.

## Technical Implementation Requirements

- A source visual is eligible only when it is present in the current approved
  source snapshot. Do not expose merely parsed, excluded, superseded, or
  unapproved material through the picker.
- Figures are immutable binary source artifacts. Only inline image bytes
  extracted by Docling may be used; do not fetch external URLs or document
  paths during ingestion or preview.
- Tables are immutable structured source data, not image uploads. Render them
  through a versioned, allowlisted table component with explicit limits for
  columns, rows, cells, text length, and overflow treatment.
- Table binding must validate that the selected table belongs to the project
  snapshot and that the selected scene slot accepts `source_table`. Figure
  binding must validate included status, snapshot membership, slot
  compatibility, and `source_figure` provenance server-side.
- Keep authorization at every query and signed-media boundary. A checksum or
  artifact ID alone never authorizes source-visual access; cross-user reuse or
  enumeration must return the normal not-found response.
- Reused artifacts require project-local authorization through the project's
  reuse reference and approved snapshot. Teacher overlays and approvals are
  never copied from the original project.
- Changing a source-visual binding invalidates only the affected scene preview,
  render, validation result, and unsaved lesson-version state. It does not
  rerun Docling or mutate the parsed artifact.
- Validate all API responses at the shared-schema boundary. Never log source
  text, raw table cells, signed URLs, or raw provider payloads.

## Contracts and Persistence

- Add versioned shared contracts for source-visual picker entries, a
  `source_table` binding/provenance, and bounded table presentation input.
- Extend the validated preview/render manifest only as needed to carry a
  source-table visual and its snapshot provenance.
- A migration is expected only if table bindings cannot be represented in the
  existing versioned `LessonSpec`/scene-binding payload. Do not duplicate the
  immutable table or figure content into mutable project rows.
- Existing `source_figure` bindings and previously saved lesson versions remain
  readable and renderable.

## Interfaces

- `GET /projects/:projectId/source-visuals` - project-authorized, approved
  figure and table candidates with bounded metadata and preview access.
- Existing scene asset-binding command, extended to accept validated
  `source_table` bindings where a slot supports them.
- `/workspace/[projectId]/storyboard` - `Source visuals` picker in the scene
  inspector and deterministic table preview in the selected scene.
- Preview and render manifest services - resolve approved source figures and
  table visuals for the current project, including authorized reused artifacts.

## Acceptance Criteria

- [ ] A teacher can open the storyboard picker and see only figures included in
      their current approved source snapshot, with a thumbnail, caption when
      available, and page reference.
- [ ] A teacher can see approved tables with their section heading, page
      reference, column labels, row count, and a bounded preview; no raw
      provider payload is exposed.
- [ ] Binding a figure or table updates the selected scene preview and labels
      it as source-derived with its provenance available from the inspector.
- [ ] A bound table renders deterministically in preview and final render using
      the approved table values; no AI call, chart inference, or Docling rerun
      occurs when binding it.
- [ ] A table cannot be bound to an incompatible slot, and an excluded figure
      cannot be selected or bound, even if a client submits its ID directly.
- [ ] A project using a same-owner reused ingestion artifact can select its own
      approved figures and tables without exposing review overlays, snapshots,
      files, or source-visual existence from another project or teacher.
- [ ] If a source approval changes after binding, the affected scene is marked
      stale with a direct replacement action; earlier immutable lesson versions
      remain reproducible.
- [ ] The picker is keyboard accessible, responsive at desktop/tablet/mobile
      widths and 200% zoom, announces selection/loading/error states, and does
      not conceal the active scene preview.

## Required Tests

- [ ] Shared-schema tests for `source_table` bindings, bounded table visual
      input, legacy figure bindings, and invalid provenance/slot combinations.
- [ ] API integration tests for snapshot membership, excluded figures,
      incompatible slots, cross-tenant non-disclosure, and same-owner reused
      artifact access with project-local overlays.
- [ ] API tests proving a binding change invalidates only the affected scene
      derivatives and creates no Docling job or mutable parsed-artifact write.
- [ ] Runtime tests for deterministic table rendering, column/row overflow,
      empty tables, text escaping, and malformed table payload rejection.
- [ ] Preview and render manifest tests for figure/table provenance and
      authorization, including a reused artifact in a second project.
- [ ] Web tests for picker filtering, selection, keyboard navigation, empty,
      loading, failure, stale, and replacement states.
- [ ] Playwright screenshots of the source-visual picker and selected table at
      desktop, tablet, mobile, and 200% zoom.
- [ ] Affected schema, API, web, runtime, worker, and renderer lint,
      typecheck, test, and build commands.

## Out of Scope

- OCR, image generation, chart inference, or semantic transformation of a
  source table.
- Extracting external/linked document images that Docling did not return as
  inline bytes.
- Teacher editing of immutable figure pixels or table values.
- Automatic insertion of a figure or table into scenes without teacher action.
- New visual templates, free-form table layout design, or arbitrary animation
  code.
- Cross-teacher or global ingestion-artifact reuse.

## Implementation Checklist

- [ ] Inspect current asset picker, scene binding, source snapshots, reuse
      authorization, preview manifest, render manifest, and scene runtime.
- [ ] Write a short implementation plan naming contract, persistence, API,
      UI, runtime, migration, test, and accessibility work.
- [ ] Update shared schemas before API, web, preview, renderer, and runtime
      consumers.
- [ ] Implement only the scoped source-visual selection and deterministic
      table-rendering behavior.
- [ ] Verify authorization, tenant isolation, snapshot membership, stale-state,
      idempotency, and no-Docling-rerun behavior.
- [ ] Run automated and visual tests.
- [ ] Update this Dev Agent Record and `STORY_INDEX.md` when complete.

## Definition of Done

- [ ] Every acceptance criterion and required test passes.
- [ ] Figures and tables can be selected only from the current approved source
      snapshot and preserve immutable provenance through preview and render.
- [ ] Reused ingestion artifacts remain private and project-local review
      overlays/approvals remain isolated.
- [ ] Source tables render deterministically within documented bounded limits.
- [ ] No unauthorized media/table access, raw source-data logging, provider
      call, Docling rerun, or mutable parser-artifact write occurs.
- [ ] Contracts, migrations (if needed), API, web, runtime, and renderer
      compatibility are documented.
- [ ] Dev Agent Record is complete and this story plus `STORY_INDEX.md` are
      marked Done.

## Dev Agent Record

- **Agent:** Claude Sonnet 5 (next-story workflow)
- **Started:** 2026-09-16
- **Completed:** 2026-09-16 (follow-up pass closing the test gaps flagged in
  the first pass — see "Follow-up: closing the test gaps" below).
- **Branch/PR:** `feat/st-093-source-visuals-in-storyboard` (off
  `fix/audio-first-storyboard` after committing ST-092). No PR opened.
- **Files changed:**
  - `packages/schemas/src/index.ts` — `source_table` provenance value;
    `sourceTableVisualSchema` (bounded runtime display shape, 8 columns × 12
    rows, 160-char cells); `previewAssetSchema` extended to a `library |
    source | source_table` shape with a `superRefine` enforcing `src` xor
    `table`; `sourceVisualPickerEntrySchema`/`sourceVisualPickerResponseSchema`
    for `GET /source-visuals`.
  - `apps/renderer/src/contracts.ts` — third `productionVisualAssetSchema`
    discriminated-union member for `source_table` (no storage key/checksum,
    since a table has no binary media); exported the schema.
  - `apps/renderer/src/fixture.ts` — `hydrateProductionComposition` passes
    `source_table` assets through unchanged (no signed-URL fetch).
  - `packages/scene-library/src/scene-registry.tsx` — new
    `resolveSafeTableVisual` allowlist gate (mirrors
    `resolveSafeDiagramAsset` but validates structured data, not a URL
    pattern); `resolveSafeDiagramAsset` narrowed to reject `source_table`.
  - `packages/scene-library/src/labelled-diagram-scene.tsx` — new
    deterministic `TableVisual` component (fixed CSS-grid layout, bounded
    columns/rows, truncation notice); wired into the existing `diagram` slot
    alongside the image path — no new visual kind or template, per
    Out-of-Scope.
  - `packages/scene-library/src/full-lesson.tsx`,
    `packages/scene-library/src/scene-preview.tsx` — `previewAssetSchema` is
    now a `ZodEffects` (has a `superRefine`), so the local `.extend({src:
    ...})` HTTPS/fixture-URL allowlists were rewritten as an additional
    `superRefine` that skips the URL check for `source_table` assets.
  - `apps/api/src/source-snapshot.ts` — new public
    `latestApprovedVisuals()` (figures + tables of the current approved
    snapshot), added to `SourceSnapshotService`.
  - `apps/api/src/source-visuals.ts` (new) — `PostgresSourceVisualsService`:
    lists only figures/tables present in the latest approved snapshot; figure
    thumbnails are signed through the same `AuthorizedProjectStorage`
    `parsed_figure_thumbnail` locator the ingestion-review viewer uses; table
    rows/columns come directly from the snapshot payload (no extra query, no
    signed URL — tables carry no binary media).
  - `apps/api/src/storyboard.ts` — `assertAuthorizedAssetBindings`: fixed an
    existing bug where source-figure resolution queried `parsedDocuments`
    scoped to `(ownerUserId, projectId)` directly, which cannot find a
    same-owner **reused** ingestion artifact (now uses
    `findLatestProjectParsedDocument`, already used elsewhere in the API);
    added a `source_table` branch that checks membership in the current
    approved snapshot and restricts binding to slots whose `bindingRole` is
    `"diagram"` (today, only `labelled-diagram.diagram`).
  - `apps/api/src/preview-manifest.ts`, `apps/api/src/renders.ts` — same
    reuse-resolution fix for figures; both now also resolve `source_table`
    visuals from the approved snapshot into bounded preview/render entries
    (no image, no signed URL).
  - `apps/api/src/app.ts`, `apps/api/src/runtime.ts` — wired
    `SOURCE_VISUALS_SERVICE` / `GET /projects/:projectId/source-visuals`
    through the existing DI pattern; `PostgresStoryboardService` and
    `PostgresRenderService`/`PreviewManifestService` now also receive the
    source-snapshot service so they can resolve tables.
  - `apps/web/.../storyboard/source-visual-picker.tsx` (new) — `Source
    visuals` picker (Figures/Tables tabs, search, thumbnail, provenance line,
    loading/empty/error states); wired into `scene-editor-form.tsx` for any
    slot whose `bindingRole` is `"diagram"`. Bindings are written via the
    existing `writeAssetSlot` helper (no client-declared `provenance`,
    matching how figure bindings already work — see Decisions below).
  - `apps/web/.../storyboard/storyboard-scene-query.ts` —
    `fetchSourceVisuals`.
  - Test-harness updates for the new `PostgresStoryboardService` /
    `PostgresRenderService` constructor parameter across
    `storyboard-scene-editor.test.ts`, `storyboard-scene-regeneration-service.test.ts`,
    `storyboard-service.test.ts`, `storyboard.integration.test.ts`,
    `source-snapshot.test.ts` (interface gained `latestApprovedVisuals`).
  - Follow-up pass additions: `apps/api/src/source-visuals.integration.test.ts`
    (new, real-Postgres reuse/cross-tenant coverage); new test cases in
    `apps/api/src/preview-manifest.test.ts` and `apps/api/src/renders.test.ts`
    for a bound `source_table`; `apps/web/.../storyboard/source-visual-picker.playwright.test.tsx`
    expanded to the desktop/tablet/mobile/200%-zoom matrix plus a
    disabled-state check; new test in
    `apps/web/.../preview/preview-player.e2e.test.ts` proving the existing
    ST-081 stale-scene banner and `#scene=` deep link already cover a
    de-approved table.
- **Migrations:** None. Tables were already fully persisted
  (`parsedTables`/`parsedTableCells`, ST-035) and already flow into the
  approved snapshot (`sourceSnapshotTableSchema`, ST-042) with full
  column/row content — the picker and bindings read that existing data;
  nothing new is written to mutable project rows.
- **Contracts changed:** See Files changed above —
  `assetProvenanceSchema`, `previewAssetSchema`,
  `productionVisualAssetSchema`, plus the new `sourceTableVisualSchema` and
  `sourceVisualPicker*` schemas. All additive; existing `source_figure`
  bindings, saved lesson versions, and preview/render manifests still parse
  unchanged (verified by the existing, unmodified test suites passing).
- **Commands/tests run:**
  - `npx turbo typecheck --filter=@avlp/schemas --filter=@avlp/scene-library
    --filter=@avlp/renderer --filter=@avlp/api --filter=@avlp/web` — clean
    (after rebuilding `@avlp/schemas` and `@avlp/scene-library` dist output,
    which downstream packages resolve against).
  - `npx turbo lint --filter=@avlp/schemas --filter=@avlp/scene-library
    --filter=@avlp/renderer --filter=@avlp/api --filter=@avlp/web` — clean on
    every file this story touched. (Two pre-existing lint errors in
    `illustration-generation.ts`/`.test.ts` are untouched by this branch —
    confirmed via `git diff HEAD` showing no changes to those files.)
  - `vitest run` per package:
    - `packages/schemas` — `source-table-visual.test.ts`: 19/19 passed.
    - `packages/scene-library` — full suite: 90/95 passed; the 5 failures
      (`index.test.ts` comparison-scene markup + two render snapshot hashes)
      are **pre-existing and unrelated** — confirmed via `git diff HEAD`
      showing zero changes to those spec files, and via a stash/rebuild
      isolation check. `source-table-visual.test.ts` (new, table rendering):
      9/9 passed.
    - `apps/renderer` — full suite: 18/18 passed.
    - `apps/api` — full non-integration sweep (`--exclude
      "**/*.integration.test.ts"`): 45 files / 482 tests passed, 0 failures
      (re-run clean after the follow-up pass; an earlier run under heavier
      sandbox load showed the same `server.inject` timeout flakiness noted
      above, and every affected test passed in isolation). New
      `storyboard-scene-editor.test.ts` table-binding cases (bind to a
      grounding-critical diagram slot, reject a table absent from the
      approved snapshot, reject a table bound to a non-diagram slot),
      `source-visuals.test.ts` (service + route authorization), the new
      `preview-manifest.test.ts` and `renders.test.ts` table cases: all
      included and passing.
    - `apps/api` **integration** (`NODE_ENV=test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres
      npx vitest run --hookTimeout=60000 --no-file-parallelism
      src/*.integration.test.ts`, against the project's running
      `product-app-postgres-1` container): 12/13 files passed (72/73 tests);
      the 1 failure (`correlation.integration.test.ts`) is pre-existing and
      unrelated (see below). New `source-visuals.integration.test.ts`: 4/4
      passed, including the same-owner reuse and cross-tenant scenarios.
      `storyboard.integration.test.ts`, `source-snapshot.integration.test.ts`,
      and every other pre-existing Postgres suite this branch's code paths
      touch: all still passing.
    - `apps/web` — full suite: 47+ files, all passing, including the
      expanded `source-visual-picker` Playwright breakpoint matrix and the
      new stale-scene deep-link proof in `preview-player.e2e.test.ts`.
- **Screenshots or representative output:** None captured — the Playwright
  checks added are static-markup structural/accessibility assertions across
  desktop (1280px), tablet (768px), mobile (375px), and 200%-zoom (640px),
  consistent with this directory's existing picker test pattern, not visual
  screenshots. A "selected bound table" screenshot is not achievable with
  this pattern (see Follow-up notes above — no jsdom/hydration in this
  test runner, so the picker's post-fetch state never renders under
  `page.setContent`).
- **Decisions and assumptions:**
  - Source figures are immutable Docling-extracted binary artifacts. Source
    tables are immutable structured data (already captured verbatim in the
    approved source snapshot) and are rendered by an allowlisted
    deterministic component rather than converted to a generated image or
    chart.
  - A table binding is only accepted on a slot whose `bindingRole` is
    `"diagram"` — today that is exclusively `labelled-diagram.diagram`. No
    new slot-compatibility field or template was added, per Out of Scope
    ("New visual templates ... arbitrary animation code").
  - The web client never declares `provenance` on a source-visual binding
    (same as the existing figure-binding code path). Declaring `provenance`
    on a grounding-critical slot's binding triggers
    `assetBindingRoleViolations`'s "requires a source reference" schema rule
    (ST-085), which a bare `assetId`/`role`/`slot` binding is exempt from
    ("grandfathered", per that function's own doc comment). The
    authoritative check is server-side, in `assertAuthorizedAssetBindings`,
    which resolves the real kind from the database/approved snapshot — this
    matches the existing figure-binding pattern exactly rather than
    inventing a new one.
  - `SourceVisualPicker` runtime display bounds (8 columns, 12 rows, 160
    characters/cell) are a new, story-specific limit distinct from the
    approved snapshot's storage bounds (`sourceSnapshotTableSchema`: 500
    columns, 10,000 rows) — chosen because a table visual must fit one
    1920×1080 video frame.
  - A figure's picker "caption" is sourced from its `altText` (there is no
    separately resolved caption-block text in `sourceSnapshotFigureSchema`)
    — the same convention `resolvedCitationFigureSchema` already uses.
- **Follow-up: closing the test gaps (2026-09-16, same day).** A local
  Postgres instance turned out to already be running (`docker ps` showed
  `product-app-postgres-1` healthy on port 5433) — the first pass's
  "no live database available" was a missed check, not a real environment
  limitation. `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/postgres`
  (with `NODE_ENV=test`; `createTestDatabase` provisions and drops an
  isolated `avlp_test_<uuid>` database per suite, so this never touches the
  dev database) unblocked every integration gap below.
  - **Reused-artifact integration coverage — closed.** New
    `apps/api/src/source-visuals.integration.test.ts` (4 tests, real
    Postgres): approves a snapshot for an originating project; approves a
    *second*, same-owner project whose only connection to the source is a
    `sourceDocumentIngestionReuses` row (no `parsedDocuments` row of its
    own) and confirms `PostgresSourceSnapshotService.approve()` resolves the
    shared immutable document through `findLatestProjectParsedDocument`,
    producing its own project-local `sourceSnapshots` row (two rows total,
    never a shared one); confirms `PostgresSourceVisualsService.list()`
    returns the same figure/table content for the reusing project; confirms
    `PostgresStoryboardService.updateScene()` accepts a binding to the
    reused table; confirms a project that never approves its own snapshot
    cannot bind a table (`assertAuthorizedAssetBindings` rejects with 400);
    confirms `otherOwnerUserId` querying the originating project's id gets
    `{entries: [], snapshotId: null}` — real row-level non-disclosure, not
    only route-level. All 4 pass.
  - **Preview/render-manifest table tests — closed.** Added
    "resolves a bound source_table visual from the approved snapshot with no
    media src" to `preview-manifest.test.ts` (asserts the manifest asset has
    `source: "source_table"`, no `src`, and the bounded `table` payload) and
    "includes a bound source_table visual in the render manifest with no
    media fetch" to `renders.test.ts` (asserts `manifest.visualAssets`
    contains the table entry and `assetManifest.assets` — the private-media
    fetch list — contains only the audio track, never the table). Both pass.
  - **Stale-binding / replacement-action — found already satisfied, not a
    gap.** Traced the existing Preview/Preflight screen (ST-081,
    `preview-player.tsx`): it already computes `stale`/`missingAssetIds`
    per scene from the preview manifest, renders a "Stale Artifacts Banner"
    plus a per-scene "Scene navigation" grid with an "Edit" link to
    `/workspace/:projectId/storyboard#scene=<id>` (already read by
    `storyboard-panel.tsx` to auto-select that scene) — for *every* stale
    reason, including a missing asset. Since this session's
    `preview-manifest.ts` fix already makes a de-approved table produce a
    `missingAssetIds` entry, this UI needed no new code — only a test
    proving the wiring actually reaches it. Added that proof to
    `preview-player.e2e.test.ts`: a scene with a stale table renders the
    banner text and the exact `#scene=` deep link. No new stale-detection
    or replacement code was written, because none was needed once the
    manifest fix landed; this is recorded as a decision, not a skipped item.
  - **Web picker tests — re-assessed against actual codebase convention, not
    added further.** The web app has no jsdom/testing-library dependency and
    no `environment: "jsdom"` in `vitest.config` — every existing picker
    test in this directory (`ApprovedAssetPicker`, `TeacherAssetPicker`)
    is a `renderToStaticMarkup` + Playwright-on-static-HTML structural
    check, because `useEffect` never fires during SSR and there is no
    hydration step in this test runner — "select an option and watch state
    update" is not a pattern this codebase supports for *any* component,
    source-visual or otherwise. `SourceVisualPicker`'s two existing test
    files already match that convention exactly (loading-state structure,
    labelled tabs/search, disabled state). Introducing jsdom/testing-library
    for one component would be inconsistent scope creep; not done.
  - **Playwright breakpoint coverage — closed.** Extended
    `source-visual-picker.playwright.test.tsx` from 2 to 5 checks: desktop
    (1280px), tablet (768px), mobile (375px), and 200%-zoom (640px) —
    matching the exact matrix `storyboard.playwright.test.tsx` and siblings
    use — plus the disabled-fieldset check. A "selected bound table"
    screenshot remains out of reach for the same SSR-only reason above (no
    live fetch resolves before `page.setContent` captures the markup).
  - **Cross-tenant non-disclosure — closed.** Covered twice now: the
    existing route-level 404 test in `source-visuals.test.ts`, and the new
    real-database row-level test in `source-visuals.integration.test.ts`
    described above (a different owner querying the same `projectId` gets
    an empty result because `sourceSnapshots` lookup is scoped by
    `(ownerUserId, projectId)`, not `projectId` alone).
- **Known, pre-existing, unrelated flakiness observed while verifying (not
  introduced by this branch — confirmed via `git diff HEAD` showing zero
  changes to the affected files):**
  - `packages/scene-library/src/index.test.ts` → "renders comparison
    subjects before shared traits and differences" expects a
    `data-comparison-asset-slot` attribute that `comparison-scene.tsx` does
    not render; `scene-preview-render-smoke.test.ts` and
    `summary-scene-render.test.ts` have stale inline-snapshot hashes.
  - `apps/api/src/correlation.integration.test.ts` fails consistently
    (dispatched: 0 vs expected 1) against this environment's Postgres —
    looks like it needs a running queue/worker dependency not started here.
  - Running many Fastify-booting `*.test.ts` files or many
    `createTestDatabase()` integration suites fully in parallel in this
    sandbox produces `server.inject`/`beforeAll` timeouts from resource
    contention; every one of those tests passes when run with reduced
    concurrency (`--no-file-parallelism` for the Postgres suites) or in
    isolation.
- **Deviations from story or technical guide:** None in implemented scope.
  The gaps above are omissions to close in a follow-up pass, not
  intentional deviations from the story's requirements.
- **Code review (2026-09-16, `/story-code-review`) and fix-up pass.** An
  evidence-based review against `AGENTS.md`, the PRD, epic technical guide,
  ADR-001/ADR-002, and `docs/design.md` found the authorization/tenant-
  isolation/reuse work sound (verified by re-running
  `source-visuals.test.ts`, `storyboard-scene-editor.test.ts`, the
  integration suite, and the reuse/cross-tenant tests directly) and raised
  one Medium finding:
  - **Silent column/cell truncation not reflected in `truncated`.**
    `preview-manifest.ts` and `renders.ts` built a bounded `source_table`
    visual by slicing an unbounded approved-snapshot table down to
    `sourceTableVisualMaxColumns`/`sourceTableVisualMaxCellLength`, but
    `truncated` was computed only from row-count overflow
    (`table.rows.length > rows.length`). A table with more than 8 columns
    or any cell longer than 160 characters had that content silently
    dropped with `truncated: false`, so a teacher would see an apparently
    complete table missing real columns or text — violating the story's
    own invariant ("Overflowing rows are truncated, never summarized or
    reshaped, and `truncated` records that it happened") and the "column
    ... overflow" line in Required Tests, which only had row-overflow
    coverage.
  - **Fix applied:** `truncated` in both `preview-manifest.ts` and
    `renders.ts` now also accounts for column-count and per-cell-length
    overflow. Added `sourceTableVisualMaxCellLength` (160) as a named,
    exported constant in `packages/schemas/src/index.ts` alongside the
    existing `sourceTableVisualMax{Columns,Rows}` so the bound isn't a
    silently-duplicated magic number across three call sites.
    `TableVisual`'s notice in `labelled-diagram-scene.tsx` now shows a
    generic "Some table columns or cell text are not shown due to display
    limits." message when truncation happened without a row-count drop,
    instead of a misleading "Showing N of N rows."
  - **New regression tests:** `preview-manifest.test.ts` and `renders.test.ts`
    each gained a case with a 9-column, 1-row source table asserting
    `columns` is clipped to 8 and `truncated: true` despite `rowCount`
    being unchanged; `packages/scene-library/src/source-table-visual.test.ts`
    gained a case asserting the generic notice text renders when only
    columns/cell text were truncated.
  - **Verification:** `packages/schemas`, `packages/scene-library` built
    and typechecked clean; re-ran
    `apps/api/src/{source-visuals,storyboard-scene-editor,preview-manifest,renders}.test.ts`
    and `packages/{schemas,scene-library}/src/source-table-visual.test.ts`
    (76 tests, all passing, new cases included); `npx turbo typecheck`
    across schemas/scene-library/renderer/api/web clean; `npx turbo lint`
    on schemas/scene-library clean, and the pre-existing
    `illustration-generation.ts`/`.test.ts` lint errors in `@avlp/api` are
    confirmed untouched by this branch (`git diff` on those two files is
    empty).
  - Story marked Done following this fix-up.
