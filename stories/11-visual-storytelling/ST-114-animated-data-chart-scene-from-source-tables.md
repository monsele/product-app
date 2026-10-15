---
story_id: ST-114
title: "Add an Animated Data-Chart Scene Built from Approved Source Tables"
phase: "11 — Visual Storytelling"
status: Done
priority: should-have
epics: ["E4", "E10", "E11", "E19"]
prd_user_stories: ["E4-US3", "E10-US1", "E11-US1", "E11-US2", "E19-US1"]
depends_on: ["ST-093", "ST-109", "ST-111", "ST-112"]
---

# ST-114 — Animated Data-Chart Scene from Source Tables

## Story

As a teacher whose source document contains numeric tables, I want the video
to show that data as an animated bar or line chart that builds while the
narration explains it, so that learners see the trend or comparison rather
than a static grid of numbers.

## Background

Comparable products advertise "animated data visualizations". We have none.
The ten scene templates (`sceneTemplateValues`, `packages/schemas/src/index.ts`)
are teaching layouts. ST-093 lets an approved source table appear as a still
image inside a `labelled-diagram` scene, and the picker deliberately "never
turns a table into a chart" (`source-visual-picker.tsx`). Ingestion already
keeps the extracted grid exactly (`sourceTableVisualSchema`, at most 8
columns × 12 rows), so the numbers a chart needs are already stored, approved
and citable.

The roadmap deferred chart palette tokens "until a data-bearing chart scene is
committed" (`docs/reference/codex_openmontage_reconciled-roadmap.md` §Chart
palette tokens). This story is that consumer.

## Outcome

- A new scene template `data-chart` with chart kinds `bar` and `line`.
- **The model never writes numbers.** The storyboard and scene-regeneration
  prompts choose a table, a category column, up to 3 value columns, up to 8
  rows, the chart kind, an optional highlighted category and a unit label.
  Application code copies the values from the approved table cells and
  rejects the scene if a selected cell is not numeric after a deterministic
  parse (thousands separators, decimals, `%`, a leading currency symbol).
- The chart animates deterministically. Bars grow and lines draw in on the
  narration beats from ST-111, and the highlighted category is emphasised on
  its anchored beat. Axis range and ticks come from a pure "nice ticks"
  function. Colours come from new, accessible chart tokens in each style pack.
- A v2 composition `hero-chart` (family `hero-diagram`) places the chart. It
  is recorded in the ADR-015 compatibility notes and bumps
  `cinemaCompositionVersion`.
- The scene cites the table block. Changes to the approved table flow into
  the chart, and a stale chart is flagged by the existing grounding recheck
  (ST-053). Table-cell correction overlays are ST-117.
- The scene editor shows chart kind, columns, rows and highlight as pickers
  over the table. There is no free-text number entry.

## Scope

- [x] Schemas: `data-chart` template and visual (`tableId`, `chartKind`,
      `categoryColumn`, `valueColumns` 1–3, `rowIndexes` 2–8,
      `highlightCategory?`, `unitLabel?`). LessonSpec goes to 1.10 and reads
      1.8 and 1.9 in place (ST-104 pattern). Add editor metadata.
- [x] A pure resolver `resolveChartData(table, visual)` returning
      `{ categories, series, min, max, ticks }` or a typed failure, with the
      numeric parse rules above.
- [x] Scene registry, layout validation and text-budget preflight for the new
      template, including long category labels (wrap, then abbreviate with
      the full label in captions/alt text, never clip).
- [x] Remotion `DataChartScene` for the v1 renderer and a `hero-chart`
      composition for v2/cinema. Both are deterministic, so frame N is
      identical across renders.
- [x] Chart palette tokens for every style pack, with a documented contrast
      check (≥ 3:1 between adjacent series and against the surface) and a
      colour-vision simulation check in tests. Series are also distinguished
      by pattern or marker, never by colour alone.
- [x] Prompt versions: storyboard and scene-regeneration catalogues list
      `data-chart` only when the source package contains at least one table
      with a numeric column. A new prompt version is needed for each, and
      older pinned versions are untouched.
- [x] Editor UI: table-backed pickers in the storyboard scene editor.
- [x] Accessibility: generated alt text / transcript line summarising the
      chart ("Bar chart: sodium 0.97, potassium 0.86 …").

## Acceptance Criteria

- [x] AC1 Given an approved table with a numeric column, a storyboard run can
      produce a `data-chart` scene that previews and renders to MP4 with
      values identical to the table cells.
- [x] AC2 A model output containing any numeric value in the chart visual
      (not a column/row reference) fails schema validation.
- [x] AC3 Selecting a non-numeric cell blocks the scene in validation with a
      teacher-facing reason naming the cell. The render does not start.
- [x] AC4 (amended by the product owner, 2026-10-14) A change to an approved
      table's cells, made by re-approving the source, updates the chart on
      the next preview and marks the scene's grounding stale until rechecked.
      Correcting a single cell in ingestion review moves to ST-117, whose AC2
      completes this story's original AC4. Original wording: "Correcting a
      table cell in ingestion review updates the chart on the next preview and
      marks the scene's grounding stale until rechecked."
- [x] AC5 Bars and line segments reach their final value on the anchored
      narration beat, ±1 frame.
- [x] AC6 Every style pack passes the chart contrast and colour-vision checks.
- [x] AC7 Stored 1.8 and 1.9 LessonSpecs read, preview and render
      byte-identically to before (render parity tests unchanged).
- [x] AC8 A project from another tenant cannot reference a table it does not
      own (resolver rejects foreign `tableId`).

## Required Tests

- [x] Unit: numeric parse, nice-ticks, resolver failures, schema rejection of
      inline numbers.
- [x] Unit: layout/text-budget preflight with long labels and 8×3 data.
- [x] Render: `DataChartScene` and `hero-chart` frames at 1080p (use the
      `inspect-render` skill), including the final-beat frame.
- [x] Integration (Postgres): storyboard job → `data-chart` scene → preview
      manifest → render, values matching the table.
- [x] Parity: existing full-lesson render parity tests pass unchanged.
- [x] Prompt evaluation cases for chart selection (fit and non-fit tables).

## Out of Scope

- Pie, scatter, area, stacked, map or 3D charts.
- Data from uploaded spreadsheets (CSV/XLSX). That needs an ingestion story.
- Numbers typed by the teacher or produced by the model.
- Turning an image of a chart (a figure) into an animated chart.
- Animated counters or "big number" stat scenes.

## Decisions for the product owner

- **Chart kinds.** Proposed: bar and line only. They cover comparison and
  trend, the two cases teaching documents use most.
- **Teacher-entered data.** Proposed: not in this story. Every number must
  trace to an approved source cell, which keeps the E19 grounding promise.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-10-14.
- **Completed:** 2026-10-15. Approved by the product owner on 2026-10-15
  after the code review and its fixes; status set to Done.
- **Branch/PR:** `feat/st114-animated-data-chart`, branched from
  `feat/st113-curated-illustration-library` after ST-113 was committed there
  as `50a8b86` (with the product owner's approval). Not pushed; no PR.
- **Files changed:**
  - Schemas: `packages/schemas/src/data-chart.ts` (visual schema, numeric
    parse, nice ticks, `resolveDataChart`, eligibility, alt-text summary),
    `chart-palette.ts` (per-pack chart palettes + contrast / colour-vision
    helpers), `index.ts` (`data-chart` template, LessonSpec 1.10 reading 1.8
    and 1.9 in place, `chart-table` grounding-critical slot, editor fields and
    picker controls, default visual, `dataChartStoryboardCatalogEntry` +
    `storyboardTemplateCatalogFor`, `chart_data_invalid` issue code, table
    citation helpers, source-visual `chartGrid`, prompt pins storyboard v4 /
    scene-regeneration v3), `creative-design.ts` (two additive v1 treatments
    per pack), `creative-design-v2.ts` (`hero-chart`, `hero-chart-keyed`,
    per-composition versions, chart beats/display/evidence rules),
    `lesson-spec-v1.schema.json` (regenerated).
  - Scene library: `data-chart/` (`chart-layout.ts`, `chart-motion.ts`,
    `data-chart-svg.tsx`, `resolve.ts`), `data-chart-scene.tsx` (+ fixtures),
    `cinema/compositions/chart.tsx`, and wiring in `scene-registry.tsx`
    (validation, render blocking), `cinema-scene.tsx`, `frame.tsx`,
    `full-lesson.tsx` (pack id for the chart palette), `index.ts`.
  - Prompts: `storyboard/v4.ts`, `scene-regeneration/v3.ts`, registry.
  - Worker: `chart-tables.ts` (offered tables, `{{tables}}` grid, chart
    checks, binding + citation), `storyboard-job.ts`,
    `scene-regeneration-job.ts`, `model-call.ts` (prompt identity passed to
    the context loader).
  - API: `storyboard.ts` (chart-table slot accepts only this project's
    approved tables; server-side binding + citation on edit),
    `lesson-validation.ts` (`chart_data_invalid` naming the cell),
    `source-visuals.ts` (`chartGrid`), `source-snapshot.ts` (citation inputs).
  - Web: `data-chart-editor.tsx` (table-backed pickers, cell preview, no
    number entry), `scene-editor-form.tsx`, `storyboard-input.ts`,
    `preview-player.tsx` (labels).
  - Docs/tools: ADR-015 compatibility note; ADR-010 amendment (additive
    scene-type treatments); new story ST-117 and its `STORY_INDEX.md` row;
    `inspect-render/shoot-scenes.mjs` learns `data-chart`.
  - Review-fix tests: chart cases in `scene-regeneration-job.test.ts`, and
    `apps/renderer/src/data-chart-render.integration.test.ts` (real MP4).
  - Tests: `data-chart.test.ts`, `chart-palette.test.ts`,
    `data-chart-scene.test.tsx`, `data-chart-render.test.ts`,
    `chart-tables.test.ts`, `storyboard-data-chart.integration.test.ts`,
    `data-chart.integration.test.ts`, `data-chart-editor.test.tsx`, a chart
    case in `renders.test.ts` and `scene-asset-forwarding.test.tsx`, and
    updated version/catalogue pins in existing tests.
- **Migrations:** None. LessonSpec 1.10 is a document version (no DDL);
  manifests keep their shape.
- **Commands/tests:**
  - `vitest run`: schemas 536 pass; provider-adapters 84 pass; renderer 55
    pass; web 367 pass; worker 307 unit pass; evals 7 pass; API 651 pass
    (one route-auth case timed out under the full run and passes alone, 7/7,
    the known 5 s flake).
  - scene-library full run: only the three known snapshot failures
    (`full-lesson-render`, `scene-preview-render-smoke`,
    `summary-scene-render`); render parity, audio parity and v2 cinema renders
    pass. New: 15 chart scene tests, Remotion 1080p render test (mvp-default,
    v1 everyday, v2 systems; frame N identical across renders; final-beat
    frame), forwarding test.
  - Postgres (`TEST_DATABASE_URL=...:5433`), every integration suite re-run
    on 2026-10-15 after the final edits:
    - API: 22 files, 143/143 pass, including `data-chart` 4/4. Seven files
      hit the default 10 s hook timeout when all 22 ran in parallel; they
      pass with `--hookTimeout=120000 --maxWorkers=3`.
    - Renderer 6/6; packages: auth 6/6, database 3/3, jobs 8/8,
      observability 2/2.
    - Worker: 11 files, 50/57 pass, including `storyboard-data-chart` 2/2.
      The 7 failures come from committed code that ST-114 does not touch:
      - `document-ingestion-job` (5 failures): the mock client has no
        `providerId`, so `resolveJobAdapter` (committed in `af971c7`) throws
        `ApprovedProviderUnavailableError`.
      - `duration-reconciliation` (2 failures): the test expects 33 s for
        33,400 ms of audio, but `reconcileSceneDurations` has rounded up
        since `41240bc` and returns 34 s.
    - Storage (MinIO, gated on `STORAGE_INTEGRATION=1`) was not run.
  - `pnpm typecheck` passed; `pnpm lint` clean except the known
    `text-overflow.test.ts:55` `_title`.
  - `graphify update .` run.
- **Code-review fixes (2026-10-15).** A `/story-code-review` pass found one
  high, two medium and six low findings. All are fixed:
  - M1, source text in job errors: `chartSceneProblem` now names the cell by
    row and column index only. Its message becomes job error metadata when
    repairs run out, so it no longer quotes a cell or column name. The
    teacher-facing message naming the cell still comes from lesson
    validation. A new Postgres case checks that the failed job's error
    details contain no table text.
  - M2, untested regeneration path: 8 new cases in
    `scene-regeneration-job.test.ts`, named after the
    `scene-regeneration-v3-chart-*` evaluation cases. They cover the chart
    check, refusal under a v2 pin, binding and citation of a chart, the
    binding dropped when a chart becomes another template, and v3 offering
    tables while v2 does not.
  - H1, AC4: amended with the product owner's decision (the original wording
    is kept in the criterion). ST-117 is filed for table-cell correction
    overlays, and the simulated test is labelled as a simulation.
  - L1, unbounded prompt: `{{tables}}` now offers only tables in the source
    package's sections, at most 8, within 24,000 characters of grid text.
  - L2, accessibility: the chart summary is now the chart binding's
    `altText`, written from the approved table by the worker and the API
    (`dataChartAltText`, at most 500 characters), so the lesson stores a text
    equivalent of the chart. Narration captions are pinned (ST-111) and
    carry speech only, so the summary is not added to them.
  - L3, v1 timing: v1 chart beats now resolve against the scene's measured
    caption cues, threaded through `SceneComponentProps.sceneCaptions`. They
    fall back to the narration estimate only when the lesson has no audio.
  - L4, editor: the editor can no longer clear the last value column, drop
    below two rows, or empty the value columns by moving the category
    column, and those controls are disabled.
  - L5, ADR: ADR-010 has an amendment allowing additive scene-type
    treatments in existing pack releases.
  - L6, MP4: a new `apps/renderer/src/data-chart-render.integration.test.ts`
    encodes a chart lesson to a real 1080p MP4 through
    `RemotionRenderEngine` and passes the ffmpeg review with no black frames.
    The same lesson with a non-numeric selection fails as a terminal
    `RENDER_FAILED` and writes no file.
  - Re-run after the fixes:
    - `pnpm typecheck` passes; lint has only the known `_title` error.
    - Unit suites: schemas 537, provider-adapters 84, worker 318, web 369,
      renderer 51, API 653 (run serially; in a parallel run 11 route tests
      failed and all pass serially, the known load flake).
    - Postgres: `storyboard-data-chart` 3/3; API `data-chart`, `storyboard`
      and `source-visuals` 17/17 together. `source-visuals` once failed
      while running alongside the Remotion suites and passes 5/5 alone.
    - Renderer chart MP4 test 2/2.
    - Scene-library full run: 385/388 pass. The 3 failures are the known
      snapshot tests (`full-lesson-render`, `scene-preview-render-smoke`,
      `summary-scene-render`). Render parity and audio parity pass.
- **Screenshots/output:** `node .claude/skills/inspect-render/shoot-scenes.mjs`
  (frames 200 and 419): bar, line and maximum 8x3 charts PASS (no box spill,
  nothing below y=876); the non-numeric fixture throws in render mode with
  `Row 1, column "Notes" contains "lightest metal", which is not a number.`
  and shows an editor-safe notice in preview. v2 `hero-chart` /
  `hero-chart-keyed` for everyday and systems, normal and maximum data: 8/8
  PASS. Images in `.runtime-logs/scene-shots*/` and
  `.runtime-logs/cinema-chart-shots/` (not committed).
- **Decisions/assumptions:**
  - The chart binds its table in a `chart-table` slot (role `diagram`,
    grounding-critical, `source_table` provenance), so preview and render
    resolve it through the existing tenant-scoped ST-093 table path. The
    server, not the client or model, writes the binding and the table
    citation (caption block, or first block of the section, plus `tableIds`).
  - Values are shown as the cell's own text (`$1,250.50`, `12%`); the parsed
    number only positions marks. The parse accepts a sign, a leading currency
    symbol, grouped `,` thousands, `.` decimals and a trailing `%`; `0,97`
    and `1e3` are refused. Charts read the same bounded 8x12 view the preview
    manifest carries.
  - Bars always include zero; lines span their data. Ticks are pure "nice
    ticks" with deterministic hand formatting (no ICU).
  - Motion: each category is an `item-N` beat; its marks complete on the beat
    frame (cubic ease-out over 18 frames ending there); the highlight starts
    at `emphasis` but never before its own category. v1 uses the authored
    beats resolved against the measured caption cues, falling back to the
    narration estimate when there is no audio.
  - Chart palettes are fixed per pack and painted on the chart's own panel so
    teacher colour edits cannot break contrast. Checked: >=4.5:1 text, >=3:1
    series/surface, adjacent series and highlight, and the series checks
    under protanopia/deuteranopia/tritanopia (Machado 2009). Series also
    differ by hatch/dot pattern and dash/marker.
  - Two v2 arrangements (product-owner decision) with per-composition
    versions so non-chart manifests stay byte-identical (AC7).
  - Prompts: storyboard v4 and scene-regeneration v3 receive `{{tables}}`
    (indexed grids with numeric flags) and list `data-chart` only when a
    numeric table exists; earlier versions are untouched and a job pinned to
    one is never offered charts. A non-numeric selection is a deterministic,
    repairable failure that names the cell.
  - Long category labels wrap at the largest size that keeps words whole,
    then shrink, then abbreviate with an ellipsis (full text in `<title>` and
    alt text). When value labels cannot all fit, the chart shows a readout of
    the narrated category instead.
- **Deviations:**
  - **AC4, amended by the product owner (decision 2026-10-14, AC text
    amended 2026-10-15):**
    - There is no table-cell correction overlay in ingestion review today.
      E5-US3 covers paragraph text only, so no PRD criterion is dropped, and
      tables are read from immutable `parsed_tables`.
    - Charts read the latest approved snapshot on every preview, and
      grounding asks for a recheck when the snapshot changes.
    - The integration test simulates a corrected cell by re-approving a
      changed table, and is labelled as a simulation.
    - Table-cell correction is ST-117, whose AC2 completes the original AC4.
  - **Prompt evaluation cases:** the evals package checks fixture lessons,
    not prompts. The named cases are therefore deterministic tests with a
    mock model:
    - `storyboard-v4-chart-*`: in `chart-tables.test.ts` and the Postgres
      storyboard integration test.
    - `scene-regeneration-v3-chart-*`: in `scene-regeneration-job.test.ts`.

    This matches how earlier prompt versions were handled. A real-model
    evaluation run (technical guide §9.2) has not been done for storyboard
    v4 or scene-regeneration v3.
  - A second composition (`hero-chart-keyed`) beyond the story's `hero-chart`,
    per the ADR-015 two-arrangement rule (product-owner decision).
- **Known risks/follow-up:**
  - ST-117 (Ready): table-cell corrections as an overlay in ingestion review.
  - A chart binding's alt text is written when the scene is generated or
    saved. After the source is re-approved with changed cells, the alt text
    keeps the old values until the scene is next saved or regenerated. The
    grounding recheck flags the scene meanwhile, and the preview's SVG
    summary is always live.
  - No real-model evaluation run yet for storyboard v4 or scene-regeneration
    v3 (see Deviations).
  - Seven worker integration tests fail before this story. They are stale
    tests, not ST-114 regressions: the ingestion mock client needs a
    `providerId`, and the reconciliation expectations need the round-up
    values. Fix them in a separate change.
  - The visual-plan prompt now sees 12 compositions; a chart preference for a
    non-chart scene is dropped by eligibility, so no prompt bump was made.
  - Chart text widths are estimated, not measured; the 1080p sweeps found no
    overflow, but a very wide-glyph pack font could need tuning.
