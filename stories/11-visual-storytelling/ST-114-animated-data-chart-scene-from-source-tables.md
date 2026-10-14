---
story_id: ST-114
title: "Add an Animated Data-Chart Scene Built from Approved Source Tables"
phase: "11 — Visual Storytelling"
status: Ready
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
- The scene cites the table block. Teacher corrections to a table cell
  (E5-US3 overlay) flow into the chart, and a stale chart is flagged by the
  existing grounding recheck (ST-053).
- The scene editor shows chart kind, columns, rows and highlight as pickers
  over the table. There is no free-text number entry.

## Scope

- [ ] Schemas: `data-chart` template and visual (`tableId`, `chartKind`,
      `categoryColumn`, `valueColumns` 1–3, `rowIndexes` 2–8,
      `highlightCategory?`, `unitLabel?`). LessonSpec goes to 1.10 and reads
      1.8 and 1.9 in place (ST-104 pattern). Add editor metadata.
- [ ] A pure resolver `resolveChartData(table, visual)` returning
      `{ categories, series, min, max, ticks }` or a typed failure, with the
      numeric parse rules above.
- [ ] Scene registry, layout validation and text-budget preflight for the new
      template, including long category labels (wrap, then abbreviate with
      the full label in captions/alt text, never clip).
- [ ] Remotion `DataChartScene` for the v1 renderer and a `hero-chart`
      composition for v2/cinema. Both are deterministic, so frame N is
      identical across renders.
- [ ] Chart palette tokens for every style pack, with a documented contrast
      check (≥ 3:1 between adjacent series and against the surface) and a
      colour-vision simulation check in tests. Series are also distinguished
      by pattern or marker, never by colour alone.
- [ ] Prompt versions: storyboard and scene-regeneration catalogues list
      `data-chart` only when the source package contains at least one table
      with a numeric column. A new prompt version is needed for each, and
      older pinned versions are untouched.
- [ ] Editor UI: table-backed pickers in the storyboard scene editor.
- [ ] Accessibility: generated alt text / transcript line summarising the
      chart ("Bar chart: sodium 0.97, potassium 0.86 …").

## Acceptance Criteria

- [ ] AC1 Given an approved table with a numeric column, a storyboard run can
      produce a `data-chart` scene that previews and renders to MP4 with
      values identical to the table cells.
- [ ] AC2 A model output containing any numeric value in the chart visual
      (not a column/row reference) fails schema validation.
- [ ] AC3 Selecting a non-numeric cell blocks the scene in validation with a
      teacher-facing reason naming the cell. The render does not start.
- [ ] AC4 Correcting a table cell in ingestion review updates the chart on
      the next preview and marks the scene's grounding stale until rechecked.
- [ ] AC5 Bars and line segments reach their final value on the anchored
      narration beat, ±1 frame.
- [ ] AC6 Every style pack passes the chart contrast and colour-vision checks.
- [ ] AC7 Stored 1.8 and 1.9 LessonSpecs read, preview and render
      byte-identically to before (render parity tests unchanged).
- [ ] AC8 A project from another tenant cannot reference a table it does not
      own (resolver rejects foreign `tableId`).

## Required Tests

- [ ] Unit: numeric parse, nice-ticks, resolver failures, schema rejection of
      inline numbers.
- [ ] Unit: layout/text-budget preflight with long labels and 8×3 data.
- [ ] Render: `DataChartScene` and `hero-chart` frames at 1080p (use the
      `inspect-render` skill), including the final-beat frame.
- [ ] Integration (Postgres): storyboard job → `data-chart` scene → preview
      manifest → render, values matching the table.
- [ ] Parity: existing full-lesson render parity tests pass unchanged.
- [ ] Prompt evaluation cases for chart selection (fit and non-fit tables).

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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
